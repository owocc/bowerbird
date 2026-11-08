package app

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"bowerbird/core"
	"bowerbird/internal/player"
	"bowerbird/internal/plugin"

	"github.com/egoist/mygo/ui"
)

// loadInspector fetches the full item and asks enabled plugins for extension
// metadata. Results return on the main thread, tagged with a sequence so a fast
// click through the gallery cannot show a stale item.
func (a *App) loadInspector(id string) {
	if a.svc == nil || id == "" {
		a.inspectSections = nil
		return
	}
	a.detailSeq++
	seq := a.detailSeq
	a.inspectSeq++
	inspectSeq := a.inspectSeq
	itemCopy := core.Item{}
	if a.activeItem != nil {
		itemCopy = *a.activeItem
	}
	go func() {
		item, err := a.svc.GetItem(id)
		var sections []plugin.InspectSection
		if a.pluginHost != nil {
			sections = a.pluginHost.Inspect(pluginContext([]core.Item{itemCopy}, a.folderID).Items[0])
		}
		a.post(func() {
			if seq != a.detailSeq || inspectSeq != a.inspectSeq {
				return
			}
			if err == nil && item != nil {
				a.activeItem = item
				a.renameValue = item.Name
				a.ratingDraft = item.Rating
				a.noteDraft = item.Note
				a.promptDraft = item.Prompt
				a.urlDraft = item.URL
			}
			a.inspectSections = sections
		})
	}()
}

func (a *App) viewInspector(c *ui.Context) {
	p := paletteFor(c.Theme())
	ui.Column(c).Width(inspectorWidth).FillHeight().Background(p.sidebar).Children(func() {
		ui.Row(c).Height(headerHeight).PaddingX(14).AlignItems(ui.Center).DragWindow().Children(func() {
			ui.Text(c, a.t("inspector.title")).FontSize(12).FontWeight(650).TextColor(p.text)
		})
		ui.Scroll(c).Grow(1).Shrink(1).Padding(0, 14, 20, 14).Children(func() {
			if len(a.selected) > 1 {
				a.viewMultiInspector(c)
				return
			}
			if a.activeItem == nil {
				a.emptyState(c, iconInfo, a.t("inspector.noSelection"), a.t("inspector.noSelectionHint"))
				return
			}
			a.viewSingleInspector(c, *a.activeItem)
		})
	})
}

