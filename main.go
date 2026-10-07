package main

import (
	"embed"
	"log"
	"time"

	"bowerbird/core"

	"github.com/wailsapp/wails/v3/pkg/application"
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
		Title:  "Bowerbird",
		Width:  1280,
		Height: 800,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(6, 7, 15),
		URL:              "/",
	})
	coreMgr.SetWindow(window)
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
