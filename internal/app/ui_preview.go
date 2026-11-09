package app

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	"bowerbird/core"
	"bowerbird/internal/player"

	"github.com/egoist/mygo/ui"
	"github.com/egoist/mygo/ui/markdown"
)

// viewPreview is the full-content Quick Look layer. Images render as GPU
// textures with pinch/scroll zoom and pointer panning; Markdown uses the native
// rich text view; audio uses the Go playback kernel; unsupported formats show
// their metadata and open in the default app.
func (a *App) viewPreview(c *ui.Context) {
	p := paletteFor(c.Theme())
	if len(a.items) == 0 {
		a.previewOpen = false
		return
	}
	if a.previewIndex < 0 || a.previewIndex >= len(a.items) {
		a.previewIndex = 0
	}
	item := a.items[a.previewIndex]
	a.activeItem = &item
	ui.Column(c).Fill().Background(ui.RGBA(0, 0, 0, 0.0)).Children(func() {
		a.viewPreviewToolbar(c)
		ui.Box(c).FillWidth().Height(1).Background(p.hairline)
		a.viewPreviewBody(c, item)
	})
}

func (a *App) viewPreviewToolbar(c *ui.Context) {
	p := paletteFor(c.Theme())
	if a.previewIndex < 0 || a.previewIndex >= len(a.items) {
		return
	}
	item := a.items[a.previewIndex]

	ui.Row(c).FillWidth().Height(headerHeight).PaddingX(14).Gap(8).AlignItems(ui.Center).Children(func() {
		a.iconButton(c, "preview-close", iconClose, false, a.t("common.close"), a.closePreview)
		ui.Text(c, item.Name).FontSize(13).FontWeight(600).TextColor(p.text).Grow(1).Shrink(1).MinWidth(0).SingleLine()
		ui.Textf(c, "%d / %d", a.previewIndex+1, len(a.items)).FontSize(11).TextColor(p.faint).FontFeatures("tnum")
		a.iconButton(c, "preview-prev", iconBack, false, a.t("preview.previous"), func() { a.movePreview(-1) })
		a.iconButton(c, "preview-next", iconForward, false, a.t("preview.next"), func() { a.movePreview(1) })
		ui.Box(c).Width(1).Height(18).Background(p.hairline)
		a.iconButton(c, "preview-zoom-out", iconZoomOut, false, a.t("header.zoomOut"), func() { a.previewZoom = maxF(a.previewZoom/1.2, 0.2) })
		ui.Textf(c, "%d%%", int(a.previewZoom*100)).FontSize(10.5).TextColor(p.faint).FontFeatures("tnum").Width(40).TextAlign(ui.Center)
		a.iconButton(c, "preview-zoom-in", iconZoomIn, false, a.t("header.zoomIn"), func() { a.previewZoom = minF(a.previewZoom*1.2, 8) })
		a.iconButton(c, "preview-fit", iconGrid, false, a.t("preview.fit"), func() {
			a.previewZoom = 1
			a.previewPan = ui.Point{}
		})
		a.iconButton(c, "preview-open", iconExternal, false, a.t("contextMenu.openWithDefaultApp"), func() {
			_ = a.svc.OpenWithDefaultApp(item.ID)
		})
	})
}