func (a *App) viewSingleInspector(c *ui.Context, item core.Item) {
	p := paletteFor(c.Theme())
	ui.Column(c).FillWidth().Gap(10).Children(func() {
		// Hero thumbnail.
		w := float32(inspectorWidth - 28)
		h := w * 0.66
		if item.Width > 0 && item.Height > 0 {
			h = w * float32(item.Height) / float32(item.Width)
		}
		if h > 240 {
			h = 240
		}
		if h < 80 {
			h = 80
		}
		hero := ui.Box(c).FillWidth().Height(h).Radius(10).Background(p.surface2).Clip()
		path := ""
		if item.HasThumbnail {
			path = filepath.Join(item.ItemPath, "thumbnail.jpg")
		} else if categoryOf(item) == "image" {
			path = item.FilePath
		}
		bmp := a.thumbs.get(path, int(w*2))
		hero.Children(func() {
			if bmp != nil {
				ui.Image(c, bmp).Fill().Fit(ui.Contain)
			} else {
				ui.Column(c).Fill().Center().Children(func() {
					ui.Icon(c, categoryIcon(item)).Size(30, 30).TextColor(p.faint)
				})
			}
		})
		if hero.DoubleClicked() {
			a.openPreview(item.ID, "inline")
		} else if hero.Clicked() {
			now := time.Now()
			if a.lastClickID == item.ID && now.Sub(a.lastClickTime) < 350*time.Millisecond {
				a.lastClickID = ""
				a.openPreview(item.ID, "inline")
			} else {
				a.lastClickID = item.ID
				a.lastClickTime = now
			}
		}

		// File name, edited inline.
		ui.TextInput(c.Key("rename"), &a.renameValue).FontSize(14).FontWeight(600).OnSubmit(func() {
			name := strings.TrimSpace(a.renameValue)
			if name == "" || name == item.Name {
				return
			}
			go func() {
				updated, err := a.svc.RenameItem(item.ID, name)
				a.post(func() {
					if err != nil {
						a.showToast(err.Error())
						return
					}
					if updated != nil {
						a.activeItem = updated
					}
					a.refreshAll()
				})
			}()
		})
		ui.Text(c, fmt.Sprintf("%s · %dx%d · %s", strings.ToUpper(item.Extension), item.Width, item.Height, formatBytes(item.Size))).FontSize(10.5).TextColor(p.faint).FontFeatures("tnum")

		// Dominant palette: click a swatch to copy its hex.
		if len(item.Palette) > 0 {
			ui.Row(c).FillWidth().Height(24).Gap(4).Margin(2, 0, 0, 0).Children(func() {
				for i, hex := range item.Palette {
					if i >= 8 {
						break
					}
					col, err := parseColor(hex)
					if err != nil {
						continue
					}
					hex := hex
					sw := ui.ButtonBase(c.Key("swatch-"+hex+fmt.Sprint(i))).Grow(1).Height(18).Radius(5).Background(col).Border(1, p.hairline).FocusRing(false)
					sw.Tooltip(hex)
					if sw.Clicked() {
						_ = a.svc.WriteClipboardText(hex)
						a.showToast(a.tf("inspector.copiedHex", map[string]any{"hex": hex}))
					}
				}
			})
		}

		a.inspectorDivider(c)
		a.sectionLabel(c, a.t("inspector.rating"))
		ui.Row(c).Gap(4).Children(func() {
			for i := 1; i <= 5; i++ {
				i := i
				filled := i <= a.ratingDraft
				b := ui.ButtonBase(c.Key(fmt.Sprintf("rate-%d", i))).Size(24, 24).Radius(5).FocusRing(false).AlignItems(ui.Center).Justify(ui.Center)
				b.Children(func() {
					if filled {
						ui.Icon(c, iconStarFill).Size(16, 16).TextColor(ui.Hex("#f5b301"))
					} else {
						ui.Icon(c, iconStar).Size(16, 16).TextColor(p.faint)
					}
				})
				if b.Clicked() {
					if a.ratingDraft == i {
						a.ratingDraft = 0
					} else {
						a.ratingDraft = i
					}
					a.saveDetails(item.ID)
				}
			}
			if a.ratingDraft > 0 {
				ui.Box(c).Grow(1)
				if ui.ButtonBase(c.Key("rate-clear")).Height(24).PaddingX(8).Radius(5).FocusRing(false).AlignItems(ui.Center).Children(func() {
					ui.Text(c, a.t("inspector.clear")).FontSize(10.5).TextColor(p.faint)
				}).Clicked() {
					a.ratingDraft = 0
					a.saveDetails(item.ID)
				}
			}
		})

		a.inspectorDivider(c)
		a.sectionLabel(c, a.t("inspector.tags"))
		ui.Row(c).FillWidth().Wrap().Gap(5).Children(func() {
			for _, tag := range item.Tags {
				tag := tag
				chip := ui.ButtonBase(c.Key("tag-"+tag)).Height(22).PaddingX(7).Radius(999).Background(p.surface2).Border(1, p.hairline).FocusRing(false).AlignItems(ui.Center).Gap(4)
				chip.Children(func() {
					ui.Text(c, tag).FontSize(10.5).TextColor(p.text)
					ui.Icon(c, iconClose).Size(9, 9).TextColor(p.faint)
				})
				chip.Tooltip(a.t("inspector.removeTag"))
				if chip.Clicked() {
					go func() {
						err := a.svc.RemoveTagFromItem(item.ID, tag)
						a.post(func() {
							if err != nil {
								a.showToast(err.Error())
							}
							a.refreshAll()
						})
					}()
				}
			}
			add := ui.ButtonBase(c.Key("tag-add")).Height(22).PaddingX(7).Radius(999).Background(p.hover).FocusRing(false).AlignItems(ui.Center).Gap(3).Children(func() {
				ui.Icon(c, iconPlus).Size(10, 10).TextColor(p.muted)
				ui.Text(c, a.t("inspector.addTag")).FontSize(10.5).TextColor(p.muted)
			})
			if add.Clicked() {
				a.dialog = dialogTag
				a.dialogValue = ""
			}
		})

		a.inspectorDivider(c)
		a.sectionLabel(c, a.t("inspector.prompt"))
		ui.Row(c).FillWidth().AlignItems(ui.Center).Children(func() {
			ui.Text(c, a.t("inspector.promptHelp")).FontSize(10.5).TextColor(p.faint).Grow(1).Shrink(1)
			a.iconButton(c, "prompt-toggle", iconChevron, a.promptOpen, a.t("inspector.expand"), func() { a.promptOpen = !a.promptOpen })
		})
		if a.promptOpen {
			ui.TextArea(c.Key("prompt"), &a.promptDraft).FontSize(12).Height(110)
			ui.Row(c).Gap(6).Children(func() {
				if ui.Button(c, a.t("common.save")).Clicked() {
					a.saveDetails(item.ID)
				}
				if ui.Button(c, a.t("common.copy")).Clicked() {
					_ = a.svc.WriteClipboardText(a.promptDraft)
					a.showToast(a.t("common.copied"))
				}
			})
		} else if strings.TrimSpace(item.Prompt) != "" {
			ui.Text(c, item.Prompt).FontSize(11.5).TextColor(p.muted).MaxLines(3).Wrap()
		}

		a.inspectorDivider(c)
		a.sectionLabel(c, a.t("inspector.note"))
		ui.TextArea(c.Key("note"), &a.noteDraft).FontSize(12).Height(64).OnSubmit(func() { a.saveDetails(item.ID) })
		a.sectionLabel(c, a.t("inspector.sourceUrl"))
		ui.TextInput(c.Key("url"), &a.urlDraft).FontSize(11.5).OnSubmit(func() { a.saveDetails(item.ID) })
		if item.URL != "" {
			if ui.Link(c, a.t("inspector.openSource"), item.URL).FontSize(11).Clicked() {
				_ = a.svc.OpenExternalURL(item.URL)
			}
		}

		// Built-in PSD facts (the composite preview is handled by the preview
		// layer; the layer tree is shown there too).
		if strings.EqualFold(item.Extension, "psd") || strings.EqualFold(item.Extension, "psb") {
			a.inspectorDivider(c)
			a.sectionLabel(c, a.t("inspector.psd"))
			a.metaRow(c, a.t("inspector.format"), "Photoshop Document")
			a.metaRow(c, a.t("inspector.colorMode"), "RGB / composite")
			a.metaRow(c, a.t("inspector.layers"), a.t("inspector.psdLayersHint"))
		}

		// Plugin-provided sections are rendered with the same native rows.
		for _, section := range a.inspectSections {
			a.inspectorDivider(c)
			a.sectionLabel(c, section.Title)
			for _, row := range section.Rows {
				a.metaRowCopy(c, row.Label, row.Value, row.Copyable)
			}
			for _, block := range section.TextBlocks {
				ui.Text(c, block.Title).FontSize(10).FontWeight(650).TextColor(p.faint).Margin(4, 0, 0, 0)
				ui.Text(c, block.Text).FontSize(11.5).TextColor(p.muted).Wrap().MaxLines(8)
			}
		}

		a.inspectorDivider(c)
		a.sectionLabel(c, a.t("inspector.metadata"))
		a.metaRow(c, a.t("inspector.filename"), item.Filename)
		a.metaRow(c, a.t("inspector.dimensions"), fmt.Sprintf("%d × %d", item.Width, item.Height))
		a.metaRow(c, a.t("inspector.size"), formatBytes(item.Size))
		a.metaRow(c, a.t("inspector.mimeType"), item.MimeType)
		if item.Meta != nil {
			if item.Meta.ColorSpace != "" {
				a.metaRow(c, a.t("inspector.colorSpace"), item.Meta.ColorSpace)
			}
			if item.Meta.Megapixels != "" {
				a.metaRow(c, a.t("inspector.megapixels"), item.Meta.Megapixels)
			}
			if item.Meta.ExifModel != "" {
				a.metaRow(c, a.t("inspector.camera"), strings.TrimSpace(item.Meta.ExifMake+" "+item.Meta.ExifModel))
			}
		}
		a.metaRow(c, a.t("inspector.created"), formatDate(item.CreatedAt))
		a.metaRow(c, a.t("inspector.imported"), formatDate(item.ImportedAt))
		a.metaRow(c, a.t("inspector.hex"), item.Hex)

		// Native audio preview for audio items.
		if categoryOf(item) == "audio" {
			a.inspectorAudio(c, item)
		}

		ui.Row(c).FillWidth().Gap(8).Margin(12, 0, 0, 0).Children(func() {
			if ui.Button(c, a.t("inspector.reveal")).Clicked() {
				_ = a.svc.RevealInFinder(item.ID)
			}
			if ui.Button(c, a.t("contextMenu.openWithDefaultApp")).Clicked() {
				_ = a.svc.OpenWithDefaultApp(item.ID)
			}
			if ui.Button(c, a.t("contextMenu.moveToTrash")).Clicked() {
				a.trashSelected()
			}
		})
	})
}

