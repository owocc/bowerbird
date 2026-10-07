package main

import (
	"embed"
	"log"
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
		EnableFileDrop: true,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
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
		if len(files) == 0 {
			return
		}

		activeLib := coreMgr.GetActiveLibrary()
		// Filter out internal library files (e.g. from app drags)
		var externalFiles []string
		for _, f := range files {
			if activeLib != nil && activeLib.Path != "" {
				cleanFile := filepath.Clean(f)
				cleanLibPath := filepath.Clean(activeLib.Path)
				if strings.HasPrefix(cleanFile, cleanLibPath) {
					continue // Internal library asset, do not re-import
				}
			}
			externalFiles = append(externalFiles, f)
		}

		if len(externalFiles) == 0 {
			return
		}

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
