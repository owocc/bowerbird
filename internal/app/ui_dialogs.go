package app

import (
	"path/filepath"
	"strings"

	"github.com/egoist/mygo"
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

func (a *App) writeFilesToClipboard(paths []string) error {
	if a.OnWriteFiles != nil {
		return a.OnWriteFiles(paths)
	}
	return mygo.Clipboard.WriteFiles(paths...)
}

func (a *App) copySelected() {
	var ids []string
	if a.previewOpen && a.previewIndex >= 0 && a.previewIndex < len(a.items) {
		ids = []string{a.items[a.previewIndex].ID}
	} else {
		ids = a.selectedIDs()
		if len(ids) == 0 && a.activeItemID != "" {
			ids = []string{a.activeItemID}
		}
	}
	if len(ids) == 0 {
		return
	}

	if a.svc != nil {
		if err := a.svc.CopyItemsToClipboard(ids); err == nil {
			a.showToast(a.t("common.copied"))
			return
		}
	}

	paths := make([]string, 0, len(ids))
	idSet := make(map[string]bool, len(ids))
	for _, id := range ids {
		idSet[id] = true
	}
	for _, it := range a.items {
		if idSet[it.ID] && it.FilePath != "" {
			absPath, err := filepath.Abs(it.FilePath)
			if err == nil {
				paths = append(paths, absPath)
			} else {
				paths = append(paths, it.FilePath)
			}
		}
	}
	if len(paths) > 0 {
		if err := a.writeFilesToClipboard(paths); err == nil {
			a.showToast(a.t("common.copied"))
		}
	}
}

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
