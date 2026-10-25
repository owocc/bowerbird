package main

import (
	"bytes"
	_ "embed"
	"fmt"
	"image"
	"image/png"
	"log"
	"net/url"
	"os"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"bowerbird/core"

	"github.com/egoist/mygo"
	xdraw "golang.org/x/image/draw"
)

//go:embed assets/branding/app-icon.png
var appIcon []byte

// appHost is the mygo implementation of core.Host. It owns the native shell:
// windows, events, dialogs, clipboard and the main-thread hop.
type appHost struct {
	mu      sync.RWMutex
	windows map[string]*mygo.Window
	main    *mygo.Window
	// openingMain is set while a main window is being created, so a second
	// OpenMainWindow waits for the first instead of building another one.
	openingMain chan struct{}
	events      map[string]*mygo.Event[any]
	tray        *mygo.Tray

	svc      *core.Service
	quitting atomic.Bool

	idleMu     sync.Mutex
	idleTimer  *time.Timer
	liteActive atomic.Bool
}

const lightweightIdleDelay = time.Minute

func newAppHost(svc *core.Service) *appHost {
	return &appHost{
		windows: map[string]*mygo.Window{},
		events:  map[string]*mygo.Event[any]{},
		svc:     svc,
	}
}

// event returns the typed event for name, declaring it on first use. mygo
// events are declared once per process; the map keeps that invariant while
// letting core emit the Wails-era event names unchanged.
func (h *appHost) event(name string) *mygo.Event[any] {
	h.mu.Lock()
	defer h.mu.Unlock()
	if e, ok := h.events[name]; ok {
		return e
	}
	e := mygo.NewEvent[any](name)
	h.events[name] = e
	return e
}

func (h *appHost) Emit(name string, payload any) {
	if name == core.LanguageChangedEvent || name == core.ShortcutsChangedEvent {
		h.rebuildTrayMenu()
		if runtime.GOOS == "darwin" {
			mygo.App.SetMenu(h.buildAppMenu())
		}
	}
	if name == core.ShortcutsChangedEvent {
		h.registerGlobalShortcuts()
	}
	_ = h.event(name).Broadcast(payload)
}

func (h *appHost) setMain(w *mygo.Window) {
	h.mu.Lock()
	h.main = w
	h.windows["main"] = w
	h.mu.Unlock()
}

func (h *appHost) mainWindow() *mygo.Window {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.main
}

func (h *appHost) window(name string) *mygo.Window {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.windows[name]
}

// newWindow builds a mygo window from a core.WindowSpec. Callers must hold no
// host lock.
func (h *appHost) newWindow(spec core.WindowSpec) *mygo.Window {
	w := mygo.NewWindow(h.windowOptions(spec))
	keepWindowTitle(w)
	h.attachDrop(w)
	return w
}

func (h *appHost) OpenWindow(spec core.WindowSpec) error {
	h.mu.Lock()
	if existing, ok := h.windows[spec.Name]; ok {
		h.mu.Unlock()
		h.CancelLightweightIdle()
		existing.Show()
		existing.Focus()
		return nil
	}
	h.mu.Unlock()

	w := h.newWindow(spec)

	h.mu.Lock()
	if existing, ok := h.windows[spec.Name]; ok {
		// Another call won the race; keep the first window.
		h.mu.Unlock()
		w.Destroy()
		existing.Show()
		existing.Focus()
		return nil
	}
	h.windows[spec.Name] = w
	h.mu.Unlock()

	name := spec.Name
	w.OnClosed(func() {
		h.mu.Lock()
		if h.windows[name] == w {
			delete(h.windows, name)
		}
		h.mu.Unlock()
	})
	return nil
}

func (h *appHost) FocusWindow(name string) bool {
	w := h.window(name)
	if w == nil {
		return false
	}
	w.Show()
	w.Focus()
	return true
}

func (h *appHost) CloseWindow(name string) {
	if w := h.window(name); w != nil {
		w.Close()
	}
}

func (h *appHost) FocusMainWindow() {
	h.CancelLightweightIdle()
	w := h.mainWindow()
	if w == nil {
		h.OpenMainWindow()
		return
	}
	w.Show()
	w.Restore()
	w.Focus()
	mygo.App.Focus()
}

