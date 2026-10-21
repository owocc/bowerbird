package nativeui

import (
	"image"
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
)

// seedImages imports n differently shaped PNGs into the active library.
func seedImages(t *testing.T, svc *core.Service, n int) []core.Item {
	t.Helper()
	dir := t.TempDir()
	var paths []string
	for i := 0; i < n; i++ {
		p := filepath.Join(dir, "img"+itoa(i)+".png")
		f, err := os.Create(p)
		if err != nil {
			t.Fatal(err)
		}
		img := image.NewRGBA(image.Rect(0, 0, 300+i*40, 200+i*20))
		for j := range img.Pix {
			img.Pix[j] = uint8((i*37 + j) % 255)
		}
		if err := png.Encode(f, img); err != nil {
			t.Fatal(err)
		}
		f.Close()
		paths = append(paths, p)
	}
	items, err := svc.ImportFiles(paths)
	if err != nil {
		t.Fatal(err)
	}
	return items
}

func headlessMode(app *App) {
	dark := false
	app.darkOverride = &dark
}

func TestViewsBuildInEveryLayout(t *testing.T) {
	app, svc, _ := newTestApp(t)
	headlessMode(app)
	root := t.TempDir()
	app.setupDir = root
	app.setupName = "Views"
	app.createLibrary()
	waitFor(t, "library", func() bool { return app.lib != nil })
	seedImages(t, svc, 4)
	app.refreshAll()
	waitFor(t, "items", func() bool { return len(app.visibleItems()) == 4 })

	for _, layout := range []string{layoutGrid, layoutList, layoutJustified, layoutWaterfall} {
		layout := layout
		t.Run(layout, func(t *testing.T) {
			app.setLayout(layout)
			tester := ui.NewTester(func(c *ui.Context) { app.viewMain(c) }, 1200, 800)
			tester.Frame()
			tester.Frame()
		})
	}

	// A selected pair shows the multi inspector with its bulk controls.
	vis := app.visibleItems()
	app.setLayout(layoutJustified)
	app.selection.Add(vis[0].ID)
	app.selection.Add(vis[1].ID)
	app.selectedIndex = 1
	app.selectedID = vis[1].ID
	app.bulkNote = "hello"
	tester := ui.NewTester(func(c *ui.Context) { app.viewMain(c) }, 1200, 800)
	tester.Frame()
	tester.Frame()

	// Preview, tag dialog and a live marquee draw their overlays.
	app.openPreview(vis[0].ID)
	app.tagDialog.open = true
	app.tagDialog.name = "test"
	app.galleryBounds = ui.Rect{X: 300, Y: 100, W: 600, H: 500}
	app.marquee = marqueeState{active: true, startX: 0, startY: 0, curX: 120, curY: 90}
	tester.Frame()
	tester.Frame()
}

func TestHistoryAndSubfolderViewsBuild(t *testing.T) {
	app, svc, _ := newTestApp(t)
	headlessMode(app)
	root := t.TempDir()
	app.setupDir = root
	app.setupName = "Collections"
	app.createLibrary()
	waitFor(t, "library", func() bool { return app.lib != nil })
	items := seedImages(t, svc, 3)
	parent, err := svc.CreateFolder("Parent", "")
	if err != nil {
		t.Fatal(err)
	}
	child, err := svc.CreateFolder("Child", parent.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.AddItemToFolder(items[0].ID, parent.ID); err != nil {
		t.Fatal(err)
	}
	if err := svc.AddItemToFolder(items[1].ID, child.ID); err != nil {
		t.Fatal(err)
	}
	app.refreshAll()
	waitFor(t, "items", func() bool { return len(app.items) == 3 })

	app.selectFolder(parent.ID)
	app.includeSubfolders = true
	app.subfolderSet = nil
	if got := len(app.visibleItems()); got != 2 {
		t.Fatalf("subfolder filter = %d items", got)
	}
	tester := ui.NewTester(func(c *ui.Context) { app.viewMain(c) }, 1200, 800)
	tester.Frame()

	app.history = []dragHistoryEntry{{ItemID: items[2].ID}, {ItemID: items[0].ID}}
	app.historyLibrary = app.lib.Path
	app.setView(viewHistory)
	app.refreshItems()
	waitFor(t, "history", func() bool { return len(app.visibleItems()) == 2 })
	tester.Frame()
	tester.Frame()
}

func TestChineseCatalogRenders(t *testing.T) {
	app, svc, _ := newTestApp(t)
	headlessMode(app)
	root := t.TempDir()
	app.setupDir = root
	app.setupName = "中文"
	app.createLibrary()
	waitFor(t, "library", func() bool { return app.lib != nil })
	seedImages(t, svc, 2)
	app.refreshAll()
	waitFor(t, "items", func() bool { return len(app.items) == 2 })
	app.language = "zh"
	tester := ui.NewTester(func(c *ui.Context) { app.viewMain(c) }, 1200, 800)
	tester.Frame()
	for _, want := range []string{"全部素材", "废纸篓", "历史"} {
		if !tester.HasText(want) {
			t.Errorf("Chinese UI missing %q; texts=%v", want, tester.Texts())
		}
	}
}
