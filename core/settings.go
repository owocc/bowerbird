package core

import (
	"errors"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// Colour modes understood by the application. They mirror the values stored in
// `UserData.Theme` and persisted by the frontend under the "bowerbird-ui-theme"
// localStorage key, so a value written by either side is always valid.
const (
	ThemeDark   = "dark"
	ThemeLight  = "light"
	ThemeSystem = "system"
)

// settingsWindowName is the stable identifier of the single settings window.
// It is used to reuse an already-open window instead of spawning duplicates.
const settingsWindowName = "settings"

// ThemeChangedEvent is broadcast whenever the colour mode changes so every
// open window (main + settings) can restyle itself immediately.
const ThemeChangedEvent = "theme-changed"

func isValidTheme(theme string) bool {
	switch theme {
	case ThemeDark, ThemeLight, ThemeSystem:
		return true
	default:
		return false
	}
}

// GetTheme returns the persisted colour mode, or an empty string when the user
// has never picked one (letting the frontend fall back to its local default).
func (s *Service) GetTheme() string {
	if s.mgr == nil || s.mgr.userData == nil {
		return ""
	}
	theme := s.mgr.userData.GetTheme()
	if !isValidTheme(theme) {
		return ""
	}
	return theme
}

// SetTheme validates and persists the colour mode, then broadcasts the change
// to every open window via the application event bus.
func (s *Service) SetTheme(theme string) error {
	if !isValidTheme(theme) {
		return errors.New("invalid theme: " + theme)
	}

	if s.mgr != nil && s.mgr.userData != nil {
		if err := s.mgr.userData.SetTheme(theme); err != nil {
			return err
		}
	}

	if app := s.getApp(); app != nil {
		app.Event.Emit(ThemeChangedEvent, theme)
	}
	return nil
}

// OpenSettingsWindow opens the settings UI in its own window. Only a single
// instance is created; later calls simply reveal and focus the existing one.
func (s *Service) OpenSettingsWindow() error {
	app := s.getApp()
	if app == nil {
		return errors.New("application not initialized")
	}

	s.settingsMu.Lock()
	defer s.settingsMu.Unlock()

	if existing, ok := app.Window.GetByName(settingsWindowName); ok {
		existing.Show()
		existing.Focus()
		return nil
	}

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             settingsWindowName,
		Title:            "Settings",
		URL:              "/#/settings",
		Width:            520,
		Height:           460,
		MinWidth:         420,
		MinHeight:        340,
		BackgroundColour: application.NewRGB(6, 7, 15),
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 54,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
	})
	return nil
}
