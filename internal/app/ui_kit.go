package app

import (
	"fmt"
	"math"
	"strings"
	"time"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
)

const (
	sidebarWidth   = 224
	inspectorWidth = 304
	headerHeight   = 52
)

// palette is the app's semantic colour set. It is derived from the window theme
// so Light/Dark/System switches stay native; the extra tones are tuned for the
// gallery rather than for generic controls.
type palette struct {
	dark      bool
	bg        ui.Color
	sidebar   ui.Color
	surface   ui.Color
	surface2  ui.Color
	text      ui.Color
	muted     ui.Color
	faint     ui.Color
	hairline  ui.Color
	hover     ui.Color
	press     ui.Color
	accent    ui.Color
	onAccent  ui.Color
	cardShade ui.Color
	danger    ui.Color
}

func paletteFor(t *ui.Theme) palette {
	if t.Dark {
		return palette{
			dark:      true,
			bg:        ui.Hex("#141416"),
			sidebar:   ui.Hex("#1b1b1e"),
			surface:   ui.Hex("#232327"),
			surface2:  ui.Hex("#2c2c31"),
			text:      ui.Hex("#f4f4f5"),
			muted:     ui.Hex("#a1a1aa"),
			faint:     ui.Hex("#71717a"),
			hairline:  ui.RGBA(255, 255, 255, 0.08),
			hover:     ui.RGBA(255, 255, 255, 0.06),
			press:     ui.RGBA(255, 255, 255, 0.11),
			accent:    ui.Hex("#6ea8ff"),
			onAccent:  ui.Hex("#0b1220"),
			cardShade: ui.RGBA(0, 0, 0, 0.55),
			danger:    ui.Hex("#ff6b6b"),
		}
	}
	return palette{
		bg:        ui.Hex("#ffffff"),
		sidebar:   ui.Hex("#f5f5f7"),
		surface:   ui.Hex("#ffffff"),
		surface2:  ui.Hex("#f0f0f3"),
		text:      ui.Hex("#18181b"),
		muted:     ui.Hex("#6b6b74"),
		faint:     ui.Hex("#9a9aa3"),
		hairline:  ui.RGBA(0, 0, 0, 0.08),
		hover:     ui.RGBA(0, 0, 0, 0.045),
		press:     ui.RGBA(0, 0, 0, 0.08),
		accent:    ui.Hex("#2563eb"),
		onAccent:  ui.Hex("#ffffff"),
		cardShade: ui.RGBA(15, 23, 42, 0.18),
		danger:    ui.Hex("#dc2626"),
	}
}

// iconButton is the standard square toolbar button. The icon inherits hover and
// selection states through AnimateColor, so nothing pops.
func (a *App) iconButton(c *ui.Context, key any, icon *ui.SVG, selected bool, label string, onClick func()) {
	if icon == nil {
		return
	}
	p := paletteFor(c.Theme())
	b := ui.ButtonBase(c.Key(key)).Size(30, 30).Radius(7).FocusRing(false).AlignItems(ui.Center).Justify(ui.Center)
	bg := ui.Transparent
	switch {
	case selected:
		bg = p.press
	case b.Hovered():
		bg = p.hover
	}
	b.Background(b.AnimateColor("bg", bg, ui.Animation{Duration: 120 * time.Millisecond}))
	b.Tooltip(label)
	b.Children(func() {
		ui.Icon(c, icon).Size(17, 17).TextColor(p.text)
	})
	if b.Clicked() && onClick != nil {
		onClick()
	}
}
func (a *App) iconButtonMenu(c *ui.Context, key any, icon *ui.SVG, label string, menu func(m *ui.Menu)) {
	if icon == nil {
		return
	}
	p := paletteFor(c.Theme())
	b := ui.ButtonBase(c.Key(key)).Size(30, 30).Radius(7).FocusRing(false).AlignItems(ui.Center).Justify(ui.Center)
	bg := ui.Transparent
	if b.Hovered() {
		bg = p.hover
	}
	b.Background(b.AnimateColor("bg", bg, ui.Animation{Duration: 120 * time.Millisecond}))
	b.Tooltip(label)
	b.Children(func() {
		ui.Icon(c, icon).Size(17, 17).TextColor(p.text)
	})
	b.PopoverMenuButton(menu)
}


