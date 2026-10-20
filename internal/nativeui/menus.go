package nativeui

import (
	"log"
	"net/url"
	"runtime"
	"strings"

	"bowerbird/core"

	"github.com/egoist/mygo"
)

// SetupMenus installs the macOS application menu.
func (h *appHost) SetupMenus() {
	if runtime.GOOS != "darwin" {
		return
	}
	mygo.App.SetMenu(h.buildAppMenu())
}

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
	invoke := func(action string) func(*mygo.MenuItem, *mygo.Window) {
		return func(*mygo.MenuItem, *mygo.Window) {
			if err := h.app.svc.InvokeAppMenu(action); err != nil {
				log.Printf("[NativeMenu] %v", err)
			}
		}
	}
	item := func(action string) *mygo.MenuItem {
		row := find(action)
		return &mygo.MenuItem{
			Label:       row.Title,
			Accelerator: appMenuAccelerator(action),
			Click:       invoke(action),
		}
	}
	appMenu := &mygo.MenuItem{
		Role: mygo.RoleAppMenu,
		Submenu: []*mygo.MenuItem{
			{Role: mygo.RoleAbout},
			mygo.Separator(),
			item(core.AppMenuSettings),
			item(core.AppMenuLogs),
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
			item(core.AppMenuCaptureArea),
			item(core.AppMenuCaptureFullscreen),
			item(core.AppMenuCaptureWindow),
		}},
		{Role: mygo.RoleFileMenu},
		{Role: mygo.RoleEditMenu},
		{Role: mygo.RoleViewMenu},
		{Role: mygo.RoleWindowMenu},
		{Role: mygo.RoleHelp},
	})
}

func appMenuAccelerator(action string) string {
	switch action {
	case core.AppMenuCaptureArea:
		return "Alt+A"
	case core.AppMenuCaptureFullscreen:
		return "Alt+S"
	case core.AppMenuCaptureWindow:
		return "Alt+W"
	case core.AppMenuSettings:
		return "CmdOrCtrl+,"
	case core.AppMenuLogs:
		return "CmdOrCtrl+L"
	}
	return ""
}

// SetupTray creates the menu-bar status item.
func (h *appHost) SetupTray() {
	icon := trayIconPNG()
	if len(icon) == 0 {
		return
	}
	tray, err := mygo.NewTray(mygo.TrayOptions{
		Icon:    icon,
		ToolTip: "Bowerbird",
		Menu:    h.buildTrayMenu(),
	})
	if err != nil {
		log.Printf("[NativeTray] %v", err)
		return
	}
	h.mu.Lock()
	h.tray = tray
	h.mu.Unlock()
}

func (h *appHost) buildTrayMenu() *mygo.Menu {
	isZh := h.app.zh()
	var items []*mygo.MenuItem
	for _, row := range core.TrayMenuModel("Bowerbird", isZh) {
		if row.Separator {
			items = append(items, mygo.Separator())
			continue
		}
		action := row.Action
		if action == core.AppMenuQuit {
			items = append(items, &mygo.MenuItem{Role: mygo.RoleQuit})
			continue
		}
		if action == core.AppMenuOpenMainWindow {
			items = append(items, &mygo.MenuItem{
				Label:       row.Label,
				Accelerator: row.Accelerator,
				Click: func(*mygo.MenuItem, *mygo.Window) {
					h.FocusMainWindow()
				},
			})
			continue
		}
		items = append(items, &mygo.MenuItem{
			Label:       row.Label,
			Accelerator: row.Accelerator,
			Click: func(*mygo.MenuItem, *mygo.Window) {
				if err := h.app.svc.InvokeAppMenu(action); err != nil {
					log.Printf("[NativeTray] %v", err)
				}
			},
		})
	}
	return mygo.NewMenu(items)
}

func (h *appHost) rebuildTrayMenu() {
	h.mu.RLock()
	tray := h.tray
	h.mu.RUnlock()
	if tray == nil {
		return
	}
	tray.SetMenu(h.buildTrayMenu())
}

// RegisterGlobalShortcuts installs the three capture shortcuts.
func (h *appHost) RegisterGlobalShortcuts() {
	shortcuts := []struct {
		accel string
		fn    func() (*core.Item, error)
	}{
		{"Alt+A", h.app.svc.CaptureArea},
		{"Alt+S", h.app.svc.CaptureFullscreen},
		{"Alt+W", h.app.svc.CaptureWindow},
	}
	for _, sc := range shortcuts {
		fn := sc.fn
		if err := mygo.GlobalShortcut.Register(sc.accel, func() {
			if _, err := fn(); err != nil {
				log.Printf("[NativeCapture] %s: %v", sc.accel, err)
			}
		}); err != nil {
			log.Printf("[NativeShortcut] %s: %v", sc.accel, err)
		}
	}
}

// HandleProtocol parses bowerbird:// deep links. Plugin installation is out of
// scope for the native build, so it opens the settings window on the plugin
// notice and reports the gap.
func (a *App) HandleProtocol(raw string) {
	if !strings.HasPrefix(raw, "bowerbird://") {
		return
	}
	u, err := url.Parse(raw)
	if err != nil {
		return
	}
	combined := strings.Trim(u.Host+u.Path, "/")
	if strings.HasPrefix(combined, "plugin/install") {
		log.Printf("[NativeProtocol] plugin install requested: %s", raw)
		a.update(func() {
			a.settingsTab = settingsPlugins
			a.host.rebuildAll()
		})
		_ = a.svc.OpenSettingsWindow()
		a.toast(a.tr(
			"Plugins are not supported by the native build yet.",
			"native 版暂不支持插件，已打开设置页说明。",
		))
		return
	}
	log.Printf("[NativeProtocol] unhandled deep link: %s", raw)
}