func (h *appHost) ToggleMainWindow() {
	w := h.mainWindow()
	if w == nil {
		h.OpenMainWindow()
		return
	}
	if w.IsVisible() && w.IsFocused() {
		w.Hide()
		return
	}
	h.FocusMainWindow()
}

// CloseMainWindow destroys the main window instead of hiding it. A user click
// on the close button still hides the window; this path is for leaving a
// library, where the window must actually go away.
func (h *appHost) CloseMainWindow() {
	w := h.mainWindow()
	if w == nil {
		return
	}
	h.mu.Lock()
	if h.main == w {
		h.main = nil
	}
	if h.windows["main"] == w {
		delete(h.windows, "main")
	}
	h.mu.Unlock()
	w.Destroy()
}

// OpenMainWindow creates a fresh main window, or reveals the one that is
// already open.
func (h *appHost) OpenMainWindow() {
	h.CancelLightweightIdle()
	h.liteActive.Store(false)
	h.mu.Lock()
	if h.main != nil {
		h.mu.Unlock()
		h.FocusMainWindow()
		return
	}
	if h.openingMain != nil {
		done := h.openingMain
		h.mu.Unlock()
		<-done
		h.FocusMainWindow()
		return
	}
	done := make(chan struct{})
	h.openingMain = done
	h.mu.Unlock()

	w := h.createMainWindow()

	h.mu.Lock()
	h.main = w
	h.windows["main"] = w
	h.openingMain = nil
	close(done)
	h.mu.Unlock()
}

// createMainWindow builds the main window with the same options used at
// launch. Callers publish it through setMain or OpenMainWindow.
func (h *appHost) createMainWindow() *mygo.Window {
	w := mygo.NewWindow(h.windowOptions(core.WindowSpec{
		Title:          "Bowerbird",
		URL:            "/",
		Width:          1280,
		Height:         800,
		MinWidth:       900,
		MinHeight:      600,
		TitleBarHidden: true,
	}))
	keepWindowTitle(w)
	h.attachDrop(w)
	w.OnClose(func(e *mygo.CloseEvent) {
		if h.quitting.Load() {
			return
		}
		e.PreventDefault()
		w.Hide()
		h.scheduleLightweightIdle()
	})
	return w
}

func (h *appHost) scheduleLightweightIdle() {
	if h.svc == nil || !h.svc.GetLightweightModeEnabled() {
		return
	}
	h.idleMu.Lock()
	defer h.idleMu.Unlock()
	if h.idleTimer != nil {
		h.idleTimer.Stop()
	}
	h.idleTimer = time.AfterFunc(lightweightIdleDelay, func() {
		h.EnterLightweightMode()
	})
}

func (h *appHost) CancelLightweightIdle() {
	h.idleMu.Lock()
	defer h.idleMu.Unlock()
	if h.idleTimer != nil {
		h.idleTimer.Stop()
		h.idleTimer = nil
	}
}

func (h *appHost) EnterLightweightMode() {
	if h.quitting.Load() {
		return
	}
	h.CancelLightweightIdle()
	h.liteActive.Store(true)

	h.mu.Lock()
	windows := make([]*mygo.Window, 0, len(h.windows))
	for name, w := range h.windows {
		windows = append(windows, w)
		delete(h.windows, name)
	}
	h.main = nil
	h.mu.Unlock()

	for _, w := range windows {
		if w != nil {
			w.Destroy()
		}
	}
	log.Printf("[Lightweight] webview windows destroyed; Go process still running")
}

func (h *appHost) OpenDirectory(title string) (string, error) {
	paths, err := mygo.Dialog.Open(mygo.OpenDialogOptions{
		Title:             title,
		Directory:         true,
		CreateDirectories: true,
	})
	if err != nil || len(paths) == 0 {
		return "", err
	}
	return paths[0], nil
}

func (h *appHost) ShowAbout() {
	mygo.App.ShowAboutPanel(mygo.AboutPanelOptions{
		ApplicationName:    "Bowerbird",
		ApplicationVersion: "1.0.0-alpha-1",
		Copyright:          "© 2026, owocc",
		Credits:            "Bowerbird Asset Manager",
	})
}

