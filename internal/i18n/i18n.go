// Package i18n carries the native UI's translations. The dictionaries are the
// same JSON files the former React frontend used, so keys and copy stay in
// step while the web layer is removed.
package i18n

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
)

//go:embed en.json
var enJSON []byte

//go:embed zh.json
var zhJSON []byte

// Bundle is a loaded set of translations.
type Bundle struct {
	mu   sync.RWMutex
	lang string
	data map[string]any
}

// New returns a bundle for the given language preference ("system", "en",
// "zh", "zh-CN"). An unknown preference falls back to en.
func New(language string) *Bundle {
	b := &Bundle{}
	b.SetLanguage(language)
	return b
}

// SetLanguage replaces the active dictionary.
func (b *Bundle) SetLanguage(language string) {
	lang := Resolve(language)
	var raw []byte
	switch lang {
	case "zh":
		raw = zhJSON
	default:
		raw = enJSON
	}
	data := map[string]any{}
	_ = json.Unmarshal(raw, &data)
	b.mu.Lock()
	b.lang = lang
	b.data = data
	b.mu.Unlock()
}

// Language returns the resolved language code.
func (b *Bundle) Language() string {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.lang
}

// Resolve maps a stored preference to a concrete language.
func Resolve(language string) string {
	switch strings.ToLower(strings.TrimSpace(language)) {
	case "zh", "zh-cn", "zh-hans":
		return "zh"
	case "en":
		return "en"
	case "", "system":
		// The desktop app used the system UI language. Read the common
		// environment variables without pulling in a platform dependency.
		for _, key := range []string{"LANG", "LC_ALL", "LC_MESSAGES"} {
			if strings.HasPrefix(strings.ToLower(os.Getenv(key)), "zh") {
				return "zh"
			}
		}
		return "en"
	default:
		return "en"
	}
}

// T translates key. A missing key is returned unchanged, which keeps layout
// and diagnostics readable when a new string has not been translated yet.
func (b *Bundle) T(key string) string {
	return b.Tf(key, nil)
}

// Tf translates key and substitutes {{name}} placeholders.
func (b *Bundle) Tf(key string, args map[string]any) string {
	b.mu.RLock()
	value := lookup(b.data, key)
	b.mu.RUnlock()
	if value == "" {
		return key
	}
	for name, arg := range args {
		value = strings.ReplaceAll(value, "{{"+name+"}}", fmt.Sprint(arg))
	}
	return value
}

func lookup(data map[string]any, key string) string {
	var current any = data
	for _, part := range strings.Split(key, ".") {
		m, ok := current.(map[string]any)
		if !ok {
			return ""
		}
		current, ok = m[part]
		if !ok {
			return ""
		}
	}
	s, _ := current.(string)
	return s
}