func (a *App) saveDetails(id string) {
	if a.svc == nil {
		return
	}
	note, url, prompt, rating := a.noteDraft, a.urlDraft, a.promptDraft, a.ratingDraft
	go func() {
		item, err := a.svc.UpdateItemDetails(id, note, url, rating, prompt)
		a.post(func() {
			if err != nil {
				a.showToast(err.Error())
				return
			}
			if item != nil {
				a.activeItem = item
			}
			a.refreshAll()
		})
	}()
}

func (a *App) addTagToActive() {
	tag := strings.TrimSpace(a.dialogValue)
	if tag == "" || a.activeItemID == "" {
		a.dialog = dialogNone
		return
	}
	id := a.activeItemID
	a.dialogValue = ""
	a.dialog = dialogNone
	go func() {
		err := a.svc.AddTagToItem(id, tag)
		a.post(func() {
			if err != nil {
				a.showToast(err.Error())
			}
			a.refreshAll()
		})
	}()
}

func (a *App) inspectorDivider(c *ui.Context) {
	p := paletteFor(c.Theme())
	ui.Box(c).FillWidth().Height(1).Background(p.hairline).MarginY(4)
}

func (a *App) metaRow(c *ui.Context, label, value string) {
	a.metaRowCopy(c, label, value, false)
}

