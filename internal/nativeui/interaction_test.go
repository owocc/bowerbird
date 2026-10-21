package nativeui

import (
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestJustifiedClickAndMarquee(t *testing.T) {
	app, svc, _ := newTestApp(t)
	headlessMode(app)
	root := t.TempDir()
	app.setupDir = root
	app.setupName = "Interact"
	app.createLibrary()
	waitFor(t, "library", func() bool { return app.lib != nil })
	seedImages(t, svc, 3)
	app.refreshAll()
	waitFor(t, "items", func() bool { return len(app.items) == 3 })
	vis := app.visibleItems()
	for i := range vis {
		if img, err := loadThumbImage(&vis[i], 256); err == nil {
			app.thumbs.put(thumbKey(&vis[i], app.rowHeight), img)
		}
	}
	app.setLayout(layoutJustified)
	tester := ui.NewTester(func(c *ui.Context) { app.viewMain(c) }, 1200, 800)
	tester.Frame()
	tester.Frame()
	if len(app.cellRects) == 0 {
		t.Fatal("no cell rects after a justified frame")
	}
	first := vis[0].ID
	r := app.cellRects[first]
	tester.ClickAt(r.X+r.W/2, r.Y+r.H/2)
	tester.Frame()
	if !app.selection.Has(first) || app.selectedID != first {
		t.Fatalf("click did not select %s (selection=%d id=%q)", first, app.selection.Len(), app.selectedID)
	}

	// Drag a marquee from empty space below the cards over the first row.
	app.selection.Clear()
	app.selectedID = ""
	app.selectedIndex = -1
	gb := app.galleryBounds
	startX, startY := gb.X+gb.W-30, gb.Y+gb.H-40
	target := app.cellRects[first]
	tester.Press(startX, startY)
	tester.Move((startX+target.X)/2, (startY+target.Y+target.H)/2)
	tester.Move(target.X+4, target.Y+4)
	tester.Release(target.X+4, target.Y+4)
	tester.Frame()
	if app.selection.Len() == 0 {
		t.Fatalf("marquee selected nothing; rects=%v start=%v,%v", app.cellRects, startX, startY)
	}
}

func TestCmdWheelChangesRowHeight(t *testing.T) {
	app, svc, _ := newTestApp(t)
	headlessMode(app)
	root := t.TempDir()
	app.setupDir = root
	app.setupName = "Wheel"
	app.createLibrary()
	waitFor(t, "library", func() bool { return app.lib != nil })
	seedImages(t, svc, 3)
	app.refreshAll()
	waitFor(t, "items", func() bool { return len(app.items) == 3 })
	tester := ui.NewTester(func(c *ui.Context) { app.viewMain(c) }, 1200, 800)
	tester.Frame()
	before := app.rowHeight
	// Tester.Scroll carries no modifiers (the platform's wheel event does),
	// so drive the handler with the Cmd the trackpad would hold.
	if !app.handleGalleryInput(ui.InputEvent{Kind: ui.InputScroll, DY: -20, Mods: ui.Cmd}) {
		t.Fatal("Cmd+wheel not taken")
	}
	if app.rowHeight <= before {
		t.Fatalf("Cmd+wheel did not enlarge rows: %v -> %v", before, app.rowHeight)
	}
	// A plain wheel passes through to the scroll container.
	if app.handleGalleryInput(ui.InputEvent{Kind: ui.InputScroll, DY: -20}) {
		t.Fatal("plain wheel was consumed")
	}
}
