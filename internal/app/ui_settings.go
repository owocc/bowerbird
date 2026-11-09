package app

import (
	"fmt"
	"runtime"
	"strings"
	"time"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
)

// refreshSettings reloads values shown by the settings window.
func (a *App) refreshSettings() {
	if a.svc == nil {
		return
	}
	a.themeValue = a.svc.GetTheme()
	if a.themeValue == "" {
		a.themeValue = core.ThemeSystem
	}
	a.languageValue = a.svc.GetLanguage()
	if a.languageValue == "" {
		a.languageValue = "system"
	}
	a.vibrancyValue = a.svc.GetVibrancyEnabled()
	a.network = a.svc.GetNetworkSettings()
	a.shortcuts = a.svc.GetShortcutSettings()
	if status, err := a.svc.GetMobileServerStatus(); err == nil {
		a.mobile = status
	}
	if devices, err := a.svc.ListMobileDevices(); err == nil {
		a.mobileDevices = devices
	}
	if plugins, err := a.svc.ListInstalledPlugins(); err == nil {
		a.plugins = a.pluginRows(plugins)
	}
}

// viewSettings builds the independent native settings window.
func (a *App) viewSettings(c *ui.Context) {
	p := paletteFor(c.Theme())
	a.applyVibrancyRoot(c)
	a.handleSettingsShortcuts(c)
	ui.Row(c).Fill().AlignItems(ui.Stretch).Children(func() {
		bar := c.TitleBar()
		// Section rail. Its header matches the main window's sidebar header:
		// the title sits right of the traffic lights, on the same line and
		// with the same inset as the sidebar toggle there.
		ui.Column(c).Width(sidebarWidth).FillHeight().Background(p.sidebar).Children(func() {
			ui.Row(c).Height(headerHeight).FillWidth().Padding(0, 8, 0, bar.Left+gallerySidePadding).AlignItems(ui.Center).DragWindow().Children(func() {
				ui.Text(c, a.t("settings.title")).FontSize(14).FontWeight(650).TextColor(p.text)
			})
			ui.Column(c).FillWidth().Grow(1).Shrink(1).Padding(10, 10, 10, 10).Children(func() {
				labels := a.settingsSectionLabels()
				for i, label := range labels {
					i, label := i, label
					b := ui.ButtonBase(c.Key(fmt.Sprintf("settings-nav-%d", i))).FillWidth().Height(32).PaddingX(10).Radius(7).FocusRing(false).AlignItems(ui.Center).Justify(ui.Start)
					bg := ui.Transparent
					if a.settingsSection == i {
						bg = p.press
					} else if b.Hovered() {
						bg = p.hover
					}
					b.Background(b.AnimateColor("bg", bg, ui.Animation{Duration: 120 * time.Millisecond}))
					b.Children(func() { ui.Text(c, label).FontSize(12.5).TextColor(p.text) })
					if b.Clicked() {
						if a.settingsSection != i {
							a.settingsSection = i
							a.settingsScroll.Y = 0
						}
					}
				}
				ui.Box(c).Grow(1)
				ui.Textf(c, "v%s", "1.0.0-alpha-1").FontSize(10).TextColor(p.faint).Padding(10, 8)
			})
		})
		ui.Box(c).Width(1).FillHeight().Background(p.hairline)
		ui.Column(c).FillHeight().Grow(1).Shrink(1).MinWidth(0).Background(p.bg).Children(func() {
			// The content scrolls under one floating header, as the gallery
			// does under the main toolbar. Its top inset keeps the first card
			// clear of the header until the user scrolls.
			ui.Scroll(c).Fill().TrackScroll(&a.settingsScroll).Padding(headerHeight+settingsContentTopPadding, 24, 28, 24).ScrollbarInsets(headerHeight+settingsContentTopPadding, 0, 28, 0).Children(func() {
				switch a.settingsSection {
				case 0:
					a.settingsGeneral(c)
				case 1:
					a.settingsAppearance(c)
				case 2:
					a.settingsShortcuts(c)
				case 3:
					a.settingsPlugins(c)
				case 4:
					a.settingsMobile(c)
				case 5:
					a.settingsNetwork(c)
				case 6:
					a.settingsStorage(c)
				default:
					a.settingsAbout(c)
				}
			})
			a.viewSettingsHeader(c)
		})
	})
}

// settingsContentTopPadding is the space above the first settings card. Once
// the scroll passes it, the content has reached the floating header.
const settingsContentTopPadding = 20

