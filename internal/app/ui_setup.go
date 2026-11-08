package app

import (
	"path/filepath"
	"time"

	"github.com/egoist/mygo/ui"
)

// viewSetup is the first-run / library chooser window. It creates a library in
// a chosen parent directory or opens an existing one, then closes itself when
// core opens the main window.
func (a *App) viewSetup(c *ui.Context) {
	p := paletteFor(c.Theme())
	root := ui.Box(c).Fill()
	a.applyBackdrop(root, c.Theme())
	root.Children(func() {
		ui.Column(c).Fill().Children(func() {
			ui.Row(c).Height(32).DragWindow()
			ui.Column(c).Fill().Grow(1).Shrink(1).Padding(36, 48, 36, 48).Gap(18).Children(func() {
				ui.Row(c).Gap(14).AlignItems(ui.Center).Children(func() {
					ui.Box(c).Size(52, 52).Radius(14).Background(p.surface2).Center().Children(func() {
						ui.Icon(c, iconLibrary).Size(26, 26).TextColor(p.accent)
					})
					ui.Column(c).Gap(2).Children(func() {
						ui.Text(c, a.t("setup.title")).FontSize(26).FontWeight(750).TextColor(p.text)
						ui.Text(c, a.t("setup.subtitle")).FontSize(12.5).TextColor(p.muted)
					})
				})
				ui.Box(c).Height(6)
				ui.Column(c).FillWidth().Padding(18).Radius(12).Background(p.surface).Border(1, p.hairline).Gap(12).Children(func() {
					a.sectionLabel(c, a.t("setup.createTitle"))
					ui.Row(c).Gap(8).Children(func() {
						ui.TextInput(c.Key("setup-name"), &a.dialogValue).Placeholder(a.t("setup.libraryName")).FontSize(13).Grow(1)
						if ui.PrimaryButton(c.Key("setup-create"), a.t("common.create")).Clicked() {
							name := a.dialogValue
							if name == "" {
								a.showToast(a.t("setup.libraryNameRequired"))
							} else {
								go func() {
									parent, err := a.svc.SelectDirectory()
									if err != nil || parent == "" {
										return
									}
									_, err = a.svc.CreateLibrary(parent, name)
									a.post(func() {
										if err != nil {
											a.showToast(err.Error())
										}
									})
								}()
							}
						}
					})
					ui.Text(c, a.t("setup.createHint")).FontSize(10.5).TextColor(p.faint)
				})
				ui.Column(c).FillWidth().Padding(18).Radius(12).Background(p.surface).Border(1, p.hairline).Gap(12).Children(func() {
					a.sectionLabel(c, a.t("setup.openTitle"))
					ui.Row(c).Gap(8).Children(func() {
						if ui.Button(c.Key("setup-open"), a.t("setup.chooseFolder")).Clicked() {
							go func() {
								path, err := a.svc.SelectLibraryDialog()
								if err != nil || path == "" {
									return
								}
								_, err = a.svc.OpenLibrary(path)
								a.post(func() {
									if err != nil {
										a.showToast(err.Error())
									}
								})
							}()
						}
						ui.Text(c, a.t("setup.openHint")).FontSize(10.5).TextColor(p.faint).Grow(1).Wrap()
					})
					if len(a.recent) > 0 {
						ui.Box(c).FillWidth().Height(1).Background(p.hairline)
						a.sectionLabel(c, a.t("setup.recent"))
						for _, ref := range a.recent {
							ref := ref
							row := ui.ButtonBase(c.Key("recent-" + ref.ID)).FillWidth().Height(36).PaddingX(10).Radius(7).FocusRing(false).AlignItems(ui.Center).Gap(10)
							if row.Hovered() {
								row.Background(p.hover)
							}
							row.Children(func() {
								ui.Icon(c, iconFolder).Size(15, 15).TextColor(p.muted)
								ui.Column(c).Grow(1).Shrink(1).Gap(0).Children(func() {
									ui.Text(c, filepath.Base(ref.Path)).FontSize(12.5).TextColor(p.text).SingleLine()
									ui.Text(c, ref.Path).FontSize(10).TextColor(p.faint).SingleLine()
								})
								ui.Icon(c, iconChevronR).Size(12, 12).TextColor(p.faint)
							})
							if row.Clicked() {
								path := ref.Path
								go func() {
									_, err := a.svc.OpenLibrary(path)
									a.post(func() {
										if err != nil {
											a.showToast(err.Error())
										}
									})
								}()
							}
						}
					}
				})
				ui.Box(c).Grow(1)
				ui.Row(c).AlignItems(ui.Center).Gap(8).Children(func() {
					ui.Text(c, a.t("setup.footer")).FontSize(10.5).TextColor(p.faint)
					ui.Box(c).Grow(1)
					if ui.Button(c, a.t("common.quit")).Clicked() {
						a.quit()
					}
				})
			})
		})
		if a.toastActive() {
			ui.Row(c).Absolute().Left(0).Right(0).Bottom(18).Justify(ui.Center).Children(func() {
				ui.Row(c).PaddingX(14).Height(34).Radius(999).Background(p.text).AlignItems(ui.Center).Children(func() {
					ui.Text(c, a.toast).FontSize(11.5).TextColor(p.bg)
				})
			})
			c.After(time.Until(a.toastUntil))
		}
	})
}
