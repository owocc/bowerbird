package app

import (
	"log"
	"runtime"

	"bowerbird/core"

	"github.com/egoist/mygo"
)

// BuildAppMenu builds the macOS application menu from core's single menu model.
func (a *App) BuildAppMenu() *mygo.Menu {
	if a.svc == nil {
		return mygo.NewMenu(nil)
	}
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
			if err := a.svc.InvokeAppMenu(action); err != nil {
				log.Printf("[Menu] %v", err)
			}
		}
	}
	captureItem := func(action string) *mygo.MenuItem {
		row := find(action)
		return &mygo.MenuItem{Label: row.Title, Accelerator: core.AcceleratorForMyGo(a.svc.ShortcutAccelerator(action)), Click: invoke(action)}
	}
	appMenu := &mygo.MenuItem{
		Role: mygo.RoleAppMenu,
		Submenu: []*mygo.MenuItem{
			{Role: mygo.RoleAbout},
			mygo.Separator(),
			{Label: find(core.AppMenuSettings).Title, Accelerator: core.AcceleratorForMyGo(a.svc.ShortcutAccelerator(core.AppMenuSettings)), Click: invoke(core.AppMenuSettings)},
			{Label: find(core.AppMenuLogs).Title, Accelerator: core.AcceleratorForMyGo(a.svc.ShortcutAccelerator(core.AppMenuLogs)), Click: invoke(core.AppMenuLogs)},
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

// BuildTrayMenu builds the tray/menu-bar menu from core's model.
func (a *App) BuildTrayMenu() *mygo.Menu {
	if a.svc == nil {
		return mygo.NewMenu(nil)
	}
	isZh := a.svc.GetLanguage() == "zh"
	settings := a.svc.GetShortcutSettings()
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
				if err := a.svc.InvokeAppMenu(action); err != nil {
					log.Printf("[TrayMenu] %v", err)
				}
			},
		})
	}
	return mygo.NewMenu(items)
}

// RegisterGlobalShortcuts installs the global capture/show shortcuts.
func (a *App) RegisterGlobalShortcuts() {
	mygo.GlobalShortcut.UnregisterAll()
	if a.svc == nil {
		return
	}
	settings := a.svc.GetShortcutSettings()
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
			if err := a.svc.InvokeAppMenu(id); err != nil {
				log.Printf("[GlobalShortcut] %s: %v", id, err)
			}
		}); err != nil {
			log.Printf("[GlobalShortcut] %s registration error: %v", accel, err)
		}
	}
}

// IsDarwin reports the platform for the entry point's menu/tray choices.
func IsDarwin() bool { return runtime.GOOS == "darwin" }