func (a *App) settingsHeaderHasContentUnder() bool {
	return a.settingsScroll.Y > settingsContentTopPadding
}

// viewSettingsHeader draws the shared settings header over the scrolling
// content, with the same material, drag area and divider behaviour as the main
// toolbar.
func (a *App) viewSettingsHeader(c *ui.Context) {
	p := paletteFor(c.Theme())
	header := ui.Column(c).FillWidth().Height(headerHeight).Absolute().Top(0).Left(0).Right(0)
	headerBlurActive := a.applyHeaderSurface(c, header, a.settingsHeaderHasContentUnder())
	header.Children(func() {
		bar := c.TitleBar()
		r := bar.Right
		if r == 0 && runtime.GOOS == "windows" {
			r = 138
		}
		ui.Row(c).FillWidth().Height(headerHeight).Padding(0, r+24, 0, 24).AlignItems(ui.Center).DragWindow().Children(func() {
			ui.Text(c, a.settingsSectionTitle(a.settingsSection)).FontSize(16).FontWeight(650).TextColor(p.text)
		})
		if headerBlurActive {
			ui.Box(c).Absolute().Bottom(0).FillWidth().Height(1).Background(p.hairline)
		}
	})
}

func (a *App) settingsSectionLabels() []string {
	return []string{
		a.t("settings.nav.general"),
		a.t("settings.nav.appearance"),
		a.t("settings.nav.shortcuts"),
		a.t("settings.nav.plugins"),
		a.t("settings.nav.mobile"),
		a.t("settings.nav.network"),
		a.t("settings.nav.data"),
		a.t("settings.about"),
	}
}

func (a *App) settingsSectionTitle(section int) string {
	labels := a.settingsSectionLabels()
	if section < 0 || section >= len(labels) {
		return a.t("settings.title")
	}
	return labels[section]
}

func (a *App) handleSettingsShortcuts(c *ui.Context) {
	if c.Shortcut(ui.Cmd, ui.KeyW) && a.settingsWin != nil {
		a.settingsWin.Close()
	}
}

func (a *App) settingsCard(c *ui.Context, title string, fn func()) {
	p := paletteFor(c.Theme())
	ui.Column(c).FillWidth().Padding(14).Radius(10).Background(p.surface).Border(1, p.hairline).Gap(10).Children(func() {
		ui.Text(c, title).FontSize(11).FontWeight(650).LetterSpacing(0.4).TextColor(p.muted)
		fn()
	})
	ui.Box(c).Height(10)
}

func (a *App) settingsRow(c *ui.Context, label, help string, control func()) {
	p := paletteFor(c.Theme())
	ui.Row(c).FillWidth().MinHeight(36).AlignItems(ui.Center).Gap(14).Children(func() {
		ui.Column(c).Grow(1).Shrink(1).Gap(1).Children(func() {
			ui.Text(c, label).FontSize(12.5).TextColor(p.text)
			if help != "" {
				ui.Text(c, help).FontSize(10.5).TextColor(p.faint).Wrap()
			}
		})
		control()
	})
}

func (a *App) settingsGeneral(c *ui.Context) {
	a.settingsCard(c, a.t("settings.language.title"), func() {
		ui.Row(c).Gap(6).Children(func() {
			for _, lang := range []string{"system", "en", "zh"} {
				lang := lang
				label := map[string]string{"system": a.t("settings.languageSystem"), "en": "English", "zh": "中文"}[lang]
				a.pillButton(c, "lang-"+lang, label, a.languageValue == lang, func() {
					go func() {
						err := a.svc.SetLanguage(lang)
						a.postSettings(func() {
							if err != nil {
								a.showToast(err.Error())
							}
							a.languageValue = lang
							a.trans.SetLanguage(lang)
							if a.svc != nil {
								a.trans.SetLanguage(a.currentLanguage())
							}
							a.refreshAll()
						})
					}()
				})
			}
		})
	})
	a.settingsCard(c, a.t("settings.behavior"), func() {
		enabled := a.svc.GetLightweightModeEnabled()
		a.settingsRow(c, a.t("settings.lightweight.title"), a.t("settings.lightweight.description"), func() {
			on := enabled
			if ui.Switch(c.Key("lightweight"), &on).Changed() {
				go a.svc.SetLightweightModeEnabled(on)
			}
		})
		recordURL := a.prefs.RecordImportURL
		a.settingsRow(c, a.t("settings.recordURL.title"), a.t("settings.recordURL.description"), func() {
			on := recordURL
			if ui.Switch(c.Key("record-import-url"), &on).Changed() {
				a.prefs.RecordImportURL = on
				a.savePrefs()
			}
		})
	})
}

