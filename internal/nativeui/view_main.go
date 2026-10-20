package nativeui

import (
	"fmt"
	"log"
	"math"
	"os"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"
)

func (a *App) viewMain(c *ui.Context) {
	a.applyTheme(c)
	a.recordFirstFrame(c)
	if a.lib != nil && a.libraryFrame.IsZero() {
		a.libraryFrame = time.Now()
		msg := fmt.Sprintf("startup-library-frame=%s", formatDuration(a.libraryFrame.Sub(a.startedAt)))
		log.Printf("[NativePerf] %s", msg)
		if path := os.Getenv("BOWERBIRD_NATIVE_METRICS"); path != "" {
			f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
			if err == nil {
				fmt.Fprintln(f, msg)
				f.Close()
			}
		}
	}
	a.showPendingToast(c)
	if a.lib == nil {
		a.viewEmpty(c)
		a.viewOverlays(c)
		return
	}
	a.mainShortcuts(c)
	ui.Column(c).Fill().Children(func() {
		if a.showSidebar {
			ui.Split(c, &a.sidebarWidth, func() {
				a.viewSidebar(c)
			}, func() {
				a.viewContent(c)
			}).Grow(1)
		} else {
			ui.Column(c).Fill().Children(func() { a.viewContent(c) })
		}
		a.viewStatusBar(c)
	})
	a.viewOverlays(c)
}

func (a *App) showPendingToast(c *ui.Context) {
	if a.pendingToast == "" {
		return
	}
	msg := a.pendingToast
	a.pendingToast = ""
	c.Toast(msg)
}

func (a *App) mainShortcuts(c *ui.Context) {
	if c.Shortcut(ui.Cmd, ui.KeyF) {
		a.searchHandle.Focus()
	}
	if c.Shortcut(ui.Cmd, ui.KeyComma) {
		a.openSettings()
	}
	if c.Shortcut(ui.Cmd|ui.Shift, ui.KeyB) {
		a.showSidebar = !a.showSidebar
	}
	if c.Shortcut(ui.Cmd, ui.KeyI) {
		a.showInspector = !a.showInspector
	}
	if c.Shortcut(ui.Cmd, ui.KeyL) {
		a.openLogs()
	}
	if a.preview.open {
		return
	}
	if c.Shortcut(0, ui.KeyEscape) {
		if a.hasFilters() {
			a.clearFilters()
		}
	}
	if c.Shortcut(0, ui.KeySpace) {
		if it := a.activeItem(); it != nil {
			a.openPreview(it.ID)
		}
	}
	if c.Shortcut(0, ui.KeyDelete) || c.Shortcut(0, ui.KeyBackspace) {
		a.requestDeleteSelected()
	}
}

func (a *App) viewEmpty(c *ui.Context) {
	t := c.Theme()
	ui.Column(c).Fill().Center().Gap(14).Padding(32).Children(func() {
		ui.Text(c, "Bowerbird").FontSize(28).Bold()
		ui.Text(c, a.tr("No active library", "还没有打开的素材库")).FontSize(14).TextColor(t.TextMuted)
		ui.Text(c, a.tr(
			"Create a new library or open an existing .library folder to get started.",
			"创建新素材库，或打开已有的 .library 目录开始使用。",
		)).FontSize(12).TextColor(t.TextMuted).TextAlign(ui.Center).MaxWidth(420)
		ui.Row(c).Gap(8).Children(func() {
			if ui.PrimaryButton(c, a.tr("Set up library…", "设置素材库…")).Clicked() {
				a.openSetup()
			}
			if ui.Button(c, a.tr("Settings…", "设置…")).Clicked() {
				a.openSettings()
			}
		})
	})
}

func (a *App) viewStatusBar(c *ui.Context) {
	t := c.Theme()
	ui.Row(c).Height(26).Padding(0, 12).Gap(12).AlignItems(ui.Center).
		Background(t.Surface).BorderWidth(1, 0, 0, 0).BorderColor(t.Border).Children(func() {
		vis := a.visibleItems()
		ui.Textf(c, "%d / %d", len(vis), len(a.items)).FontSize(11).TextColor(t.TextMuted)
		if n := a.totalSize(); n > 0 {
			ui.Text(c, formatBytes(n, 1)).FontSize(11).TextColor(t.TextMuted)
		}
		if a.selection.Len() > 1 {
			ui.Textf(c, a.tr("%d selected", "已选 %d"), a.selection.Len()).FontSize(11).TextColor(t.TextMuted)
		}
		ui.Spacer(c)
		if a.importing {
			label := a.tr("Importing…", "正在导入…")
			if a.importTotal > 0 {
				label = fmt.Sprintf("%s %d/%d", label, a.importCur, a.importTotal)
			}
			ui.Text(c, label).FontSize(11).TextColor(t.TextMuted)
			if a.importTotal > 0 {
				ui.Progress(c, math.Min(1, float64(a.importCur)/float64(a.importTotal))).Width(120)
			} else {
				ui.Spinner(c).Size(14, 14)
			}
		}
		if a.loading {
			ui.Spinner(c).Size(12, 12)
		}
		if a.loadErr != "" {
			ui.Text(c, truncate(a.loadErr, 80)).FontSize(11).TextColor(t.Danger)
		}
	})
}

func (a *App) viewOverlays(c *ui.Context) {
	a.viewFolderDialog(c)
	a.viewConfirm(c)
	a.viewPreview(c)
}

