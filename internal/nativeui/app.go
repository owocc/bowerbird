package nativeui

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"bowerbird/core"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

// View identifiers of the main workspace's virtual collections.
const (
	viewAll           = "all"
	viewTrash         = "trash"
	viewUntagged      = "untagged"
	viewUncategorized = "uncategorized"
)

const (
	layoutGrid = "grid"
	layoutList = "list"
)

// App is the native application's model. Views are immediate-mode functions of
// this state; it is changed on the main thread, except for the snapshots that
// background loads hand back through Window.Update.
type App struct {
	svc *core.Service
	mgr *core.LibraryManager

	host *appHost
	win  atomic.Pointer[mygo.Window]

	// Library snapshot and its metadata.
	lib                *core.LibraryInfo
	items              []core.Item
	trash              []core.Item
	folders            []core.Folder
	tags               []core.Tag
	trashCount         int
	untaggedCount      int
	uncategorizedCount int
	loading            bool
	loadErr            string
	dataGen            atomic.Int64

	visible    []core.Item
	visibleSet bool

	// Query and filters.
	query        string
	sortAsc      bool
	view         string
	folderID     string
	tagFilter    string
	category     string
	colorFilter  string
	filterFolder string
	orientation  string
	sizeFilter   string
	hasURL       string
	hasNote      string
	ratingFilter int
	layout       string
	rowHeight    float32

	// Layout state.
	sidebarWidth  float32
	contentSplit  float32
	showSidebar   bool
	showInspector bool
	expanded      map[string]bool

	// Selection. selectedIndex is the GridView's cursor into visible; selectedID
	// is its stable identity across reloads.
	grid          ui.GridState
	listState     ui.ListState
	selection     ui.Selection[string]
	selectedIndex int
	selectedID    string

	// Inspector drafts.
	editorItemID string
	draftName    string
	draftNote    string
	draftURL     string
	draftPrompt  string
	draftRating  int
	draftTags    []string
	bulkTags     []string
	editorDirty  bool

	// Overlays.
	folderDialog struct {
		open   bool
		rename bool
		id     string
		parent string
		name   string
	}
	confirm struct {
		open   bool
		title  string
		msg    string
		action string
	}
	preview struct {
		open bool
		id   string
	}
	pendingToast string

	// Setup window.
	setupName string
	setupDir  string

	// Settings window.
	settingsTab int
	themeMode   string
	language    string
	proxyMode   string
	customProxy string
	testURL     string
	testResult  string
	testPending bool
	mobile      *core.MobileServerStatus
	mobileOn    bool
	qrURL       string
	qrBitmap    *ui.Bitmap
	qrErr       string
	logs        []core.LogEntry
	logQuery    string
	logLevel    string

	// Import progress.
	importCur   int
	importTotal int
	importing   bool

	// Thumbnail caches.
	thumbs   *imageCache
	previews *imageCache

	// Focus handles.
	searchHandle ui.Handle
	logList      ui.ListState

	// First frame telemetry.
	startedAt    time.Time
	firstFrame   time.Time
	libraryFrame time.Time
	perfOnce     sync.Once
	nudgeMu      sync.Mutex
	nudging      map[*mygo.Window]bool
	lastViewLib  string
	perfMetrics  string
}

// NewApp builds the model around a core service that already knows its host.
func NewApp(svc *core.Service) *App {
	return &App{
		svc:           svc,
		view:          viewAll,
		category:      "all",
		orientation:   "all",
		sizeFilter:    "all",
		hasURL:        "all",
		hasNote:       "all",
		ratingFilter:  -1,
		layout:        layoutGrid,
		selectedIndex: -1,
		rowHeight:     140,
		sidebarWidth:  248,
		contentSplit:  74,
		showSidebar:   true,
		showInspector: true,
		expanded:      map[string]bool{},
		thumbs:        newImageCache(300, 96<<20),
		previews:      newImageCache(8, 160<<20),
		testURL:       "https://www.google.com",
		startedAt:     processStart,
		nudging:       map[*mygo.Window]bool{},
	}
}

// SetHost wires the native shell into the model.
func (a *App) SetHost(h *appHost) { a.host = h }

// SetManager wires the library manager created once the app is ready.
func (a *App) SetManager(m *core.LibraryManager) { a.mgr = m }

func (a *App) setWindow(w *mygo.Window) { a.win.Store(w) }

func (a *App) window() *mygo.Window { return a.win.Load() }

// update runs fn on the main thread and asks for a frame. It is safe from any
// goroutine.
func (a *App) update(fn func()) {
	if w := a.window(); w != nil {
		w.Update(fn)
		if !w.IsFocused() {
			a.nudgeRepaint(w)
		}
		return
	}
	fn()
}