func (h *appHost) Quit() {
	h.quitting.Store(true)
	mygo.App.Quit()
}

func (h *appHost) RunOnMain(fn func()) { mygo.RunOnMain(fn) }

func (h *appHost) NativeWindowHandle() uintptr {
	w := h.mainWindow()
	if w == nil || w.IsDestroyed() {
		return 0
	}
	return w.NativeHandle()
}

func (h *appHost) WriteFilesToClipboard(paths []string) error {
	if len(paths) == 0 {
		return fmt.Errorf("no files to copy")
	}
	return mygo.Clipboard.WriteFiles(paths...)
}

func (h *appHost) WriteTextToClipboard(text string) error {
	mygo.Clipboard.WriteText(text)
	return nil
}

// windowBackgroundColor follows the light/dark appearance so chrome and the
// first paint stay in sync with the page theme.
const windowBackgroundColor = "light-dark(#ffffff, #06070f)"

// windowVibrancyMaterial is the translucent material shown behind the page
// when the user turns on window blur. macOS shows the sidebar material; Windows
// 11 falls back to Acrylic for it. Windows keeps the material in the window it
// was created with, so slim windows are always created with one.
const windowVibrancyMaterial = mygo.VibrancySidebar

// windowOptions returns the options for one of the app's windows, following the
// current theme and vibrancy preference.
func (h *appHost) windowOptions(spec core.WindowSpec) mygo.WindowOptions {
	svc := h.svc
	vibrant := svc != nil && svc.GetVibrancyEnabled()
	opts := mygo.WindowOptions{
		Title:           spec.Title,
		URL:             spec.URL,
		Width:           spec.Width,
		Height:          spec.Height,
		MinWidth:        spec.MinWidth,
		MinHeight:       spec.MinHeight,
		Transparent:     vibrant,
		BackgroundColor: windowBackgroundColor,
	}
	if spec.TitleBarHidden {
		opts.TitleBarStyle = mygo.TitleBarHiddenInset
	}
	if vibrant {
		opts.Vibrancy = windowVibrancyMaterial
	}
	return opts
}

func nativeThemeSource(theme string) mygo.ThemeSource {
	switch theme {
	case core.ThemeDark:
		return mygo.ThemeDark
	case core.ThemeLight:
		return mygo.ThemeLight
	default:
		return mygo.ThemeSystem
	}
}

// ApplyVibrancy turns the blurred material behind every window on or off. The
// page is what has to become transparent, so this only touches the native side;
// the frontend does the same over the vibrancy-changed event.
func (h *appHost) ApplyVibrancy(enabled bool) {
	material := mygo.VibrancyNone
	if enabled {
		material = windowVibrancyMaterial
	}
	h.mu.RLock()
	windows := make([]*mygo.Window, 0, len(h.windows)+1)
	for _, w := range h.windows {
		windows = append(windows, w)
	}
	if h.main != nil {
		windows = append(windows, h.main)
	}
	h.mu.RUnlock()
	seen := make(map[*mygo.Window]struct{}, len(windows))
	for _, w := range windows {
		if w == nil {
			continue
		}
		if _, ok := seen[w]; ok {
			continue
		}
		seen[w] = struct{}{}
		w.SetVibrancy(material)
	}
}

// ApplyTheme pushes the app colour mode onto the native window / system
// appearance and keeps existing windows' fill colour in step.
func (h *appHost) ApplyTheme(theme string) {
	mygo.Theme.SetSource(nativeThemeSource(theme))
	h.mu.RLock()
	windows := make([]*mygo.Window, 0, len(h.windows)+1)
	for _, w := range h.windows {
		windows = append(windows, w)
	}
	if h.main != nil {
		windows = append(windows, h.main)
	}
	h.mu.RUnlock()
	seen := make(map[*mygo.Window]struct{}, len(windows))
	for _, w := range windows {
		if w == nil {
			continue
		}
		if _, ok := seen[w]; ok {
			continue
		}
		seen[w] = struct{}{}
		_ = w.SetBackgroundColor(windowBackgroundColor)
	}
}

