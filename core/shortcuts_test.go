package core

import (
	"strings"
	"testing"
	"time"
)

func TestNormalizeAccelerator(t *testing.T) {
	if got := NormalizeAccelerator("option+a"); got != "Alt+A" {
		t.Fatalf("got %q", got)
	}
	if got := NormalizeAccelerator("Cmd+Shift+r"); got != "CmdOrCtrl+Shift+R" {
		t.Fatalf("got %q", got)
	}
}

func TestShortcutConflict(t *testing.T) {
	s := DefaultShortcutSettings()
	s.Bindings[ShortcutCaptureArea] = "Alt+S"
	if err := ValidateShortcutSettings(s); err == nil {
		t.Fatal("expected conflict")
	}
}

func TestShortcutUnset(t *testing.T) {
	s := DefaultShortcutSettings()
	s.Bindings[ShortcutCaptureArea] = ""
	norm := NormalizeShortcutSettings(s)
	if got := norm.Bindings[ShortcutCaptureArea]; got != "" {
		t.Fatalf("expected empty binding, got %q", got)
	}
	if got := norm.Accelerator(ShortcutCaptureArea); got != "" {
		t.Fatalf("expected empty accelerator, got %q", got)
	}
	if err := ValidateShortcutSettings(s); err != nil {
		t.Fatalf("unset should not conflict: %v", err)
	}
	if got := norm.Bindings[ShortcutCaptureFullscreen]; got != "Alt+S" {
		t.Fatalf("other bindings should stay default, got %q", got)
	}
}

func TestScreenshotDisplayName(t *testing.T) {
	now := time.Date(2026, 4, 8, 12, 0, 0, 0, time.UTC)
	settings := DefaultScreenshotSettings()
	name := screenshotDisplayName(settings, ScreenshotArea, now, "en")
	if !strings.HasSuffix(name, ".png") || !strings.Contains(name, "2026") {
		t.Fatalf("unexpected name %q", name)
	}
	settings.Format = ScreenshotFormatJPEG
	settings.IncludeApp = true
	name = screenshotDisplayName(settings, ScreenshotArea, now, "zh")
	if !strings.HasSuffix(name, ".jpg") || !strings.Contains(name, "截图") {
		t.Fatalf("unexpected name %q", name)
	}
}

func TestScreenshotSettingsRoundTrip(t *testing.T) {
	t.Setenv("BOWERBIRD_USER_DATA_DIR", t.TempDir())
	store, err := NewUserDataStore()
	if err != nil {
		t.Fatal(err)
	}
	in := ScreenshotSettings{
		Format:      ScreenshotFormatJPEG,
		Quality:     70,
		Naming:      ScreenshotNameDateApp,
		IncludeDate: true,
		IncludeApp:  true,
		AutoTag:     false,
		FolderID:    "folder_1",
	}
	if err := store.SetScreenshotSettings(in); err != nil {
		t.Fatal(err)
	}
	got := store.GetScreenshotSettings()
	if got.Format != ScreenshotFormatJPEG || got.Quality != 70 || got.AutoTag || got.FolderID != "folder_1" {
		t.Fatalf("got %+v", got)
	}
}

func TestCaptureHonorsScreenshotSettings(t *testing.T) {
	t.Setenv("BOWERBIRD_USER_DATA_DIR", t.TempDir())
	tempDir := t.TempDir()
	mgr := NewLibraryManager()
	if _, err := mgr.CreateLibrary(tempDir, "CaptureLib"); err != nil {
		t.Fatal(err)
	}
	folder, err := mgr.CreateFolder("Shots", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := mgr.SetScreenshotSettings(ScreenshotSettings{
		Format:      ScreenshotFormatJPEG,
		Quality:     80,
		Naming:      ScreenshotNameDate,
		IncludeDate: true,
		AutoTag:     false,
		FolderID:    folder.ID,
	}); err != nil {
		t.Fatal(err)
	}
	svc := NewService(mgr)
	old := captureExecutor
	defer func() { captureExecutor = old }()
	captureExecutor = func(mode ScreenshotMode, targetPath string) error {
		createTestPNG(t, targetPath)
		return nil
	}
	item, err := svc.CaptureArea()
	if err != nil {
		t.Fatal(err)
	}
	if item == nil {
		t.Fatal("nil item")
	}
	if item.Extension != "jpg" && !strings.HasSuffix(strings.ToLower(item.Filename), ".jpg") {
		t.Fatalf("expected jpeg file, got name=%s ext=%s filename=%s", item.Name, item.Extension, item.Filename)
	}
	if len(item.Tags) != 0 {
		t.Fatalf("expected no auto tags, got %v", item.Tags)
	}
	found := false
	for _, f := range item.Folders {
		if f == folder.ID {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected folder %s, got %v", folder.ID, item.Folders)
	}
}
