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
	AppMenuSettings AppMenuAction = "settings"
	AppMenuAbout    AppMenuAction = "about"
	AppMenuQuit     AppMenuAction = "quit"
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
	AppMenuIconSettings   = "settings"
	AppMenuIconAbout      = "about"
	AppMenuIconReload     = "reload"
	AppMenuIconFullscreen = "fullscreen"
	AppMenuIconDevTools   = "devtools"
	AppMenuIconQuit       = "quit"
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
	case AppMenuSettings:
		// macOS keeps the platform-standard Cmd+, . Windows and Linux use Ctrl+I
		// instead: Wails resolves accelerators through its own tables there, and
		// punctuation produces synthetic names ("," becomes "oem_comma" on
		// Windows; the Linux GDK table has no comma entry at all), so a
		// punctuation accelerator silently fails to match. A letter resolves
		// cleanly everywhere.
		if isDarwin() {
			return "⌘,"
		}
		return "Ctrl+I"

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
	case AppMenuSettings:
		if isDarwin() {
			return "CmdOrCtrl+,"
		}
		return "CmdOrCtrl+i"

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
		item(AppMenuSettings, "Settings…", "appMenu.settings", AppMenuIconSettings, false),
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
	case AppMenuSettings:
		return s.OpenSettingsWindow()

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

	appMenu.AddSeparator()
	appMenu.AddRole(application.Hide)
	appMenu.AddRole(application.HideOthers)
	appMenu.AddRole(application.UnHide)
	appMenu.AddSeparator()
	appMenu.AddRole(application.Quit)

	// Standard macOS menus. View provides Reload / Toggle Full Screen /
	// Developer Tools, which is why those AppMenuModel rows are rendered by the
	// frontend only.
	menu.AddRole(application.FileMenu)
	menu.AddRole(application.EditMenu)
	menu.AddRole(application.ViewMenu)
	menu.AddRole(application.WindowMenu)
	menu.AddRole(application.HelpMenu)

	return menu
}
