package nativeui

import (
	"fmt"
	"log"
	"math"
	"os"
	"strings"
	"time"

	"bowerbird/core"

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
		ui.Text(c, a.t("native.no.active.library")).FontSize(14).TextColor(t.TextMuted)
		ui.Text(c, a.t("native.create.a.new.library.or.open.an.existing")).FontSize(12).TextColor(t.TextMuted).TextAlign(ui.Center).MaxWidth(420)
		ui.Row(c).Gap(8).Children(func() {
			if ui.PrimaryButton(c, a.t("native.set.up.library")).Clicked() {
				a.openSetup()
			}
			if ui.Button(c, a.t("appMenu.settings")).Clicked() {
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
			ui.Textf(c, a.t("native.d.selected"), a.selection.Len()).FontSize(11).TextColor(t.TextMuted)
		}
		ui.Spacer(c)
		if a.importing {
			label := a.t("native.importing")
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
	a.viewTagDialog(c)
	a.viewConfirm(c)
	a.viewPreview(c)
	a.viewMarquee(c)
}

func (a *App) viewTagDialog(c *ui.Context) {
	if !a.tagDialog.open {
		return
	}
	ui.Modal(c, &a.tagDialog.open, func() {
		ui.Text(c, a.t("native.new.tag")).FontSize(16).Bold()
		if ui.TextInput(c, &a.tagDialog.name).AutoFocus().
			Placeholder(a.t("tags.tagName")).Submitted() {
			a.submitTagDialog()
		}
		ui.Row(c).Gap(8).Justify(ui.End).Children(func() {
			if ui.Button(c, a.t("common.cancel")).Clicked() {
				a.tagDialog.open = false
			}
			if ui.PrimaryButton(c, a.t("common.create")).Clicked() || c.Shortcut(0, ui.KeyEnter) {
				a.submitTagDialog()
			}
		})
	})
}

func (a *App) viewFolderDialog(c *ui.Context) {
	if !a.folderDialog.open {
		return
	}
	ui.Modal(c, &a.folderDialog.open, func() {
		title := a.t("sidebar.newFolder")
		if a.folderDialog.rename {
			title = a.t("sidebar.renameFolder")
		}
		ui.Text(c, title).FontSize(16).Bold()
		if ui.TextInput(c, &a.folderDialog.name).AutoFocus().
			Placeholder(a.t("native.folder.name")).Submitted() {
			a.submitFolderDialog()
		}
		ui.Row(c).Gap(8).Justify(ui.End).Children(func() {
			if ui.Button(c, a.t("common.cancel")).Clicked() {
				a.folderDialog.open = false
			}
			if ui.PrimaryButton(c, a.t("common.save")).Clicked() || c.Shortcut(0, ui.KeyEnter) {
				a.submitFolderDialog()
			}
		})
	})
}

func (a *App) viewConfirm(c *ui.Context) {
	if a.confirm.window != "" && a.confirm.window != "main" {
		return
	}
	a.viewConfirmFor(c, "main")
}

func (a *App) viewConfirmFor(c *ui.Context, window string) {
	if !a.confirm.open {
		return
	}
	res := ui.AlertDialog(c, &a.confirm.open, a.confirm.title, a.confirm.msg, a.t("common.cancel"), a.t("common.delete"))
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
				if ui.Button(c, "✕").Label(a.t("common.close")).Width(32).Clicked() {
					a.preview.open = false
				}
			})
			cat := fileCategory(it.Extension, it.MimeType)
			zoomable := cat == "image" || cat == "video"
			box := ui.Box(c).Grow(1).FillWidth().Background(ui.RGBA(0, 0, 0, 0.55)).Radius(10).Clip().
				HandleInput(func(ev ui.InputEvent) bool { return a.previewInput(ev, zoomable) })
			box.Children(func() {
				if bmp := a.previewBitmap(it); bmp != nil && zoomable {
					bw, bh := bmp.Size()
					a.preview.naturalW, a.preview.naturalH = float32(bw), float32(bh)
					z := a.preview.zoom
					if z <= 0 {
						z = 1
					}
					ui.Image(c, bmp).Fill().Fit(ui.ScaleDown).
						TransformOrigin(0.5, 0.5).
						Transform(ui.Scaling(z, z).Then(ui.Translation(a.preview.panX, a.preview.panY)))
					if cat == "video" || cat == "audio" {
						ui.Text(c, a.t("native.cover.only.use.open.for.playback")).
							FontSize(11).TextColor(ui.Hex("#ffffff")).Padding(3, 8).Radius(5).
							Background(ui.RGBA(0, 0, 0, 0.6)).Attach(ui.AnchorBottomLeft, ui.AnchorBottomLeft).Left(12).Bottom(12)
					}
				} else if a.previewFailed(it) {
					ui.Column(c).Fill().Center().Gap(8).Children(func() {
						ui.Text(c, extensionLabel(it.Extension)).FontSize(32).Bold().TextColor(t.TextMuted)
						ui.Text(c, a.t("native.open.this.file.with.its.default.app")).FontSize(12).TextColor(t.TextMuted)
					})
				} else if zoomable {
					ui.Column(c).Fill().Center().Gap(10).Children(func() {
						if it.DominantColor != "" {
							ui.Box(c).Size(160, 120).Radius(10).Background(mustHex(it.DominantColor))
						}
						ui.Spinner(c)
						ui.Text(c, a.t("native.loading.preview")).FontSize(12).TextColor(t.TextMuted)
					})
				} else {
					ui.Column(c).Fill().Center().Gap(8).Children(func() {
						ui.Text(c, extensionLabel(it.Extension)).FontSize(32).Bold().TextColor(t.TextMuted)
						ui.Text(c, a.t("native.no.in.app.preview.for.this.file.type")).FontSize(12).TextColor(t.TextMuted)
					})
				}
			})
			if r := box.Bounds(); r.W > 0 {
				a.preview.boxW, a.preview.boxH = r.W, r.H
			}
			ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
				if ui.Button(c, "‹").Label(a.t("native.previous")).Width(36).Clicked() {
					a.previewStep(-1)
				}
				if ui.Button(c, "›").Label(a.t("native.next")).Width(36).Clicked() {
					a.previewStep(1)
				}
				ui.Text(c, fmt.Sprintf("%s · %dx%d · %s", strings.ToUpper(it.Extension), it.Width, it.Height, formatBytes(it.Size, 1))).
					FontSize(11).TextColor(t.TextMuted)
				if zoomable {
					if ui.Button(c, a.t("zoom.fitToWindow")).Clicked() {
						a.previewResetZoom()
					}
					if ui.Button(c, "1:1").Clicked() {
						a.previewOneToOne()
					}
					z := a.preview.zoom
					if z <= 0 {
						z = 1
					}
					if z == 1 {
						ui.Text(c, a.t("native.fit")).FontSize(11).TextColor(t.TextMuted)
					} else if fit := a.previewFitScale(); fit > 0 {
						ui.Textf(c, "%d%%", int(z*fit*100)).FontSize(11).TextColor(t.TextMuted)
					}
				}
				ui.Spacer(c)
				if ui.Button(c, a.t("native.reveal")).Clicked() {
					a.revealSelected()
				}
				if ui.PrimaryButton(c, a.t("native.open")).Clicked() {
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

// previewBitmap returns the preview bitmap, animating GIFs.
func (a *App) previewFailed(it *core.Item) bool {
	if isAnimatedGIF(it) {
		return a.gifs.hasFailed(gifKey(it, 1600))
	}
	return a.previews.hasFailed(it.ID)
}

func (a *App) previewBitmap(it *core.Item) *ui.Bitmap {
	if isAnimatedGIF(it) {
		return a.gifFrame(it, 1600, true)
	}
	return a.previewImage(it)
}

func (a *App) previewFitScale() float32 {
	if a.preview.boxW <= 0 || a.preview.boxH <= 0 || a.preview.naturalW <= 0 || a.preview.naturalH <= 0 {
		return 1
	}
	sx := a.preview.boxW / a.preview.naturalW
	sy := a.preview.boxH / a.preview.naturalH
	if sx > 1 {
		sx = 1
	}
	if sy > 1 {
		sy = 1
	}
	if sx < sy {
		return sx
	}
	return sy
}

func (a *App) previewResetZoom() {
	a.preview.zoom = 1
	a.preview.panX, a.preview.panY = 0, 0
}

func (a *App) previewOneToOne() {
	if fit := a.previewFitScale(); fit > 0 {
		a.preview.zoom = 1 / fit
	} else {
		a.preview.zoom = 1
	}
	a.preview.panX, a.preview.panY = 0, 0
}

// previewInput zooms with the wheel, pans with a drag, and toggles between
// fit and 1:1 on a double click. True magnify gestures are not delivered by
// mygo's macOS backend, so the wheel, and Cmd/Ctrl with it, is the closest
// equivalent.
func (a *App) previewInput(ev ui.InputEvent, zoomable bool) bool {
	if !zoomable {
		return false
	}
	switch ev.Kind {
	case ui.InputScroll:
		old := a.preview.zoom
		if old <= 0 {
			old = 1
		}
		factor := float32(math.Exp(float64(-ev.DY) * 0.0022))
		z := old * factor
		if z < 0.1 {
			z = 0.1
		}
		if z > 16 {
			z = 16
		}
		// Keep the point under the pointer still.
		cx, cy := a.preview.boxW/2, a.preview.boxH/2
		px := (ev.X - cx - a.preview.panX) / old
		py := (ev.Y - cy - a.preview.panY) / old
		a.preview.zoom = z
		a.preview.panX = ev.X - cx - px*z
		a.preview.panY = ev.Y - cy - py*z
		return true
	case ui.InputPointerDown:
		if ev.Button != 0 {
			return false
		}
		if ev.Clicks >= 2 {
			if a.preview.zoom > 1.02 || math.Abs(float64(a.preview.panX))+math.Abs(float64(a.preview.panY)) > 0.5 {
				a.previewResetZoom()
			} else {
				a.previewOneToOne()
			}
			return true
		}
		a.preview.dragging = true
		a.preview.lastX, a.preview.lastY = ev.X, ev.Y
		return true
	case ui.InputPointerMove:
		if !a.preview.dragging {
			return false
		}
		a.preview.panX += ev.X - a.preview.lastX
		a.preview.panY += ev.Y - a.preview.lastY
		a.preview.lastX, a.preview.lastY = ev.X, ev.Y
		return true
	case ui.InputPointerUp:
		if a.preview.dragging {
			a.preview.dragging = false
			return true
		}
	}
	return false
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
