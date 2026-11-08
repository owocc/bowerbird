package app

import (
	"time"

	"github.com/egoist/mygo/ui"
)

// viewMain builds one frame of the primary workspace. It has a single root:
// mygo lays out the top-level children of a view as the window, so a backdrop,
// the workspace, toasts and dialogs must be children of one Box rather than
// sibling roots.
func (a *App) viewMain(c *ui.Context) {
	p := paletteFor(c.Theme())
	a.handleMainShortcuts(c)
	a.applyVibrancyRoot(c)
	root := ui.Box(c).Fill()
	a.applyBackdrop(root, c.Theme())
	root.Children(func() {
		ui.Row(c).Fill().AlignItems(ui.Stretch).Children(func() {
			if a.prefs.SidebarOpen {
				a.viewSidebar(c)
				ui.Box(c).Width(1).FillHeight().Background(p.hairline)
			}
			ui.Column(c).FillHeight().Grow(1).Shrink(1).MinWidth(0).Children(func() {
				if a.previewOpen && a.previewMode == "inline" {
					a.viewPreviewToolbar(c)
					ui.Box(c).FillWidth().Height(1).Background(p.hairline)
					a.mainBodySurface(c, func() {
						if len(a.items) > 0 && a.previewIndex >= 0 && a.previewIndex < len(a.items) {
							a.viewPreviewBody(c, a.items[a.previewIndex])
						}
					})
					return
				}
				a.mainBodySurface(c, func() {
					if a.library == nil {
						a.emptyState(c, iconLibrary, a.t("app.noActiveLibrary"), a.t("app.openSetup"))
						return
					}
					if a.nav == NavTags {
						a.viewTags(c)
						return
					}
					a.viewGallery(c)
				})
				a.viewHeader(c)
			})
			if a.prefs.InspectorOpen && a.library != nil {
				ui.Box(c).Width(1).FillHeight().Background(p.hairline)
				a.viewInspector(c)
			}
		})
		if a.previewOpen && a.previewMode == "full" {
			ui.Overlay(c, func() {
				overlay := ui.Box(c).Absolute().Fill().Background(p.bg).Focusable().AutoFocus().Modal()
				overlay.HandleInput(func(ev ui.InputEvent) bool {
					if ev.Kind == ui.InputKeyDown && (ev.Key == ui.KeySpace || ev.Key == ui.KeyEscape) {
						a.closePreview()
						return true
					}
					return false
				})
				if overlay.OverlayShortcut(0, ui.KeySpace) || overlay.OverlayShortcut(0, ui.KeyEscape) {
					a.closePreview()
				}
				overlay.Children(func() {
					a.viewPreview(c)
				})
			})
		}
		a.viewToast(c)
		a.viewDialog(c)
	})
}

// mainBodySurface keeps the native window material behind the header only:
// the workspace under it is opaque whenever the transparent backdrop exposes
// that material. With the material switched off, the window backdrop already
// paints the body, so no extra fill is needed.
func (a *App) mainBodySurface(c *ui.Context, body func()) {
	e := ui.Box(c).FillWidth().Grow(1).Shrink(1)
	e.ContextMenu(a.viewContextMenu)
	if c.Vibrancy() && a.backdropMode == "transparent" {
		// The workspace fills the whole column, including the strip behind
		// the floating header. Leaving that strip unpainted made the top of
		// the window look like a missing piece of the background.
		e.Background(paletteFor(c.Theme()).bg)
	}
	e.Children(body)
}

