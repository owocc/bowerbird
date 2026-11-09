package app

import (
	"runtime"
	"time"

	"bowerbird/core"

	"github.com/egoist/mygo/plugins/glass"
	"github.com/egoist/mygo/ui"
)

// viewHeader is the toolbar: history icons, search, sort, filters and the
// thumbnail zoom. Layout and panel visibility live in the content's context
// menu so the view-toggle icons stay out of the header.
func (a *App) viewHeader(c *ui.Context) {
	p := paletteFor(c.Theme())
	if !a.searchAt.IsZero() && time.Now().After(a.searchAt) {
		a.searchAt = time.Time{}
		a.refreshAll()
	}
	header := ui.Column(c).FillWidth().Height(mainHeaderHeight).Absolute().Top(0).Left(0).Right(0)
	// The header floats over the gallery. Its surface belongs to the header
	// itself, so it paints below the controls rather than over them.
	headerBlurActive := a.applyHeaderSurface(c, header, a.headerHasContentUnder())
	header.Children(func() {
		bar := c.TitleBar()
		leftPad := bar.Left + gallerySidePadding
		if a.prefs.SidebarOpen {
			leftPad = gallerySidePadding
		}
		rightPad := float32(12)
		if !a.inspectorVisible() {
			r := bar.Right
			if r == 0 && runtime.GOOS == "windows" {
				r = 138
			}
			if r > 0 {
				rightPad = r + 12
			}
		}
		ui.Row(c).FillWidth().Height(headerHeight).Padding(0, rightPad, 0, leftPad).Gap(8).AlignItems(ui.Center).DragWindow().Children(func() {
			if !a.prefs.SidebarOpen {
				a.iconButton(c, "sidebar-toggle", iconSidebar, false, a.t("common.toggleSidebar"), a.toggleSidebar)
			}
			a.iconButton(c, "back", iconBack, false, a.t("common.back"), func() { a.goHistory(-1) })
			a.iconButton(c, "forward", iconForward, false, a.t("common.forward"), func() { a.goHistory(1) })

			zoomVal := float64(a.rowHeight)
			ui.Slider(c.Key("zoom-slider"), &zoomVal, 90, 420).Width(110)
			if int(zoomVal) != a.rowHeight {
				a.setRowHeight(int(zoomVal))
			}

			ui.Box(c).Grow(1)

			if a.nav == NavFolder && a.folderID != "" {
				name := a.folderDisplayName(a.folderID)
				ui.Text(c, name).FontSize(13).FontWeight(600).TextColor(p.text).MaxWidth(240).SingleLine()
				ui.Box(c).Grow(1)
			}

			a.viewSearchField(c)
		})

		ui.Row(c).FillWidth().Height(headerSecondRowHeight).Padding(0, 12).Gap(8).AlignItems(ui.Center).DragWindow().Children(func() {
			// Sort order and the multi-facet filter live on their own row so
			// neither label gets squeezed on narrow windows.
			sortLabel := a.t("header.newest")
			if a.sortOrder == "asc" {
				sortLabel = a.t("header.oldest")
			}
			a.pillButton(c, "sort", sortLabel, false, func() {
				if a.sortOrder == "asc" {
					a.sortOrder = "desc"
				} else {
					a.sortOrder = "asc"
				}
				a.prefs.SortOrder = a.sortOrder
				a.savePrefs()
				a.refreshAll()
			})

			ui.Box(c).Width(1).Height(20).Background(p.hairline)
			a.viewFilterBar(c)
		})
		if headerBlurActive {
			ui.Box(c).Absolute().Bottom(0).FillWidth().Height(1).Background(p.hairline)
		}
	})
}

// applyHeaderSurface gives a floating header the same surface as the main
// toolbar: the window background while it is clear, and the shared blur
// material plus a divider once content scrolls underneath it. It reports
// whether the blurred state is active so the caller can add the divider.
func (a *App) applyHeaderSurface(c *ui.Context, header ui.Element, contentUnder bool) bool {
	p := paletteFor(c.Theme())
	if contentUnder {
		header.Material(glass.Blur{Radius: 10})
		tint := ui.RGBA(255, 255, 255, 0.8)
		if p.dark {
			tint = ui.RGBA(0, 0, 0, 0.8)
		}
		header.Draw(func(pt *ui.Painter, r ui.Rect) {
			pt.Fill(r, tint, 0)
		})
	} else {
		header.Background(p.bg)
	}
	return contentUnder
}

// headerHasContentUnder reports whether the gallery has scrolled far enough
// for its first row to reach the floating header. Until then the header stays
// flush with the workspace background and shows no blur or divider.
func (a *App) headerHasContentUnder() bool {
	return a.galleryScroll.Y > float32(galleryTopPadding)
}

// viewSearchField draws the search control at the right end of the header.
// The outer pill owns the border; the input itself is unstyled so it does
// not draw a second border inside it.
func (a *App) viewSearchField(c *ui.Context) {
	p := paletteFor(c.Theme())
	row := ui.Row(c).Height(32).Grow(1).Shrink(1).MinWidth(160).MaxWidth(380).Padding(0, 10).Radius(10).Background(p.surface2).Border(1, p.hairline).AlignItems(ui.Center).Gap(7)
	row.Children(func() {
		ui.Icon(c, iconSearch).Size(14, 14).TextColor(p.faint)
		field := ui.TextInputBase(c.Key("search"), &a.query).Bind(&a.searchBox).
			Placeholder(a.t("header.searchPlaceholder")).
			PlaceholderColor(p.faint).
			TextColor(p.text).
			FontSize(12).
			Grow(1).Shrink(1).MinWidth(0)
		if field.Focused() {
			row.Border(1, p.accent)
		}
		if field.Changed() {
			a.searchAt = time.Now().Add(320 * time.Millisecond)
			c.After(320 * time.Millisecond)
		}
		if field.Submitted() {
			a.searchAt = time.Time{}
			a.refreshAll()
		}
		if a.query != "" {
			if ui.ButtonBase(c.Key("search-clear")).Size(18, 18).Radius(999).FocusRing(false).AlignItems(ui.Center).Justify(ui.Center).Children(func() {
				ui.Text(c, "×").FontSize(13).FontWeight(500).TextColor(p.muted)
			}).Clicked() {
				a.query = ""
				a.refreshAll()
			}
		}
	})
}

func (a *App) folderDisplayName(id string) string {
	if f, ok := findFolder(a.folders, id); ok {
		return f.Name
	}
	return ""
}

var _ = core.ThemeDark
