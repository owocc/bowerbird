package core

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"image/color"
	"math"
	"os"
	"sort"
	"strings"
)

type colorBucket struct {
	rSum  uint64
	gSum  uint64
	bSum  uint64
	count uint64
}

type quantColor struct {
	r     uint8
	g     uint8
	b     uint8
	hex   string
	count uint64
}

// ExtractPaletteAndMeta analyzes a decoded image (and optional scaled RGBA thumbnail)
// to extract up to maxColors dominant hex colors (#RRGGBB) and rich ImageMeta.
func ExtractPaletteAndMeta(origImg image.Image, sampleImg *image.RGBA, origW, origH int, ext string, filePath string) (string, []string, *ImageMeta) {
	meta := &ImageMeta{
		ColorModel:  detectColorModelName(origImg.ColorModel()),
		ColorSpace:  "sRGB",
		BitDepth:    detectBitDepth(origImg.ColorModel()),
		AspectRatio: computeAspectRatioString(origW, origH),
		Orientation: computeOrientation(origW, origH),
		Megapixels:  fmt.Sprintf("%.2f MP", float64(origW*origH)/1_000_000.0),
	}

	if strings.EqualFold(ext, "gif") {
		meta.Animated = checkGIFAnimated(filePath)
	}
	if strings.EqualFold(ext, "jpg") || strings.EqualFold(ext, "jpeg") {
		makeStr, modelStr, dateStr := parseBasicJPEGExif(filePath)
		meta.ExifMake = makeStr
		meta.ExifModel = modelStr
		meta.ExifDate = dateStr
	}

	// Quantize colors from sampleImg (4-bit per channel = 4096 buckets)
	buckets := make(map[uint16]*colorBucket, 256)
	hasAlpha := false

	bounds := sampleImg.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()
	stepX := 1
	stepY := 1
	if w > 96 {
		stepX = w / 96
	}
	if h > 96 {
		stepY = h / 96
	}

	for y := bounds.Min.Y; y < bounds.Max.Y; y += stepY {
		for x := bounds.Min.X; x < bounds.Max.X; x += stepX {
			offset := sampleImg.PixOffset(x, y)
			r := sampleImg.Pix[offset+0]
			g := sampleImg.Pix[offset+1]
			b := sampleImg.Pix[offset+2]
			a := sampleImg.Pix[offset+3]

			if a < 250 {
				hasAlpha = true
			}
			if a < 48 {
				// Ignore transparent pixels for color palette extraction
				continue
			}

			// Un-premultiply if needed
			if a < 255 && a > 0 {
				r = uint8(min(255, int(r)*255/int(a)))
				g = uint8(min(255, int(g)*255/int(a)))
				b = uint8(min(255, int(b)*255/int(a)))
			}

			key := (uint16(r>>4) << 8) | (uint16(g>>4) << 4) | uint16(b>>4)
			bkt, ok := buckets[key]
			if !ok {
				bkt = &colorBucket{}
				buckets[key] = bkt
			}
			bkt.rSum += uint64(r)
			bkt.gSum += uint64(g)
			bkt.bSum += uint64(b)
			bkt.count++
		}
	}

	meta.HasAlpha = hasAlpha

	var candidates []quantColor
	for _, bkt := range buckets {
		if bkt.count == 0 {
			continue
		}
		r := uint8(bkt.rSum / bkt.count)
		g := uint8(bkt.gSum / bkt.count)
		b := uint8(bkt.bSum / bkt.count)
		candidates = append(candidates, quantColor{
			r:     r,
			g:     g,
			b:     b,
			hex:   fmt.Sprintf("#%02X%02X%02X", r, g, b),
			count: bkt.count,
		})
	}

	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].count > candidates[j].count
	})

	// Merge perceptually close colors so the 6 palette swatches are distinct
	const maxPalette = 6
	const minColorDistance = 38.0
	var selected []quantColor

	for _, c := range candidates {
		tooClose := false
		for _, sel := range selected {
			if perceptualColorDistance(c.r, c.g, c.b, sel.r, sel.g, sel.b) < minColorDistance {
				tooClose = true
				break
			}
		}
		if !tooClose {
			selected = append(selected, c)
			if len(selected) >= maxPalette {
				break
			}
		}
	}

	// If strict distance filtered too many on a monochrome image, fill remaining slots
	if len(selected) < maxPalette {
		for _, c := range candidates {
			exists := false
			for _, sel := range selected {
				if sel.hex == c.hex {
					exists = true
					break
				}
			}
			if !exists {
				selected = append(selected, c)
				if len(selected) >= maxPalette {
					break
				}
			}
		}
	}

	palette := make([]string, 0, len(selected))
	for _, s := range selected {
		palette = append(palette, s.hex)
	}
	dominant := ""
	if len(palette) > 0 {
		dominant = palette[0]
	}

	return dominant, palette, meta
}

func perceptualColorDistance(r1, g1, b1, r2, g2, b2 uint8) float64 {
	rmean := (float64(r1) + float64(r2)) / 2.0
	dr := float64(r1) - float64(r2)
	dg := float64(g1) - float64(g2)
	db := float64(b1) - float64(b2)
	weightR := 2.0 + rmean/256.0
	weightG := 4.0
	weightB := 2.0 + (255.0-rmean)/256.0
	return math.Sqrt(weightR*dr*dr + weightG*dg*dg + weightB*db*db)
}

