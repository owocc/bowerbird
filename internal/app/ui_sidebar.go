package app

import (
	"path/filepath"
	"time"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
)

// viewSidebar draws the library switcher, smart views and the recursive folder
// tree. It is also the drop target for dragging assets onto a folder.
func (a *App) viewSidebar(c *ui.Context) {
	p := paletteFor(c.Theme())
	a.dropFolderID = ""
	ui.Column(c).Width(sidebarWidth).FillHeight().Background(p.sidebar).Children(func() {
		// The sidebar header matches the main header's first row, so the
		// toggle and the main toolbar controls share one vertical line. The
		// toggle stays just right of the traffic lights, inside the safe area.
		bar := c.TitleBar()
		ui.Row(c).Height(headerHeight).FillWidth().Padding(0, 8, 0, bar.Left+gallerySidePadding).AlignItems(ui.Center).DragWindow().Children(func() {
			a.iconButton(c, "sidebar-toggle", iconSidebar, true, a.t("common.toggleSidebar"), a.toggleSidebar)
		})
		a.sidebarLibrarySwitcher(c)
		ui.Scroll(c).Grow(1).Shrink(1).Padding(4, 10, 12, 10).Children(func() {
			a.navRow(c, NavAll, iconAll, a.t("sidebar.allItems"), a.stats.Total)
			a.navRow(c, NavUntagged, iconInbox, a.t("sidebar.untagged"), a.stats.UntaggedCount)
			a.navRow(c, NavUncategorized, iconUncategorized, a.t("sidebar.uncategorized"), a.stats.UncategorizedCount)
			a.navRow(c, NavTags, iconTag, a.t("sidebar.tags"), len(a.tags))
			a.navRow(c, NavTrash, iconTrash, a.t("sidebar.trash"), a.trashCount)

			ui.Row(c).FillWidth().Height(28).PaddingX(4).Margin(12, 0, 0, 0).AlignItems(ui.Center).Children(func() {
				a.sectionLabel(c, a.t("sidebar.folders"))
				ui.Box(c).Grow(1)
				a.iconButton(c, "new-folder", iconFolderPlus, false, a.t("sidebar.newFolder"), func() {
					a.dialog = dialogNewFolder
					a.dialogValue = ""
				})
			})
			count := 0
			for i := range a.folders {
				count += a.folderRow(c, a.folders[i], 0)
			}
			if count == 0 {
				ui.Text(c, a.t("sidebar.noFolders")).FontSize(11).TextColor(p.faint).Padding(12, 6)
			}
		})
	})
}

func (a *App) sidebarLibrarySwitcher(c *ui.Context) {
	p := paletteFor(c.Theme())
	this := a.t("library.switcher")
	ui.Box(c).Padding(10, 12, 4, 12).Children(func() {
		ui.Row(c).Height(34).Width(sidebarWidth - 24).PaddingX(8).Radius(8).Background(p.hover).AlignItems(ui.Center).Gap(8).Children(func() {
			ui.Icon(c, iconLibrary).Size(16, 16).TextColor(p.muted)
			labels := make([]string, 0, len(a.recent)+1)
			paths := make([]string, 0, len(a.recent)+1)
			current := ""
			if a.library != nil {
				current = a.library.Name
			}
			seen := map[string]bool{}
			for _, ref := range a.recent {
				name := filepath.Base(ref.Path)
				if name == "" || seen[name] {
					continue
				}
				seen[name] = true
				labels = append(labels, name)
				paths = append(paths, ref.Path)
				if a.library != nil && ref.ID == a.library.ID {
					current = name
				}
			}
			if current == "" {
				current = a.t("sidebar.noLibrary")
			}
			_ = this
			if len(labels) == 0 {
				labels = []string{current}
				paths = []string{""}
			}
			chosen := current
			sel := ui.Select(c.Key("library-switch"), &chosen, labels).FontSize(12).Grow(1).Shrink(1)
			if sel.Changed() {
				for i, label := range labels {
					if label == chosen && paths[i] != "" && (a.library == nil || paths[i] != a.library.Path) {
						path := paths[i]
						go func() {
							_, err := a.svc.OpenLibrary(path)
							a.post(func() {
								if err != nil {
									a.showToast(err.Error())
								}
								a.refreshAll()
							})
						}()
						break
					}
				}
			}
		})
		ui.Row(c).Height(30).Gap(4).Children(func() {
			a.iconButton(c, "library-new", iconPlus, false, a.t("sidebar.createLibrary"), func() {
				a.dialog = dialogNewLibrary
				a.dialogValue = ""
				a.dialogError = ""
			})
			a.iconButton(c, "library-open", iconFolder, false, a.t("sidebar.openLibrary"), func() {
				go func() {
					path, err := a.svc.SelectLibraryDialog()
					if err != nil || path == "" {
						return
					}
					if _, err := a.svc.OpenLibrary(path); err != nil {
						a.post(func() { a.showToast(err.Error()) })
						return
					}
					a.post(func() { a.refreshAll() })
				}()
			})
			ui.Box(c).Grow(1)
			if a.total > 0 {
				ui.Textf(c, "%d", a.total).FontSize(10).TextColor(p.faint).FontFeatures("tnum")
			}
		})
	})
}

