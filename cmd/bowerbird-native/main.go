// Command bowerbird-native is the experimental native renderer: the whole
// desktop UI is drawn by mygo/ui from Go, with no webview, HTML or JavaScript.
package main

import (
	"fmt"
	"log"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	"bowerbird/core"
	"bowerbird/internal/nativeui"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

func main() {
	nativeui.SetProcessStart(time.Now())
	mygo.App.SetName("Bowerbird")
	if !mygo.App.RequestSingleInstanceLock() {
		return
	}

	svc := core.NewService(nil)
	app := nativeui.NewApp(svc)
	host := nativeui.NewHost(app)
	app.SetHost(host)
	core.AttachHost(svc, host)

	var (
		mgr     *core.LibraryManager
		pending []string
		ready   bool
	)

	handleURL := func(raw string) {
		if !ready {
			pending = append(pending, raw)
			return
		}
		app.HandleProtocol(raw)
	}
	mygo.App.OnOpenURL(handleURL)
	mygo.App.OnSecondInstance(func(args []string, workingDir string) {
		for _, arg := range args {
			if strings.HasPrefix(arg, "bowerbird://") {
				handleURL(arg)
			}
		}
		host.FocusMainWindow()
	})
	mygo.App.OnActivate(func(hasVisibleWindows bool) {
		if !hasVisibleWindows {
			host.FocusMainWindow()
		}
	})
	mygo.App.OnWindowAllClosed(func() {
		if runtime.GOOS != "darwin" {
			mygo.App.Quit()
		}
	})
	mygo.App.OnBeforeQuit(func(*mygo.QuitEvent) { host.MarkQuitting() })

	mygo.App.WhenReady(func() {
		mgr = core.NewLibraryManager()
		mgr.SetHost(host)
		core.AttachManager(svc, mgr)
		app.SetManager(mgr)
		app.LoadPersistedSettings()
		core.SetLogHost(host)

		logPath := core.StartAppLogSession(fmt.Sprintf("native os=%s arch=%s", runtime.GOOS, runtime.GOARCH))
		log.Printf("[Native] app log: %s", logPath)

		win := mygo.NewWindow(mygo.WindowOptions{
			Title:     "Bowerbird",
			Width:     1400,
			Height:    900,
			MinWidth:  980,
			MinHeight: 620,
			Content:   ui.View(app.ViewMain),
		})
		host.SetMain(win)
		win.OnClose(func(e *mygo.CloseEvent) {
			if host.Quitting() {
				return
			}
			e.PreventDefault()
			win.Hide()
		})
		win.OnFileDrop(func(e *mygo.FileDropEvent) {
			if len(e.Paths) > 0 {
				app.HandleFileDrop(e.Paths)
			}
		})

		host.SetupMenus()
		host.SetupTray()
		host.RegisterGlobalShortcuts()

		app.Refresh()
		win.Show()
		win.Focus()
		ready = true
		for _, raw := range pending {
			app.HandleProtocol(raw)
		}
		pending = nil

		// Appearance changes redraw every native window.
		mygo.Theme.OnUpdated(func() { app.InvalidateAll() })

		if v, q, cat, layout := os.Getenv("BOWERBIRD_NATIVE_VIEW"), os.Getenv("BOWERBIRD_NATIVE_QUERY"), os.Getenv("BOWERBIRD_NATIVE_CATEGORY"), os.Getenv("BOWERBIRD_NATIVE_LAYOUT"); v != "" || q != "" || cat != "" || layout != "" {
			time.AfterFunc(1200*time.Millisecond, func() { app.DebugConfigure(v, q, cat, layout) })
		}
		if mode := os.Getenv("BOWERBIRD_NATIVE_THEME"); mode != "" {
			time.AfterFunc(1500*time.Millisecond, func() { app.DebugSetTheme(mode) })
		}
		if os.Getenv("BOWERBIRD_NATIVE_SELECT") != "" {
			time.AfterFunc(1500*time.Millisecond, app.DebugSelectFirst)
		}
		if os.Getenv("BOWERBIRD_NATIVE_PREVIEW") != "" {
			time.AfterFunc(1500*time.Millisecond, app.DebugOpenPreview)
		}
		if name := os.Getenv("BOWERBIRD_NATIVE_OPEN"); name != "" {
			switch name {
			case "settings":
				_ = svc.OpenSettingsWindow()
			case "logs":
				_ = svc.OpenLogsWindow()
			case "setup":
				_ = svc.OpenSetupWindow()
			}
			if tab := os.Getenv("BOWERBIRD_NATIVE_SETTINGS_TAB"); tab != "" {
				app.SetSettingsTab(tab)
			}
		}
		if v := os.Getenv("BOWERBIRD_NATIVE_EXIT_AFTER"); v != "" {
			if d, err := time.ParseDuration(v); err == nil && d > 0 {
				time.AfterFunc(d, func() { host.Quit() })
				log.Printf("[NativePerf] will quit after %s", d)
			}
		}
		if shot := os.Getenv("BOWERBIRD_NATIVE_SHOT"); shot != "" {
			delay := 2500 * time.Millisecond
			if v := os.Getenv("BOWERBIRD_NATIVE_SHOT_DELAY_MS"); v != "" {
				if ms, err := strconv.Atoi(v); err == nil {
					delay = time.Duration(ms) * time.Millisecond
				}
			}
			time.AfterFunc(delay, func() {
				target := win
				if name := os.Getenv("BOWERBIRD_NATIVE_SHOT_WINDOW"); name != "" {
					if w := host.Window(name); w != nil {
						target = w
					}
				}
				png, err := target.CapturePage()
				if err != nil {
					log.Printf("[NativeShot] %v", err)
					return
				}
				if err := os.WriteFile(shot, png, 0o644); err != nil {
					log.Printf("[NativeShot] %v", err)
					return
				}
				log.Printf("[NativeShot] wrote %s", shot)
			})
		}
	})

	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
}
