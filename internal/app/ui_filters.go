package app

import (
	"fmt"
	"strings"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
)

// Filter criteria follow the old web filter bar: a stable catalog, a default
// pinned set, and per-criterion single-value menus. Pinning is a preference;
// active values live in Filters and are part of query history.
const (
	filterCriterionType        = "type"
	filterCriterionColor       = "color"
	filterCriterionFolder      = "folder"
	filterCriterionOrientation = "orientation"
	filterCriterionSize        = "size"
	filterCriterionURL         = "url"
	filterCriterionNotes       = "notes"
	filterCriterionRating      = "rating"

	filterFolderUncategorized = "none"
)

var allFilterCriteria = []string{
	filterCriterionType,
	filterCriterionColor,
	filterCriterionFolder,
	filterCriterionOrientation,
	filterCriterionSize,
	filterCriterionURL,
	filterCriterionNotes,
	filterCriterionRating,
}

var defaultPinnedFilterCriteria = []string{
	filterCriterionType,
	filterCriterionColor,
	filterCriterionFolder,
	filterCriterionOrientation,
}

var presetFilterColors = []string{
	"#EF4444", "#F97316", "#EAB308", "#22C55E",
	"#14B8A6", "#3B82F6", "#6366F1", "#A855F7",
	"#EC4899", "#78350F", "#171717", "#737373",
	"#F5F5F5",
}

func isFilterCriterion(id string) bool {
	return contains(allFilterCriteria, id)
}

// viewFilterBar renders the pinned criteria plus any active unpinned
// criterion, mirroring the old web FilterBar.
func (a *App) viewFilterBar(c *ui.Context) {
	ui.ScrollHorizontal(c).Grow(1).Shrink(1).Scrollbars(false).Children(func() {
		ui.Row(c).Height(28).Gap(6).AlignItems(ui.Center).Children(func() {
			for _, id := range a.visibleFilterCriteria() {
				a.filterCriterionButton(c, id)
			}
			a.filterManageButton(c)
			if a.hasActiveFilters() {
				a.pillButton(c, "filter-clear", a.t("filters.clearAll"), false, func() {
					a.filters = Filters{}
					a.refreshAll()
				})
			}
		})
	})
}

func (a *App) visibleFilterCriteria() []string {
	pinned := make(map[string]bool, len(a.prefs.PinnedFilters))
	for _, id := range a.prefs.PinnedFilters {
		if isFilterCriterion(id) {
			pinned[id] = true
		}
	}
	out := make([]string, 0, len(allFilterCriteria))
	for _, id := range allFilterCriteria {
		if pinned[id] || a.filterCriterionActive(id) {
			out = append(out, id)
		}
	}
	return out
}

func (a *App) filterCriterionActive(id string) bool {
	switch id {
	case filterCriterionType:
		return len(a.filters.Types) > 0
	case filterCriterionColor:
		return len(a.filters.Colors) > 0
	case filterCriterionFolder:
		return len(a.filters.Folders) > 0
	case filterCriterionOrientation:
		return len(a.filters.Orientations) > 0
	case filterCriterionSize:
		return len(a.filters.Sizes) > 0
	case filterCriterionURL:
		return contains(a.filters.Has, "url") || contains(a.filters.No, "url")
	case filterCriterionNotes:
		return contains(a.filters.Has, "note") || contains(a.filters.No, "note")
	case filterCriterionRating:
		return len(a.filters.Ratings) > 0 || a.filters.Unrated
	default:
		return false
	}
}

func (a *App) hasActiveFilters() bool {
	for _, id := range allFilterCriteria {
		if a.filterCriterionActive(id) {
			return true
		}
	}
	return false
}

func (a *App) filterCriterionTitle(id string) string {
	switch id {
	case filterCriterionType:
		return a.t("filters.type")
	case filterCriterionColor:
		return a.t("filters.color")
	case filterCriterionFolder:
		return a.t("filters.folder")
	case filterCriterionOrientation:
		return a.t("filters.orientation")
	case filterCriterionSize:
		return a.t("filters.size")
	case filterCriterionURL:
		return a.t("filters.url")
	case filterCriterionNotes:
		return a.t("filters.notes")
	case filterCriterionRating:
		return a.t("filters.rating")
	default:
		return id
	}
}

