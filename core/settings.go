package core

import "errors"

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

// LanguageChangedEvent is broadcast whenever the language changes so every
// open window (main + settings) can update its translations immediately.
const LanguageChangedEvent = "language-changed"

func isValidLanguage(lang string) bool {
	switch lang {
	case "system", "en", "zh", "zh-CN":
		return true
	default:
		return false
	}
}
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
		return NewAppError(ErrCodeInvalidTheme, "invalid theme: "+theme)
	}

	if s.mgr != nil && s.mgr.userData != nil {
		if err := s.mgr.userData.SetTheme(theme); err != nil {
			return WrapAppError(ErrCodeInvalidTheme, err)
		}
	}

	if h := s.getHost(); h != nil {
		h.ApplyTheme(theme)
	}

	s.emit(ThemeChangedEvent, theme)
	return nil
}

// GetLanguage returns the persisted language code, or an empty string when the user
// has never picked one (letting the frontend fall back to its system/local default).
func (s *Service) GetLanguage() string {
	if s.mgr == nil || s.mgr.userData == nil {
		return ""
	}
	lang := s.mgr.userData.GetLanguage()
	if !isValidLanguage(lang) {
		return ""
	}
	return lang
}

// SetLanguage validates and persists the language preference, then broadcasts the change
// to every open window via the application event bus.
func (s *Service) SetLanguage(language string) error {
	if !isValidLanguage(language) {
		return NewAppError(ErrCodeInvalidLanguage, "invalid language: "+language)
	}

	if s.mgr != nil && s.mgr.userData != nil {
		if err := s.mgr.userData.SetLanguage(language); err != nil {
			return WrapAppError(ErrCodeInvalidLanguage, err)
		}
	}

	s.emit(LanguageChangedEvent, language)
	return nil
}

// LightweightModeChangedEvent is broadcast when the user toggles lightweight mode.
const LightweightModeChangedEvent = "lightweight-mode-changed"

// GetLightweightModeEnabled reports whether idle webviews should be torn down.
func (s *Service) GetLightweightModeEnabled() bool {
	if s.mgr == nil || s.mgr.userData == nil {
		return false
	}
	return s.mgr.userData.GetLightweightModeEnabled()
}

// SetLightweightModeEnabled persists the preference. Disabling it cancels any
// pending idle teardown.
func (s *Service) SetLightweightModeEnabled(enabled bool) error {
	if s.mgr != nil && s.mgr.userData != nil {
		if err := s.mgr.userData.SetLightweightModeEnabled(enabled); err != nil {
			return err
		}
	}
	if !enabled {
		if h := s.getHost(); h != nil {
			h.CancelLightweightIdle()
		}
	}
	s.emit(LightweightModeChangedEvent, enabled)
	return nil
}

// EnterLightweightMode immediately destroys webview windows.
func (s *Service) EnterLightweightMode() {
	if h := s.getHost(); h != nil {
		h.EnterLightweightMode()
	}
}

// OpenSettingsWindow opens the settings UI in its own window. Only a single
// instance is created; later calls simply reveal and focus the existing one.
func (s *Service) OpenSettingsWindow() error {
	host := s.getHost()
	if host == nil {
		return ErrAppNotInitialized
	}

	s.settingsMu.Lock()
	defer s.settingsMu.Unlock()
	return host.OpenWindow(WindowSpec{
		Name:           settingsWindowName,
		Title:          "Settings",
		URL:            "/#/settings",
		Width:          800,
		Height:         650,
		MinWidth:       800,
		MinHeight:      650,
		TitleBarHidden: true,
	})
}

// OpenSettingsWindowWithHost opens or focuses the settings window through a host.
func OpenSettingsWindowWithHost(host Host) error {
	if host == nil {
		return errors.New("application not initialized")
	}
	return host.OpenWindow(WindowSpec{
		Name:           settingsWindowName,
		Title:          "Settings",
		URL:            "/#/settings",
		Width:          800,
		Height:         650,
		MinWidth:       800,
		MinHeight:      650,
		TitleBarHidden: true,
	})
}
