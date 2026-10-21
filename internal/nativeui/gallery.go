package nativeui

import (
	"time"

	"bowerbird/core"

	"github.com/egoist/mygo/transfer"
	"github.com/egoist/mygo/ui"
)

// Gallery geometry. The custom layouts share one grid gap and edge padding
// so switching between them keeps the same rhythm.
const (
	galleryPad float32 = 6
	galleryGap float32 = 6
)

// galleryUnit is where one item sits in the content of a custom layout.
type galleryUnit struct {
	x, y, w, h float32
}

// galleryLayout is a justified or waterfall arrangement of the visible
// items. It is computed once per width/row-height/filter change and reused
// while scrolling, so a frame builds only the units in view.
type galleryLayout struct {
	units  []galleryUnit
	height float32
	cols   int
}

type marqueeState struct {
	pressed bool
	active  bool
	startX  float32
	startY  float32
	curX    float32
	curY    float32
	base    map[string]bool
	add     bool
}

// aspectOf is an item's width/height, with a sane default for items whose
// dimensions the library does not know.
func aspectOf(it *core.Item) float32 {
	w, h := float32(it.Width), float32(it.Height)
	if w <= 0 || h <= 0 {
		switch fileCategory(it.Extension, it.MimeType) {
		case "video":
			return 16.0 / 9.0
		case "document":
			return 0.72
		case "audio":
			return 1
		}
		return 1.25
	}
	a := w / h
	if a < 0.2 {
		a = 0.2
	}
	if a > 5 {
		a = 5
	}
	return a
}

func (a *App) customLayout(vis []core.Item, width float32) *galleryLayout {
	mode := a.layout
	if mode != layoutJustified && mode != layoutWaterfall {
		mode = layoutJustified
	}
	if width < 120 {
		width = 120
	}
	key := mode + "|" + itoa(int(width)) + "|" + itoa(int(a.rowHeight)) + "|" + itoa(a.layoutGen) + "|" + itoa(len(vis))
	if a.layoutCache != nil && a.layoutKey == key {
		return a.layoutCache
	}
	var l *galleryLayout
	if mode == layoutWaterfall {
		l = computeWaterfall(vis, width, a.rowHeight)
	} else {
		l = computeJustified(vis, width, a.rowHeight)
	}
	a.layoutCache, a.layoutKey = l, key
	return l
}

