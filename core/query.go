package core

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

// ErrInvalidQuery marks malformed query strings so HTTP handlers can return 400.
var ErrInvalidQuery = errors.New("invalid query")

// QuerySpec is the parsed form of a mobile query string.
//
// Text preserves the desktop search behaviour: the remaining free text is a
// single case-insensitive substring matched against name, tags, extension,
// hex, note and prompt by LibraryManager.GetItems.
type QuerySpec struct {
	Text          string
	Types         []string
	Tags          []string
	Folders       []string
	Colors        []string
	Orientations  []string
	Sizes         []string
	Ratings       []int
	Has           []string
	No            []string
	Untagged      bool
	Uncategorized bool
}

type queryToken struct {
	value  string
	quoted bool
}

// ParseQuery parses the query grammar documented in reports/通用查询API方案.md.
// Unknown key:value tokens are kept as free text for forward compatibility;
// malformed values for known filters are rejected.
func ParseQuery(raw string) (QuerySpec, error) {
	tokens, err := splitQueryTokens(raw)
	if err != nil {
		return QuerySpec{}, err
	}

	var spec QuerySpec
	var textParts []string

	for _, tok := range tokens {
		if tok.quoted {
			textParts = append(textParts, tok.value)
			continue
		}
		key, value, ok := strings.Cut(tok.value, ":")
		if !ok {
			textParts = append(textParts, tok.value)
			continue
		}
		key = strings.ToLower(strings.TrimSpace(key))
		value = strings.TrimSpace(value)

		recognized := true
		switch key {
		case "type":
			if value == "" {
				return QuerySpec{}, invalidQuery("type requires a value")
			}
			spec.Types = append(spec.Types, strings.TrimPrefix(strings.ToLower(value), "."))
		case "tag":
			if value == "" {
				return QuerySpec{}, invalidQuery("tag requires a value")
			}
			spec.Tags = append(spec.Tags, value)
		case "folder":
			if value == "" {
				return QuerySpec{}, invalidQuery("folder requires a value")
			}
			spec.Folders = append(spec.Folders, value)
		case "color":
			if _, _, _, valid := parseHexRGB(value); !valid {
				return QuerySpec{}, invalidQuery("color must be a #RRGGBB value")
			}
			spec.Colors = append(spec.Colors, value)
		case "orientation":
			switch strings.ToLower(value) {
			case "landscape", "portrait", "square":
				spec.Orientations = append(spec.Orientations, strings.ToLower(value))
			default:
				return QuerySpec{}, invalidQuery("orientation must be landscape, portrait or square")
			}
		case "size":
			switch strings.ToLower(value) {
			case "small", "medium", "large":
				spec.Sizes = append(spec.Sizes, strings.ToLower(value))
			default:
				return QuerySpec{}, invalidQuery("size must be small, medium or large")
			}
		case "rating":
			rating, convErr := strconv.Atoi(value)
			if convErr != nil || rating < 1 || rating > 5 {
				return QuerySpec{}, invalidQuery("rating must be an integer from 1 to 5")
			}
			spec.Ratings = append(spec.Ratings, rating)
		case "no":
			switch strings.ToLower(value) {
			case "url", "note", "prompt", "tag", "folder":
				spec.No = append(spec.No, strings.ToLower(value))
			default:
				return QuerySpec{}, invalidQuery("no must be url, note, prompt, tag or folder")
			}
		case "has":
			switch strings.ToLower(value) {
			case "url", "note", "prompt", "tag", "folder":
				spec.Has = append(spec.Has, strings.ToLower(value))
			default:
				return QuerySpec{}, invalidQuery("has must be url, note, prompt, tag or folder")
			}
		case "is":
			switch strings.ToLower(value) {
			case "untagged":
				spec.Untagged = true
			case "uncategorized":
				spec.Uncategorized = true
			default:
				return QuerySpec{}, invalidQuery("is must be untagged or uncategorized")
			}
		default:
			recognized = false
		}
		if !recognized {
			textParts = append(textParts, tok.value)
		}
	}

	spec.Text = strings.Join(textParts, " ")
	return spec, nil
}

func invalidQuery(message string) error {
	return fmt.Errorf("%w: %s", ErrInvalidQuery, message)
}

// splitQueryTokens splits on whitespace while honouring double quotes and
// backslash escapes. An unterminated quote is a malformed query.
func splitQueryTokens(raw string) ([]queryToken, error) {
	var tokens []queryToken
	var current strings.Builder
	inQuote := false
	escaped := false
	hasContent := false
	startsQuoted := false
	closedAtEnd := false

	flush := func() {
		if !hasContent {
			return
		}
		tokens = append(tokens, queryToken{
			value:  current.String(),
			quoted: startsQuoted && closedAtEnd,
		})
		current.Reset()
		hasContent = false
		startsQuoted = false
		closedAtEnd = false
	}

	for _, r := range raw {
		if escaped {
			current.WriteRune(r)
			hasContent = true
			closedAtEnd = false
			escaped = false
			continue
		}
		if inQuote && r == '\\' {
			escaped = true
			continue
		}
		if r == '"' {
			if inQuote {
				inQuote = false
				closedAtEnd = true
			} else {
				inQuote = true
				closedAtEnd = false
				if !hasContent {
					startsQuoted = true
				}
			}
			hasContent = true
			continue
		}
		if !inQuote && unicode.IsSpace(r) {
			flush()
			continue
		}
		if !inQuote && closedAtEnd {
			// A quote in the middle of a token (e.g. tag:"a b") does not make
			// the whole token a quoted free-text token.
			closedAtEnd = false
		}
		current.WriteRune(r)
		hasContent = true
	}
	if inQuote {
		return nil, invalidQuery("unterminated quoted value")
	}
	flush()
	return tokens, nil
}