func (a *App) viewFolderDialog(c *ui.Context) {
	if !a.folderDialog.open {
		return
	}
	ui.Modal(c, &a.folderDialog.open, func() {
		title := a.tr("New Folder", "新建文件夹")
		if a.folderDialog.rename {
			title = a.tr("Rename Folder", "重命名文件夹")
		}
		ui.Text(c, title).FontSize(16).Bold()
		if ui.TextInput(c, &a.folderDialog.name).AutoFocus().
			Placeholder(a.tr("Folder name", "文件夹名称")).Submitted() {
			a.submitFolderDialog()
		}
		ui.Row(c).Gap(8).Justify(ui.End).Children(func() {
			if ui.Button(c, a.tr("Cancel", "取消")).Clicked() {
				a.folderDialog.open = false
			}
			if ui.PrimaryButton(c, a.tr("Save", "保存")).Clicked() || c.Shortcut(0, ui.KeyEnter) {
				a.submitFolderDialog()
			}
		})
	})
}

func (a *App) viewConfirm(c *ui.Context) {
	if !a.confirm.open {
		return
	}
	res := ui.AlertDialog(c, &a.confirm.open, a.confirm.title, a.confirm.msg, a.tr("Cancel", "取消"), a.tr("Delete", "删除"))
	if res == 1 {
		kind := a.confirm.action
		a.confirm.action = ""
		a.runConfirm(kind)
	}
	if !a.confirm.open {
		a.confirm.action = ""
	}
}

func (a *App) viewPreview(c *ui.Context) {
	if !a.preview.open {
		return
	}
	it := a.previewItem()
	if it == nil {
		a.preview.open = false
		return
	}
	t := c.Theme()
	ui.Modal(c, &a.preview.open, func() {
		w, h := c.Size()
		pw := float32(math.Min(float64(w-80), 1180))
		ph := float32(math.Min(float64(h-80), 860))
		ui.Column(c).Width(pw).Height(ph).Gap(10).Children(func() {
			ui.Row(c).Gap(10).AlignItems(ui.Center).Children(func() {
				ui.Text(c, it.Name).FontSize(14).Bold().SingleLine().Grow(1)
				ui.Badge(c, extensionLabel(it.Extension))
				if ui.Button(c, "✕").Label(a.tr("Close", "关闭")).Width(32).Clicked() {
					a.preview.open = false
				}
			})
			box := ui.Box(c).Grow(1).FillWidth().Background(ui.RGBA(0, 0, 0, 0.55)).Radius(10).Clip()
			box.Children(func() {
				cat := fileCategory(it.Extension, it.MimeType)
				if bmp := a.previewImage(it); bmp != nil && (cat == "image" || cat == "video") {
					ui.Image(c, bmp).Fill().Fit(ui.Contain)
					if cat == "video" || cat == "audio" {
						ui.Text(c, a.tr("Cover only — use Open for playback", "仅封面 — 点击 Open 用系统播放器播放")).
							FontSize(11).TextColor(ui.Hex("#ffffff")).Padding(3, 8).Radius(5).
							Background(ui.RGBA(0, 0, 0, 0.6)).Attach(ui.AnchorBottomLeft, ui.AnchorBottomLeft).Left(12).Bottom(12)
					}
				} else if a.previews.hasFailed(it.ID) {
					ui.Column(c).Fill().Center().Gap(8).Children(func() {
						ui.Text(c, extensionLabel(it.Extension)).FontSize(32).Bold().TextColor(t.TextMuted)
						ui.Text(c, a.tr("Open this file with its default app.", "请用默认应用打开此文件。")).FontSize(12).TextColor(t.TextMuted)
					})
				} else if cat == "image" || cat == "video" {
					ui.Column(c).Fill().Center().Gap(10).Children(func() {
						if it.DominantColor != "" {
							ui.Box(c).Size(160, 120).Radius(10).Background(mustHex(it.DominantColor))
						}
						ui.Spinner(c)
						ui.Text(c, a.tr("Loading preview…", "正在加载预览…")).FontSize(12).TextColor(t.TextMuted)
					})
				} else {
					ui.Column(c).Fill().Center().Gap(8).Children(func() {
						ui.Text(c, extensionLabel(it.Extension)).FontSize(32).Bold().TextColor(t.TextMuted)
						ui.Text(c, a.tr("No in-app preview for this file type.", "此文件类型没有内嵌预览。")).FontSize(12).TextColor(t.TextMuted)
					})
				}
			})
			ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
				if ui.Button(c, "‹").Label(a.tr("Previous", "上一张")).Width(36).Clicked() {
					a.previewStep(-1)
				}
				if ui.Button(c, "›").Label(a.tr("Next", "下一张")).Width(36).Clicked() {
					a.previewStep(1)
				}
				ui.Text(c, fmt.Sprintf("%s · %dx%d · %s", strings.ToUpper(it.Extension), it.Width, it.Height, formatBytes(it.Size, 1))).
					FontSize(11).TextColor(t.TextMuted)
				ui.Spacer(c)
				if ui.Button(c, a.tr("Reveal", "在访达中显示")).Clicked() {
					a.revealSelected()
				}
				if ui.PrimaryButton(c, a.tr("Open", "打开")).Clicked() {
					a.openSelected()
				}
			})
		})
		if c.Shortcut(0, ui.KeyLeft) {
			a.previewStep(-1)
		}
		if c.Shortcut(0, ui.KeyRight) {
			a.previewStep(1)
		}
	})
}

func mustHex(hex string) ui.Color {
	if hex == "" {
		return ui.Transparent
	}
	return ui.Hex(hex)
}

// themeHex turns a stored "#RRGGBB" into a UI color, falling back to the
// theme's surface.
func themeHex(hex string, fallback ui.Color) ui.Color {
	if hex == "" {
		return fallback
	}
	return ui.Hex(hex)
}
