package nativeui

import (
	"image"
	"image/color"
	"image/draw"

	"bowerbird/internal/qr"

	"github.com/egoist/mygo/ui"
)

// makeQRBitmap encodes text at error-correction level M and draws it as a
// crisp black-on-white bitmap with the four-module quiet zone QR requires.
// It must be called on the main thread because it creates a ui.Bitmap.
func makeQRBitmap(text string, targetPx int) (*ui.Bitmap, error) {
	code, err := qr.Encode(text, qr.M)
	if err != nil {
		return nil, err
	}
	const margin = 4
	modules := code.Size + margin*2
	if targetPx < modules {
		targetPx = modules
	}
	scale := targetPx / modules
	if scale < 1 {
		scale = 1
	}
	side := modules * scale
	img := image.NewRGBA(image.Rect(0, 0, side, side))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)
	black := image.NewUniform(color.Black)
	for y := 0; y < code.Size; y++ {
		for x := 0; x < code.Size; x++ {
			if !code.Black(x, y) {
				continue
			}
			x0 := (x + margin) * scale
			y0 := (y + margin) * scale
			draw.Draw(img, image.Rect(x0, y0, x0+scale, y0+scale), black, image.Point{}, draw.Src)
		}
	}
	return ui.NewBitmap(img).Pixelated(), nil
}
