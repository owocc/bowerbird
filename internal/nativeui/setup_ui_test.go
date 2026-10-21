package nativeui

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/egoist/mygo/ui"
)

// TestSetupWindowClicks drives the setup window by its buttons: create a
// library from the form, then delete it from the recent list through the
// confirmation this window now draws.
func TestSetupWindowClicks(t *testing.T) {
	app, svc, _ := newTestApp(t)
	headlessMode(app)
	root := t.TempDir()
	app.setupDir = root
	app.setupName = "Clicked"
	tester := ui.NewTester(func(c *ui.Context) { app.viewSetup(c) }, 720, 760)
	tester.Frame()
	if err := tester.Click("Create Library"); err != nil {
		t.Fatalf("create button: %v (texts=%v)", err, tester.Texts())
	}
	waitFor(t, "library", func() bool { return app.lib != nil && app.lib.Name == "Clicked" })
	libPath := filepath.Join(root, "Clicked.library")

	app.closeLibrary()
	waitFor(t, "close", func() bool { return app.lib == nil })
	tester.Frame()
	if !tester.HasText("Clicked") {
		t.Fatalf("recent library not shown: %v", tester.Texts())
	}
	if err := tester.Click("Delete Library…"); err != nil {
		t.Fatalf("delete button: %v", err)
	}
	tester.Frame()
	if !app.confirm.open {
		t.Fatal("confirmation did not open in the setup window")
	}
	if err := tester.Click("Delete"); err != nil {
		t.Fatalf("confirm delete: %v (texts=%v)", err, tester.Texts())
	}
	waitFor(t, "library deleted", func() bool {
		_, err := os.Stat(libPath)
		return os.IsNotExist(err)
	})
	for _, p := range svc.GetRecentLibraries() {
		if p == libPath {
			t.Fatal("deleted library still recent")
		}
	}
}
