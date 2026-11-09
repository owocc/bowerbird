// Package app contains Bowerbird's native window state and views. It replaces
// the former React/Vite frontend: every screen is built from Go with mygo/ui,
// and the core service is called directly on the main thread.
//
// The rule that keeps the UI predictable: app state is only written on the main
// thread. Background work (queries, imports, thumbnail decoding) returns through
// App.post, which hops to the window's Update queue and redraws one frame.
package app

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"bowerbird/core"
	"bowerbird/internal/i18n"
	"bowerbird/internal/player"
	"bowerbird/internal/plugin"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

// Nav identifies the active workspace scope.
type Nav string

const (
	NavAll           Nav = "all"
	NavUntagged      Nav = "untagged"
	NavUncategorized Nav = "uncategorized"
	NavTags          Nav = "tags"
	NavTrash         Nav = "trash"
	NavFolder        Nav = "folder"
	NavSettings      Nav = "settings"
	NavLogs          Nav = "logs"
	NavSetup         Nav = "setup"
)

// Filters carries the non-text query facets the toolbar edits.
type Filters struct {
	Types        []string
	Colors       []string
	Folders      []string
	Ratings      []int
	Orientations []string
	Sizes        []string
	Has          []string
	No           []string
	Unrated      bool
}

// Prefs are the native-only appearance preferences that used to live in
// localStorage.
type Prefs struct {
	BackdropMode    string   `json:"backdropMode"`
	BackdropSolid   string   `json:"backdropSolid"`
	BackdropSeed    int      `json:"backdropSeed"`
	InspectorOpen   bool     `json:"inspectorOpen"`
	SidebarOpen     bool     `json:"sidebarOpen"`
	ShowNames       bool     `json:"showNames"`
	ShowExt         bool     `json:"showExt"`
	LayoutMode      string   `json:"layoutMode"`
	SortOrder       string   `json:"sortOrder"`
	RowHeight       float64  `json:"rowHeight"`
	IncludeSubs     bool     `json:"includeSubfolders"`
	PinnedFilters   []string `json:"pinnedFilters"`
	LibraryOrder    []string `json:"libraryOrder,omitempty"`
	RecordImportURL bool     `json:"recordImportUrl"`
}

func defaultPrefs() Prefs {
	return Prefs{
		BackdropMode:    "default",
		BackdropSolid:   "#141416",
		InspectorOpen:   true,
		SidebarOpen:     true,
		ShowNames:       true,
		ShowExt:         true,
		LayoutMode:      "justified",
		SortOrder:       "desc",
		RowHeight:       190,
		PinnedFilters:   append([]string(nil), defaultPinnedFilterCriteria...),
		RecordImportURL: true,
	}
}

// historyEntry is one back/forward stop. Navigation and search are recorded
// together so returning to a search restores what was on screen.
type historyEntry struct {
	Nav        Nav
	FolderID   string
	Query      string
	Filters    Filters
	SortOrder  string
	SelectedID string
}

