package core

import (
	"fmt"
	"runtime"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// -----------------------------------------------------------------------------
// Application menu
//
// The menu is declared exactly once, here, and then consumed by three callers:
//
//  1. the native macOS menu bar          -> BuildNativeAppMenu (Cmd+, etc.)
//  2. the self-drawn ≡ button on Windows -> Service.GetAppMenu, rendered by
//     and Linux                              frontend/src/components/AppMenuButton.tsx
//  3. the in-app shortcut layer on       -> frontend/src/hooks/useAppShortcuts.ts
//     Windows and Linux
//
// macOS registers the menu natively: the global menu bar is OS-styled and fully
// controllable, so the app draws nothing there. Windows and Linux render the
// model returned by GetAppMenu instead - a GTK menu bar cannot be hidden or
// restyled, and showing a native bar next to the ≡ button would duplicate it.
// -----------------------------------------------------------------------------

// AppMenuAction is the stable identity of an application menu command.
//
// The value is the wire identity shared by the Go bridge and the frontend: the
// frontend looks actions up by id and never hardcodes labels or ordering.
type AppMenuAction = string

// Application-scoped commands, executed by the Go bridge (see InvokeAppMenu).
const (
	AppMenuSettings          AppMenuAction = "settings"
	AppMenuLogs              AppMenuAction = "logs"
	AppMenuAbout             AppMenuAction = "about"
	AppMenuQuit              AppMenuAction = "quit"
	AppMenuCaptureArea       AppMenuAction = "capture-area"
	AppMenuCaptureFullscreen AppMenuAction = "capture-fullscreen"
	AppMenuCaptureWindow     AppMenuAction = "capture-window"
	AppMenuOpenMainWindow    AppMenuAction = "open-main-window"
)

// Window-scoped commands, executed in the webview because they act on one
// specific window rather than on the application as a whole. The frontend maps
// these ids onto the Wails runtime (see frontend/src/lib/app-menu.ts).
const (
	AppMenuReload      AppMenuAction = "reload"
	AppMenuForceReload AppMenuAction = "force-reload"
	AppMenuFullscreen  AppMenuAction = "fullscreen"
	AppMenuDevTools    AppMenuAction = "devtools"

	// AppMenuCloseWindow, AppMenuZoomIn, AppMenuZoomOut and AppMenuZoomReset
	// have no menu row: they are keyboard-only affordances.
	AppMenuCloseWindow AppMenuAction = "close-window"
	AppMenuZoomIn      AppMenuAction = "zoom-in"
	AppMenuZoomOut     AppMenuAction = "zoom-out"
	AppMenuZoomReset   AppMenuAction = "zoom-reset"
)

// AppMenuIcon values are stable icon names. The frontend maps them onto its own
// icon set, so adding an icon is a two-sided change.
const (
	AppMenuIconSettings          = "settings"
	AppMenuIconLogs              = "logs"
	AppMenuIconAbout             = "about"
	AppMenuIconReload            = "reload"
	AppMenuIconFullscreen        = "fullscreen"
	AppMenuIconDevTools          = "devtools"
	AppMenuIconQuit              = "quit"
	AppMenuIconCaptureArea       = "capture-area"
	AppMenuIconCaptureFullscreen = "capture-fullscreen"
	AppMenuIconCaptureWindow     = "capture-window"
)

// AppMenuItem is one row of the application menu.
//
// A row with Separator set is a divider: every other field is meaningless.
type AppMenuItem struct {
	// Action is the command identity (one of the AppMenuAction constants).
	Action string `json:"action"`
	// Title is the canonical English label. The native macOS menu bar uses it
	// directly; the frontend prefers the translation behind LabelKey and falls
	// back to Title.
	Title string `json:"title"`
	// LabelKey is the frontend i18n key (frontend/src/messages/*.json).
	LabelKey string `json:"labelKey"`
	// Icon is one of the AppMenuIcon values.
	Icon string `json:"icon"`
	// Shortcut is the platform-specific, human-readable accelerator shown to the
	// user: "Ctrl+I" on Windows/Linux, "⌘," on macOS.
	Shortcut string `json:"shortcut"`
	// Separator marks a non-interactive divider row.
	Separator bool `json:"separator,omitempty"`
	// Destructive styles the row as dangerous (used by Quit).
	Destructive bool `json:"destructive,omitempty"`
}

func isDarwin() bool {
	return runtime.GOOS == "darwin"
}

// appMenuShortcutLabel returns the label shown to the user for an action.
func appMenuShortcutLabel(action string) string {
	switch action {
	case AppMenuCaptureArea:
		if isDarwin() {
			return "⌥A"
		}
		return "Alt+A"
	case AppMenuCaptureFullscreen:
		if isDarwin() {
			return "⌥S"
		}
		return "Alt+S"
	case AppMenuCaptureWindow:
		if isDarwin() {
			return "⌥W"
		}
		return "Alt+W"
	case AppMenuSettings:
		// instead: Wails resolves accelerators through its own tables there, and
		// punctuation produces synthetic names ("," becomes "oem_comma" on
		// Windows; the Linux GDK table has no comma entry at all), so a
		// punctuation accelerator silently fails to match. A letter resolves
		// cleanly everywhere.
		if isDarwin() {
			return "⌘,"
		}
		return "Ctrl+I"

	case AppMenuLogs:
		if isDarwin() {
			return "⌘L"
		}
		return "Ctrl+L"

	case AppMenuAbout:
		return ""
	case AppMenuReload:
		if isDarwin() {
			return "⌘R"
		}
		return "Ctrl+R"

	case AppMenuFullscreen:
		return "F11"

	case AppMenuDevTools:
		if isDarwin() {
			return "⌥⌘I"
		}
		return "Ctrl+Shift+I"

	case AppMenuQuit:
		if isDarwin() {
			return "⌘Q"
		}
		return "Ctrl+Q"
	}
	return ""
}

// appMenuAccelerator returns the Wails accelerator string for an action. Only
// the native macOS menu consumes it; the webview drives its own key handling
// through the ids above.
func appMenuAccelerator(action string) string {
	switch action {
	case AppMenuCaptureArea:
		return "OptionOrAlt+A"
	case AppMenuCaptureFullscreen:
		return "OptionOrAlt+S"
	case AppMenuCaptureWindow:
		return "OptionOrAlt+W"
	case AppMenuSettings:
		if isDarwin() {
			return "CmdOrCtrl+,"
		}
		return "CmdOrCtrl+i"
	case AppMenuLogs:
		return "CmdOrCtrl+L"

	case AppMenuReload:
		return "CmdOrCtrl+R"
	case AppMenuFullscreen:
		return "F11"

	case AppMenuDevTools:
		if isDarwin() {
			return "CmdOrCtrl+Alt+I"
		}
		return "CmdOrCtrl+Shift+I"

	case AppMenuQuit:
		return "CmdOrCtrl+Q"
	}
	return ""
}

// AppMenuModel returns the application menu in display order.
func AppMenuModel() []AppMenuItem {
	item := func(action, title, labelKey, icon string, destructive bool) AppMenuItem {
		return AppMenuItem{
			Action:      action,
			Title:       title,
			LabelKey:    labelKey,
			Icon:        icon,
			Shortcut:    appMenuShortcutLabel(action),
			Destructive: destructive,
		}
	}

	return []AppMenuItem{
		item(AppMenuCaptureArea, "Area Capture", "appMenu.captureArea", AppMenuIconCaptureArea, false),
		item(AppMenuCaptureFullscreen, "Fullscreen Capture", "appMenu.captureFullscreen", AppMenuIconCaptureFullscreen, false),
		item(AppMenuCaptureWindow, "Window Capture", "appMenu.captureWindow", AppMenuIconCaptureWindow, false),

		{Separator: true},

		item(AppMenuSettings, "Settings…", "appMenu.settings", AppMenuIconSettings, false),
		item(AppMenuLogs, "Logs…", "appMenu.logs", AppMenuIconLogs, false),
		item(AppMenuAbout, "About Bowerbird", "appMenu.about", AppMenuIconAbout, false),

		{Separator: true},

		item(AppMenuReload, "Reload", "appMenu.reload", AppMenuIconReload, false),
		item(AppMenuFullscreen, "Toggle Full Screen", "appMenu.fullscreen", AppMenuIconFullscreen, false),
		item(AppMenuDevTools, "Developer Tools", "appMenu.devtools", AppMenuIconDevTools, false),

		{Separator: true},

		item(AppMenuQuit, "Quit Bowerbird", "appMenu.quit", AppMenuIconQuit, true),
	}
}

// GetAppMenu returns the menu model rendered by the app's own ≡ button. macOS
// ignores it: its menu is registered natively (see BuildNativeAppMenu).
func (s *Service) GetAppMenu() []AppMenuItem {
	return AppMenuModel()
}

// InvokeAppMenu executes an application-scoped menu action. Window-scoped
// actions (reload, fullscreen, DevTools, zoom) are not handled here: they act on
// one window and are executed by the webview that owns it.
func (s *Service) InvokeAppMenu(action string) error {
	switch action {
	case AppMenuCaptureArea:
		_, err := s.CaptureArea()
		return err
	case AppMenuCaptureFullscreen:
		_, err := s.CaptureFullscreen()
		return err
	case AppMenuCaptureWindow:
		_, err := s.CaptureWindow()
		return err
	case AppMenuOpenMainWindow:
		if w := s.mgr.getWindow(); w != nil {
			w.Show().Focus()
		}
		return nil
	case AppMenuSettings:
		return s.OpenSettingsWindow()

	case AppMenuLogs:
		return s.OpenLogsWindow()

	case AppMenuAbout:
		if app := s.getApp(); app != nil {
			app.Menu.ShowAbout()
		}
		return nil
	case AppMenuQuit:
		if app := s.getApp(); app != nil {
			app.Quit()
		}
		return nil
	}

	return fmt.Errorf("core: unknown application menu action %q", action)
}

// BuildNativeAppMenu builds the macOS menu bar. It exists so macOS can register
// its menu natively instead of drawing the ≡ button: titles and accelerators
// come from the same AppMenuModel the frontend renders.
//
// onAction is called with an AppMenuAction id whenever the user picks one of the
// app's own items.
func BuildNativeAppMenu(appName string, onAction func(action string)) *application.Menu {
	items := AppMenuModel()
	find := func(action string) AppMenuItem {
		for _, item := range items {
			if item.Action == action {
				return item
			}
		}
		// Unreachable for the actions used below; degrade to the raw id rather
		// than panicking.
		return AppMenuItem{Action: action, Title: action}
	}

	menu := application.NewMenu()

	// The first submenu becomes the application menu; macOS renders it with the
	// application name.
	appMenu := menu.AddSubmenu(appName)

	// About and Quit stay OS roles so they keep their standard placement and
	// localisation.
	appMenu.AddRole(application.About)
	appMenu.AddSeparator()

	settings := find(AppMenuSettings)
	settingsItem := appMenu.Add(settings.Title)
	if accelerator := appMenuAccelerator(settings.Action); accelerator != "" {
		settingsItem.SetAccelerator(accelerator)
	}
	settingsItem.OnClick(func(*application.Context) {
		onAction(settings.Action)
	})

	logs := find(AppMenuLogs)
	logsItem := appMenu.Add(logs.Title)
	if accelerator := appMenuAccelerator(logs.Action); accelerator != "" {
		logsItem.SetAccelerator(accelerator)
	}
	logsItem.OnClick(func(*application.Context) {
		onAction(logs.Action)
	})

	appMenu.AddSeparator()
	appMenu.AddRole(application.Hide)
	appMenu.AddRole(application.HideOthers)
	appMenu.AddRole(application.UnHide)
	appMenu.AddSeparator()
	appMenu.AddRole(application.Quit)

	// Standard macOS menus. View provides Reload / Toggle Full Screen /
	// Developer Tools, which is why those AppMenuModel rows are rendered by the
	// frontend only.
	// Capture menu offers screen capture affordances with native accelerators.
	captureMenu := menu.AddSubmenu("Capture")
	area := find(AppMenuCaptureArea)
	areaItem := captureMenu.Add(area.Title)
	if accelerator := appMenuAccelerator(area.Action); accelerator != "" {
		areaItem.SetAccelerator(accelerator)
	}
	areaItem.OnClick(func(*application.Context) {
		onAction(area.Action)
	})

	fullscreen := find(AppMenuCaptureFullscreen)
	fullscreenItem := captureMenu.Add(fullscreen.Title)
	if accelerator := appMenuAccelerator(fullscreen.Action); accelerator != "" {
		fullscreenItem.SetAccelerator(accelerator)
	}
	fullscreenItem.OnClick(func(*application.Context) {
		onAction(fullscreen.Action)
	})

	window := find(AppMenuCaptureWindow)
	windowItem := captureMenu.Add(window.Title)
	if accelerator := appMenuAccelerator(window.Action); accelerator != "" {
		windowItem.SetAccelerator(accelerator)
	}
	windowItem.OnClick(func(*application.Context) {
		onAction(window.Action)
	})

	menu.AddRole(application.FileMenu)
	menu.AddRole(application.EditMenu)
	menu.AddRole(application.ViewMenu)
	menu.AddRole(application.WindowMenu)
	menu.AddRole(application.HelpMenu)

	return menu
}

// BuildTrayMenu creates the menu for the system tray / menu bar item.
func BuildTrayMenu(appName string, isZh bool, onAction func(action string)) *application.Menu {
	menu := application.NewMenu()

	areaTitle := "Area Capture"
	fullscreenTitle := "Fullscreen Capture"
	windowTitle := "Window Capture"
	showTitle := "Show Main Window"
	settingsTitle := "Settings…"
	quitTitle := "Quit " + appName

	if isZh {
		areaTitle = "区域截图"
		fullscreenTitle = "全屏截图"
		windowTitle = "窗口截图"
		showTitle = "显示主窗口"
		settingsTitle = "偏好设置…"
		quitTitle = "退出 " + appName
	}

	areaItem := menu.Add(areaTitle)
	areaItem.SetAccelerator(appMenuAccelerator(AppMenuCaptureArea))
	areaItem.OnClick(func(*application.Context) {
		onAction(AppMenuCaptureArea)
	})

	windowItem := menu.Add(windowTitle)
	windowItem.SetAccelerator(appMenuAccelerator(AppMenuCaptureWindow))
	windowItem.OnClick(func(*application.Context) {
		onAction(AppMenuCaptureWindow)
	})

	fullscreenItem := menu.Add(fullscreenTitle)
	fullscreenItem.SetAccelerator(appMenuAccelerator(AppMenuCaptureFullscreen))
	fullscreenItem.OnClick(func(*application.Context) {
		onAction(AppMenuCaptureFullscreen)
	})

	menu.AddSeparator()

	showItem := menu.Add(showTitle)
	showItem.OnClick(func(*application.Context) {
		onAction(AppMenuOpenMainWindow)
	})

	settingsItem := menu.Add(settingsTitle)
	settingsItem.SetAccelerator(appMenuAccelerator(AppMenuSettings))
	settingsItem.OnClick(func(*application.Context) {
		onAction(AppMenuSettings)
	})

	menu.AddSeparator()

	quitItem := menu.Add(quitTitle)
	quitItem.SetAccelerator(appMenuAccelerator(AppMenuQuit))
	quitItem.OnClick(func(*application.Context) {
		onAction(AppMenuQuit)
	})

	return menu
}
