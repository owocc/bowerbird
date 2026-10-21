package nativeui

import (
	"fmt"
	"runtime"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
)

func (a *App) viewSettings(c *ui.Context) {
	a.applyTheme(c)
	a.showPendingToast(c)
	t := c.Theme()
	ui.Row(c).Fill().AlignItems(ui.Stretch).Background(t.Background).Children(func() {
		// Navigation.
		ui.Column(c).Width(176).FillHeight().Padding(10).Gap(2).Background(t.Surface).
			BorderWidth(0, 1, 0, 0).BorderColor(t.Border).Children(func() {
			ui.Text(c, a.t("settings.title")).FontSize(17).Bold().Padding(4, 6, 10, 6)
			for _, nav := range []struct {
				id int
				en string
				zh string
			}{
				{settingsGeneral, "General", "通用"},
				{settingsShortcuts, "Shortcuts", "快捷键"},
				{settingsPlugins, "Plugins", "插件"},
				{settingsNetwork, "Network", "网络"},
				{settingsData, "Data", "数据"},
				{settingsExtension, "Browser Extension", "浏览器扩展"},
				{settingsMobile, "Mobile", "移动端"},
				{settingsAbout, "About", "关于"},
			} {
				nav := nav
				row := ui.Row(c).Height(28).Padding(0, 8).Radius(6).AlignItems(ui.Center).Cursor(ui.CursorPointer)
				if a.settingsTab == nav.id {
					row.Background(t.Accent.Alpha(0.16))
				} else if row.Hovered() {
					row.Background(t.SurfaceHover)
				}
				row.Children(func() {
					txt := ui.Text(c, a.tr(nav.en, nav.zh)).FontSize(12)
					if a.settingsTab == nav.id {
						txt.TextColor(t.Accent)
					}
				})
				if row.Clicked() {
					a.settingsTab = nav.id
				}
			}
			ui.Spacer(c)
			ui.Text(c, "1.0.0-alpha-1 · native").FontSize(9).TextColor(t.TextMuted).Padding(4, 6, 6, 6)
		})

		ui.Scroll(c).Grow(1).Padding(24).Gap(14).Children(func() {
			switch a.settingsTab {
			case settingsGeneral:
				a.settingsGeneral(c)
			case settingsShortcuts:
				a.settingsShortcuts(c)
			case settingsPlugins:
				a.settingsPlugins(c)
			case settingsNetwork:
				a.settingsNetwork(c)
			case settingsData:
				a.settingsData(c)
			case settingsExtension:
				a.settingsExtension(c)
			case settingsMobile:
				a.settingsMobile(c)
			case settingsAbout:
				a.settingsAbout(c)
			}
		})
	})
}

func (a *App) settingsHeading(c *ui.Context, title, desc string) {
	t := c.Theme()
	ui.Text(c, title).FontSize(18).Bold()
	if desc != "" {
		ui.Text(c, desc).FontSize(11).TextColor(t.TextMuted)
	}
	ui.Divider(c)
}

func (a *App) settingsGeneral(c *ui.Context) {
	t := c.Theme()
	a.settingsHeading(c, a.t("settings.nav.general"), a.t("native.appearance.and.language.apply.to.every.w"))
	ui.Text(c, a.t("native.appearance")).FontSize(12).Bold()
	idx := 0
	for i, v := range themeValues() {
		if v == a.themeMode {
			idx = i
		}
	}
	if ui.Segmented(c, &idx, themeNames(a)...).Changed() {
		a.setThemeMode(themeValues()[idx])
	}
	ui.Text(c, a.t("settings.language.title")).FontSize(12).Bold()
	langIdx := 0
	for i, v := range languageValues() {
		if v == a.language {
			langIdx = i
		}
	}
	names := languageNames(a)
	chosen := names[langIdx]
	if ui.Select(c, &chosen, names).Width(220).Changed() {
		for i, n := range names {
			if n == chosen {
				a.setLanguageMode(languageValues()[i])
			}
		}
	}
	ui.Text(c, a.t("native.the.native.build.follows.the.desktop.s.a")).FontSize(10).TextColor(t.TextMuted)
	ui.Divider(c)
	ui.Text(c, a.t("native.library")).FontSize(12).Bold()
	if a.lib != nil {
		ui.Row(c).Gap(8).Children(func() {
			ui.Text(c, fmt.Sprintf("%s — %d items", a.lib.Name, a.lib.ItemCount)).FontSize(11)
			if ui.Button(c, a.t("sidebar.closeLibrary")).Clicked() {
				a.closeLibrary()
			}
		})
		ui.Text(c, a.lib.Path).FontSize(10).TextColor(t.TextMuted).Selectable()
	} else {
		ui.Text(c, a.t("native.no.active.library.2")).FontSize(11).TextColor(t.TextMuted)
		if ui.Button(c, a.t("native.open.library")).Clicked() {
			a.openLibraryDialog()
		}
	}
}

