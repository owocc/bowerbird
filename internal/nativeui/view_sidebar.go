package nativeui

import (
	"path/filepath"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
)

func (a *App) viewSidebar(c *ui.Context) {
	t := c.Theme()
	ui.Column(c).FillWidth().FillHeight().Background(t.Surface).
		BorderWidth(0, 1, 0, 0).BorderColor(t.Border).Children(func() {
		// Library switcher.
		ui.Row(c).Height(40).Padding(8, 8).Gap(4).AlignItems(ui.Center).Children(func() {
			ui.MenuButton(c, a.libraryName(), func(m *ui.Menu) {
				recent := a.svc.GetRecentLibraries()
				for _, p := range recent {
					path := p
					item := m.Item(folderDisplayName(path))
					if a.lib != nil && path == a.lib.Path {
						item.Checked(true)
					}
					if item.Chosen() {
						a.openLibraryPath(path)
					}
				}
				if len(recent) > 0 {
					m.Separator()
				}
				if m.Item(a.t("native.open.library")).Chosen() {
					a.openLibraryDialog()
				}
				if m.Item(a.t("native.new.library")).Chosen() {
					a.openSetup()
				}
				m.Separator()
				if m.Item(a.t("sidebar.closeLibrary")).Chosen() {
					a.closeLibrary()
				}
				m.Separator()
				if m.Item(a.t("appMenu.settings")).Chosen() {
					a.openSettings()
				}
				if m.Item(a.t("appMenu.logs")).Chosen() {
					a.openLogs()
				}
			}).Grow(1)
			if ui.Button(c, "＋").Label(a.t("workspace.newFolder")).Tooltip(a.t("workspace.newFolder")).
				Width(26).OnClick(func() { a.openNewFolder("") }).Clicked() {
			}
		})

		ui.Scroll(c).Grow(1).Padding(6, 6, 12).Gap(1).Children(func() {
			a.sidebarSection(c, a.t("native.library"))
			a.sidebarRow(c, a.t("native.all.items"), "", len(a.items), a.view == viewAll && a.folderID == "" && a.tagFilter == "", 0, func() {
				a.setView(viewAll)
			}, "", false)
			a.sidebarRow(c, a.t("filters.untagged"), "", a.untaggedCount, a.view == viewUntagged, 0, func() {
				a.setView(viewUntagged)
			}, "", false)
			a.sidebarRow(c, a.t("native.uncategorized"), "", a.uncategorizedCount, a.view == viewUncategorized, 0, func() {
				a.setView(viewUncategorized)
			}, "", false)
			a.sidebarRow(c, a.t("sidebar.trash"), "", a.trashCount, a.view == viewTrash, 0, func() {
				a.setView(viewTrash)
			}, "__trash__", true)
			a.sidebarRow(c, a.t("sidebar.history"), "", a.historyCount, a.view == viewHistory, 0, func() {
				a.setView(viewHistory)
			}, "", false)

			ui.Row(c).Height(26).Padding(6, 8, 0, 8).Children(func() {
				ui.Text(c, a.t("native.folders")).FontSize(11).Bold().TextColor(c.Theme().TextMuted).Grow(1)
				if ui.Button(c, "＋").Label(a.t("workspace.newFolder")).Width(22).Clicked() {
					a.openNewFolder("")
				}
			})
			if len(a.folders) == 0 {
				ui.Text(c, a.t("native.no.folders.yet")).FontSize(11).TextColor(c.Theme().TextMuted).Padding(6, 12)
			}
			a.folderRows(c, a.folders, 0)
			if a.view == viewAll && a.folderID != "" {
				ui.Row(c).Height(26).Padding(0, 10, 0, 14).Children(func() {
					if ui.Checkbox(c, &a.includeSubfolders, a.t("native.include.subfolders")).Changed() {
						a.subfolderSet = nil
						a.markDirty()
					}
				})
			}

			ui.Row(c).Height(26).Padding(6, 8, 0, 8).Children(func() {
				ui.Text(c, a.t("native.tags")).FontSize(11).Bold().TextColor(c.Theme().TextMuted).Grow(1)
				if a.tagFilter != "" {
					if ui.Button(c, "✕").Label(a.t("native.clear.tag")).Width(22).Clicked() {
						a.selectTag("")
					}
				}
				if ui.Button(c, "＋").Label(a.t("tags.newTag")).Width(22).Clicked() {
					a.openNewTag()
				}
			})
			if len(a.tags) == 0 {
				ui.Text(c, a.t("native.no.tags.yet")).FontSize(11).TextColor(c.Theme().TextMuted).Padding(6, 12)
			}
			for _, tag := range a.tags {
				tag := tag
				a.sidebarTagRow(c, tag)
			}
		})
	})
}

func (a *App) sidebarSection(c *ui.Context, title string) {
	ui.Text(c, title).FontSize(11).Bold().TextColor(c.Theme().TextMuted).Padding(8, 8, 4, 8)
}

