package nativeui

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"log"
	"sync"
	"sync/atomic"

	"bowerbird/core"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

// appHost implements core.Host with native mygo windows.
type appHost struct {
	app *App

	mu      sync.RWMutex
	windows map[string]*mygo.Window
	main    *mygo.Window
	tray    *mygo.Tray
	quit    atomic.Bool
}

// NewHost builds the native shell around app.
func NewHost(app *App) *appHost {
	return &appHost{app: app, windows: map[string]*mygo.Window{}}
}

// SetMain records the main workspace window.
func (h *appHost) SetMain(w *mygo.Window) {
	h.mu.Lock()
	h.main = w
	h.windows["main"] = w
	h.mu.Unlock()
	h.app.setWindow(w)
}

// Window returns an open named window, if any.
func (h *appHost) Window(name string) *mygo.Window {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.windows[name]
}

func (h *appHost) Main() *mygo.Window {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.main
}

func (h *appHost) Quitting() bool { return h.quit.Load() }

func (h *appHost) MarkQuitting() { h.quit.Store(true) }

// Emit receives core's events and folds them into the native model.
func (h *appHost) Emit(name string, payload any) {
	switch name {
	case core.LibraryOpenedEvent:
		if lib, ok := payload.(*core.LibraryInfo); ok && lib != nil {
			h.app.update(func() {
				h.app.lib = lib
				h.app.refreshAll()
				h.app.host.invalidateAll()
			})
			return
		}
		h.app.update(func() { h.app.refreshAll() })
	case core.LibraryClosedEvent:
		h.app.update(func() {
			h.app.lib = nil
			h.app.items = nil
			h.app.trash = nil
			h.app.visibleSet = false
			h.app.selectedIndex = -1
			h.app.selectedID = ""
			h.app.selection.Clear()
			h.app.loading = false
			h.app.host.invalidateAll()
			h.app.maybeOpenSetup()
		})
	case core.LogEntryEvent:
		if e, ok := payload.(core.LogEntry); ok {
			h.app.updateNamed("logs", func() {
				h.app.logs = append(h.app.logs, e)
				if len(h.app.logs) > 2000 {
					h.app.logs = append([]core.LogEntry(nil), h.app.logs[len(h.app.logs)-2000:]...)
				}
			})
		}
	case core.LogsClearedEvent:
		h.app.updateNamed("logs", func() {
			h.app.logs = nil
		})
	case core.ThemeChangedEvent, core.LanguageChangedEvent, core.NetworkSettingsChangedEvent:
		h.app.update(func() {
			if name == core.ThemeChangedEvent {
				if s, ok := payload.(string); ok && s != "" {
					h.app.themeMode = s
				}
			}
			if name == core.LanguageChangedEvent {
				if s, ok := payload.(string); ok {
					h.app.language = s
				}
				h.rebuildTrayMenu()
			}
			h.rebuildAll()
		})
	case "import-started":
		if m, ok := payload.(map[string]any); ok {
			h.app.update(func() {
				h.app.importing = true
				h.app.importCur = 0
				h.app.importTotal = asInt(m["total"])
				h.app.host.invalidateAll()
			})
		}
	case "import-progress":
		if m, ok := payload.(map[string]any); ok {
			h.app.update(func() {
				h.app.importCur = asInt(m["current"])
				h.app.importTotal = asInt(m["total"])
				h.app.importing = true
				h.app.host.invalidateAll()
			})
		}
	case "import-completed":
		h.app.update(func() {
			h.app.importing = false
			h.app.importCur, h.app.importTotal = 0, 0
			h.app.thumbs.reset()
			h.app.refreshAll()
			h.app.host.invalidateAll()
		})
	case "import-error":
		h.app.update(func() {
			h.app.importing = false
			if s, ok := payload.(string); ok {
				h.app.pendingToast = s
			}
			h.app.host.invalidateAll()
		})
	case "library-items-upserted", "library-items-trashed", "library-items-updated", "plugin:changed":
		h.app.update(func() {
			h.app.refreshItems()
			h.app.host.invalidateAll()
		})
	}
}

func asInt(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int64:
		return int(n)
	case float64:
		return int(n)
	case float32:
		return int(n)
	}
	return 0
}

