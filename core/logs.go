package core

import (
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	logsWindowName   = "logs"
	appLogFileName   = "app.log"
	appLogMaxBytes   = 4 << 20 // 4 MiB cap before truncating on startup
	maxBufferedLogs  = 1000
	LogEntryEvent    = "app-log-entry"
	LogsClearedEvent = "app-logs-cleared"
)

// LogEntry represents a single structured diagnostic log event.
type LogEntry struct {
	ID         int64  `json:"id"`
	Timestamp  string `json:"timestamp"`
	Level      string `json:"level"`      // "info" | "warn" | "error" | "perf"
	Category   string `json:"category"`   // "core" | "perf" | "ui" | "drag" | "asset" | "menu"
	Message    string `json:"message"`
	Detail     string `json:"detail,omitempty"`
	DurationMs int64  `json:"durationMs,omitempty"`
}

var (
	logMu      sync.RWMutex
	logSeq     int64
	logEntries = make([]LogEntry, 0, 256)
	logInitDir string
	logAppRef  atomic.Pointer[application.App]
)

// SetLogApp wires the Wails application instance so new logs can be broadcast
// live to the Logs window.
func SetLogApp(app *application.App) {
	logAppRef.Store(app)
}

// AppLogFilePath returns the absolute path of the persistent app.log file.
func AppLogFilePath() string {
	return filepath.Join(UserDataDir(), appLogFileName)
}

func appLogFileLocked() string {
	return filepath.Join(UserDataDir(), appLogFileName)
}

// StartAppLogSession writes a startup delimiter to app.log and records an initial info entry.
func StartAppLogSession(context string) string {
	path := AppLogFilePath()
	writeAppLogRaw("")
	writeAppLogRaw(fmt.Sprintf("=== bowerbird log session pid=%d started=%s %s ===",
		os.Getpid(), time.Now().Format(time.RFC3339), context))
	RecordLog("info", "core", "Application session started", context, 0)
	return path
}

func writeAppLogRaw(line string) {
	logMu.Lock()
	defer logMu.Unlock()
	writeAppLogLineLocked(line)
}

