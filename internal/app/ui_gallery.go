package app

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"bowerbird/core"
	"bowerbird/internal/plugin"

	"github.com/egoist/mygo/transfer"
	"github.com/egoist/mygo/ui"
)

// viewGallery is the virtualized justified gallery. Only the rows the list
// builds exist; each row builds only its own cards, so tens of thousands of
// items scroll at display refresh.
func (a *App) viewGallery(c *ui.Context) {
	if a.loading && len(a.items) == 0 {
		ui.Column(c).Fill().Center().Children(func() {
			ui.Spinner(c)
		})
		return
	}
	if len(a.items) == 0 {
		a.emptyState(c, iconImage, a.t("gallery.empty"), a.t("gallery.emptyHint"))
		return
	}
	a.rebuildRows()
	top := float32(mainHeaderHeight + galleryTopPadding)
	bottom := float32(24)
	p := paletteFor(c.Theme())

	container := ui.Box(c.Key("gallery-container")).Fill().Clip()
	container.HandleInput(func(ev ui.InputEvent) bool {
		switch ev.Kind {
		case ui.InputPointerDown:
			if ev.Button == 0 {
				// 卡片自身负责单击选中、双击预览和原生拖拽。只有从空白处
				// 按下时才由容器接管，开始橡皮筋框选。
				if a.itemAtPoint(ev.X, ev.Y, top) >= 0 {
					return false
				}
				a.marqueeActive = true
				a.marqueeStartX, a.marqueeStartY = ev.X, ev.Y
				a.marqueeCurX, a.marqueeCurY = ev.X, ev.Y
				additive := ev.Mods&ui.Cmd != 0 || ev.Mods&ui.Ctrl != 0 || ev.Mods&ui.Shift != 0
				a.marqueeAdditive = additive
				if additive {
					a.marqueeBase = make(map[string]bool, len(a.selected))
					for k, v := range a.selected {
						if v {
							a.marqueeBase[k] = true
						}
					}
				} else {
					a.marqueeBase = nil
					a.clearSelection()
				}
				a.updateMarqueeSelection(top)
				if a.win != nil {
					a.win.Invalidate()
				}
				return true
			}
		case ui.InputPointerMove:
			if a.marqueeActive {
				a.marqueeCurX, a.marqueeCurY = ev.X, ev.Y
				// 自动边缘滚动: 拖选拉到最下方时跟随向下滚动
				if ev.Y > 500 {
					a.galleryScroll.Y += (ev.Y - 500) * 0.15
				} else if ev.Y < 40 && a.galleryScroll.Y > 0 {
					a.galleryScroll.Y -= (40 - ev.Y) * 0.15
					if a.galleryScroll.Y < 0 {
						a.galleryScroll.Y = 0
					}
				}
				a.updateMarqueeSelection(top)
				if a.win != nil {
					a.win.Invalidate()
				}
				return true
			}
		case ui.InputPointerUp:
			if a.marqueeActive {
				dx := a.marqueeCurX - a.marqueeStartX
				dy := a.marqueeCurY - a.marqueeStartY
				if dx*dx+dy*dy < 16 && !a.marqueeAdditive {
					clickedItem := a.itemAtPoint(ev.X, ev.Y, top)
					if clickedItem >= 0 {
						a.chooseItem(clickedItem, 0)
					} else {
						a.clearSelection()
					}
				}
				a.marqueeActive = false
				a.marqueeBase = nil
				if len(a.selected) > 0 && a.activeItem == nil {
					for _, it := range a.items {
						if a.selected[it.ID] {
							a.activeItemID = it.ID
							cp := it
							a.activeItem = &cp
							a.loadInspector(it.ID)
							break
						}
					}
				}
				if a.win != nil {
					a.win.Invalidate()
				}
				return true
			}
		}
		return false
	})

	container.Children(func() {
		list := ui.List(c.Key("gallery"), &a.galleryList, len(a.rows), func(row int) {
			if row < 0 || row >= len(a.rows) {
				return
			}
			a.galleryRow(c, a.rows[row])
		}).FillWidth().Grow(1).Shrink(1).TrackScroll(&a.galleryScroll).Gap(8).Padding(top, gallerySidePadding, bottom, gallerySidePadding).ScrollbarInsets(top, 0, bottom, 0)
		if list.Clicked() && len(a.selected) > 0 {
			a.clearSelection()
			if a.win != nil {
				a.win.Invalidate()
			}
		}
	})
	container.ContextMenu(a.viewContextMenu)

	container.DrawOver(func(pt *ui.Painter, r ui.Rect) {
		if !a.marqueeActive {
			return
		}
		x0, y0 := a.marqueeStartX, a.marqueeStartY
		x1, y1 := a.marqueeCurX, a.marqueeCurY
		bx := minF(x0, x1)
		by := minF(y0, y1)
		bw := maxF(x0, x1) - bx
		bh := maxF(y0, y1) - by
		if bw < 2 && bh < 2 {
			return
		}
		boxRect := ui.Rect{X: r.X + bx, Y: r.Y + by, W: bw, H: bh}
		pt.Fill(boxRect, p.accent.Alpha(0.18), 3)
		pt.Stroke(boxRect, p.accent.Alpha(0.85), 3, 1)
	})
}
func (a *App) itemAtPoint(x, y, padTop float32) int {
	targetY := y
	const gap = float32(8)
	padLeft := float32(gallerySidePadding)
	curY := padTop - a.galleryScroll.Y

	for _, row := range a.rows {
		if len(row) == 0 {
			continue
		}
		rowH := float32(row[0].height)
		rowTop := curY
		rowBottom := curY + rowH
		curY = rowBottom + gap

		if targetY < rowTop || targetY > rowBottom {
			continue
		}

		curX := padLeft
		for _, cell := range row {
			cellW := float32(cell.width)
			cellLeft := curX
			cellRight := curX + cellW
			curX = cellRight + gap

			if x >= cellLeft && x <= cellRight {
				return cell.index
			}
		}
	}
	return -1
}