func detectColorModelName(cm color.Model) string {
	switch cm {
	case color.RGBAModel, color.NRGBAModel:
		return "RGBA"
	case color.RGBA64Model, color.NRGBA64Model:
		return "RGBA (16-bit)"
	case color.YCbCrModel:
		return "RGB (YCbCr)"
	case color.CMYKModel:
		return "CMYK"
	case color.GrayModel, color.Gray16Model:
		return "Grayscale"
	case color.AlphaModel, color.Alpha16Model:
		return "Alpha"
	default:
		return "RGB"
	}
}

func detectBitDepth(cm color.Model) int {
	switch cm {
	case color.RGBA64Model, color.NRGBA64Model, color.Gray16Model, color.Alpha16Model:
		return 16
	default:
		return 8
	}
}

func computeOrientation(w, h int) string {
	if w <= 0 || h <= 0 {
		return ""
	}
	ratio := float64(w) / float64(h)
	if ratio >= 0.95 && ratio <= 1.05 {
		return "square"
	}
	if w > h {
		return "landscape"
	}
	return "portrait"
}

func computeAspectRatioString(w, h int) string {
	if w <= 0 || h <= 0 {
		return ""
	}
	g := gcd(w, h)
	rw, rh := w/g, h/g
	if rw <= 32 && rh <= 32 {
		return fmt.Sprintf("%d:%d", rw, rh)
	}
	// Match common aspect ratios within 2%
	ratio := float64(w) / float64(h)
	common := []struct {
		label string
		val   float64
	}{
		{"1:1", 1.0},
		{"16:9", 16.0 / 9.0},
		{"9:16", 9.0 / 16.0},
		{"4:3", 4.0 / 3.0},
		{"3:4", 3.0 / 4.0},
		{"3:2", 3.0 / 2.0},
		{"2:3", 2.0 / 3.0},
		{"21:9", 21.0 / 9.0},
	}
	for _, c := range common {
		if math.Abs(ratio-c.val) < 0.025 {
			return c.label
		}
	}
	return fmt.Sprintf("%.2f:1", ratio)
}

func gcd(a, b int) int {
	for b != 0 {
		a, b = b, a%b
	}
	if a < 1 {
		return 1
	}
	return a
}

func checkGIFAnimated(filePath string) bool {
	f, err := os.Open(filePath)
	if err != nil {
		return false
	}
	defer f.Close()
	buf := make([]byte, 32768)
	n, _ := f.Read(buf)
	if n <= 0 {
		return false
	}
	// Count Graphic Control Extension blocks (0x21 0xF9)
	count := bytes.Count(buf[:n], []byte{0x21, 0xF9})
	return count > 1
}

// parseBasicJPEGExif reads up to 64KB of a JPEG to extract Make, Model, DateTime if present.
func parseBasicJPEGExif(filePath string) (makeStr, modelStr, dateStr string) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", "", ""
	}
	defer f.Close()

	buf := make([]byte, 65536)
	n, err := f.Read(buf)
	if err != nil || n < 12 {
		return "", "", ""
	}
	data := buf[:n]
	if data[0] != 0xFF || data[1] != 0xD8 {
		return "", "", ""
	}

	pos := 2
	for pos+4 < len(data) {
		if data[pos] != 0xFF {
			break
		}
		marker := data[pos+1]
		if marker == 0xDA || marker == 0xD9 {
			break
		}
		segLen := int(binary.BigEndian.Uint16(data[pos+2 : pos+4]))
		if segLen < 2 || pos+2+segLen > len(data) {
			break
		}
		if marker == 0xE1 && segLen >= 14 {
			payload := data[pos+4 : pos+2+segLen]
			if bytes.HasPrefix(payload, []byte("Exif\x00\x00")) {
				return parseExifTIFF(payload[6:])
			}
		}
		pos += 2 + segLen
	}
	return "", "", ""
}

func parseExifTIFF(tiff []byte) (makeStr, modelStr, dateStr string) {
	if len(tiff) < 8 {
		return "", "", ""
	}
	var bo binary.ByteOrder
	switch string(tiff[0:2]) {
	case "II":
		bo = binary.LittleEndian
	case "MM":
		bo = binary.BigEndian
	default:
		return "", "", ""
	}
	if bo.Uint16(tiff[2:4]) != 0x002A {
		return "", "", ""
	}
	ifdOffset := int(bo.Uint32(tiff[4:8]))
	if ifdOffset < 8 || ifdOffset+2 > len(tiff) {
		return "", "", ""
	}

	numEntries := int(bo.Uint16(tiff[ifdOffset : ifdOffset+2]))
	base := ifdOffset + 2
	for i := range numEntries {
		entryPos := base + i*12
		if entryPos+12 > len(tiff) {
			break
		}
		tag := bo.Uint16(tiff[entryPos : entryPos+2])
		fieldType := bo.Uint16(tiff[entryPos+2 : entryPos+4])
		count := int(bo.Uint32(tiff[entryPos+4 : entryPos+8]))
		if fieldType != 2 || count <= 0 || count > 256 { // ASCII string
			continue
		}
		var valBytes []byte
		if count <= 4 {
			valBytes = tiff[entryPos+8 : entryPos+8+count]
		} else {
			strOffset := int(bo.Uint32(tiff[entryPos+8 : entryPos+12]))
			if strOffset >= 0 && strOffset+count <= len(tiff) {
				valBytes = tiff[strOffset : strOffset+count]
			}
		}
		val := strings.TrimSpace(strings.TrimRight(string(valBytes), "\x00"))
		switch tag {
		case 0x010F:
			makeStr = val
		case 0x0110:
			modelStr = val
		case 0x0132, 0x9003:
			dateStr = val
		}
	}
	return makeStr, modelStr, dateStr
}