func (a *App) viewPreviewBody(c *ui.Context, item core.Item) {
	p := paletteFor(c.Theme())
	ui.Column(c).Grow(1).Shrink(1).FillWidth().Children(func() {
		ext := strings.ToLower(item.Extension)
		switch {
		case ext == "psd" || ext == "psb":
			if a.nativeFeature("official.psd-preview") {
				a.previewPSD(c, item)
			} else {
				a.previewDocument(c, item)
			}
		case categoryOf(item) == "image":
			a.previewImage(c, item)
		case categoryOf(item) == "audio":
			if a.nativeFeature("official.audio-player") {
				a.previewAudio(c, item)
			} else {
				a.previewDocument(c, item)
			}
		case categoryOf(item) == "video":
			if a.nativeFeature("builtin.video") {
				a.previewVideo(c, item)
			} else {
				a.previewDocument(c, item)
			}
		default:
			a.previewDocument(c, item)
		}
		// Film strip of the current page.
		if len(a.items) > 1 {
			ui.Box(c).FillWidth().Height(1).Background(p.hairline)
			ui.Row(c).FillWidth().Height(64).PaddingX(12).Gap(6).AlignItems(ui.Center).Children(func() {
				start := a.previewIndex - 7
				if start < 0 {
					start = 0
				}
				end := start + 15
				if end > len(a.items) {
					end = len(a.items)
				}
				for i := start; i < end; i++ {
					i := i
					it := a.items[i]
					box := ui.ButtonBase(c.Key(fmt.Sprintf("strip-%s", it.ID))).Width(52).Height(48).Radius(6).Background(p.surface2).Clip().FocusRing(false).KeepFocus()
					if i == a.previewIndex {
						box.Border(2, p.accent)
					}
					path := ""
					if it.HasThumbnail {
						path = filepath.Join(it.ItemPath, "thumbnail.jpg")
					}
					bmp := a.thumbs.get(path, 120)
					box.Children(func() {
						if bmp != nil {
							ui.Image(c, bmp).Fill().Fit(ui.Cover)
						} else {
							ui.Icon(c, categoryIcon(it)).Size(16, 16).TextColor(p.faint)
						}
					})
					if box.Clicked() {
						a.previewIndex = i
						a.activeItem = &a.items[i]
						a.activeItemID = it.ID
						a.previewZoom = 1
						a.previewPan = ui.Point{}
						a.loadPreviewContent()
					}
				}
			})
		}
	})
}

func (a *App) previewImage(c *ui.Context, item core.Item) {
	p := paletteFor(c.Theme())
	ui.Box(c).Fill().Grow(1).Shrink(1).Clip().HandleInput(func(ev ui.InputEvent) bool {
		switch ev.Kind {
		case ui.InputKeyDown:
			if ev.Key == ui.KeySpace || ev.Key == ui.KeyEscape {
				a.closePreview()
				return true
			}
		case ui.InputZoom:
			a.previewZoom = minF(maxF(a.previewZoom*ev.Scale, 0.2), 8)
			return true
		case ui.InputScroll:
			if ev.Mods&ui.Cmd != 0 || ev.Mods&ui.Ctrl != 0 {
				factor := float32(1) - ev.DY*0.01
				a.previewZoom = minF(maxF(a.previewZoom*factor, 0.2), 8)
			} else {
				a.previewPan.X -= ev.DX
				a.previewPan.Y -= ev.DY
			}
			return true
		case ui.InputPointerDown:
			a.previewPanning = true
			a.previewLastX, a.previewLastY = ev.X, ev.Y
			return true
		case ui.InputPointerMove:
			if a.previewPanning {
				a.previewPan.X += ev.X - a.previewLastX
				a.previewPan.Y += ev.Y - a.previewLastY
				a.previewLastX, a.previewLastY = ev.X, ev.Y
			}
			return true
		case ui.InputPointerUp:
			a.previewPanning = false
			return true
		}
		return false
	}).Children(func() {
		path := item.FilePath
		if path == "" && item.HasThumbnail {
			path = filepath.Join(item.ItemPath, "thumbnail.jpg")
		}
		bmp := a.thumbs.get(path, 4096)
		if bmp == nil {
			ui.Column(c).Fill().Center().Children(func() { ui.Spinner(c) })
			return
		}
		ui.Box(c).Fill().Draw(func(pt *ui.Painter, r ui.Rect) {
			// Soft checkerboard behind transparent images.
			cell := float32(14)
			for y := float32(0); y < r.H; y += cell {
				for x := float32(0); x < r.W; x += cell {
					if (int(x/cell)+int(y/cell))%2 == 0 {
						pt.Fill(ui.Rect{X: r.X + x, Y: r.Y + y, W: cell, H: cell}, p.surface.Alpha(0.25), 0)
					}
				}
			}
		}).Children(func() {
			ui.Image(c, bmp).Fill().Fit(ui.Contain).Scale(a.previewZoom, a.previewZoom).Translate(a.previewPan.X, a.previewPan.Y)
		})
	})
	ui.Text(c, fmt.Sprintf("%d × %d · %s · %s", item.Width, item.Height, strings.ToUpper(item.Extension), formatBytes(item.Size))).FontSize(10.5).TextColor(p.faint).TextAlign(ui.Center).PaddingY(6)
}

