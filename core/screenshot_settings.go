package core

import (
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const ScreenshotSettingsChangedEvent = "screenshot-settings-changed"

const (
	ScreenshotFormatPNG  = "png"
	ScreenshotFormatJPEG = "jpeg"
)

const (
	ScreenshotNameDate    = "date"
	ScreenshotNameApp     = "app"
	ScreenshotNameDateApp = "date-app"
	ScreenshotNameCustom  = "custom"
)

// ScreenshotSettings controls how captures are encoded, named, tagged and filed.
type ScreenshotSettings struct {
	Format        string `json:"format"`
	Quality       int    `json:"quality"`
	Naming        string `json:"naming"`
	IncludeDate   bool   `json:"includeDate"`
	IncludeApp    bool   `json:"includeApp"`
	AutoTag       bool   `json:"autoTag"`
	FolderID      string `json:"folderId"`
	CustomPattern string `json:"customPattern,omitempty"`
}

func DefaultScreenshotSettings() ScreenshotSettings {
	return ScreenshotSettings{
		Format:      ScreenshotFormatPNG,
		Quality:     92,
		Naming:      ScreenshotNameDate,
		IncludeDate: true,
		IncludeApp:  false,
		AutoTag:     true,
		FolderID:    "",
	}
}

func NormalizeScreenshotSettings(in ScreenshotSettings) ScreenshotSettings {
	if strings.TrimSpace(in.Format) == "" && in.Quality == 0 && strings.TrimSpace(in.Naming) == "" {
		return DefaultScreenshotSettings()
	}
	out := DefaultScreenshotSettings()
	format := strings.ToLower(strings.TrimSpace(in.Format))
	if format == "jpg" {
		format = ScreenshotFormatJPEG
	}
	if format == ScreenshotFormatPNG || format == ScreenshotFormatJPEG {
		out.Format = format
	}
	if in.Quality > 0 {
		q := in.Quality
		if q < 10 {
			q = 10
		}
		if q > 100 {
			q = 100
		}
		out.Quality = q
	}
	naming := strings.ToLower(strings.TrimSpace(in.Naming))
	switch naming {
	case ScreenshotNameDate, ScreenshotNameApp, ScreenshotNameDateApp, ScreenshotNameCustom:
		out.Naming = naming
	}
	out.IncludeDate = in.IncludeDate
	out.IncludeApp = in.IncludeApp
	out.AutoTag = in.AutoTag
	out.FolderID = strings.TrimSpace(in.FolderID)
	out.CustomPattern = strings.TrimSpace(in.CustomPattern)
	return out
}

func screenshotDisplayName(settings ScreenshotSettings, mode ScreenshotMode, now time.Time, language string) string {
	prefix := "Screenshot"
	if language == "zh" {
		prefix = "截图"
	}
	appName := "Bowerbird"
	date := now.Format("2006-01-02 15.04.05")
	ext := "." + settings.Format
	if settings.Format == ScreenshotFormatJPEG {
		ext = ".jpg"
	}

	includeDate := settings.IncludeDate
	includeApp := settings.IncludeApp
	switch settings.Naming {
	case ScreenshotNameDate:
		includeDate = true
	case ScreenshotNameApp:
		includeApp = true
	case ScreenshotNameDateApp:
		includeDate = true
		includeApp = true
	}

	var parts []string
	parts = append(parts, prefix)
	if includeApp {
		parts = append(parts, appName)
	}
	if includeDate {
		parts = append(parts, date)
	} else {
		parts = append(parts, string(mode))
	}
	if settings.Naming == ScreenshotNameCustom && settings.CustomPattern != "" {
		pat := settings.CustomPattern
		pat = strings.ReplaceAll(pat, "{date}", date)
		pat = strings.ReplaceAll(pat, "{app}", appName)
		pat = strings.ReplaceAll(pat, "{mode}", string(mode))
		return sanitizeFilename(pat) + ext
	}
	return strings.Join(parts, " ") + ext
}

func sanitizeFilename(name string) string {
	name = strings.TrimSpace(name)
	replacer := strings.NewReplacer("/", "-", "\\", "-", ":", ".", "*", "", "?", "", "\"", "", "<", "", ">", "", "|", "")
	name = replacer.Replace(name)
	if name == "" {
		return "Screenshot"
	}
	return name
}

func transcodeScreenshot(srcPath, dstPath, format string, quality int) error {
	if format == ScreenshotFormatPNG {
		return copyScreenshotFile(srcPath, dstPath)
	}
	f, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer f.Close()
	img, _, err := image.Decode(f)
	if err != nil {
		return fmt.Errorf("decode screenshot: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
		return err
	}
	out, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	defer out.Close()
	switch format {
	case ScreenshotFormatJPEG:
		if quality <= 0 {
			quality = 92
		}
		return jpeg.Encode(out, img, &jpeg.Options{Quality: quality})
	default:
		return png.Encode(out, img)
	}
}
