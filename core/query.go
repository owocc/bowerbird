package core

import (
	"errors"
	"fmt"
	"sort"
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

// QueryPage is one page of a desktop query, including the full filtered total
// and byte size so the UI can render counts without loading the whole library.
type QueryPage struct {
	Items     []Item `json:"items"`
	Total     int    `json:"total"`
	TotalSize int64  `json:"totalSize"`
	Offset    int    `json:"offset"`
	Limit     int    `json:"limit"`
}

// WorkspaceStats carries the library-wide numbers the desktop sidebar and
// filter bar display. TopColors samples the first 1,000 items in sort order,
// matching the previous frontend calculation.
type WorkspaceStats struct {
	Total              int      `json:"total"`
	UntaggedCount      int      `json:"untaggedCount"`
	UncategorizedCount int      `json:"uncategorizedCount"`
	TotalSize          int64    `json:"totalSize"`
	TopColors          []string `json:"topColors"`
}

// FolderPreview is the first few items and the total for one folder scope.
type FolderPreview struct {
	Total     int    `json:"total"`
	TotalSize int64  `json:"totalSize"`
	Items     []Item `json:"items"`
}

// QueryItems filters and paginates the active library using the shared query
// engine. It returns the filtered total alongside the requested page.
func (m *LibraryManager) QueryItems(spec QuerySpec, sortOrder string, offset int, limit int) ([]Item, int, error) {
	page, err := m.QueryPage(spec, sortOrder, offset, limit, nil, false)
	if err != nil {
		return nil, 0, err
	}
	return page.Items, page.Total, nil
}

// QueryPage is the desktop-facing query entry point. folderScope is an
// additional OR filter over folder IDs (the "include subfolders" view) and
// onlyUnrated adds the rating=0 predicate that the query grammar deliberately
// does not expose. Both are ANDed with the parsed query string; the public
// /api/v1/query contract is unchanged.
func (m *LibraryManager) QueryPage(spec QuerySpec, sortOrder string, offset int, limit int, folderScope []string, onlyUnrated bool) (QueryPage, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	if offset < 0 {
		offset = 0
	}
	page := QueryPage{Items: []Item{}, Offset: offset, Limit: limit}

	m.mu.RLock()
	db := m.db
	active := m.activeLib
	m.mu.RUnlock()
	if db == nil || active == nil {
		return page, nil
	}
	if err := m.ensureCacheLoaded(); err != nil {
		return page, err
	}

	var scope map[string]struct{}
	if len(folderScope) > 0 {
		scope = make(map[string]struct{}, len(folderScope))
		for _, id := range folderScope {
			if id != "" {
				scope[id] = struct{}{}
			}
		}
	}

	text := strings.ToLower(strings.TrimSpace(spec.Text))
	isAsc := strings.ToLower(sortOrder) == "asc"

	m.cacheMu.RLock()
	defer m.cacheMu.RUnlock()

	n := len(m.itemsDesc)
	matched := 0
	for step := 0; step < n; step++ {
		idx := step
		if isAsc {
			idx = n - 1 - step
		}
		it := &m.itemsDesc[idx]
		if text != "" && !strings.Contains(m.searchIndex[it.ID], text) {
			continue
		}
		if !spec.matches(it) {
			continue
		}
		if onlyUnrated && it.Rating != 0 {
			continue
		}
		if scope != nil && !itemInFolderScope(it, scope) {
			continue
		}
		page.Total++
		page.TotalSize += it.Size
		if matched >= offset && len(page.Items) < limit {
			page.Items = append(page.Items, *it)
		}
		matched++
	}
	return page, nil
}

func itemInFolderScope(item *Item, scope map[string]struct{}) bool {
	for _, id := range item.Folders {
		if _, ok := scope[id]; ok {
			return true
		}
	}
	return false
}

// WorkspaceStats computes the sidebar/filter-bar aggregates in one pass over
// the in-memory index.
func (m *LibraryManager) WorkspaceStats(sortOrder string) (WorkspaceStats, error) {
	stats := WorkspaceStats{TopColors: []string{}}
	m.mu.RLock()
	db := m.db
	active := m.activeLib
	m.mu.RUnlock()
	if db == nil || active == nil {
		return stats, nil
	}
	if err := m.ensureCacheLoaded(); err != nil {
		return stats, err
	}

	isAsc := strings.ToLower(sortOrder) == "asc"
	m.cacheMu.RLock()
	defer m.cacheMu.RUnlock()

	n := len(m.itemsDesc)
	stats.Total = n
	colorCounts := make(map[string]int)
	colorOrder := make([]string, 0, 8)
	sampled := 0
	for step := 0; step < n; step++ {
		idx := step
		if isAsc {
			idx = n - 1 - step
		}
		it := &m.itemsDesc[idx]
		stats.TotalSize += it.Size
		if len(it.Tags) == 0 {
			stats.UntaggedCount++
		}
		if len(it.Folders) == 0 {
			stats.UncategorizedCount++
		}
		if sampled < 1000 {
			sampled++
			if it.DominantColor != "" {
				hex := strings.ToUpper(it.DominantColor)
				if _, seen := colorCounts[hex]; !seen {
					colorOrder = append(colorOrder, hex)
				}
				colorCounts[hex]++
			}
		}
	}

	sort.SliceStable(colorOrder, func(i, j int) bool {
		return colorCounts[colorOrder[i]] > colorCounts[colorOrder[j]]
	})
	if len(colorOrder) > 8 {
		colorOrder = colorOrder[:8]
	}
	stats.TopColors = colorOrder
	return stats, nil
}

// FolderPreviews returns, for each folder-ID group, the full distinct count and
// a four-item cover. Groups are evaluated independently so the caller can pass
// a folder plus its descendants for "include subfolders". Cover order mirrors
// the old frontend: walk the group's folder IDs in order, then each folder's
// items in the current sort order.
func (m *LibraryManager) FolderPreviews(folderGroups [][]string, sortOrder string) ([]FolderPreview, error) {
	previews := make([]FolderPreview, len(folderGroups))
	sets := make([]map[string]struct{}, len(folderGroups))
	for i, group := range folderGroups {
		set := make(map[string]struct{}, len(group))
		for _, id := range group {
			if id != "" {
				set[id] = struct{}{}
			}
		}
		sets[i] = set
		previews[i] = FolderPreview{Items: []Item{}}
	}

	m.mu.RLock()
	db := m.db
	active := m.activeLib
	m.mu.RUnlock()
	if db == nil || active == nil {
		return previews, nil
	}
	if err := m.ensureCacheLoaded(); err != nil {
		return previews, err
	}

	isAsc := strings.ToLower(sortOrder) == "asc"
	m.cacheMu.RLock()
	defer m.cacheMu.RUnlock()

	// First four items per folder in sort order; enough to build any cover.
	folderFirst := make(map[string][]Item, len(folderGroups)*2)
	n := len(m.itemsDesc)
	for step := 0; step < n; step++ {
		idx := step
		if isAsc {
			idx = n - 1 - step
		}
		it := &m.itemsDesc[idx]
		for _, fid := range it.Folders {
			if len(folderFirst[fid]) < 4 {
				folderFirst[fid] = append(folderFirst[fid], *it)
			}
		}
		for gi, set := range sets {
			if len(set) == 0 || !itemInFolderScope(it, set) {
				continue
			}
			previews[gi].Total++
			previews[gi].TotalSize += it.Size
		}
	}

	for gi, group := range folderGroups {
		seen := make(map[string]struct{}, 4)
		for _, fid := range group {
			for _, it := range folderFirst[fid] {
				if len(previews[gi].Items) >= 4 {
					break
				}
				if _, ok := seen[it.ID]; ok {
					continue
				}
				seen[it.ID] = struct{}{}
				previews[gi].Items = append(previews[gi].Items, it)
			}
			if len(previews[gi].Items) >= 4 {
				break
			}
		}
	}
	return previews, nil
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