func (a *App) previewAudio(c *ui.Context, item core.Item) {
	p := paletteFor(c.Theme())
	if a.player == nil && item.FilePath != "" {
		// Do not autoplay; opening is explicit on the play button.
	}
	ui.Column(c).Fill().Grow(1).Center().Gap(18).Children(func() {
		box := ui.Box(c).Size(160, 160).Radius(24).Background(p.surface2).Center().Children(func() {
			ui.Icon(c, iconAudio).Size(64, 64).TextColor(p.muted)
		})
		ui.Box(c).Width(1).Height(1).Children(func() { _ = box })
		ui.Text(c, item.Name).FontSize(17).FontWeight(650).TextColor(p.text).MaxWidth(480).SingleLine()
		// Spectrum bars animate while playing; source is the playhead.
		bars := ui.Row(c).Width(360).Height(54).Gap(3).AlignItems(ui.End).Children
		bars(func() {
			pos := float64(0)
			playing := false
			if a.player != nil {
				pos = a.player.Position().Seconds()
				playing = a.player.Playing()
			}
			for i := 0; i < 36; i++ {
				h := float32(6)
				if playing {
					h = 6 + float32(30*math.Abs(math.Sin(float64(i)*0.7+pos*3)))
				}
				ui.Box(c).Grow(1).Height(h).Radius(2).Background(p.accent.Alpha(0.75))
			}
		})
		ui.Row(c).Width(360).Gap(10).AlignItems(ui.Center).Children(func() {
			if ui.Button(c.Key("audio-play"), map[bool]string{true: "❚❚", false: "▶"}[a.player != nil && a.player.Playing()]).Size(42, 42).Radius(999).Clicked() {
				if a.player == nil {
					go func() {
						pl, err := playerOpen(item.FilePath)
						a.post(func() {
							if err != nil {
								a.showToast(err.Error())
								return
							}
							a.player = pl
							pl.Play()
						})
					}()
				} else {
					a.player.Toggle()
				}
			}
			dur, pos := 0.0, 0.0
			if a.player != nil {
				dur = a.player.Duration().Seconds()
				pos = a.player.Position().Seconds()
			}
			ui.Text(c, formatDuration(pos)).FontSize(10).TextColor(p.faint).FontFeatures("tnum")
			prog := ui.Box(c).Grow(1).Height(6).Radius(3).Background(p.surface2)
			prog.Children(func() {
				if dur > 0 {
					frac := float32(pos / dur)
					ui.Box(c).Width(360 * frac).Height(6).Radius(3).Background(p.accent)
				}
			})
			ui.Text(c, formatDuration(dur)).FontSize(10).TextColor(p.faint).FontFeatures("tnum")
		})
		ui.Text(c, a.t("preview.audioHint")).FontSize(11).TextColor(p.faint)
	})
	if a.player != nil && a.player.Playing() {
		c.After(80 * time.Millisecond)
	}
}