// dropTarget is the DOM target resolved under a native drop.
type dropTarget struct {
	Target   string `json:"target"`
	FolderID string `json:"folderId"`
}

func (h *appHost) attachDrop(w *mygo.Window) {
	w.OnFileDrop(func(e *mygo.FileDropEvent) {
		target := dropTarget{}
		js := fmt.Sprintf(`const el = document.elementFromPoint(%d, %d);
const t = el && el.closest ? el.closest("[data-file-drop-target]") : null;
return {target: t && t.dataset ? (t.dataset.fileDropTarget || "") : "", folderId: t && t.dataset ? (t.dataset.folderId || "") : ""};`, e.X, e.Y)
		if got, err := mygo.EvalAs[dropTarget](w.Page(), js); err == nil {
			target = got
		}
		if h.svc != nil {
			_ = h.svc.HandleNativeDrop(e.Paths, target.Target, target.FolderID)
		}
	})
}

// rebuildTrayMenu refreshes the tray menu after a language change.
func (h *appHost) rebuildTrayMenu() {
	h.mu.RLock()
	tray := h.tray
	h.mu.RUnlock()
	if tray == nil || h.svc == nil {
		return
	}
	isZh := h.svc.GetLanguage() == "zh"
	tray.SetMenu(h.buildTrayMenu(isZh, h.svc.GetShortcutSettings()))
}

func (h *appHost) buildTrayMenu(isZh bool, settings core.ShortcutSettings) *mygo.Menu {
	var items []*mygo.MenuItem
	for _, row := range core.TrayMenuModelWithSettings("Bowerbird", isZh, settings) {
		if row.Separator {
			items = append(items, mygo.Separator())
			continue
		}
		action := row.Action
		if action == core.AppMenuQuit {
			items = append(items, &mygo.MenuItem{Role: mygo.RoleQuit})
			continue
		}
		items = append(items, &mygo.MenuItem{
			Label:       row.Label,
			Accelerator: row.Accelerator,
			Click: func(*mygo.MenuItem, *mygo.Window) {
				if err := h.svc.InvokeAppMenu(action); err != nil {
					log.Printf("[TrayMenu] %v", err)
				}
			},
		})
	}
	return mygo.NewMenu(items)
}

// buildAppMenu builds the macOS menu bar from the same model the frontend uses.
func (h *appHost) buildAppMenu() *mygo.Menu {
	model := core.AppMenuModel()
	find := func(action string) core.AppMenuItem {
		for _, it := range model {
			if it.Action == action {
				return it
			}
		}
		return core.AppMenuItem{Action: action, Title: action}
	}
	appAction := func(action string) func(*mygo.MenuItem, *mygo.Window) {
		return func(*mygo.MenuItem, *mygo.Window) {
			if err := h.svc.InvokeAppMenu(action); err != nil {
				log.Printf("[Menu] %v", err)
			}
		}
	}
	captureItem := func(action string) *mygo.MenuItem {
		row := find(action)
		return &mygo.MenuItem{
			Label:       row.Title,
			Accelerator: core.AcceleratorForMyGo(h.svc.ShortcutAccelerator(action)),
			Click:       appAction(action),
		}
	}

	appMenu := &mygo.MenuItem{
		Role: mygo.RoleAppMenu,
		Submenu: []*mygo.MenuItem{
			{Role: mygo.RoleAbout},
			mygo.Separator(),
			{Label: find(core.AppMenuSettings).Title, Accelerator: core.AcceleratorForMyGo(h.svc.ShortcutAccelerator(core.AppMenuSettings)), Click: appAction(core.AppMenuSettings)},
			{Label: find(core.AppMenuLogs).Title, Accelerator: core.AcceleratorForMyGo(h.svc.ShortcutAccelerator(core.AppMenuLogs)), Click: appAction(core.AppMenuLogs)},
			mygo.Separator(),
			{Role: mygo.RoleHide},
			{Role: mygo.RoleHideOthers},
			{Role: mygo.RoleUnhide},
			mygo.Separator(),
			{Role: mygo.RoleQuit},
		},
	}

	return mygo.NewMenu([]*mygo.MenuItem{
		appMenu,
		{Label: "Capture", Submenu: []*mygo.MenuItem{
			captureItem(core.AppMenuCaptureArea),
			captureItem(core.AppMenuCaptureFullscreen),
			captureItem(core.AppMenuCaptureWindow),
		}},
		{Role: mygo.RoleFileMenu},
		{Role: mygo.RoleEditMenu},
		{Role: mygo.RoleViewMenu},
		{Role: mygo.RoleWindowMenu},
		{Role: mygo.RoleHelp},
	})
}