func (h *appHost) OpenWindow(spec core.WindowSpec) error {
	h.mu.Lock()
	if w := h.windows[spec.Name]; w != nil {
		h.mu.Unlock()
		w.Show()
		w.Focus()
		return nil
	}
	h.mu.Unlock()

	var content *ui.Content
	switch spec.Name {
	case "setup":
		h.app.prepareSetup()
		content = ui.View(h.app.viewSetup)
	case "settings":
		h.app.loadSettings()
		content = ui.View(h.app.viewSettings)
	case "logs":
		h.app.loadLogs()
		content = ui.View(h.app.viewLogs)
	default:
		return fmt.Errorf("native host: unknown window %q", spec.Name)
	}

	w := mygo.NewWindow(mygo.WindowOptions{
		Title:     spec.Title,
		Width:     spec.Width,
		Height:    spec.Height,
		MinWidth:  spec.MinWidth,
		MinHeight: spec.MinHeight,
		Content:   content,
	})

	h.mu.Lock()
	if existing := h.windows[spec.Name]; existing != nil {
		h.mu.Unlock()
		w.Destroy()
		existing.Show()
		existing.Focus()
		return nil
	}
	h.windows[spec.Name] = w
	h.mu.Unlock()

	name := spec.Name
	w.OnClosed(func() {
		h.mu.Lock()
		if h.windows[name] == w {
			delete(h.windows, name)
		}
		h.mu.Unlock()
	})
	return nil
}

func (h *appHost) FocusWindow(name string) bool {
	h.mu.RLock()
	w := h.windows[name]
	h.mu.RUnlock()
	if w == nil {
		return false
	}
	w.Show()
	w.Focus()
	return true
}

func (h *appHost) CloseWindow(name string) {
	h.mu.RLock()
	w := h.windows[name]
	h.mu.RUnlock()
	if w != nil {
		w.Close()
	}
}

func (h *appHost) FocusMainWindow() {
	w := h.Main()
	if w == nil {
		return
	}
	w.Show()
	w.Restore()
	w.Focus()
	mygo.App.Focus()
}

func (h *appHost) OpenDirectory(title string) (string, error) {
	paths, err := mygo.Dialog.Open(mygo.OpenDialogOptions{
		Title:             title,
		Directory:         true,
		CreateDirectories: true,
	})
	if err != nil || len(paths) == 0 {
		return "", err
	}
	return paths[0], nil
}

func (h *appHost) ShowAbout() {
	mygo.App.ShowAboutPanel(mygo.AboutPanelOptions{
		ApplicationName:    "Bowerbird",
		ApplicationVersion: "1.0.0-alpha-1",
		Copyright:          "© 2026, owocc",
		Credits:            "Bowerbird Asset Manager — native UI",
	})
}

func (h *appHost) Quit() {
	h.quit.Store(true)
	mygo.App.Quit()
}

func (h *appHost) RunOnMain(fn func()) { mygo.RunOnMain(fn) }

func (h *appHost) NativeWindowHandle() uintptr {
	w := h.Main()
	if w == nil || w.IsDestroyed() {
		return 0
	}
	return w.NativeHandle()
}

func (h *appHost) WriteFilesToClipboard(paths []string) error {
	if len(paths) == 0 {
		return fmt.Errorf("no files to copy")
	}
	return mygo.Clipboard.WriteFiles(paths...)
}

func (h *appHost) WriteTextToClipboard(text string) error {
	mygo.Clipboard.WriteText(text)
	return nil
}

// rebuildAll nudges every window to build a frame, for theme and language
// changes that every view reads.
func (h *appHost) rebuildAll() {
	h.mu.RLock()
	wins := make([]*mygo.Window, 0, len(h.windows))
	for _, w := range h.windows {
		wins = append(wins, w)
	}
	h.mu.RUnlock()
	for _, w := range wins {
		h.app.nudgeRepaint(w)
	}
}

func (h *appHost) invalidateAll() {
	h.mu.RLock()
	wins := make([]*mygo.Window, 0, len(h.windows))
	for _, w := range h.windows {
		wins = append(wins, w)
	}
	h.mu.RUnlock()
	for _, w := range wins {
		w.Invalidate()
	}
}

// trayIconPNG draws a simple 32px Bowerbird mark so the binary does not need
// to embed the app icon.
func trayIconPNG() []byte {
	img := image.NewRGBA(image.Rect(0, 0, 32, 32))
	bg := color.RGBA{R: 0x63, G: 0x66, B: 0xf1, A: 0xff}
	fg := color.RGBA{R: 0xff, G: 0xff, B: 0xff, A: 0xff}
	for y := 0; y < 32; y++ {
		for x := 0; x < 32; x++ {
			dx, dy := x-16, y-16
			if dx*dx+dy*dy <= 14*14 {
				img.SetRGBA(x, y, bg)
			}
		}
	}
	// A small white "B" made of blocks.
	for _, r := range []image.Rectangle{
		image.Rect(11, 8, 14, 24), image.Rect(14, 8, 21, 11), image.Rect(14, 14, 20, 17),
		image.Rect(14, 21, 21, 24), image.Rect(20, 10, 22, 14), image.Rect(19, 17, 21, 21),
	} {
		for y := r.Min.Y; y < r.Max.Y; y++ {
			for x := r.Min.X; x < r.Max.X; x++ {
				img.SetRGBA(x, y, fg)
			}
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		log.Printf("[NativeUI] tray icon: %v", err)
		return nil
	}
	return buf.Bytes()
}
