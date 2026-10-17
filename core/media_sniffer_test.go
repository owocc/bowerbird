package core

import (
	"net/http"
	"testing"
)

func TestSniffMediaBytes(t *testing.T) {
	// PNG
	pngData := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0x00, 0x00}
	ext, mime := SniffMediaBytes(pngData)
	if ext != "png" || mime != "image/png" {
		t.Fatalf("expected png/image/png, got %s/%s", ext, mime)
	}

	// JPEG
	jpgData := []byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10}
	ext, mime = SniffMediaBytes(jpgData)
	if ext != "jpg" || mime != "image/jpeg" {
		t.Fatalf("expected jpg/image/jpeg, got %s/%s", ext, mime)
	}

	// WebP
	webpData := []byte{'R', 'I', 'F', 'F', 0x00, 0x00, 0x00, 0x00, 'W', 'E', 'B', 'P', 'V', 'P', '8'}
	ext, mime = SniffMediaBytes(webpData)
	if ext != "webp" || mime != "image/webp" {
		t.Fatalf("expected webp/image/webp, got %s/%s", ext, mime)
	}

	// AVIF
	avifData := []byte{0x00, 0x00, 0x00, 0x1c, 'f', 't', 'y', 'p', 'a', 'v', 'i', 'f'}
	ext, mime = SniffMediaBytes(avifData)
	if ext != "avif" || mime != "image/avif" {
		t.Fatalf("expected avif/image/avif, got %s/%s", ext, mime)
	}

	// SVG
	svgData := []byte(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40"/></svg>`)
	ext, mime = SniffMediaBytes(svgData)
	if ext != "svg" || mime != "image/svg+xml" {
		t.Fatalf("expected svg/image/svg+xml, got %s/%s", ext, mime)
	}
}

func TestResolveMediaInfo(t *testing.T) {
	// 1. URL has no extension, but Content-Type is webp and magic bytes are webp
	webpBytes := []byte{'R', 'I', 'F', 'F', 0x00, 0x00, 0x00, 0x00, 'W', 'E', 'B', 'P'}
	header := http.Header{}
	header.Set("Content-Type", "image/webp")
	fn, ext, mime := ResolveMediaInfo("https://example.com/api/profile_banner?id=12345", header, webpBytes, "")
	if ext != "webp" || mime != "image/webp" || fn != "profile_banner.webp" {
		t.Fatalf("unexpected resolve result: fn=%s ext=%s mime=%s", fn, ext, mime)
	}

	// 2. URL claims to be .jpg, but content bytes are actually WebP (very common CDN scenario)
	fn, ext, mime = ResolveMediaInfo("https://example.com/photos/avatar.jpg", header, webpBytes, "")
	if ext != "webp" || fn != "avatar.webp" {
		t.Fatalf("expected true extension webp, got fn=%s ext=%s", fn, ext)
	}

	// 3. Content-Disposition specifies filename
	header2 := http.Header{}
	header2.Set("Content-Disposition", `attachment; filename="original_artwork.png"`)
	pngBytes := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}
	fn, ext, mime = ResolveMediaInfo("https://cdn.art/download/42", header2, pngBytes, "")
	if ext != "png" || fn != "original_artwork.png" {
		t.Fatalf("expected original_artwork.png, got fn=%s ext=%s", fn, ext)
	}

	// 4. Custom name provided without extension
	fn, ext, mime = ResolveMediaInfo("https://example.com/pic", header, webpBytes, "My Artwork")
	if fn != "My Artwork.webp" || ext != "webp" {
		t.Fatalf("expected My Artwork.webp, got fn=%s", fn)
	}

	// 5. Custom name provided with wrong extension
	fn, ext, mime = ResolveMediaInfo("https://example.com/pic", header, webpBytes, "My Artwork.jpg")
	if fn != "My Artwork.webp" || ext != "webp" {
		t.Fatalf("expected My Artwork.webp, got fn=%s", fn)
	}
}