func (a *App) settingsShortcuts(c *ui.Context) {
	t := c.Theme()
	a.settingsHeading(c, a.t("native.shortcuts"), a.t("native.application.wide.shortcuts"))
	rows := [][2]string{
		{"Cmd/Ctrl + ,", a.t("settings.title")},
		{"Cmd/Ctrl + F", a.t("native.focus.search")},
		{"Cmd/Ctrl + Shift + B", a.t("native.toggle.sidebar")},
		{"Cmd/Ctrl + I", a.t("native.toggle.inspector")},
		{"Cmd/Ctrl + L", a.t("native.logs")},
		{"Space", a.t("native.quick.look")},
		{"← / →", a.t("native.previous.next.preview")},
		{"Esc", a.t("native.close.preview.or.clear.filters")},
		{"Delete / Backspace", a.t("native.move.selection.to.trash")},
		{"Alt + A / S / W", a.t("native.area.fullscreen.window.screenshot")},
	}
	for _, r := range rows {
		ui.Row(c).Gap(12).Children(func() {
			ui.Text(c, r[0]).FontSize(11).Width(180)
			ui.Text(c, r[1]).FontSize(11).TextColor(t.TextMuted).Grow(1)
		})
	}
}

func (a *App) settingsPlugins(c *ui.Context) {
	t := c.Theme()
	a.settingsHeading(c, a.t("settings.nav.plugins"), "")
	panel := ui.Column(c).Padding(16).Gap(8).Radius(10).Background(t.Surface).Border(1, t.Border)
	panel.Children(func() {
		ui.Text(c, a.t("native.plugins.are.not.available.in.the.native.")).FontSize(14).Bold()
		ui.Text(c, a.t("native.the.plugin.manager.still.exists.in.core.")).FontSize(11).TextColor(t.TextMuted)
		ui.Text(c, a.t("native.installed.plugins.are.not.lost.the.webvi")).FontSize(11).TextColor(t.TextMuted)
	})
	ui.Text(c, a.t("native.plugin.folder")).FontSize(11).Bold()
	ui.Text(c, a.svc.GetPluginsDir()).FontSize(10).TextColor(t.TextMuted).Selectable()
	if ui.Button(c, a.t("native.open.plugins.folder")).Clicked() {
		go func() { _ = a.svc.OpenPluginsFolder() }()
	}
}

func (a *App) settingsNetwork(c *ui.Context) {
	t := c.Theme()
	a.settingsHeading(c, a.t("settings.nav.network"), a.t("native.proxy.used.for.remote.imports.and.plugin"))
	modes := []string{core.ProxyModeSystem, core.ProxyModeDirect, core.ProxyModeCustom}
	labels := []string{a.t("native.system.proxy"), a.t("native.direct"), a.t("native.custom.proxy")}
	if a.proxyMode == "" {
		a.proxyMode = core.ProxyModeSystem
	}
	chosen := labels[0]
	for i, m := range modes {
		if m == a.proxyMode {
			chosen = labels[i]
		}
	}
	if ui.Select(c, &chosen, labels).Width(220).Changed() {
		for i, l := range labels {
			if l == chosen {
				a.proxyMode = modes[i]
			}
		}
	}
	if a.proxyMode == core.ProxyModeCustom {
		ui.Text(c, a.t("native.proxy.url")).FontSize(11).TextColor(t.TextMuted)
		ui.TextInput(c, &a.customProxy).Placeholder("http://127.0.0.1:7890").Width(320)
	}
	if ui.PrimaryButton(c, a.t("common.save")).Clicked() {
		a.saveNetworkSettings()
	}
	ui.Divider(c)
	ui.Text(c, a.t("native.connection.test")).FontSize(12).Bold()
	ui.Row(c).Gap(8).Children(func() {
		ui.TextInput(c, &a.testURL).Grow(1)
		if ui.Button(c, a.t("native.test")).Disabled(a.testPending).Clicked() {
			a.testNetwork()
		}
	})
	if a.testPending {
		ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
			ui.Spinner(c).Size(14, 14)
			ui.Text(c, a.t("settings.network.testing")).FontSize(11).TextColor(t.TextMuted)
		})
	} else if a.testResult != "" {
		ui.Text(c, a.testResult).FontSize(11).TextColor(t.TextMuted).Selectable()
	}
}

