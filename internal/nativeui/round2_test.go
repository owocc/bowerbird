package nativeui

import (
	"image"
	"image/color"
	"image/gif"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
)

func testApp() *App {
	app := &App{
		view:         viewAll,
		category:     "all",
		orientation:  "all",
		sizeFilter:   "all",
		hasURL:       "all",
		hasNote:      "all",
		ratingFilter: -1,
		layout:       layoutGrid,
		rowHeight:    140,
		sidebarWidth: 248,
		contentSplit: 74,
		expanded:     map[string]bool{},
		thumbs:       newImageCache(300, 96<<20),
		previews:     newImageCache(8, 160<<20),
		gifs:         newGIFCache(),
	}
	app.SetHost(NewHost(app))
	return app
}

func TestIncludeSubfoldersFilter(t *testing.T) {
	app := testApp()
	app.folders = []core.Folder{{ID: "p", Name: "Parent", Children: []core.Folder{
		{ID: "c", Name: "Child", ParentID: "p", Children: []core.Folder{{ID: "g", Name: "Grand", ParentID: "c"}}},
	}}}
	app.items = []core.Item{
		{ID: "parent", Folders: []string{"p"}},
		{ID: "child", Folders: []string{"c"}},
		{ID: "grand", Folders: []string{"g"}},
		{ID: "elsewhere", Folders: []string{"x"}},
	}
	app.folderID = "p"
	app.includeSubfolders = false
	app.visibleSet = false
	if vis := app.computeVisible(); len(vis) != 1 || vis[0].ID != "parent" {
		t.Fatalf("direct folder = %v", itemIDs(vis))
	}
	app.includeSubfolders = true
	app.subfolderSet = nil
	vis := app.computeVisible()
	if len(vis) != 3 {
		t.Fatalf("with subfolders = %v", itemIDs(vis))
	}
	seen := map[string]bool{}
	for _, it := range vis {
		seen[it.ID] = true
	}
	for _, want := range []string{"parent", "child", "grand"} {
		if !seen[want] {
			t.Errorf("missing %s in %v", want, itemIDs(vis))
		}
	}
}

func TestHistoryCollectionOrder(t *testing.T) {
	app := testApp()
	app.items = []core.Item{{ID: "a"}, {ID: "b"}, {ID: "c"}}
	app.history = []dragHistoryEntry{{ItemID: "c"}, {ItemID: "a"}, {ItemID: "gone"}}
	app.view = viewHistory
	app.sortAsc = false
	app.visibleSet = false
	if got := itemIDs(app.computeVisible()); len(got) != 2 || got[0] != "c" || got[1] != "a" {
		t.Fatalf("history newest first = %v", got)
	}
	app.sortAsc = true
	app.visibleSet = false
	if got := itemIDs(app.computeVisible()); len(got) != 2 || got[0] != "a" || got[1] != "c" {
		t.Fatalf("history oldest first = %v", got)
	}
}

func TestJustifiedLayoutFillsWidth(t *testing.T) {
	vis := make([]core.Item, 7)
	for i := range vis {
		vis[i] = core.Item{ID: string(rune('a' + i)), Width: 400 + i*80, Height: 300}
	}
	const width = 900
	l := computeJustified(vis, width, 160)
	if len(l.units) != len(vis) {
		t.Fatalf("units %d", len(l.units))
	}
	// Group units into rows (same y) and check each row's right edge.
	rows := map[float32][]galleryUnit{}
	for _, u := range l.units {
		rows[u.y] = append(rows[u.y], u)
	}
	for y, row := range rows {
		right := float32(0)
		for _, u := range row {
			if u.x+u.w > right {
				right = u.x + u.w
			}
			if u.h <= 0 || u.w <= 0 {
				t.Fatalf("empty unit at y=%v: %+v", y, u)
			}
		}
		if right > width+0.5 {
			t.Errorf("row at y=%v overflows: %v > %v", y, right, width)
		}
		if right < width*0.8 {
			t.Errorf("row at y=%v badly underfills: %v", y, right)
		}
	}
	if l.height <= 0 {
		t.Error("no layout height")
	}
}

