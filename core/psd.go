package core

import (
	"encoding/binary"
	"errors"
	"fmt"
	"image"
	"image/color"
	"os"
	"strings"
)

// PSDInfo is the native preview's view of a Photoshop document.
type PSDInfo struct {
	Version   int
	Width     int
	Height    int
	Channels  int
	Depth     int
	ColorMode string
	Layers    []PSDLayer
}

// PSDLayer describes one layer record without decoding its pixels.
type PSDLayer struct {
	Name      string
	Visible   bool
	Opacity   int
	Width     int
	Height    int
	BlendMode string
}

// ReadPSD reads a PSD/PSB file and decodes its composite image.
func ReadPSD(path string) (*PSDInfo, image.Image, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, err
	}
	return DecodePSD(data)
}

// DecodePSD parses the Photoshop header, layer directory and composite image.
// Only 8-bit RGB documents are decoded into an image; other depths still return
// their metadata. The composite supports raw and PackBits (RLE) data.
func DecodePSD(data []byte) (*PSDInfo, image.Image, error) {
	if len(data) < 26 || string(data[:4]) != "8BPS" {
		return nil, nil, errors.New("not a Photoshop document")
	}
	version := int(binary.BigEndian.Uint16(data[4:6]))
	if version != 1 && version != 2 {
		return nil, nil, fmt.Errorf("unsupported PSD version %d", version)
	}
	info := &PSDInfo{Version: version}
	r := &psdReader{data: data, pos: 6}
	_ = r.skip(6) // reserved
	info.Channels = int(r.u16())
	info.Height = int(r.u32())
	info.Width = int(r.u32())
	info.Depth = int(r.u16())
	info.ColorMode = psdColorMode(r.u16())
	if r.err != nil {
		return nil, nil, r.err
	}
	if err := r.skipSection(); err != nil { // color mode data
		return nil, nil, err
	}
	if err := r.skipSection(); err != nil { // image resources
		return nil, nil, err
	}
	if info.Version == 1 {
		n := r.u32()
		if r.err != nil {
			return nil, nil, r.err
		}
		end := r.pos + int(n)
		if end > len(r.data) {
			return nil, nil, errors.New("truncated layer section")
		}
		info.Layers = parsePSDLayers(r.data[r.pos:end], version)
		r.pos = end
	} else {
		n := r.u64()
		if r.err != nil {
			return nil, nil, r.err
		}
		end := r.pos + int(n)
		if end > len(r.data) {
			return nil, nil, errors.New("truncated layer section")
		}
		info.Layers = parsePSDLayers(r.data[r.pos:end], version)
		r.pos = end
	}
	// Composite image data.
	if info.Depth != 8 || (info.ColorMode != "RGB" && info.ColorMode != "Grayscale") {
		return info, nil, nil
	}
	if r.pos+2 > len(r.data) {
		return info, nil, nil
	}
	compression := int(binary.BigEndian.Uint16(r.data[r.pos : r.pos+2]))
	r.pos += 2
	img, err := decodePSDComposite(r.data[r.pos:], info, compression)
	if err != nil {
		return info, nil, nil
	}
	return info, img, nil
}

func psdColorMode(v uint16) string {
	switch v {
	case 0:
		return "Bitmap"
	case 1:
		return "Grayscale"
	case 2:
		return "Indexed"
	case 3:
		return "RGB"
	case 4:
		return "CMYK"
	case 7:
		return "Multichannel"
	case 8:
		return "Duotone"
	case 9:
		return "Lab"
	default:
		return fmt.Sprintf("Mode %d", v)
	}
}

func parsePSDLayers(data []byte, version int) []PSDLayer {
	r := &psdReader{data: data}
	_ = r.u32() // layer info length
	count := int(int16(r.u16()))
	if count < 0 {
		count = -count
	}
	var layers []PSDLayer
	for i := 0; i < count && r.err == nil; i++ {
		top, left, bottom, right := int(int32(r.u32())), int(int32(r.u32())), int(int32(r.u32())), int(int32(r.u32()))
		channels := int(r.u16())
		if r.err != nil || channels > 64 {
			break
		}
		for c := 0; c < channels; c++ {
			_ = r.u16() // channel id
			if version == 1 {
				_ = r.u32()
			} else {
				_ = r.u64()
			}
		}
		sig := string(r.bytes(4))
		if sig != "8BIM" {
			break
		}
		blend := psdBlendName(r.bytes(4))
		opacity := int(r.u8())
		_ = r.u8() // clipping
		flags := r.u8()
		_ = r.u8()
		extraLen := int(r.u32())
		if version == 2 {
			extraLen = int(r.u64())
		}
		extraEnd := r.pos + extraLen
		if r.err != nil || extraEnd > len(r.data) {
			break
		}
		_ = r.u32() // layer mask data
		_ = r.u32() // blending ranges
		name := ""
		if r.pos < extraEnd {
			n := int(r.u8())
			if n > 0 && r.pos+n <= extraEnd {
				name = strings.TrimRight(string(r.data[r.pos:r.pos+n]), "\x00")
			}
		}
		r.pos = extraEnd
		layers = append(layers, PSDLayer{
			Name:      name,
			Visible:   flags&2 == 0,
			Opacity:   opacity,
			Width:     right - left,
			Height:    bottom - top,
			BlendMode: blend,
		})
	}
	return layers
}

