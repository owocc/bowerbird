package app

import (
	"strings"
)

// Dialog actions. They run the core calls off the main thread and post both the
// result and any error back through the app's normal state path.

func (a *App) createLibraryFromDialog() {
	name := strings.TrimSpace(a.dialogValue)
	if name == "" {
		a.dialogError = a.t("setup.libraryNameRequired")
		return
	}
	a.dialog = dialogNone
	go func() {
		parent, err := a.svc.SelectDirectory()
		if err != nil || parent == "" {
			return
		}
		_, err = a.svc.CreateLibrary(parent, name)
		a.post(func() {
			if err != nil {
				a.showToast(err.Error())
				return
			}
			a.refreshAll()
		})
	}()
}

func (a *App) createFolderFromDialog() {
	name := strings.TrimSpace(a.dialogValue)
	if name == "" {
		return
	}
	parent := ""
	if a.nav == NavFolder {
		parent = a.folderID
	}
	a.dialog = dialogNone
	go func() {
		_, err := a.svc.CreateFolder(name, parent)
		a.post(func() {
			if err != nil {
				a.showToast(err.Error())
				return
			}
			if parent != "" {
				a.expanded[parent] = true
			}
			a.refreshAll()
		})
	}()
}

func (a *App) renameFolderFromDialog() {
	name := strings.TrimSpace(a.dialogValue)
	if name == "" || a.folderID == "" {
		a.dialog = dialogNone
		return
	}
	id := a.folderID
	a.dialog = dialogNone
	go func() {
		err := a.svc.RenameFolder(id, name)
		a.post(func() {
			if err != nil {
				a.showToast(err.Error())
			}
			a.refreshAll()
		})
	}()
}

func (a *App) deleteFolderFromDialog() {
	id := a.folderID
	a.dialog = dialogNone
	if id == "" {
		return
	}
	go func() {
		err := a.svc.DeleteFolder(id)
		a.post(func() {
			if err != nil {
				a.showToast(err.Error())
				return
			}
			if a.nav == NavFolder && a.folderID == id {
				a.navigate(NavAll, "")
				return
			}
			a.refreshAll()
		})
	}()
}

func (a *App) installPluginFromDialog() {
	req := a.pendingInstall
	target := ""
	if req != nil {
		target = req.ManifestURL
	} else {
		target = strings.TrimSpace(a.dialogValue)
	}
	a.dialog = dialogNone
	if target == "" {
		return
	}
	if a.svc != nil {
		_ = a.svc.ClearPendingPluginInstall()
	}
	a.pendingInstall = nil
	go func() {
		_, err := a.svc.InstallPlugin(target)
		if a.pluginHost != nil {
			a.pluginHost.Scan()
		}
		a.post(func() {
			if err != nil {
				a.showToast(err.Error())
			} else {
				a.showToast(a.t("settings.plugins.installed"))
			}
			a.refreshAll()
		})
	}()
}

// Workspace mutations shared by the context menu and inspector.

func (a *App) trashSelected() {
	ids := a.selectedIDs()
	if len(ids) == 0 {
		return
	}
	go func() {
		var err error
		if len(ids) == 1 {
			err = a.svc.MoveToTrash(ids[0])
		} else {
			err = a.svc.BatchMoveToTrash(ids)
		}
		a.post(func() {
			if err != nil {
				a.showToast(err.Error())
			}
			a.clearSelection()
			a.refreshAll()
		})
	}()
}

func (a *App) restoreSelected() {
	ids := a.selectedIDs()
	if len(ids) == 0 {
		return
	}
	go func() {
		var err error
		if len(ids) == 1 {
			err = a.svc.RestoreFromTrash(ids[0])
		} else {
			err = a.svc.BatchRestoreFromTrash(ids)
		}
		a.post(func() {
			if err != nil {
				a.showToast(err.Error())
			}
			a.clearSelection()
			a.refreshAll()
		})
	}()
}

func (a *App) deleteSelectedPermanently() {
	ids := a.selectedIDs()
	if len(ids) == 0 {
		return
	}
	go func() {
		for _, id := range ids {
			_ = a.svc.PermanentDeleteItem(id)
		}
		a.post(func() {
			a.clearSelection()
			a.refreshAll()
		})
	}()
}