// App owns the state every native window shows.
type App struct {
	svc   *core.Service
	trans *i18n.Bundle
	prefs Prefs

	// Windows are set once by the host and only touched on the main thread.
	win         *mygo.Window
	settingsWin *mygo.Window
	logsWin     *mygo.Window
	setupWin    *mygo.Window

	// Library and workspace.
	library *core.LibraryInfo
	recent  []core.LibraryRef

	// Library picker state.
	libraryPickerOpen bool
	librarySearch     string
	librarySearchBox  ui.Handle
	libraryList       ui.ListState

	folders             []core.Folder
	folderPreviews      map[string]core.FolderPreview
	subfoldersCollapsed bool
	tags                []core.Tag
	stats               core.WorkspaceStats
	trashCount          int
	nav                 Nav
	folderID            string
	expanded            map[string]bool
	query               string
	filters             Filters
	sortOrder           string
	items               []core.Item
	total               int
	totalSize           int64
	loading             bool
	loadSeq             uint64
	history             []historyEntry
	historyAt           int

	// Selection and the active item.
	selected        map[string]bool
	selectedOrder   []string
	selectedAt      int
	selectedAnchor  int
	activeItemID    string
	activeItem      *core.Item
	lastClickID     string
	lastClickTime   time.Time
	detailSeq       uint64
	inspectSections []plugin.InspectSection
	inspectSeq      uint64

	// Gallery layout.
	rows          [][]galleryCell
	rowHeight     int
	galleryList   ui.ListState
	galleryScroll ui.ScrollState
	scrollTop     float32

	// Gallery rubber-band selection.
	marqueeActive   bool
	marqueeStartX   float32
	marqueeStartY   float32
	marqueeCurX     float32
	marqueeCurY     float32
	marqueeBase     map[string]bool
	marqueeAdditive bool
	// Inputs and popover state.
	searchBox   ui.Handle
	renameBox   ui.Handle
	renameValue string
	ratingDraft int
	noteDraft   string
	promptDraft string
	urlDraft    string
	promptOpen  bool
	notesOpen   bool
	tagInput    string
	tagSearch   string
	tagSort     string
	tagFocus    ui.Handle
	searchAt    time.Time
	folderName  string
	dialog      dialogKind
	dialogValue string
	dialogError string
	menuOpen    bool

	// Preview and playback.
	previewOpen    bool
	previewMode    string // "inline" (double click) or "full" (space key)
	previewIndex   int
	previewZoom    float32
	previewPan     ui.Point
	previewDragged bool
	previewPanning bool
	previewLastX   float32
	previewLastY   float32
	previewText    string
	previewBitmap  *ui.Bitmap
	psdInfo        *core.PSDInfo
	previewError   string
	player         *player.Player
	video          *player.VideoPlayer
	videoErr       string
	videoScrub     float64
	videoSeq       uint64
	previewSeq     uint64

	// Settings values.
	themeValue    string
	languageValue string
	vibrancyValue bool
	network       core.NetworkSettings
	shortcuts     core.ShortcutSettings
	mobile        *core.MobileServerStatus
	mobileDevices []core.MobileDeviceInfo
	settingsDirty bool

	// Settings.
	settingsSection int
	settingsScroll  ui.ScrollState
	settingsGroups  []settingsGroup
	logsFilter      string
	logsLevel       string
	logsAutoScroll  bool
	logs            []core.LogEntry
	logsList        ui.ListState

	// Plugins.
	plugins        []installedPluginRow
	pluginHost     *plugin.Host
	pendingInstall *core.PluginInstallRequest

	// Thumbnails.
	thumbs    *thumbCache
	thumbJobs *thumbJobQueue

	// backdropMode is the resolved background mode used by the painter.
	backdropMode string

	// Toast feedback.
	toast      string
	toastUntil time.Time

	// Drop target. The host reports where a native drop landed; the sidebar
	// sets this while the pointer is over a folder row.
	dropFolderID string

	saveMu sync.Mutex
	start  time.Time

	// quit and tray callbacks are installed by the desktop entry point.
	OnQuit           func()
	OnFocusMain      func()
	OnAbout          func()
	OnOpenSettings   func()
	OnOpenLogs       func()
	OnCapture        func(string)
	OnSecondInstance func()
	OnReady          func()
	OnProtocol       func(string)
	OnWriteFiles     func([]string) error
}

type galleryCell struct {
	index        int
	width        int
	height       int
	folderID     string
	folderHeader bool
}

type dialogKind int

const (
	dialogNone dialogKind = iota
	dialogNewLibrary
	dialogNewFolder
	dialogRenameFolder
	dialogDeleteFolder
	dialogPluginInstall
	dialogPrompt
	dialogTag
)

type settingsGroup struct {
	key    string
	fields []settingsField
}

type settingsField struct {
	key   string
	label string
	value string
}

type installedPluginRow struct {
	ID           string
	Name         string
	Version      string
	Kind         string
	Enabled      bool
	Native       string
	Builtin      bool
	Hosted       bool
	CanUninstall bool
}

// New creates the app state. The service may be nil while the desktop entry
// point is still constructing the library manager.
func New(svc *core.Service) *App {
	a := &App{
		svc:            svc,
		trans:          i18n.New("system"),
		prefs:          defaultPrefs(),
		nav:            NavAll,
		expanded:       map[string]bool{},
		selected:       map[string]bool{},
		selectedAt:     -1,
		selectedAnchor: -1,
		sortOrder:      "desc",
		rowHeight:      190,
		thumbs:         newThumbCache(),
		thumbJobs:      newThumbJobQueue(),
		logsAutoScroll: true,
		logsLevel:      "all",
		start:          time.Now(),
	}
	a.loadPrefs()
	a.pluginHost = plugin.NewHost(filepath.Join(core.UserDataDir(), "plugins"))
	if cwd, err := os.Getwd(); err == nil {
		a.pluginHost.SetLocalDirs(filepath.Join(cwd, "plugins"))
	}
	// Native official plugins are compiled into the host. Repository/local
	// copies under plugins/ override them with richer marketplace metadata.
	a.pluginHost.RegisterBuiltin(plugin.OfficialManifests()...)
	a.syncPluginHTTPClient()
	return a
}

