package core

import (
	"bytes"
	"html"
	"net/url"
	"regexp"
	"strings"
)

// HTML extraction recovers media URLs from a drag's HTML fragment. Browsers
// usually put the *page* URL on the URI list when an image is wrapped in a
// link (the common case on image sites), while the HTML representation still
// contains the <img> the user actually grabbed. Reading that fragment lets the
// host download the image directly instead of parsing the page over HTTP.
//
// The parser is deliberately small: only the tags that carry a media URL are
// inspected, no DOM is built, and every reference is resolved against the page
// URL. Malformed markup is tolerated because the input is arbitrary HTML.

var (
	htmlTagRe     = regexp.MustCompile(`(?is)<(meta|img|link|source|a|base)\b[^>]*>`)
	htmlAttrRe    = regexp.MustCompile(`(?is)([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))`)
	htmlCommentRe = regexp.MustCompile(`(?s)<!--.*?-->`)
	htmlScriptRe  = regexp.MustCompile(`(?is)<script\b[^>]*>.*?</script>`)
	htmlStyleRe   = regexp.MustCompile(`(?is)<style\b[^>]*>.*?</style>`)
)

// mediaMetaKeys are checked in order; the first ones yield the best candidate
// because pages advertise their canonical media in Open Graph/Twitter tags.
var mediaMetaKeys = []string{
	"og:image",
	"og:image:url",
	"og:image:secure_url",
	"twitter:image",
	"twitter:image:src",
	"image_src",
	"thumbnail",
	"og:video",
	"og:video:url",
	"og:video:secure_url",
	"twitter:player:stream",
}

// LooksLikeHTML reports whether a response body is a web page. Callers check
// for a sniffed media type first, so an SVG or an XML feed is not treated as a
// page just because it starts with a "<".
func LooksLikeHTML(contentType string, data []byte) bool {
	ct := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	if ct == "text/html" || ct == "application/xhtml+xml" {
		return true
	}
	if ct != "" && ct != "application/octet-stream" && ct != "text/plain" {
		return false
	}
	head := data
	if len(head) > 1024 {
		head = head[:1024]
	}
	lower := strings.ToLower(string(head))
	return strings.Contains(lower, "<!doctype html") || strings.Contains(lower, "<html") ||
		strings.Contains(lower, "<head") || strings.Contains(lower, "<body")
}

// ExtractMediaFromHTML returns media URLs advertised by the page, best first,
// and a referer value (the page URL) for downloading them.
func ExtractMediaFromHTML(pageURL string, data []byte) ([]string, string) {
	if len(data) == 0 {
		return nil, pageURL
	}
	base := resolveHTMLURL(pageURL, pageURL)
	body := html.UnescapeString(string(data))
	body = htmlCommentRe.ReplaceAllString(body, " ")
	body = htmlScriptRe.ReplaceAllString(body, " ")
	body = htmlStyleRe.ReplaceAllString(body, " ")

	meta := map[string]string{}
	var imgCandidates []string
	var anchorReferer string
	foundBase := ""

	for _, tag := range htmlTagRe.FindAllString(body, -1) {
		name := strings.ToLower(tagName(tag))
		attrs := htmlAttrs(tag)
		switch name {
		case "base":
			if href := firstAttr(attrs, "href"); href != "" && foundBase == "" {
				foundBase = resolveHTMLURL(base, href)
			}
		case "meta":
			key := strings.ToLower(firstAttr(attrs, "property", "name", "itemprop"))
			content := firstAttr(attrs, "content")
			if key != "" && content != "" {
				if _, exists := meta[key]; !exists {
					meta[key] = content
				}
			}
		case "link":
			rel := strings.ToLower(firstAttr(attrs, "rel"))
			if strings.Contains(rel, "image_src") {
				if href := firstAttr(attrs, "href"); href != "" {
					imgCandidates = append(imgCandidates, resolveHTMLURL(base, href))
				}
			}
		case "img", "source":
			// Lazy-loading sites keep the real URL in data-src/srcset while src
			// is a placeholder, so every attribute is considered.
			for _, key := range []string{"src", "data-src", "data-original", "data-lazy-src", "data-url"} {
				if v := firstAttr(attrs, key); v != "" {
					imgCandidates = append(imgCandidates, resolveHTMLURL(base, v))
				}
			}
			if srcset := firstAttr(attrs, "srcset", "data-srcset"); srcset != "" {
				if v := largestSrcsetURL(srcset); v != "" {
					imgCandidates = append(imgCandidates, resolveHTMLURL(base, v))
				}
			}
		case "a":
			if href := firstAttr(attrs, "href"); href != "" && anchorReferer == "" {
				resolved := resolveHTMLURL(base, href)
				if isHTTPURL(resolved) && !looksLikeMediaURL(resolved) {
					anchorReferer = resolved
				}
			}
		}
	}

	referer := anchorReferer
	if referer == "" {
		referer = base
	}
	if referer == "" {
		referer = pageURL
	}

	seen := map[string]bool{}
	var out []string
	add := func(raw string) {
		u := strings.TrimSpace(raw)
		if u == "" || seen[u] || !isHTTPURL(u) {
			return
		}
		seen[u] = true
		out = append(out, u)
	}
	for _, key := range mediaMetaKeys {
		if v := meta[key]; v != "" {
			add(resolveHTMLURL(base, v))
		}
	}
	for _, v := range imgCandidates {
		add(v)
	}
	if len(out) > 16 {
		out = out[:16]
	}
	return out, referer
}

