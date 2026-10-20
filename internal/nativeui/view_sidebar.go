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
				if m.Item(a.tr("Open Library…", "打开素材库…")).Chosen() {
					a.openLibraryDialog()
				}
				if m.Item(a.tr("New Library…", "新建素材库…")).Chosen() {
					a.openSetup()
				}
				m.Separator()
				if m.Item(a.tr("Close Library", "关闭素材库")).Chosen() {
					a.closeLibrary()
				}
				m.Separator()
				if m.Item(a.tr("Settings…", "设置…")).Chosen() {
					a.openSettings()
				}
				if m.Item(a.tr("Logs…", "日志…")).Chosen() {
					a.openLogs()
				}
			}).Grow(1)
			if ui.Button(c, "＋").Label(a.tr("New folder", "新建文件夹")).Tooltip(a.tr("New folder", "新建文件夹")).
				Width(26).OnClick(func() { a.openNewFolder("") }).Clicked() {
			}
		})

		ui.Scroll(c).Grow(1).Padding(6, 6, 12).Gap(1).Children(func() {
			a.sidebarSection(c, a.tr("Library", "素材库"))
			a.sidebarRow(c, a.tr("All Items", "全部素材"), "", len(a.items), a.view == viewAll && a.folderID == "" && a.tagFilter == "", 0, func() {
				a.setView(viewAll)
			}, "", false)
			a.sidebarRow(c, a.tr("Untagged", "未标签"), "", a.untaggedCount, a.view == viewUntagged, 0, func() {
				a.setView(viewUntagged)
			}, "", false)
			a.sidebarRow(c, a.tr("Uncategorized", "未分类"), "", a.uncategorizedCount, a.view == viewUncategorized, 0, func() {
				a.setView(viewUncategorized)
			}, "", false)
			a.sidebarRow(c, a.tr("Trash", "废纸篓"), "", a.trashCount, a.view == viewTrash, 0, func() {
				a.setView(viewTrash)
			}, "__trash__", true)

			ui.Row(c).Height(26).Padding(6, 8, 0, 8).Children(func() {
				ui.Text(c, a.tr("Folders", "文件夹")).FontSize(11).Bold().TextColor(c.Theme().TextMuted).Grow(1)
				if ui.Button(c, "＋").Label(a.tr("New folder", "新建文件夹")).Width(22).Clicked() {
					a.openNewFolder("")
				}
			})
			if len(a.folders) == 0 {
				ui.Text(c, a.tr("No folders yet", "还没有文件夹")).FontSize(11).TextColor(c.Theme().TextMuted).Padding(6, 12)
			}
			a.folderRows(c, a.folders, 0)

			ui.Row(c).Height(26).Padding(6, 8, 0, 8).Children(func() {
				ui.Text(c, a.tr("Tags", "标签")).FontSize(11).Bold().TextColor(c.Theme().TextMuted).Grow(1)
				if a.tagFilter != "" {
					if ui.Button(c, "✕").Label(a.tr("Clear tag", "清除标签")).Width(22).Clicked() {
						a.selectTag("")
					}
				}
			})
			if len(a.tags) == 0 {
				ui.Text(c, a.tr("No tags yet", "还没有标签")).FontSize(11).TextColor(c.Theme().TextMuted).Padding(6, 12)
			}
			for _, tag := range a.tags {
				tag := tag
				a.sidebarRow(c, tag.Name, "", tag.ItemCount, a.tagFilter == tag.Name, 0, func() {
					if a.tagFilter == tag.Name {
						a.selectTag("")
					} else {
						a.selectTag(tag.Name)
					}
				}, "", false)
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
				if m.Item(a.tr("New Subfolder…", "新建子文件夹…")).Chosen() {
					a.openNewFolder(f.ID)
				}
				if m.Item(a.tr("Rename…", "重命名…")).Chosen() {
					a.openRenameFolder(*f)
				}
				m.Separator()
				if m.Item(a.tr("Delete Folder…", "删除文件夹…")).Chosen() {
					a.requestDeleteFolder(*f)
				}
			})
		}
	}
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
				if ui.Button(c, arrow).Width(18).FontSize(10).Label(a.tr("Expand", "展开")).Clicked() {
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
			if m.Item(a.tr("New Subfolder…", "新建子文件夹…")).Chosen() {
				a.openNewFolder(f.ID)
			}
			if m.Item(a.tr("Rename…", "重命名…")).Chosen() {
				a.openRenameFolder(f)
			}
			m.Separator()
			if m.Item(a.tr("Delete Folder…", "删除文件夹…")).Chosen() {
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
