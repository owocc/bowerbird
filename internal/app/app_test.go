package app

import (
	"fmt"
	"math"
	"strings"
	"testing"

	"bowerbird/core"
	"bowerbird/internal/plugin"

	"github.com/egoist/mygo/transfer"
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
func TestInspectorShowsLibraryInfoWhenSelectionEmpty(t *testing.T) {
	a := seededApp(t)
	a.library.Name = "ArchiveLib"
	a.activeItem = nil
	a.activeItemID = ""
	a.selected = map[string]bool{}
	tester := ui.NewTester(a.viewInspector, inspectorWidth, 800)
	if tester.FramePending() {
		t.Fatal("library inspector keeps animating")
	}
	for _, want := range []string{"ArchiveLib", "3", "4.0 KB"} {
		if !tester.HasText(want) {
			t.Fatalf("library inspector is missing %q", want)
		}
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
	if rect.Y > float32(headerHeight+42) {
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
func TestLargeGalleryScrollsToItsRealEnd(t *testing.T) {
	a := seededApp(t)
	a.items = nil
	for i := 0; i < 30000; i++ {
		a.items = append(a.items, core.Item{
			ID: fmt.Sprintf("large-%d", i), Name: fmt.Sprintf("Large Item %d", i),
			Extension: "jpg", MimeType: "image/jpeg", Width: 1600, Height: 1000,
		})
	}
	a.total = len(a.items)
	a.activeItem = nil
	a.selected = map[string]bool{}
	a.rebuildRows()
	if len(a.rows) != len(a.items) {
		t.Fatalf("rows = %d, want one row per item (%d)", len(a.rows), len(a.items))
	}

	tester := ui.NewTester(a.viewMain, 1100, 760)
	tester.Frame()
	if a.galleryScroll.MaxY <= 0 {
		t.Fatal("gallery has no scroll range")
	}
	a.galleryScroll.Y = math.MaxFloat32
	tester.Frame()
	if a.galleryScroll.Y < a.galleryScroll.MaxY-1 {
		t.Fatalf("gallery did not reach its end: y=%v maxY=%v", a.galleryScroll.Y, a.galleryScroll.MaxY)
	}
	if !tester.HasText("Large Item 29999") {
		t.Fatal("the last item is not visible at the end of a large gallery")
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

func TestGalleryClickAndDoubleClickCards(t *testing.T) {
	a := seededApp(t)
	tester := ui.NewTester(a.viewMain, 1280, 800)
	tester.Frame()

	// Gamma is not the active item, so its label is unique to the gallery.
	r, ok := tester.Find("Gamma")
	if !ok {
		t.Fatal("Gamma card not found")
	}
	x, y := r.X+r.W/2, r.Y+r.H/2

	tester.ClickAt(x, y)
	tester.Frame()
	if !a.selected["c"] || len(a.selected) != 1 || a.activeItemID != "c" {
		t.Fatalf("click selected %v, active %q; want only c", a.selected, a.activeItemID)
	}
	if a.previewOpen {
		t.Fatal("single click must not open the preview")
	}

	tester.ClickAt(x, y)
	tester.Frame()
	if !a.previewOpen || a.previewMode != "inline" {
		t.Fatalf("double click should open inline preview, got open=%v mode=%v", a.previewOpen, a.previewMode)
	}
}

func TestItemDragDataFollowsSelection(t *testing.T) {
	a := seededApp(t)
	a.items[0].FileURL = "file:///tmp/a.jpg"
	a.items[1].FileURL = "file:///tmp/b.png"
	a.items[2].FileURL = "file:///tmp/c.mp3"

	readList := func(item core.Item) string {
		data := a.itemDragData(item)
		b, err := data.Read(transfer.FileList)
		if err != nil {
			t.Fatalf("read file list: %v", err)
		}
		return string(b)
	}

	// A single selection drags only the pressed item.
	if got := readList(a.items[0]); got != "file:///tmp/a.jpg" {
		t.Fatalf("single drag = %q, want a.jpg", got)
	}

	// Dragging a member of a multi-selection drags the whole selection.
	a.selected = map[string]bool{"a": true, "b": true}
	a.selectedOrder = []string{"a", "b"}
	if got := readList(a.items[1]); got != "file:///tmp/a.jpg\r\nfile:///tmp/b.png" {
		t.Fatalf("multi drag = %q, want a then b", got)
	}

	// Dragging an item outside the selection carries only that item.
	if got := readList(a.items[2]); got != "file:///tmp/c.mp3" {
		t.Fatalf("outside drag = %q, want c.mp3", got)
	}
}

func TestGalleryContextMenuTogglesSidebarAndInspector(t *testing.T) {
	a := seededApp(t)
	tester := ui.NewTester(a.viewMain, 1280, 800)
	tester.Frame()

	// Right-click the empty part of the gallery.
	tester.RightClickAt(600, 700)
	tester.Frame()
	if !tester.HasText(a.t("contextMenu.showSidebar")) && !contains(tester.Menu(), a.t("contextMenu.showSidebar")) {
		t.Fatalf("context menu is missing sidebar toggle: %v", tester.Menu())
	}
	if err := tester.ChooseMenuItem(a.t("contextMenu.showSidebar")); err != nil {
		t.Fatalf("choose sidebar toggle: %v", err)
	}
	if a.prefs.SidebarOpen {
		t.Fatal("sidebar toggle did not hide the sidebar")
	}
	tester.Frame()

	tester.RightClickAt(600, 700)
	tester.Frame()
	if err := tester.ChooseMenuItem(a.t("contextMenu.showInspector")); err != nil {
		t.Fatalf("choose inspector toggle: %v", err)
	}
	if a.prefs.InspectorOpen {
		t.Fatal("inspector toggle did not hide the inspector")
	}
}

func TestEmptyGalleryKeepsDefaultContextMenu(t *testing.T) {
	a := seededApp(t)
	a.items = nil
	a.folders = nil
	a.total = 0
	a.totalSize = 0
	a.activeItem = nil
	a.activeItemID = ""
	a.selected = map[string]bool{}
	a.rebuildRows()

	tester := ui.NewTester(a.viewMain, 1100, 760)
	tester.Frame()
	tester.RightClickAt(600, 650)
	tester.Frame()
	if !contains(tester.Menu(), a.t("workspace.includeSubfolders")) {
		t.Fatalf("empty gallery context menu is missing subfolder toggle: %v", tester.Menu())
	}
	if err := tester.ChooseMenuItem(a.t("workspace.includeSubfolders")); err != nil {
		t.Fatalf("choose subfolder toggle: %v", err)
	}
	if !a.prefs.IncludeSubs {
		t.Fatal("subfolder toggle did not update the preference")
	}
}

func TestClearWorkspaceSelectionResetsInspector(t *testing.T) {
	a := seededApp(t)
	a.activeItem = &a.items[0]
	a.activeItemID = a.items[0].ID
	a.selected = map[string]bool{a.items[0].ID: true}
	a.selectedOrder = []string{a.items[0].ID}
	a.inspectSections = []plugin.InspectSection{{Title: "stale"}}
	a.previewOpen = true

	a.clearWorkspaceSelection()
	if a.activeItem != nil || a.activeItemID != "" || len(a.selected) != 0 || len(a.selectedOrder) != 0 {
		t.Fatalf("selection was not cleared: item=%v id=%q selected=%v order=%v", a.activeItem, a.activeItemID, a.selected, a.selectedOrder)
	}
	if len(a.inspectSections) != 0 || a.previewOpen {
		t.Fatal("inspector or preview state survived a library switch")
	}
}

func TestFilterBarPinnedAndActiveCriteria(t *testing.T) {
	a := seededApp(t)

	// The old web default keeps type, color, folder and orientation pinned.
	want := []string{filterCriterionType, filterCriterionColor, filterCriterionFolder, filterCriterionOrientation}
	if got := a.visibleFilterCriteria(); fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("default visible filters = %v, want %v", got, want)
	}

	// An active unpinned criterion stays visible so it can be changed/cleared.
	a.filters.Sizes = []string{"small"}
	want = append(want, filterCriterionSize)
	if got := a.visibleFilterCriteria(); fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("visible filters with active size = %v, want %v", got, want)
	}

	// Unpinning removes the criterion unless it is active.
	t.Setenv("BOWERBIRD_USER_DATA_DIR", t.TempDir())
	a.toggleFilterPin(filterCriterionType)
	if got := a.visibleFilterCriteria(); contains(got, filterCriterionType) {
		t.Fatalf("unpinned inactive type is still visible: %v", got)
	}
}

func TestFilterQueryStringIncludesAllCriteria(t *testing.T) {
	a := seededApp(t)
	a.query = "sunset"
	a.filters = Filters{
		Types:        []string{"image"},
		Colors:       []string{"#EF4444"},
		Folders:      []string{"f1"},
		Ratings:      []int{5},
		Orientations: []string{"landscape"},
		Sizes:        []string{"small"},
		Has:          []string{"url"},
		No:           []string{"note"},
	}
	want := "sunset type:image color:#EF4444 folder:f1 rating:5 orientation:landscape size:small has:url no:note"
	if got := a.queryString(); got != want {
		t.Fatalf("queryString = %q, want %q", got, want)
	}

	// Unrated is an additive query flag, not a rating:0 token.
	a.filters.Ratings = nil
	a.filters.Unrated = true
	if got := a.queryString(); contains([]string{got}, "rating:") {
		t.Fatalf("unrated must not emit a rating token: %q", got)
	}
}

func TestSidebarFolderTreeRendersChildrenAfterParent(t *testing.T) {
	a := seededApp(t)
	a.folders = []core.Folder{{
		ID: "root-folder", Name: "RootFolder", ItemCount: 4,
		Children: []core.Folder{{
			ID: "child-folder", Name: "ChildFolder", ParentID: "root-folder", ItemCount: 2,
			Children: []core.Folder{
				{ID: "grand-folder", Name: "GrandFolder", ParentID: "child-folder"},
			},
		}},
	}}
	a.expanded = map[string]bool{"root-folder": true, "child-folder": true}
	tester := ui.NewTester(a.viewMain, 1100, 760)
	tester.Frame()
	root, okRoot := tester.Find("RootFolder")
	child, okChild := tester.Find("ChildFolder")
	grand, okGrand := tester.Find("GrandFolder")
	if !okRoot || !okChild || !okGrand {
		t.Fatalf("folder tree rows missing: root=%v child=%v grand=%v", okRoot, okChild, okGrand)
	}
	if !(root.Y < child.Y && child.Y < grand.Y) {
		t.Fatalf("folder tree order root=%v child=%v grand=%v", root.Y, child.Y, grand.Y)
	}
	if !(root.X < child.X && child.X < grand.X) {
		t.Fatalf("folder tree indentation root=%v child=%v grand=%v", root.X, child.X, grand.X)
	}

	a.expanded = map[string]bool{"root-folder": true}
	tester.Frame()
	if tester.HasText("GrandFolder") {
		t.Fatal("collapsed child folder still renders its descendants")
	}
}

func TestGalleryShowsSubfoldersBeforeItems(t *testing.T) {
	a := seededApp(t)
	a.nav = NavFolder
	a.folderID = "parent-folder"
	a.folders = []core.Folder{{
		ID:   "parent-folder",
		Name: "ParentFolder",
		Children: []core.Folder{
			{ID: "child-folder", Name: "ChildFolder", ParentID: "parent-folder", ItemCount: 7},
		},
	}}
	a.folderPreviews = map[string]core.FolderPreview{
		"child-folder": {Total: 7},
	}
	a.rebuildRows()
	if len(a.rows) < 2 || !a.rows[0][0].folderHeader || a.rows[1][0].folderID != "child-folder" {
		t.Fatalf("folder section was not placed first: %+v", a.rows[:min(len(a.rows), 2)])
	}

	tester := ui.NewTester(a.viewMain, 1100, 760)
	tester.Frame()
	folderRect, okFolder := tester.Find("ChildFolder")
	itemRect, okItem := tester.Find("Alpha")
	if !okFolder || !okItem {
		t.Fatalf("gallery missing folder or item: folder=%v item=%v", okFolder, okItem)
	}
	if folderRect.Y >= itemRect.Y {
		t.Fatalf("folder card Y=%v is not above item Y=%v", folderRect.Y, itemRect.Y)
	}

	a.subfoldersCollapsed = true
	a.rebuildRows()
	tester.Frame()
	if tester.HasText("ChildFolder") {
		t.Fatal("collapsed subfolder section still shows folder cards")
	}
}

func TestLibraryPickerKeepsStableOrderAndFilters(t *testing.T) {
	t.Setenv("BOWERBIRD_USER_DATA_DIR", t.TempDir())
	a := seededApp(t)
	a.recent = []core.LibraryRef{
		{ID: "b", Path: "/tmp/Blue.library"},
		{ID: "lib", Path: a.library.Path},
		{ID: "c", Path: "/tmp/Charcoal.library"},
	}
	a.prefs.LibraryOrder = []string{"c", "b", "lib"}

	got := a.libraryRefsInOrder()
	var ids []string
	for _, ref := range got {
		ids = append(ids, ref.ID)
	}
	if strings.Join(ids, ",") != "c,b,lib" {
		t.Fatalf("library order = %v, want c,b,lib", ids)
	}

	a.librarySearch = "blue"
	filtered := a.filteredLibraryRefs(got)
	if len(filtered) != 2 || filtered[0].ID != "b" || filtered[1].ID != "lib" {
		t.Fatalf("filtered libraries = %+v, want Blue and active library", filtered)
	}

	a.reorderLibraries([]int{0}, 3)
	if strings.Join(a.prefs.LibraryOrder, ",") != "b,lib,c" {
		t.Fatalf("reordered libraries = %v, want b,lib,c", a.prefs.LibraryOrder)
	}
}

func TestLibraryPickerRendersSearchAndActions(t *testing.T) {
	t.Setenv("BOWERBIRD_USER_DATA_DIR", t.TempDir())
	a := seededApp(t)
	a.recent = []core.LibraryRef{
		{ID: "lib", Path: a.library.Path},
		{ID: "blue", Path: "/tmp/Blue.library"},
	}
	a.libraryPickerOpen = true
	tester := ui.NewTester(a.viewMain, 1280, 800)
	tester.Frame()
	if !tester.HasText(a.t("sidebar.createLibrary.action")) || !tester.HasText(a.t("sidebar.openLibrary")) {
		t.Fatal("library picker is missing its actions")
	}
	if !tester.HasText("Blue") {
		t.Fatal("library picker is missing a recent library")
	}
}

func TestSettingsSectionLabelsAreTranslated(t *testing.T) {
	a := seededApp(t)
	for _, label := range a.settingsSectionLabels() {
		if strings.HasPrefix(label, "settings.") {
			t.Fatalf("settings navigation shows a raw translation key: %q", label)
		}
	}
	for _, title := range []string{
		a.t("settings.vibrancy.title"),
		a.t("settings.vibrancy.enable"),
		a.t("settings.backdrop.title"),
		a.t("settings.shortcuts.title"),
		a.t("settings.language.title"),
	} {
		if strings.HasPrefix(title, "settings.") {
			t.Fatalf("settings shows a raw translation key: %q", title)
		}
	}
}

func TestHeaderBlurStartsWhenContentReachesHeader(t *testing.T) {
	a := seededApp(t)
	a.galleryScroll.Y = 0
	if a.headerHasContentUnder() {
		t.Fatal("header blurred before the gallery reached it")
	}
	a.galleryScroll.Y = galleryTopPadding
	if a.headerHasContentUnder() {
		t.Fatal("header blurred while content only reached its bottom edge")
	}
	a.galleryScroll.Y = galleryTopPadding + 1
	if !a.headerHasContentUnder() {
		t.Fatal("header did not blur once content scrolled under it")
	}
}

func TestSettingsHeaderBlurStartsWhenContentReachesHeader(t *testing.T) {
	a := seededApp(t)
	a.settingsScroll.Y = 0
	if a.settingsHeaderHasContentUnder() {
		t.Fatal("settings header blurred before content reached it")
	}
	a.settingsScroll.Y = settingsContentTopPadding
	if a.settingsHeaderHasContentUnder() {
		t.Fatal("settings header blurred while content only reached its bottom edge")
	}
	a.settingsScroll.Y = settingsContentTopPadding + 1
	if !a.settingsHeaderHasContentUnder() {
		t.Fatal("settings header did not blur once content scrolled under it")
	}
}
