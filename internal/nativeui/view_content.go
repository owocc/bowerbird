package nativeui

import (
	"fmt"
	"strings"

	"bowerbird/core"

	"github.com/egoist/mygo/transfer"
	"github.com/egoist/mygo/ui"
)

func (a *App) viewContent(c *ui.Context) {
	ui.Column(c).Fill().Children(func() {
		a.viewToolbar(c)
		if a.hasFilters() {
			a.viewFilterChips(c)
		}
		if a.showInspector {
			ui.SplitPercent(c, &a.contentSplit, func() {
				a.viewGallery(c)
			}, func() {
				a.viewInspector(c)
			}).Grow(1)
		} else {
			a.viewGallery(c)
		}
	})
}

func (a *App) viewToolbar(c *ui.Context) {
	t := c.Theme()
	ui.Toolbar(c, func() {
		if ui.SearchField(c, &a.query).Width(210).Label(a.t("native.search.library")).
			Bind(&a.searchHandle).Changed() {
			a.markDirty()
			a.refreshItems()
		}
		a.filterMenu(c)
		ui.MenuButton(c, a.sortLabel(), func(m *ui.Menu) {
			if m.Item(a.t("native.newest.first")).Checked(!a.sortAsc).Chosen() {
				a.setSortAsc(false)
			}
			if m.Item(a.t("native.oldest.first")).Checked(a.sortAsc).Chosen() {
				a.setSortAsc(true)
			}
		})
		ui.MenuButton(c, a.layoutLabel(), func(m *ui.Menu) {
			for _, opt := range []struct{ id, en, zh string }{
				{layoutJustified, "Justified", "木桶等高 (Justified)"},
				{layoutWaterfall, "Waterfall", "瀑布流 (Waterfall)"},
				{layoutGrid, "Grid", "网格视图 (Grid)"},
				{layoutList, "List", "列表视图 (List)"},
			} {
				opt := opt
				if m.Item(a.tr(opt.en, opt.zh)).Checked(a.layout == opt.id).Chosen() {
					a.setLayout(opt.id)
				}
			}
		})
		ui.Spacer(c)
		if ui.Button(c, a.t("native.import")).Disabled(a.importing).Clicked() {
			a.chooseAndImportFiles()
		}
		if a.view == viewTrash {
			if ui.Button(c, a.t("contextMenu.restore")).Disabled(a.selection.Len() == 0 && a.selectedIndex < 0).Clicked() {
				a.requestRestoreSelected()
			}
			if ui.Button(c, a.t("native.empty.trash.2")).Disabled(a.trashCount == 0).Clicked() {
				a.requestEmptyTrash()
			}
			if ui.Button(c, a.t("native.delete.forever")).Disabled(a.selection.Len() == 0 && a.selectedIndex < 0).Clicked() {
				a.requestDeleteSelected()
			}
		} else {
			if ui.Button(c, a.t("common.delete")).Disabled(a.selection.Len() == 0 && a.selectedIndex < 0).Clicked() {
				a.requestDeleteSelected()
			}
		}
		if ui.Button(c, "−").Label(a.t("native.smaller")).Width(28).Clicked() {
			a.setRowHeight(a.rowHeight - 16)
		}
		if ui.Button(c, "+").Label(a.t("native.larger")).Width(28).Clicked() {
			a.setRowHeight(a.rowHeight + 16)
		}
		ui.MenuButton(c, "⋯", func(m *ui.Menu) {
			if m.Item(a.t("common.toggleSidebar")).Shortcut(ui.Cmd|ui.Shift, ui.KeyB).Chosen() {
				a.showSidebar = !a.showSidebar
			}
			if m.Item(a.t("native.toggle.inspector.2")).Shortcut(ui.Cmd, ui.KeyI).Chosen() {
				a.showInspector = !a.showInspector
			}
			m.Separator()
			if m.Item(a.t("native.import.folder")).Chosen() {
				a.chooseAndImportFolder()
			}
			if m.Item(a.t("native.new.folder")).Chosen() {
				a.openNewFolder(a.currentFolderID())
			}
			if m.Item(a.t("native.new.library")).Chosen() {
				a.openSetup()
			}
			m.Separator()
			if m.Item(a.t("appMenu.settings")).Shortcut(ui.Cmd, ui.KeyComma).Chosen() {
				a.openSettings()
			}
			if m.Item(a.t("appMenu.logs")).Chosen() {
				a.openLogs()
			}
			if m.Item(a.t("appMenu.about")).Chosen() {
				a.host.ShowAbout()
			}
			m.Separator()
			if m.Item(a.t("native.quit")).Chosen() {
				a.host.Quit()
			}
		})
	}).Background(t.Surface).BorderWidth(0, 0, 1, 0).BorderColor(t.Border)
}

