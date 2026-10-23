package core

import (
	"fmt"
	"runtime"
	"strings"
	"unicode"
)

const ShortcutsChangedEvent = "shortcuts-changed"

// Shortcut IDs for every customizable action.
const (
	ShortcutCaptureArea       = "capture-area"
	ShortcutCaptureFullscreen = "capture-fullscreen"
	ShortcutCaptureWindow     = "capture-window"
	ShortcutOpenSettings      = "settings"
	ShortcutLogs              = "logs"
	ShortcutReload            = "reload"
	ShortcutForceReload       = "force-reload"
	ShortcutFullscreen        = "fullscreen"
	ShortcutDevTools          = "devtools"
	ShortcutQuit              = "quit"
	ShortcutCloseWindow       = "close-window"
	ShortcutZoomIn            = "zoom-in"
	ShortcutZoomOut           = "zoom-out"
	ShortcutZoomReset         = "zoom-reset"
)

// ShortcutSettings maps action id -> accelerator (e.g. "Alt+A", "CmdOrCtrl+,").
type ShortcutSettings struct {
	Bindings map[string]string `json:"bindings"`
}

func DefaultShortcutSettings() ShortcutSettings {
	settingsAccel := "CmdOrCtrl+I"
	devtoolsAccel := "CmdOrCtrl+Shift+I"
	if runtime.GOOS == "darwin" {
		settingsAccel = "CmdOrCtrl+,"
		devtoolsAccel = "CmdOrCtrl+Alt+I"
	}
	return ShortcutSettings{
		Bindings: map[string]string{
			ShortcutCaptureArea:       "Alt+A",
			ShortcutCaptureFullscreen: "Alt+S",
			ShortcutCaptureWindow:     "Alt+W",
			ShortcutOpenSettings:      settingsAccel,
			ShortcutLogs:              "CmdOrCtrl+L",
			ShortcutReload:            "CmdOrCtrl+R",
			ShortcutForceReload:       "CmdOrCtrl+Shift+R",
			ShortcutFullscreen:        "F11",
			ShortcutDevTools:          devtoolsAccel,
			ShortcutQuit:              "CmdOrCtrl+Q",
			ShortcutCloseWindow:       "CmdOrCtrl+W",
			ShortcutZoomIn:            "CmdOrCtrl+=",
			ShortcutZoomOut:           "CmdOrCtrl+-",
			ShortcutZoomReset:         "CmdOrCtrl+0",
		},
	}
}

func NormalizeShortcutSettings(in ShortcutSettings) ShortcutSettings {
	out := DefaultShortcutSettings()
	if in.Bindings == nil {
		return out
	}
	for id, accel := range in.Bindings {
		if _, ok := out.Bindings[id]; !ok {
			continue
		}
		norm := NormalizeAccelerator(accel)
		// Empty is an explicit unset — keep it so the action has no shortcut.
		out.Bindings[id] = norm
	}
	return out
}

func ValidateShortcutSettings(in ShortcutSettings) error {
	norm := NormalizeShortcutSettings(in)
	seen := map[string]string{}
	for id, accel := range norm.Bindings {
		if accel == "" {
			continue
		}
		key := strings.ToLower(accel)
		if other, ok := seen[key]; ok {
			return fmt.Errorf("shortcut conflict: %s and %s both use %s", other, id, accel)
		}
		seen[key] = id
	}
	return nil
}

func (s ShortcutSettings) Accelerator(id string) string {
	if s.Bindings != nil {
		if v, ok := s.Bindings[id]; ok {
			return NormalizeAccelerator(v)
		}
	}
	return DefaultShortcutSettings().Bindings[id]
}

// NormalizeAccelerator canonicalizes an accelerator string.
func NormalizeAccelerator(accel string) string {
	accel = strings.TrimSpace(accel)
	if accel == "" {
		return ""
	}
	parts := strings.Split(accel, "+")
	var ctrl, alt, shift, meta bool
	var key string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		low := strings.ToLower(p)
		switch low {
		case "ctrl", "control":
			ctrl = true
		case "cmdorctrl", "cmd", "command", "meta", "super":
			meta = true
		case "alt", "option", "opt":
			alt = true
		case "shift":
			shift = true
		default:
			key = p
		}
	}
	if key == "" {
		return ""
	}
	if len(key) == 1 {
		r := []rune(key)[0]
		if unicode.IsLetter(r) {
			key = strings.ToUpper(key)
		}
	}
	lowKey := strings.ToLower(key)
	switch lowKey {
	case "cmdorctrl", "ctrl", "control", "cmd", "command", "meta", "super", "alt", "option", "shift":
		return ""
	case "comma":
		key = ","
	case "equal", "plus":
		key = "="
	case "minus":
		key = "-"
	}
	var out []string
	if meta {
		out = append(out, "CmdOrCtrl")
	}
	if ctrl && !meta {
		out = append(out, "Ctrl")
	}
	if alt {
		out = append(out, "Alt")
	}
	if shift {
		out = append(out, "Shift")
	}
	out = append(out, key)
	return strings.Join(out, "+")
}

// AcceleratorDisplay returns a human-readable shortcut for the current OS.
func AcceleratorDisplay(accel string) string {
	accel = NormalizeAccelerator(accel)
	if accel == "" {
		return ""
	}
	darwin := runtime.GOOS == "darwin"
	parts := strings.Split(accel, "+")
	var mods []string
	var key string
	for _, p := range parts {
		switch strings.ToLower(p) {
		case "cmdorctrl":
			if darwin {
				mods = append(mods, "⌘")
			} else {
				mods = append(mods, "Ctrl")
			}
		case "ctrl":
			if darwin {
				mods = append(mods, "⌃")
			} else {
				mods = append(mods, "Ctrl")
			}
		case "alt":
			if darwin {
				mods = append(mods, "⌥")
			} else {
				mods = append(mods, "Alt")
			}
		case "shift":
			if darwin {
				mods = append(mods, "⇧")
			} else {
				mods = append(mods, "Shift")
			}
		default:
			key = p
		}
	}
	if darwin {
		return strings.Join(append(mods, key), "")
	}
	if len(mods) == 0 {
		return key
	}
	return strings.Join(append(mods, key), "+")
}

// AcceleratorForMyGo maps stored accelerators onto mygo's syntax.
func AcceleratorForMyGo(accel string) string {
	accel = NormalizeAccelerator(accel)
	accel = strings.ReplaceAll(accel, "CmdOrCtrl", "CmdOrCtrl")
	return accel
}