// Service returns the core service.
func (a *App) Service() *core.Service { return a.svc }

// Translator returns the active dictionary (used by the menu and tray).
func (a *App) Translator() *i18n.Bundle { return a.trans }

// Prefs returns a copy of the appearance preferences.
func (a *App) Prefs() Prefs { return a.prefs }

func (a *App) inspectorVisible() bool {
	return a.prefs.InspectorOpen && a.library != nil
}

func (a *App) t(key string) string { return a.trans.T(key) }

func (a *App) tf(key string, args map[string]any) string { return a.trans.Tf(key, args) }

// SetMainWindow gives the app its main window. The content of every native
// window is built by this package.
func (a *App) SetMainWindow(w *mygo.Window) {
	a.win = w
	if w != nil {
		w.OnResize(func() {
			a.rebuildRows()
			w.Invalidate()
		})
	}
	a.refreshAll()
}
func (a *App) SetSettingsWindow(w *mygo.Window) { a.settingsWin = w; a.refreshSettings() }
func (a *App) SetLogsWindow(w *mygo.Window)     { a.logsWin = w; a.refreshLogs() }
func (a *App) SetSetupWindow(w *mygo.Window)    { a.setupWin = w }

// content wraps a view so a panic is logged and the window keeps painting
// rather than falling back to an unexplained black frame.
func content(name string, view func(*ui.Context)) *ui.Content {
	return ui.View(func(c *ui.Context) {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[NativeUI] %s view panic: %v", name, r)
			}
		}()
		view(c)
	})
}

// MainContent is the mygo content for the main window.
func (a *App) MainContent() *ui.Content { return content("main", a.viewMain) }

// SettingsContent is the mygo content for the settings window.
func (a *App) SettingsContent() *ui.Content { return content("settings", a.viewSettings) }

// LogsContent is the mygo content for the logs window.
func (a *App) LogsContent() *ui.Content { return content("logs", a.viewLogs) }

// SetupContent is the mygo content for the first-run library setup window.
func (a *App) SetupContent() *ui.Content { return content("setup", a.viewSetup) }

// post runs fn on the main thread and redraws the main window. Calls from the
// main thread may run inline; background calls go through Window.Update.
func (a *App) post(fn func()) {
	if fn == nil {
		return
	}
	if a.win != nil {
		a.win.Update(fn)
		return
	}
	mygo.RunOnMain(fn)
}

func (a *App) postSettings(fn func()) {
	if fn == nil {
		return
	}
	if a.settingsWin != nil {
		a.settingsWin.Update(fn)
		return
	}
	a.post(fn)
}

func (a *App) postLogs(fn func()) {
	if a.logsWin != nil {
		a.logsWin.Update(fn)
	} else {
		a.post(fn)
	}
}

// Notify is called by the host for window OnShow. It starts a refresh when the
// window was hidden long enough to release its thumbnails.
func (a *App) Notify(show bool) {
	if show {
		a.thumbs.restore()
		a.refreshAll()
		return
	}
	a.thumbs.trim(0)
	if a.player != nil {
		a.player.Stop()
		a.player = nil
	}
	a.closeVideo()
	runtime.GC()
	// debug.FreeOSMemory is intentionally not called on every hide: the native
	// app keeps a small Go heap and the OS reclaims textures with the window.
}