func (a *App) filterCriterionLabel(id string) string {
	switch id {
	case filterCriterionType:
		if len(a.filters.Types) > 0 {
			return a.t("filter.type." + a.filters.Types[0])
		}
	case filterCriterionColor:
		if len(a.filters.Colors) > 0 {
			return strings.ToUpper(a.filters.Colors[0])
		}
	case filterCriterionFolder:
		if len(a.filters.Folders) > 0 {
			if a.filters.Folders[0] == filterFolderUncategorized {
				return a.t("filters.uncategorized")
			}
			if name := a.filterFolderName(a.filters.Folders[0]); name != "" {
				return name
			}
		}
	case filterCriterionOrientation:
		if len(a.filters.Orientations) > 0 {
			return a.t("filter.orientation." + a.filters.Orientations[0])
		}
	case filterCriterionSize:
		if len(a.filters.Sizes) > 0 {
			return a.t("filter.size." + a.filters.Sizes[0])
		}
	case filterCriterionURL:
		if contains(a.filters.Has, "url") {
			return a.t("filters.urlHas")
		}
		if contains(a.filters.No, "url") {
			return a.t("filters.urlEmpty")
		}
	case filterCriterionNotes:
		if contains(a.filters.Has, "note") {
			return a.t("filters.notesHas")
		}
		if contains(a.filters.No, "note") {
			return a.t("filters.notesEmpty")
		}
	case filterCriterionRating:
		if a.filters.Unrated {
			return a.t("filters.ratingUnrated")
		}
		if len(a.filters.Ratings) > 0 {
			return fmt.Sprintf("%d ★", a.filters.Ratings[0])
		}
	}
	return a.filterCriterionTitle(id)
}

func (a *App) filterCriterionButton(c *ui.Context, id string) {
	p := paletteFor(c.Theme())
	active := a.filterCriterionActive(id)
	btn := ui.PopoverMenuButton(c.Key("filter-pill-"+id), a.filterCriterionLabel(id), func(m *ui.Menu) {
		a.filterCriterionMenu(m, id)
	})
	btn.Height(26).PaddingX(9).Radius(999).FocusRing(false).Border(1, p.hairline).Background(p.surface2)
	if active {
		btn.Border(1, p.accent.Alpha(0.55)).Background(p.press)
	}
}

func (a *App) filterManageButton(c *ui.Context) {
	p := paletteFor(c.Theme())
	btn := ui.PopoverMenuButton(c.Key("filter-manage"), "+", func(m *ui.Menu) {
		pinned := make(map[string]bool, len(a.prefs.PinnedFilters))
		for _, id := range a.prefs.PinnedFilters {
			pinned[id] = true
		}
		for _, id := range allFilterCriteria {
			if m.Item(a.filterCriterionTitle(id)).Checked(pinned[id]).Chosen() {
				a.toggleFilterPin(id)
			}
		}
	})
	btn.Height(26).PaddingX(9).Radius(999).FocusRing(false).Border(1, p.hairline).Background(p.surface2)
	btn.Tooltip(a.t("filters.manageFilters"))
}

func (a *App) toggleFilterPin(id string) {
	if !isFilterCriterion(id) {
		return
	}
	pinned := make(map[string]bool, len(a.prefs.PinnedFilters)+1)
	for _, current := range a.prefs.PinnedFilters {
		if isFilterCriterion(current) {
			pinned[current] = true
		}
	}
	if pinned[id] {
		delete(pinned, id)
	} else {
		pinned[id] = true
	}
	next := make([]string, 0, len(pinned))
	for _, current := range allFilterCriteria {
		if pinned[current] {
			next = append(next, current)
		}
	}
	a.prefs.PinnedFilters = next
	a.savePrefs()
}

