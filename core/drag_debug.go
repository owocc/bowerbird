package core

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Native drag-out / drop tracing.
//
// Production Windows builds are linked with `-H windowsgui` (see
// build/windows/Taskfile.yml), so stdout and `log.Printf` output are invisible
// there. Every trace line is therefore appended to drag-debug.log in the app
// data directory, which is the only sink that survives all platforms and build
// modes. LogDragTrace also mirrors to the logger so `wails3 dev` shows it live.
//
// What is traceable and what is not:
//   - WebView side: the exact payload the page hands to the OS when a drag
//     leaves the window, plus dropEffect on dragend (frontend, drag-trace.ts).
//   - App side: native drops delivered by Wails (WindowFilesDropped) and the
//     import/move branches they trigger (main.go).
//   - NOT traceable: what the *target* application does with the payload. The
//     OS delivers the drop outside our process, so a target that shows
//     "about:blank#blocked" can only be diagnosed from the offered formats
//     plus the reported dropEffect.
const (
	dragTraceFileName = "drag-debug.log"
	// dragTraceMaxBytes caps the file; it is truncated once per process start
	// when it is already larger, so a long debug session cannot grow unbounded.
	dragTraceMaxBytes = 2 << 20
)

var (
	dragTraceMu     sync.Mutex
	dragTracePath   string
	dragTraceInited bool
)

// DragTraceLogPath returns the absolute path of the drag trace file.
func DragTraceLogPath() string {
	dragTraceMu.Lock()
	defer dragTraceMu.Unlock()
	return dragTraceFileLocked()
}

func dragTraceFileLocked() string {
	if dragTracePath != "" {
		return dragTracePath
	}
	dragTracePath = filepath.Join(UserDataDir(), dragTraceFileName)
	return dragTracePath
}

// StartDragTraceSession writes a session header and returns the trace file path.
// Called once from main so every run is delimited inside the shared log file.
func StartDragTraceSession(context string) string {
	path := DragTraceLogPath()
	writeDragTraceLine("")
	writeDragTraceLine(fmt.Sprintf("=== drag trace session pid=%d started=%s %s",
		os.Getpid(), time.Now().Format(time.RFC3339), context))
	return path
}

// LogDragTrace records one drag/drop pipeline event. phase is a short tag
// (dragstart, dragend, drop, native-drop, ...), detail is free-form.
func LogDragTrace(phase, detail string) {
	log.Printf("[DragTrace][%s] %s", phase, detail)
	writeDragTraceLine(fmt.Sprintf("%s [%s] %s", time.Now().Format("2006-01-02T15:04:05.000"), phase, detail))
	RecordLog("info", "drag", fmt.Sprintf("[%s] %s", phase, detail), "", 0)
}

func writeDragTraceLine(line string) {
	dragTraceMu.Lock()
	defer dragTraceMu.Unlock()

	path := dragTraceFileLocked()
	if !dragTraceInited {
		dragTraceInited = true
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err == nil {
			if fi, err := os.Stat(path); err == nil && fi.Size() > dragTraceMaxBytes {
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