// HandleEvent reacts to core events. The host calls it on any thread; the state
// changes hop to the main thread.
func (a *App) HandleEvent(name string, payload any) {
	switch name {
	case core.LibraryOpenedEvent, core.LibraryClosedEvent:
		a.post(func() { a.refreshAll() })
	case core.ThemeChangedEvent:
		if s, ok := payload.(string); ok {
			a.post(func() { a.trans.SetLanguage(a.currentLanguage()); _ = s; a.refreshAll() })
		}
	case core.LanguageChangedEvent:
		a.post(func() { a.trans.SetLanguage(a.currentLanguage()); a.refreshAll() })
	case core.VibrancyChangedEvent, core.LightweightModeChangedEvent:
		a.post(func() { a.refreshAll() })
	case core.NetworkSettingsChangedEvent:
		a.syncPluginHTTPClient()
	case core.LogEntryEvent:
		if entry, ok := payload.(core.LogEntry); ok {
			a.postLogs(func() { a.appendLog(entry) })
		}
	case core.LogsClearedEvent:
		a.postLogs(func() { a.logs = nil })
	case "import-completed":
		// Native drops and other import entry points return before their
		// background work finishes, so refresh once the pipeline reports the
		// committed items. Without this the gallery only updates after the
		// library is reopened.
		a.post(func() { a.refreshAll() })
	case "import-error":
		if message, ok := payload.(string); ok {
			a.post(func() {
				a.showToast(message)
				a.refreshAll()
			})
		} else {
			a.post(func() { a.refreshAll() })
		}
	case "plugin:install-requested":
		a.post(func() {
			if a.svc != nil {
				a.pendingInstall = a.svc.GetPendingPluginInstall()
			}
			a.dialog = dialogPluginInstall
		})
	case core.ShortcutsChangedEvent:
		a.post(func() { a.refreshSettings() })
	}
}

func (a *App) currentLanguage() string {
	if a.svc == nil {
		return "system"
	}
	lang := a.svc.GetLanguage()
	if lang == "" {
		return "system"
	}
	return lang
}

// refreshAll reloads the library-wide data and the current page.
func (a *App) refreshAll() {
	if a.svc == nil {
		return
	}
	a.loading = true
	a.loadSeq++
	seq := a.loadSeq
	previewNav, previewFolder := a.nav, a.folderID
	previewSort, previewIncludeSubs := a.sortOrder, a.prefs.IncludeSubs
	go func() {
		lib, _ := a.svc.GetActiveLibrary()
		folders, _ := a.svc.GetFolders()
		tags, _ := a.svc.GetTags()
		statsPtr, _ := a.svc.GetWorkspaceStats(a.sortOrder)
		stats := core.WorkspaceStats{}
		if statsPtr != nil {
			stats = *statsPtr
		}
		trash, _ := a.svc.GetTrashCount()
		recent := a.svc.GetRecentLibraryRefs()
		plugins, _ := a.svc.ListInstalledPlugins()
		var logs []core.LogEntry
		if a.svc != nil {
			logs = a.svc.GetLogs()
		}
		var folderPreviews map[string]core.FolderPreview
		if previewNav == NavFolder && previewFolder != "" {
			children := childFolders(folders, previewFolder)
			if len(children) > 0 {
				groups := make([][]string, len(children))
				for i, child := range children {
					groups[i] = folderGroupIDs(folders, child.ID, previewIncludeSubs)
				}
				if previews, previewErr := a.svc.GetFolderPreviews(groups, previewSort); previewErr == nil {
					folderPreviews = make(map[string]core.FolderPreview, len(children))
					for i, child := range children {
						if i < len(previews) {
							folderPreviews[child.ID] = previews[i]
						}
					}
				}
			}
		}
		items, total, totalSize, active, err := a.fetchItems()
		a.post(func() {
			if seq != a.loadSeq {
				return
			}
			libChanged := (a.library == nil) != (lib == nil) ||
				(a.library != nil && lib != nil && a.library.ID != lib.ID)
			if libChanged {
				a.clearWorkspaceSelection()
			}
			a.library = lib
			a.folders = folders
			a.folderPreviews = folderPreviews
			a.tags = tags
			a.stats = stats
			a.trashCount = trash
			a.recent = recent
			a.items = items
			a.total = total
			a.totalSize = totalSize
			a.loading = false
			if active != nil && !libChanged {
				a.activeItem = active
			}
			a.plugins = a.pluginRows(plugins)
			if len(logs) > 0 {
				a.logs = logs
			}
			a.rebuildRows()
			a.recordHistory()
			// Entering a page wakes the thumbnail lifecycle for visible items
			// that the import pipeline could not decode (video/PSD/plugin
			// formats). It is idempotent and limited to two workers.
			a.backfillMissingThumbnails(a.items)
			if err != nil {
				a.showToast(err.Error())
			}
		})
	}()
}

