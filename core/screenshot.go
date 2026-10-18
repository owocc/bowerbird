package core

import (
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

// ScreenshotMode denotes the capture style.
type ScreenshotMode string

const (
	ScreenshotArea       ScreenshotMode = "area"
	ScreenshotFullscreen ScreenshotMode = "fullscreen"
	ScreenshotWindow     ScreenshotMode = "window"
)

// ErrScreenshotCancelled is returned when the user cancels an interactive capture (e.g. presses Esc).
var ErrScreenshotCancelled = errors.New("screenshot cancelled")

// captureExecutor is swappable for unit tests.
var captureExecutor = defaultCaptureExecutor

func defaultCaptureExecutor(mode ScreenshotMode, targetPath string) error {
	switch runtime.GOOS {
	case "darwin":
		return captureDarwin(mode, targetPath)
	case "windows":
		return captureWindows(mode, targetPath)
	case "linux":
		return captureLinux(mode, targetPath)
	default:
		return fmt.Errorf("unsupported platform for screenshots: %s", runtime.GOOS)
	}
}

func captureDarwin(mode ScreenshotMode, targetPath string) error {
	var args []string
	switch mode {
	case ScreenshotArea:
		// -i: interactive, -s: selection only (mouse drag)
		args = []string{"-i", "-s", targetPath}
	case ScreenshotWindow:
		// -i: interactive, -w: window selection mode
		args = []string{"-i", "-w", targetPath}
	case ScreenshotFullscreen:
		// -x: muted sound, -m: main screen
		args = []string{"-x", "-m", targetPath}
	default:
		return fmt.Errorf("unsupported screenshot mode: %s", mode)
	}

	cmd := exec.Command("/usr/sbin/screencapture", args...)
	err := cmd.Run()
	if err != nil {
		if _, statErr := os.Stat(targetPath); os.IsNotExist(statErr) {
			return ErrScreenshotCancelled
		}
		return fmt.Errorf("screencapture failed: %w", err)
	}

	fi, statErr := os.Stat(targetPath)
	if statErr != nil || fi.Size() == 0 {
		return ErrScreenshotCancelled
	}
	return nil
}

func captureWindows(mode ScreenshotMode, targetPath string) error {
	switch mode {
	case ScreenshotFullscreen:
		script := fmt.Sprintf(`
Add-Type -AssemblyName System.Windows.Forms,System.Drawing;
$s = [System.Windows.Forms.Screen]::PrimaryScreen;
$b = New-Object System.Drawing.Bitmap($s.Bounds.Width, $s.Bounds.Height);
$g = [System.Drawing.Graphics]::FromImage($b);
$g.CopyFromScreen($s.Bounds.Location, [System.Drawing.Point]::Empty, $s.Bounds.Size);
$b.Save('%s', [System.Drawing.Imaging.ImageFormat]::Png);
$g.Dispose();
$b.Dispose();
`, targetPath)
		cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script)
		return cmd.Run()
	case ScreenshotArea, ScreenshotWindow:
		script := fmt.Sprintf(`
Start-Process ms-screenclip:
Start-Sleep -Seconds 3
Add-Type -AssemblyName System.Windows.Forms;
$img = [System.Windows.Forms.Clipboard]::GetImage();
if ($img -ne $null) {
    $img.Save('%s', [System.Drawing.Imaging.ImageFormat]::Png);
}
`, targetPath)
		cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script)
		_ = cmd.Run()
		if fi, err := os.Stat(targetPath); err == nil && fi.Size() > 0 {
			return nil
		}
		return ErrScreenshotCancelled
	default:
		return fmt.Errorf("unsupported screenshot mode: %s", mode)
	}
}

func captureLinux(mode ScreenshotMode, targetPath string) error {
	if _, err := exec.LookPath("maim"); err == nil {
		var args []string
		switch mode {
		case ScreenshotArea:
			args = []string{"-s", targetPath}
		case ScreenshotWindow:
			args = []string{"-i", targetPath}
		default:
			args = []string{targetPath}
		}
		return exec.Command("maim", args...).Run()
	}
	if _, err := exec.LookPath("scrot"); err == nil {
		var args []string
		switch mode {
		case ScreenshotArea:
			args = []string{"-s", targetPath}
		case ScreenshotWindow:
			args = []string{"-u", targetPath}
		default:
			args = []string{targetPath}
		}
		return exec.Command("scrot", args...).Run()
	}
	if _, err := exec.LookPath("gnome-screenshot"); err == nil {
		var args []string
		switch mode {
		case ScreenshotArea:
			args = []string{"-a", "-f", targetPath}
		case ScreenshotWindow:
			args = []string{"-w", "-f", targetPath}
		default:
			args = []string{"-f", targetPath}
		}
		return exec.Command("gnome-screenshot", args...).Run()
	}
	return errors.New("no supported screenshot utility found (install maim, scrot, or gnome-screenshot)")
}

func copyScreenshotFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

