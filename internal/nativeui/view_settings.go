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
			ui.Text(c, a.tr("Settings", "设置")).FontSize(17).Bold().Padding(4, 6, 10, 6)
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
	a.settingsHeading(c, a.tr("General", "通用"), a.tr("Appearance and language apply to every window.", "外观与语言会应用到所有窗口。"))
	ui.Text(c, a.tr("Appearance", "外观")).FontSize(12).Bold()
	idx := 0
	for i, v := range themeValues() {
		if v == a.themeMode {
			idx = i
		}
	}
	if ui.Segmented(c, &idx, themeNames(a)...).Changed() {
		a.setThemeMode(themeValues()[idx])
	}
	ui.Text(c, a.tr("Language", "语言")).FontSize(12).Bold()
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
	ui.Text(c, a.tr(
		"The native build follows the desktop's accent colour and appearance.",
		"native 版会跟随桌面的强调色与明暗外观。",
	)).FontSize(10).TextColor(t.TextMuted)
	ui.Divider(c)
	ui.Text(c, a.tr("Library", "素材库")).FontSize(12).Bold()
	if a.lib != nil {
		ui.Row(c).Gap(8).Children(func() {
			ui.Text(c, fmt.Sprintf("%s — %d items", a.lib.Name, a.lib.ItemCount)).FontSize(11)
			if ui.Button(c, a.tr("Close Library", "关闭素材库")).Clicked() {
				a.closeLibrary()
			}
		})
		ui.Text(c, a.lib.Path).FontSize(10).TextColor(t.TextMuted).Selectable()
	} else {
		ui.Text(c, a.tr("No active library.", "当前没有打开的素材库。")).FontSize(11).TextColor(t.TextMuted)
		if ui.Button(c, a.tr("Open Library…", "打开素材库…")).Clicked() {
			a.openLibraryDialog()
		}
	}
}

func (a *App) settingsShortcuts(c *ui.Context) {
	t := c.Theme()
	a.settingsHeading(c, a.tr("Shortcuts", "快捷键"), a.tr("Application-wide shortcuts.", "应用级快捷键。"))
	rows := [][2]string{
		{"Cmd/Ctrl + ,", a.tr("Settings", "设置")},
		{"Cmd/Ctrl + F", a.tr("Focus search", "聚焦搜索")},
		{"Cmd/Ctrl + Shift + B", a.tr("Toggle sidebar", "显示/隐藏侧栏")},
		{"Cmd/Ctrl + I", a.tr("Toggle inspector", "显示/隐藏检查器")},
		{"Cmd/Ctrl + L", a.tr("Logs", "日志")},
		{"Space", a.tr("Quick look", "快速预览")},
		{"← / →", a.tr("Previous / next preview", "预览上一张/下一张")},
		{"Esc", a.tr("Close preview or clear filters", "关闭预览或清除筛选")},
		{"Delete / Backspace", a.tr("Move selection to trash", "把选中项移入废纸篓")},
		{"Alt + A / S / W", a.tr("Area / fullscreen / window screenshot", "区域/全屏/窗口截图")},
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
	a.settingsHeading(c, a.tr("Plugins", "插件"), "")
	panel := ui.Column(c).Padding(16).Gap(8).Radius(10).Background(t.Surface).Border(1, t.Border)
	panel.Children(func() {
		ui.Text(c, a.tr("Plugins are not available in the native build", "native 版暂不支持插件")).FontSize(14).Bold()
		ui.Text(c, a.tr(
			"The plugin manager still exists in core, and the HTTP API starts as usual, but there is no plugin UI, preview plugin host, or marketplace integration in this experimental native renderer.",
			"core 中的插件管理器仍然存在，HTTP API 也照常启动，但这个 native 渲染实验版不提供插件 UI、预览插件宿主与市场集成。",
		)).FontSize(11).TextColor(t.TextMuted)
		ui.Text(c, a.tr(
			"Installed plugins are not lost: the webview build keeps working on its own branch/entry.",
			"已安装插件不会丢失：webview 版入口仍在，可在对应构建中继续使用。",
		)).FontSize(11).TextColor(t.TextMuted)
	})
	ui.Text(c, a.tr("Plugin folder", "插件目录")).FontSize(11).Bold()
	ui.Text(c, a.svc.GetPluginsDir()).FontSize(10).TextColor(t.TextMuted).Selectable()
	if ui.Button(c, a.tr("Open Plugins Folder", "打开插件目录")).Clicked() {
		go func() { _ = a.svc.OpenPluginsFolder() }()
	}
}

func (a *App) settingsNetwork(c *ui.Context) {
	t := c.Theme()
	a.settingsHeading(c, a.tr("Network", "网络"), a.tr("Proxy used for remote imports and plugin downloads.", "远程导入与插件下载使用的代理。"))
	modes := []string{core.ProxyModeSystem, core.ProxyModeDirect, core.ProxyModeCustom}
	labels := []string{a.tr("System proxy", "系统代理"), a.tr("Direct", "直连"), a.tr("Custom proxy", "自定义代理")}
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
		ui.Text(c, a.tr("Proxy URL", "代理地址")).FontSize(11).TextColor(t.TextMuted)
		ui.TextInput(c, &a.customProxy).Placeholder("http://127.0.0.1:7890").Width(320)
	}
	if ui.PrimaryButton(c, a.tr("Save", "保存")).Clicked() {
		a.saveNetworkSettings()
	}
	ui.Divider(c)
	ui.Text(c, a.tr("Connection test", "连通性测试")).FontSize(12).Bold()
	ui.Row(c).Gap(8).Children(func() {
		ui.TextInput(c, &a.testURL).Grow(1)
		if ui.Button(c, a.tr("Test", "测试")).Disabled(a.testPending).Clicked() {
			a.testNetwork()
		}
	})
	if a.testPending {
		ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
			ui.Spinner(c).Size(14, 14)
			ui.Text(c, a.tr("Testing…", "测试中…")).FontSize(11).TextColor(t.TextMuted)
		})
	} else if a.testResult != "" {
		ui.Text(c, a.testResult).FontSize(11).TextColor(t.TextMuted).Selectable()
	}
}