func (a *App) pluginRows(list []core.InstalledPlugin) []installedPluginRow {
	rows := make([]installedPluginRow, 0, len(list)+6)
	seen := map[string]bool{}
	if a.pluginHost != nil {
		for _, p := range a.pluginHost.Plugins() {
			seen[p.Manifest.ID] = true
			rows = append(rows, installedPluginRow{
				ID:           p.Manifest.ID,
				Name:         p.Manifest.Name,
				Version:      p.Manifest.Version,
				Kind:         p.Manifest.Kind,
				Enabled:      p.Enabled,
				Native:       p.Manifest.Native,
				Builtin:      p.Manifest.Builtin,
				Hosted:       true,
				CanUninstall: a.pluginHost.CanUninstall(p.Manifest.ID),
			})
		}
	}
	// Legacy WebView plugins installed through the old marketplace are still
	// listed so users can see and disable them while they migrate.
	for _, p := range list {
		if seen[p.ID] {
			continue
		}
		rows = append(rows, installedPluginRow{ID: p.ID, Name: p.Name, Version: p.Version, Kind: p.Kind, Enabled: p.Enabled, CanUninstall: true})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Builtin != rows[j].Builtin {
			return rows[i].Builtin
		}
		return rows[i].ID < rows[j].ID
	})
	return rows
}

// nativeFeature reports whether the enabled official plugin that owns a native
// renderer exists. Disabling a built-in plugin therefore really removes its
// preview/metadata surface instead of only changing a badge.
func (a *App) nativeFeature(id string) bool {
	return a.pluginHost == nil || a.pluginHost.IsEnabled(id)
}

func (a *App) showToast(message string) {
	a.toast = message
	a.toastUntil = time.Now().Add(3 * time.Second)
	if a.win != nil {
		a.win.Invalidate()
	}
}

// fetchItems reads every matching page. QueryWorkspace caps a page at 500, so
// the gallery loops until it has the full filtered set or a safety bound.
func (a *App) fetchItems() ([]core.Item, int, int64, *core.Item, error) {
	if a.svc == nil {
		return nil, 0, 0, nil, nil
	}
	if a.nav == NavTags && a.folderID == "" && a.query == "" && len(a.filters.Types) == 0 {
		// The Tags page lists all items in the library.
	}
	query := a.queryString()
	scope := a.folderScope()
	onlyUnrated := a.nav == NavUntagged || a.filters.Unrated
	if a.nav == NavTrash {
		items, err := a.svc.GetTrashItems(query, a.sortOrder)
		return items, len(items), 0, nil, err
	}
	const pageSize = 500
	var all []core.Item
	offset := 0
	total := 0
	totalSize := int64(0)
	for {
		page, err := a.svc.QueryWorkspace(query, a.sortOrder, offset, pageSize, scope, onlyUnrated)
		if err != nil {
			return all, total, totalSize, nil, err
		}
		if page == nil {
			break
		}
		total = page.Total
		totalSize = page.TotalSize
		all = append(all, page.Items...)
		offset += len(page.Items)
		if len(page.Items) == 0 || offset >= page.Total {
			break
		}
	}
	var active *core.Item
	if a.activeItemID != "" {
		if it, err := a.svc.GetItem(a.activeItemID); err == nil {
			active = it
		}
	}
	return all, total, totalSize, active, nil
}

func (a *App) queryString() string {
	parts := []string{}
	if s := strings.TrimSpace(a.query); s != "" {
		parts = append(parts, s)
	}
	for _, t := range a.filters.Types {
		parts = append(parts, "type:"+t)
	}
	for _, c := range a.filters.Colors {
		parts = append(parts, "color:"+c)
	}
	for _, f := range a.filters.Folders {
		parts = append(parts, "folder:"+f)
	}
	for _, r := range a.filters.Ratings {
		parts = append(parts, fmt.Sprintf("rating:%d", r))
	}
	for _, o := range a.filters.Orientations {
		parts = append(parts, "orientation:"+o)
	}
	for _, s := range a.filters.Sizes {
		parts = append(parts, "size:"+s)
	}
	for _, h := range a.filters.Has {
		parts = append(parts, "has:"+h)
	}
	for _, n := range a.filters.No {
		parts = append(parts, "no:"+n)
	}
	return strings.Join(parts, " ")
}

func (a *App) folderScope() []string {
	if a.nav != NavFolder || a.folderID == "" {
		return nil
	}
	return folderGroupIDs(a.folders, a.folderID, a.prefs.IncludeSubs)
}

// flattenFolders returns a folder tree's roots and all descendants in
// depth-first order.
func flattenFolders(folders []core.Folder) []core.Folder {
	out := make([]core.Folder, 0, len(folders))
	var walk func([]core.Folder)
	walk = func(list []core.Folder) {
		for _, f := range list {
			out = append(out, f)
			walk(f.Children)
		}
	}
	walk(folders)
	return out
}

