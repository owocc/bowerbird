package nativeui

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"bowerbird/core"
)

// recordingHost is a core.Host that records window requests instead of
// making native windows, so app-level flows can run headless.
type recordingHost struct {
	windows []string
}

func (h *recordingHost) Emit(string, any) {}
func (h *recordingHost) OpenWindow(s core.WindowSpec) error {
	h.windows = append(h.windows, s.Name)
	return nil
}
func (h *recordingHost) FocusWindow(string) bool              { return false }
func (h *recordingHost) CloseWindow(string)                   {}
func (h *recordingHost) FocusMainWindow()                     {}
func (h *recordingHost) OpenDirectory(string) (string, error) { return "", nil }
func (h *recordingHost) ShowAbout()                           {}
func (h *recordingHost) Quit()                                {}
func (h *recordingHost) RunOnMain(fn func())                  { fn() }
func (h *recordingHost) NativeWindowHandle() uintptr          { return 0 }
func (h *recordingHost) WriteFilesToClipboard([]string) error { return nil }
func (h *recordingHost) WriteTextToClipboard(string) error    { return nil }

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func newTestApp(t *testing.T) (*App, *core.Service, *recordingHost) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("BOWERBIRD_USER_DATA_DIR", dir)
	mgr := core.NewLibraryManager()
	svc := core.NewService(mgr)
	app := NewApp(svc)
	host := NewHost(app)
	app.SetHost(host)
	rec := &recordingHost{}
	mgr.SetHost(rec)
	core.AttachHost(svc, rec)
	core.AttachManager(svc, mgr)
	app.SetManager(mgr)
	app.trashPath = func(path string) error {
		// Tests must not move anything into the real Trash.
		return os.RemoveAll(path)
	}
	return app, svc, rec
}

// TestLibraryCreateSwitchCloseDelete exercises the setup flow end to end at
// the app level: create two libraries, switch between them, close, and move
// one to the (simulated) Trash.
func TestLibraryCreateSwitchCloseDelete(t *testing.T) {
	app, svc, rec := newTestApp(t)
	root := t.TempDir()

	app.setupDir = filepath.Join(root, "first")
	app.setupName = "First"
	if err := os.MkdirAll(app.setupDir, 0o755); err != nil {
		t.Fatal(err)
	}
	firstPath := filepath.Join(app.setupDir, "First.library")
	app.createLibrary()
	waitFor(t, "first library", func() bool { return app.lib != nil && app.lib.Name == "First" })
	if got, _ := svc.GetActiveLibrary(); got == nil || got.Path != firstPath {
		t.Fatalf("active library = %+v, want %s", got, firstPath)
	}
	if _, err := os.Stat(firstPath); err != nil {
		t.Fatalf("library folder: %v", err)
	}

	app.setupDir = filepath.Join(root, "second")
	app.setupName = "Second"
	if err := os.MkdirAll(app.setupDir, 0o755); err != nil {
		t.Fatal(err)
	}
	secondPath := filepath.Join(app.setupDir, "Second.library")
	app.createLibrary()
	waitFor(t, "second library", func() bool { return app.lib != nil && app.lib.Name == "Second" })

	// Switch back to the first, as the recent list does.
	app.openLibraryPath(firstPath)
	waitFor(t, "switch back", func() bool { return app.lib != nil && app.lib.Path == firstPath })

	// Close it: the setup window comes back and the model is empty.
	app.closeLibrary()
	waitFor(t, "close", func() bool { return app.lib == nil && len(app.items) == 0 })
	foundSetup := false
	for _, name := range rec.windows {
		if name == "setup" {
			foundSetup = true
		}
	}
	if !foundSetup {
		t.Errorf("setup window not requested after close: %v", rec.windows)
	}

	// Delete the inactive second library: the folder goes and the recent
	// list forgets it.
	app.deleteLibrary(secondPath)
	waitFor(t, "delete second", func() bool {
		_, err := os.Stat(secondPath)
		return os.IsNotExist(err)
	})
	for _, p := range svc.GetRecentLibraries() {
		if p == secondPath {
			t.Fatalf("deleted library still recent: %v", svc.GetRecentLibraries())
		}
	}

	// Delete the active first library through the confirm path.
	app.openLibraryPath(firstPath)
	waitFor(t, "reopen first", func() bool { return app.lib != nil && app.lib.Path == firstPath })
	app.requestDeleteLibrary(firstPath)
	if !app.confirm.open || app.confirm.action != "delete-library" {
		t.Fatalf("confirm not armed: %+v", app.confirm)
	}
	app.runConfirm("delete-library")
	waitFor(t, "delete active", func() bool {
		_, err := os.Stat(firstPath)
		return os.IsNotExist(err) && app.lib == nil
	})
	if recents := svc.GetRecentLibraries(); len(recents) != 0 {
		t.Fatalf("recents not cleared: %v", recents)
	}
}

// TestTagCreateDeleteOnApp creates and deletes a tag through the app actions.
func TestTagCreateDeleteOnApp(t *testing.T) {
	app, svc, _ := newTestApp(t)
	root := t.TempDir()
	app.setupDir = root
	app.setupName = "Tags"
	app.createLibrary()
	waitFor(t, "library", func() bool { return app.lib != nil })

	app.openNewTag()
	app.tagDialog.name = "  landscape  "
	app.submitTagDialog()
	waitFor(t, "tag created", func() bool {
		tags, _ := svc.GetTags()
		for _, tag := range tags {
			if tag.Name == "landscape" {
				return true
			}
		}
		return false
	})
	app.requestDeleteTag("landscape")
	if app.confirm.action != "delete-tag" {
		t.Fatalf("delete-tag not armed: %+v", app.confirm)
	}
	app.runConfirm("delete-tag")
	waitFor(t, "tag deleted", func() bool {
		tags, _ := svc.GetTags()
		for _, tag := range tags {
			if tag.Name == "landscape" {
				return false
			}
		}
		return true
	})
}
