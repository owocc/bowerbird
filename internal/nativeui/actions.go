package nativeui

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"bowerbird/core"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/transfer"
	"github.com/egoist/mygo/ui"
)

// ---------------------------------------------------------------------------
// Navigation and filters

func (a *App) setView(v string) {
	a.view = v
	a.folderID = ""
	a.tagFilter = ""
	a.selection.Clear()
	a.selectedIndex = -1
	a.selectedID = ""
	a.markDirty()
	a.grid.ScrollTo(0, ui.Start)
	a.invalidate()
}

func (a *App) selectFolder(id string) {
	a.view = viewAll
	a.folderID = id
	a.tagFilter = ""
	a.selectedIndex = -1
	a.selectedID = ""
	a.selection.Clear()
	a.markDirty()
	a.grid.ScrollTo(0, ui.Start)
	a.invalidate()
}

func (a *App) selectTag(name string) {
	a.view = viewAll
	a.folderID = ""
	a.tagFilter = name
	a.selectedIndex = -1
	a.selectedID = ""
	a.selection.Clear()
	a.markDirty()
	a.grid.ScrollTo(0, ui.Start)
	a.invalidate()
}

func (a *App) setSortAsc(asc bool) {
	a.sortAsc = asc
	a.markDirty()
	a.refreshItems()
	a.invalidate()
}

func (a *App) setLayout(l string) {
	a.layout = l
	a.invalidate()
}

func (a *App) setRowHeight(h float32) {
	if h < 80 {
		h = 80
	}
	if h > 260 {
		h = 260
	}
	a.rowHeight = h
	a.invalidate()
}

func (a *App) clearFilters() {
	a.category = "all"
	a.colorFilter = ""
	a.filterFolder = ""
	a.orientation = "all"
	a.sizeFilter = "all"
	a.hasURL = "all"
	a.hasNote = "all"
	a.ratingFilter = -1
	a.markDirty()
	a.invalidate()
}

func (a *App) hasFilters() bool {
	return a.category != "all" || a.colorFilter != "" || a.filterFolder != "" ||
		a.orientation != "all" || a.sizeFilter != "all" || a.hasURL != "all" ||
		a.hasNote != "all" || a.ratingFilter >= 0
}

func (a *App) activeFilterCount() int {
	n := 0
	if a.category != "all" {
		n++
	}
	if a.colorFilter != "" {
		n++
	}
	if a.filterFolder != "" {
		n++
	}
	if a.orientation != "all" {
		n++
	}
	if a.sizeFilter != "all" {
		n++
	}
	if a.hasURL != "all" {
		n++
	}
	if a.hasNote != "all" {
		n++
	}
	if a.ratingFilter >= 0 {
		n++
	}
	return n
}

// ---------------------------------------------------------------------------
// Import

