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
				ui.Text(c, a.t("native.nothing.selected")).FontSize(13).TextColor(t.TextMuted)
				ui.Text(c, a.t("native.select.an.item.to.inspect.it")).FontSize(11).TextColor(t.TextMuted).TextAlign(ui.Center)
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
				label := "☆ " + a.t("inspector.favorite")
				if fav {
					label = "★ " + a.t("inspector.favorited")
				}
				if ui.Button(c, label).Clicked() {
					a.toggleFavorite(it.ID)
				}
				ui.Spacer(c)
				if a.editorDirty {
					if ui.PrimaryButton(c, a.t("common.save")).Clicked() {
						a.saveEditor()
					}
				}
			})
			ui.Row(c).Gap(6).AlignItems(ui.Center).Children(func() {
				ui.Text(c, a.t("filters.rating")).FontSize(11).TextColor(t.TextMuted)
				r := a.draftRating
				if ui.Rating(c, &r, 5).Changed() {
					a.draftRating = r
					a.setRating(it.ID, r)
				}
			})

			a.inspectorDivider(c)

			// Tags.
			ui.Text(c, a.t("native.tags")).FontSize(11).Bold().TextColor(t.TextMuted)
			if ui.TokenField(c, &a.draftTags, a.tagNames()).Changed() {
				a.setItemTags(it.ID, a.draftTags)
			}

			// Folders.
			ui.Row(c).Gap(6).AlignItems(ui.Center).Children(func() {
				ui.Text(c, a.t("native.folders")).FontSize(11).Bold().TextColor(t.TextMuted).Grow(1)
				if len(a.folders) > 0 {
					ui.MenuButton(c, a.t("inspector.add"), func(m *ui.Menu) {
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
				ui.Text(c, a.t("native.not.in.a.folder")).FontSize(11).TextColor(t.TextMuted)
			}
			for _, fid := range it.Folders {
				fid := fid
				name := fid
				if f := a.findFolder(fid); f != nil {
					name = f.Name
				}
				ui.Row(c).Height(24).Gap(4).AlignItems(ui.Center).Children(func() {
					ui.Text(c, name).FontSize(11).Grow(1).SingleLine()
					if ui.Button(c, "✕").Width(20).Label(a.t("native.remove.from.folder")).Clicked() {
						a.removeFromFolder(it.ID, fid)
					}
				})
			}

			a.inspectorDivider(c)

			// Editable metadata.
			ui.Text(c, a.t("inspector.note")).FontSize(11).Bold().TextColor(t.TextMuted)
			if ui.TextArea(c, &a.draftNote).Height(76).Placeholder(a.t("native.add.a.note")).Changed() {
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
				if ui.PrimaryButton(c, a.t("native.save.changes")).Clicked() || c.Shortcut(ui.Cmd, ui.KeyS) {
					a.saveEditor()
				}
			}

			a.inspectorDivider(c)
			a.viewItemMeta(c, it)

			a.inspectorDivider(c)
			ui.Row(c).Gap(6).Wrap().Children(func() {
				if ui.Button(c, a.t("native.open")).Clicked() {
					a.openSelected()
				}
				if ui.Button(c, a.t("native.reveal")).Clicked() {
					a.revealSelected()
				}
				if ui.Button(c, a.t("settings.data.copyPath")).Clicked() {
					a.copySelectedPaths()
				}
				if a.view == viewTrash {
					if ui.Button(c, a.t("contextMenu.restore")).Clicked() {
						a.requestRestoreSelected()
					}
					if ui.Button(c, a.t("common.delete")).Clicked() {
						a.requestDeleteSelected()
					}
				} else {
					if ui.Button(c, a.t("common.delete")).Clicked() {
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
	row(a.t("filters.type"), strings.ToUpper(it.Extension)+" · "+it.MimeType)
	row(a.t("filters.size"), fmt.Sprintf("%s · %dx%d", formatBytes(it.Size, 1), it.Width, it.Height))
	if it.Meta != nil {
		if it.Meta.Megapixels != "" {
			row(a.t("native.megapixels"), it.Meta.Megapixels)
		}
		if it.Meta.ExifModel != "" {
			row(a.t("inspector.camera"), strings.TrimSpace(it.Meta.ExifMake+" "+it.Meta.ExifModel))
		}
		if it.Meta.ExifDate != "" {
			row(a.t("native.taken"), it.Meta.ExifDate)
		}
	}
	row(a.t("native.imported"), formatDate(it.ImportedAt))
	row(a.t("native.created"), formatDate(it.CreatedAt))
	row(a.t("native.hash"), it.Hex)
	row(a.t("native.file"), a.itemPath(it))
	if it.URL != "" {
		ui.Row(c).Gap(6).Children(func() {
			ui.Text(c, "URL").FontSize(10).TextColor(t.TextMuted).Width(78)
			ui.Link(c, truncate(it.URL, 42), it.URL).FontSize(10)
		})
	}
}

// multiSelectionKey identifies a selection, for resetting per-selection drafts.
func multiSelectionKey(sel []core.Item) string {
	if len(sel) == 0 {
		return ""
	}
	var b strings.Builder
	for i := range sel {
		b.WriteString(sel[i].ID)
		b.WriteByte('|')
	}
	return b.String()
}

func (a *App) viewMultiInspector(c *ui.Context, sel []core.Item) {
	t := c.Theme()
	key := multiSelectionKey(sel)
	if key != a.bulkKey {
		a.bulkKey = key
		a.bulkRating = 0
		a.bulkNote = ""
	}
	var total int64
	cats := map[string]int{}
	for i := range sel {
		total += sel[i].Size
		cats[fileCategory(sel[i].Extension, sel[i].MimeType)]++
	}
	ui.Scroll(c).Grow(1).Padding(12).Gap(10).Children(func() {
		ui.Textf(c, a.t("native.d.items.selected"), len(sel)).FontSize(15).Bold()
		ui.Text(c, formatBytes(total, 1)).FontSize(11).TextColor(t.TextMuted)
		ui.Row(c).Gap(6).Wrap().Children(func() {
			for _, cat := range []string{"image", "video", "audio", "document", "archive", "other"} {
				if n := cats[cat]; n > 0 {
					ui.Badge(c, fmt.Sprintf("%s %d", cat, n))
				}
			}
		})
		a.inspectorDivider(c)
		ui.Text(c, a.t("native.tags.for.all.selected")).FontSize(11).Bold().TextColor(t.TextMuted)
		if ui.TokenField(c, &a.bulkTags, a.tagNames()).Changed() {
			a.setTagsForSelection(a.bulkTags)
		}
		a.inspectorDivider(c)
		ui.Text(c, a.t("native.rating.for.all.selected")).FontSize(11).Bold().TextColor(t.TextMuted)
		ui.Row(c).Gap(4).AlignItems(ui.Center).Children(func() {
			r := a.bulkRating
			if ui.Rating(c, &r, 5).Changed() {
				a.bulkRating = r
				a.setRatingForSelection(r)
			}
			ui.Textf(c, "%d / 5", a.bulkRating).FontSize(10).TextColor(t.TextMuted)
		})
		ui.Row(c).Gap(6).Children(func() {
			for _, r := range []int{0, 1, 2, 3, 4, 5} {
				r := r
				if ui.Button(c, fmt.Sprintf("%d", r)).Width(28).Label(fmt.Sprintf("%d stars", r)).Clicked() {
					a.setRatingForSelection(r)
				}
			}
		})
		a.inspectorDivider(c)
		ui.Text(c, a.t("native.note.for.all.selected")).FontSize(11).Bold().TextColor(t.TextMuted)
		ui.TextArea(c, &a.bulkNote).Height(64).Placeholder(a.t("native.replace.the.note.of.every.selected.item"))
		if ui.PrimaryButton(c, a.t("native.apply.note")).Clicked() {
			a.setNoteForSelection(a.bulkNote)
		}
		a.inspectorDivider(c)
		ui.Row(c).Gap(6).Wrap().Children(func() {
			if len(a.folders) > 0 {
				ui.MenuButton(c, a.t("native.add.to.folder"), func(m *ui.Menu) {
					for _, row := range flattenFolderTree(a.folders) {
						r := row
						if m.Item(r.Folder.Name).Chosen() {
							a.addSelectedToFolder(r.Folder.ID)
						}
					}
				})
			}
			if ui.Button(c, a.t("native.copy.paths")).Clicked() {
				a.copySelectedPaths()
			}
			if a.view == viewTrash {
				if ui.Button(c, a.t("contextMenu.restore")).Clicked() {
					a.requestRestoreSelected()
				}
				if ui.Button(c, a.t("common.delete")).Clicked() {
					a.requestDeleteSelected()
				}
			} else {
				if ui.Button(c, a.t("common.delete")).Clicked() {
					a.requestDeleteSelected()
				}
			}
			if ui.Button(c, a.t("native.clear.selection")).Clicked() {
				a.selection.Clear()
				a.selectedIndex = -1
				a.selectedID = ""
			}
		})
		a.inspectorDivider(c)
		for i := range sel {
			if i >= 50 {
				ui.Textf(c, a.t("native.and.d.more"), len(sel)-50).FontSize(10).TextColor(t.TextMuted)
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