func itoa(n int) string {
	// Small helper to keep keys allocation-light and avoid fmt in hot paths.
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

// computeJustified fills rows to the width, letting their height vary around
// the target row height, as the webview's Justified gallery does.
func computeJustified(vis []core.Item, width, target float32) *galleryLayout {
	n := len(vis)
	l := &galleryLayout{units: make([]galleryUnit, n)}
	if n == 0 {
		return l
	}
	aspects := make([]float32, n)
	for i := range vis {
		aspects[i] = aspectOf(&vis[i])
	}
	y := float32(0)
	i := 0
	for i < n {
		sum := float32(0)
		j := i
		for j < n {
			sum += aspects[j]
			count := j - i + 1
			if count > 1 {
				if (width-galleryGap*float32(count-1))/sum <= target {
					break
				}
			}
			j++
		}
		if j >= n {
			j = n - 1
		}
		count := j - i + 1
		gaps := galleryGap * float32(count-1)
		h := (width - gaps) / sum
		// A lone very wide item would make a tall row; a whole last row of
		// tall items would make a tiny one. Keep both readable.
		if h > target*2.4 {
			h = target * 1.6
		}
		if h < target*0.45 {
			h = target * 0.6
		}
		// Widths keep each item's aspect ratio. An unclamped row fills the
		// width by construction; a clamped one is left-aligned.
		x := float32(0)
		for k := i; k <= j; k++ {
			w := aspects[k] * h
			l.units[k] = galleryUnit{x: x, w: w, h: h, y: y}
			x += w + galleryGap
		}
		y += h + galleryGap
		i = j + 1
	}
	if y > 0 {
		y -= galleryGap
	}
	l.height = y
	return l
}

// computeWaterfall fills the shortest column, as the webview's Waterfall.
func computeWaterfall(vis []core.Item, width, target float32) *galleryLayout {
	n := len(vis)
	l := &galleryLayout{units: make([]galleryUnit, n)}
	if n == 0 {
		return l
	}
	cols := int((width + galleryGap) / (target + galleryGap))
	if cols < 1 {
		cols = 1
	}
	if cols > 12 {
		cols = 12
	}
	colW := (width - galleryGap*float32(cols-1)) / float32(cols)
	heights := make([]float32, cols)
	l.cols = cols
	for i := range vis {
		aspect := aspectOf(&vis[i])
		h := colW / aspect
		if h < colW*0.35 {
			h = colW * 0.35
		}
		if h > colW*3.2 {
			h = colW * 3.2
		}
		best := 0
		for c := 1; c < cols; c++ {
			if heights[c] < heights[best] {
				best = c
			}
		}
		x := float32(best) * (colW + galleryGap)
		l.units[i] = galleryUnit{x: x, y: heights[best], w: colW, h: h}
		heights[best] += h + galleryGap
	}
	var maxH float32
	for _, h := range heights {
		if h > maxH {
			maxH = h
		}
	}
	if maxH > 0 {
		maxH -= galleryGap
	}
	l.height = maxH
	return l
}

// galleryWidth is the width available to cards: the previous frame's scroll
// bounds when known, else an estimate from the window and panels.
func (a *App) galleryWidth(c *ui.Context) float32 {
	w := a.galleryBounds.W
	if w > 40 {
		return w - 2*galleryPad
	}
	winW, _ := c.Size()
	used := float32(0)
	if a.showSidebar {
		used += a.sidebarWidth
	}
	content := (winW - used) * 0.92
	if a.showInspector {
		content = (winW - used) * (a.contentSplit / 100)
	}
	content -= 2 * galleryPad
	if content < 120 {
		content = 120
	}
	return content
}

// viewCustomGallery draws the justified or waterfall layout in a tracked
// scroll container, building only the units near the viewport.
func (a *App) viewCustomGallery(c *ui.Context, vis []core.Item) {
	width := a.galleryWidth(c)
	l := a.customLayout(vis, width)
	total := l.height + 2*galleryPad
	sc := ui.Scroll(c).Grow(1).TrackScroll(&a.galleryScroll).Bind(&a.galleryHandle).
		HandleInput(func(ev ui.InputEvent) bool { return a.handleGalleryInput(ev) })
	sc.Children(func() {
		content := ui.Box(c).FillWidth().Height(total)
		content.Children(func() {
			scrollY := a.galleryScroll.Y
			viewH := a.galleryBounds.H
			if viewH <= 0 {
				_, viewH = c.Size()
			}
			top := scrollY - viewH
			bottom := scrollY + viewH*2
			for i := range l.units {
				u := l.units[i]
				if u.y+u.h < top || u.y > bottom {
					continue
				}
				a.customCell(c, &vis[i], i, u, scrollY)
			}
		})
	})
	// Read the scroll container's box for the next frame's culling, marquee
	// coordinates and prefetch window.
	if r := c.Resolve(a.galleryHandle).Bounds(); r.W > 0 {
		a.galleryBounds = r
	}
}

func (a *App) customCell(c *ui.Context, it *core.Item, idx int, u galleryUnit, scrollY float32) {
	t := c.Theme()
	selected := a.selection.Has(it.ID)
	box := ui.Column(c).Key("cell:" + it.ID).Width(u.w).Height(u.h).Absolute().
		Left(u.x + galleryPad).Top(u.y + galleryPad).Radius(6).Clip().
		Cursor(ui.CursorPointer).Background(themeHex(it.DominantColor, t.Surface))
	box.Children(func() {
		if bmp := a.galleryBitmap(it, u.h); bmp != nil {
			ui.Image(c, bmp).Fill().Fit(ui.Cover)
		} else if a.galleryFailed(it, u.h) {
			ui.Column(c).Fill().Center().Children(func() {
				ui.Text(c, extensionLabel(it.Extension)).FontSize(16).Bold().TextColor(t.TextMuted)
			})
		} else {
			ui.Column(c).Fill().Center().Children(func() { ui.Spinner(c).Size(14, 14) })
		}
		if selected {
			ui.Box(c).Absolute().Top(0).Left(0).Right(0).Bottom(0).Border(2, t.Accent)
		}
		if box.Hovered() {
			ui.Box(c).Absolute().Top(0).Left(0).Right(0).Bottom(0).Background(ui.RGBA(0, 0, 0, 0.35)).Children(func() {
				ui.Text(c, it.Name).FontSize(11).SingleLine().TextColor(ui.Hex("#ffffff")).
					Padding(4, 8).Attach(ui.AnchorBottomLeft, ui.AnchorBottomLeft).Left(4).Bottom(4)
			})
		}
	})
	if box.Clicked() {
		a.selectClick(idx, box.ClickModifiers())
	}
	if box.DoubleClicked() {
		a.openPreview(it.ID)
	}
	box.DragDataFrom(func() transfer.Data { return a.fileDragData(it) }, a.dragOptionsFor(it)).
		Drag(a.dragValuesFor(it))
	box.ContextMenu(func(m *ui.Menu) { a.itemContextMenu(m, it) })

	// Window-space rect for marquee hit testing and prefetch.
	gb := a.galleryBounds
	a.cellRects[it.ID] = ui.Rect{
		X: gb.X + u.x + galleryPad,
		Y: gb.Y + u.y + galleryPad - scrollY,
		W: u.w,
		H: u.h,
	}
	if idx < a.visibleMin || a.visibleMin < 0 {
		a.visibleMin = idx
	}
	if idx > a.visibleMax {
		a.visibleMax = idx
	}
}

func (a *App) galleryBitmap(it *core.Item, h float32) *ui.Bitmap {
	if isAnimatedGIF(it) {
		return a.gifFrame(it, thumbBucket(h), false)
	}
	return a.thumbnail(it, h)
}

// galleryFailed reports whether the image behind a cell is known to be
// undecodable, including the animated-GIF cache.
func (a *App) galleryFailed(it *core.Item, h float32) bool {
	if isAnimatedGIF(it) {
		return a.gifs.hasFailed(gifKey(it, thumbBucket(h)))
	}
	return a.thumbs.hasFailed(thumbKey(it, h))
}

// beginGalleryFrame clears the per-frame rect map and visible range.
func (a *App) beginGalleryFrame() {
	a.cellRects = make(map[string]ui.Rect, 128)
	a.visibleMin, a.visibleMax = -1, -1
	a.prefetchStarted = 0
}

// selectClick applies a click with the desktop's selection modifiers to item
// idx, keeping the grid cursor and the inspector in step.
func (a *App) selectClick(idx int, mods ui.Modifiers) {
	vis := a.visibleItems()
	if idx < 0 || idx >= len(vis) {
		return
	}
	id := vis[idx].ID
	switch {
	case mods&(ui.Cmd|ui.Shift) == 0:
		a.selection.Clear()
		a.selection.Add(id)
		a.selectionAnchor = idx
	case mods&ui.Cmd != 0:
		if a.selection.Has(id) {
			a.selection.Remove(id)
		} else {
			a.selection.Add(id)
		}
		a.selectionAnchor = idx
	case mods&ui.Shift != 0:
		lo, hi := a.selectionAnchor, idx
		if lo > hi {
			lo, hi = hi, lo
		}
		if lo < 0 {
			lo = hi
		}
		a.selection.Clear()
		for i := lo; i <= hi && i < len(vis); i++ {
			a.selection.Add(vis[i].ID)
		}
	}
	a.selectedIndex = idx
	a.selectedID = id
	a.syncEditor(&vis[idx])
	a.host.invalidateAll()
}

// handleGalleryInput tracks wheel scrolling and drives marquee selection and
// Cmd/Ctrl+wheel row height. Input it does not take goes on to the scroll
// container.
func (a *App) handleGalleryInput(ev ui.InputEvent) bool {
	switch ev.Kind {
	case ui.InputScroll:
		a.lastScrollAt = time.Now()
		if ev.Mods&(ui.Cmd|ui.Ctrl) != 0 {
			a.setRowHeight(a.rowHeight - ev.DY*0.8)
			return true
		}
		return false
	case ui.InputPointerDown:
		if ev.Button != 0 {
			return false
		}
		if _, onCell := a.cellAt(ev.X, ev.Y); onCell {
			return false
		}
		a.marquee.pressed = true
		a.marquee.active = false
		a.marquee.startX, a.marquee.startY = ev.X, ev.Y
		a.marquee.curX, a.marquee.curY = ev.X, ev.Y
		a.marquee.add = ev.Mods&(ui.Cmd|ui.Shift) != 0
		a.marquee.base = map[string]bool{}
		for id := range a.selection.All() {
			a.marquee.base[id] = true
		}
		return false
	case ui.InputPointerMove:
		if !a.marquee.pressed {
			return false
		}
		a.marquee.curX, a.marquee.curY = ev.X, ev.Y
		if !a.marquee.active {
			dx, dy := ev.X-a.marquee.startX, ev.Y-a.marquee.startY
			if dx*dx+dy*dy < 16 {
				return false
			}
			a.marquee.active = true
		}
		a.recomputeMarquee()
		return true
	case ui.InputPointerUp:
		if !a.marquee.pressed {
			return false
		}
		wasActive := a.marquee.active
		a.marquee.pressed = false
		a.marquee.active = false
		if !wasActive {
			a.clearSelectionUnlessAdd()
		} else {
			a.recomputeMarquee()
		}
		a.host.invalidateAll()
		return wasActive
	}
	return false
}

func (a *App) cellAt(x, y float32) (string, bool) {
	gb := a.galleryBounds
	wx, wy := gb.X+x, gb.Y+y
	for id, r := range a.cellRects {
		if r.Contains(wx, wy) {
			return id, true
		}
	}
	return "", false
}

func (a *App) clearSelectionUnlessAdd() {
	if a.marquee.add {
		return
	}
	a.selection.Clear()
	a.selectedIndex = -1
	a.selectedID = ""
	a.markDirty()
	a.host.invalidateAll()
}

// recomputeMarquee selects every built cell the rectangle touches, keeping
// the selection that predates the drag when it started with Cmd/Shift.
func (a *App) recomputeMarquee() {
	gb := a.galleryBounds
	x1, x2 := a.marquee.startX, a.marquee.curX
	y1, y2 := a.marquee.startY, a.marquee.curY
	if x1 > x2 {
		x1, x2 = x2, x1
	}
	if y1 > y2 {
		y1, y2 = y2, y1
	}
	rect := ui.Rect{X: gb.X + x1, Y: gb.Y + y1, W: x2 - x1, H: y2 - y1}
	a.selection.Clear()
	if a.marquee.add {
		for id := range a.marquee.base {
			a.selection.Add(id)
		}
	}
	vis := a.visibleItems()
	last := -1
	for i := range vis {
		r, ok := a.cellRects[vis[i].ID]
		if !ok {
			continue
		}
		if r.X < rect.X+rect.W && rect.X < r.X+r.W && r.Y < rect.Y+rect.H && rect.Y < r.Y+r.H {
			a.selection.Add(vis[i].ID)
			last = i
		}
	}
	if last >= 0 {
		a.selectedIndex = last
		a.selectedID = vis[last].ID
		a.syncEditor(&vis[last])
	}
}

// viewMarquee draws the rubber band over the window while the drag is live.
func (a *App) viewMarquee(c *ui.Context) {
	if !a.marquee.active {
		return
	}
	gb := a.galleryBounds
	x1, x2 := a.marquee.startX, a.marquee.curX
	y1, y2 := a.marquee.startY, a.marquee.curY
	if x1 > x2 {
		x1, x2 = x2, x1
	}
	if y1 > y2 {
		y1, y2 = y2, y1
	}
	t := c.Theme()
	ui.Overlay(c, func() {
		ui.Box(c).Absolute().Left(gb.X+x1).Top(gb.Y+y1).Width(x2-x1).Height(y2-y1).
			Background(t.Accent.Alpha(0.14)).Border(1, t.Accent).Radius(2)
	})
}
