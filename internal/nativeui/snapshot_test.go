package nativeui

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"image"
	"image/color"
	"image/gif"

	"github.com/egoist/mygo/ui"
)

// TestRenderSnapshots writes headless renders to $BOWERBIRD_SNAPSHOTS (or
// skips) so the layouts can be inspected without a display.
func TestRenderSnapshots(t *testing.T) {
	dir := os.Getenv("BOWERBIRD_SNAPSHOTS")
	if dir == "" {
		t.Skip("set BOWERBIRD_SNAPSHOTS to write renders")
	}
	app, svc, _ := newTestApp(t)
	headlessMode(app)
	root := t.TempDir()
	app.setupDir = root
	app.setupName = "Snaps"
	app.createLibrary()
	waitFor(t, "library", func() bool { return app.lib != nil })
	seedImages(t, svc, 7)
	// An animated GIF as well.
	gifPath := filepath.Join(root, "anim.gif")
	writeTestGIF(t, gifPath)
	if _, err := svc.ImportFiles([]string{gifPath}); err != nil {
		t.Fatal(err)
	}
	app.refreshAll()
	waitFor(t, "items", func() bool { return len(app.items) == 8 })
	vis := app.visibleItems()
	for i := range vis {
		img, err := loadThumbImage(&vis[i], 256)
		if err == nil {
			app.thumbs.put(thumbKey(&vis[i], app.rowHeight), img)
		}
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	save := func(name string, tester *ui.Tester) {
		tester.Frame()
		tester.Frame()
		img := tester.Image()
		if img == nil {
			t.Fatalf("%s: no image", name)
		}
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, img); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
	for _, layout := range []string{layoutJustified, layoutWaterfall, layoutGrid, layoutList} {
		app.setLayout(layout)
		tester := ui.NewTester(func(c *ui.Context) { app.viewMain(c) }, 1200, 800)
		save(layout, tester)
	}
	app.setLayout(layoutJustified)
	tester := ui.NewTester(func(c *ui.Context) { app.viewMain(c) }, 1200, 800)
	tester.Frame()
	app.openPreview(vis[0].ID)
	app.preview.zoom = 1
	save("preview", tester)
	app.preview.open = false

	app.selection.Add(vis[0].ID)
	app.selection.Add(vis[1].ID)
	app.selectedIndex = 1
	app.selectedID = vis[1].ID
	tester2 := ui.NewTester(func(c *ui.Context) { app.viewMain(c) }, 1200, 800)
	tester2.Frame()
	t.Logf("gallery bounds after frame: %+v", app.galleryBounds)
	app.cellRects = map[string]ui.Rect{
		vis[0].ID: {X: 330, Y: 100, W: 180, H: 120},
		vis[1].ID: {X: 520, Y: 100, W: 180, H: 120},
	}
	app.marquee = marqueeState{active: true, startX: 10, startY: 10, curX: 260, curY: 180}
	save("selection", tester2)
}

func writeTestGIF(t *testing.T, path string) {
	t.Helper()
	pal := color.Palette{color.RGBA{215, 20, 40, 255}, color.RGBA{40, 90, 220, 255}}
	var frames []*image.Paletted
	for i := 0; i < 4; i++ {
		fr := image.NewPaletted(image.Rect(0, 0, 260, 160), pal)
		for y := 0; y < 160; y++ {
			for x := 0; x < 260; x++ {
				if x/40%2 == i%2 {
					fr.SetColorIndex(x, y, 0)
				} else {
					fr.SetColorIndex(x, y, 1)
				}
			}
		}
		frames = append(frames, fr)
	}
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := gif.EncodeAll(f, &gif.GIF{Image: frames, Delay: []int{10, 10, 10, 10}, Config: image.Config{Width: 260, Height: 160}}); err != nil {
		t.Fatal(err)
	}
	f.Close()
}