func (a *App) navRow(c *ui.Context, nav Nav, icon *ui.SVG, label string, count int) {
	p := paletteFor(c.Theme())
	active := a.nav == nav
	b := ui.ButtonBase(c.Key("nav-" + string(nav))).FillWidth().Height(30).PaddingX(8).Radius(7).FocusRing(false).AlignItems(ui.Center).Gap(8)
	bg := ui.Transparent
	if active {
		bg = p.press
	} else if b.Hovered() {
		bg = p.hover
	}
	b.Background(b.AnimateColor("bg", bg, ui.Animation{Duration: 120 * time.Millisecond}))
	b.Children(func() {
		ui.Icon(c, icon).Size(15, 15).TextColor(p.muted)
		ui.Text(c, label).FontSize(12.5).Grow(1).Shrink(1).SingleLine().TextColor(p.text)
		if count > 0 {
			ui.Textf(c, "%d", count).FontSize(10.5).FontFeatures("tnum").TextColor(p.faint)
		}
	})
	if b.Clicked() {
		a.navigate(nav, "")
	}
}

func (a *App) folderRow(c *ui.Context, f core.Folder, depth int) int {
	p := paletteFor(c.Theme())
	count := 1
	open := a.expanded[f.ID]
	children := a.foldersChildren(f.ID)
	if len(children) > 0 && open {
		for i := range children {
			count += a.folderRow(c, children[i], depth+1)
		}
	}
	active := a.nav == NavFolder && a.folderID == f.ID
	b := ui.ButtonBase(c.Key("folder-" + f.ID)).FillWidth().Height(28).PaddingStart(float32(8 + depth*14)).PaddingEnd(8).Radius(7).FocusRing(false).AlignItems(ui.Center).Gap(6)
	bg := ui.Transparent
	if active {
		bg = p.press
	} else if b.Hovered() {
		bg = p.hover
	}
	b.Background(b.AnimateColor("bg", bg, ui.Animation{Duration: 120 * time.Millisecond}))
	if b.Hovered() {
		a.dropFolderID = f.ID
	}
	b.Children(func() {
		if len(children) > 0 {
			arrow := ui.ButtonBase(c.Key("fold-arrow-"+f.ID)).Size(14, 14).Radius(3).FocusRing(false).AlignItems(ui.Center).Justify(ui.Center)
			arrow.Children(func() {
				ic := iconChevronR
				if open {
					ic = iconChevron
				}
				ui.Icon(c, ic).Size(12, 12).TextColor(p.faint)
			})
			if arrow.Clicked() {
				a.expanded[f.ID] = !open
			}
		} else {
			ui.Box(c).Size(14, 14)
		}
		ui.Icon(c, iconFolder).Size(14, 14).TextColor(p.muted)
		ui.Text(c, f.Name).FontSize(12.5).Grow(1).Shrink(1).MinWidth(0).SingleLine().TextColor(p.text)
		if f.ItemCount > 0 {
			ui.Textf(c, "%d", f.ItemCount).FontSize(10.5).TextColor(p.faint).FontFeatures("tnum")
		}
	})
	if b.Clicked() {
		if f.ID != a.folderID || a.nav != NavFolder {
			a.navigate(NavFolder, f.ID)
		}
	}
	b.ContextMenu(func(m *ui.Menu) {
		if m.Item(a.t("common.rename")).Chosen() {
			a.dialog = dialogRenameFolder
			a.dialogValue = f.Name
			a.folderID = f.ID
		}
		if m.Item(a.t("contextMenu.newFolder")).Chosen() {
			a.dialog = dialogNewFolder
			a.dialogValue = ""
			a.folderID = f.ID
		}
		if m.Item(a.t("contextMenu.includeSubfolders")).Checked(a.prefs.IncludeSubs).Chosen() {
			a.prefs.IncludeSubs = !a.prefs.IncludeSubs
			a.savePrefs()
			if a.nav == NavFolder && a.folderID == f.ID {
				a.refreshAll()
			}
		}
		m.Separator()
		if m.Item(a.t("common.delete")).Chosen() {
			a.dialog = dialogDeleteFolder
			a.dialogValue = f.Name
			a.folderID = f.ID
		}
	})
	return count
}

func (a *App) foldersChildren(parent string) []core.Folder {
	var out []core.Folder
	for _, f := range a.folders {
		if f.ParentID == parent {
			out = append(out, f)
		}
	}
	return out
}
