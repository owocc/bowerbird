package app

import (
	"fmt"
	"strings"
	"time"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
)

// refreshLogs loads the buffered diagnostics once when the window opens.
func (a *App) refreshLogs() {
	if a.svc == nil {
		return
	}
	a.logs = a.svc.GetLogs()
}

func (a *App) filteredLogs() []core.LogEntry {
	q := strings.ToLower(strings.TrimSpace(a.logsFilter))
	out := make([]core.LogEntry, 0, len(a.logs))
	for _, e := range a.logs {
		if a.logsLevel != "" && a.logsLevel != "all" && e.Level != a.logsLevel {
			continue
		}
		if q != "" {
			hay := strings.ToLower(e.Message + " " + e.Detail + " " + e.Category)
			if !strings.Contains(hay, q) {
				continue
			}
		}
		out = append(out, e)
	}
	return out
}

// viewLogs is the standalone virtualized log viewer.
func (a *App) viewLogs(c *ui.Context) {
	p := paletteFor(c.Theme())
	entries := a.filteredLogs()
	a.logsList.FollowEnd = a.logsAutoScroll
	ui.Column(c).Fill().Children(func() {
		ui.Row(c).Height(40).DragWindow()
		ui.Row(c).Height(50).PaddingX(16).Gap(8).AlignItems(ui.Center).Children(func() {
			ui.Text(c, a.t("logs.title")).FontSize(16).FontWeight(700).TextColor(p.text)
			ui.Textf(c, "%d", len(entries)).FontSize(10.5).TextColor(p.faint).FontFeatures("tnum")
			ui.Box(c).Grow(1)
			ui.Row(c).Height(28).Width(220).PaddingX(8).Radius(7).Background(p.surface2).Border(1, p.hairline).AlignItems(ui.Center).Gap(6).Children(func() {
				ui.Icon(c, iconSearch).Size(13, 13).TextColor(p.faint)
				ui.TextInput(c.Key("log-search"), &a.logsFilter).Placeholder(a.t("logs.searchPlaceholder")).FontSize(12).Grow(1)
			})
			for _, level := range []string{"all", "info", "warn", "error", "perf"} {
				level := level
				a.pillButton(c, "log-level-"+level, a.t("logs.levels."+level), a.logsLevel == level, func() { a.logsLevel = level })
			}
			a.pillButton(c, "log-auto", a.t("logs.autoScroll"), a.logsAutoScroll, func() { a.logsAutoScroll = !a.logsAutoScroll })
		})
		ui.Box(c).FillWidth().Height(1).Background(p.hairline)
		ui.Row(c).Height(36).PaddingX(16).Gap(8).AlignItems(ui.Center).Children(func() {
			if ui.Button(c, a.t("logs.clear")).Clicked() {
				go func() {
					_ = a.svc.ClearLogs()
					a.postLogs(func() { a.logs = nil })
				}()
			}
			if ui.Button(c, a.t("logs.revealFile")).Clicked() {
				_ = a.svc.RevealLogFile()
			}
			if ui.Button(c, a.t("logs.copy")).Clicked() {
				var b strings.Builder
				for _, e := range entries {
					fmt.Fprintf(&b, "%s [%s][%s] %s %s\n", e.Timestamp, strings.ToUpper(e.Level), e.Category, e.Message, e.Detail)
				}
				_ = a.svc.WriteClipboardText(b.String())
				a.showToast(a.t("common.copied"))
			}
			ui.Box(c).Grow(1)
			ui.Text(c, a.t("logs.statusLive")).FontSize(10.5).TextColor(p.faint)
		})
		ui.Box(c).FillWidth().Height(1).Background(p.hairline)
		if len(entries) == 0 {
			a.emptyState(c, iconLogs, a.t("logs.empty"), "")
			return
		}
		ui.List(c.Key("log-list"), &a.logsList, len(entries), func(i int) {
			if i < 0 || i >= len(entries) {
				return
			}
			e := entries[i]
			a.logRow(c, e)
		}).Grow(1).Padding(4, 0, 12, 0)
	})
}

func (a *App) logRow(c *ui.Context, e core.LogEntry) {
	p := paletteFor(c.Theme())
	levelColor := p.muted
	switch e.Level {
	case "error":
		levelColor = p.danger
	case "warn":
		levelColor = ui.Hex("#e0a020")
	case "perf":
		levelColor = ui.Hex("#38a3d1")
	}
	ui.Row(c).FillWidth().Height(34).Padding(3, 16, 3, 16).Gap(10).AlignItems(ui.Center).Children(func() {
		ui.Text(c, e.Timestamp).FontSize(10.5).FontFeatures("tnum").TextColor(p.faint).Width(150).Shrink(0)
		ui.Text(c, strings.ToUpper(e.Level)).FontSize(9.5).FontWeight(700).TextColor(levelColor).Width(42).Shrink(0)
		ui.Text(c, e.Category).FontSize(10).TextColor(p.faint).Width(64).Shrink(0).SingleLine()
		ui.Text(c, e.Message).FontSize(11.5).TextColor(p.text).Grow(1).Shrink(1).MinWidth(0).SingleLine()
		if e.Detail != "" {
			ui.Text(c, e.Detail).FontSize(10.5).TextColor(p.muted).MaxWidth(360).SingleLine()
		}
		if e.DurationMs > 0 {
			ui.Textf(c, "%dms", e.DurationMs).FontSize(9.5).TextColor(p.faint).FontFeatures("tnum")
		}
	})
	ui.Box(c).FillWidth().Height(1).Background(p.hairline)
}

var _ = time.Second