func (a *App) handleMainShortcuts(c *ui.Context) {
	if c.Shortcut(ui.Cmd, ui.KeyF) {
		a.searchBox.Focus(c)
	}
	if c.Shortcut(ui.Cmd, ui.KeyComma) {
		if a.OnOpenSettings != nil {
			a.OnOpenSettings()
		}
	}
	if c.Shortcut(ui.Cmd|ui.Shift, ui.KeyL) {
		if a.OnOpenLogs != nil {
			a.OnOpenLogs()
		}
	}
	if c.Shortcut(ui.Cmd, ui.KeyR) {
		a.refreshAll()
	}
	if c.Shortcut(ui.Cmd, ui.KeyA) && !a.previewOpen {
		for _, it := range a.items {
			a.selected[it.ID] = true
		}
		a.selectedAt = len(a.items) - 1
		if len(a.items) > 0 {
			a.activeItemID = a.items[0].ID
		}
	}
	if c.Shortcut(0, ui.KeyEscape) {
		if a.previewOpen {
			a.closePreview()
		} else if a.dialog != dialogNone {
			a.dialog = dialogNone
		} else if len(a.selected) > 0 {
			a.clearSelection()
		}
	}
	if c.Shortcut(0, ui.KeySpace) {
		if a.previewOpen {
			a.closePreview()
		} else {
			targetID := a.activeItemID
			if targetID == "" && len(a.selected) > 0 {
				for id := range a.selected {
					targetID = id
					break
				}
			}
			if targetID != "" {
				a.openPreview(targetID, "full")
			}
		}
	}
	if a.previewOpen {
		if c.Shortcut(0, ui.KeyLeft) {
			a.movePreview(-1)
		}
		if c.Shortcut(0, ui.KeyRight) {
			a.movePreview(1)
		}
		if c.Shortcut(ui.Cmd, ui.KeyEqual) {
			a.previewZoom = minF(a.previewZoom*1.2, 8)
		}
		if c.Shortcut(ui.Cmd, ui.KeyMinus) {
			a.previewZoom = maxF(a.previewZoom/1.2, 0.2)
		}
		if c.Shortcut(ui.Cmd, ui.Key0) {
			a.previewZoom = 1
			a.previewPan = ui.Point{}
		}
		return
	}
	if c.Shortcut(0, ui.KeyLeft) {
		a.moveGallerySelection(-1, 0)
	}
	if c.Shortcut(0, ui.KeyRight) {
		a.moveGallerySelection(1, 0)
	}
	if c.Shortcut(0, ui.KeyUp) {
		a.moveGallerySelection(0, -1)
	}
	if c.Shortcut(0, ui.KeyDown) {
		a.moveGallerySelection(0, 1)
	}
	if c.Shortcut(ui.Cmd, ui.KeyEqual) {
		a.setRowHeight(a.rowHeight + 24)
	}
	if c.Shortcut(ui.Cmd, ui.KeyMinus) {
		a.setRowHeight(a.rowHeight - 24)
	}
	if c.Shortcut(ui.Cmd, ui.Key0) {
		a.setRowHeight(190)
	}
	if c.Shortcut(ui.Cmd|ui.Shift, ui.KeyB) {
		a.prefs.SidebarOpen = !a.prefs.SidebarOpen
		a.savePrefs()
		a.rebuildRows()
	}
	if c.Shortcut(ui.Cmd|ui.Shift, ui.KeyI) {
		a.prefs.InspectorOpen = !a.prefs.InspectorOpen
		a.savePrefs()
	}
}

func (a *App) setRowHeight(h int) {
	if h < 90 {
		h = 90
	}
	if h > 420 {
		h = 420
	}
	if h == a.rowHeight {
		return
	}
	a.rowHeight = h
	a.prefs.RowHeight = float64(h)
	a.savePrefs()
	a.rebuildRows()
}

func (a *App) clearSelection() {
	a.selected = map[string]bool{}
	a.selectedOrder = nil
	a.selectedAt = -1
	a.activeItemID = ""
	a.activeItem = nil
}

func (a *App) viewToast(c *ui.Context) {
	if !a.toastActive() {
		return
	}
	p := paletteFor(c.Theme())
	ui.Row(c).Absolute().Left(0).Right(0).Bottom(24).Justify(ui.Center).Children(func() {
		ui.Row(c).PaddingX(16).Height(38).Radius(999).Background(p.text).Shadow(0, 12, 30, -8, p.cardShade).AlignItems(ui.Center).Gap(8).Children(func() {
			ui.Icon(c, iconCheck).Size(15, 15).TextColor(p.bg)
			ui.Text(c, a.toast).FontSize(12).FontWeight(550).TextColor(p.bg).MaxWidth(560).SingleLine()
		})
	})
	// Keep frames coming while the toast is visible so it disappears on time.
	c.After(time.Until(a.toastUntil))
}