func childFolders(folders []core.Folder, parentID string) []core.Folder {
	all := flattenFolders(folders)
	out := make([]core.Folder, 0, len(all))
	for _, f := range all {
		if f.ParentID == parentID {
			out = append(out, f)
		}
	}
	return out
}

func findFolder(folders []core.Folder, id string) (core.Folder, bool) {
	for _, f := range flattenFolders(folders) {
		if f.ID == id {
			return f, true
		}
	}
	return core.Folder{}, false
}

// folderGroupIDs returns a folder and, when includeSubs is set, all of its
// descendants, for scoped queries and folder-card previews.
func folderGroupIDs(folders []core.Folder, rootID string, includeSubs bool) []string {
	if rootID == "" {
		return nil
	}
	if !includeSubs {
		return []string{rootID}
	}
	all := flattenFolders(folders)
	out := []string{rootID}
	seen := map[string]bool{rootID: true}
	for progress := true; progress; {
		progress = false
		for _, f := range all {
			if seen[f.ParentID] && !seen[f.ID] {
				seen[f.ID] = true
				out = append(out, f.ID)
				progress = true
			}
		}
	}
	return out
}

func contains(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

// clearWorkspaceSelection forgets the selected and active item. It runs when
// the active library changes so the inspector can never keep showing an item
// from the previous library.
func (a *App) clearWorkspaceSelection() {
	a.selected = map[string]bool{}
	a.selectedOrder = nil
	a.selectedAt = -1
	a.selectedAnchor = -1
	a.activeItemID = ""
	a.activeItem = nil
	a.renameValue = ""
	a.ratingDraft = 0
	a.noteDraft = ""
	a.promptDraft = ""
	a.urlDraft = ""
	a.inspectSections = nil
	a.detailSeq++
	a.inspectSeq++
	a.closePreview()
}

// navigate switches the workspace scope and reloads.
func (a *App) navigate(nav Nav, folderID string) {
	if nav == NavFolder && folderID == "" {
		return
	}
	a.nav = nav
	a.folderID = folderID
	a.selected = map[string]bool{}
	a.selectedAt = -1
	a.activeItemID = ""
	a.activeItem = nil
	a.previewOpen = false
	a.refreshAll()
}

func (a *App) recordHistory() {
	entry := historyEntry{Nav: a.nav, FolderID: a.folderID, Query: a.query, Filters: cloneFilters(a.filters), SortOrder: a.sortOrder, SelectedID: a.activeItemID}
	if len(a.history) > 0 && a.historyAt < len(a.history) {
		a.history = a.history[:a.historyAt+1]
	}
	if len(a.history) > 0 {
		last := a.history[len(a.history)-1]
		if last.Nav == entry.Nav && last.FolderID == entry.FolderID && last.Query == entry.Query && filtersEqual(last.Filters, entry.Filters) {
			return
		}
	}
	a.history = append(a.history, entry)
	if len(a.history) > 100 {
		a.history = a.history[len(a.history)-100:]
	}
	a.historyAt = len(a.history) - 1
}

func cloneFilters(f Filters) Filters {
	return Filters{
		Types:        append([]string(nil), f.Types...),
		Colors:       append([]string(nil), f.Colors...),
		Folders:      append([]string(nil), f.Folders...),
		Ratings:      append([]int(nil), f.Ratings...),
		Orientations: append([]string(nil), f.Orientations...),
		Sizes:        append([]string(nil), f.Sizes...),
		Has:          append([]string(nil), f.Has...),
		No:           append([]string(nil), f.No...),
		Unrated:      f.Unrated,
	}
}

func filtersEqual(a, b Filters) bool {
	return fmt.Sprint(a) == fmt.Sprint(b)
}

func (a *App) goHistory(delta int) {
	if len(a.history) == 0 {
		return
	}
	at := a.historyAt + delta
	if at < 0 || at >= len(a.history) {
		return
	}
	a.historyAt = at
	h := a.history[at]
	a.nav = h.Nav
	a.folderID = h.FolderID
	a.query = h.Query
	a.filters = cloneFilters(h.Filters)
	a.sortOrder = h.SortOrder
	if h.SelectedID != "" {
		a.activeItemID = h.SelectedID
	}
	a.refreshAll()
}

// rebuildRows computes the justified (bucketed) layout. The row height is the
// user's zoom level; each row takes the widest set of items whose natural
// widths fill the content width.
func (a *App) rebuildRows() {
	a.rows = nil
	width := 900
	if a.win != nil {
		if w, _ := a.win.ContentSize(); w > 0 {
			width = w
		}
	}
	// Remove chrome: sidebar, inspector and padding.
	width -= 24
	if a.prefs.SidebarOpen {
		width -= sidebarWidth
	}
	if a.inspectorVisible() {
		width -= inspectorWidth
	}
	if width < 240 {
		width = 240
	}
	a.rows = a.folderSectionRows(width)
	if len(a.items) == 0 {
		return
	}
	target := a.rowHeight
	if target < 90 {
		target = 90
	}
	if target > 420 {
		target = 420
	}

	mode := a.prefs.LayoutMode
	if mode == "" {
		mode = "justified"
	}

	gap := 8
	switch mode {
	case "list":
		rowH := int(float32(target) * 0.32)
		if rowH < 44 {
			rowH = 44
		}
		if rowH > 72 {
			rowH = 72
		}
		for i := range a.items {
			a.rows = append(a.rows, []galleryCell{{index: i, width: width, height: rowH}})
		}
	case "grid":
		targetColW := int(float32(target) * 1.35)
		if targetColW < 80 {
			targetColW = 80
		}
		numCols := (width + gap) / (targetColW + gap)
		if numCols < 1 {
			numCols = 1
		}
		colW := (width - (numCols-1)*gap) / numCols
		if colW < 48 {
			colW = 48
		}
		cellH := colW
		if a.prefs.ShowNames {
			cellH += 22
		}
		var row []galleryCell
		for i := range a.items {
			row = append(row, galleryCell{index: i, width: colW, height: cellH})
			if len(row) == numCols {
				a.rows = append(a.rows, row)
				row = nil
			}
		}
		if len(row) > 0 {
			a.rows = append(a.rows, row)
		}
	default: // "justified", "waterfall" fallback to justified bucket
		// Port of web version JustifiedLayout:
		// Each row collects items until projected row height <= target * 1.25.
		// Then the row is committed with exact pixel filling (distributing rounding diffs).
		// The last row is justified only if projected height <= target * 1.35; otherwise uses natural widths.
		n := len(a.items)
		itemRatios := make([]float64, n)
		for i, item := range a.items {
			w, h := item.Width, item.Height
			if w <= 0 || h <= 0 {
				w, h = 4, 3
			}
			ratio := float64(w) / float64(h)
			if ratio < 0.2 {
				ratio = 0.2
			}
			if ratio > 5.0 {
				ratio = 5.0
			}
			itemRatios[i] = ratio
		}

		maxRowHeightCap := int(float64(target) * 1.35)
		captionH := 0
		if a.prefs.ShowNames {
			captionH = 20
		}

		commitJustifiedRow := func(startIdx, rowLen int, currentRatiosSum float64, fillWidth bool) {
			if rowLen <= 0 || currentRatiosSum <= 0 {
				return
			}
			gapsTotal := (rowLen - 1) * gap
			availableWidth := width - gapsTotal
			if availableWidth < 50 {
				availableWidth = 50
			}

			projectedThumbHeight := float64(availableWidth) / currentRatiosSum
			finalThumbHeight := target
			if fillWidth {
				finalThumbHeight = int(projectedThumbHeight + 0.5)
				if finalThumbHeight < 40 {
					finalThumbHeight = 40
				}
				if finalThumbHeight > maxRowHeightCap {
					finalThumbHeight = maxRowHeightCap
				}
			}

			rowCells := make([]galleryCell, rowLen)
			currentTotalW := 0
			for c := range rowLen {
				idx := startIdx + c
				w := int(float64(finalThumbHeight)*itemRatios[idx] + 0.5)
				if w < 24 {
					w = 24
				}
				rowCells[c] = galleryCell{
					index:  idx,
					width:  w,
					height: finalThumbHeight + captionH + 8,
				}
				currentTotalW += w
			}

			if fillWidth && rowLen > 0 {
				diff := availableWidth - currentTotalW
				if diff > 0 && finalThumbHeight <= maxRowHeightCap {
					for k := range diff {
						rowCells[k%rowLen].width += 1
					}
				} else if diff < 0 {
					excess := -diff
					guard := 0
					for excess > 0 && guard < rowLen*4 {
						targetIdx := guard % rowLen
						if rowCells[targetIdx].width > 24 {
							rowCells[targetIdx].width -= 1
							excess--
						}
						guard++
					}
				}
			}

			a.rows = append(a.rows, rowCells)
		}

		rowStartIdx := 0
		currentRatiosSum := float64(0)
		for i := range n {
			currentRatiosSum += itemRatios[i]
			rowLen := i - rowStartIdx + 1
			gapsTotal := (rowLen - 1) * gap
			availableWidth := width - gapsTotal
			if availableWidth < 50 {
				availableWidth = 50
			}
			projectedHeight := float64(availableWidth) / currentRatiosSum

			if projectedHeight <= float64(target)*1.25 {
				commitJustifiedRow(rowStartIdx, rowLen, currentRatiosSum, true)
				rowStartIdx = i + 1
				currentRatiosSum = 0
			}
		}

		if rowStartIdx < n {
			rowLen := n - rowStartIdx
			gapsTotal := (rowLen - 1) * gap
			availableWidth := width - gapsTotal
			if availableWidth < 50 {
				availableWidth = 50
			}
			projectedHeight := float64(availableWidth) / currentRatiosSum
			shouldFill := projectedHeight <= float64(target)*1.35
			commitJustifiedRow(rowStartIdx, rowLen, currentRatiosSum, shouldFill)
		}
	}
}

func (a *App) savePrefs() {
	a.saveMu.Lock()
	defer a.saveMu.Unlock()
	path := filepath.Join(core.UserDataDir(), "native-ui.json")
	data, err := json.MarshalIndent(a.prefs, "", "  ")
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	_ = os.WriteFile(path, data, 0o644)
}

func (a *App) loadPrefs() {
	path := filepath.Join(core.UserDataDir(), "native-ui.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	// Start from defaults so newly added fields (such as recordImportUrl) keep
	// their intended default when older native-ui.json files lack them.
	p := defaultPrefs()
	if err := json.Unmarshal(data, &p); err != nil {
		return
	}
	if p.BackdropMode == "" {
		p.BackdropMode = "default"
	}
	if p.SortOrder == "" {
		p.SortOrder = "desc"
	}
	if p.RowHeight <= 0 {
		p.RowHeight = 190
	}
	if p.PinnedFilters == nil {
		p.PinnedFilters = append([]string(nil), defaultPinnedFilterCriteria...)
	}
	a.prefs = p
	a.sortOrder = p.SortOrder
	a.rowHeight = int(p.RowHeight)
}

// LogLines returns the filtered log rows, newest last.
func (a *App) LogLines() []core.LogEntry { return a.logs }

func (a *App) appendLog(entry core.LogEntry) {
	a.logs = append(a.logs, entry)
	if len(a.logs) > 2000 {
		a.logs = a.logs[len(a.logs)-2000:]
	}
	if a.logsAutoScroll && a.logsWin != nil {
		a.logsWin.Invalidate()
	}
}

// SetDropFolder records the folder a native drop should land in.
func (a *App) SetDropFolder(id string) { a.dropFolderID = id }

// HandleDrop imports native files at the recorded target. Paths that already
// belong to the active library are ignored by the service; they must not show
// an import toast or trigger another import pass.
func (a *App) HandleDrop(paths []string) {
	if a.svc == nil || len(paths) == 0 {
		return
	}
	urls, files := splitDroppedPaths(paths)
	folder := a.dropFolderID
	a.dropFolderID = ""
	if len(urls) > 0 {
		a.handleURLDropsToFolder(urls, folder)
	}
	if len(files) == 0 {
		return
	}
	paths = files
	go func() {
		var (
			result core.NativeDropResult
			err    error
		)
		if folder != "" {
			result, err = a.svc.HandleNativeDropWithResult(paths, "folder", folder)
		} else {
			result, err = a.svc.HandleNativeDropWithResult(paths, "", "")
		}
		a.post(func() {
			if err != nil {
				a.showToast(err.Error())
				a.refreshAll()
				return
			}
			if result.Importing {
				a.showToast(a.tf("dropzone.importing", map[string]any{"count": result.External}))
			}
			if result.Importing || result.Internal > 0 {
				a.refreshAll()
			}
		})
	}()
}

func (a *App) toastActive() bool { return a.toast != "" && time.Now().Before(a.toastUntil) }

// quit delegates to the desktop entry point.
func (a *App) quit() {
	if a.OnQuit != nil {
		a.OnQuit()
	}
}

var _ = atomic.Bool{}