func (a *App) settingsData(c *ui.Context) {
	t := c.Theme()
	a.settingsHeading(c, a.tr("Data", "数据"), a.tr("Where Bowerbird keeps its files.", "Bowerbird 的文件位置。"))
	pathRow := func(label, path string, open func()) {
		ui.Text(c, label).FontSize(11).Bold()
		ui.Text(c, path).FontSize(10).TextColor(t.TextMuted).Selectable()
		ui.Row(c).Gap(8).Children(func() {
			if ui.Button(c, a.tr("Open", "打开")).Clicked() && open != nil {
				open()
			}
			if ui.Button(c, a.tr("Copy Path", "复制路径")).Clicked() {
				_ = a.svc.WriteClipboardText(path)
				a.toast(a.tr("Path copied", "路径已复制"))
			}
		})
	}
	pathRow(a.tr("User data", "用户数据"), a.svc.GetUserDataDir(), func() {
		go func() { _ = a.svc.OpenUserDataFolder() }()
	})
	pathRow(a.tr("Plugins", "插件"), a.svc.GetPluginsDir(), func() {
		go func() { _ = a.svc.OpenPluginsFolder() }()
	})
	pathRow(a.tr("Log file", "日志文件"), a.svc.GetLogFilePath(), func() { a.revealLogFile() })
	ui.Divider(c)
	ui.Text(c, a.tr("Diagnostics", "诊断")).FontSize(12).Bold()
	if ui.Button(c, a.tr("Open Logs Window", "打开日志窗口")).Clicked() {
		a.openLogs()
	}
	if ui.Button(c, a.tr("Reveal Log File", "在访达中显示日志")).Clicked() {
		a.revealLogFile()
	}
	ui.Text(c, a.tr(
		"Library data lives inside the .library folder you chose.",
		"素材库数据保存在你选择的 .library 目录中。",
	)).FontSize(10).TextColor(t.TextMuted)
}

func (a *App) settingsExtension(c *ui.Context) {
	t := c.Theme()
	a.settingsHeading(c, a.tr("Browser Extension", "浏览器扩展"), a.tr("The local HTTP API used by the browser extension.", "浏览器扩展使用的本地 HTTP API。"))
	port := a.svc.GetAPIServerPort()
	ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
		ui.Box(c).Size(8, 8).Radius(4).Background(t.Success)
		ui.Text(c, fmt.Sprintf(a.tr("Running on port %d", "运行于端口 %d"), port)).FontSize(12)
	})
	endpoint := fmt.Sprintf("http://127.0.0.1:%d/api", port)
	ui.Row(c).Gap(8).Children(func() {
		ui.Text(c, endpoint).FontSize(11).Selectable().Grow(1)
		if ui.Button(c, a.tr("Copy Endpoint", "复制地址")).Clicked() {
			_ = a.svc.WriteClipboardText(endpoint)
			a.toast(a.tr("Endpoint copied", "地址已复制"))
		}
	})
	ui.Text(c, a.tr(
		"The HTTP API is served by the asset server, so it starts with the app even though the extension UI is not part of the native build.",
		"HTTP API 由 asset server 提供，因此即使 native 版不包含扩展 UI，它也会随应用启动。",
	)).FontSize(10).TextColor(t.TextMuted)
}

