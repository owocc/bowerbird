package app

import (
	"strings"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
)

// Windows has no native menu bar in this build, so the app menu's accelerators
// never reach the OS. In-app shortcuts therefore have to be read from the same
// ShortcutSettings the Settings window edits; hardcoding them made Ctrl+I and
// Ctrl+L (the Windows defaults) do nothing while the UI advertised other keys.
func (a *App) shortcutSettings() core.ShortcutSettings {
	if a.svc != nil {
		return a.svc.GetShortcutSettings()
	}
	return core.DefaultShortcutSettings()
}

func (a *App) shortcutMatched(c *ui.Context, id string) bool {
	mods, key, ok := uiShortcutKeys(a.shortcutSettings().Accelerator(id))
	if !ok {
		return false
	}
	return c.Shortcut(mods, key)
}

// uiShortcutKeys converts a stored accelerator such as "CmdOrCtrl+Shift+L"
// into the modifiers and key ui.Shortcut compares against.
func uiShortcutKeys(accel string) (ui.Modifiers, ui.Key, bool) {
	normalized := core.NormalizeAccelerator(accel)
	if normalized == "" {
		return 0, 0, false
	}
	parts := strings.Split(normalized, "+")
	if len(parts) == 0 {
		return 0, 0, false
	}
	var mods ui.Modifiers
	for _, part := range parts[:len(parts)-1] {
		switch strings.ToLower(strings.TrimSpace(part)) {
		case "cmdorctrl":
			mods |= ui.Cmd
		case "ctrl":
			mods |= ui.Ctrl
		case "alt":
			mods |= ui.Alt
		case "shift":
			mods |= ui.Shift
		}
	}
	key, ok := uiKeyForName(parts[len(parts)-1])
	return mods, key, ok
}

func uiKeyForName(name string) (ui.Key, bool) {
	name = strings.TrimSpace(name)
	if name == "" {
		return ui.KeyUnknown, false
	}
	if len([]rune(name)) == 1 {
		r := []rune(name)[0]
		switch {
		case r >= 'a' && r <= 'z':
			return ui.KeyA + ui.Key(r-'a'), true
		case r >= 'A' && r <= 'Z':
			return ui.KeyA + ui.Key(r-'A'), true
		case r >= '0' && r <= '9':
			return ui.Key0 + ui.Key(r-'0'), true
		}
	}
	switch strings.ToLower(name) {
	case ",":
		return ui.KeyComma, true
	case "=":
		return ui.KeyEqual, true
	case "-":
		return ui.KeyMinus, true
	case ".":
		return ui.KeyPeriod, true
	case "/":
		return ui.KeySlash, true
	case ";":
		return ui.KeySemicolon, true
	case "'":
		return ui.KeyQuote, true
	case "[":
		return ui.KeyBracketLeft, true
	case "]":
		return ui.KeyBracketRight, true
	case "\\":
		return ui.KeyBackslash, true
	case "`":
		return ui.KeyBackquote, true
	case "space":
		return ui.KeySpace, true
	case "escape", "esc":
		return ui.KeyEscape, true
	case "enter", "return":
		return ui.KeyEnter, true
	case "tab":
		return ui.KeyTab, true
	case "backspace":
		return ui.KeyBackspace, true
	case "delete", "del":
		return ui.KeyDelete, true
	case "insert":
		return ui.KeyInsert, true
	case "home":
		return ui.KeyHome, true
	case "end":
		return ui.KeyEnd, true
	case "pageup", "page-up":
		return ui.KeyPageUp, true
	case "pagedown", "page-down":
		return ui.KeyPageDown, true
	case "up", "arrowup":
		return ui.KeyUp, true
	case "down", "arrowdown":
		return ui.KeyDown, true
	case "left", "arrowleft":
		return ui.KeyLeft, true
	case "right", "arrowright":
		return ui.KeyRight, true
	}
	if len(name) >= 2 && (name[0] == 'f' || name[0] == 'F') {
		n := 0
		for _, r := range name[1:] {
			if r < '0' || r > '9' {
				return ui.KeyUnknown, false
			}
			n = n*10 + int(r-'0')
		}
		if n >= 1 && n <= 12 {
			return ui.KeyF1 + ui.Key(n-1), true
		}
	}
	return ui.KeyUnknown, false
}