func (a *App) updateMarqueeSelection(padTop float32) {
	x0, y0 := a.marqueeStartX, a.marqueeStartY
	x1, y1 := a.marqueeCurX, a.marqueeCurY
	boxLeft := minF(x0, x1)
	boxRight := maxF(x0, x1)
	boxTop := minF(y0, y1)
	boxBottom := maxF(y0, y1)

	hit := make(map[string]bool)
	const gap = float32(8)
	padLeft := float32(gallerySidePadding)
	curY := padTop - a.galleryScroll.Y

	for _, row := range a.rows {
		if len(row) == 0 {
			continue
		}
		rowH := float32(row[0].height)
		rowTop := curY
		rowBottom := curY + rowH
		curY = rowBottom + gap

		if rowBottom < boxTop || rowTop > boxBottom {
			continue
		}

		curX := padLeft
		for _, cell := range row {
			cellW := float32(cell.width)
			cellLeft := curX
			cellRight := curX + cellW
			curX = cellRight + gap

			if cell.index < 0 || cell.index >= len(a.items) {
				continue
			}
			if !(cellRight < boxLeft || cellLeft > boxRight) {
				hit[a.items[cell.index].ID] = true
			}
		}
	}

	newSelected := make(map[string]bool)
	if a.marqueeAdditive && a.marqueeBase != nil {
		for id := range a.marqueeBase {
			newSelected[id] = true
		}
	}
	for id := range hit {
		newSelected[id] = true
	}
	a.selected = newSelected
	// Maintain FIFO selectedOrder: retain existing selected IDs in order, append newly hit IDs
	var nextOrder []string
	seen := make(map[string]bool)
	for _, id := range a.selectedOrder {
		if a.selected[id] {
			nextOrder = append(nextOrder, id)
			seen[id] = true
		}
	}
	for _, it := range a.items {
		if a.selected[it.ID] && !seen[it.ID] {
			nextOrder = append(nextOrder, it.ID)
			seen[it.ID] = true
		}
	}
	a.selectedOrder = nextOrder

	if len(a.selectedOrder) > 0 {
		lastID := a.selectedOrder[len(a.selectedOrder)-1]
		a.activeItemID = lastID
		for i, it := range a.items {
			if it.ID == lastID {
				cp := it
				a.activeItem = &cp
				a.selectedAt = i
				break
			}
		}
	} else {
		a.activeItemID = ""
		a.activeItem = nil
		a.selectedAt = -1
	}
}
func (a *App) galleryRow(c *ui.Context, row []galleryCell) {
	if len(row) == 0 {
		return
	}
	height := float32(row[0].height)
	ui.Row(c).FillWidth().Height(height).Gap(8).PassThrough().Children(func() {
		for _, cell := range row {
			if cell.index < 0 || cell.index >= len(a.items) {
				continue
			}
			a.itemCard(c, a.items[cell.index], cell.index, float32(cell.width), float32(cell.height))
		}
	})
}