func TestWaterfallColumns(t *testing.T) {
	vis := make([]core.Item, 12)
	for i := range vis {
		vis[i] = core.Item{ID: string(rune('a' + i)), Width: 300, Height: 200 + i*20}
	}
	l := computeWaterfall(vis, 900, 180)
	if l.cols < 2 {
		t.Fatalf("cols = %d", l.cols)
	}
	if len(l.units) != len(vis) {
		t.Fatalf("units = %d", len(l.units))
	}
	if l.height <= 0 {
		t.Fatal("no height")
	}
}

func TestMarqueeSelectsIntersectingCells(t *testing.T) {
	app := testApp()
	app.items = []core.Item{{ID: "a"}, {ID: "b"}, {ID: "c"}}
	app.visibleSet = false
	app.visibleItems()
	app.galleryBounds = ui.Rect{X: 10, Y: 20, W: 500, H: 400}
	app.cellRects = map[string]ui.Rect{
		"a": {X: 10, Y: 20, W: 100, H: 100},
		"b": {X: 120, Y: 20, W: 100, H: 100},
		"c": {X: 240, Y: 20, W: 100, H: 100},
	}
	app.marquee = marqueeState{active: true, startX: 0, startY: 0, curX: 130, curY: 60}
	app.recomputeMarquee()
	if !app.selection.Has("a") || !app.selection.Has("b") || app.selection.Has("c") {
		t.Fatalf("marquee selection = %v", app.selection.Len())
	}
	// Cmd-drag keeps the prior selection.
	app.selection.Clear()
	app.selection.Add("c")
	app.marquee = marqueeState{active: true, add: true, base: map[string]bool{"c": true}, startX: 0, startY: 0, curX: 110, curY: 60}
	app.recomputeMarquee()
	if !app.selection.Has("a") || !app.selection.Has("c") {
		t.Fatal("additive marquee did not keep the base selection")
	}
}

func TestPreviewZoomAndDoubleClick(t *testing.T) {
	app := testApp()
	app.preview.boxW, app.preview.boxH = 1000, 800
	app.preview.naturalW, app.preview.naturalH = 2000, 1000
	app.previewResetZoom()
	if !app.previewInput(ui.InputEvent{Kind: ui.InputScroll, DY: -100}, true) {
		t.Fatal("wheel not taken")
	}
	if app.preview.zoom <= 1 {
		t.Fatalf("wheel zoom = %v", app.preview.zoom)
	}
	app.previewInput(ui.InputEvent{Kind: ui.InputPointerDown, Clicks: 2}, true)
	if app.preview.zoom != 1 {
		t.Fatalf("double click did not reset: %v", app.preview.zoom)
	}
	app.previewInput(ui.InputEvent{Kind: ui.InputPointerDown, Clicks: 2}, true)
	if app.preview.zoom < 1.5 {
		t.Fatalf("double click to 1:1 = %v", app.preview.zoom)
	}
	// Drag pans by the pointer's delta.
	app.previewInput(ui.InputEvent{Kind: ui.InputPointerDown, X: 500, Y: 400}, true)
	app.previewInput(ui.InputEvent{Kind: ui.InputPointerMove, X: 550, Y: 430}, true)
	app.previewInput(ui.InputEvent{Kind: ui.InputPointerUp, X: 550, Y: 430}, true)
	if app.preview.panX != 50 || app.preview.panY != 30 {
		t.Fatalf("pan = %v,%v", app.preview.panX, app.preview.panY)
	}
}

func TestDragHistoryRecordsDedupesAndPersists(t *testing.T) {
	app, svc, _ := newTestApp(t)
	root := t.TempDir()
	app.setupDir = root
	app.setupName = "History"
	app.createLibrary()
	waitFor(t, "library", func() bool { return app.lib != nil })
	items := seedImages(t, svc, 2)
	app.refreshAll()
	waitFor(t, "items", func() bool { return len(app.items) == 2 })
	app.recordDragHistory([]string{items[1].ID, items[0].ID, items[1].ID})
	waitFor(t, "history", func() bool {
		return len(app.history) == 2 && app.history[0].ItemID == items[1].ID
	})
	if app.historyCount != 2 {
		t.Errorf("history count = %d", app.historyCount)
	}
	path := filepath.Join(core.UserDataDir(), "native-drag-history.json")
	waitFor(t, "history file", func() bool {
		raw, err := os.ReadFile(path)
		return err == nil && len(raw) > 2
	})
	app.clearDragHistory()
	waitFor(t, "history cleared", func() bool { return len(app.history) == 0 })
}