// CaptureScreen performs a screenshot of the specified mode ("area", "fullscreen", "window")
// and directly imports the captured image into the active library.
func (s *Service) CaptureScreen(mode string) (*Item, error) {
	if s.mgr == nil {
		return nil, ErrCoreNotInitialized
	}
	active := s.mgr.GetActiveLibrary()
	if active == nil {
		if app := s.getApp(); app != nil {
			app.Event.Emit("capture-error", "未打开任何资源库，请先打开或创建资源库")
		}
		return nil, ErrNoActiveLibrary
	}

	m := ScreenshotMode(mode)
	if m != ScreenshotArea && m != ScreenshotFullscreen && m != ScreenshotWindow {
		m = ScreenshotArea
	}

	timestamp := time.Now().Format("2006-01-02 15.04.05")
	prefix := "Screenshot"
	if s.GetLanguage() == "zh" {
		prefix = "截图"
	}
	displayName := fmt.Sprintf("%s %s.png", prefix, timestamp)

	tmpDir := os.TempDir()
	rawTmpPath := filepath.Join(tmpDir, fmt.Sprintf("bb_raw_%d_%s", time.Now().UnixNano(), displayName))
	defer func() {
		_ = os.Remove(rawTmpPath)
		if s.mgr != nil {
			if w := s.mgr.getWindow(); w != nil {
				w.Focus()
			}
		}
	}()
	tStart := time.Now()
	RecordLog("info", "core", "[Pipeline 1/6] Screenshot capture started", fmt.Sprintf("mode=%s target=%s", m, displayName), 0)

	tExecStart := time.Now()
	if err := captureExecutor(m, rawTmpPath); err != nil {
		if errors.Is(err, ErrScreenshotCancelled) {
			log.Printf("[Capture] %s screenshot cancelled by user", m)
			RecordLog("info", "core", "[Pipeline] Screenshot cancelled by user", fmt.Sprintf("mode=%s", m), time.Since(tExecStart).Milliseconds())
			return nil, nil
		}
		log.Printf("[Capture] %s screenshot failed: %v", m, err)
		RecordLog("error", "core", "[Pipeline] Screenshot OS command failed", fmt.Sprintf("mode=%s err=%v", m, err), time.Since(tExecStart).Milliseconds())
		if app := s.getApp(); app != nil {
			app.Event.Emit("capture-error", fmt.Sprintf("截图失败: %v", err))
		}
		return nil, err
	}
	osCaptureMs := time.Since(tExecStart).Milliseconds()

	fi, err := os.Stat(rawTmpPath)
	if err != nil || fi.Size() == 0 {
		log.Printf("[Capture] screenshot was cancelled or file is empty")
		return nil, nil
	}
	if s.mgr != nil {
		if w := s.mgr.getWindow(); w != nil {
			w.Focus()
		}
	}
	RecordLog("perf", "core", "[Pipeline 2/6] Screenshot saved to temp disk by OS", fmt.Sprintf("mode=%s size=%dB path=%s", m, fi.Size(), rawTmpPath), osCaptureMs)

	// Create an isolated staging folder for the display filename so ImportFiles assigns the nice name
	tStageStart := time.Now()
	importDir, err := os.MkdirTemp("", "bb_import_*")
	if err != nil {
		importDir = tmpDir
	} else {
		defer os.RemoveAll(importDir)
	}

	namedPath := filepath.Join(importDir, displayName)
	if copyErr := copyScreenshotFile(rawTmpPath, namedPath); copyErr != nil {
		namedPath = rawTmpPath
	}
	stageMs := time.Since(tStageStart).Milliseconds()
	modeTag := "area-screenshot"
	if m == ScreenshotWindow {
		modeTag = "window-screenshot"
	} else if m == ScreenshotFullscreen {
		modeTag = "fullscreen-screenshot"
	}
	tags := []string{"screenshot", modeTag}

	tImportStart := time.Now()
	item, err := s.mgr.ImportSingleFileWithTags(namedPath, tags)
	importMs := time.Since(tImportStart).Milliseconds()
	if err != nil {
		log.Printf("[Capture] import screenshot failed: %v", err)
		RecordLog("error", "core", "[Pipeline] Screenshot library import failed", fmt.Sprintf("err=%v", err), importMs)
		if app := s.getApp(); app != nil {
			app.Event.Emit("capture-error", fmt.Sprintf("导入截图失败: %v", err))
		}
		return nil, err
	}

	if item == nil {
		return nil, fmt.Errorf("no item was imported")
	}

	tEmitStart := time.Now()
	if app := s.getApp(); app != nil {
		app.Event.Emit("import-completed", map[string]any{
			"count":    1,
			"ids":      []string{item.ID},
			"items":    []Item{*item},
			"emitTsMs": time.Now().UnixMilli(),
		})
		app.Event.Emit("capture-completed", item)
	}
	emitMs := time.Since(tEmitStart).Milliseconds()
	tagMs := int64(0)

	RecordLog(
		"perf",
		"core",
		"[Pipeline 5/6] Screenshot imported & emitted to frontend",
		fmt.Sprintf("id=%s name=%q size=%dB stageMs=%d importMs=%d tagMs=%d emitMs=%d totalPostCaptureMs=%d",
			item.ID[:12], item.Name, item.Size, stageMs, importMs, tagMs, emitMs, time.Since(tStageStart).Milliseconds()),
		time.Since(tStart).Milliseconds(),
	)
	log.Printf("[Capture] successfully captured and imported %s screenshot: %s (%s)", m, item.Name, item.ID)
	return item, nil
}

// CaptureArea triggers area/selection screenshot and imports it to active library.
func (s *Service) CaptureArea() (*Item, error) {
	return s.CaptureScreen(string(ScreenshotArea))
}

// CaptureFullscreen triggers full-screen screenshot and imports it to active library.
func (s *Service) CaptureFullscreen() (*Item, error) {
	return s.CaptureScreen(string(ScreenshotFullscreen))
}

// CaptureWindow triggers window screenshot and imports it to active library.
func (s *Service) CaptureWindow() (*Item, error) {
	return s.CaptureScreen(string(ScreenshotWindow))
}
