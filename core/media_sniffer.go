package core

import (
	"bytes"
	"mime"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"
)

// SniffMediaBytes inspects the byte payload to determine the true file extension and MIME type.
func SniffMediaBytes(data []byte) (ext string, mimeType string) {
	n := len(data)
	if n == 0 {
		return "", ""
	}

	// 1. PNG: \x89PNG\r\n\x1a\n
	if n >= 8 && bytes.Equal(data[:8], []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}) {
		return "png", "image/png"
	}

	// 2. JPEG: \xff\xd8\xff
	if n >= 3 && data[0] == 0xff && data[1] == 0xd8 && data[2] == 0xff {
		return "jpg", "image/jpeg"
	}

	// 3. GIF: GIF87a or GIF89a
	if n >= 6 && (string(data[:6]) == "GIF87a" || string(data[:6]) == "GIF89a") {
		return "gif", "image/gif"
	}

	// 4. WebP: RIFF....WEBP
	if n >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		return "webp", "image/webp"
	}

	// 5. AVIF / MP4 / MOV: ....ftyp<brand>
	if n >= 12 && string(data[4:8]) == "ftyp" {
		brand := strings.ToLower(strings.TrimSpace(string(data[8:12])))
		if brand == "avif" || brand == "avis" {
			return "avif", "image/avif"
		}
		if brand == "isom" || brand == "iso2" || brand == "mp41" || brand == "mp42" {
			return "mp4", "video/mp4"
		}
		if brand == "qt" {
			return "mov", "video/quicktime"
		}
	}

	// 6. Matroska / WebM: \x1a\x45\xdf\xa3
	if n >= 4 && data[0] == 0x1a && data[1] == 0x45 && data[2] == 0xdf && data[3] == 0xa3 {
		checkLen := min(n, 4096)
		if bytes.Contains(data[:checkLen], []byte("webm")) {
			return "webm", "video/webm"
		}
		return "mkv", "video/x-matroska"
	}

	// 7. BMP: BM
	if n >= 2 && data[0] == 'B' && data[1] == 'M' {
		return "bmp", "image/bmp"
	}

	// 8. ICO: \x00\x00\x01\x00
	if n >= 4 && data[0] == 0x00 && data[1] == 0x00 && data[2] == 0x01 && data[3] == 0x00 {
		return "ico", "image/x-icon"
	}

	// 9. TIFF: II*\x00 (little-endian) or MM\x00* (big-endian)
	if n >= 4 && ((data[0] == 'I' && data[1] == 'I' && data[2] == 0x2a && data[3] == 0x00) ||
		(data[0] == 'M' && data[1] == 'M' && data[2] == 0x00 && data[3] == 0x2a)) {
		return "tiff", "image/tiff"
	}

	// 10. PDF: %PDF-
	if n >= 5 && string(data[:5]) == "%PDF-" {
		return "pdf", "application/pdf"
	}

	// 11. SVG: XML or SVG tag
	checkLen := min(n, 1024)
	chunk := strings.ToLower(string(data[:checkLen]))
	if strings.Contains(chunk, "<svg") && (strings.Contains(chunk, "xmlns=") || strings.Contains(chunk, "http://www.w3.org/2000/svg") || strings.HasPrefix(strings.TrimSpace(chunk), "<svg")) {
		return "svg", "image/svg+xml"
	}

	// 12. Go standard library sniffer
	sniffed := http.DetectContentType(data)
	if sniffed != "" && sniffed != "application/octet-stream" {
		extFromMime := MimeToExtension(sniffed)
		if extFromMime != "" {
			return extFromMime, sniffed
		}
	}

	return "", ""
}

// MimeToExtension maps standard MIME types to file extensions.
func MimeToExtension(mimeType string) string {
	clean := strings.ToLower(strings.TrimSpace(strings.Split(mimeType, ";")[0]))
	switch clean {
	case "image/jpeg":
		return "jpg"
	case "image/png":
		return "png"
	case "image/webp":
		return "webp"
	case "image/avif":
		return "avif"
	case "image/gif":
		return "gif"
	case "image/svg+xml":
		return "svg"
	case "image/x-icon", "image/vnd.microsoft.icon":
		return "ico"
	case "image/bmp":
		return "bmp"
	case "image/tiff":
		return "tiff"
	case "video/mp4":
		return "mp4"
	case "video/webm":
		return "webm"
	case "video/quicktime":
		return "mov"
	case "application/pdf":
		return "pdf"
	default:
		return ""
	}
}

