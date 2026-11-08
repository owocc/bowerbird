package app

import (
	"fmt"
	"time"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
)

// viewHeader is the floating toolbar: history, search, view controls, zoom and
// the multi-facet filter menu.
func (a *App) viewHeader(c *ui.Context) {
	p := paletteFor(c.Theme())
	if !a.searchAt.IsZero() && time.Now().After(a.searchAt) {
		a.searchAt = time.Time{}
		a.refreshAll()
	}
	ui.Row(c).FillWidth().Height(headerHeight).Padding(0, 12).Gap(8).AlignItems(ui.Center).DragWindow().Children(func() {
		a.iconButton(c, "back", iconBack, false, a.t("common.back"), func() { a.goHistory(-1) })
		a.iconButton(c, "forward", iconForward, false, a.t("common.forward"), func() { a.goHistory(1) })
		if len(a.history) > 0 && (a.historyAt <= 0) {
			// disabled look is enough; native button stays usable with no-op
		}
		ui.Row(c).Height(30).Width(260).PaddingX(9).Radius(8).Background(p.surface2).Border(1, p.hairline).AlignItems(ui.Center).Gap(6).Children(func() {
			ui.Icon(c, iconSearch).Size(14, 14).TextColor(p.faint)
			field := ui.TextInput(c.Key("search"), &a.query).Bind(&a.searchBox).Placeholder(a.t("header.searchPlaceholder")).FontSize(12).Grow(1).Shrink(1).MinWidth(0)
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
					ui.Icon(c, iconClose).Size(11, 11).TextColor(p.muted)
				}).Clicked() {
					a.query = ""
					a.refreshAll()
				}
			}
		})

		ui.Box(c).Grow(1)

		if a.nav == NavFolder && a.folderID != "" {
			name := a.folderDisplayName(a.folderID)
			ui.Text(c, name).FontSize(13).FontWeight(600).TextColor(p.text).MaxWidth(240).SingleLine()
			ui.Box(c).Grow(1)
		}

		// Sort order and the filter menu.
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

		activeFilters := len(a.filters.Types) + len(a.filters.Ratings) + len(a.filters.Orientations) + len(a.filters.Sizes) + len(a.filters.Has)
		filterLabel := a.t("header.filters")
		if activeFilters > 0 {
			filterLabel = fmt.Sprintf("%s (%d)", filterLabel, activeFilters)
		}
		flt := ui.PopoverMenuButton(c.Key("filters"), filterLabel, func(m *ui.Menu) {
			for _, t := range []string{"image", "video", "audio", "document"} {
				if m.Item(a.t("filter.type." + t)).Radio(contains(a.filters.Types, t)).Chosen() {
					a.filters.Types = toggleString(a.filters.Types, t)
					a.refreshAll()
				}
			}
			m.Separator()
			for _, r := range []int{5, 4, 3, 2, 1} {
				if m.Item(fmt.Sprintf("%d ★", r)).Radio(containsInt(a.filters.Ratings, r)).Chosen() {
					a.filters.Ratings = toggleInt(a.filters.Ratings, r)
					a.refreshAll()
				}
			}
			m.Separator()
			for _, o := range []string{"landscape", "portrait", "square"} {
				if m.Item(a.t("filter.orientation." + o)).Radio(contains(a.filters.Orientations, o)).Chosen() {
					a.filters.Orientations = toggleString(a.filters.Orientations, o)
					a.refreshAll()
				}
			}
			for _, s := range []string{"small", "medium", "large"} {
				if m.Item(a.t("filter.size." + s)).Radio(contains(a.filters.Sizes, s)).Chosen() {
					a.filters.Sizes = toggleString(a.filters.Sizes, s)
					a.refreshAll()
				}
			}
			m.Separator()
			for _, h := range []string{"url", "note", "prompt", "tag", "folder"} {
				if m.Item(a.t("filter.has." + h)).Radio(contains(a.filters.Has, h)).Chosen() {
					a.filters.Has = toggleString(a.filters.Has, h)
					a.refreshAll()
				}
			}
			if activeFilters > 0 {
				m.Separator()
				if m.Item(a.t("header.clearFilters")).Chosen() {
					a.filters = Filters{}
					a.refreshAll()
				}
			}
		})
		flt.Height(28).PaddingX(10).Radius(999)

		ui.Box(c).Width(1).Height(20).Background(p.hairline)

		a.iconButton(c, "zoom-out", iconZoomOut, false, a.t("header.zoomOut"), func() { a.setRowHeight(a.rowHeight - 24) })
		ui.Textf(c, "%d", a.rowHeight).FontSize(10.5).TextColor(p.faint).FontFeatures("tnum").Width(28).TextAlign(ui.Center)
		a.iconButton(c, "zoom-in", iconZoomIn, false, a.t("header.zoomIn"), func() { a.setRowHeight(a.rowHeight + 24) })
		ui.Box(c).Width(1).Height(20).Background(p.hairline)

		// Layout switcher popover menu
		layoutIcon := iconLayoutJustified
		switch a.prefs.LayoutMode {
		case "grid":
			layoutIcon = iconLayoutGrid
		case "list":
			layoutIcon = iconLayoutList
		case "waterfall":
			layoutIcon = iconLayoutWaterfall
		}
		a.iconButtonMenu(c, "layout-switch", layoutIcon, a.t("contextMenu.layout"), func(m *ui.Menu) {
			if m.Item(a.t("contextMenu.layoutJustified")).Radio(a.prefs.LayoutMode == "" || a.prefs.LayoutMode == "justified").Chosen() {
				a.prefs.LayoutMode = "justified"
				a.savePrefs()
				a.rebuildRows()
			}
			if m.Item(a.t("contextMenu.layoutGrid")).Radio(a.prefs.LayoutMode == "grid").Chosen() {
				a.prefs.LayoutMode = "grid"
				a.savePrefs()
				a.rebuildRows()
			}
			if m.Item(a.t("contextMenu.layoutList")).Radio(a.prefs.LayoutMode == "list").Chosen() {
				a.prefs.LayoutMode = "list"
				a.savePrefs()
				a.rebuildRows()
			}
		})

		a.iconButton(c, "toggle-sidebar", iconSidebar, a.prefs.SidebarOpen, a.t("contextMenu.showSidebar"), func() {
			a.prefs.SidebarOpen = !a.prefs.SidebarOpen
			a.savePrefs()
			a.rebuildRows()
		})
		a.iconButton(c, "toggle-inspector", iconInfo, a.prefs.InspectorOpen, a.t("contextMenu.showInspector"), func() {
			a.prefs.InspectorOpen = !a.prefs.InspectorOpen
			a.savePrefs()
		})
	})
}

func (a *App) folderDisplayName(id string) string {
	for _, f := range a.folders {
		if f.ID == id {
			return f.Name
		}
	}
	return ""
}

func toggleString(list []string, v string) []string {
	for i, s := range list {
		if s == v {
			return append(list[:i], list[i+1:]...)
		}
	}
	return append(list, v)
}

func toggleInt(list []int, v int) []int {
	for i, s := range list {
		if s == v {
			return append(list[:i], list[i+1:]...)
		}
	}
	return append(list, v)
}

func containsInt(list []int, v int) bool {
	for _, n := range list {
		if n == v {
			return true
		}
	}
	return false
}

var _ = core.ThemeDark
