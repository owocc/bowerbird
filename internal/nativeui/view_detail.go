package nativeui

import (
	"fmt"
	"strings"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
)

func (a *App) viewInspector(c *ui.Context) {
	t := c.Theme()
	ui.Column(c).FillHeight().Background(t.Surface).
		BorderWidth(0, 1, 0, 0).BorderColor(t.Border).Children(func() {
		sel := a.selectedItems()
		if len(sel) > 1 {
			a.viewMultiInspector(c, sel)
			return
		}
		it := a.activeItem()
		if it == nil {
			ui.Column(c).Fill().Center().Padding(24).Gap(8).Children(func() {
				ui.Text(c, a.tr("Nothing selected", "未选择素材")).FontSize(13).TextColor(t.TextMuted)
				ui.Text(c, a.tr("Select an item to inspect it.", "选择素材以查看详情。")).FontSize(11).TextColor(t.TextMuted).TextAlign(ui.Center)
			})
			return
		}
		a.syncEditor(it)
		ui.Scroll(c).Grow(1).Padding(12).Gap(10).Children(func() {
			// Preview.
			box := ui.Box(c).Height(180).FillWidth().Radius(8).Clip().Cursor(ui.CursorPointer).
				Background(themeHex(it.DominantColor, t.Background))
			box.Children(func() {
				if bmp := a.thumbnail(it, 180); bmp != nil {
					ui.Image(c, bmp).Fill().Fit(ui.Cover)
				} else {
					ui.Column(c).Fill().Center().Children(func() { ui.Spinner(c).Size(16, 16) })
				}
			})
			if box.Clicked() {
				a.openPreview(it.ID)
			}

			// Name and favourite.
			ui.EditableText(c, &a.draftName).FontSize(15).Bold().Changed()
			if a.draftName != it.Name {
				a.editorDirty = true
			}
			ui.Row(c).Gap(6).AlignItems(ui.Center).Children(func() {
				fav := contains(it.Tags, core.FavoriteTagName)
				label := "☆ " + a.tr("Favorite", "收藏")
				if fav {
					label = "★ " + a.tr("Favorited", "已收藏")
				}
				if ui.Button(c, label).Clicked() {
					a.toggleFavorite(it.ID)
				}
				ui.Spacer(c)
				if a.editorDirty {
					if ui.PrimaryButton(c, a.tr("Save", "保存")).Clicked() {
						a.saveEditor()
					}
				}
			})
			ui.Row(c).Gap(6).AlignItems(ui.Center).Children(func() {
				ui.Text(c, a.tr("Rating", "评分")).FontSize(11).TextColor(t.TextMuted)
				r := a.draftRating
				if ui.Rating(c, &r, 5).Changed() {
					a.draftRating = r
					a.setRating(it.ID, r)
				}
			})

			a.inspectorDivider(c)

			// Tags.
			ui.Text(c, a.tr("Tags", "标签")).FontSize(11).Bold().TextColor(t.TextMuted)
			if ui.TokenField(c, &a.draftTags, a.tagNames()).Changed() {
				a.setItemTags(it.ID, a.draftTags)
			}

			// Folders.
			ui.Row(c).Gap(6).AlignItems(ui.Center).Children(func() {
				ui.Text(c, a.tr("Folders", "文件夹")).FontSize(11).Bold().TextColor(t.TextMuted).Grow(1)
				if len(a.folders) > 0 {
					ui.MenuButton(c, a.tr("Add", "添加"), func(m *ui.Menu) {
						for _, row := range flattenFolderTree(a.folders) {
							r := row
							if m.Item(r.Folder.Name).Chosen() {
								a.addSelectedToFolder(r.Folder.ID)
							}
						}
					})
				}
			})
			if len(it.Folders) == 0 {
				ui.Text(c, a.tr("Not in a folder", "未加入文件夹")).FontSize(11).TextColor(t.TextMuted)
			}
			for _, fid := range it.Folders {
				fid := fid
				name := fid
				if f := a.findFolder(fid); f != nil {
					name = f.Name
				}
				ui.Row(c).Height(24).Gap(4).AlignItems(ui.Center).Children(func() {
					ui.Text(c, name).FontSize(11).Grow(1).SingleLine()
					if ui.Button(c, "✕").Width(20).Label(a.tr("Remove from folder", "移出文件夹")).Clicked() {
						a.removeFromFolder(it.ID, fid)
					}
				})
			}

			a.inspectorDivider(c)

			// Editable metadata.
			ui.Text(c, a.tr("Note", "备注")).FontSize(11).Bold().TextColor(t.TextMuted)
			if ui.TextArea(c, &a.draftNote).Height(76).Placeholder(a.tr("Add a note…", "添加备注…")).Changed() {
				a.editorDirty = true
			}
			ui.Text(c, "URL").FontSize(11).Bold().TextColor(t.TextMuted)
			if ui.TextInput(c, &a.draftURL).Placeholder("https://…").Changed() {
				a.editorDirty = true
			}
			ui.Text(c, "Prompt").FontSize(11).Bold().TextColor(t.TextMuted)
			if ui.TextArea(c, &a.draftPrompt).Height(64).Changed() {
				a.editorDirty = true
			}
			if a.editorDirty {
				if ui.PrimaryButton(c, a.tr("Save changes", "保存修改")).Clicked() || c.Shortcut(ui.Cmd, ui.KeyS) {
					a.saveEditor()
				}
			}

			a.inspectorDivider(c)
			a.viewItemMeta(c, it)

			a.inspectorDivider(c)
			ui.Row(c).Gap(6).Wrap().Children(func() {
				if ui.Button(c, a.tr("Open", "打开")).Clicked() {
					a.openSelected()
				}
				if ui.Button(c, a.tr("Reveal", "在访达中显示")).Clicked() {
					a.revealSelected()
				}
				if ui.Button(c, a.tr("Copy Path", "复制路径")).Clicked() {
					a.copySelectedPaths()
				}
				if a.view == viewTrash {
					if ui.Button(c, a.tr("Restore", "恢复")).Clicked() {
						a.requestRestoreSelected()
					}
					if ui.Button(c, a.tr("Delete", "删除")).Clicked() {
						a.requestDeleteSelected()
					}
				} else {
					if ui.Button(c, a.tr("Delete", "删除")).Clicked() {
						a.requestDeleteSelected()
					}
				}
			})
		})
	})
}