func (a *App) previewVideo(c *ui.Context, item core.Item) {
	p := paletteFor(c.Theme())
	if a.video == nil {
		ui.Column(c).Fill().Grow(1).Center().Gap(14).Children(func() {
			ui.Box(c).Size(120, 120).Radius(22).Background(p.surface2).Center().Children(func() {
				if a.videoErr != "" {
					ui.Icon(c, iconVideo).Size(48, 48).TextColor(p.faint)
				} else {
					ui.Spinner(c)
				}
			})
			ui.Text(c, item.Name).FontSize(16).FontWeight(650).TextColor(p.text)
			if a.videoErr != "" {
				ui.Text(c, a.videoErr).FontSize(11.5).TextColor(p.muted).MaxWidth(520).Wrap().TextAlign(ui.Center)
			} else {
				ui.Text(c, a.t("preview.videoLoading")).FontSize(11.5).TextColor(p.muted)
			}
			ui.Textf(c, "%d × %d · %s", item.Width, item.Height, formatBytes(item.Size)).FontSize(11).TextColor(p.muted)
			if ui.PrimaryButton(c.Key("video-open"), a.t("contextMenu.openWithDefaultApp")).Clicked() {
				_ = a.svc.OpenWithDefaultApp(item.ID)
			}
		})
		return
	}

	ui.Column(c).Fill().Grow(1).Children(func() {
		ui.Box(c).FillWidth().Grow(1).Shrink(1).Background(ui.RGBA(0, 0, 0, 0.86)).Clip().Children(func() {
			ui.Video(c, a.video.Native()).Fill().Fit(ui.Contain)
		})
		ui.Box(c).FillWidth().Height(1).Background(p.hairline)
		ui.Row(c).FillWidth().Height(54).PaddingX(18).Gap(12).AlignItems(ui.Center).Children(func() {
			playing := a.video.Playing()
			label := "▶"
			if playing {
				label = "❚❚"
			}
			if ui.Button(c.Key("video-play"), label).Size(36, 36).Radius(999).Clicked() {
				a.video.Toggle()
			}
			if ui.Button(c.Key("video-back"), "−10s").Height(30).Radius(7).Clicked() {
				_ = a.video.Seek(a.video.Position() - 10*time.Second)
			}
			if ui.Button(c.Key("video-forward"), "+10s").Height(30).Radius(7).Clicked() {
				_ = a.video.Seek(a.video.Position() + 10*time.Second)
			}
			duration := a.video.Duration().Seconds()
			position := a.video.Position().Seconds()
			ui.Text(c, formatDuration(position)).FontSize(10.5).TextColor(p.faint).FontFeatures("tnum")
			if duration > 0 {
				a.videoScrub = position
				seek := ui.Slider(c.Key("video-seek"), &a.videoScrub, 0, duration).Grow(1)
				if seek.Changed() {
					_ = a.video.Seek(time.Duration(a.videoScrub * float64(time.Second)))
				}
			} else {
				ui.Box(c).Grow(1)
			}
			ui.Text(c, formatDuration(duration)).FontSize(10.5).TextColor(p.faint).FontFeatures("tnum")
			if ui.Button(c.Key("video-open"), a.t("contextMenu.openWithDefaultApp")).Height(30).Radius(7).Clicked() {
				_ = a.svc.OpenWithDefaultApp(item.ID)
			}
		})
	})
	if a.video.Playing() {
		c.After(100 * time.Millisecond)
	}
}

func (a *App) previewDocument(c *ui.Context, item core.Item) {
	p := paletteFor(c.Theme())
	ext := strings.ToLower(item.Extension)
	isText := ext == "md" || ext == "markdown" || ext == "txt" || ext == "json" || ext == "js" || ext == "ts" || ext == "go" || ext == "py" || ext == "prompt"
	if isText && a.previewText != "" {
		ui.Scroll(c).Fill().Grow(1).Shrink(1).Padding(28, 48, 28, 48).Children(func() {
			if (ext == "md" || ext == "markdown") && a.nativeFeature("official.markdown-preview") {
				markdown.View(c, a.previewText, nil).MaxWidth(820)
			} else if ext == "prompt" && a.nativeFeature("official.prompt-metadata") {
				markdown.View(c, a.previewText, nil).MaxWidth(820)
			} else {
				ui.Column(c).FillWidth().Gap(4).Children(func() {
					for _, line := range strings.Split(a.previewText, "\n") {
						ui.Text(c, line).FontSize(12).FontFeatures("tnum").TextColor(p.text).Wrap()
					}
				})
			}
		})
		return
	}
	ui.Column(c).Fill().Grow(1).Center().Gap(12).Children(func() {
		ui.Box(c).Size(110, 110).Radius(20).Background(p.surface2).Center().Children(func() {
			ui.Icon(c, categoryIcon(item)).Size(44, 44).TextColor(p.muted)
		})
		ui.Text(c, item.Name).FontSize(16).FontWeight(650).TextColor(p.text)
		ui.Text(c, strings.ToUpper(item.Extension)+" · "+formatBytes(item.Size)).FontSize(11).TextColor(p.muted)
		ui.Row(c).Gap(8).Children(func() {
			if ui.PrimaryButton(c.Key("doc-open"), a.t("contextMenu.openWithDefaultApp")).Clicked() {
				_ = a.svc.OpenWithDefaultApp(item.ID)
			}
			if ui.Button(c, a.t("inspector.reveal")).Clicked() {
				_ = a.svc.RevealInFinder(item.ID)
			}
		})
	})
}