func (a *App) itemCard(c *ui.Context, item core.Item, index int, w, h float32) {
	p := paletteFor(c.Theme())
	selected := a.selected[item.ID]
	isList := a.prefs.LayoutMode == "list"

	card := ui.ButtonBase(c.Key("item-" + item.ID)).Width(w).Height(h).FocusRing(false)
	if isList {
		card.Row().AlignItems(ui.Center).Gap(10).PaddingX(8).PaddingY(4)
	} else {
		card.Column().Gap(4).AlignItems(ui.Start).Padding(3)
	}
	card.Cursor(ui.CursorPointer)
	card.Radius(8)
	bg := ui.Transparent
	card.Background(card.AnimateColor("bg", bg, ui.Animation{Duration: 110 * time.Millisecond}))
	// Native drag out: advertises the file list to Finder and other apps.
	card.DragDataFrom(func() transfer.Data { return a.itemDragData(item) })

	// Resolve thumbnail or system file icon
	path := ""
	if item.HasThumbnail {
		path = filepath.Join(item.ItemPath, "thumbnail.jpg")
	} else if categoryOf(item) == "image" {
		path = item.FilePath
	}

	var bmp *ui.Bitmap
	if path != "" {
		bmp = a.thumbs.get(path, int(w*2))
	}
	var sysIconBmp *ui.Bitmap
	if bmp == nil {
		sysIconBmp = a.thumbs.getSystemIcon(item.Extension, item.FilePath)
	}

	if isList {
		card.Children(func() {
			thumbSize := h - 8
			if thumbSize < 24 {
				thumbSize = 24
			}
			thumbBox := ui.Box(c).Size(thumbSize, thumbSize).Radius(6).Background(p.surface2).Clip()
			thumbBox.Children(func() {
				if bmp != nil {
					ui.Image(c, bmp).Fill().Fit(ui.Cover)
				} else if sysIconBmp != nil {
					ui.Image(c, sysIconBmp).Fill().Fit(ui.Contain)
				} else {
					ui.Column(c).Fill().Center().Children(func() {
						ui.Icon(c, categoryIcon(item)).Size(16, 16).TextColor(p.faint)
					})
				}
			})

			// Name
			ui.Text(c, item.Name).FontSize(12).TextColor(p.text).Grow(1).Shrink(1).MinWidth(0).SingleLine()

			// Rating
			if item.Rating > 0 {
				ui.Row(c).AlignItems(ui.Center).Gap(2).Children(func() {
					ui.Icon(c, iconStarFill).Size(11, 11).TextColor(ui.Hex("#ffd166"))
					ui.Textf(c, "%d", item.Rating).FontSize(11).FontWeight(650).TextColor(ui.Hex("#ffd166"))
				})
			}

			// Dimension or Category
			dimStr := "-"
			if item.Width > 0 && item.Height > 0 {
				dimStr = fmt.Sprintf("%d × %d", item.Width, item.Height)
			}
			ui.Text(c, dimStr).FontSize(11).TextColor(p.faint).Width(90).TextAlign(ui.End).FontFeatures("tnum").SingleLine()

			// Extension badge
			extStr := strings.ToUpper(item.Extension)
			if extStr == "" {
				extStr = "-"
			}
			ui.Box(c).Width(48).Height(20).Radius(4).Background(p.surface2).AlignItems(ui.Center).Justify(ui.Center).Children(func() {
				ui.Text(c, extStr).FontSize(9).FontWeight(650).TextColor(p.muted)
			})

			// Size
			ui.Text(c, formatBytes(item.Size)).FontSize(11).TextColor(p.faint).Width(70).TextAlign(ui.End).FontFeatures("tnum").SingleLine()
		})
	} else {
		card.Children(func() {
			nameH := float32(0)
			if a.prefs.ShowNames {
				nameH = 20
			}
			imgH := h - nameH - 8
			if imgH < 24 {
				imgH = h - 8
				nameH = 0
			}
			thumbBox := ui.Box(c).FillWidth().Height(imgH).Radius(7).Background(p.surface2).Clip()
			if selected {
				thumbBox.Border(2, p.accent)
			}
			if card.Hovered() {
				thumbBox.Shadow(0, 10, 26, -8, p.cardShade)
			} else {
				thumbBox.Shadow(0, 2, 5, -1, p.cardShade)
			}

			thumbBox.Children(func() {
				fadeTarget := float32(0)
				if bmp != nil || sysIconBmp != nil {
					fadeTarget = 1
				}
				op := card.AnimateTo("fade-"+item.ID, fadeTarget, ui.Animation{Duration: 320 * time.Millisecond, Ease: ui.EaseOut})
				if bmp != nil {
					ui.Image(c, bmp).Fill().Fit(ui.Cover).Opacity(maxF(op, 0.01))
				} else if sysIconBmp != nil {
					ui.Column(c).Fill().Center().Children(func() {
						iconSize := minF(imgH*0.65, 64)
						ui.Image(c, sysIconBmp).Size(iconSize, iconSize).Fit(ui.Contain).Opacity(maxF(op, 0.01))
					})
				} else {
					ui.Column(c).Fill().Center().Gap(4).Children(func() {
						ui.Icon(c, categoryIcon(item)).Size(24, 24).TextColor(p.faint)
						if !item.HasThumbnail && categoryOf(item) != "image" {
							ui.Text(c, strings.ToUpper(item.Extension)).FontSize(9).FontWeight(650).TextColor(p.faint)
						}
					})
				}
				// Format / duration badge.
				if a.prefs.ShowExt && item.Extension != "" {
					badge := strings.ToUpper(item.Extension)
					ui.Box(c).Absolute().Bottom(6).Right(6).Padding(2, 6).Radius(4).Background(ui.RGBA(0, 0, 0, 0.62)).Children(func() {
						ui.Text(c, badge).FontSize(9).FontWeight(650).TextColor(ui.Hex("#ffffff"))
					})
				}
				if item.Rating > 0 {
					ui.Row(c).Absolute().Top(6).Right(6).Padding(2, 6).Radius(4).Background(ui.RGBA(0, 0, 0, 0.55)).Gap(2).Children(func() {
						ui.Icon(c, iconStarFill).Size(9, 9).TextColor(ui.Hex("#ffd166"))
						ui.Textf(c, "%d", item.Rating).FontSize(9).FontWeight(650).TextColor(ui.Hex("#ffffff"))
					})
				}
			})
			if nameH > 0 {
				ui.Row(c).FillWidth().Height(nameH).PaddingX(2).AlignItems(ui.Center).Justify(ui.Center).Children(func() {
					nameBox := ui.Box(c).PaddingX(6).PaddingY(2).Radius(4).AlignItems(ui.Center).Justify(ui.Center)
					nameColor := p.text
					if selected {
						nameBox.Background(p.accent)
						nameColor = p.onAccent
					}
					nameWeight := 400
					if selected {
						nameWeight = 600
					}
					nameBox.Children(func() {
						ui.Text(c, item.Name).FontSize(11).FontWeight(nameWeight).TextColor(nameColor).Grow(1).Shrink(1).MinWidth(0).SingleLine().TextAlign(ui.Center)
					})
				})
			}
		})
	}
	if card.Shortcut(0, ui.KeySpace) {
		if a.previewOpen {
			a.closePreview()
		} else {
			a.openPreview(item.ID, "full")
		}
	} else if card.DoubleClicked() {
		a.clearItemClick()
		a.openPreview(item.ID, "inline")
	} else if card.Clicked() {
		a.handleItemClick(item, index)
	}
	card.ContextMenu(func(m *ui.Menu) {
		if !a.selected[item.ID] {
			a.chooseItem(index, 0)
		}
		a.itemContextMenu(m, item)
	})
}