func (a *App) settingsThemeCard(c *ui.Context) {
	a.settingsCard(c, a.t("settings.appearance.themeTitle"), func() {
		ui.Row(c).Gap(6).Children(func() {
			options := []struct {
				theme string
				label string
			}{
				{core.ThemeSystem, a.t("settings.appearance.auto")},
				{core.ThemeLight, a.t("settings.appearance.light")},
				{core.ThemeDark, a.t("settings.appearance.dark")},
			}
			for _, opt := range options {
				opt := opt
				a.pillButton(c, "theme-"+opt.theme, opt.label, a.themeValue == opt.theme, func() {
					go func() {
						err := a.svc.SetTheme(opt.theme)
						a.postSettings(func() {
							if err != nil {
								a.showToast(err.Error())
							}
							a.themeValue = opt.theme
						})
					}()
				})
			}
		})
	})
}

func (a *App) settingsAppearance(c *ui.Context) {
	p := paletteFor(c.Theme())
	a.settingsThemeCard(c)
	a.settingsCard(c, a.t("settings.vibrancy.title"), func() {
		a.settingsRow(c, a.t("settings.vibrancy.enable"), a.t("settings.vibrancy.enableDescription"), func() {
			on := a.vibrancyValue
			if ui.Switch(c.Key("vibrancy"), &on).Changed() {
				a.vibrancyValue = on
				go func() {
					err := a.svc.SetVibrancyEnabled(on)
					a.postSettings(func() {
						if err != nil {
							a.showToast(err.Error())
						}
						a.refreshAll()
					})
				}()
			}
		})
	})
	a.settingsCard(c, a.t("settings.backdrop.title"), func() {
		ui.Text(c, a.t("settings.backdrop.description")).FontSize(11).TextColor(p.faint).Wrap()
		modes := []string{"default", "transparent", "solid", "gradient"}
		if !a.vibrancyValue {
			modes = []string{"default", "solid", "gradient"}
			if a.prefs.BackdropMode == "transparent" {
				a.prefs.BackdropMode = "default"
				a.savePrefs()
			}
		}
		ui.Row(c).Gap(6).Children(func() {
			for _, mode := range modes {
				mode := mode
				label := a.t("settings.backdrop.modes." + mode)
				a.pillButton(c, "backdrop-"+mode, label, a.prefs.BackdropMode == mode, func() {
					a.prefs.BackdropMode = mode
					a.savePrefs()
					if a.win != nil {
						a.win.Invalidate()
					}
					if a.settingsWin != nil {
						a.settingsWin.Invalidate()
					}
				})
			}
		})
		if a.prefs.BackdropMode == "solid" {
			ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
				ui.Text(c, a.t("settings.solidColor")).FontSize(11.5).TextColor(p.muted)
				ui.TextInput(c, &a.prefs.BackdropSolid).Width(120).FontSize(12).OnSubmit(func() { a.savePrefs() })
			})
		}
	})
	a.settingsCard(c, a.t("settings.layout"), func() {
		a.settingsRow(c, a.t("settings.rowHeight"), "", func() {
			val := float64(a.rowHeight)
			ui.Slider(c.Key("row-height"), &val, 90, 420).Width(180)
			if int(val) != a.rowHeight {
				a.setRowHeight(int(val))
			}
		})
		a.settingsRow(c, a.t("contextMenu.showSidebar"), "", func() {
			on := a.prefs.SidebarOpen
			if ui.Switch(c.Key("show-sidebar"), &on).Changed() {
				a.prefs.SidebarOpen = on
				a.savePrefs()
			}
		})
		a.settingsRow(c, a.t("contextMenu.showInspector"), "", func() {
			on := a.prefs.InspectorOpen
			if ui.Switch(c.Key("show-inspector"), &on).Changed() {
				a.prefs.InspectorOpen = on
				a.savePrefs()
			}
		})
		a.settingsRow(c, a.t("contextMenu.showName"), "", func() {
			on := a.prefs.ShowNames
			if ui.Switch(c.Key("show-names"), &on).Changed() {
				a.prefs.ShowNames = on
				a.savePrefs()
			}
		})
		a.settingsRow(c, a.t("contextMenu.showExtension"), "", func() {
			on := a.prefs.ShowExt
			if ui.Switch(c.Key("show-ext"), &on).Changed() {
				a.prefs.ShowExt = on
				a.savePrefs()
			}
		})
	})
}

