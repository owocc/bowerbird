package app

import (
	"path/filepath"
	"slices"
	"strings"
	"time"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
)

// libraryDisplayName is the folder name of a library without the .library
// suffix, as the sidebar picker shows it.
func libraryDisplayName(path string) string {
	base := filepath.Base(strings.TrimRight(path, `/\`))
	if strings.HasSuffix(strings.ToLower(base), ".library") {
		base = base[:len(base)-len(".library")]
	}
	if base == "" || base == "." {
		return path
	}
	return base
}

// libraryRefsInOrder merges the recent libraries with the active one and
// applies the order the user arranged. The active library keeps its place:
// switching libraries must never reshuffle the list.
func (a *App) libraryRefsInOrder() []core.LibraryRef {
	refs := make([]core.LibraryRef, 0, len(a.recent)+1)
	seen := make(map[string]bool, len(a.recent)+1)
	add := func(ref core.LibraryRef) {
		if ref.ID == "" || seen[ref.ID] {
			return
		}
		seen[ref.ID] = true
		refs = append(refs, ref)
	}
	for _, ref := range a.recent {
		add(ref)
	}
	if a.library != nil {
		add(core.LibraryRef{ID: a.library.ID, Path: a.library.Path})
	}

	if len(a.prefs.LibraryOrder) > 0 {
		byID := make(map[string]core.LibraryRef, len(refs))
		for _, ref := range refs {
			byID[ref.ID] = ref
		}
		ordered := make([]core.LibraryRef, 0, len(refs))
		used := make(map[string]bool, len(refs))
		for _, id := range a.prefs.LibraryOrder {
			if ref, ok := byID[id]; ok && !used[id] {
				ordered = append(ordered, ref)
				used[id] = true
			}
		}
		for _, ref := range refs {
			if !used[ref.ID] {
				ordered = append(ordered, ref)
			}
		}
		refs = ordered
	}

	ids := make([]string, len(refs))
	for i, ref := range refs {
		ids[i] = ref.ID
	}
	if !slices.Equal(a.prefs.LibraryOrder, ids) {
		a.prefs.LibraryOrder = append([]string(nil), ids...)
		a.savePrefs()
	}
	return refs
}

func (a *App) filteredLibraryRefs(all []core.LibraryRef) []core.LibraryRef {
	query := strings.ToLower(strings.TrimSpace(a.librarySearch))
	if query == "" {
		return all
	}
	visible := make([]core.LibraryRef, 0, len(all))
	for _, ref := range all {
		isActive := a.library != nil && ref.ID == a.library.ID
		if isActive || strings.Contains(strings.ToLower(libraryDisplayName(ref.Path)), query) {
			visible = append(visible, ref)
		}
	}
	return visible
}

// reorderLibraries applies a List reorder to the persisted library IDs.
func (a *App) reorderLibraries(rows []int, to int) {
	all := a.libraryRefsInOrder()
	if len(all) == 0 || len(rows) == 0 {
		return
	}
	ids := make([]string, len(all))
	for i, ref := range all {
		ids[i] = ref.ID
	}

	moving := make(map[int]bool, len(rows))
	movingIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		if row < 0 || row >= len(ids) || moving[row] {
			continue
		}
		moving[row] = true
		movingIDs = append(movingIDs, ids[row])
	}
	if len(movingIDs) == 0 {
		return
	}

	insertAt := 0
	for i := 0; i < to && i < len(ids); i++ {
		if !moving[i] {
			insertAt++
		}
	}
	remaining := make([]string, 0, len(ids)-len(movingIDs))
	for i, id := range ids {
		if !moving[i] {
			remaining = append(remaining, id)
		}
	}
	next := make([]string, 0, len(ids))
	next = append(next, remaining[:insertAt]...)
	next = append(next, movingIDs...)
	next = append(next, remaining[insertAt:]...)
	a.prefs.LibraryOrder = next
	a.savePrefs()
}

func (a *App) sidebarLibrarySwitcher(c *ui.Context) {
	p := paletteFor(c.Theme())
	if !a.libraryPickerOpen && a.librarySearch != "" {
		a.librarySearch = ""
	}

	name := a.t("sidebar.noLibrary")
	if a.library != nil {
		name = a.library.Name
	}

	ui.Box(c).Padding(8, 12, 4, 12).Children(func() {
		trigger := ui.ButtonBase(c.Key("library-switcher")).FillWidth().Height(34).PaddingX(8).Radius(8).FocusRing(false).AlignItems(ui.Center).Gap(8)
		bg := p.hover
		if trigger.Hovered() || a.libraryPickerOpen {
			bg = p.press
		}
		trigger.Background(trigger.AnimateColor("bg", bg, ui.Animation{Duration: 120 * time.Millisecond}))
		trigger.Children(func() {
			ui.Icon(c, iconLibrary).Size(16, 16).TextColor(p.muted)
			ui.Text(c, name).FontSize(12).FontWeight(600).TextColor(p.text).Grow(1).Shrink(1).MinWidth(0).SingleLine()
			ui.Icon(c, iconChevron).Size(13, 13).TextColor(p.faint)
		})
		if trigger.Clicked() {
			a.libraryPickerOpen = !a.libraryPickerOpen
		}

		ui.PopoverBase(c, trigger, &a.libraryPickerOpen, func(panel ui.Element) {
			panel.AttachTo(trigger, ui.AnchorTopRight, ui.AnchorTopLeft).MarginStart(8)
			panel.Width(280).Padding(6).Radius(12).Background(p.surface).Border(1, p.hairline).Shadow(0, 18, 44, -14, p.cardShade)
			panel.Children(func() {
				a.viewLibraryPicker(c)
			})
		})
	})
}

func (a *App) viewLibraryPicker(c *ui.Context) {
	p := paletteFor(c.Theme())
	all := a.libraryRefsInOrder()
	visible := a.filteredLibraryRefs(all)
	canReorder := len(all) > 1 && strings.TrimSpace(a.librarySearch) == ""

	search := ui.Row(c).FillWidth().Height(34).PaddingX(8).Radius(8).Background(p.hover).AlignItems(ui.Center).Gap(7)
	search.Children(func() {
		ui.Icon(c, iconSearch).Size(14, 14).TextColor(p.faint)
		field := ui.TextInputBase(c.Key("library-search"), &a.librarySearch).Bind(&a.librarySearchBox).
			Placeholder(a.t("sidebar.searchLibraryPlaceholder")).
			PlaceholderColor(p.faint).
			TextColor(p.text).
			FontSize(12).
			Grow(1).Shrink(1).MinWidth(0).
			AutoFocus()
		if field.Focused() {
			search.Border(1, p.accent)
		}
		if field.Submitted() && len(visible) > 0 {
			a.openLibraryRef(visible[0])
		}
	})

	ui.Box(c).Height(6)
	if len(visible) == 0 {
		ui.Text(c, a.t("sidebar.noLibrariesFound")).FontSize(11.5).TextColor(p.faint).Padding(12, 10).TextAlign(ui.Center).FillWidth()
	} else {
		a.libraryList.Reorder = nil
		if canReorder {
			a.libraryList.Reorder = a.reorderLibraries
		}
		const rowHeight = float32(32)
		height := float32(len(visible)) * rowHeight
		if height > 260 {
			height = 260
		}
		ui.List(c.Key("library-list"), &a.libraryList, len(visible), func(i int) {
			if i < 0 || i >= len(visible) {
				return
			}
			a.libraryPickerRow(c, visible[i], canReorder)
		}).FillWidth().Height(height)
	}

	ui.Box(c).FillWidth().Height(1).Background(p.hairline).Margin(6, 0, 4, 0)
	a.libraryPickerAction(c, "library-new", iconFolderPlus, a.t("sidebar.createLibrary.action"), func() {
		a.dialog = dialogNewLibrary
		a.dialogValue = ""
		a.dialogError = ""
	})
	a.libraryPickerAction(c, "library-open", iconFolder, a.t("sidebar.openLibrary"), func() {
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
}

func (a *App) libraryPickerRow(c *ui.Context, ref core.LibraryRef, canReorder bool) {
	p := paletteFor(c.Theme())
	active := a.library != nil && ref.ID == a.library.ID
	row := ui.ButtonBase(c.Key("library-pick-" + ref.ID)).FillWidth().Height(32).PaddingX(6).Radius(7).FocusRing(false).AlignItems(ui.Center).Gap(8)
	bg := ui.Transparent
	if active {
		bg = p.press
	} else if row.Hovered() {
		bg = p.hover
	}
	row.Background(row.AnimateColor("bg", bg, ui.Animation{Duration: 120 * time.Millisecond}))
	row.Children(func() {
		if canReorder {
			ui.Icon(c, iconDrag).Size(12, 12).TextColor(p.faint)
		} else {
			ui.Box(c).Size(12, 12)
		}
		icon, iconColor := iconFolder, p.muted
		if active {
			icon, iconColor = iconLibrary, p.accent
		}
		ui.Icon(c, icon).Size(14, 14).TextColor(iconColor)
		textColor := p.text
		if active {
			textColor = p.accent
		}
		ui.Text(c, libraryDisplayName(ref.Path)).FontSize(12).FontWeight(map[bool]int{true: 600, false: 400}[active]).TextColor(textColor).Grow(1).Shrink(1).MinWidth(0).SingleLine()
		if active {
			ui.Icon(c, iconCheck).Size(13, 13).TextColor(p.accent)
		}
	})
	if row.Clicked() {
		a.openLibraryRef(ref)
	}
}

func (a *App) libraryPickerAction(c *ui.Context, key string, icon *ui.SVG, label string, onClick func()) {
	p := paletteFor(c.Theme())
	row := ui.ButtonBase(c.Key(key)).FillWidth().Height(32).PaddingX(8).Radius(7).FocusRing(false).AlignItems(ui.Center).Gap(8)
	bg := ui.Transparent
	if row.Hovered() {
		bg = p.hover
	}
	row.Background(row.AnimateColor("bg", bg, ui.Animation{Duration: 120 * time.Millisecond}))
	row.Children(func() {
		ui.Icon(c, icon).Size(14, 14).TextColor(p.muted)
		ui.Text(c, label).FontSize(12).TextColor(p.text).Grow(1).Shrink(1).SingleLine()
	})
	if row.Clicked() {
		a.libraryPickerOpen = false
		onClick()
	}
}

func (a *App) openLibraryRef(ref core.LibraryRef) {
	a.libraryPickerOpen = false
	a.librarySearch = ""
	if a.library != nil && ref.Path == a.library.Path {
		return
	}
	path := ref.Path
	go func() {
		_, err := a.svc.OpenLibrary(path)
		a.post(func() {
			if err != nil {
				a.showToast(err.Error())
				return
			}
			a.refreshAll()
		})
	}()
}