// nudgeRepaint works around mygo v0.5.5 not rebuilding native Content for
// Window.Update in some window states: a small, immediately reverted content
// resize is the smallest change the platform always rebuilds for. Nudges are
// coalesced so a burst of thumbnail loads causes one repaint.
func (a *App) nudgeRepaint(w *mygo.Window) {
	a.nudgeMu.Lock()
	if a.nudging[w] {
		a.nudgeMu.Unlock()
		return
	}
	a.nudging[w] = true
	a.nudgeMu.Unlock()
	time.AfterFunc(20*time.Millisecond, func() {
		cb := w.ContentBounds()
		if cb.Width > 0 && cb.Height > 0 {
			w.SetContentSize(cb.Width+2, cb.Height+2)
			time.AfterFunc(12*time.Millisecond, func() {
				w.SetContentSize(cb.Width, cb.Height)
				a.nudgeMu.Lock()
				delete(a.nudging, w)
				a.nudgeMu.Unlock()
			})
		} else {
			a.nudgeMu.Lock()
			delete(a.nudging, w)
			a.nudgeMu.Unlock()
		}
	})
}

// updateNamed changes state owned by an auxiliary window and repaints it.
func (a *App) updateNamed(name string, fn func()) {
	mygo.RunOnMain(func() {
		fn()
		if w := a.host.Window(name); w != nil {
			a.nudgeRepaint(w)
		}
	})
}

func (a *App) invalidate() {
	a.host.invalidateAll()
}

func (a *App) toast(msg string) {
	if msg == "" {
		return
	}
	a.update(func() {
		a.pendingToast = msg
		a.host.invalidateAll()
	})
}

func (a *App) report(err error) {
	if err == nil {
		return
	}
	log.Printf("[NativeUI] %v", err)
	a.toast(err.Error())
}

// theme resolves the app's colour mode into a ui theme. System follows the
// desktop and the host redraws when it changes.
func (a *App) theme() *ui.Theme {
	dark := mygo.Theme.IsDark()
	switch a.themeMode {
	case core.ThemeDark:
		dark = true
	case core.ThemeLight:
		dark = false
	}
	if dark {
		return ui.DarkTheme()
	}
	return ui.LightTheme()
}

func (a *App) applyTheme(c *ui.Context) { c.SetTheme(a.theme()) }

// refreshAll reloads every snapshot the workspace and sidebar show.
func (a *App) refreshAll() {
	gen := a.dataGen.Add(1)
	q, asc := a.query, a.sortAsc
	go func() {
		sortOrder := "desc"
		if asc {
			sortOrder = "asc"
		}
		snap := dataSnapshot{}
		snap.items, snap.err = a.svc.GetItems(q, sortOrder)
		snap.trash, _ = a.svc.GetTrashItems(q, sortOrder)
		snap.folders, _ = a.svc.GetFolders()
		snap.tags, _ = a.svc.GetTags()
		snap.count, _ = a.svc.GetTrashCount()
		if lib, err := a.svc.GetActiveLibrary(); err == nil {
			snap.lib = lib
		}
		if snap.err != nil {
			snap.err = fmt.Errorf("%v", snap.err)
		}
		a.update(func() {
			if a.dataGen.Load() != gen {
				return
			}
			a.lib = snap.lib
			a.items = snap.items
			a.trash = snap.trash
			a.folders = snap.folders
			for i := range snap.folders {
				id := snap.folders[i].ID
				if _, ok := a.expanded[id]; !ok {
					a.expanded[id] = true
				}
			}
			a.tags = snap.tags
			a.trashCount = snap.count
			a.countVirtuals()
			a.loadErr = ""
			a.loading = false
			a.visibleSet = false
			a.normalizeSelection()
			a.host.invalidateAll()
			a.maybeOpenSetup()
		})
	}()
}

// refreshItems reloads just the item lists, for search and sort changes.
func (a *App) refreshItems() {
	gen := a.dataGen.Add(1)
	q, asc := a.query, a.sortAsc
	a.loading = true
	go func() {
		sortOrder := "desc"
		if asc {
			sortOrder = "asc"
		}
		items, err := a.svc.GetItems(q, sortOrder)
		trash, _ := a.svc.GetTrashItems(q, sortOrder)
		a.update(func() {
			if a.dataGen.Load() != gen {
				return
			}
			if err != nil {
				a.loadErr = err.Error()
			}
			a.items = items
			a.trash = trash
			a.countVirtuals()
			a.loading = false
			a.visibleSet = false
			a.normalizeSelection()
			a.host.invalidateAll()
		})
	}()
}