func (a *App) settingsShortcuts(c *ui.Context) {
	p := paletteFor(c.Theme())
	a.settingsCard(c, a.t("settings.shortcuts.title"), func() {
		ids := make([]string, 0, len(a.shortcuts.Bindings))
		for _, def := range core.ShortcutCatalog() {
			ids = append(ids, def.ID)
		}
		for _, id := range ids {
			id := id
			label := a.t("shortcuts." + id)
			if label == "shortcuts."+id {
				label = id
			}
			a.settingsRow(c, label, "", func() {
				val := a.shortcuts.Bindings[id]
				field := ui.TextInput(c.Key("shortcut-"+id), &val).Width(190).FontSize(12).FontFeatures("tnum")
				if field.Submitted() {
					next := core.NormalizeShortcutSettings(a.shortcuts)
					next.Bindings[id] = val
					if err := a.svc.SetShortcutSettings(next); err != nil {
						a.showToast(err.Error())
					} else {
						a.shortcuts = next
						a.showToast(a.t("common.saved"))
					}
				}
			})
		}
	})
	ui.Row(c).Gap(8).Children(func() {
		if ui.Button(c, a.t("settings.shortcutsReset")).Clicked() {
			go func() {
				err := a.svc.SetShortcutSettings(core.DefaultShortcutSettings())
				a.postSettings(func() {
					if err != nil {
						a.showToast(err.Error())
					} else {
						a.refreshSettings()
					}
				})
			}()
		}
		ui.Text(c, a.t("settings.shortcutsHelp")).FontSize(10.5).TextColor(p.faint)
	})
}

func (a *App) settingsPlugins(c *ui.Context) {
	p := paletteFor(c.Theme())
	ui.Row(c).Gap(8).Children(func() {
		if ui.PrimaryButton(c.Key("plugin-install"), a.t("settings.plugins.install")).Clicked() {
			a.dialog = dialogPluginInstall
			a.dialogValue = ""
			a.pendingInstall = a.svc.GetPendingPluginInstall()
		}
		if ui.Button(c, a.t("settings.plugins.openFolder")).Clicked() {
			_ = a.svc.OpenPluginsFolder()
		}
		if ui.Button(c, a.t("settings.plugins.marketplace")).Clicked() {
			_ = a.svc.OpenMarketplace()
		}
	})
	ui.Box(c).Height(8)
	for i := range a.plugins {
		pl := &a.plugins[i]
		a.settingsCard(c, pl.Name, func() {
			ui.Row(c).FillWidth().AlignItems(ui.Center).Gap(10).Children(func() {
				ui.Column(c).Grow(1).Gap(1).Children(func() {
					ui.Text(c, pl.ID).FontSize(11).TextColor(p.muted)
					if pl.Native != "" {
						ui.Text(c, a.t("settings.plugins.native")).FontSize(10).TextColor(p.faint)
					}
				})
				if pl.Builtin {
					ui.Badge(c, a.t("settings.plugins.builtin")).FontSize(9)
				}
				ui.Text(c, "v"+pl.Version).FontSize(10.5).TextColor(p.faint).FontFeatures("tnum")
				// Bind the switch to the row stored in a.plugins, not to a
				// loop copy. A copy made the switch snap back to its old
				// value on the next frame, which looked like the plugin
				// could not be disabled.
				on := pl.Enabled
				if ui.Switch(c.Key("plugin-"+pl.ID), &on).Changed() {
					if pl.Hosted && a.pluginHost != nil {
						a.pluginHost.SetEnabled(pl.ID, on)
					} else if a.svc != nil {
						_ = a.svc.SetPluginEnabled(pl.ID, on)
					}
					pl.Enabled = on
					if on {
						// Enabling a preview plugin may unlock cover generation for
						// items already loaded on the page.
						a.post(func() { a.backfillMissingThumbnails(a.items) })
					}
				}
			})
			// Plugin settings rendered from the manifest.
			if a.pluginHost != nil {
				if hosted, ok := a.pluginHost.Get(pl.ID); ok {
					for _, setting := range hosted.Manifest.Settings {
						setting := setting
						val := hosted.Settings[setting.Key]
						if val == "" {
							val = setting.Default
						}
						a.settingsRow(c, setting.Label, setting.Help, func() {
							input := ui.TextInput(c.Key("plugin-setting-"+pl.ID+"-"+setting.Key), &val).Width(220).FontSize(12)
							if setting.Placeholder != "" {
								input.Placeholder(setting.Placeholder)
							}
							input.OnSubmit(func() {
								a.pluginHost.SetSetting(pl.ID, setting.Key, val)
							})
						})
					}
				}
			}
			ui.Row(c).Gap(8).Children(func() {
				if ui.Button(c, a.t("settings.plugins.openStore")).Clicked() {
					a.openPluginStore(pl.ID)
				}
				if pl.CanUninstall && ui.Button(c, a.t("settings.plugins.uninstall")).Clicked() {
					a.uninstallPlugin(pl.ID)
				}
			})
		})
	}
}

