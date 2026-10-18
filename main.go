package main

import (
	"embed"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"bowerbird/core"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// Wails uses Go's `embed` package to embed the frontend files into the binary.
// Any files in the frontend/dist folder will be embedded into the binary and
// made available to the frontend.
// See https://pkg.go.dev/embed for more information.

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

func init() {
	// Register a custom event whose associated data type is string.
	application.RegisterEvent[string]("time")
	// Broadcast colour mode changes to every open window.
	application.RegisterEvent[string](core.ThemeChangedEvent)
	// Broadcast library lifecycle events
	application.RegisterEvent[*core.LibraryInfo](core.LibraryOpenedEvent)
	application.RegisterEvent[string](core.LibraryClosedEvent)
	// Broadcast structured diagnostic log events
	application.RegisterEvent[core.LogEntry](core.LogEntryEvent)
	application.RegisterEvent[string](core.LogsClearedEvent)
	// Broadcast plugin install request & lifecycle events
	application.RegisterEvent[map[string]any]("plugin:install-requested")
	application.RegisterEvent[map[string]any]("plugin:changed")
}

func extractInternalItemID(filePath string) string {
	clean := filepath.Clean(filePath)
	parts := strings.Split(clean, string(filepath.Separator))
	for i, part := range parts {
		if part == "items" && i+1 < len(parts) && len(parts[i+1]) == 64 {
			return parts[i+1]
		}
	}
	return ""
}

func parseProtocolURL(rawURL string) (manifestURL, id, version, name string, ok bool) {
	if !strings.HasPrefix(rawURL, "bowerbird://") {
		return "", "", "", "", false
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", "", "", "", false
	}
	combined := strings.Trim(u.Host+u.Path, "/")
	if combined != "plugin/install" && !strings.HasPrefix(combined, "plugin/install") {
		return "", "", "", "", false
	}
	q := u.Query()
	manifestURL = q.Get("manifest")
	if manifestURL == "" {
		manifestURL = q.Get("manifestUrl")
	}
	if manifestURL == "" {
		manifestURL = q.Get("url")
	}
	id = q.Get("id")
	version = q.Get("version")
	name = q.Get("name")
	return manifestURL, id, version, name, true
}

func handleProtocolURL(rawURL string, app *application.App, coreMgr *core.LibraryManager) {
	manifestURL, id, version, name, ok := parseProtocolURL(rawURL)
	if !ok {
		return
	}
	log.Printf("[Protocol] plugin install requested: id=%s version=%s manifest=%s", id, version, manifestURL)
	if coreMgr != nil && coreMgr.GetPluginManager() != nil {
		coreMgr.GetPluginManager().SetPendingInstall(&core.PluginInstallRequest{
			ManifestURL: manifestURL,
			ID:          id,
			Version:     version,
			Name:        name,
		})
	}
	if app != nil {
		_ = core.OpenSettingsWindowWithApp(app)
		app.Event.Emit("plugin:install-requested", map[string]any{
			"manifestUrl": manifestURL,
			"id":          id,
			"version":     version,
			"name":        name,
		})
	}
}

func main() {
	// Initialize core library manager and service
	coreMgr := core.NewLibraryManager()
	coreService := core.NewService(coreMgr)

	// Native drag/drop tracing. Production Windows builds link with
	// `-H windowsgui`, so stdout is invisible there and drag-debug.log is the
	// real sink; the path is also printed for `wails3 dev`.
	sessionContext := fmt.Sprintf("os=%s arch=%s", runtime.GOOS, runtime.GOARCH)
	logPath := core.StartAppLogSession(sessionContext)
	log.Printf("[AppLog] log file: %s", logPath)
	tracePath := core.StartDragTraceSession(sessionContext)
	log.Printf("[DragTrace] drag trace file: %s", tracePath)
	app := application.New(application.Options{
		Name:        "bowerbird",
		Description: "Bowerbird Asset Manager",
		Icon:        appIcon,
		Services: []application.Service{
			application.NewService(&GreetService{}),
			application.NewService(coreService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
	})

	coreMgr.SetApp(app)
	core.SetLogApp(app)

	// Only macOS registers a native menu: its menu bar is global, OS-styled and
	// fully controllable. Windows and Linux draw the menu themselves instead
	// (frontend AppMenuButton, fed by core.GetAppMenu) so the two platforms look
	// identical and no window ends up with two menus.
	if runtime.GOOS == "darwin" {
		app.Menu.SetApplicationMenu(core.BuildNativeAppMenu("Bowerbird", func(action string) {
			if err := coreService.InvokeAppMenu(action); err != nil {
				log.Printf("[Menu] %v", err)
			}
		}))
	}

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:          "Bowerbird",
		Width:          1280,
		Height:         800,
		MinWidth:       900,
		MinHeight:      600,
		EnableFileDrop: true,
		Mac: application.MacWindow{
			Backdrop: application.MacBackdropTranslucent,
			TitleBar: application.MacTitleBarHiddenInset,
		},
		// Windows and Linux get no native menu - they render the app's own ≡
		// button from core.GetAppMenu. The zero value is ignored on macOS.
		BackgroundColour: application.NewRGB(6, 7, 15),
		URL:              "/",
	})
	coreMgr.SetWindow(window)
	// Intercept window close so the menu bar / tray icon stays alive
	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		event.Cancel()
		window.Hide()
	})
	// Set up menu bar / system tray display
	tray := app.SystemTray.New()
	tray.SetIcon(appIcon)
	tray.SetTooltip("Bowerbird")

	isZh := coreService.GetLanguage() == "zh"
	trayMenu := core.BuildTrayMenu("Bowerbird", isZh, func(action string) {
		if action == core.AppMenuOpenMainWindow {
			window.Show().Focus()
			return
		}
		if err := coreService.InvokeAppMenu(action); err != nil {
			log.Printf("[TrayMenu] %v", err)
		}
	})
	tray.SetMenu(trayMenu)
	tray.OnDoubleClick(func() {
		window.Show().Focus()
	})

	// Listen for language changes to update tray menu localization
	app.Event.On(core.LanguageChangedEvent, func(event *application.CustomEvent) {
		lang, _ := event.Data.(string)
		tray.SetMenu(core.BuildTrayMenu("Bowerbird", lang == "zh", func(action string) {
			if action == core.AppMenuOpenMainWindow {
				window.Show().Focus()
				return
			}
			if err := coreService.InvokeAppMenu(action); err != nil {
				log.Printf("[TrayMenu] %v", err)
			}
		}))
	})

	// Register global shortcuts for screen capture (Option+A/S/W on Mac, Alt+A/S/W on Windows/Linux)
	if err := app.GlobalShortcut.Register("OptionOrAlt+A", func() {
		if _, err := coreService.CaptureArea(); err != nil {
			log.Printf("[Capture] Area capture error: %v", err)
		}
	}); err != nil {
		log.Printf("[GlobalShortcut] OptionOrAlt+A registration error: %v", err)
	}

	if err := app.GlobalShortcut.Register("OptionOrAlt+S", func() {
		if _, err := coreService.CaptureFullscreen(); err != nil {
			log.Printf("[Capture] Fullscreen capture error: %v", err)
		}
	}); err != nil {
		log.Printf("[GlobalShortcut] OptionOrAlt+S registration error: %v", err)
	}

	if err := app.GlobalShortcut.Register("OptionOrAlt+W", func() {
		if _, err := coreService.CaptureWindow(); err != nil {
			log.Printf("[Capture] Window capture error: %v", err)
		}
	}); err != nil {
		log.Printf("[GlobalShortcut] OptionOrAlt+W registration error: %v", err)
	}

	// Handle protocol URLs from command-line arguments (Windows/Linux or initial launch)
	for _, arg := range os.Args[1:] {
		if strings.HasPrefix(arg, "bowerbird://") {
			handleProtocolURL(arg, app, coreMgr)
		}
	}

	// Handle protocol URLs dispatched via OS URL scheme (macOS Apple Events / Common URL launch)
	app.Event.OnApplicationEvent(events.Common.ApplicationLaunchedWithUrl, func(event *application.ApplicationEvent) {
		urlStr := event.Context().URL()
		if urlStr != "" {
			handleProtocolURL(urlStr, app, coreMgr)
		}
	})

	// Listen for native OS file drops (macOS Finder / Windows Explorer)
	window.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		files := event.Context().DroppedFiles()
		details := event.Context().DropTargetDetails()
		core.LogDragTrace("native-drop-received", fmt.Sprintf("files=%d paths=%v details=%+v", len(files), files, details))
		window.Focus()
		if len(files) == 0 {
			return
		}

		activeLib := coreMgr.GetActiveLibrary()
		targetType := ""
		targetFolderID := ""
		if details != nil {
			targetType = details.Attributes["data-file-drop-target"]
			targetFolderID = details.Attributes["data-folder-id"]
			if targetType == "" && details.ElementID == "sidebar-panel" {
				targetType = "sidebar"
			}
		}

		// Partition internal library assets vs external files
		var internalItemIDs []string
		var externalFiles []string

		for _, f := range files {
			if strings.TrimSpace(f) == "" {
				continue
			}
			if itID := extractInternalItemID(f); itID != "" {
				internalItemIDs = append(internalItemIDs, itID)
			} else {
				if activeLib != nil && activeLib.Path != "" {
					cleanFile := filepath.Clean(f)
					cleanLibPath := filepath.Clean(activeLib.Path)
					if strings.HasPrefix(strings.ToLower(cleanFile), strings.ToLower(cleanLibPath)) {
						continue
					}
				}
				externalFiles = append(externalFiles, f)
			}
		}

		core.LogDragTrace("native-drop-routing", fmt.Sprintf("target=%s folderID=%s internal=%d external=%d", targetType, targetFolderID, len(internalItemIDs), len(externalFiles)))

		// 1. Handle internal item drag-and-drop (Move to folder)
		if len(internalItemIDs) > 0 {
			if (targetType == "folder" || targetType == "subfolder") && targetFolderID != "" {
				var updatedItems []core.Item
				for _, itID := range internalItemIDs {
					_ = coreMgr.MoveItemToFolder(itID, "", targetFolderID)
					if fullIt, gErr := coreMgr.GetItem(itID); gErr == nil && fullIt != nil {
						updatedItems = append(updatedItems, *fullIt)
					}
				}
				core.LogDragTrace("native-drop", fmt.Sprintf("successfully moved %d internal items to folder %s", len(internalItemIDs), targetFolderID))
				if len(updatedItems) > 0 {
					app.Event.Emit("library-items-upserted", updatedItems)
				} else {
					app.Event.Emit("library-items-updated", len(internalItemIDs))
				}
			} else if targetType == "trash" {
				_ = coreMgr.BatchMoveToTrash(internalItemIDs)
				core.LogDragTrace("native-drop", fmt.Sprintf("successfully moved %d internal items to trash", len(internalItemIDs)))
				app.Event.Emit("library-items-trashed", internalItemIDs)
			} else if targetType == "all" {
				var updatedItems []core.Item
				for _, itID := range internalItemIDs {
					_ = coreMgr.MoveItemToFolder(itID, "", "")
					if fullIt, gErr := coreMgr.GetItem(itID); gErr == nil && fullIt != nil {
						updatedItems = append(updatedItems, *fullIt)
					}
				}
				core.LogDragTrace("native-drop", fmt.Sprintf("successfully unlinked %d internal items to all", len(internalItemIDs)))
				if len(updatedItems) > 0 {
					app.Event.Emit("library-items-upserted", updatedItems)
				} else {
					app.Event.Emit("library-items-updated", len(internalItemIDs))
				}
			} else {
				core.LogDragTrace("native-drop", fmt.Sprintf("internal items dropped on non-folder target (%s), ignored", targetType))
			}
			return
		}

		if len(externalFiles) == 0 {
			return
		}

		// 2. Handle external files/folders drag-and-drop
		isSidebarDrop := targetType == "sidebar" || targetType == "folder"
		if isSidebarDrop {
			// Sidebar drop: strictly only accepts folders!
			var folderPaths []string
			for _, f := range externalFiles {
				if fi, err := os.Stat(f); err == nil && fi.IsDir() {
					folderPaths = append(folderPaths, f)
				}
			}

			if len(folderPaths) == 0 {
				core.LogDragTrace("native-drop", fmt.Sprintf("sidebar drop rejected: no folders in dropped files"))
				app.Event.Emit("import-error", "The sidebar only accepts dropped folders")
				return
			}

			app.Event.Emit("import-started", map[string]any{
				"total": len(folderPaths),
			})

			go func() {
				created, err := coreMgr.ImportFoldersRecursivelyWithProgress(folderPaths, targetFolderID, func(current, total int, filename string) {
					app.Event.Emit("import-progress", map[string]any{
						"current":  current,
						"total":    total,
						"filename": filename,
					})
				})
				if err != nil {
					core.LogDragTrace("native-drop", fmt.Sprintf("error importing folders recursively: %v", err))
					app.Event.Emit("import-error", err.Error())
				} else {
					core.LogDragTrace("native-drop", fmt.Sprintf("successfully imported %d folders recursively", len(created)))
					app.Event.Emit("import-completed", map[string]any{
						"count": len(created),
					})
					app.Event.Emit("library-items-updated", len(created))
				}
			}()
			return
		}
		// 2b. Subfolder card drop in main workspace: import folders recursively or files flat into targetFolderID
		if targetType == "subfolder" && targetFolderID != "" {
			var folderPaths []string
			var filePaths []string
			for _, f := range externalFiles {
				if fi, err := os.Stat(f); err == nil && fi.IsDir() {
					folderPaths = append(folderPaths, f)
				} else {
					filePaths = append(filePaths, f)
				}
			}

			app.Event.Emit("import-started", map[string]any{
				"total": len(externalFiles),
			})

			go func() {
				totalImported := 0
				if len(folderPaths) > 0 {
					created, err := coreMgr.ImportFoldersRecursivelyWithProgress(folderPaths, targetFolderID, func(current, total int, filename string) {
						app.Event.Emit("import-progress", map[string]any{
							"current":  current,
							"total":    total,
							"filename": filename,
						})
					})
					if err != nil {
						app.Event.Emit("import-error", err.Error())
						return
					}
					totalImported += len(created)
				}
				if len(filePaths) > 0 {
					imported, err := coreMgr.ImportFilesWithProgress(filePaths, func(current, total int, filename string) {
						app.Event.Emit("import-progress", map[string]any{
							"current":  current,
							"total":    total,
							"filename": filename,
						})
					})
					if err != nil {
						app.Event.Emit("import-error", err.Error())
						return
					}
					var updatedItems []core.Item
					for _, it := range imported {
						_ = coreMgr.AddItemToFolder(it.ID, targetFolderID)
						if fullIt, gErr := coreMgr.GetItem(it.ID); gErr == nil && fullIt != nil {
							updatedItems = append(updatedItems, *fullIt)
						} else {
							updatedItems = append(updatedItems, it)
						}
					}
					totalImported += len(imported)
					if len(folderPaths) == 0 {
						app.Event.Emit("import-completed", map[string]any{
							"count": totalImported,
							"items": updatedItems,
						})
						return
					}
				}
				if totalImported > 0 {
					app.Event.Emit("import-completed", map[string]any{
						"count": totalImported,
					})
				}
			}()
			return
		}

		// 3. Main workspace drop: flat recursive import
		app.Event.Emit("import-started", map[string]any{
			"total": len(externalFiles),
		})

		go func() {
			imported, err := coreMgr.ImportFilesWithProgress(externalFiles, func(current, total int, filename string) {
				app.Event.Emit("import-progress", map[string]any{
					"current":  current,
					"total":    total,
					"filename": filename,
				})
			})

			if err != nil {
				core.LogDragTrace("native-drop", fmt.Sprintf("error importing files: %v", err))
				app.Event.Emit("import-error", err.Error())
			} else {
				core.LogDragTrace("native-drop", fmt.Sprintf("successfully imported %d files", len(imported)))
				var ids []string
				for _, it := range imported {
					ids = append(ids, it.ID)
				}
				app.Event.Emit("import-completed", map[string]any{
					"count": len(imported),
					"ids":   ids,
					"items": imported,
				})
			}
		}()
	})
	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