func writeAppLogLineLocked(line string) {
	path := appLogFileLocked()
	dir := filepath.Dir(path)
	if logInitDir != dir {
		logInitDir = dir
		if err := os.MkdirAll(dir, 0o755); err == nil {
			if fi, err := os.Stat(path); err == nil && fi.Size() > appLogMaxBytes {
				_ = os.Truncate(path, 0)
			}
		}
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.WriteString(line + "\n")
}

// RecordLog records a structured log entry in memory, writes it to app.log,
// prints to standard logger, and emits a Wails event for live inspection.
func RecordLog(level, category, message, detail string, durationMs int64) LogEntry {
	lvl := strings.ToLower(strings.TrimSpace(level))
	if lvl == "" {
		lvl = "info"
	}
	cat := strings.ToLower(strings.TrimSpace(category))
	if cat == "" {
		cat = "core"
	}
	msg := strings.TrimSpace(message)
	det := strings.TrimSpace(detail)

	id := atomic.AddInt64(&logSeq, 1)
	ts := time.Now().Format("2006-01-02 15:04:05.000")

	entry := LogEntry{
		ID:         id,
		Timestamp:  ts,
		Level:      lvl,
		Category:   cat,
		Message:    msg,
		Detail:     det,
		DurationMs: durationMs,
	}

	var formatted string
	if durationMs > 0 && det != "" {
		formatted = fmt.Sprintf("%s [%s][%s] %s (%dms) — %s", ts, strings.ToUpper(lvl), cat, msg, durationMs, det)
	} else if durationMs > 0 {
		formatted = fmt.Sprintf("%s [%s][%s] %s (%dms)", ts, strings.ToUpper(lvl), cat, msg, durationMs)
	} else if det != "" {
		formatted = fmt.Sprintf("%s [%s][%s] %s — %s", ts, strings.ToUpper(lvl), cat, msg, det)
	} else {
		formatted = fmt.Sprintf("%s [%s][%s] %s", ts, strings.ToUpper(lvl), cat, msg)
	}

	log.Printf("[AppLog][%s][%s] %s %s", strings.ToUpper(lvl), cat, msg, det)

	logMu.Lock()
	if len(logEntries) >= maxBufferedLogs {
		// Drop oldest 20% to avoid shifting on every append
		dropCount := maxBufferedLogs / 5
		if dropCount < 1 {
			dropCount = 1
		}
		copy(logEntries, logEntries[dropCount:])
		logEntries = logEntries[:len(logEntries)-dropCount]
	}
	logEntries = append(logEntries, entry)
	writeAppLogLineLocked(formatted)
	logMu.Unlock()

	if app := logAppRef.Load(); app != nil {
		app.Event.Emit(LogEntryEvent, entry)
	}

	return entry
}

// GetLogs returns a snapshot of buffered log entries in chronological order.
func GetLogsSnapshot() []LogEntry {
	logMu.RLock()
	defer logMu.RUnlock()
	out := make([]LogEntry, len(logEntries))
	copy(out, logEntries)
	return out
}

// ClearLogsBuffer clears in-memory logs and truncates app.log on disk.
func ClearLogsBuffer() {
	logMu.Lock()
	logEntries = logEntries[:0]
	path := appLogFileLocked()
	_ = os.Truncate(path, 0)
	logMu.Unlock()

	if app := logAppRef.Load(); app != nil {
		app.Event.Emit(LogsClearedEvent, "")
	}
}

// -----------------------------------------------------------------------------
// Service RPC methods for Logs Window
// -----------------------------------------------------------------------------

// GetLogs returns all buffered diagnostic log entries.
func (s *Service) GetLogs() []LogEntry {
	return GetLogsSnapshot()
}

// ClearLogs clears both the in-memory log buffer and the on-disk log file.
func (s *Service) ClearLogs() error {
	ClearLogsBuffer()
	RecordLog("info", "core", "Logs cleared by user", "", 0)
	return nil
}

// GetLogFilePath returns the absolute path of the on-disk app.log file.
func (s *Service) GetLogFilePath() string {
	return AppLogFilePath()
}

// AppendFrontendLog records a log or performance metric emitted by the frontend UI.
func (s *Service) AppendFrontendLog(level string, category string, message string, detail string, durationMs int64) error {
	RecordLog(level, category, message, detail, durationMs)
	return nil
}

// RevealLogFile reveals the persistent app.log file in Finder / Explorer.
func (s *Service) RevealLogFile() error {
	path := AppLogFilePath()
	if _, err := os.Stat(path); err != nil {
		writeAppLogRaw(fmt.Sprintf("=== log file created %s ===", time.Now().Format(time.RFC3339)))
	}
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", "-R", path).Run()
	case "windows":
		return exec.Command("explorer.exe", "/select,", path).Run()
	default:
		return exec.Command("xdg-open", filepath.Dir(path)).Run()
	}
}

// OpenLogsWindow opens the diagnostic Logs UI in its own window. Only a single
// instance is created; later calls simply reveal and focus the existing one.
func (s *Service) OpenLogsWindow() error {
	app := s.getApp()
	if app == nil {
		return errors.New("application not initialized")
	}

	s.settingsMu.Lock()
	defer s.settingsMu.Unlock()

	if existing, ok := app.Window.GetByName(logsWindowName); ok {
		existing.Show()
		existing.Focus()
		return nil
	}

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             logsWindowName,
		Title:            "Logs",
		URL:              "/#/logs",
		Width:            920,
		Height:           640,
		MinWidth:         680,
		MinHeight:        440,
		BackgroundColour: application.NewRGB(6, 7, 15),
		Mac: application.MacWindow{
			Backdrop: application.MacBackdropTranslucent,
			TitleBar: application.MacTitleBarHiddenInset,
		},
	})
	return nil
}