// sidebarRow draws one flat selectable row. folderID, when set, makes the row a
// drop target for item ids, and trash makes it trash them.
func (a *App) sidebarRow(c *ui.Context, label, icon string, count int, selected bool, indent int, onClick func(), folderID string, trash bool) {
	t := c.Theme()
	row := ui.Row(c).Key("row:"+label).Height(26).Padding(0, 8, 0, 8+float32(indent)*14).
		Gap(6).Radius(6).AlignItems(ui.Center).Cursor(ui.CursorPointer)
	if selected {
		row.Background(t.Accent.Alpha(0.18))
	} else if row.Hovered() {
		row.Background(t.SurfaceHover)
	}
	row.Children(func() {
		if icon != "" {
			ui.Text(c, icon).FontSize(12).TextColor(t.TextMuted)
		}
		text := ui.Text(c, label).FontSize(12).SingleLine().Grow(1)
		if selected {
			text.TextColor(t.Accent)
		}
		if count > 0 {
			ui.Textf(c, "%d", count).FontSize(10).TextColor(t.TextMuted)
		}
	})
	if row.Clicked() && onClick != nil {
		onClick()
	}
	if folderID != "" {
		if ids, ok := ui.Drop[[]string](row); ok {
			if trash {
				a.trashIDs(ids)
			} else {
				a.moveToFolder(ids, folderID)
			}
		}
		if _, over := ui.DragOver[[]string](row); over {
			row.Border(1, t.Accent)
		}
		if folderID != "__trash__" {
			row.ContextMenu(func(m *ui.Menu) {
				f := a.findFolder(folderID)
				if f == nil {
					return
				}
				if m.Item(a.t("native.new.subfolder")).Chosen() {
					a.openNewFolder(f.ID)
				}
				if m.Item(a.t("native.rename")).Chosen() {
					a.openRenameFolder(*f)
				}
				m.Separator()
				if m.Item(a.t("native.delete.folder.2")).Chosen() {
					a.requestDeleteFolder(*f)
				}
			})
		}
	}
}

// sidebarTagRow is a tag row with its delete action in a context menu.
func (a *App) sidebarTagRow(c *ui.Context, tag core.Tag) {
	t := c.Theme()
	selected := a.tagFilter == tag.Name
	row := ui.Row(c).Key("tag:"+tag.Name).Height(26).Padding(0, 8, 0, 8).
		Gap(6).Radius(6).AlignItems(ui.Center).Cursor(ui.CursorPointer)
	if selected {
		row.Background(t.Accent.Alpha(0.18))
	} else if row.Hovered() {
		row.Background(t.SurfaceHover)
	}
	row.Children(func() {
		ui.Text(c, "🏷").FontSize(10).TextColor(t.TextMuted)
		text := ui.Text(c, tag.Name).FontSize(12).SingleLine().Grow(1)
		if selected {
			text.TextColor(t.Accent)
		}
		if tag.ItemCount > 0 {
			ui.Textf(c, "%d", tag.ItemCount).FontSize(10).TextColor(t.TextMuted)
		}
	})
	if row.Clicked() {
		if selected {
			a.selectTag("")
		} else {
			a.selectTag(tag.Name)
		}
	}
	row.ContextMenu(func(m *ui.Menu) {
		if m.Item(a.t("native.delete.tag.2")).Chosen() {
			a.requestDeleteTag(tag.Name)
		}
	})
}

func (a *App) folderRows(c *ui.Context, folders []core.Folder, depth int) {
	for i := range folders {
		f := folders[i]
		t := c.Theme()
		row := ui.Row(c).Key("folder:"+f.ID).Height(26).Padding(0, 8, 0, 8+float32(depth)*14).
			Gap(4).Radius(6).AlignItems(ui.Center).Cursor(ui.CursorPointer)
		selected := a.view == viewAll && a.folderID == f.ID
		if selected {
			row.Background(t.Accent.Alpha(0.18))
		} else if row.Hovered() {
			row.Background(t.SurfaceHover)
		}
		row.Children(func() {
			if len(f.Children) > 0 {
				arrow := "> "
				if a.expanded[f.ID] {
					arrow = "v "
				}
				if ui.Button(c, arrow).Width(18).FontSize(10).Label(a.t("native.expand")).Clicked() {
					a.expanded[f.ID] = !a.expanded[f.ID]
				}
			} else {
				ui.Box(c).Width(16)
			}
			name := ui.Text(c, f.Name).FontSize(12).SingleLine().Grow(1)
			if selected {
				name.TextColor(t.Accent)
			}
			if f.ItemCount > 0 {
				ui.Textf(c, "%d", f.ItemCount).FontSize(10).TextColor(t.TextMuted)
			}
		})
		if row.Clicked() {
			a.selectFolder(f.ID)
		}
		if ids, ok := ui.Drop[[]string](row); ok {
			a.moveToFolder(ids, f.ID)
		}
		if _, over := ui.DragOver[[]string](row); over {
			row.Border(1, t.Accent)
		}
		row.ContextMenu(func(m *ui.Menu) {
			if m.Item(a.t("native.new.subfolder")).Chosen() {
				a.openNewFolder(f.ID)
			}
			if m.Item(a.t("native.rename")).Chosen() {
				a.openRenameFolder(f)
			}
			m.Separator()
			if m.Item(a.t("native.delete.folder.2")).Chosen() {
				a.requestDeleteFolder(f)
			}
		})
		if a.expanded[f.ID] && len(f.Children) > 0 {
			a.folderRows(c, f.Children, depth+1)
		}
	}
}

func (a *App) findFolder(id string) *core.Folder {
	var find func([]core.Folder) *core.Folder
	find = func(list []core.Folder) *core.Folder {
		for i := range list {
			if list[i].ID == id {
				f := list[i]
				return &f
			}
			if f := find(list[i].Children); f != nil {
				return f
			}
		}
		return nil
	}
	return find(a.folders)
}

// folderBreadcrumb returns "Parent / Child" for the status bar.
func (a *App) folderBreadcrumb() string {
	f := a.currentFolder()
	if f == nil {
		return ""
	}
	parts := []string{f.Name}
	parent := f.ParentID
	for parent != "" {
		p := a.findFolder(parent)
		if p == nil {
			break
		}
		parts = append([]string{p.Name}, parts...)
		parent = p.ParentID
	}
	return filepath.Join(parts...)
}