// SanitizeFilename removes illegal characters from filename.
func SanitizeFilename(name string) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return ""
	}

	var sb strings.Builder
	for _, r := range trimmed {
		switch r {
		case '/', '\\', ':', '*', '?', '"', '<', '>', '|':
			sb.WriteRune('_')
		default:
			if r < 32 {
				sb.WriteRune('_')
			} else {
				sb.WriteRune(r)
			}
		}
	}

	result := strings.Trim(sb.String(), " ._")
	return result
}

// ResolveMediaInfo determines accurate filename, extension, and MIME type
// using magic bytes sniffing, Content-Disposition, Content-Type, URL path, and user options.
func ResolveMediaInfo(rawURL string, respHeader http.Header, data []byte, customName string) (finalFilename string, finalExt string, finalMime string) {
	// 1. Sniff magic bytes from actual downloaded payload (most authoritative)
	sniffExt, sniffMime := SniffMediaBytes(data)

	// 2. Parse Content-Type header
	var headerExt string
	var headerMime string
	if respHeader != nil {
		ct := respHeader.Get("Content-Type")
		if ct != "" {
			if medType, _, err := mime.ParseMediaType(ct); err == nil {
				headerMime = medType
				headerExt = MimeToExtension(medType)
			}
		}
	}

	// 3. Parse Content-Disposition header
	var dispositionFilename string
	if respHeader != nil {
		cd := respHeader.Get("Content-Disposition")
		if cd != "" {
			if _, params, err := mime.ParseMediaType(cd); err == nil {
				if fn, ok := params["filename*"]; ok && fn != "" {
					dispositionFilename = fn
				} else if fn, ok := params["filename"]; ok && fn != "" {
					dispositionFilename = fn
				}
			}
		}
	}

	// 4. Parse URL path
	var urlFilename string
	var urlExt string
	if parsed, err := url.Parse(rawURL); err == nil && parsed.Path != "" {
		if unescaped, uErr := url.PathUnescape(parsed.Path); uErr == nil {
			base := filepath.Base(unescaped)
			if base != "" && base != "/" && base != "." {
				urlFilename = base
				if ext := filepath.Ext(base); ext != "" {
					urlExt = strings.ToLower(strings.TrimPrefix(ext, "."))
				}
			}
		}
	}

	// 5. Determine the true extension
	switch {
	case sniffExt != "":
		finalExt = sniffExt
		finalMime = sniffMime
	case headerExt != "":
		finalExt = headerExt
		finalMime = headerMime
	case dispositionFilename != "" && filepath.Ext(dispositionFilename) != "":
		finalExt = strings.ToLower(strings.TrimPrefix(filepath.Ext(dispositionFilename), "."))
		finalMime = DetectMimeType("", finalExt)
	case urlExt != "":
		finalExt = urlExt
		finalMime = DetectMimeType("", finalExt)
	default:
		finalExt = "png"
		finalMime = "image/png"
	}

	// 6. Determine base name without extension
	var baseName string
	cleanCustom := strings.TrimSpace(customName)
	if cleanCustom != "" {
		// Strip any extension the user/caller might have appended, so true extension is used
		baseName = SanitizeFilename(strings.TrimSuffix(cleanCustom, filepath.Ext(cleanCustom)))
	}

	if baseName == "" && dispositionFilename != "" {
		baseName = SanitizeFilename(strings.TrimSuffix(dispositionFilename, filepath.Ext(dispositionFilename)))
	}

	if baseName == "" && urlFilename != "" {
		candidate := strings.TrimSuffix(urlFilename, filepath.Ext(urlFilename))
		lower := strings.ToLower(candidate)
		// Avoid generic placeholder names from CDNs
		if lower != "index" && lower != "default" && lower != "image" && lower != "media" && lower != "view" && lower != "download" && lower != "file" {
			baseName = SanitizeFilename(candidate)
		}
	}

	if baseName == "" {
		baseName = SanitizeFilename(time.Now().Format("web_20060102_150405"))
	}

	finalFilename = baseName + "." + finalExt
	return finalFilename, finalExt, finalMime
}
