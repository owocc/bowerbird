package nativeui

import (
	"strings"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
)

func (a *App) viewLogs(c *ui.Context) {
	a.applyTheme(c)
	a.showPendingToast(c)
	t := c.Theme()
	ui.Column(c).Fill().Background(t.Background).Children(func() {
		ui.Row(c).Padding(10, 12).Gap(8).AlignItems(ui.Center).Background(t.Surface).
			BorderWidth(0, 0, 1, 0).BorderColor(t.Border).Children(func() {
			ui.Text(c, a.tr("Logs", "日志")).FontSize(16).Bold()
			ui.Spacer(c)
			ui.SearchField(c, &a.logQuery).Width(220).Label(a.tr("Filter logs", "过滤日志"))
			if ui.Button(c, a.tr("Reload", "刷新")).Clicked() {
				a.loadLogs()
			}
			if ui.Button(c, a.tr("Clear", "清空")).Clicked() {
				a.clearLogs()
			}
			if ui.Button(c, a.tr("Reveal File", "显示日志文件")).Clicked() {
				a.revealLogFile()
			}
		})
		logs := a.filteredLogs()
		if len(logs) == 0 {
			ui.Column(c).Fill().Center().Children(func() {
				ui.Text(c, a.tr("No log entries.", "没有日志。")).FontSize(12).TextColor(t.TextMuted)
			})
			return
		}
		a.logList.Key = func(i int) any { return logs[i].ID }
		a.logList.Label = func(i int) string { return logs[i].Message }
		ui.List(c, &a.logList, len(logs), func(i int) {
			e := logs[i]
			ui.Row(c).Padding(6, 10).Gap(8).AlignItems(ui.Start).Children(func() {
				ui.Text(c, e.Timestamp).FontSize(9).Font("monospace").TextColor(t.TextMuted).Width(140)
				a.levelBadge(c, e.Level)
				ui.Text(c, e.Category).FontSize(9).TextColor(t.TextMuted).Width(54)
				ui.Column(c).Grow(1).Gap(1).Children(func() {
					ui.Text(c, e.Message).FontSize(11).Selectable()
					if e.Detail != "" {
						ui.Text(c, e.Detail).FontSize(9).TextColor(t.TextMuted).Selectable()
					}
				})
				if e.DurationMs > 0 {
					ui.Textf(c, "%dms", e.DurationMs).FontSize(9).TextColor(t.TextMuted)
				}
			}).BorderWidth(0, 0, 1, 0).BorderColor(t.Border)
		}).Grow(1)
	})
}

func (a *App) levelBadge(c *ui.Context, level string) {
	t := c.Theme()
	color := t.Success
	switch strings.ToLower(level) {
	case "warn", "warning":
		color = t.Warning
	case "error":
		color = t.Danger
	case "perf":
		color = t.Accent
	}
	ui.Text(c, strings.ToUpper(level)).FontSize(8).Bold().TextColor(t.AccentText).
		Padding(2, 5).Radius(4).Background(color)
}

func (a *App) filteredLogs() []core.LogEntry {
	q := strings.ToLower(strings.TrimSpace(a.logQuery))
	out := make([]core.LogEntry, 0, len(a.logs))
	for _, e := range a.logs {
		if q != "" {
			if !strings.Contains(strings.ToLower(e.Message), q) &&
				!strings.Contains(strings.ToLower(e.Detail), q) &&
				!strings.Contains(strings.ToLower(e.Category), q) {
				continue
			}
		}
		out = append(out, e)
	}
	return out
}
