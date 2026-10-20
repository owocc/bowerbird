package nativeui

import (
	"os"
	"strings"

	"bowerbird/core"
)

// zh reports whether the interface should speak Chinese. The persisted
// language wins; "system" follows the desktop locale from the environment.
func (app *App) zh() bool {
	lang := strings.ToLower(app.language)
	switch {
	case strings.HasPrefix(lang, "zh"):
		return true
	case lang == "en":
		return false
	case app.svc != nil:
		if p := strings.ToLower(app.svc.GetLanguage()); strings.HasPrefix(p, "zh") {
			return true
		} else if p == "en" {
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

// tr returns the Chinese text when the interface is Chinese.
func (app *App) tr(en, zh string) string {
	if app.zh() {
		return zh
	}
	return en
}

func (app *App) languageLabel() string {
	if app.language == "" || app.language == "system" {
		return app.tr("System", "跟随系统")
	}
	if strings.HasPrefix(strings.ToLower(app.language), "zh") {
		return "中文"
	}
	return "English"
}

func languageValues() []string { return []string{"system", "en", "zh"} }

func languageNames(app *App) []string {
	return []string{
		app.tr("System", "跟随系统"),
		"English",
		"中文",
	}
}

func themeValues() []string { return []string{core.ThemeSystem, core.ThemeLight, core.ThemeDark} }

func themeNames(app *App) []string {
	return []string{
		app.tr("System", "跟随系统"),
		app.tr("Light", "浅色"),
		app.tr("Dark", "深色"),
	}
}