func (a *App) filterCriterionMenu(m *ui.Menu, id string) {
	switch id {
	case filterCriterionType:
		if m.Item(a.t("filters.allTypes")).Radio(len(a.filters.Types) == 0).Chosen() {
			a.setTypeFilter("")
		}
		for _, value := range []string{"image", "video", "audio", "document"} {
			value := value
			if m.Item(a.t("filter.type." + value)).Radio(contains(a.filters.Types, value)).Chosen() {
				a.setTypeFilter(value)
			}
		}
	case filterCriterionColor:
		if m.Item(a.t("filters.allColors")).Radio(len(a.filters.Colors) == 0).Chosen() {
			a.setColorFilter("")
		}
		for _, hex := range a.filterColorOptions() {
			hex := hex
			selected := len(a.filters.Colors) > 0 && strings.EqualFold(a.filters.Colors[0], hex)
			if m.Item(strings.ToUpper(hex)).Radio(selected).Chosen() {
				a.setColorFilter(hex)
			}
		}
	case filterCriterionFolder:
		if m.Item(a.t("filters.allFolders")).Radio(len(a.filters.Folders) == 0).Chosen() {
			a.setFolderFilter("")
		}
		if m.Item(a.t("filters.uncategorized")).Radio(len(a.filters.Folders) > 0 && a.filters.Folders[0] == filterFolderUncategorized).Chosen() {
			a.setFolderFilter(filterFolderUncategorized)
		}
		m.Separator()
		opts := a.filterFolderOptions()
		for _, opt := range opts {
			opt := opt
			if m.Item(opt.name).Radio(len(a.filters.Folders) > 0 && a.filters.Folders[0] == opt.id).Chosen() {
				a.setFolderFilter(opt.id)
			}
		}
	case filterCriterionOrientation:
		if m.Item(a.t("filters.allOrientations")).Radio(len(a.filters.Orientations) == 0).Chosen() {
			a.setOrientationFilter("")
		}
		for _, value := range []string{"landscape", "portrait", "square"} {
			value := value
			if m.Item(a.t("filter.orientation." + value)).Radio(contains(a.filters.Orientations, value)).Chosen() {
				a.setOrientationFilter(value)
			}
		}
	case filterCriterionSize:
		if m.Item(a.t("filters.sizeAll")).Radio(len(a.filters.Sizes) == 0).Chosen() {
			a.setSizeFilter("")
		}
		for _, value := range []string{"small", "medium", "large"} {
			value := value
			if m.Item(a.t("filter.size." + value)).Radio(contains(a.filters.Sizes, value)).Chosen() {
				a.setSizeFilter(value)
			}
		}
	case filterCriterionURL:
		if m.Item(a.t("filters.urlAll")).Radio(!contains(a.filters.Has, "url") && !contains(a.filters.No, "url")).Chosen() {
			a.setPresenceFilter("url", "")
		}
		if m.Item(a.t("filters.urlHas")).Radio(contains(a.filters.Has, "url")).Chosen() {
			a.setPresenceFilter("url", "has")
		}
		if m.Item(a.t("filters.urlEmpty")).Radio(contains(a.filters.No, "url")).Chosen() {
			a.setPresenceFilter("url", "empty")
		}
	case filterCriterionNotes:
		if m.Item(a.t("filters.notesAll")).Radio(!contains(a.filters.Has, "note") && !contains(a.filters.No, "note")).Chosen() {
			a.setPresenceFilter("note", "")
		}
		if m.Item(a.t("filters.notesHas")).Radio(contains(a.filters.Has, "note")).Chosen() {
			a.setPresenceFilter("note", "has")
		}
		if m.Item(a.t("filters.notesEmpty")).Radio(contains(a.filters.No, "note")).Chosen() {
			a.setPresenceFilter("note", "empty")
		}
	case filterCriterionRating:
		if m.Item(a.t("filters.ratingAll")).Radio(len(a.filters.Ratings) == 0 && !a.filters.Unrated).Chosen() {
			a.setRatingFilter(0, false)
		}
		for _, rating := range []int{5, 4, 3, 2, 1} {
			rating := rating
			if m.Item(fmt.Sprintf("%d ★", rating)).Radio(len(a.filters.Ratings) > 0 && a.filters.Ratings[0] == rating && !a.filters.Unrated).Chosen() {
				a.setRatingFilter(rating, false)
			}
		}
		if m.Item(a.t("filters.ratingUnrated")).Radio(a.filters.Unrated).Chosen() {
			a.setRatingFilter(0, true)
		}
	}
}

func (a *App) setTypeFilter(value string) {
	a.filters.Types = filterSingle(value)
	a.refreshAll()
}

func (a *App) setColorFilter(value string) {
	a.filters.Colors = filterSingle(value)
	a.refreshAll()
}

func (a *App) setFolderFilter(value string) {
	a.filters.Folders = filterSingle(value)
	a.refreshAll()
}

func (a *App) setOrientationFilter(value string) {
	a.filters.Orientations = filterSingle(value)
	a.refreshAll()
}

func (a *App) setSizeFilter(value string) {
	a.filters.Sizes = filterSingle(value)
	a.refreshAll()
}

func (a *App) setPresenceFilter(field, value string) {
	a.filters.Has = removeString(a.filters.Has, field)
	a.filters.No = removeString(a.filters.No, field)
	switch value {
	case "has":
		a.filters.Has = append(a.filters.Has, field)
	case "empty":
		a.filters.No = append(a.filters.No, field)
	}
	a.refreshAll()
}

func (a *App) setRatingFilter(rating int, unrated bool) {
	a.filters.Ratings = nil
	if rating > 0 {
		a.filters.Ratings = []int{rating}
	}
	a.filters.Unrated = unrated
	a.refreshAll()
}

func filterSingle(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return []string{value}
}

func removeString(list []string, value string) []string {
	if len(list) == 0 {
		return list
	}
	out := make([]string, 0, len(list))
	for _, item := range list {
		if item != value {
			out = append(out, item)
		}
	}
	return out
}

func (a *App) filterColorOptions() []string {
	seen := make(map[string]bool)
	out := make([]string, 0, len(presetFilterColors)+len(a.stats.TopColors))
	for _, hex := range append(append([]string{}, presetFilterColors...), a.stats.TopColors...) {
		hex = strings.ToUpper(strings.TrimSpace(hex))
		if hex == "" || seen[hex] {
			continue
		}
		seen[hex] = true
		out = append(out, hex)
	}
	return out
}

type filterFolderOption struct {
	id   string
	name string
}

func (a *App) filterFolderOptions() []filterFolderOption {
	out := make([]filterFolderOption, 0, len(a.folders))
	var walk func(folders []core.Folder, prefix string)
	walk = func(folders []core.Folder, prefix string) {
		for _, folder := range folders {
			name := folder.Name
			if prefix != "" {
				name = prefix + " / " + name
			}
			out = append(out, filterFolderOption{id: folder.ID, name: name})
			walk(folder.Children, name)
		}
	}
	walk(a.folders, "")
	return out
}

func (a *App) filterFolderName(id string) string {
	for _, opt := range a.filterFolderOptions() {
		if opt.id == id {
			return opt.name
		}
	}
	return ""
}