func (a *App) layoutLabel() string {
	switch a.layout {
	case layoutList:
		return a.t("contextMenu.layoutList")
	case layoutGrid:
		return a.t("contextMenu.layoutGrid")
	case layoutWaterfall:
		return a.t("contextMenu.layoutWaterfall")
	}
	return a.t("contextMenu.layoutJustified")
}

func (a *App) sortLabel() string {
	if a.sortAsc {
		return a.t("workspace.oldest")
	}
	return a.t("workspace.newest")
}

// layoutIndex binds the segmented control to the App's layout string.
func (a *App) layoutIndex() int {
	if a.layout == layoutList {
		return 1
	}
	return 0
}

func (a *App) setLayoutIndex(i int) {
	if i == 1 {
		a.layout = layoutList
	} else {
		a.layout = layoutGrid
	}
	a.invalidate()
}

func (a *App) filterMenu(c *ui.Context) {
	n := a.activeFilterCount()
	label := a.t("native.filters")
	if n > 0 {
		label = fmt.Sprintf("%s (%d)", label, n)
	}
	ui.MenuButton(c, label, func(m *ui.Menu) {
		m.Submenu(a.t("filters.type"), func(sm *ui.Menu) {
			for _, typ := range []struct{ id, en, zh string }{
				{"all", "All types", "全部类型"},
				{"image", "Images", "图片"},
				{"video", "Videos", "视频"},
				{"audio", "Audio", "音频"},
				{"document", "Documents", "文档"},
				{"archive", "Archives", "压缩包"},
				{"other", "Other", "其他"},
			} {
				typ := typ
				if sm.Item(a.tr(typ.en, typ.zh)).Checked(a.category == typ.id).Chosen() {
					a.category = typ.id
					a.markDirty()
				}
			}
		})
		m.Submenu(a.t("filters.color"), func(sm *ui.Menu) {
			if sm.Item(a.t("native.any.color")).Checked(a.colorFilter == "").Chosen() {
				a.colorFilter = ""
				a.markDirty()
			}
			for _, cpair := range presetColors {
				cp := cpair
				if sm.Item(fmt.Sprintf("%s %s", cp.en, cp.hex)).Checked(a.colorFilter == cp.hex).Chosen() {
					a.colorFilter = cp.hex
					a.markDirty()
				}
			}
			top := a.topColors()
			if len(top) > 0 {
				sm.Separator()
				for _, hex := range top {
					hex := hex
					if sm.Item(hex).Checked(a.colorFilter == hex).Chosen() {
						a.colorFilter = hex
						a.markDirty()
					}
				}
			}
		})
		if len(a.folders) > 0 {
			m.Submenu(a.t("filters.folder"), func(sm *ui.Menu) {
				if sm.Item(a.t("native.any.folder")).Checked(a.filterFolder == "").Chosen() {
					a.filterFolder = ""
					a.markDirty()
				}
				if sm.Item(a.t("native.uncategorized")).Checked(a.filterFolder == "__uncategorized__").Chosen() {
					a.filterFolder = "__uncategorized__"
					a.markDirty()
				}
				for _, row := range flattenFolderTree(a.folders) {
					r := row
					if sm.Item(r.Folder.Name).Checked(a.filterFolder == r.Folder.ID).Chosen() {
						a.filterFolder = r.Folder.ID
						a.markDirty()
					}
				}
			})
		}
		m.Submenu(a.t("native.orientation"), func(sm *ui.Menu) {
			for _, o := range []struct{ id, en, zh string }{
				{"all", "Any", "全部"},
				{"landscape", "Landscape", "横图"},
				{"portrait", "Portrait", "竖图"},
				{"square", "Square", "方图"},
			} {
				o := o
				if sm.Item(a.tr(o.en, o.zh)).Checked(a.orientation == o.id).Chosen() {
					a.orientation = o.id
					a.markDirty()
				}
			}
		})
		m.Submenu(a.t("filters.size"), func(sm *ui.Menu) {
			for _, s := range []struct{ id, en, zh string }{
				{"all", "Any size", "全部大小"},
				{"small", "Under 1 MB", "小于 1 MB"},
				{"medium", "1–10 MB", "1–10 MB"},
				{"large", "Over 10 MB", "大于 10 MB"},
			} {
				s := s
				if sm.Item(a.tr(s.en, s.zh)).Checked(a.sizeFilter == s.id).Chosen() {
					a.sizeFilter = s.id
					a.markDirty()
				}
			}
		})
		m.Submenu(a.t("native.link"), func(sm *ui.Menu) {
			for _, s := range []struct{ id, en, zh string }{
				{"all", "Any", "全部"},
				{"has", "Has URL", "有 URL"},
				{"empty", "No URL", "无 URL"},
			} {
				s := s
				if sm.Item(a.tr(s.en, s.zh)).Checked(a.hasURL == s.id).Chosen() {
					a.hasURL = s.id
					a.markDirty()
				}
			}
		})
		m.Submenu(a.t("inspector.note"), func(sm *ui.Menu) {
			for _, s := range []struct{ id, en, zh string }{
				{"all", "Any", "全部"},
				{"has", "Has note", "有备注"},
				{"empty", "No note", "无备注"},
			} {
				s := s
				if sm.Item(a.tr(s.en, s.zh)).Checked(a.hasNote == s.id).Chosen() {
					a.hasNote = s.id
					a.markDirty()
				}
			}
		})
		m.Submenu(a.t("filters.rating"), func(sm *ui.Menu) {
			if sm.Item(a.t("filters.ratingAll")).Checked(a.ratingFilter < 0).Chosen() {
				a.ratingFilter = -1
				a.markDirty()
			}
			for i := 0; i <= 5; i++ {
				i := i
				label := a.t("filters.ratingUnrated")
				if i > 0 {
					label = strings.Repeat("★", i)
				}
				if sm.Item(label).Checked(a.ratingFilter == i).Chosen() {
					a.ratingFilter = i
					a.markDirty()
				}
			}
		})
		if a.hasFilters() {
			m.Separator()
			if m.Item(a.t("native.clear.all.filters")).Chosen() {
				a.clearFilters()
			}
		}
	})
}