func (a *App) loadPreviewContent() {
	a.closeVideo()
	a.previewText = ""
	a.previewError = ""
	if a.previewIndex < 0 || a.previewIndex >= len(a.items) {
		return
	}
	item := a.items[a.previewIndex]
	a.activeItem = &item
	a.activeItemID = item.ID
	ext := strings.ToLower(item.Extension)
	if ext == "md" || ext == "markdown" || ext == "txt" || ext == "json" || ext == "js" || ext == "ts" || ext == "go" || ext == "py" {
		path := item.FilePath
		a.previewSeq++
		seq := a.previewSeq
		go func() {
			data, err := os.ReadFile(path)
			a.post(func() {
				if seq != a.previewSeq {
					return
				}
				if err != nil {
					a.previewError = err.Error()
				} else {
					a.previewText = string(data)
				}
			})
		}()
	} else if strings.TrimSpace(item.Prompt) != "" && ext == "prompt" {
		a.previewText = item.Prompt
	} else if categoryOf(item) == "video" && a.nativeFeature("builtin.video") {
		path, width, height := item.FilePath, item.Width, item.Height
		seq := a.videoSeq
		go func() {
			v, err := player.OpenVideo(path, width, height)
			a.post(func() {
				if seq != a.videoSeq {
					if v != nil {
						v.Close()
					}
					return
				}
				if err != nil {
					a.videoErr = err.Error()
					return
				}
				a.video = v
			})
		}()
	} else if ext == "psd" || ext == "psb" {
		a.previewBitmap = nil
		a.psdInfo = nil
		path := item.FilePath
		a.previewSeq++
		seq := a.previewSeq
		go func() {
			info, img, err := core.ReadPSD(path)
			a.post(func() {
				if seq != a.previewSeq {
					return
				}
				if err != nil {
					a.previewError = err.Error()
					return
				}
				a.psdInfo = info
				if img != nil {
					a.previewBitmap = ui.NewBitmap(img)
				}
			})
		}()
	}
	a.loadInspector(item.ID)
}

func playerOpen(path string) (*player.Player, error) { return player.Open(path) }

// closeVideo stops the native video player and invalidates any pending open.
func (a *App) closeVideo() {
	a.videoSeq++
	if a.video != nil {
		a.video.Close()
		a.video = nil
	}
	a.videoErr = ""
	a.videoScrub = 0
}

func (a *App) previewPSD(c *ui.Context, item core.Item) {
	p := paletteFor(c.Theme())
	ui.Row(c).Fill().Grow(1).Shrink(1).Children(func() {
		ui.Box(c).Grow(1).Shrink(1).FillHeight().Padding(16).Clip().Children(func() {
			if a.previewBitmap != nil {
				ui.Image(c, a.previewBitmap).Fill().Fit(ui.Contain).Scale(a.previewZoom, a.previewZoom)
			} else if a.previewError != "" {
				ui.Column(c).Fill().Center().Gap(8).Children(func() {
					ui.Icon(c, iconImage).Size(34, 34).TextColor(p.faint)
					ui.Text(c, a.previewError).FontSize(12).TextColor(p.muted)
				})
			} else {
				ui.Column(c).Fill().Center().Children(func() { ui.Spinner(c) })
			}
		})
		ui.Box(c).Width(1).FillHeight().Background(p.hairline)
		ui.Column(c).Width(240).FillHeight().Padding(16).Gap(8).Children(func() {
			a.sectionLabel(c, a.t("inspector.psd"))
			if a.psdInfo != nil {
				a.metaRow(c, a.t("inspector.dimensions"), fmt.Sprintf("%d × %d", a.psdInfo.Width, a.psdInfo.Height))
				a.metaRow(c, a.t("inspector.colorMode"), a.psdInfo.ColorMode)
				a.metaRow(c, "Depth", fmt.Sprintf("%d bit", a.psdInfo.Depth))
				a.metaRow(c, "Channels", fmt.Sprintf("%d", a.psdInfo.Channels))
				a.inspectorDivider(c)
				a.sectionLabel(c, a.t("inspector.layers"))
				ui.Scroll(c).Grow(1).Shrink(1).Children(func() {
					for i, layer := range a.psdInfo.Layers {
						if i > 200 {
							break
						}
						ui.Row(c).FillWidth().Height(24).Gap(6).AlignItems(ui.Center).Children(func() {
							ui.Icon(c, iconEye).Size(12, 12).TextColor(p.faint).Opacity(boolF(layer.Visible, 1, 0.25))
							ui.Text(c, layer.Name).FontSize(11).TextColor(p.text).Grow(1).Shrink(1).SingleLine()
							ui.Textf(c, "%d%%", layer.Opacity).FontSize(9.5).TextColor(p.faint)
						})
					}
				})
			}
		})
	})
}

func boolF(v bool, yes, no float32) float32 {
	if v {
		return yes
	}
	return no
}