func (a *App) settingsData(c *ui.Context) {
	t := c.Theme()
	a.settingsHeading(c, a.t("native.data"), a.t("native.where.bowerbird.keeps.its.files"))
	pathRow := func(label, path string, open func()) {
		ui.Text(c, label).FontSize(11).Bold()
		ui.Text(c, path).FontSize(10).TextColor(t.TextMuted).Selectable()
		ui.Row(c).Gap(8).Children(func() {
			if ui.Button(c, a.t("native.open.generic")).Clicked() && open != nil {
				open()
			}
			if ui.Button(c, a.t("settings.data.copyPath")).Clicked() {
				_ = a.svc.WriteClipboardText(path)
				a.toast(a.t("native.path.copied"))
			}
		})
	}
	pathRow(a.t("native.user.data"), a.svc.GetUserDataDir(), func() {
		go func() { _ = a.svc.OpenUserDataFolder() }()
	})
	pathRow(a.t("settings.nav.plugins"), a.svc.GetPluginsDir(), func() {
		go func() { _ = a.svc.OpenPluginsFolder() }()
	})
	pathRow(a.t("logs.logFile"), a.svc.GetLogFilePath(), func() { a.revealLogFile() })
	ui.Divider(c)
	ui.Text(c, a.t("native.diagnostics")).FontSize(12).Bold()
	if ui.Button(c, a.t("native.open.logs.window")).Clicked() {
		a.openLogs()
	}
	if ui.Button(c, a.t("native.reveal.log.file")).Clicked() {
		a.revealLogFile()
	}
	ui.Text(c, a.t("native.library.data.lives.inside.the.library.fo")).FontSize(10).TextColor(t.TextMuted)
}

func (a *App) settingsExtension(c *ui.Context) {
	t := c.Theme()
	a.settingsHeading(c, a.t("settings.nav.extension"), a.t("native.the.local.http.api.used.by.the.browser.e"))
	port := a.svc.GetAPIServerPort()
	ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
		ui.Box(c).Size(8, 8).Radius(4).Background(t.Success)
		ui.Text(c, fmt.Sprintf(a.t("native.running.on.port.d"), port)).FontSize(12)
	})
	endpoint := fmt.Sprintf("http://127.0.0.1:%d/api", port)
	ui.Row(c).Gap(8).Children(func() {
		ui.Text(c, endpoint).FontSize(11).Selectable().Grow(1)
		if ui.Button(c, a.t("settings.extension.copyEndpoint")).Clicked() {
			_ = a.svc.WriteClipboardText(endpoint)
			a.toast(a.t("native.endpoint.copied"))
		}
	})
	ui.Text(c, a.t("native.the.http.api.is.served.by.the.asset.serv")).FontSize(10).TextColor(t.TextMuted)
}

