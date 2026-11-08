package app

import (
	"runtime"

	"github.com/egoist/mygo"
)

// NewTray creates the menu-bar / notification-area icon with the app's menu.
// The caller supplies a template icon on macOS and the colored icon elsewhere.
func (a *App) NewTray(icon []byte) (*mygo.Tray, error) {
	return mygo.NewTray(mygo.TrayOptions{
		Icon:           icon,
		IconIsTemplate: runtime.GOOS == "darwin",
		ToolTip:        "Bowerbird",
		Menu:           a.BuildTrayMenu(),
	})
}