var presetColors = []struct{ en, zh, hex string }{
	{"Red", "红", "#EF4444"},
	{"Orange", "橙", "#F97316"},
	{"Yellow", "黄", "#EAB308"},
	{"Green", "绿", "#22C55E"},
	{"Teal", "青", "#14B8A6"},
	{"Blue", "蓝", "#3B82F6"},
	{"Indigo", "靛", "#6366F1"},
	{"Purple", "紫", "#A855F7"},
	{"Pink", "粉", "#EC4899"},
	{"Brown", "棕", "#78350F"},
	{"Black", "黑", "#171717"},
	{"Gray", "灰", "#737373"},
	{"White", "白", "#F5F5F5"},
}

func (a *App) viewFilterChips(c *ui.Context) {
	t := c.Theme()
	ui.Row(c).Padding(6, 10).Gap(6).Wrap().Background(t.Background).
		BorderWidth(0, 0, 1, 0).BorderColor(t.Border).Children(func() {
		add := func(label string, clear func()) {
			chip := ui.Row(c).Height(24).Padding(0, 10).Radius(12).
				Background(t.Surface).AlignItems(ui.Center).Cursor(ui.CursorPointer)
			chip.Children(func() {
				ui.Text(c, label+"  ×").FontSize(10).TextColor(t.TextMuted)
			})
			if chip.Hovered() {
				chip.Background(t.SurfaceHover)
			}
			if chip.Clicked() {
				clear()
				a.markDirty()
			}
		}
		if a.category != "all" {
			add(a.t("native.type")+a.category, func() { a.category = "all" })
		}
		if a.colorFilter != "" {
			add(a.colorFilter, func() { a.colorFilter = "" })
		}
		if a.filterFolder != "" {
			ff := a.filterFolder
			name := ff
			if f := a.findFolder(ff); f != nil {
				name = f.Name
			} else if ff == "__uncategorized__" {
				name = a.t("native.uncategorized")
			}
			add(a.t("native.folder")+name, func() { a.filterFolder = "" })
		}
		if a.orientation != "all" {
			add(a.t("native.orientation.2")+a.orientation, func() { a.orientation = "all" })
		}
		if a.sizeFilter != "all" {
			add(a.t("native.size")+a.sizeFilter, func() { a.sizeFilter = "all" })
		}
		if a.hasURL != "all" {
			add(a.t("native.link.2")+a.hasURL, func() { a.hasURL = "all" })
		}
		if a.hasNote != "all" {
			add(a.t("native.note")+a.hasNote, func() { a.hasNote = "all" })
		}
		if a.ratingFilter >= 0 {
			add(fmt.Sprintf(a.t("native.rating.d"), a.ratingFilter), func() { a.ratingFilter = -1 })
		}
		ui.Spacer(c)
		if ui.Button(c, a.t("native.clear.all")).FontSize(10).Clicked() {
			a.clearFilters()
		}
	})
}

