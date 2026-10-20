package core

import (
	"errors"
	"sync"
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
	host := s.getHost()
	if host == nil {
		return errors.New("application not initialized")
	}

	setupWindowMu.Lock()
	defer setupWindowMu.Unlock()

	return host.OpenWindow(WindowSpec{
		Name:           setupWindowName,
		Title:          "Set up your library",
		URL:            "/#/setup",
		Width:          680,
		Height:         620,
		MinWidth:       560,
		MinHeight:      520,
		TitleBarHidden: true,
	})
}

// CloseSetupWindow destroys or closes the library setup window if currently open.
func (s *Service) CloseSetupWindow() error {
	host := s.getHost()
	if host == nil {
		return nil
	}

	setupWindowMu.Lock()
	defer setupWindowMu.Unlock()

	host.CloseWindow(setupWindowName)
	return nil
}
