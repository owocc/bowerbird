package nativeui

import (
	"time"

	"bowerbird/core"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

// ViewMain is the main workspace's view.
func (a *App) ViewMain(c *ui.Context) { a.viewMain(c) }

// Refresh reloads the library snapshot.
func (a *App) Refresh() { a.refreshAll() }

// HandleFileDrop imports files dropped on the window, into the active real
// folder when one is selected.
func (a *App) HandleFileDrop(paths []string) {
	a.importPaths(paths, a.currentFolderID())
}

// MainWindow returns the workspace window, for entry-point debug helpers.
func (a *App) MainWindow() *mygo.Window { return a.window() }

// InvalidateAll asks every native window for a new frame.
func (a *App) InvalidateAll() { a.host.invalidateAll() }

// SetSettingsTab selects a settings section by name, for debug runs.
func (a *App) SetSettingsTab(name string) {
	switch name {
	case "general":
		a.settingsTab = settingsGeneral
	case "shortcuts":
		a.settingsTab = settingsShortcuts
	case "plugins":
		a.settingsTab = settingsPlugins
	case "network":
		a.settingsTab = settingsNetwork
	case "data":
		a.settingsTab = settingsData
	case "extension":
		a.settingsTab = settingsExtension
	case "mobile":
		a.settingsTab = settingsMobile
	case "about":
		a.settingsTab = settingsAbout
	}
}

// DebugOpenPreview opens the first visible item's preview, for screenshots.
func (a *App) DebugOpenPreview() {
	a.update(func() {
		vis := a.visibleItems()
		if len(vis) == 0 {
			return
		}
		a.selectedIndex = 0
		a.selectedID = vis[0].ID
		a.syncEditor(&vis[0])
		a.openPreview(vis[0].ID)
	})
}

// LoadPersistedSettings reads the saved theme and language at startup.
func (a *App) LoadPersistedSettings() {
	if a.svc == nil {
		return
	}
	if mode := a.svc.GetTheme(); mode != "" {
		a.themeMode = mode
	} else {
		a.themeMode = core.ThemeSystem
	}
	a.language = a.svc.GetLanguage()
}

// DebugConfigure applies a view, query, category or layout for screenshots.
func (a *App) DebugConfigure(view, query, category, layout string) {
	a.update(func() {
		if view != "" {
			a.setView(view)
		}
		if query != "" {
			a.query = query
			a.markDirty()
			a.refreshItems()
		}
		if category != "" {
			a.category = category
			a.markDirty()
		}
		if layout != "" {
			a.layout = layout
		}
		if a.lib != nil {
			a.libraryFrame = time.Time{}
		}
		a.host.rebuildAll()
	})
}

// DebugSelectFirst selects the first visible item for screenshots.
func (a *App) DebugSelectFirst() {
	a.update(func() {
		vis := a.visibleItems()
		if len(vis) == 0 {
			return
		}
		a.selectedIndex = 0
		a.selectedID = vis[0].ID
		a.selection.Add(vis[0].ID)
		a.syncEditor(&vis[0])
		a.host.rebuildAll()
	})
}

// DebugSetTheme switches theme mode after startup, for screenshots.
func (a *App) DebugSetTheme(mode string) { a.setThemeMode(mode) }