// itemDragData builds the native file-list drag for a gallery card or the
// inspector hero. Dragging a member of a multi-selection carries the whole
// selection; dragging any other item carries just that item.
func (a *App) itemDragData(item core.Item) transfer.Data {
	ids := []string{item.ID}
	if len(a.selected) > 1 && a.selected[item.ID] {
		ids = ids[:0]
		for _, it := range a.items {
			if a.selected[it.ID] {
				ids = append(ids, it.ID)
			}
		}
	}
	urls := make([]string, 0, len(ids))
	for _, it := range a.items {
		for _, id := range ids {
			if it.ID == id && it.FileURL != "" {
				urls = append(urls, it.FileURL)
			}
		}
	}
	return transfer.New(transfer.NewItem(transfer.Bytes(transfer.FileList, []byte(strings.Join(urls, "\r\n")))))
}

// clearItemClick forgets the click that may start a manual double click.
func (a *App) clearItemClick() {
	a.lastClickID = ""
	a.lastClickTime = time.Time{}
}

// itemClickCompletesDouble records a click and reports whether it completes
// a quick second click on the same item. It is the fallback for platforms
// that do not report click counts; the native DoubleClicked is preferred.
func (a *App) itemClickCompletesDouble(id string) bool {
	now := time.Now()
	if a.lastClickID == id && now.Sub(a.lastClickTime) < 350*time.Millisecond {
		a.clearItemClick()
		return true
	}
	a.lastClickID = id
	a.lastClickTime = now
	return false
}

