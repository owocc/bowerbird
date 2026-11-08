package app

import (
	"strconv"

	"github.com/egoist/mygo/ui"
)

// applyBackdrop paints the window's environment layer: the base fill plus, for
// the gradient mode, two soft radial glows derived from the library's palette.
// mygo has no CSS, so this is a GPU painter callback on the root element, before
// its children paint — not a stylesheet and not an absolute sibling that could
// cover the workspace.
func (a *App) applyBackdrop(e ui.Element, t *ui.Theme) {
	p := paletteFor(t)
	mode := a.prefs.BackdropMode
	if mode == "" {
		mode = "default"
	}
	if a.svc != nil && a.svc.GetVibrancyEnabled() && mode == "default" {
		mode = "transparent"
	}
	a.backdropMode = mode
	base := p.bg
	if mode == "solid" {
		if col, err := parseColor(a.prefs.BackdropSolid); err == nil {
			base = col
		}
	}
	if mode == "transparent" {
		base = ui.Transparent
	}
	e.Background(base).Draw(func(pt *ui.Painter, r ui.Rect) {
		if mode != "gradient" && mode != "image" {
			return
		}
		colors := a.stats.TopColors
		if len(colors) == 0 {
			colors = []string{"#5b8cff", "#c45cff", "#3ddc97"}
		}
		for i := 0; i < 2 && i < len(colors); i++ {
			col, err := parseColor(colors[i])
			if err != nil {
				continue
			}
			center := ui.Point{X: 0.22 + float32(i)*0.56, Y: 0.18 + float32(i)*0.35}
			rad := float32(maxFloat(float64(r.W), float64(r.H))) * 0.72
			pt.FillRadialGradient(r, ui.RadialGradient{
				Stops: []ui.GradientStop{
					{Color: col.Alpha(0.20), At: 0},
					{Color: col.Alpha(0.07), At: 0.55},
					{Color: col.Alpha(0), At: 1},
				},
				Center: center,
				Radius: rad,
				Oklab:  true,
			}, 0)
		}
	})
}

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func parseColor(s string) (ui.Color, error) {
	if len(s) == 4 && s[0] == '#' {
		s = "#" + string([]byte{s[1], s[1], s[2], s[2], s[3], s[3]})
	}
	if len(s) != 7 || s[0] != '#' {
		return ui.Transparent, strconv.ErrSyntax
	}
	return ui.Hex(s), nil
}

// backdropMode is remembered so the settings preview and the window paint agree.
var _ = struct{}{}