func (a *App) settingsMobile(c *ui.Context) {
	t := c.Theme()
	a.settingsHeading(c, a.t("native.mobile"), a.t("native.pair.the.ios.android.app.over.your.local"))
	if a.mobile == nil {
		ui.Text(c, a.t("native.mobile.server.status.unavailable")).FontSize(11).TextColor(t.TextMuted)
		if ui.Button(c, a.t("logs.refresh")).Clicked() {
			a.reloadMobile()
		}
		return
	}
	on := a.mobileOn
	if ui.Switch(c, &on).Changed() {
		a.setMobileEnabled(on)
	}
	ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
		ui.Text(c, a.t("native.lan.server")).FontSize(12).Bold().Grow(1)
		if a.mobile.Running {
			ui.Badge(c, fmt.Sprintf(":%d", a.mobile.Port))
		}
	})
	ui.Text(c, fmt.Sprintf(
		a.t("native.paired.devices.d.items.d"),
		a.mobile.PairedDevices, a.mobile.ItemCount,
	)).FontSize(11).TextColor(t.TextMuted)
	if len(a.mobile.Addresses) > 0 {
		ui.Text(c, a.t("native.addresses")+joinStrings(a.mobile.Addresses, ", ")).FontSize(10).TextColor(t.TextMuted).Selectable()
	}
	if !a.mobile.Running {
		ui.Text(c, a.t("native.the.server.is.stopped.enable.it.to.pair.")).FontSize(11).TextColor(t.Warning)
		return
	}

	ui.Divider(c)
	ui.Row(c).Gap(10).AlignItems(ui.Center).Children(func() {
		ui.Text(c, a.t("native.pairing.code")).FontSize(12).Bold().Grow(1)
		ui.Text(c, a.mobile.PairingCode).FontSize(22).Bold().Font("monospace").Selectable()
		if ui.Button(c, a.t("settings.mobile.regenerate")).Clicked() {
			a.regeneratePairing()
		}
	})

	url := a.pairingURL()
	if url == "" {
		ui.Text(c, a.t("native.no.pairing.url.yet")).FontSize(11).TextColor(t.TextMuted)
		return
	}
	if url != a.qrURL || a.qrBitmap == nil {
		bmp, err := makeQRBitmap(url, 240)
		if err != nil {
			a.qrErr = err.Error()
		} else {
			a.qrBitmap = bmp
			a.qrURL = url
			a.qrErr = ""
		}
	}
	ui.Divider(c)
	ui.Text(c, a.t("native.scan.to.pair")).FontSize(12).Bold()
	ui.Text(c, a.t("native.open.the.mobile.app.and.scan.this.code")).FontSize(11).TextColor(t.TextMuted)
	if a.qrBitmap != nil {
		ui.Box(c).Size(250, 250).Padding(6).Radius(12).Background(ui.Hex("#ffffff")).Children(func() {
			ui.Image(c, a.qrBitmap).Size(238, 238)
		})
	} else if a.qrErr != "" {
		ui.Text(c, a.qrErr).FontSize(10).TextColor(t.Danger).Selectable()
	}
	ui.Text(c, url).FontSize(9).TextColor(t.TextMuted).Selectable().MaxWidth(420)
	if ui.Button(c, a.t("settings.mobile.copyUrl")).Clicked() {
		_ = a.svc.WriteClipboardText(url)
		a.toast(a.t("native.pairing.url.copied"))
	}

	if len(a.mobile.AvailableNetworks) > 0 {
		ui.Divider(c)
		ui.Text(c, a.t("native.allowed.networks")).FontSize(12).Bold()
		ui.Text(c, a.t("native.unchecked.networks.are.hidden.from.disco")).FontSize(10).TextColor(t.TextMuted)
		allowed := append([]string(nil), a.mobile.AllowedNetworks...)
		if len(allowed) == 0 {
			for _, n := range a.mobile.AvailableNetworks {
				allowed = append(allowed, n.ID)
			}
		}
		changed := false
		for _, n := range a.mobile.AvailableNetworks {
			n := n
			on := contains(allowed, n.ID)
			if ui.Checkbox(c, &on, fmt.Sprintf("%s (%s)", n.Name, joinStrings(n.IPs, ", "))).Changed() {
				if on {
					allowed = append(allowed, n.ID)
				} else {
					allowed = removeString(allowed, n.ID)
				}
				changed = true
			}
		}
		if changed {
			a.setAllowedNetworks(allowed)
		}
	}
}

func (a *App) settingsAbout(c *ui.Context) {
	t := c.Theme()
	a.settingsHeading(c, "Bowerbird", a.t("native.a.local.first.asset.library"))
	ui.Text(c, "Version 1.0.0-alpha-1 · native experimental").FontSize(12)
	ui.Text(c, fmt.Sprintf("Go %s · %s/%s", runtime.Version(), runtime.GOOS, runtime.GOARCH)).FontSize(11).TextColor(t.TextMuted)
	ui.Text(c, a.t("native.this.build.renders.with.mygo.ui.on.the.g")).FontSize(11).TextColor(t.TextMuted)
	if ui.Button(c, a.t("native.about.panel")).Clicked() {
		a.host.ShowAbout()
	}
	if ui.Button(c, a.t("native.open.logs")).Clicked() {
		a.openLogs()
	}
}

func joinStrings(in []string, sep string) string {
	out := ""
	for i, s := range in {
		if i > 0 {
			out += sep
		}
		out += s
	}
	return out
}

func removeString(in []string, drop string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		if s != drop {
			out = append(out, s)
		}
	}
	return out
}