type dataSnapshot struct {
	items, trash []core.Item
	folders      []core.Folder
	tags         []core.Tag
	count        int
	lib          *core.LibraryInfo
	err          error
}

func (a *App) countVirtuals() {
	untagged, uncategorized := 0, 0
	for i := range a.items {
		if len(a.items[i].Tags) == 0 {
			untagged++
		}
		if len(a.items[i].Folders) == 0 {
			uncategorized++
		}
	}
	a.untaggedCount, a.uncategorizedCount = untagged, uncategorized
}

func (a *App) maybeOpenSetup() {
	if a.lib == nil {
		if err := a.svc.OpenSetupWindow(); err != nil {
			log.Printf("[NativeUI] open setup: %v", err)
		}
	}
}

// visibleItems returns the filtered collection, recomputing only when the
// filters, query, sort or data changed.
func (a *App) visibleItems() []core.Item {
	if a.visibleSet {
		return a.visible
	}
	a.visible = a.computeVisible()
	a.visibleSet = true
	a.normalizeSelection()
	return a.visible
}

func (a *App) computeVisible() []core.Item {
	src := a.items
	switch a.view {
	case viewTrash:
		src = a.trash
	case viewUntagged:
		src = filterItems(a.items, func(it core.Item) bool { return len(it.Tags) == 0 })
	case viewUncategorized:
		src = filterItems(a.items, func(it core.Item) bool { return len(it.Folders) == 0 })
	}
	q := strings.ToLower(strings.TrimSpace(a.query))
	out := make([]core.Item, 0, len(src))
	for _, it := range src {
		if a.view == viewAll && a.folderID != "" && !contains(it.Folders, a.folderID) {
			continue
		}
		if a.tagFilter != "" && !contains(it.Tags, a.tagFilter) {
			continue
		}
		if !a.matchesQuery(it, q) {
			continue
		}
		if a.category != "" && a.category != "all" && fileCategory(it.Extension, it.MimeType) != a.category {
			continue
		}
		if a.colorFilter != "" && !itemMatchesColor(it.DominantColor, it.Palette, a.colorFilter) {
			continue
		}
		if a.filterFolder != "" {
			if a.filterFolder == "__uncategorized__" {
				if len(it.Folders) > 0 {
					continue
				}
			} else if !contains(it.Folders, a.filterFolder) {
				continue
			}
		}
		if a.orientation != "" && a.orientation != "all" {
			meta := ""
			if it.Meta != nil {
				meta = it.Meta.Orientation
			}
			if itemOrientation(it.Width, it.Height, meta) != a.orientation {
				continue
			}
		}
		if a.sizeFilter != "" && a.sizeFilter != "all" {
			const mb = int64(1 << 20)
			switch a.sizeFilter {
			case "small":
				if it.Size >= mb {
					continue
				}
			case "medium":
				if it.Size < mb || it.Size > 10*mb {
					continue
				}
			case "large":
				if it.Size <= 10*mb {
					continue
				}
			}
		}
		if a.hasURL != "" && a.hasURL != "all" {
			has := strings.TrimSpace(it.URL) != ""
			if (a.hasURL == "has") != has {
				continue
			}
		}
		if a.hasNote != "" && a.hasNote != "all" {
			has := strings.TrimSpace(it.Note) != ""
			if (a.hasNote == "has") != has {
				continue
			}
		}
		if a.ratingFilter >= 0 && it.Rating != a.ratingFilter {
			continue
		}
		out = append(out, it)
	}
	return out
}

func (a *App) matchesQuery(it core.Item, q string) bool {
	if q == "" {
		return true
	}
	fields := []string{it.Name, it.Extension, it.Hex, it.Note, it.Prompt}
	for _, f := range fields {
		if strings.Contains(strings.ToLower(f), q) {
			return true
		}
	}
	for _, t := range it.Tags {
		if strings.Contains(strings.ToLower(t), q) {
			return true
		}
	}
	return false
}

func filterItems(in []core.Item, keep func(core.Item) bool) []core.Item {
	out := make([]core.Item, 0, len(in))
	for _, it := range in {
		if keep(it) {
			out = append(out, it)
		}
	}
	return out
}

func contains(list []string, want string) bool {
	for _, s := range list {
		if s == want {
			return true
		}
	}
	return false
}

