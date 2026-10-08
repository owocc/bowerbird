package main

import (
	"embed"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
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

func init() {
	// Register a custom event whose associated data type is string.
	application.RegisterEvent[string]("time")
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

func main() {
	// Initialize core library manager and service
	coreMgr := core.NewLibraryManager()
	coreService := core.NewService(coreMgr)

	app := application.New(application.Options{
		Name:        "bowerbird",
		Description: "Bowerbird Asset Manager",
		Services: []application.Service{
			application.NewService(&GreetService{}),
			application.NewService(coreService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	coreMgr.SetApp(app)
	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:          "Bowerbird",
		Width:          1280,
		Height:         800,
		MinWidth:       900,
		MinHeight:      600,
		EnableFileDrop: true,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 54,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(6, 7, 15),
		URL:              "/",
	})
	coreMgr.SetWindow(window)

	// Listen for native OS file drops (macOS Finder / Windows Explorer)
	window.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		files := event.Context().DroppedFiles()
		details := event.Context().DropTargetDetails()
		log.Printf("[NativeDrop] WindowFilesDropped received %d files: %v, details: %+v", len(files), files, details)
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

		// 1. Handle internal item drag-and-drop (Move to folder)
		if len(internalItemIDs) > 0 {
			if targetType == "folder" && targetFolderID != "" {
				for _, itID := range internalItemIDs {
					_ = coreMgr.MoveItemToFolder(itID, "", targetFolderID)
				}
				log.Printf("[NativeDrop] successfully moved %d internal items to folder %s", len(internalItemIDs), targetFolderID)
				app.Event.Emit("library-items-updated", len(internalItemIDs))
			} else if targetType == "trash" {
				for _, itID := range internalItemIDs {
					_ = coreMgr.MoveToTrash(itID)
				}
				log.Printf("[NativeDrop] successfully moved %d internal items to trash", len(internalItemIDs))
				app.Event.Emit("library-items-updated", len(internalItemIDs))
			} else if targetType == "all" {
				for _, itID := range internalItemIDs {
					_ = coreMgr.MoveItemToFolder(itID, "", "")
				}
				log.Printf("[NativeDrop] successfully unlinked %d internal items to all", len(internalItemIDs))
				app.Event.Emit("library-items-updated", len(internalItemIDs))
			} else {
				log.Printf("[NativeDrop] internal items dropped on non-folder target (%s), ignored", targetType)
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
				log.Printf("[NativeDrop] sidebar drop rejected: no folders in dropped files")
				app.Event.Emit("import-error", "The sidebar only accepts dropped folders")
				return
			}

			app.Event.Emit("import-started", map[string]any{
				"total": len(folderPaths),
			})

			go func() {
				created, err := coreMgr.ImportFoldersRecursively(folderPaths, targetFolderID)
				if err != nil {
					log.Printf("[NativeDrop] error importing folders recursively: %v", err)
					app.Event.Emit("import-error", err.Error())
				} else {
					log.Printf("[NativeDrop] successfully imported %d folders recursively", len(created))
					app.Event.Emit("import-completed", map[string]any{
						"count": len(created),
					})
					app.Event.Emit("library-items-updated", len(created))
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
				log.Printf("[NativeDrop] error importing files: %v", err)
				app.Event.Emit("import-error", err.Error())
			} else {
				log.Printf("[NativeDrop] successfully imported %d files", len(imported))
				var ids []string
				for _, it := range imported {
					ids = append(ids, it.ID)
				}
				app.Event.Emit("import-completed", map[string]any{
					"count": len(imported),
					"ids":   ids,
				})
				app.Event.Emit("library-items-updated", len(imported))
			}
		}()
	})
	// Background ticker event
	go func() {
		for {
			now := time.Now().Format(time.RFC1123)
			app.Event.Emit("time", now)
			time.Sleep(time.Second)
		}
	}()

	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