// openPluginStore opens the marketplace detail page for one plugin.
func (a *App) openPluginStore(id string) {
	if a.svc == nil {
		return
	}
	go func() {
		if err := a.svc.OpenPluginMarketplace(id); err != nil {
			a.postSettings(func() { a.showToast(err.Error()) })
		}
	}()
}

// uninstallPlugin removes both the native host copy and the legacy plugin
// registry entry. Either side may be absent, so "not installed" is ignored.
func (a *App) uninstallPlugin(id string) {
	go func() {
		var failure error
		if a.pluginHost != nil && a.pluginHost.CanUninstall(id) {
			if err := a.pluginHost.Uninstall(id); err != nil {
				failure = err
			}
		}
		if a.svc != nil {
			if err := a.svc.UninstallPlugin(id); err != nil && failure == nil &&
				!strings.Contains(strings.ToLower(err.Error()), "not installed") &&
				!strings.Contains(strings.ToLower(err.Error()), "not found") {
				failure = err
			}
		}
		a.postSettings(func() {
			if failure != nil {
				a.showToast(failure.Error())
				return
			}
			a.showToast(a.t("settings.plugins.uninstalled"))
			a.refreshSettings()
			a.refreshAll()
		})
	}()
}

func (a *App) settingsMobile(c *ui.Context) {
	p := paletteFor(c.Theme())
	status := a.mobile
	a.settingsCard(c, a.t("settings.mobile.server"), func() {
		a.settingsRow(c, a.t("settings.mobile.enabled"), a.t("settings.mobile.enabledHelp"), func() {
			on := status != nil && status.Enabled
			if ui.Switch(c.Key("mobile-enabled"), &on).Changed() {
				go func() {
					err := a.svc.SetMobileServerEnabled(on)
					a.postSettings(func() {
						if err != nil {
							a.showToast(err.Error())
						}
						a.refreshSettings()
					})
				}()
			}
		})
		if status != nil {
			a.settingsRow(c, a.t("settings.mobile.running"), "", func() {
				ui.Text(c, map[bool]string{true: a.t("settings.mobile.online"), false: a.t("settings.mobile.offline")}[status.Running]).FontSize(11).TextColor(p.muted)
			})
			a.settingsRow(c, a.t("settings.mobile.pairingCode"), "", func() {
				ui.Text(c, status.PairingCode).FontSize(16).FontWeight(700).FontFeatures("tnum").TextColor(p.text)
				if ui.Button(c, a.t("settings.mobile.regenerate")).Clicked() {
					go func() {
						_, err := a.svc.RegenerateMobilePairingCode()
						a.postSettings(func() {
							if err != nil {
								a.showToast(err.Error())
							}
							a.refreshSettings()
						})
					}()
				}
			})
			a.settingsRow(c, a.t("settings.mobile.addresses"), "", func() {
				ui.Text(c, strings.Join(status.Addresses, "  ")).FontSize(11).TextColor(p.muted).MaxWidth(360).Wrap()
			})
		}
	})
	a.settingsCard(c, a.t("settings.mobile.devices"), func() {
		if len(a.mobileDevices) == 0 {
			ui.Text(c, a.t("settings.mobile.noDevices")).FontSize(11.5).TextColor(p.faint)
			return
		}
		for _, dev := range a.mobileDevices {
			dev := dev
			a.settingsRow(c, dev.Name, fmt.Sprintf("%s · %s", dev.TokenHint, dev.Source), func() {
				if ui.Button(c, a.t("settings.mobile.revoke")).Clicked() {
					go func() {
						err := a.svc.RevokeMobileDevice(dev.ID)
						a.postSettings(func() {
							if err != nil {
								a.showToast(err.Error())
							}
							a.refreshSettings()
						})
					}()
				}
			})
		}
	})
}