// handleItemClick selects a card, with a manual double-click fallback for
// platforms that do not report click counts.
func (a *App) handleItemClick(item core.Item, index int) {
	if a.itemClickCompletesDouble(item.ID) {
		a.openPreview(item.ID, "inline")
		return
	}
	a.chooseItem(index, 0)
}

func (a *App) chooseItem(index int, mods ui.Modifiers) {
	if index < 0 || index >= len(a.items) {
		return
	}
	item := a.items[index]
	a.selected = map[string]bool{item.ID: true}
	a.selectedOrder = []string{item.ID}
	a.selectedAt = index
	a.activeItemID = item.ID
	cp := item
	a.activeItem = &cp
	a.loadInspector(item.ID)
	if a.win != nil {
		a.win.Invalidate()
	}
}

func (a *App) moveGallerySelection(dx, dy int) {
	if len(a.items) == 0 {
		return
	}
	currentIdx := a.selectedAt
	if currentIdx < 0 || currentIdx >= len(a.items) {
		if a.activeItemID != "" {
			for i, it := range a.items {
				if it.ID == a.activeItemID {
					currentIdx = i
					break
				}
			}
		}
	}
	if currentIdx < 0 || currentIdx >= len(a.items) {
		if dy < 0 || dx < 0 {
			a.chooseItem(len(a.items)-1, 0)
		} else {
			a.chooseItem(0, 0)
		}
		return
	}

	mode := a.prefs.LayoutMode
	if mode == "list" {
		next := currentIdx + dy
		if dx != 0 && dy == 0 {
			next = currentIdx + dx
		}
		if next < 0 {
			next = 0
		}
		if next >= len(a.items) {
			next = len(a.items) - 1
		}
		a.chooseItem(next, 0)
		a.galleryList.ScrollIntoView(next)
		return
	}

	// Horizontal move in grid / justified
	if dx != 0 && dy == 0 {
		next := currentIdx + dx
		if next < 0 {
			next = 0
		}
		if next >= len(a.items) {
			next = len(a.items) - 1
		}
		a.chooseItem(next, 0)
		for rIdx, r := range a.rows {
			for _, c := range r {
				if c.index == next {
					a.galleryList.ScrollIntoView(rIdx)
					return
				}
			}
		}
		return
	}

	// Vertical move in 2D rows (grid / justified)
	// Find which row and column currently holds currentIdx
	curRow := -1
	curCol := -1
	curCenterX := float32(0)
	for rIdx, r := range a.rows {
		curX := float32(gallerySidePadding)
		for cIdx, c := range r {
			w := float32(c.width)
			if c.index == currentIdx {
				curRow = rIdx
				curCol = cIdx
				curCenterX = curX + w*0.5
				break
			}
			curX += w + 8
		}
		if curRow >= 0 {
			break
		}
	}

	if curRow < 0 {
		next := currentIdx + dy
		if next >= 0 && next < len(a.items) {
			a.chooseItem(next, 0)
		}
		return
	}

	targetRow := curRow + dy
	if targetRow < 0 {
		targetRow = 0
	}
	if targetRow >= len(a.rows) {
		targetRow = len(a.rows) - 1
	}
	if targetRow == curRow {
		return
	}

	// For fixed grid, try same column index first
	targetCells := a.rows[targetRow]
	if len(targetCells) == 0 {
		return
	}
	if mode == "grid" && curCol >= 0 {
		cIdx := curCol
		if cIdx >= len(targetCells) {
			cIdx = len(targetCells) - 1
		}
		bestIdx := targetCells[cIdx].index
		a.chooseItem(bestIdx, 0)
		a.galleryList.ScrollIntoView(targetRow)
		return
	}

	// For justified layout, find cell in target row whose horizontal center is closest to curCenterX
	bestIdx := -1
	bestDist := float32(1e9)
	curX := float32(gallerySidePadding)
	for _, c := range targetCells {
		w := float32(c.width)
		centerX := curX + w*0.5
		dist := centerX - curCenterX
		if dist < 0 {
			dist = -dist
		}
		if dist < bestDist {
			bestDist = dist
			bestIdx = c.index
		}
		curX += w + 8
	}

	if bestIdx >= 0 {
		a.chooseItem(bestIdx, 0)
		a.galleryList.ScrollIntoView(targetRow)
	}
}
func (a *App) selectedItems() []core.Item {
	out := make([]core.Item, 0, len(a.selected))
	for _, it := range a.items {
		if a.selected[it.ID] {
			out = append(out, it)
		}
	}
	return out
}

