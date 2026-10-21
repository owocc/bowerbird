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
			ui.Text(c, a.t("setup.title")).FontSize(15).TextColor(t.TextMuted)
			ui.Divider(c)

			ui.Text(c, a.t("native.create.a.new.library")).FontSize(14).Bold()
			ui.Text(c, a.t("native.a.library.is.a.folder.that.holds.your.it")).FontSize(11).TextColor(t.TextMuted)

			ui.Text(c, a.t("setup.create.nameLabel")).FontSize(11).TextColor(t.TextMuted)
			ui.TextInput(c, &a.setupName).Placeholder("MyAssets").Width(360)

			ui.Text(c, a.t("native.parent.folder")).FontSize(11).TextColor(t.TextMuted)
			ui.Row(c).Gap(8).Children(func() {
				ui.TextInput(c, &a.setupDir).Placeholder("/Users/you/Pictures").Grow(1)
				if ui.Button(c, a.t("native.choose")).Clicked() {
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
				if ui.PrimaryButton(c, a.t("native.create.library")).Clicked() {
					a.createLibrary()
				}
				if ui.Button(c, a.t("appMenu.settings")).Clicked() {
					a.openSettings()
				}
			})

			ui.Divider(c)
			ui.Text(c, a.t("native.open.an.existing.library")).FontSize(14).Bold()
			ui.Text(c, a.t("native.choose.a.library.folder")).FontSize(11).TextColor(t.TextMuted)
			if ui.Button(c, a.t("native.open.library")).Clicked() {
				a.openLibraryDialog()
			}

			recent := a.svc.GetRecentLibraries()
			if len(recent) > 0 {
				ui.Divider(c)
				ui.Text(c, a.t("native.recent.libraries")).FontSize(12).Bold()
				for _, p := range recent {
					path := p
					ui.Row(c).Height(28).Gap(8).AlignItems(ui.Center).Children(func() {
						ui.Text(c, folderDisplayName(path)).FontSize(11).Grow(1).SingleLine()
						if ui.Button(c, a.t("native.open.generic")).Clicked() {
							a.openLibraryPath(path)
						}
						if ui.Button(c, a.t("native.delete.library")).Clicked() {
							a.requestDeleteLibraryFor(path, "setup")
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
	// Confirmations raised from this window (deleting a recent library) are
	// drawn here, not only in the main workspace.
	if a.confirm.open && a.confirm.window == "setup" {
		a.viewConfirmFor(c, "setup")
	}
	a.viewTagDialog(c)
	a.viewFolderDialog(c)
}