func (a *App) inspectorDivider(c *ui.Context) {
	ui.Divider(c).Padding(2, 0)
}

func (a *App) viewItemMeta(c *ui.Context, it *core.Item) {
	t := c.Theme()
	row := func(label, value string) {
		ui.Row(c).Gap(6).Children(func() {
			ui.Text(c, label).FontSize(10).TextColor(t.TextMuted).Width(78)
			ui.Text(c, value).FontSize(10).Grow(1).Selectable().SingleLine()
		})
	}
	row(a.tr("Type", "类型"), strings.ToUpper(it.Extension)+" · "+it.MimeType)
	row(a.tr("Size", "大小"), fmt.Sprintf("%s · %dx%d", formatBytes(it.Size, 1), it.Width, it.Height))
	if it.Meta != nil {
		if it.Meta.Megapixels != "" {
			row(a.tr("Megapixels", "像素"), it.Meta.Megapixels)
		}
		if it.Meta.ExifModel != "" {
			row(a.tr("Camera", "相机"), strings.TrimSpace(it.Meta.ExifMake+" "+it.Meta.ExifModel))
		}
		if it.Meta.ExifDate != "" {
			row(a.tr("Taken", "拍摄"), it.Meta.ExifDate)
		}
	}
	row(a.tr("Imported", "导入"), formatDate(it.ImportedAt))
	row(a.tr("Created", "创建"), formatDate(it.CreatedAt))
	row(a.tr("Hash", "哈希"), it.Hex)
	row(a.tr("File", "文件"), a.itemPath(it))
	if it.URL != "" {
		ui.Row(c).Gap(6).Children(func() {
			ui.Text(c, "URL").FontSize(10).TextColor(t.TextMuted).Width(78)
			ui.Link(c, truncate(it.URL, 42), it.URL).FontSize(10)
		})
	}
}

func (a *App) viewMultiInspector(c *ui.Context, sel []core.Item) {
	t := c.Theme()
	var total int64
	cats := map[string]int{}
	for i := range sel {
		total += sel[i].Size
		cats[fileCategory(sel[i].Extension, sel[i].MimeType)]++
	}
	ui.Scroll(c).Grow(1).Padding(12).Gap(10).Children(func() {
		ui.Textf(c, a.tr("%d items selected", "已选 %d 个素材"), len(sel)).FontSize(15).Bold()
		ui.Text(c, formatBytes(total, 1)).FontSize(11).TextColor(t.TextMuted)
		ui.Row(c).Gap(6).Wrap().Children(func() {
			for _, cat := range []string{"image", "video", "audio", "document", "archive", "other"} {
				if n := cats[cat]; n > 0 {
					ui.Badge(c, fmt.Sprintf("%s %d", cat, n))
				}
			}
		})
		a.inspectorDivider(c)
		ui.Text(c, a.tr("Tags for all selected", "为全部选中项设置标签")).FontSize(11).Bold().TextColor(t.TextMuted)
		if ui.TokenField(c, &a.bulkTags, a.tagNames()).Changed() {
			a.setTagsForSelection(a.bulkTags)
		}
		a.inspectorDivider(c)
		ui.Row(c).Gap(6).Wrap().Children(func() {
			if len(a.folders) > 0 {
				ui.MenuButton(c, a.tr("Add to Folder", "加入文件夹"), func(m *ui.Menu) {
					for _, row := range flattenFolderTree(a.folders) {
						r := row
						if m.Item(r.Folder.Name).Chosen() {
							a.addSelectedToFolder(r.Folder.ID)
						}
					}
				})
			}
			if ui.Button(c, a.tr("Copy Paths", "复制路径")).Clicked() {
				a.copySelectedPaths()
			}
			if a.view == viewTrash {
				if ui.Button(c, a.tr("Restore", "恢复")).Clicked() {
					a.requestRestoreSelected()
				}
				if ui.Button(c, a.tr("Delete", "删除")).Clicked() {
					a.requestDeleteSelected()
				}
			} else {
				if ui.Button(c, a.tr("Delete", "删除")).Clicked() {
					a.requestDeleteSelected()
				}
			}
			if ui.Button(c, a.tr("Clear Selection", "清除选择")).Clicked() {
				a.selection.Clear()
				a.selectedIndex = -1
				a.selectedID = ""
			}
		})
		a.inspectorDivider(c)
		for i := range sel {
			if i >= 50 {
				ui.Textf(c, a.tr("… and %d more", "… 还有 %d 个"), len(sel)-50).FontSize(10).TextColor(t.TextMuted)
				break
			}
			it := sel[i]
			ui.Row(c).Gap(6).Height(28).AlignItems(ui.Center).Children(func() {
				ui.Text(c, it.Name).FontSize(11).Grow(1).SingleLine()
				ui.Text(c, extensionLabel(it.Extension)).FontSize(9).TextColor(t.TextMuted)
			})
		}
	})
}