func (a *App) selectedIDs() []string {
	out := make([]string, 0, len(a.selected))
	for _, it := range a.items {
		if a.selected[it.ID] {
			out = append(out, it.ID)
		}
	}
	return out
}

// toggleSidebar shows or hides the sidebar and relayouts the gallery.
func (a *App) toggleSidebar() {
	a.prefs.SidebarOpen = !a.prefs.SidebarOpen
	a.savePrefs()
	a.rebuildRows()
	if a.win != nil {
		a.win.Invalidate()
	}
}

// viewContextMenu appends the workspace view controls shared by the empty
// gallery and item context menus.
func (a *App) viewContextMenu(m *ui.Menu) {
	if m.Item(a.t("contextMenu.showSidebar")).Checked(a.prefs.SidebarOpen).Chosen() {
		a.toggleSidebar()
	}
	if m.Item(a.t("contextMenu.showInspector")).Checked(a.prefs.InspectorOpen).Chosen() {
		a.prefs.InspectorOpen = !a.prefs.InspectorOpen
		a.savePrefs()
	}
	m.Submenu(a.t("contextMenu.layout"), func(sub *ui.Menu) {
		if sub.Item(a.t("contextMenu.layoutJustified")).Radio(a.prefs.LayoutMode == "" || a.prefs.LayoutMode == "justified").Chosen() {
			a.prefs.LayoutMode = "justified"
			a.savePrefs()
			a.rebuildRows()
		}
		if sub.Item(a.t("contextMenu.layoutGrid")).Radio(a.prefs.LayoutMode == "grid").Chosen() {
			a.prefs.LayoutMode = "grid"
			a.savePrefs()
			a.rebuildRows()
		}
		if sub.Item(a.t("contextMenu.layoutList")).Radio(a.prefs.LayoutMode == "list").Chosen() {
			a.prefs.LayoutMode = "list"
			a.savePrefs()
			a.rebuildRows()
		}
	})
	m.Submenu(a.t("contextMenu.thumbnail"), func(sub *ui.Menu) {
		for _, r := range []int{120, 190, 280, 360} {
			r := r
			label := fmt.Sprintf("%d px", r)
			if sub.Item(label).Radio(a.rowHeight == r).Chosen() {
				a.setRowHeight(r)
			}
		}
	})
}