func psdBlendName(b []byte) string {
	switch string(b) {
	case "norm":
		return "Normal"
	case "mul ":
		return "Multiply"
	case "scrn":
		return "Screen"
	case "over":
		return "Overlay"
	case "dark":
		return "Darken"
	case "lite":
		return "Lighten"
	case "diff":
		return "Difference"
	default:
		return string(b)
	}
}

func decodePSDComposite(data []byte, info *PSDInfo, compression int) (image.Image, error) {
	w, h, ch := info.Width, info.Height, info.Channels
	if w <= 0 || h <= 0 || ch <= 0 || w*h > 160_000_000 {
		return nil, errors.New("invalid PSD dimensions")
	}
	planes := make([][]byte, ch)
	for i := range planes {
		planes[i] = make([]byte, w*h)
	}
	if compression == 0 {
		need := w * h * ch
		if len(data) < need {
			return nil, errors.New("truncated raw composite")
		}
		for c := 0; c < ch; c++ {
			copy(planes[c], data[c*w*h:(c+1)*w*h])
		}
	} else if compression == 1 {
		counts := make([]int, ch*h)
		ps := 2
		if info.Version == 2 {
			ps = 4
		}
		if len(data) < len(counts)*ps {
			return nil, errors.New("truncated RLE table")
		}
		off := 0
		for i := range counts {
			if ps == 2 {
				counts[i] = int(binary.BigEndian.Uint16(data[off : off+2]))
			} else {
				counts[i] = int(binary.BigEndian.Uint32(data[off : off+4]))
			}
			off += ps
		}
		pos := off
		for c := 0; c < ch; c++ {
			for y := 0; y < h; y++ {
				n := counts[c*h+y]
				if pos+n > len(data) {
					return nil, errors.New("truncated RLE row")
				}
				row := planes[c][y*w : (y+1)*w]
				if err := unpackBits(data[pos:pos+n], row); err != nil {
					return nil, err
				}
				pos += n
			}
		}
	} else {
		return nil, fmt.Errorf("unsupported composite compression %d", compression)
	}
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			i := y*w + x
			var r, g, b uint8
			if info.ColorMode == "Grayscale" {
				r, g, b = planes[0][i], planes[0][i], planes[0][i]
			} else {
				r, g = planes[0][i], planes[1][i]
				if ch >= 3 {
					b = planes[2][i]
				}
			}
			a := uint8(255)
			if ch >= 4 {
				a = planes[3][i]
			}
			img.SetNRGBA(x, y, color.NRGBA{R: r, G: g, B: b, A: a})
		}
	}
	return img, nil
}

func unpackBits(src, dst []byte) error {
	di := 0
	for i := 0; i < len(src); {
		n := int(int8(src[i]))
		i++
		switch {
		case n >= 0:
			count := n + 1
			if i+count > len(src) || di+count > len(dst) {
				return errors.New("invalid PackBits literal")
			}
			copy(dst[di:di+count], src[i:i+count])
			i += count
			di += count
		case n >= -127:
			count := 1 - n
			if i >= len(src) || di+count > len(dst) {
				return errors.New("invalid PackBits repeat")
			}
			for k := 0; k < count; k++ {
				dst[di+k] = src[i]
			}
			i++
			di += count
		default:
			// n == -128 is a no-op.
		}
	}
	return nil
}

type psdReader struct {
	data []byte
	pos  int
	err  error
}

func (r *psdReader) need(n int) bool {
	if r.err != nil {
		return false
	}
	if r.pos+n > len(r.data) {
		r.err = errors.New("truncated PSD")
		return false
	}
	return true
}
func (r *psdReader) u8() uint8 {
	if !r.need(1) {
		return 0
	}
	v := r.data[r.pos]
	r.pos++
	return v
}
func (r *psdReader) u16() uint16 {
	if !r.need(2) {
		return 0
	}
	v := binary.BigEndian.Uint16(r.data[r.pos : r.pos+2])
	r.pos += 2
	return v
}
func (r *psdReader) u32() uint32 {
	if !r.need(4) {
		return 0
	}
	v := binary.BigEndian.Uint32(r.data[r.pos : r.pos+4])
	r.pos += 4
	return v
}
func (r *psdReader) u64() uint64 {
	if !r.need(8) {
		return 0
	}
	v := binary.BigEndian.Uint64(r.data[r.pos : r.pos+8])
	r.pos += 8
	return v
}
func (r *psdReader) bytes(n int) []byte {
	if !r.need(n) {
		return nil
	}
	v := r.data[r.pos : r.pos+n]
	r.pos += n
	return v
}
func (r *psdReader) skip(n int) error {
	if !r.need(n) {
		return r.err
	}
	r.pos += n
	return nil
}
func (r *psdReader) skipSection() error {
	n := r.u32()
	if r.err != nil {
		return r.err
	}
	return r.skip(int(n))
}