func (a *App) metaRowCopy(c *ui.Context, label, value string, copyable bool) {
	p := paletteFor(c.Theme())
	if value == "" {
		return
	}
	ui.Row(c).FillWidth().Height(24).AlignItems(ui.Center).Gap(6).Children(func() {
		ui.Text(c, label).FontSize(11).TextColor(p.faint).Width(104).Shrink(0)
		ui.Text(c, value).FontSize(11).TextColor(p.muted).Grow(1).Shrink(1).MinWidth(0).SingleLine()
		if copyable {
			if ui.ButtonBase(c.Key("copy-"+label+value)).Size(18, 18).Radius(4).FocusRing(false).AlignItems(ui.Center).Justify(ui.Center).Children(func() {
				ui.Icon(c, iconCopy).Size(11, 11).TextColor(p.faint)
			}).Clicked() {
				_ = a.svc.WriteClipboardText(value)
				a.showToast(a.t("common.copied"))
			}
		}
	})
}

func (a *App) viewMultiInspector(c *ui.Context) {
	p := paletteFor(c.Theme())
	items := a.selectedItems()
	totalSize := int64(0)
	for _, it := range items {
		totalSize += it.Size
	}

	// 按照 selectedOrder 严格还原选择的时间顺序 (FIFO)
	itemByID := make(map[string]core.Item, len(items))
	for _, it := range items {
		itemByID[it.ID] = it
	}
	var orderedItems []core.Item
	for _, id := range a.selectedOrder {
		if it, ok := itemByID[id]; ok {
			orderedItems = append(orderedItems, it)
		}
	}
	if len(orderedItems) < len(items) {
		// 回退容错: 补充可能未被有序记录的 item
		for _, it := range items {
			found := false
			for _, o := range orderedItems {
				if o.ID == it.ID {
					found = true
					break
				}
			}
			if !found {
				orderedItems = append(orderedItems, it)
			}
		}
	}

	// 截取最后选择的最多 5 张卡片形成堆叠效果 (orderedItems 尾部是最晚选中的)
	const maxStack = 5
	stackCount := len(orderedItems)
	if stackCount > maxStack {
		stackCount = maxStack
	}
	// 截取最后选中的卡片: 切片里最后一个元素是最晚选择的
	stacked := orderedItems[len(orderedItems)-stackCount:]
	ui.Column(c).FillWidth().Gap(14).Children(func() {
		// 堆叠层叠效果: 固定容器宽高并在水平/垂直中心对齐
		const areaW = inspectorWidth - 28 // 扣除 Scroll padding (14*2)
		const areaH = float32(160)
		ui.Box(c).Size(areaW, areaH).Children(func() {
			stackPresets := []struct {
				rotate float32
				dx, dy float32
			}{
				{rotate: 0, dx: 0, dy: 0},
				{rotate: -5, dx: -8, dy: 4},
				{rotate: 6, dx: 7, dy: 6},
				{rotate: -8, dx: -12, dy: 9},
				{rotate: 8, dx: 11, dy: 12},
			}
			// 从底到顶绘制 (idx: 0 是最底层, 最后一张是顶层)
			for idx, it := range stacked {
				offsetFromTop := len(stacked) - 1 - idx
				preset := stackPresets[offsetFromTop%len(stackPresets)]

				const stackH = float32(120)
				ratio := float32(1.33)
				if it.Width > 0 && it.Height > 0 {
					ratio = float32(it.Width) / float32(it.Height)
					if ratio < 0.6 {
						ratio = 0.6
					} else if ratio > 2.0 {
						ratio = 2.0
					}
				}
				stackW := stackH * ratio

				cardLeft := (areaW-stackW)*0.5 + preset.dx
				cardTop := (areaH-stackH)*0.5 + preset.dy

				cardBox := ui.Box(c.Key(fmt.Sprintf("stack-%s", it.ID))).
					Absolute().
					Left(cardLeft).
					Top(cardTop).
					Width(stackW).
					Height(stackH).
					Radius(6).
					Background(p.surface2).
					Border(1, p.hairline).
					Shadow(0, 4, 10, 0, ui.RGBA(0, 0, 0, 0.28)).
					Clip().
					Rotate(preset.rotate)
				path := ""
				if it.HasThumbnail {
					path = filepath.Join(it.ItemPath, "thumbnail.jpg")
				} else if categoryOf(it) == "image" {
					path = it.FilePath
				}
				if bmp := a.thumbs.get(path, 240); bmp != nil {
					cardBox.Children(func() {
						ui.Image(c, bmp).Fill().Fit(ui.Cover)
					})
				}
			}
		})

		// 选中文本与容量汇总
		ui.Column(c).FillWidth().Center().Gap(2).Children(func() {
			ui.Text(c, a.tf("inspector.selectedCount", map[string]any{"count": len(items)})).
				FontSize(14).FontWeight(650).TextColor(p.text).TextAlign(ui.Center)
			ui.Text(c, formatBytes(totalSize)).
				FontSize(11).TextColor(p.muted).FontFeatures("tnum").TextAlign(ui.Center)
		})
		ui.Row(c).Gap(4).Children(func() {
			for r := 1; r <= 5; r++ {
				r := r
				if ui.Button(c.Key(fmt.Sprintf("batch-rate-%d", r)), fmt.Sprintf("%d ★", r)).Clicked() {
					go func() {
						for _, it := range items {
							_, _ = a.svc.UpdateItemDetails(it.ID, it.Note, it.URL, r, it.Prompt)
						}
						a.post(func() { a.refreshAll() })
					}()
				}
			}
		})
		a.sectionLabel(c, a.t("inspector.batchTags"))
		ui.Row(c).Gap(6).Children(func() {
			ui.TextInput(c.Key("batch-tag"), &a.tagInput).Placeholder(a.t("inspector.tagName")).Grow(1).FontSize(12)
			if ui.Button(c, a.t("common.add")).Clicked() {
				tag := strings.TrimSpace(a.tagInput)
				if tag != "" {
					a.tagInput = ""
					go func() {
						for _, it := range items {
							_ = a.svc.AddTagToItem(it.ID, tag)
						}
						a.post(func() { a.refreshAll() })
					}()
				}
			}
		})
		a.sectionLabel(c, a.t("inspector.batchMove"))
		for _, f := range a.folders {
			f := f
			if ui.Button(c.Key("batch-move-"+f.ID), f.Name).Clicked() {
				go func() {
					for _, it := range items {
						_ = a.svc.AddItemToFolder(it.ID, f.ID)
					}
					a.post(func() { a.refreshAll() })
				}()
			}
		}
		a.inspectorDivider(c)
		ui.Row(c).Gap(8).Children(func() {
			if ui.Button(c, a.t("contextMenu.moveToTrash")).Clicked() {
				a.trashSelected()
			}
			if ui.Button(c, a.t("common.deselect")).Clicked() {
				a.clearSelection()
			}
		})
	})
}

func (a *App) inspectorAudio(c *ui.Context, item core.Item) {
	p := paletteFor(c.Theme())
	a.inspectorDivider(c)
	a.sectionLabel(c, a.t("inspector.audio"))
	ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
		if ui.Button(c.Key("audio-toggle"), map[bool]string{true: "❚❚", false: "▶"}[a.player != nil && a.player.Playing()]).Size(34, 34).Radius(999).Clicked() {
			if a.player == nil {
				go func() {
					pl, err := player.Open(item.FilePath)
					a.post(func() {
						if err != nil {
							a.showToast(err.Error())
							return
						}
						a.player = pl
						pl.Play()
					})
				}()
			} else {
				a.player.Toggle()
			}
		}
		ui.Column(c).Grow(1).Gap(4).Children(func() {
			if a.player != nil {
				dur := a.player.Duration().Seconds()
				pos := a.player.Position().Seconds()
				ui.Text(c, formatDuration(pos)+" / "+formatDuration(dur)).FontSize(10.5).TextColor(p.muted).FontFeatures("tnum")
			} else {
				ui.Text(c, a.t("inspector.pressPlay")).FontSize(10.5).TextColor(p.faint)
			}
		})
	})
}

var _ = time.Second