func (a *App) viewDialog(c *ui.Context) {
	if a.dialog == dialogNone {
		return
	}
	open := true
	backdropFill := func(backdrop ui.Element) { backdrop.Background(ui.RGBA(0, 0, 0, 0.35)) }
	show := func(title string, body func(), confirmLabel string, confirm func()) {
		ui.DialogBase(c, &open, func(backdrop, panel ui.Element) {
			backdropFill(backdrop)
			a.dialogPanel(c, panel, title, body, confirmLabel, confirm)
		})
	}
	switch a.dialog {
	case dialogNewLibrary:
		show(a.t("sidebar.createLibrary"), func() {
			p := paletteFor(c.Theme())
			ui.Text(c, a.t("setup.createDescription")).FontSize(12).TextColor(p.muted)
			ui.TextInput(c, &a.dialogValue).Placeholder(a.t("setup.libraryName")).AutoFocus()
			if a.dialogError != "" {
				ui.Text(c, a.dialogError).FontSize(11).TextColor(p.danger)
			}
		}, a.t("common.create"), a.createLibraryFromDialog)
	case dialogNewFolder:
		show(a.t("sidebar.newFolder"), func() {
			ui.TextInput(c, &a.dialogValue).Placeholder(a.t("sidebar.folderName")).AutoFocus()
		}, a.t("common.create"), a.createFolderFromDialog)
	case dialogRenameFolder:
		show(a.t("common.rename"), func() {
			ui.TextInput(c, &a.dialogValue).AutoFocus()
		}, a.t("common.save"), a.renameFolderFromDialog)
	case dialogDeleteFolder:
		show(a.t("common.deleteFolder"), func() {
			ui.Text(c, a.dialogValue).FontSize(12)
		}, a.t("common.delete"), a.deleteFolderFromDialog)
	case dialogPluginInstall:
		show(a.t("settings.plugins.installTitle"), func() {
			p := paletteFor(c.Theme())
			req := a.pendingInstall
			if req != nil {
				ui.Text(c, req.Name).FontSize(15).FontWeight(600).TextColor(p.text)
				ui.Text(c, req.ManifestURL).FontSize(11).TextColor(p.muted).Wrap()
			} else {
				ui.Text(c, a.t("settings.plugins.installHint")).FontSize(12).TextColor(p.muted)
				ui.TextInput(c, &a.dialogValue).Placeholder("https://…/plugin.json")
			}
		}, a.t("common.confirm"), a.installPluginFromDialog)
	case dialogTag:
		show(a.t("sidebar.tags"), func() {
			ui.TextInput(c, &a.dialogValue).Placeholder(a.t("tags.searchOrCreate")).AutoFocus()
		}, a.t("common.save"), a.addTagToActive)
	}
	if !open {
		a.dialog = dialogNone
		a.dialogError = ""
	}
}

func (a *App) dialogPanel(c *ui.Context, panel ui.Element, title string, body func(), confirmLabel string, confirm func()) {
	p := paletteFor(c.Theme())
	panel.Width(420).Padding(22).Radius(14).Background(p.surface).Border(1, p.hairline).Shadow(0, 26, 64, -18, p.cardShade).Children(func() {
		ui.Column(c).FillWidth().Gap(14).Children(func() {
			ui.Text(c, title).FontSize(17).FontWeight(650).TextColor(p.text)
			body()
			ui.Row(c).FillWidth().Justify(ui.End).Gap(8).Children(func() {
				if ui.Button(c, a.t("common.cancel")).Clicked() {
					a.dialog = dialogNone
				}
				if ui.PrimaryButton(c, confirmLabel).Clicked() {
					confirm()
				}
			})
		})
	})
}

func (a *App) closePreview() {
	a.previewOpen = false
	a.previewText = ""
	a.previewError = ""
	if a.player != nil {
		a.player.Stop()
		a.player = nil
	}
}

func (a *App) openPreview(id string, mode string) {
	if mode == "" {
		mode = "inline"
	}
	a.activeItemID = id
	a.previewIndex = a.indexFor(id)
	a.previewOpen = true
	a.previewMode = mode
	a.previewZoom = 1
	a.previewPan = ui.Point{}
	a.loadPreviewContent()
}

func (a *App) indexFor(id string) int {
	for i := range a.items {
		if a.items[i].ID == id {
			return i
		}
	}
	return 0
}

func (a *App) movePreview(delta int) {
	if len(a.items) == 0 {
		return
	}
	n := a.previewIndex + delta
	if n < 0 {
		n = len(a.items) - 1
	}
	if n >= len(a.items) {
		n = 0
	}
	a.previewIndex = n
	a.activeItemID = a.items[n].ID
	a.activeItem = &a.items[n]
	a.previewZoom = 1
	a.previewPan = ui.Point{}
	a.loadPreviewContent()
}
