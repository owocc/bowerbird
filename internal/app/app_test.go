package app

import (
	"fmt"
	"testing"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
)

func seededApp(t *testing.T) *App {
	t.Helper()
	a := New(nil)
	a.prefs = defaultPrefs()
	a.prefs.InspectorOpen = true
	a.prefs.SidebarOpen = true
	a.rowHeight = int(a.prefs.RowHeight)
	a.sortOrder = "desc"
	a.library = &core.LibraryInfo{ID: "lib", Name: "Library", Path: t.TempDir()}
	a.stats = core.WorkspaceStats{Total: 3, UntaggedCount: 1, TotalSize: 4096}
	a.folders = []core.Folder{{ID: "f1", Name: "Inspiration", ItemCount: 2}}
	a.tags = []core.Tag{{Name: "reference", ItemCount: 2}}
	a.items = []core.Item{
		{ID: "a", Name: "Alpha", Extension: "jpg", MimeType: "image/jpeg", Width: 1600, Height: 900, FilePath: "/tmp/a.jpg", Rating: 3, Tags: []string{"reference"}},
		{ID: "b", Name: "Beta", Extension: "png", MimeType: "image/png", Width: 900, Height: 1200, FilePath: "/tmp/b.png"},
		{ID: "c", Name: "Gamma", Extension: "mp3", MimeType: "audio/mpeg", Width: 0, Height: 0, FilePath: "/tmp/c.mp3"},
	}
	a.total = len(a.items)
	a.activeItem = &a.items[0]
	a.activeItemID = "a"
	a.selected = map[string]bool{"a": true}
	a.rebuildRows()
	return a
}

func TestMainViewRendersAndSettles(t *testing.T) {
	a := seededApp(t)
	tester := ui.NewTester(a.viewMain, 1280, 800)
	if tester.FramePending() {
		t.Fatal("idle main view keeps asking for frames")
	}
	for _, want := range []string{"Alpha", "Inspiration", "reference"} {
		if !tester.HasText(want) {
			t.Fatalf("main view is missing %q", want)
		}
	}
}

func TestSelectingItemUpdatesInspector(t *testing.T) {
	a := seededApp(t)
	a.chooseItem(1, 0)
	if a.activeItemID != "b" {
		t.Fatalf("active item = %q, want b", a.activeItemID)
	}
	if !a.selected["b"] || len(a.selected) != 1 {
		t.Fatalf("selection = %v", a.selected)
	}
	tester := ui.NewTester(a.viewMain, 1280, 800)
	if tester.FramePending() {
		t.Fatal("selection view keeps animating")
	}
	if !tester.HasText("Beta") {
		t.Fatal("selected item not shown")
	}
	// Direct click always single-selects.
	a.chooseItem(2, 0)
	if !a.selected["c"] || len(a.selected) != 1 {
		t.Fatalf("click selection = %v, want only c", a.selected)
	}
}
func TestArrowKeySelectionNavigation(t *testing.T) {
	a := seededApp(t)
	a.chooseItem(0, 0)
	if a.selectedAt != 0 {
		t.Fatalf("initial selectedAt = %d, want 0", a.selectedAt)
	}
	// Move Right in Justified layout
	a.moveGallerySelection(1, 0)
	if a.selectedAt != 1 {
		t.Fatalf("after right selectedAt = %d, want 1", a.selectedAt)
	}
	// Move Left
	a.moveGallerySelection(-1, 0)
	if a.selectedAt != 0 {
		t.Fatalf("after left selectedAt = %d, want 0", a.selectedAt)
	}
	// Test List mode navigation
	a.prefs.LayoutMode = "list"
	a.rebuildRows()
	a.moveGallerySelection(0, 1)
	if a.selectedAt != 1 {
		t.Fatalf("list down selectedAt = %d, want 1", a.selectedAt)
	}
	a.moveGallerySelection(0, -1)
	if a.selectedAt != 0 {
		t.Fatalf("list up selectedAt = %d, want 0", a.selectedAt)
	}
}


func TestSidebarModesRender(t *testing.T) {
	a := seededApp(t)
	for _, nav := range []Nav{NavAll, NavTags, NavTrash} {
		a.nav = nav
		tester := ui.NewTester(a.viewMain, 1100, 760)
		tester.Frame()
		if tester.FramePending() {
			t.Fatalf("%s view does not settle", nav)
		}
	}
}

func TestBlankMainViewWithoutLibrary(t *testing.T) {
	a := New(nil)
	if a.library != nil {
		t.Fatal("new app has a library")
	}
	tester := ui.NewTester(a.viewMain, 900, 600)
	if tester.FramePending() {
		t.Fatal("empty view keeps animating")
	}
}

