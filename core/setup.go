package core

import (
	"errors"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// setupWindowName is the stable identifier of the single library setup window.
const setupWindowName = "setup"

// LibraryLifecycle events broadcast whenever a library is mounted or unmounted.
const (
	LibraryOpenedEvent = "library-opened"
	LibraryClosedEvent = "library-closed"
)

var setupWindowMu sync.Mutex

// OpenSetupWindow opens the library setup UI in its own window. Only a single
// instance is created; later calls simply reveal and focus the existing one.
func (s *Service) OpenSetupWindow() error {
	app := s.getApp()
	if app == nil {
		return errors.New("application not initialized")
	}

	setupWindowMu.Lock()
	defer setupWindowMu.Unlock()

	if existing, ok := app.Window.GetByName(setupWindowName); ok {
		existing.Show()
		existing.Focus()
		return nil
	}

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             setupWindowName,
		Title:            "Set up your library",
		URL:              "/#/setup",
		Width:            680,
		Height:           620,
		MinWidth:         560,
		MinHeight:        520,
		BackgroundColour: application.NewRGB(6, 7, 15),
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 54,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
	})
	return nil
}

// CloseSetupWindow destroys or closes the library setup window if currently open.
func (s *Service) CloseSetupWindow() error {
	app := s.getApp()
	if app == nil {
		return nil
	}

	setupWindowMu.Lock()
	defer setupWindowMu.Unlock()

	if existing, ok := app.Window.GetByName(setupWindowName); ok {
		existing.Close()
	}
	return nil
}