func (a *App) viewGallery(c *ui.Context) {
	t := c.Theme()
	a.beginGalleryFrame()
	ui.Column(c).Fill().Background(t.Background).Children(func() {
		if a.folderBreadcrumb() != "" {
			ui.Row(c).Padding(4, 12).Height(26).Children(func() {
				ui.Text(c, a.folderBreadcrumb()).FontSize(11).TextColor(t.TextMuted).SingleLine()
			})
		}
		vis := a.visibleItems()
		if len(vis) == 0 {
			ui.Column(c).Fill().Center().Gap(8).Children(func() {
				if a.loading {
					ui.Spinner(c).Size(22, 22)
					ui.Text(c, a.t("native.loading.library")).FontSize(12).TextColor(t.TextMuted)
				} else {
					ui.Text(c, a.t("native.nothing.here")).FontSize(15).Bold()
					ui.Text(c, a.t("native.import.files.or.adjust.the.filters")).FontSize(12).TextColor(t.TextMuted)
					if ui.Button(c, a.t("native.import.files")).Clicked() {
						a.chooseAndImportFiles()
					}
				}
			})
			return
		}
		switch a.layout {
		case layoutList:
			a.viewListLayout(c, vis)
		case layoutJustified, layoutWaterfall:
			a.viewCustomGallery(c, vis)
		default:
			a.viewGridLayout(c, vis)
		}
		a.prefetchAround(vis)
	})
}