func tagName(tag string) string {
	tag = strings.TrimSpace(tag)
	if !strings.HasPrefix(tag, "<") {
		return ""
	}
	tag = tag[1:]
	end := 0
	for end < len(tag) {
		c := tag[end]
		if c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '/' || c == '>' {
			break
		}
		end++
	}
	return tag[:end]
}

func htmlAttrs(tag string) map[string]string {
	out := map[string]string{}
	for _, m := range htmlAttrRe.FindAllStringSubmatch(tag, -1) {
		if len(m) < 5 {
			continue
		}
		value := m[2]
		if value == "" {
			value = m[3]
		}
		if value == "" {
			value = m[4]
		}
		out[strings.ToLower(m[1])] = strings.TrimSpace(html.UnescapeString(value))
	}
	return out
}

func firstAttr(attrs map[string]string, keys ...string) string {
	for _, key := range keys {
		if v := attrs[strings.ToLower(key)]; v != "" {
			return v
		}
	}
	return ""
}

// largestSrcsetURL picks the last (usually largest) candidate in a srcset, as
// the widest rendition is what a user expects from a full-size import.
func largestSrcsetURL(srcset string) string {
	var best string
	for _, part := range strings.Split(srcset, ",") {
		fields := strings.Fields(strings.TrimSpace(part))
		if len(fields) == 0 {
			continue
		}
		best = fields[0]
	}
	return best
}

func resolveHTMLURL(base, ref string) string {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return ""
	}
	// CSS url(...) and quoted values occasionally appear in content attributes.
	ref = strings.Trim(ref, `"'`)
	if strings.HasPrefix(strings.ToLower(ref), "url(") {
		ref = strings.TrimSuffix(strings.TrimPrefix(ref, "url("), ")")
		ref = strings.Trim(ref, `"' `)
	}
	u, err := url.Parse(ref)
	if err != nil {
		return ""
	}
	if u.Scheme != "" {
		if u.Scheme == "http" || u.Scheme == "https" {
			return u.String()
		}
		return ""
	}
	if base == "" {
		return ""
	}
	b, err := url.Parse(base)
	if err != nil {
		return ""
	}
	return b.ResolveReference(u).String()
}

func isHTTPURL(raw string) bool {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return false
	}
	return (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

func looksLikeMediaURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	p := strings.ToLower(u.Path)
	for _, ext := range []string{".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".svg", ".mp4", ".webm", ".mov", ".m4v", ".pdf"} {
		if strings.HasSuffix(p, ext) {
			return true
		}
	}
	return false
}

func hasHeaderFold(headers map[string]string, key string) bool {
	for k, v := range headers {
		if strings.EqualFold(strings.TrimSpace(k), key) && strings.TrimSpace(v) != "" {
			return true
		}
	}
	return false
}

// originReferer is the fallback Referer used when a CDN rejects a direct
// image download. Hotlink protection commonly accepts the media host itself.
func originReferer(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" {
		return ""
	}
	return u.Scheme + "://" + u.Host + "/"
}

// isHTMLPayload reports whether the downloaded payload is a web page rather
// than media, using both the header and the sniffed magic bytes.
func isHTMLPayload(contentType string, data []byte) bool {
	if ext, _ := SniffMediaBytes(data); ext != "" {
		return false
	}
	if LooksLikeHTML(contentType, data) {
		return true
	}
	head := data
	if len(head) > 512 {
		head = head[:512]
	}
	return bytes.HasPrefix(bytes.TrimSpace(head), []byte("<"))
}