func (a *App) chooseAndImportFiles() {
	go func() {
		paths, err := mygo.Dialog.Open(mygo.OpenDialogOptions{
			Title:    a.tr("Import files", "导入文件"),
			Multiple: true,
			Filters: []mygo.FileFilter{
				{Name: a.tr("Media", "媒体文件"), Extensions: []string{"png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "mp4", "mov", "mkv", "webm", "mp3", "wav", "pdf", "zip"}},
				{Name: a.tr("All files", "所有文件"), Extensions: []string{"*"}},
			},
		})
		if err != nil {
			a.report(err)
			return
		}
		if len(paths) == 0 {
			return
		}
		a.importPaths(paths, a.currentFolderID())
	}()
}

func (a *App) chooseAndImportFolder() {
	go func() {
		dir, err := a.svc.SelectDirectory()
		if err != nil {
			a.report(err)
			return
		}
		if dir == "" {
			return
		}
		a.importFolder(dir)
	}()
}

func (a *App) importFolder(dir string) {
	a.update(func() {
		a.importing = true
		a.importTotal = 0
		a.importCur = 0
	})
	go func() {
		_, err := a.svc.ImportFoldersRecursively([]string{dir}, a.currentFolderID())
		if err != nil {
			a.report(err)
		}
		a.update(func() {
			a.importing = false
			a.thumbs.reset()
			a.refreshAll()
			a.host.invalidateAll()
		})
	}()
}

func (a *App) importPaths(paths []string, folderID string) {
	if len(paths) == 0 {
		return
	}
	a.update(func() {
		a.importing = true
		a.importCur = 0
		a.importTotal = len(paths)
	})
	go func() {
		items, err := a.svc.ImportFiles(paths)
		if err != nil {
			a.report(err)
		} else if folderID != "" {
			ids := make([]string, 0, len(items))
			for i := range items {
				ids = append(ids, items[i].ID)
			}
			for _, id := range ids {
				if err := a.svc.AddItemToFolder(id, folderID); err != nil {
					log.Printf("[NativeImport] add to folder: %v", err)
				}
			}
		}
		a.update(func() {
			a.importing = false
			a.importCur, a.importTotal = 0, 0
			a.thumbs.reset()
			a.refreshAll()
			if err == nil {
				a.pendingToast = fmt.Sprintf(a.tr("Imported %d file(s)", "已导入 %d 个文件"), len(items))
			}
			a.host.invalidateAll()
		})
	}()
}

// ---------------------------------------------------------------------------
// Delete / restore

func (a *App) requestDeleteSelected() {
	items := a.selectedItems()
	if len(items) == 0 {
		return
	}
	if a.view == viewTrash {
		a.confirm.open = true
		a.confirm.title = a.tr("Delete permanently?", "永久删除？")
		a.confirm.msg = fmt.Sprintf(a.tr("%d item(s) will be deleted and cannot be recovered.", "将永久删除 %d 个素材，无法恢复。"), len(items))
		a.confirm.action = "delete-permanent"
		return
	}
	a.confirm.open = true
	a.confirm.title = a.tr("Move to Trash?", "移入废纸篓？")
	a.confirm.msg = fmt.Sprintf(a.tr("%d item(s) will be moved to the trash.", "将把 %d 个素材移入废纸篓。"), len(items))
	a.confirm.action = "trash"
}

func (a *App) requestRestoreSelected() {
	items := a.selectedItems()
	if len(items) == 0 {
		return
	}
	ids := make([]string, 0, len(items))
	for i := range items {
		ids = append(ids, items[i].ID)
	}
	go func() {
		if err := a.svc.BatchRestoreFromTrash(ids); err != nil {
			a.report(err)
			return
		}
		a.update(func() {
			a.refreshAll()
			a.pendingToast = a.tr("Restored", "已恢复")
			a.host.invalidateAll()
		})
	}()
}

func (a *App) requestEmptyTrash() {
	a.confirm.open = true
	a.confirm.title = a.tr("Empty Trash?", "清空废纸篓？")
	a.confirm.msg = a.tr("Every item in the trash will be deleted permanently.", "废纸篓中的所有素材将被永久删除。")
	a.confirm.action = "empty-trash"
}

func (a *App) runConfirm(kind string) {
	items := a.selectedItems()
	ids := make([]string, 0, len(items))
	for i := range items {
		ids = append(ids, items[i].ID)
	}
	switch kind {
	case "trash":
		go func() {
			if err := a.svc.BatchMoveToTrash(ids); err != nil {
				a.report(err)
				return
			}
			a.update(func() {
				a.selection.Clear()
				a.selectedIndex = -1
				a.selectedID = ""
				a.refreshAll()
				a.pendingToast = a.tr("Moved to Trash", "已移入废纸篓")
				a.host.invalidateAll()
			})
		}()
	case "delete-permanent":
		go func() {
			for _, id := range ids {
				if err := a.svc.PermanentDeleteItem(id); err != nil {
					a.report(err)
					return
				}
			}
			a.update(func() {
				a.selection.Clear()
				a.selectedIndex = -1
				a.selectedID = ""
				a.refreshAll()
				a.host.invalidateAll()
			})
		}()
	case "empty-trash":
		go func() {
			if err := a.svc.EmptyTrash(); err != nil {
				a.report(err)
				return
			}
			a.update(func() {
				a.refreshAll()
				a.pendingToast = a.tr("Trash emptied", "废纸篓已清空")
				a.host.invalidateAll()
			})
		}()
	case "delete-folder":
		a.doDeleteFolder()
	}
}

// ---------------------------------------------------------------------------
// Inspector actions

func (a *App) saveEditor() {
	it := a.activeItem()
	if it == nil {
		return
	}
	id := it.ID
	origName := it.Name
	name, note, rawURL, prompt, rating := a.draftName, a.draftNote, a.draftURL, a.draftPrompt, a.draftRating
	go func() {
		if strings.TrimSpace(name) != "" && name != origName {
			if _, err := a.svc.RenameItem(id, strings.TrimSpace(name)); err != nil {
				a.report(err)
				return
			}
		}
		if _, err := a.svc.UpdateItemDetails(id, note, rawURL, rating, prompt); err != nil {
			a.report(err)
			return
		}
		a.update(func() {
			a.editorDirty = false
			a.refreshItems()
			a.pendingToast = a.tr("Saved", "已保存")
			a.host.invalidateAll()
		})
	}()
}

func (a *App) toggleFavorite(id string) {
	go func() {
		if _, err := a.svc.ToggleFavorite(id); err != nil {
			a.report(err)
			return
		}
		a.update(func() {
			a.refreshItems()
			a.host.invalidateAll()
		})
	}()
}

func (a *App) setRating(id string, rating int) {
	note, rawURL, prompt := a.draftNote, a.draftURL, a.draftPrompt
	go func() {
		if _, err := a.svc.UpdateItemDetails(id, note, rawURL, rating, prompt); err != nil {
			a.report(err)
			return
		}
		a.update(func() {
			a.refreshItems()
			a.host.invalidateAll()
		})
	}()
}

func (a *App) setItemTags(id string, tags []string) {
	tags = append([]string(nil), tags...)
	go func() {
		if err := a.svc.SetItemTags(id, tags); err != nil {
			a.report(err)
			return
		}
		a.update(func() {
			a.refreshItems()
			a.host.invalidateAll()
		})
	}()
}

func (a *App) setTagsForSelection(tags []string) {
	items := a.selectedItems()
	ids := make([]string, 0, len(items))
	for i := range items {
		ids = append(ids, items[i].ID)
	}
	go func() {
		for _, id := range ids {
			if err := a.svc.SetItemTags(id, tags); err != nil {
				a.report(err)
				return
			}
		}
		a.update(func() {
			a.refreshAll()
			a.host.invalidateAll()
		})
	}()
}

func (a *App) addSelectedToFolder(folderID string) {
	ids := a.selectedIDs()
	go func() {
		for _, id := range ids {
			if err := a.svc.AddItemToFolder(id, folderID); err != nil {
				a.report(err)
				return
			}
		}
		a.update(func() {
			a.refreshItems()
			a.pendingToast = a.tr("Added to folder", "已加入文件夹")
			a.host.invalidateAll()
		})
	}()
}

func (a *App) moveToFolder(ids []string, folderID string) {
	if len(ids) == 0 {
		return
	}
	go func() {
		for _, id := range ids {
			if err := a.svc.SetItemFolders(id, []string{folderID}); err != nil {
				a.report(err)
				return
			}
		}
		a.update(func() {
			a.refreshItems()
			a.pendingToast = a.tr("Moved", "已移动")
			a.host.invalidateAll()
		})
	}()
}

func (a *App) trashIDs(ids []string) {
	if len(ids) == 0 {
		return
	}
	go func() {
		if err := a.svc.BatchMoveToTrash(ids); err != nil {
			a.report(err)
			return
		}
		a.update(func() {
			a.refreshAll()
			a.host.invalidateAll()
		})
	}()
}

func (a *App) removeFromFolder(id, folderID string) {
	go func() {
		if err := a.svc.RemoveItemFromFolder(id, folderID); err != nil {
			a.report(err)
			return
		}
		a.update(func() {
			a.refreshItems()
			a.host.invalidateAll()
		})
	}()
}

func (a *App) selectedIDs() []string {
	items := a.selectedItems()
	out := make([]string, 0, len(items))
	for i := range items {
		out = append(out, items[i].ID)
	}
	return out
}

func (a *App) revealSelected() {
	it := a.activeItem()
	if it == nil {
		return
	}
	if err := a.svc.RevealInFinder(it.ID); err != nil {
		a.report(err)
	}
}

func (a *App) openSelected() {
	it := a.activeItem()
	if it == nil {
		return
	}
	if err := a.svc.OpenWithDefaultApp(it.ID); err != nil {
		a.report(err)
	}
}

func (a *App) copySelectedPaths() {
	items := a.selectedItems()
	parts := make([]string, 0, len(items))
	for i := range items {
		parts = append(parts, a.itemPath(&items[i]))
	}
	if len(parts) == 0 {
		return
	}
	if err := a.svc.WriteClipboardText(strings.Join(parts, "\n")); err == nil {
		a.toast(a.tr("Path copied", "路径已复制"))
	}
}

func (a *App) copySelectedFiles() {
	items := a.selectedItems()
	paths := make([]string, 0, len(items))
	for i := range items {
		paths = append(paths, a.itemPath(&items[i]))
	}
	if len(paths) == 0 {
		return
	}
	if err := a.svc.CopyItemsToClipboard(a.selectedIDs()); err != nil {
		a.report(err)
	} else {
		a.toast(a.tr("Files copied", "文件已复制"))
	}
}

func (a *App) dragPathsFor(it *core.Item) []string {
	var ids []string
	if a.selection.Has(it.ID) {
		for id := range a.selection.All() {
			ids = append(ids, id)
		}
	} else {
		ids = []string{it.ID}
	}
	vis := a.visibleItems()
	var out []string
	for _, id := range ids {
		for i := range vis {
			if vis[i].ID == id {
				out = append(out, a.itemPath(&vis[i]))
				break
			}
		}
	}
	if len(out) == 0 {
		out = append(out, a.itemPath(it))
	}
	return out
}

func (a *App) dragValuesFor(it *core.Item) []string {
	if a.selection.Has(it.ID) {
		var ids []string
		for id := range a.selection.All() {
			ids = append(ids, id)
		}
		return ids
	}
	return []string{it.ID}
}

func (a *App) fileDragData(it *core.Item) transfer.Data {
	paths := a.dragPathsFor(it)
	data, err := transfer.FileData(paths...)
	if err != nil {
		return transfer.TextData(it.Name)
	}
	return data
}

// ---------------------------------------------------------------------------
// Folders

func (a *App) openNewFolder(parent string) {
	a.folderDialog.open = true
	a.folderDialog.rename = false
	a.folderDialog.id = ""
	a.folderDialog.parent = parent
	a.folderDialog.name = a.tr("New Folder", "新建文件夹")
	a.invalidate()
}

func (a *App) openRenameFolder(f core.Folder) {
	a.folderDialog.open = true
	a.folderDialog.rename = true
	a.folderDialog.id = f.ID
	a.folderDialog.parent = f.ParentID
	a.folderDialog.name = f.Name
	a.invalidate()
}

func (a *App) submitFolderDialog() {
	name := strings.TrimSpace(a.folderDialog.name)
	if name == "" {
		return
	}
	if a.folderDialog.rename {
		id := a.folderDialog.id
		go func() {
			if err := a.svc.RenameFolder(id, name); err != nil {
				a.report(err)
				return
			}
			a.update(func() {
				a.refreshAll()
				a.host.invalidateAll()
			})
		}()
	} else {
		parent := a.folderDialog.parent
		go func() {
			if _, err := a.svc.CreateFolder(name, parent); err != nil {
				a.report(err)
				return
			}
			a.update(func() {
				a.refreshAll()
				a.host.invalidateAll()
			})
		}()
	}
	a.folderDialog.open = false
}

func (a *App) requestDeleteFolder(f core.Folder) {
	a.folderDialog.id = f.ID
	a.confirm.open = true
	a.confirm.title = a.tr("Delete folder?", "删除文件夹？")
	a.confirm.msg = fmt.Sprintf(a.tr("Delete “%s”? Items inside are kept in the library.", "删除“%s”？其中的素材仍保留在库中。"), f.Name)
	a.confirm.action = "delete-folder"
}

func (a *App) doDeleteFolder() {
	id := a.folderDialog.id
	if id == "" {
		return
	}
	go func() {
		if err := a.svc.DeleteFolder(id); err != nil {
			a.report(err)
			return
		}
		a.update(func() {
			if a.folderID == id {
				a.folderID = ""
			}
			a.refreshAll()
			a.host.invalidateAll()
		})
	}()
}

// ---------------------------------------------------------------------------
// Preview

func (a *App) openPreview(id string) {
	a.preview.open = true
	a.preview.id = id
	a.invalidate()
}

func (a *App) previewItem() *core.Item {
	if a.preview.id != "" {
		if it := a.findItem(a.preview.id); it != nil {
			return it
		}
	}
	return a.activeItem()
}

func (a *App) findItem(id string) *core.Item {
	for i := range a.items {
		if a.items[i].ID == id {
			it := a.items[i]
			return &it
		}
	}
	for i := range a.trash {
		if a.trash[i].ID == id {
			it := a.trash[i]
			return &it
		}
	}
	return nil
}

func (a *App) previewStep(delta int) {
	vis := a.visibleItems()
	if len(vis) == 0 {
		return
	}
	idx := -1
	for i := range vis {
		if vis[i].ID == a.preview.id {
			idx = i
			break
		}
	}
	if idx < 0 {
		idx = 0
	}
	idx = (idx + delta + len(vis)) % len(vis)
	a.preview.id = vis[idx].ID
	a.selectedID = vis[idx].ID
	a.selectedIndex = idx
	a.invalidate()
}

// ---------------------------------------------------------------------------
// Library lifecycle

func (a *App) prepareSetup() {
	if a.setupName == "" {
		a.setupName = "MyAssets"
	}
	if a.setupDir == "" {
		if home, err := os.UserHomeDir(); err == nil {
			a.setupDir = filepath.Join(home, "Pictures")
		}
	}
}

func (a *App) chooseSetupDir() {
	go func() {
		dir, err := a.svc.SelectDirectory()
		if err != nil {
			a.report(err)
			return
		}
		if dir == "" {
			return
		}
		a.updateNamed("setup", func() {
			a.setupDir = dir
		})
	}()
}

func (a *App) createLibrary() {
	name := strings.TrimSpace(a.setupName)
	dir := strings.TrimSpace(a.setupDir)
	if name == "" || dir == "" {
		a.toast(a.tr("Choose a folder and a library name.", "请选择目录并填写库名称。"))
		return
	}
	go func() {
		if _, err := a.svc.CreateLibrary(dir, name); err != nil {
			a.report(err)
			return
		}
		a.update(func() {
			a.refreshAll()
			a.pendingToast = a.tr("Library created", "库已创建")
			a.host.rebuildAll()
		})
	}()
}

func (a *App) openLibraryDialog() {
	go func() {
		path, err := a.svc.SelectLibraryDialog()
		if err != nil {
			a.report(err)
			return
		}
		if path == "" {
			return
		}
		a.openLibraryPath(path)
	}()
}

func (a *App) openLibraryPath(path string) {
	go func() {
		if _, err := a.svc.OpenLibrary(path); err != nil {
			a.report(err)
			return
		}
		a.update(func() {
			a.thumbs.reset()
			a.refreshAll()
			a.host.invalidateAll()
		})
	}()
}

func (a *App) closeLibrary() {
	go func() {
		if err := a.svc.CloseLibrary(); err != nil {
			a.report(err)
			return
		}
		a.update(func() {
			a.thumbs.reset()
			a.lib = nil
			a.items = nil
			a.trash = nil
			a.visibleSet = false
			a.selectedIndex = -1
			a.selectedID = ""
			a.selection.Clear()
			a.host.invalidateAll()
			a.maybeOpenSetup()
		})
	}()
}

// ---------------------------------------------------------------------------
// Settings

const (
	settingsGeneral = iota
	settingsShortcuts
	settingsPlugins
	settingsNetwork
	settingsData
	settingsExtension
	settingsMobile
	settingsAbout
)

func (a *App) loadSettings() {
	a.loading = false
	a.themeMode = a.svc.GetTheme()
	if a.themeMode == "" {
		a.themeMode = core.ThemeSystem
	}
	a.language = a.svc.GetLanguage()
	net := a.svc.GetNetworkSettings()
	a.proxyMode = net.ProxyMode
	if a.proxyMode == "" {
		a.proxyMode = "system"
	}
	a.customProxy = net.CustomProxy
	a.reloadMobile()
}

func (a *App) reloadMobile() {
	status, err := a.svc.GetMobileServerStatus()
	if err != nil {
		log.Printf("[NativeMobile] %v", err)
		return
	}
	a.mobile = status
	a.mobileOn = status.Enabled
}

func (a *App) setThemeMode(mode string) {
	a.themeMode = mode
	go func() {
		if err := a.svc.SetTheme(mode); err != nil {
			a.report(err)
			return
		}
		a.update(func() { a.host.invalidateAll() })
	}()
}

func (a *App) setLanguageMode(lang string) {
	a.language = lang
	go func() {
		if err := a.svc.SetLanguage(lang); err != nil {
			a.report(err)
			return
		}
		a.update(func() {
			a.host.rebuildTrayMenu()
			a.host.invalidateAll()
		})
	}()
}

func (a *App) saveNetworkSettings() {
	mode := a.proxyMode
	proxy := strings.TrimSpace(a.customProxy)
	go func() {
		if err := a.svc.SetNetworkSettings(core.NetworkSettings{ProxyMode: mode, CustomProxy: proxy}); err != nil {
			a.report(err)
			return
		}
		a.update(func() {
			a.pendingToast = a.tr("Network settings saved", "网络设置已保存")
			a.host.invalidateAll()
		})
	}()
}

func (a *App) testNetwork() {
	target := strings.TrimSpace(a.testURL)
	if target == "" {
		return
	}
	a.testPending = true
	a.testResult = ""
	a.invalidate()
	go func() {
		res, err := a.svc.TestNetworkConnection(target)
		a.update(func() {
			a.testPending = false
			if err != nil {
				a.testResult = err.Error()
			} else if res != nil {
				if res.Success {
					a.testResult = fmt.Sprintf(a.tr("OK — %d ms, proxy %s", "成功 — %d ms，代理 %s"), res.LatencyMs, res.ActiveProxy)
				} else {
					a.testResult = res.Error
				}
			}
			a.host.invalidateAll()
		})
	}()
}

func (a *App) setMobileEnabled(on bool) {
	a.mobileOn = on
	go func() {
		if err := a.svc.SetMobileServerEnabled(on); err != nil {
			a.report(err)
			return
		}
		a.updateNamed("settings", func() {
			a.reloadMobile()
		})
	}()
}

func (a *App) regeneratePairing() {
	go func() {
		if _, err := a.svc.RegenerateMobilePairingCode(); err != nil {
			a.report(err)
			return
		}
		a.updateNamed("settings", func() {
			a.qrURL = ""
			a.reloadMobile()
		})
	}()
}

func (a *App) pairingURL() string {
	if a.mobile == nil || !a.mobile.Running {
		return ""
	}
	u, err := a.svc.GetMobilePairingURL()
	if err != nil {
		return ""
	}
	return u
}

func (a *App) setAllowedNetworks(networks []string) {
	go func() {
		if err := a.svc.SetMobileAllowedNetworks(networks); err != nil {
			a.report(err)
			return
		}
		a.updateNamed("settings", func() {
			a.reloadMobile()
		})
	}()
}

func (a *App) loadLogs() {
	a.logs = a.svc.GetLogs()
}

func (a *App) clearLogs() {
	go func() {
		if err := a.svc.ClearLogs(); err != nil {
			a.report(err)
			return
		}
		a.updateNamed("logs", func() { a.logs = nil })
	}()
}

func (a *App) revealLogFile() {
	if err := a.svc.RevealLogFile(); err != nil {
		a.report(err)
	}
}

func (a *App) openSettings() {
	if err := a.svc.OpenSettingsWindow(); err != nil {
		a.report(err)
	}
}

func (a *App) openLogs() {
	if err := a.svc.OpenLogsWindow(); err != nil {
		a.report(err)
	}
}

func (a *App) openSetup() {
	if err := a.svc.OpenSetupWindow(); err != nil {
		a.report(err)
	}
}