func (a *App) settingsNetwork(c *ui.Context) {
	p := paletteFor(c.Theme())
	a.settingsCard(c, a.t("settings.network.title"), func() {
		ui.Row(c).Gap(6).Children(func() {
			for _, mode := range []string{core.ProxyModeSystem, core.ProxyModeDirect, core.ProxyModeCustom} {
				mode := mode
				label := map[string]string{core.ProxyModeSystem: a.t("settings.network.system"), core.ProxyModeDirect: a.t("settings.network.direct"), core.ProxyModeCustom: a.t("settings.network.custom")}[mode]
				a.pillButton(c, "proxy-"+mode, label, a.network.ProxyMode == mode, func() {
					a.network.ProxyMode = mode
				})
			}
		})
		if a.network.ProxyMode == core.ProxyModeCustom {
			ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
				ui.Text(c, a.t("settings.network.address")).FontSize(11.5).TextColor(p.muted)
				ui.TextInput(c.Key("proxy-address"), &a.network.CustomProxy).Grow(1).FontSize(12).Placeholder("http://127.0.0.1:7890")
			})
		}
		ui.Row(c).Gap(8).Children(func() {
			if ui.Button(c, a.t("common.save")).Clicked() {
				net := a.network
				go func() {
					err := a.svc.SetNetworkSettings(net)
					a.postSettings(func() {
						if err != nil {
							a.showToast(err.Error())
						} else {
							a.showToast(a.t("common.saved"))
						}
					})
				}()
			}
			if ui.Button(c, a.t("settings.network.test")).Clicked() {
				go func() {
					res, err := a.svc.TestNetworkConnection("https://www.google.com")
					a.postSettings(func() {
						if err != nil {
							a.showToast(err.Error())
						} else if res != nil && res.Success {
							a.showToast(fmt.Sprintf("%s · %dms", a.t("settings.network.success"), res.LatencyMs))
						} else if res != nil {
							a.showToast(res.Error)
						}
					})
				}()
			}
		})
	})
}

func (a *App) settingsStorage(c *ui.Context) {
	a.settingsCard(c, a.t("settings.storage.title"), func() {
		a.settingsRow(c, a.t("settings.storage.library"), a.libraryPath(), func() {
			if ui.Button(c, a.t("settings.storage.open")).Clicked() {
				if a.library != nil {
					_ = a.svc.OpenFolder(a.library.Path)
				}
			}
		})
		a.settingsRow(c, a.t("settings.storage.userData"), a.svc.GetUserDataDir(), func() {
			if ui.Button(c, a.t("settings.storage.open")).Clicked() {
				_ = a.svc.OpenUserDataFolder()
			}
		})
		a.settingsRow(c, a.t("settings.storage.plugins"), a.svc.GetPluginsDir(), func() {
			if ui.Button(c, a.t("settings.storage.open")).Clicked() {
				_ = a.svc.OpenPluginsFolder()
			}
		})
		a.settingsRow(c, a.t("settings.storage.logs"), a.svc.GetLogFilePath(), func() {
			if ui.Button(c, a.t("settings.storage.reveal")).Clicked() {
				_ = a.svc.RevealLogFile()
			}
		})
		if a.library != nil {
			a.settingsRow(c, a.t("settings.storage.items"), fmt.Sprintf("%d · %s", a.stats.Total, formatBytes(a.stats.TotalSize)), func() {})
		}
	})
}

func (a *App) libraryPath() string {
	if a.library == nil {
		return ""
	}
	return a.library.Path
}

func (a *App) settingsAbout(c *ui.Context) {
	p := paletteFor(c.Theme())
	ui.Column(c).FillWidth().Center().Gap(10).PaddingY(30).Children(func() {
		ui.Box(c).Size(72, 72).Radius(18).Background(p.surface2).Center().Children(func() {
			ui.Icon(c, iconLibrary).Size(34, 34).TextColor(p.accent)
		})
		ui.Text(c, "Bowerbird").FontSize(22).FontWeight(700).TextColor(p.text)
		ui.Text(c, "1.0.0-alpha-1").FontSize(12).TextColor(p.muted)
		ui.Textf(c, "Go %s · %s/%s", runtime.Version(), runtime.GOOS, runtime.GOARCH).FontSize(11).TextColor(p.faint)
		ui.Text(c, a.t("settings.aboutText")).FontSize(12).TextColor(p.muted).MaxWidth(420).TextAlign(ui.Center).Wrap()
	})
}