func (a *App) viewGridLayout(c *ui.Context, vis []core.Item) {
	a.grid.Key = func(i int) any { return vis[i].ID }
	a.grid.Label = func(i int) string { return vis[i].Name }
	a.grid.Selected = &a.selectedIndex
	a.grid.Selection = &a.selection
	g := ui.GridView(c, &a.grid, len(vis), a.rowHeight*1.15, a.rowHeight+34, func(i int) {
		a.gridCell(c, &vis[i], i)
	}).Grow(1).Padding(6).HandleInput(func(ev ui.InputEvent) bool {
		return a.handleGalleryInput(ev)
	})
	if r := g.Bounds(); r.W > 0 {
		a.galleryBounds = r
	}
	if g.Changed() {
		if a.selectedIndex >= 0 && a.selectedIndex < len(vis) {
			a.selectedID = vis[a.selectedIndex].ID
			a.syncEditor(&vis[a.selectedIndex])
		}
	}
	if g.Submitted() {
		if a.selectedIndex >= 0 && a.selectedIndex < len(vis) {
			a.openPreview(vis[a.selectedIndex].ID)
		}
	}
}

func (a *App) gridCell(c *ui.Context, it *core.Item, idx int) {
	t := c.Theme()
	selected := a.selection.Has(it.ID)

	cell := ui.Column(c).Key("cell:" + it.ID).FillHeight().Gap(4).Padding(4).Radius(8)
	if selected {
		cell.Background(t.Accent.Alpha(0.16)).Border(1, t.Accent)
	} else if cell.Hovered() {
		cell.Background(t.SurfaceHover)
	}
	cell.Children(func() {
		box := ui.Box(c).Grow(1).FillWidth().Radius(6).Clip().
			Background(themeHex(it.DominantColor, t.Surface))
		box.Children(func() {
			if bmp := a.galleryBitmap(it, a.rowHeight); bmp != nil {
				ui.Image(c, bmp).Fill().Fit(ui.Cover)
			} else if a.galleryFailed(it, a.rowHeight) {
				ui.Column(c).Fill().Center().Children(func() {
					ui.Text(c, extensionLabel(it.Extension)).FontSize(18).Bold().TextColor(t.TextMuted)
				})
			} else {
				ui.Column(c).Fill().Center().Children(func() {
					ui.Spinner(c).Size(16, 16)
				})
			}
		})
		ui.Text(c, it.Name).FontSize(11).SingleLine()
		ui.Row(c).Gap(4).AlignItems(ui.Center).Children(func() {
			ui.Text(c, extensionLabel(it.Extension)).FontSize(9).TextColor(t.TextMuted)
			ui.Spacer(c)
			ui.Text(c, formatBytes(it.Size, 0)).FontSize(9).TextColor(t.TextMuted)
		})
	})
	cell.DragDataFrom(func() transfer.Data { return a.fileDragData(it) }, a.dragOptionsFor(it)).
		Drag(a.dragValuesFor(it))
	if r := cell.Bounds(); r.W > 0 {
		a.cellRects[it.ID] = r
	}
	if idx < a.visibleMin || a.visibleMin < 0 {
		a.visibleMin = idx
	}
	if idx > a.visibleMax {
		a.visibleMax = idx
	}
	cell.ContextMenu(func(m *ui.Menu) {
		a.itemContextMenu(m, it)
	})
}

func (a *App) viewListLayout(c *ui.Context, vis []core.Item) {
	a.listState.Key = func(i int) any { return vis[i].ID }
	a.listState.Label = func(i int) string { return vis[i].Name }
	a.listState.Selected = &a.selectedIndex
	a.listState.Selection = &a.selection
	l := ui.List(c, &a.listState, len(vis), func(i int) {
		a.listRow(c, &vis[i], i)
	}).Grow(1).HandleInput(func(ev ui.InputEvent) bool {
		return a.handleGalleryInput(ev)
	})
	if r := l.Bounds(); r.W > 0 {
		a.galleryBounds = r
	}
	if l.Changed() {
		if a.selectedIndex >= 0 && a.selectedIndex < len(vis) {
			a.selectedID = vis[a.selectedIndex].ID
			a.syncEditor(&vis[a.selectedIndex])
		}
	}
	if l.Submitted() {
		if a.selectedIndex >= 0 && a.selectedIndex < len(vis) {
			a.openPreview(vis[a.selectedIndex].ID)
		}
	}
}