// normalizeSelection keeps the GridView cursor and the stable selected ID in
// step after the visible collection changes.
func (a *App) normalizeSelection() {
	vis := a.visible
	if !a.visibleSet {
		return
	}
	if a.selectedID != "" {
		for i := range vis {
			if vis[i].ID == a.selectedID {
				a.selectedIndex = i
				return
			}
		}
	}
	if a.selectedIndex >= 0 && a.selectedIndex < len(vis) {
		a.selectedID = vis[a.selectedIndex].ID
		return
	}
	a.selectedIndex = -1
	a.selectedID = ""
	a.selection.Clear()
}

func (a *App) activeItem() *core.Item {
	vis := a.visibleItems()
	if a.selectedIndex >= 0 && a.selectedIndex < len(vis) {
		return &vis[a.selectedIndex]
	}
	return nil
}

func (a *App) selectedItems() []core.Item {
	vis := a.visibleItems()
	if a.selection.Len() == 0 {
		if it := a.activeItem(); it != nil {
			return []core.Item{*it}
		}
		return nil
	}
	out := make([]core.Item, 0, a.selection.Len())
	for i := range vis {
		if a.selection.Has(vis[i].ID) {
			out = append(out, vis[i])
		}
	}
	return out
}

func (a *App) currentFolder() *core.Folder {
	if a.folderID == "" {
		return nil
	}
	var find func([]core.Folder) *core.Folder
	find = func(list []core.Folder) *core.Folder {
		for i := range list {
			if list[i].ID == a.folderID {
				return &list[i]
			}
			if f := find(list[i].Children); f != nil {
				return f
			}
		}
		return nil
	}
	return find(a.folders)
}

func (a *App) currentFolderID() string {
	if a.view != viewAll {
		return ""
	}
	return a.folderID
}

// syncEditor loads the inspector drafts when the active item changes.
func (a *App) syncEditor(it *core.Item) {
	if it == nil {
		a.editorItemID = ""
		return
	}
	if a.editorItemID == it.ID {
		return
	}
	a.editorItemID = it.ID
	a.draftName = it.Name
	a.draftNote = it.Note
	a.draftURL = it.URL
	a.draftPrompt = it.Prompt
	a.draftRating = it.Rating
	a.draftTags = append([]string(nil), it.Tags...)
	a.editorDirty = false
}

func (a *App) setStatus(format string, args ...any) {
	a.toast(fmt.Sprintf(format, args...))
}

// libraryName is the window/sidebar title of the active library.
func (a *App) libraryName() string {
	if a.lib != nil && a.lib.Name != "" {
		return a.lib.Name
	}
	return "Bowerbird"
}

func (a *App) rowsVisible() int { return len(a.visibleItems()) }

func (a *App) totalSize() int64 {
	vis := a.visibleItems()
	var n int64
	for i := range vis {
		n += vis[i].Size
	}
	return n
}

func (a *App) topColors() []string {
	vis := a.visibleItems()
	seen := map[string]bool{}
	var out []string
	for i := range vis {
		if len(out) >= 12 || i >= 1500 {
			break
		}
		c := vis[i].DominantColor
		if c != "" && !seen[c] {
			seen[c] = true
			out = append(out, c)
		}
	}
	return out
}

func (a *App) folderChoices() []string {
	rows := flattenFolderTree(a.folders)
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.Folder.Name)
	}
	return out
}

func (a *App) tagNames() []string {
	out := make([]string, 0, len(a.tags))
	for _, t := range a.tags {
		out = append(out, t.Name)
	}
	return out
}

// markDirty is called after a filter or query change.
func (a *App) markDirty() {
	a.visibleSet = false
	a.normalizeSelection()
}

func (a *App) recordFirstFrame(c *ui.Context) {
	a.perfOnce.Do(func() {
		a.firstFrame = time.Now()
		d := a.firstFrame.Sub(a.startedAt)
		a.perfMetrics = fmt.Sprintf("startup-first-frame=%s", formatDuration(d))
		log.Printf("[NativePerf] %s", a.perfMetrics)
		if path := os.Getenv("BOWERBIRD_NATIVE_METRICS"); path != "" {
			_ = os.WriteFile(path, []byte(a.perfMetrics+"\n"), 0o644)
		}
	})
}

// processStart is set by the native entry point before the app starts.
var processStart = time.Now()

// SetProcessStart lets the entry point record its own start time.
func SetProcessStart(t time.Time) { processStart = t }

func (a *App) dataDir() string {
	if a.mgr != nil {
		return core.UserDataDir()
	}
	return ""
}

func (a *App) itemPath(it *core.Item) string {
	if it.FilePath != "" {
		return it.FilePath
	}
	if it.ItemPath != "" {
		return filepath.Join(it.ItemPath, it.Filename)
	}
	if a.lib != nil {
		return filepath.Join(a.lib.Path, "items", it.ID, it.Filename)
	}
	return ""
}
