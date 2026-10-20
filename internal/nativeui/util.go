package nativeui

import (
	"fmt"
	"math"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"bowerbird/core"
)

// fileCategory mirrors frontend/src/lib/formatters.ts getFileCategory.
func fileCategory(ext, mimeType string) string {
	e := strings.ToLower(strings.TrimPrefix(ext, "."))
	m := strings.ToLower(mimeType)
	if e == "ts" {
		if strings.HasPrefix(m, "video/") {
			return "video"
		}
		return "document"
	}
	switch e {
	case "png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "tiff", "tif", "avif", "ico":
		return "image"
	case "mp4", "mov", "qt", "mkv", "avi", "webm", "m4v", "flv", "f4v", "ts", "mts", "m2ts",
		"m3u8", "mpd", "ogv", "ogm", "3gp", "3g2", "wmv", "asf", "mpg", "mpeg", "m2v", "vob",
		"rmvb", "rm":
		return "video"
	case "mp3", "wav", "flac", "aac", "ogg", "m4a", "opus":
		return "audio"
	case "pdf", "txt", "md", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "json", "js", "go", "py":
		return "document"
	case "zip", "tar", "gz", "rar", "7z":
		return "archive"
	}
	switch {
	case strings.HasPrefix(m, "video/"):
		return "video"
	case strings.HasPrefix(m, "image/"):
		return "image"
	case strings.HasPrefix(m, "audio/"):
		return "audio"
	}
	return "other"
}

func formatBytes(bytes int64, decimals int) string {
	if bytes <= 0 {
		return "0 B"
	}
	const k = 1024
	units := []string{"B", "KB", "MB", "GB", "TB"}
	i := int(math.Floor(math.Log(float64(bytes)) / math.Log(k)))
	if i >= len(units) {
		i = len(units) - 1
	}
	v := float64(bytes) / math.Pow(k, float64(i))
	return fmt.Sprintf("%.*f %s", decimals, v, units[i])
}

func formatDate(ts int64) string {
	if ts <= 0 {
		return "-"
	}
	return time.Unix(ts, 0).Format("2006-01-02 15:04")
}

func formatDuration(d time.Duration) string {
	if d < time.Second {
		return fmt.Sprintf("%dms", d.Milliseconds())
	}
	return fmt.Sprintf("%.2fs", d.Seconds())
}

func parseHexRGB(hex string) (int, int, int, bool) {
	clean := strings.TrimPrefix(strings.TrimSpace(hex), "#")
	if len(clean) != 6 {
		return 0, 0, 0, false
	}
	n, err := strconv.ParseInt(clean, 16, 32)
	if err != nil {
		return 0, 0, 0, false
	}
	return int(n>>16) & 255, int(n>>8) & 255, int(n) & 255, true
}

// colorDistance is the redmean approximation used by the webview frontend.
func colorDistance(a, b string) float64 {
	ar, ag, ab, ok1 := parseHexRGB(a)
	br, bg, bb, ok2 := parseHexRGB(b)
	if !ok1 || !ok2 {
		return 999
	}
	rmean := float64(ar+br) / 2
	dr := float64(ar - br)
	dg := float64(ag - bg)
	db := float64(ab - bb)
	return math.Sqrt((2+rmean/256)*dr*dr + 4*dg*dg + (2+(255-rmean)/256)*db*db)
}

func itemMatchesColor(dominant string, palette []string, target string) bool {
	for _, c := range []string{dominant} {
		if c != "" && colorDistance(c, target) <= 115 {
			return true
		}
	}
	for _, c := range palette {
		if c != "" && colorDistance(c, target) <= 115 {
			return true
		}
	}
	return false
}

func itemOrientation(width, height int, meta string) string {
	if meta != "" {
		return meta
	}
	if width > 0 && height > 0 {
		ratio := float64(width) / float64(height)
		if math.Abs(ratio-1) <= 0.05 {
			return "square"
		}
		if ratio > 1 {
			return "landscape"
		}
		return "portrait"
	}
	return ""
}

func truncate(s string, max int) string {
	if max <= 0 || len([]rune(s)) <= max {
		return s
	}
	r := []rune(s)
	return string(r[:max]) + "…"
}

func extensionLabel(ext string) string {
	e := strings.ToUpper(strings.TrimPrefix(ext, "."))
	if e == "" {
		return "FILE"
	}
	return e
}

func folderDisplayName(path string) string {
	p := strings.TrimRight(path, "/\\")
	base := filepath.Base(p)
	base = strings.TrimSuffix(base, ".library")
	if base == "" || base == "." {
		return path
	}
	return base
}

// folderRow is one folder of the tree with its display depth.
type folderRow struct {
	Folder core.Folder
	Depth  int
}

func flattenFolderTree(roots []core.Folder) []folderRow {
	var out []folderRow
	var walk func(list []core.Folder, depth int)
	walk = func(list []core.Folder, depth int) {
		for _, f := range list {
			out = append(out, folderRow{Folder: f, Depth: depth})
			if len(f.Children) > 0 {
				walk(f.Children, depth+1)
			}
		}
	}
	walk(roots, 0)
	return out
}