func (a *App) itemContextMenu(m *ui.Menu, item core.Item) {
	if a.nav == NavTrash {
		if m.Item(a.t("contextMenu.restore")).Chosen() {
			a.restoreSelected()
		}
		if m.Item(a.t("contextMenu.deletePermanently")).Chosen() {
			a.deleteSelectedPermanently()
		}
		m.Separator()
		a.viewContextMenu(m)
		return
	}
	if m.Item(a.t("contextMenu.fullPreview")).Chosen() {
		a.openPreview(item.ID, "full")
	}
	if m.Item(a.t("contextMenu.revealInFinder")).Chosen() {
		_ = a.svc.RevealInFinder(item.ID)
	}
	if m.Item(a.t("contextMenu.openWithDefaultApp")).Chosen() {
		_ = a.svc.OpenWithDefaultApp(item.ID)
	}
	if m.Item(a.t("contextMenu.copyFilePath")).Chosen() {
		_ = a.svc.WriteClipboardText(item.FilePath)
		a.showToast(a.t("common.copied"))
	}
	m.Separator()
	if m.Item(a.t("contextMenu.addToFavorites")).Chosen() {
		for _, id := range a.selectedIDs() {
			_, _ = a.svc.ToggleFavorite(id)
		}
		a.refreshAll()
	}
	m.Submenu(a.t("contextMenu.addToFolder"), func(sub *ui.Menu) {
		for _, f := range a.folders {
			id := f.ID
			if sub.Item(f.Name).Chosen() {
				for _, itemID := range a.selectedIDs() {
					_ = a.svc.AddItemToFolder(itemID, id)
				}
				a.refreshAll()
			}
		}
	})
	m.Separator()
	a.viewContextMenu(m)
	actions := a.pluginHost.Actions(pluginContext(a.selectedItems(), a.folderID))
	if len(actions) > 0 {
		m.Separator()
		for _, action := range actions {
			action := action
			if m.Item(action.Title).Chosen() {
				go func() {
					err := a.pluginHost.RunAction(action.ID, pluginContext(a.selectedItems(), a.folderID))
					a.post(func() {
						if err != nil {
							a.showToast(err.Error())
						}
						a.refreshAll()
					})
				}()
			}
		}
	}
	m.Separator()
	if m.Item(a.t("contextMenu.moveToTrash")).Chosen() {
		a.trashSelected()
	}
}

func pluginContext(items []core.Item, folder string) plugin.ItemContext {
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		out = append(out, map[string]any{
			"id": it.ID, "name": it.Name, "filename": it.Filename, "filePath": it.FilePath,
			"mimeType": it.MimeType, "extension": it.Extension, "url": it.URL,
			"originalUrl": it.OriginalURL, "dominantColor": it.DominantColor,
			"note": it.Note, "prompt": it.Prompt, "tags": it.Tags, "folders": it.Folders,
		})
	}
	return plugin.ItemContext{Items: out, Folder: folder}
}

func maxF(a, b float32) float32 {
	if a > b {
		return a
	}
	return b
}

func minF(a, b float32) float32 {
	if a < b {
		return a
	}
	return b
}