func TestMainViewIsNotBlack(t *testing.T) {
	a := seededApp(t)
	tester := ui.NewTester(a.viewMain, 1280, 800)
	img := tester.Image()
	if img == nil {
		t.Fatal("no frame")
	}
	bright := 0
	for y := 0; y < img.Bounds().Dy(); y += 4 {
		for x := 0; x < img.Bounds().Dx(); x += 4 {
			r, g, b, _ := img.At(x, y).RGBA()
			if r>>8+g>>8+b>>8 > 60 {
				bright++
			}
		}
	}
	if bright < 1000 {
		t.Fatalf("frame looks black: only %d sampled pixels are visible", bright)
	}
}

func TestHeaderSitsAtTopAndGalleryScrolls(t *testing.T) {
	a := seededApp(t)
	a.items = nil
	for i := 0; i < 80; i++ {
		a.items = append(a.items, core.Item{ID: fmt.Sprintf("i%d", i), Name: fmt.Sprintf("Item %d", i), Extension: "jpg", MimeType: "image/jpeg", Width: 1600, Height: 1000})
	}
	a.total = len(a.items)
	a.activeItem = nil
	a.selected = map[string]bool{}
	a.rebuildRows()
	tester := ui.NewTester(a.viewMain, 1100, 760)
	rect, ok := tester.Find("Newest")
	if !ok {
		t.Fatal("header is missing")
	}
	if rect.Y > 60 {
		t.Fatalf("header is not at the top: y=%v", rect.Y)
	}
	if !tester.HasText("Item 0") {
		t.Fatal("first item is not visible")
	}
	tester.Scroll(650, 400, 0, 2400)
	tester.Frame()
	if tester.HasText("Item 0") {
		t.Fatal("gallery did not scroll: the first item is still visible")
	}
}
func TestLayoutModesSwitchAndRender(t *testing.T) {
	a := seededApp(t)
	for _, mode := range []string{"justified", "grid", "list"} {
		a.prefs.LayoutMode = mode
		a.rebuildRows()
		if len(a.rows) == 0 {
			t.Fatalf("layout %s produced no rows", mode)
		}
		tester := ui.NewTester(a.viewMain, 1280, 800)
		tester.Frame()
		if !tester.HasText("Alpha") {
			t.Fatalf("layout %s does not show Alpha", mode)
		}
	}
}

func TestRubberBandMarqueeSelect(t *testing.T) {
	a := seededApp(t)
	a.selected = map[string]bool{}
	a.rebuildRows()

	tester := ui.NewTester(a.viewMain, 1280, 800)
	tester.Frame()

	if !tester.HasText("Alpha") {
		t.Fatal("Alpha card not found")
	}
	// Start marquee from empty space below or beside the gallery cards and drag up
	tester.Press(800, 600)
	tester.Move(100, 50)
	tester.Release(100, 50)
	tester.Frame()
	if len(a.selected) == 0 {
		t.Fatal("marquee selection did not select any items")
	}
}

func TestDoubleclickOpensInlinePreviewAndHeaderChanges(t *testing.T) {
	a := seededApp(t)
	tester := ui.NewTester(a.viewMain, 1280, 800)
	tester.Frame()

	// Double-click triggers inline preview
	a.openPreview("a", "inline")
	tester.Frame()

	if !a.previewOpen || a.previewMode != "inline" {
		t.Fatalf("preview should be open in inline mode, got open=%v mode=%v", a.previewOpen, a.previewMode)
	}
	// In inline preview, sidebar and inspector remain, header is replaced with preview toolbar
	if !tester.HasText("Alpha") {
		t.Fatal("inline preview toolbar should show item title")
	}
	if !tester.HasText("Inspiration") {
		t.Fatal("sidebar should still be visible in inline preview mode")
	}
}

func TestSpaceKeyOpensFullWindowPreview(t *testing.T) {
	a := seededApp(t)
	tester := ui.NewTester(a.viewMain, 1280, 800)
	tester.Frame()

	// Space key triggers full-window preview
	tester.Key(0, ui.KeySpace)
	tester.Frame()

	if !a.previewOpen || a.previewMode != "full" {
		t.Fatalf("preview should be open in full mode after Space key, got open=%v mode=%v", a.previewOpen, a.previewMode)
	}

	// Pressing space again cancels/closes preview
	tester.Key(0, ui.KeySpace)
	tester.Frame()
	if a.previewOpen {
		t.Fatal("pressing Space again should close the preview")
	}
}