// QueryItems filters and paginates the active library using the shared query
// engine. It returns the filtered total alongside the requested page.
func (m *LibraryManager) QueryItems(spec QuerySpec, sortOrder string, offset int, limit int) ([]Item, int, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	if offset < 0 {
		offset = 0
	}

	items, err := m.GetItems(spec.Text, sortOrder)
	if err != nil {
		return nil, 0, err
	}

	filtered := make([]Item, 0, len(items))
	for i := range items {
		if spec.matches(&items[i]) {
			filtered = append(filtered, items[i])
		}
	}

	total := len(filtered)
	if offset >= total {
		return []Item{}, total, nil
	}
	end := offset + limit
	if end > total {
		end = total
	}
	return filtered[offset:end], total, nil
}

func (s *QuerySpec) matches(item *Item) bool {
	for _, tag := range s.Tags {
		if !containsFold(item.Tags, tag) {
			return false
		}
	}
	for _, folder := range s.Folders {
		if strings.EqualFold(folder, "none") {
			if len(item.Folders) > 0 {
				return false
			}
			continue
		}
		if !containsExact(item.Folders, folder) {
			return false
		}
	}
	for _, color := range s.Colors {
		if !itemMatchesColor(*item, color) {
			return false
		}
	}
	for _, want := range s.Types {
		if !itemMatchesType(item, want) {
			return false
		}
	}
	for _, orientation := range s.Orientations {
		if itemOrientation(*item) != orientation {
			return false
		}
	}
	for _, size := range s.Sizes {
		if !itemMatchesSize(item.Size, size) {
			return false
		}
	}
	for _, rating := range s.Ratings {
		if item.Rating != rating {
			return false
		}
	}
	for _, field := range s.Has {
		if !itemHasField(item, field) {
			return false
		}
	}
	for _, field := range s.No {
		if itemHasField(item, field) {
			return false
		}
	}
	if s.Untagged && len(item.Tags) > 0 {
		return false
	}
	if s.Uncategorized && len(item.Folders) > 0 {
		return false
	}
	return true
}

func containsFold(values []string, want string) bool {
	for _, value := range values {
		if strings.EqualFold(value, want) {
			return true
		}
	}
	return false
}

func containsExact(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func itemMatchesType(item *Item, want string) bool {
	if fileCategory(item.Extension, item.MimeType) == want {
		return true
	}
	ext := strings.TrimPrefix(strings.ToLower(item.Extension), ".")
	return ext == strings.TrimPrefix(strings.ToLower(want), ".")
}

func itemMatchesSize(size int64, filter string) bool {
	const oneMB = int64(1024 * 1024)
	const tenMB = 10 * oneMB
	switch filter {
	case "small":
		return size < oneMB
	case "medium":
		return size >= oneMB && size <= tenMB
	case "large":
		return size > tenMB
	default:
		return true
	}
}

func itemHasField(item *Item, field string) bool {
	switch field {
	case "url":
		return strings.TrimSpace(item.URL) != ""
	case "note":
		return strings.TrimSpace(item.Note) != ""
	case "prompt":
		return strings.TrimSpace(item.Prompt) != ""
	case "tag":
		return len(item.Tags) > 0
	case "folder":
		return len(item.Folders) > 0
	default:
		return true
	}
}

// itemOrientation mirrors the desktop filter: stored EXIF orientation wins,
// then dimensions with a 5% square tolerance.
func itemOrientation(item Item) string {
	if item.Meta != nil && item.Meta.Orientation != "" {
		return item.Meta.Orientation
	}
	if item.Width <= 0 || item.Height <= 0 {
		return ""
	}
	ratio := float64(item.Width) / float64(item.Height)
	if ratio >= 0.95 && ratio <= 1.05 {
		return "square"
	}
	if item.Width > item.Height {
		return "landscape"
	}
	return "portrait"
}

// fileCategory mirrors frontend/src/lib/formatters.ts getFileCategory.
func fileCategory(ext, mimeType string) string {
	e := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(ext), "."))
	m := strings.ToLower(strings.TrimSpace(mimeType))
	if e == "ts" {
		if strings.HasPrefix(m, "video/") {
			return "video"
		}
		return "document"
	}
	switch e {
	case "png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "tiff", "tif", "avif", "ico":
		return "image"
	case "mp4", "mov", "qt", "mkv", "avi", "webm", "m4v", "flv", "f4v", "mts", "m2ts",
		"m3u8", "mpd", "ogv", "ogm", "3gp", "3g2", "wmv", "asf", "mpg", "mpeg", "m2v",
		"vob", "rmvb", "rm":
		return "video"
	case "mp3", "wav", "flac", "aac", "ogg", "m4a", "opus":
		return "audio"
	case "pdf", "txt", "md", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "json", "js", "go", "py":
		return "document"
	case "zip", "tar", "gz", "rar", "7z":
		return "archive"
	}
	if strings.HasPrefix(m, "video/") {
		return "video"
	}
	if strings.HasPrefix(m, "image/") {
		return "image"
	}
	if strings.HasPrefix(m, "audio/") {
		return "audio"
	}
	return "other"
}
