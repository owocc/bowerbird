package app

import (
	"sort"
	"strings"
	"time"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
)

// viewTags is the tag manager page: search, sort, open a filtered gallery, and
// rename/delete a taxonomy entry.
func (a *App) viewTags(c *ui.Context) {
	p := paletteFor(c.Theme())
	tags := append([]core.Tag(nil), a.tags...)
	if q := strings.ToLower(strings.TrimSpace(a.tagSearch)); q != "" {
		filtered := tags[:0]
		for _, t := range tags {
			if strings.Contains(strings.ToLower(t.Name), q) {
				filtered = append(filtered, t)
			}
		}
		tags = filtered
	}
	if a.tagSort == "count" {
		sort.SliceStable(tags, func(i, j int) bool {
			if tags[i].ItemCount == tags[j].ItemCount {
				return tags[i].Name < tags[j].Name
			}
			return tags[i].ItemCount > tags[j].ItemCount
		})
	} else {
		sort.SliceStable(tags, func(i, j int) bool { return strings.ToLower(tags[i].Name) < strings.ToLower(tags[j].Name) })
	}

	ui.Column(c).Fill().Padding(24, mainHeaderHeight+28, 24, 24).Gap(16).Children(func() {
		ui.Row(c).FillWidth().AlignItems(ui.Center).Gap(10).Children(func() {
			ui.Column(c).Gap(2).Children(func() {
				ui.Text(c, a.t("tags.title")).FontSize(24).FontWeight(700).TextColor(p.text)
				ui.Text(c, a.tf("tags.subtitle", map[string]any{"count": len(a.tags)})).FontSize(12).TextColor(p.muted)
			})
			ui.Box(c).Grow(1)
			ui.Row(c).Height(30).Width(240).PaddingX(9).Radius(8).Background(p.surface2).Border(1, p.hairline).AlignItems(ui.Center).Gap(6).Children(func() {
				ui.Icon(c, iconSearch).Size(14, 14).TextColor(p.faint)
				ui.TextInput(c.Key("tag-search"), &a.tagSearch).Placeholder(a.t("tags.search")).FontSize(12).Grow(1)
			})
			a.pillButton(c, "tag-sort-alpha", a.t("tags.alpha"), a.tagSort != "count", func() { a.tagSort = "alpha" })
			a.pillButton(c, "tag-sort-count", a.t("tags.count"), a.tagSort == "count", func() { a.tagSort = "count" })
			if ui.PrimaryButton(c.Key("tag-new"), a.t("tags.new")).Clicked() {
				a.dialog = dialogTag
				a.dialogValue = ""
			}
		})
		ui.Box(c).FillWidth().Height(1).Background(p.hairline)
		if len(tags) == 0 {
			a.emptyState(c, iconTag, a.t("tags.empty"), a.t("tags.emptyHint"))
			return
		}
		ui.Scroll(c).Grow(1).Shrink(1).Children(func() {
			ui.Column(c).FillWidth().Gap(4).Children(func() {
				for _, tag := range tags {
					tag := tag
					row := ui.ButtonBase(c.Key("tag-row-" + tag.Name)).FillWidth().Height(44).PaddingX(12).Radius(8).FocusRing(false).AlignItems(ui.Center).Gap(10)
					bg := ui.Transparent
					if row.Hovered() {
						bg = p.hover
					}
					row.Background(row.AnimateColor("bg", bg, ui.Animation{Duration: 120 * time.Millisecond}))
					row.Children(func() {
						ui.Box(c).Size(26, 26).Radius(8).Background(p.surface2).AlignItems(ui.Center).Justify(ui.Center).Children(func() {
							ui.Icon(c, iconTag).Size(14, 14).TextColor(p.muted)
						})
						ui.Text(c, tag.Name).FontSize(13).FontWeight(550).TextColor(p.text).Grow(1).Shrink(1).SingleLine()
						ui.Textf(c, "%d", tag.ItemCount).FontSize(11).TextColor(p.faint).FontFeatures("tnum")
						ui.Icon(c, iconChevronR).Size(13, 13).TextColor(p.faint)
					})
					if row.Clicked() {
						a.navigate(NavAll, "")
						a.query = `tag:"` + strings.ReplaceAll(tag.Name, `"`, `\"`) + `"`
						a.refreshAll()
					}
					row.ContextMenu(func(m *ui.Menu) {
						if m.Item(a.t("tags.open")).Chosen() {
							a.navigate(NavAll, "")
							a.query = `tag:"` + strings.ReplaceAll(tag.Name, `"`, `\"`) + `"`
							a.refreshAll()
						}
						if m.Item(a.t("tags.rename")).Chosen() {
							a.dialog = dialogTag
							a.dialogValue = tag.Name
							a.tagInput = tag.Name
						}
						if m.Item(a.t("common.delete")).Chosen() {
							go func() {
								err := a.svc.DeleteTag(tag.Name)
								a.post(func() {
									if err != nil {
										a.showToast(err.Error())
									}
									a.refreshAll()
								})
							}()
						}
					})
				}
			})
		})
	})
}
