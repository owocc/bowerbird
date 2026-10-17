package core

import (
	"errors"
	"image"
	"image/color"
	"image/png"
	"os"
	"testing"
)

func createTestPNG(t *testing.T, targetPath string) {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	for x := range 100 {
		for y := range 100 {
			img.Set(x, y, color.RGBA{R: 255, G: 0, B: 0, A: 255})
		}
	}
	f, err := os.Create(targetPath)
	if err != nil {
		t.Fatalf("failed to create test png: %v", err)
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		t.Fatalf("failed to encode test png: %v", err)
	}
}

func TestCaptureScreenNoActiveLibrary(t *testing.T) {
	mgr := NewLibraryManager()
	svc := NewService(mgr)

	item, err := svc.CaptureScreen("area")
	if !errors.Is(err, ErrNoActiveLibrary) {
		t.Fatalf("expected ErrNoActiveLibrary, got %v", err)
	}
	if item != nil {
		t.Fatalf("expected nil item, got %+v", item)
	}
}

func TestCaptureScreenCancelled(t *testing.T) {
	tempDir := t.TempDir()
	mgr := NewLibraryManager()
	_, err := mgr.CreateLibrary(tempDir, "TestLib")
	if err != nil {
		t.Fatalf("CreateLibrary failed: %v", err)
	}
	svc := NewService(mgr)

	oldExecutor := captureExecutor
	defer func() { captureExecutor = oldExecutor }()

	captureExecutor = func(mode ScreenshotMode, targetPath string) error {
		return ErrScreenshotCancelled
	}

	item, err := svc.CaptureScreen("area")
	if err != nil {
		t.Fatalf("expected nil error on cancellation, got %v", err)
	}
	if item != nil {
		t.Fatalf("expected nil item on cancellation, got %+v", item)
	}
}

func TestCaptureScreenSuccess(t *testing.T) {
	tempDir := t.TempDir()
	mgr := NewLibraryManager()
	_, err := mgr.CreateLibrary(tempDir, "CaptureLib")
	if err != nil {
		t.Fatalf("CreateLibrary failed: %v", err)
	}
	svc := NewService(mgr)

	oldExecutor := captureExecutor
	defer func() { captureExecutor = oldExecutor }()

	var capturedMode ScreenshotMode
	captureExecutor = func(mode ScreenshotMode, targetPath string) error {
		capturedMode = mode
		createTestPNG(t, targetPath)
		return nil
	}

	// 1. Area Capture
	itemArea, err := svc.CaptureArea()
	if err != nil {
		t.Fatalf("CaptureArea failed: %v", err)
	}
	if itemArea == nil {
		t.Fatal("expected non-nil item")
	}
	if capturedMode != ScreenshotArea {
		t.Errorf("expected ScreenshotArea, got %s", capturedMode)
	}
	if len(itemArea.Tags) == 0 {
		t.Error("expected tags on captured item")
	}
	hasTag := false
	for _, tag := range itemArea.Tags {
		if tag == "screenshot" {
			hasTag = true
			break
		}
	}
	if !hasTag {
		t.Errorf("expected 'screenshot' tag, got tags %v", itemArea.Tags)
	}

	// 2. Fullscreen Capture
	itemFull, err := svc.CaptureFullscreen()
	if err != nil {
		t.Fatalf("CaptureFullscreen failed: %v", err)
	}
	if itemFull == nil || capturedMode != ScreenshotFullscreen {
		t.Fatalf("CaptureFullscreen failed or incorrect mode: %v", capturedMode)
	}

	// 3. Window Capture
	itemWin, err := svc.CaptureWindow()
	if err != nil {
		t.Fatalf("CaptureWindow failed: %v", err)
	}
	if itemWin == nil || capturedMode != ScreenshotWindow {
		t.Fatalf("CaptureWindow failed or incorrect mode: %v", capturedMode)
	}
}