func (a *App) listRow(c *ui.Context, it *core.Item, idx int) {
	t := c.Theme()
	selected := a.selection.Has(it.ID)
	row := ui.Row(c).Key("list:"+it.ID).Height(64).Padding(8, 12).Gap(10).AlignItems(ui.Center)
	if selected {
		row.Background(t.Accent.Alpha(0.14))
	}
	row.Children(func() {
		box := ui.Box(c).Size(48, 48).Radius(5).Clip().Background(themeHex(it.DominantColor, t.Surface))
		box.Children(func() {
			if bmp := a.thumbnail(it, 48); bmp != nil {
				ui.Image(c, bmp).Fill().Fit(ui.Cover)
			} else {
				ui.Column(c).Fill().Center().Children(func() {
					ui.Text(c, extensionLabel(it.Extension)).FontSize(10).TextColor(t.TextMuted)
				})
			}
		})
		ui.Column(c).Grow(1).Gap(2).Children(func() {
			ui.Text(c, it.Name).FontSize(12).SingleLine()
			meta := fmt.Sprintf("%s · %dx%d · %s", extensionLabel(it.Extension), it.Width, it.Height, formatBytes(it.Size, 1))
			ui.Text(c, meta).FontSize(10).TextColor(t.TextMuted).SingleLine()
			if len(it.Tags) > 0 {
				ui.Text(c, strings.Join(it.Tags, " · ")).FontSize(10).TextColor(t.TextMuted).SingleLine()
			}
		})
		ui.Text(c, formatDate(it.ImportedAt)).FontSize(10).TextColor(t.TextMuted)
	})
	row.DragDataFrom(func() transfer.Data { return a.fileDragData(it) }, a.dragOptionsFor(it)).Drag(a.dragValuesFor(it))
	if r := row.Bounds(); r.W > 0 {
		a.cellRects[it.ID] = r
	}
	if idx < a.visibleMin || a.visibleMin < 0 {
		a.visibleMin = idx
	}
	if idx > a.visibleMax {
		a.visibleMax = idx
	}
	row.ContextMenu(func(m *ui.Menu) { a.itemContextMenu(m, it) })
}

func (a *App) itemContextMenu(m *ui.Menu, it *core.Item) {
	if m.Item(a.t("inspector.preview")).Shortcut(0, ui.KeySpace).Chosen() {
		a.openPreview(it.ID)
	}
	if m.Item(a.t("native.open")).Chosen() {
		a.openSelected()
	}
	if m.Item(a.t("native.reveal.in.finder")).Chosen() {
		a.revealSelected()
	}
	m.Separator()
	if m.Item(a.t("settings.data.copyPath")).Chosen() {
		a.copySelectedPaths()
	}
	if m.Item(a.t("native.copy.files")).Chosen() {
		a.copySelectedFiles()
	}
	if len(a.folders) > 0 {
		m.Submenu(a.t("native.add.to.folder"), func(sm *ui.Menu) {
			for _, row := range flattenFolderTree(a.folders) {
				r := row
				if sm.Item(r.Folder.Name).Chosen() {
					a.addSelectedToFolder(r.Folder.ID)
				}
			}
		})
	}
	fav := "☆ " + a.t("inspector.favorite")
	if contains(it.Tags, core.FavoriteTagName) {
		fav = "★ " + a.t("native.unfavorite")
	}
	if m.Item(fav).Chosen() {
		a.toggleFavorite(it.ID)
	}
	m.Separator()
	if a.view == viewTrash {
		if m.Item(a.t("contextMenu.restore")).Chosen() {
			a.requestRestoreSelected()
		}
		if m.Item(a.t("native.delete.permanently.2")).Chosen() {
			a.requestDeleteSelected()
		}
	} else {
		if m.Item(a.t("native.move.to.trash.2")).Chosen() {
			a.requestDeleteSelected()
		}
	}
}