func TestThumbLimitsAndEviction(t *testing.T) {
	if max, budget := thumbLimits(10); max != 300 || budget != 96<<20 {
		t.Errorf("small library limits = %d %d", max, budget)
	}
	if max, _ := thumbLimits(50000); max != 1000 {
		t.Errorf("large library max = %d", max)
	}
	c := newImageCache(2, 100)
	img := image.NewRGBA(image.Rect(0, 0, 4, 4))
	_ = c.begin("a")
	c.put("a", img)
	_ = c.begin("b")
	c.put("b", img)
	_ = c.begin("c")
	c.put("c", img)
	if _, n := c.stats(); n > 2 {
		t.Fatalf("cache kept %d entries over its count limit", n)
	}
	c.setLimits(1, 1)
	if bytes, n := c.stats(); bytes > 1 || n > 1 {
		t.Fatalf("setLimits did not evict: bytes=%d entries=%d", bytes, n)
	}
}

func TestDecodeAnimatedGIF(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "anim.gif")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	pal := color.Palette{color.RGBA{0, 0, 0, 255}, color.RGBA{255, 0, 0, 255}, color.RGBA{0, 255, 0, 255}}
	var frames []*image.Paletted
	for i := 0; i < 3; i++ {
		frame := image.NewPaletted(image.Rect(0, 0, 40, 30), pal)
		for p := range frame.Pix {
			frame.Pix[p] = uint8(1 + i%2)
		}
		frames = append(frames, frame)
	}
	g := &gif.GIF{Image: frames, Delay: []int{5, 5, 5}, Config: image.Config{Width: 40, Height: 30}}
	if err := gif.EncodeAll(f, g); err != nil {
		t.Fatal(err)
	}
	f.Close()
	got, delays, bytes, err := decodeGIF(path, 16)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 || len(delays) != 3 {
		t.Fatalf("frames=%d delays=%d", len(got), len(delays))
	}
	if got[0].Bounds().Dx() > 16 || got[0].Bounds().Dy() > 16 {
		t.Fatalf("not downsampled: %v", got[0].Bounds())
	}
	if delays[0] < 20*time.Millisecond {
		t.Errorf("delay = %v", delays[0])
	}
	if bytes <= 0 {
		t.Error("no byte accounting")
	}
}

func TestBulkRatingAndNote(t *testing.T) {
	app, svc, _ := newTestApp(t)
	root := t.TempDir()
	app.setupDir = root
	app.setupName = "Bulk"
	app.createLibrary()
	waitFor(t, "library", func() bool { return app.lib != nil })

	src := filepath.Join(root, "sample.png")
	f, err := os.Create(src)
	if err != nil {
		t.Fatal(err)
	}
	img := image.NewRGBA(image.Rect(0, 0, 400, 300))
	for i := range img.Pix {
		img.Pix[i] = 128
	}
	if err := png.Encode(f, img); err != nil {
		t.Fatal(err)
	}
	f.Close()
	items, err := svc.ImportFiles([]string{src})
	if err != nil || len(items) != 1 {
		t.Fatalf("import: %v %d", err, len(items))
	}
	id := items[0].ID
	app.refreshAll()
	waitFor(t, "items", func() bool { return len(app.visibleItems()) == 1 })
	app.selection.Add(id)
	app.selectedIndex = 0
	app.selectedID = id

	app.setRatingForSelection(4)
	waitFor(t, "rating", func() bool {
		it, err := svc.GetItem(id)
		return err == nil && it != nil && it.Rating == 4
	})
	app.setNoteForSelection("batch note")
	waitFor(t, "note", func() bool {
		it, err := svc.GetItem(id)
		return err == nil && it != nil && it.Note == "batch note"
	})
}

func itemIDs(items []core.Item) []string {
	out := make([]string, len(items))
	for i := range items {
		out[i] = items[i].ID
	}
	return out
}
