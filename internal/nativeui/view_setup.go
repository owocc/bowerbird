package nativeui

import (
	"fmt"
	"path/filepath"

	"github.com/egoist/mygo/ui"
)

func (a *App) viewSetup(c *ui.Context) {
	a.applyTheme(c)
	a.showPendingToast(c)
	t := c.Theme()
	ui.Column(c).Fill().Background(t.Background).Children(func() {
		ui.Scroll(c).Grow(1).Padding(28).Gap(16).Children(func() {
			ui.Text(c, "Bowerbird").FontSize(26).Bold()
			ui.Text(c, a.tr("Set up your library", "设置素材库")).FontSize(15).TextColor(t.TextMuted)
			ui.Divider(c)

			ui.Text(c, a.tr("Create a new library", "创建新素材库")).FontSize(14).Bold()
			ui.Text(c, a.tr(
				"A library is a folder that holds your items, thumbnails and metadata.",
				"素材库是一个目录，保存素材、缩略图与元数据。",
			)).FontSize(11).TextColor(t.TextMuted)

			ui.Text(c, a.tr("Library name", "库名称")).FontSize(11).TextColor(t.TextMuted)
			ui.TextInput(c, &a.setupName).Placeholder("MyAssets").Width(360)

			ui.Text(c, a.tr("Parent folder", "父目录")).FontSize(11).TextColor(t.TextMuted)
			ui.Row(c).Gap(8).Children(func() {
				ui.TextInput(c, &a.setupDir).Placeholder("/Users/you/Pictures").Grow(1)
				if ui.Button(c, a.tr("Choose…", "选择…")).Clicked() {
					a.chooseSetupDir()
				}
			})
			preview := ""
			if a.setupDir != "" {
				name := a.setupName
				if name == "" {
					name = "MyAssets"
				}
				preview = filepath.Join(a.setupDir, name+".library")
			}
			if preview != "" {
				ui.Text(c, preview).FontSize(10).TextColor(t.TextMuted).Selectable()
			}
			ui.Row(c).Gap(8).Children(func() {
				if ui.PrimaryButton(c, a.tr("Create Library", "创建素材库")).Clicked() {
					a.createLibrary()
				}
				if ui.Button(c, a.tr("Settings…", "设置…")).Clicked() {
					a.openSettings()
				}
			})

			ui.Divider(c)
			ui.Text(c, a.tr("Open an existing library", "打开已有素材库")).FontSize(14).Bold()
			ui.Text(c, a.tr("Choose a .library folder.", "选择一个 .library 目录。")).FontSize(11).TextColor(t.TextMuted)
			if ui.Button(c, a.tr("Open Library…", "打开素材库…")).Clicked() {
				a.openLibraryDialog()
			}

			recent := a.svc.GetRecentLibraries()
			if len(recent) > 0 {
				ui.Divider(c)
				ui.Text(c, a.tr("Recent libraries", "最近打开")).FontSize(12).Bold()
				for _, p := range recent {
					path := p
					ui.Row(c).Height(28).Gap(8).AlignItems(ui.Center).Children(func() {
						ui.Text(c, folderDisplayName(path)).FontSize(11).Grow(1).SingleLine()
						if ui.Button(c, a.tr("Open", "打开")).Clicked() {
							a.openLibraryPath(path)
						}
					})
					ui.Text(c, path).FontSize(9).TextColor(t.TextMuted).Selectable().SingleLine()
				}
			}
		})
		ui.Row(c).Height(26).Padding(0, 12).Background(t.Surface).
			BorderWidth(1, 0, 0, 0).BorderColor(t.Border).Children(func() {
			ui.Text(c, fmt.Sprintf("Bowerbird %s · native", "1.0.0-alpha-1")).FontSize(10).TextColor(t.TextMuted)
		})
	})
}
