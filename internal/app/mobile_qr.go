package app

import (
	"image"
	"image/color"

	"bowerbird/core"

	"github.com/egoist/mygo/ui"
)

// mobileQRBitmap renders a pairing URL as a QR bitmap. A 4-module quiet zone
// keeps the code scannable against the settings card, and pixelated scaling
// keeps the modules sharp when the image is shown smaller than its pixels.
func mobileQRBitmap(data string) *ui.Bitmap {
	matrix, err := core.QRCodeMatrix(data)
	if err != nil || len(matrix) == 0 {
		return nil
	}
	const modulePixels = 6
	const quietZone = 4
	modules := len(matrix)
	size := (modules + quietZone*2) * modulePixels
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	white := color.RGBA{R: 255, G: 255, B: 255, A: 255}
	black := color.RGBA{R: 0, G: 0, B: 0, A: 255}
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			img.SetRGBA(x, y, white)
		}
	}
	for row := 0; row < modules; row++ {
		for col := 0; col < modules; col++ {
			if !matrix[row][col] {
				continue
			}
			x0 := (col + quietZone) * modulePixels
			y0 := (row + quietZone) * modulePixels
			for y := y0; y < y0+modulePixels; y++ {
				for x := x0; x < x0+modulePixels; x++ {
					img.SetRGBA(x, y, black)
				}
			}
		}
	}
	return ui.NewBitmap(img).Pixelated()
}