func (a *App) pillButton(c *ui.Context, key any, label string, active bool, onClick func()) {
	p := paletteFor(c.Theme())
	b := ui.ButtonBase(c.Key(key)).Height(28).PaddingX(10).Radius(999).FocusRing(false).AlignItems(ui.Center)
	bg := p.surface2
	fg := p.text
	if active {
		bg = p.accent
		fg = p.onAccent
	} else if b.Hovered() {
		bg = p.hover
	}
	b.Background(b.AnimateColor("bg", bg, ui.Animation{Duration: 120 * time.Millisecond}))
	b.Children(func() { ui.Text(c, label).FontSize(12).FontWeight(550).TextColor(fg) })
	if b.Clicked() && onClick != nil {
		onClick()
	}
}

func (a *App) sectionLabel(c *ui.Context, text string) {
	p := paletteFor(c.Theme())
	ui.Text(c, strings.ToUpper(text)).FontSize(10).FontWeight(650).LetterSpacing(0.6).TextColor(p.faint).Padding(0, 4).MarginY(6)
}

func (a *App) hairline(c *ui.Context) {
	p := paletteFor(c.Theme())
	ui.Box(c).FillWidth().Height(1).Background(p.hairline)
}

func (a *App) emptyState(c *ui.Context, icon *ui.SVG, title, subtitle string) {
	p := paletteFor(c.Theme())
	ui.Column(c).Fill().Center().Gap(10).Children(func() {
		box := ui.Box(c).Size(56, 56).Radius(16).Background(p.surface2).AlignItems(ui.Center).Justify(ui.Center)
		box.Children(func() { ui.Icon(c, icon).Size(26, 26).TextColor(p.faint) })
		ui.Text(c, title).FontSize(15).FontWeight(600).TextColor(p.text)
		if subtitle != "" {
			ui.Text(c, subtitle).FontSize(12).TextColor(p.muted).TextAlign(ui.Center).MaxWidth(320)
		}
	})
}

func formatBytes(bytes int64) string {
	if bytes <= 0 {
		return "0 B"
	}
	units := []string{"B", "KB", "MB", "GB", "TB"}
	i := int(math.Floor(math.Log(float64(bytes)) / math.Log(1024)))
	if i < 0 {
		i = 0
	}
	if i >= len(units) {
		i = len(units) - 1
	}
	v := float64(bytes) / math.Pow(1024, float64(i))
	if i == 0 {
		return fmt.Sprintf("%d B", bytes)
	}
	return fmt.Sprintf("%.1f %s", v, units[i])
}

func formatDate(ts int64) string {
	if ts <= 0 {
		return "-"
	}
	return time.Unix(ts, 0).Format("2006-01-02 15:04")
}

func formatDuration(seconds float64) string {
	if seconds <= 0 || math.IsNaN(seconds) || math.IsInf(seconds, 0) {
		return "00:00"
	}
	total := int(seconds)
	h := total / 3600
	m := (total % 3600) / 60
	s := total % 60
	if h > 0 {
		return fmt.Sprintf("%d:%02d:%02d", h, m, s)
	}
	return fmt.Sprintf("%02d:%02d", m, s)
}

func categoryOf(item core.Item) string {
	e := strings.ToLower(item.Extension)
	m := strings.ToLower(item.MimeType)
	switch {
	case e == "ts" && strings.HasPrefix(m, "video/"):
		return "video"
	case in(e, "png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "tiff", "tif", "avif", "ico"):
		return "image"
	case in(e, "mp4", "mov", "qt", "mkv", "avi", "webm", "m4v", "flv", "mts", "m2ts", "mpg", "mpeg", "wmv", "3gp", "ogv"):
		return "video"
	case in(e, "mp3", "wav", "flac", "aac", "ogg", "m4a", "opus"):
		return "audio"
	case in(e, "pdf", "txt", "md", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "json", "js", "ts", "go", "py"):
		return "document"
	case in(e, "zip", "tar", "gz", "rar", "7z"):
		return "archive"
	case strings.HasPrefix(m, "image/"):
		return "image"
	case strings.HasPrefix(m, "video/"):
		return "video"
	case strings.HasPrefix(m, "audio/"):
		return "audio"
	default:
		return "other"
	}
}

func categoryIcon(item core.Item) *ui.SVG {
	switch categoryOf(item) {
	case "image":
		return iconImage
	case "video":
		return iconVideo
	case "audio":
		return iconAudio
	case "document":
		return iconDocument
	case "archive":
		return iconArchive
	default:
		return iconDocument
	}
}

func in(v string, list ...string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

func plural(n int, one, many string) string {
	if n == 1 {
		return fmt.Sprintf("%d %s", n, one)
	}
	return fmt.Sprintf("%d %s", n, many)
}
