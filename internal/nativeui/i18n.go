package nativeui

import (
	"embed"
	"encoding/json"
	"os"
	"sort"
	"strings"
	"sync"

	"bowerbird/core"
)

// The native renderer reads the same en/zh catalogs as the webview. They are
// copied into this package (see messages/README.md) so the binary stays
// self-contained; native-only strings live in native.json.
//
//go:embed messages/*.json
var messageFS embed.FS

type messageCatalog struct {
	langs    map[string]map[string]string
	enToKey  map[string]string
	byLangZh map[string]string
}

var (
	catalogOnce sync.Once
	catalog     *messageCatalog
)

func loadCatalog() *messageCatalog {
	catalogOnce.Do(func() {
		c := &messageCatalog{langs: map[string]map[string]string{}, enToKey: map[string]string{}}
		for _, lang := range []string{"en", "zh", "native"} {
			raw, err := messageFS.ReadFile("messages/" + lang + ".json")
			if err != nil {
				continue
			}
			var tree map[string]any
			if json.Unmarshal(raw, &tree) != nil {
				continue
			}
			flat := map[string]string{}
			flattenMessages("", tree, flat)
			if lang == "native" {
				// native.json holds {"en": {...}, "zh": {...}} overlays.
				for code, sub := range tree {
					subTree, ok := sub.(map[string]any)
					if !ok {
						continue
					}
					for k, v := range subTree {
						if s, ok := v.(string); ok {
							flat["native."+k] = s
							if c.langs[code] == nil {
								c.langs[code] = map[string]string{}
							}
							c.langs[code]["native."+k] = s
						}
					}
				}
				continue
			}
			c.langs[lang] = flat
		}
		// An English source string maps back to its key only when every key
		// with that text agrees in Chinese, so `tr("Open", "打开")` never
		// picks a differently translated "Open".
		group := map[string][]string{}
		for k, v := range c.langs["en"] {
			group[v] = append(group[v], k)
		}
		for en, keys := range group {
			if strings.Contains(en, "%") || strings.Contains(en, "{{") {
				continue
			}
			zh, ok := c.langs["zh"][keys[0]]
			if !ok {
				continue
			}
			same := true
			for _, k := range keys[1:] {
				if c.langs["zh"][k] != zh {
					same = false
					break
				}
			}
			if same {
				sort.Strings(keys)
				c.enToKey[en] = keys[0]
			}
		}
		catalog = c
	})
	return catalog
}

func flattenMessages(prefix string, tree map[string]any, out map[string]string) {
	for k, v := range tree {
		key := k
		if prefix != "" {
			key = prefix + "." + k
		}
		if sub, ok := v.(map[string]any); ok {
			flattenMessages(key, sub, out)
			continue
		}
		if s, ok := v.(string); ok {
			out[key] = s
		}
	}
}

// messageKeys returns every key in a language, for tests and tooling.
func messageKeys(lang string) []string {
	c := loadCatalog()
	out := make([]string, 0, len(c.langs[lang]))
	for k := range c.langs[lang] {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func (a *App) langCode() string {
	if a.zh() {
		return "zh"
	}
	return "en"
}

// t looks a message up by its key (`sidebar.trash`). Missing keys fall back to
// English, then to the key itself, so a half-translated catalog never blanks
// the interface.
func (a *App) t(key string) string {
	c := loadCatalog()
	lang := a.langCode()
	if v, ok := c.langs[lang][key]; ok {
		return v
	}
	if v, ok := c.langs["en"][key]; ok {
		return v
	}
	return key
}

// tf looks up a key and substitutes {{name}} placeholders.
func (a *App) tf(key string, vars map[string]string) string {
	s := a.t(key)
	for k, v := range vars {
		s = strings.ReplaceAll(s, "{{"+k+"}}", v)
	}
	return s
}

// zh reports whether the interface should speak Chinese. The persisted
// language wins; "system" follows the desktop locale from the environment.
func (app *App) zh() bool {
	lang := strings.ToLower(app.language)
	explicit := ""
	switch {
	case strings.HasPrefix(lang, "zh"):
		return true
	case lang == "en":
		return false
	case app.svc != nil:
		explicit = strings.ToLower(app.svc.GetLanguage())
		if strings.HasPrefix(explicit, "zh") {
			return true
		}
		if explicit == "en" {
			return false
		}
	}
	for _, key := range []string{"LC_ALL", "LC_MESSAGES", "LANG"} {
		if strings.HasPrefix(strings.ToLower(os.Getenv(key)), "zh") {
			return true
		}
	}
	return false
}

// tr returns the Chinese text when the interface is Chinese. English call
// sites that exactly match a catalog value now resolve through the shared
// resource, so wording stays aligned with the webview; the inline fallback
// remains for native-only phrases.
func (app *App) tr(en, zh string) string {
	if !app.zh() {
		return en
	}
	c := loadCatalog()
	if key, ok := c.enToKey[en]; ok {
		if v, ok := c.langs["zh"][key]; ok {
			return v
		}
	}
	return zh
}

func (app *App) languageLabel() string {
	if app.language == "" || app.language == "system" {
		return app.t("native.system")
	}
	if strings.HasPrefix(strings.ToLower(app.language), "zh") {
		return "中文"
	}
	return "English"
}

func languageValues() []string { return []string{"system", "en", "zh"} }

func languageNames(app *App) []string {
	return []string{
		app.t("native.system"),
		"English",
		"中文",
	}
}

func themeValues() []string { return []string{core.ThemeSystem, core.ThemeLight, core.ThemeDark} }

func themeNames(app *App) []string {
	return []string{
		app.t("native.system"),
		app.t("settings.appearance.light"),
		app.t("settings.appearance.dark"),
	}
}