func (a *App) settingsMobile(c *ui.Context) {
	t := c.Theme()
	a.settingsHeading(c, a.tr("Mobile", "移动端"), a.tr("Pair the iOS/Android app over your local network.", "通过局域网配对 iOS/Android App。"))
	if a.mobile == nil {
		ui.Text(c, a.tr("Mobile server status unavailable.", "暂时无法获取移动端状态。")).FontSize(11).TextColor(t.TextMuted)
		if ui.Button(c, a.tr("Refresh", "刷新")).Clicked() {
			a.reloadMobile()
		}
		return
	}
	on := a.mobileOn
	if ui.Switch(c, &on).Changed() {
		a.setMobileEnabled(on)
	}
	ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
		ui.Text(c, a.tr("LAN server", "局域网服务")).FontSize(12).Bold().Grow(1)
		if a.mobile.Running {
			ui.Badge(c, fmt.Sprintf(":%d", a.mobile.Port))
		}
	})
	ui.Text(c, fmt.Sprintf(
		a.tr("Paired devices: %d · Items: %d", "已配对设备：%d · 素材：%d"),
		a.mobile.PairedDevices, a.mobile.ItemCount,
	)).FontSize(11).TextColor(t.TextMuted)
	if len(a.mobile.Addresses) > 0 {
		ui.Text(c, a.tr("Addresses: ", "地址：")+joinStrings(a.mobile.Addresses, ", ")).FontSize(10).TextColor(t.TextMuted).Selectable()
	}
	if !a.mobile.Running {
		ui.Text(c, a.tr("The server is stopped; enable it to pair a phone.", "服务已停止；启用后才能配对手机。")).FontSize(11).TextColor(t.Warning)
		return
	}

	ui.Divider(c)
	ui.Row(c).Gap(10).AlignItems(ui.Center).Children(func() {
		ui.Text(c, a.tr("Pairing code", "配对码")).FontSize(12).Bold().Grow(1)
		ui.Text(c, a.mobile.PairingCode).FontSize(22).Bold().Font("monospace").Selectable()
		if ui.Button(c, a.tr("Regenerate", "重新生成")).Clicked() {
			a.regeneratePairing()
		}
	})

	url := a.pairingURL()
	if url == "" {
		ui.Text(c, a.tr("No pairing URL yet.", "暂时没有配对链接。")).FontSize(11).TextColor(t.TextMuted)
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
	ui.Text(c, a.tr("Scan to pair", "扫码配对")).FontSize(12).Bold()
	ui.Text(c, a.tr("Open the mobile app and scan this code.", "打开移动端 App 扫描此二维码。")).FontSize(11).TextColor(t.TextMuted)
	if a.qrBitmap != nil {
		ui.Box(c).Size(250, 250).Padding(6).Radius(12).Background(ui.Hex("#ffffff")).Children(func() {
			ui.Image(c, a.qrBitmap).Size(238, 238)
		})
	} else if a.qrErr != "" {
		ui.Text(c, a.qrErr).FontSize(10).TextColor(t.Danger).Selectable()
	}
	ui.Text(c, url).FontSize(9).TextColor(t.TextMuted).Selectable().MaxWidth(420)
	if ui.Button(c, a.tr("Copy Pairing URL", "复制配对链接")).Clicked() {
		_ = a.svc.WriteClipboardText(url)
		a.toast(a.tr("Pairing URL copied", "配对链接已复制"))
	}

	if len(a.mobile.AvailableNetworks) > 0 {
		ui.Divider(c)
		ui.Text(c, a.tr("Allowed networks", "允许的网段")).FontSize(12).Bold()
		ui.Text(c, a.tr("Unchecked networks are hidden from discovery.", "未勾选的网段不会出现在发现列表。")).FontSize(10).TextColor(t.TextMuted)
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
	a.settingsHeading(c, "Bowerbird", a.tr("A local-first asset library.", "本地优先的素材库。"))
	ui.Text(c, "Version 1.0.0-alpha-1 · native experimental").FontSize(12)
	ui.Text(c, fmt.Sprintf("Go %s · %s/%s", runtime.Version(), runtime.GOOS, runtime.GOARCH)).FontSize(11).TextColor(t.TextMuted)
	ui.Text(c, a.tr(
		"This build renders with mygo/ui on the GPU: no webview, no HTML, no JavaScript.",
		"此构建使用 mygo/ui 在 GPU 上绘制：没有 webview、HTML 或 JavaScript。",
	)).FontSize(11).TextColor(t.TextMuted)
	if ui.Button(c, a.tr("About Panel", "关于面板")).Clicked() {
		a.host.ShowAbout()
	}
	if ui.Button(c, a.tr("Open Logs", "打开日志")).Clicked() {
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