func (h *appHost) registerGlobalShortcuts() {
	mygo.GlobalShortcut.UnregisterAll()
	if h.svc == nil {
		return
	}
	settings := h.svc.GetShortcutSettings()
	for _, def := range core.ShortcutCatalog() {
		if def.Scope != core.ShortcutScopeGlobal {
			continue
		}
		accel := core.AcceleratorForMyGo(settings.Accelerator(def.ID))
		if accel == "" {
			continue
		}
		id := def.ID
		if err := mygo.GlobalShortcut.Register(accel, func() {
			if err := h.svc.InvokeAppMenu(id); err != nil {
				log.Printf("[GlobalShortcut] %s: %v", id, err)
			}
		}); err != nil {
			log.Printf("[GlobalShortcut] %s registration error: %v", accel, err)
		}
	}
}

// keepWindowTitle keeps the native title the app set, instead of following
// the page's <title> (all routes share the same document title).
func keepWindowTitle(w *mygo.Window) {
	w.Page().OnPageTitleUpdated(func(e *mygo.TitleEvent) { e.PreventDefault() })
}

// trayIconPNG downsizes the 1024px app icon to a 32px tray icon.
func trayIconPNG() []byte {
	src, _, err := image.Decode(bytes.NewReader(appIcon))
	if err != nil {
		return appIcon
	}
	dst := image.NewRGBA(image.Rect(0, 0, 32, 32))
	xdraw.ApproxBiLinear.Scale(dst, dst.Bounds(), src, src.Bounds(), xdraw.Over, nil)
	var buf bytes.Buffer
	if err := png.Encode(&buf, dst); err != nil {
		return appIcon
	}
	return buf.Bytes()
}

func parseProtocolURL(rawURL string) (manifestURL, id, version, name string, ok bool) {
	if !strings.HasPrefix(rawURL, "bowerbird://") {
		return "", "", "", "", false
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", "", "", "", false
	}
	combined := strings.Trim(u.Host+u.Path, "/")
	if combined != "plugin/install" && !strings.HasPrefix(combined, "plugin/install") {
		return "", "", "", "", false
	}
	q := u.Query()
	manifestURL = q.Get("manifest")
	if manifestURL == "" {
		manifestURL = q.Get("manifestUrl")
	}
	if manifestURL == "" {
		manifestURL = q.Get("url")
	}
	id = q.Get("id")
	version = q.Get("version")
	name = q.Get("name")
	return manifestURL, id, version, name, true
}

func main() {
	// Set the name first: it keys the single instance lock and user paths.
	mygo.App.SetName("Bowerbird")
	if !mygo.App.RequestSingleInstanceLock() {
		return
	}

	// The service is bound before the manager exists: `mygo generate` runs
	// main up to App.Run, and creating the manager there would start servers
	// and open the SQLite database during code generation.
	coreService := core.NewService(nil)
	host := newAppHost(coreService)
	core.AttachHost(coreService, host)
	mygo.Bind(&GreetService{})
	mygo.Bind(coreService)

	var (
		coreMgr    *core.LibraryManager
		pendingMu  sync.Mutex
		pendingURL []string
	)

	handleProtocol := func(raw string) {
		manifestURL, id, version, name, ok := parseProtocolURL(raw)
		if !ok {
			return
		}
		log.Printf("[Protocol] plugin install requested: id=%s version=%s manifest=%s", id, version, manifestURL)
		if coreMgr == nil {
			pendingMu.Lock()
			pendingURL = append(pendingURL, raw)
			pendingMu.Unlock()
			return
		}
		if pm := coreMgr.GetPluginManager(); pm != nil {
			pm.SetPendingInstall(&core.PluginInstallRequest{
				ManifestURL: manifestURL,
				ID:          id,
				Version:     version,
				Name:        name,
			})
		}
		_ = core.OpenSettingsWindowWithHost(host)
		host.Emit("plugin:install-requested", map[string]any{
			"manifestUrl": manifestURL,
			"id":          id,
			"version":     version,
			"name":        name,
		})
	}

	mygo.App.OnOpenURL(handleProtocol)
	revealApp := func() {
		if host.mainWindow() != nil || host.liteActive.Load() {
			host.OpenMainWindow()
			return
		}
		if coreMgr != nil && coreMgr.GetActiveLibrary() != nil {
			host.OpenMainWindow()
			return
		}
		if err := coreService.OpenSetupWindow(); err != nil {
			log.Printf("[Window] setup: %v", err)
		}
	}

	mygo.App.OnSecondInstance(func(args []string, workingDir string) {
		for _, arg := range args {
			if strings.HasPrefix(arg, "bowerbird://") {
				handleProtocol(arg)
			}
		}
		revealApp()
	})

	mygo.App.OnActivate(func(hasVisibleWindows bool) {
		if !hasVisibleWindows {
			revealApp()
		}
	})
	mygo.App.OnWindowAllClosed(func() {
		if host.liteActive.Load() || host.quitting.Load() {
			return
		}
		if runtime.GOOS != "darwin" {
			mygo.App.Quit()
		}
	})
	mygo.App.OnBeforeQuit(func(*mygo.QuitEvent) {
		host.quitting.Store(true)
	})

	mygo.App.WhenReady(func() {
		coreMgr = core.NewLibraryManager()
		coreMgr.SetHost(host)
		core.AttachManager(coreService, coreMgr)
		host.ApplyTheme(coreService.GetTheme())
		host.ApplyVibrancy(coreService.GetVibrancyEnabled())
		// The manager restores the last library before it has a host, so tell
		// the pages once more now that events can reach them.
		if lib := coreMgr.GetActiveLibrary(); lib != nil {
			host.Emit(core.LibraryOpenedEvent, lib)
		}
		core.SetLogHost(host)

		logPath := core.StartAppLogSession(fmt.Sprintf("os=%s arch=%s", runtime.GOOS, runtime.GOARCH))
		log.Printf("[AppLog] log file: %s", logPath)
		tracePath := core.StartDragTraceSession(fmt.Sprintf("os=%s arch=%s", runtime.GOOS, runtime.GOARCH))
		log.Printf("[DragTrace] drag trace file: %s", tracePath)

		// No library yet: only the setup window is shown. Choosing one creates the
		// main window (see Service.OpenLibrary / CreateLibrary).
		if coreMgr.GetActiveLibrary() == nil {
			if err := coreService.OpenSetupWindow(); err != nil {
				log.Printf("[Window] setup: %v", err)
			}
		} else {
			mainWin := host.createMainWindow()
			log.Printf("[Window] main title=%q", mainWin.Title())
			host.setMain(mainWin)
		}

		if runtime.GOOS == "darwin" {
			mygo.App.SetMenu(host.buildAppMenu())
		}

		tray, err := mygo.NewTray(mygo.TrayOptions{
			Icon:    trayIconPNG(),
			ToolTip: "Bowerbird",
			Menu:    host.buildTrayMenu(coreService.GetLanguage() == "zh", coreService.GetShortcutSettings()),
		})
		if err != nil {
			log.Printf("[Tray] %v", err)
		} else {
			host.mu.Lock()
			host.tray = tray
			host.mu.Unlock()
		}

		host.registerGlobalShortcuts()

		pendingMu.Lock()
		urls := append([]string(nil), pendingURL...)
		pendingURL = nil
		pendingMu.Unlock()
		for _, raw := range urls {
			handleProtocol(raw)
		}
		for _, arg := range os.Args[1:] {
			if strings.HasPrefix(arg, "bowerbird://") {
				handleProtocol(arg)
			}
		}
	})

	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
}
