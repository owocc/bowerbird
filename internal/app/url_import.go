package app

import (
	"errors"
	"fmt"
	"net/url"
	"strings"

	"bowerbird/core"
	"bowerbird/internal/plugin"

	"github.com/egoist/mygo/transfer"
	"github.com/egoist/mygo/ui"
)

// attachURLDropTarget makes a native view accept URLs dragged from a browser,
// Finder/Explorer, or another application. File-only drags are ignored here and
// continue through Window.OnFileDrop.
func (a *App) attachURLDropTarget(el ui.Element) {
	opts := transfer.DropOptions{
		Formats:    []transfer.Format{transfer.URIList, transfer.Text},
		Operations: transfer.Copy,
	}
	if _, over := ui.DataDragOver(el, opts); over {
		// Keep the drop target unobtrusive; the toast reports the result.
	}
	if drop, ok := ui.DropData(el, opts); ok {
		// Finder/Explorer drags also advertise a URI list. Route their file
		// URLs through the normal native-drop path instead of swallowing them.
		if files, err := drop.Data.Files(); err == nil && len(files) > 0 {
			a.HandleDrop(files)
			return
		}
		if urls := urlsFromDropData(drop.Data); len(urls) > 0 {
			folder := a.dropFolderID
			a.dropFolderID = ""
			a.handleURLDropsToFolder(urls, folder)
		}
	}
}

func urlsFromDropData(data transfer.Data) []string {
	var raw []string
	if urls, err := data.URLs(); err == nil {
		raw = append(raw, urls...)
	}
	if text, err := data.Read(transfer.Text); err == nil {
		raw = append(raw, strings.Split(string(text), "\n")...)
	}
	return normalizeDroppedURLs(raw)
}

func normalizeDroppedURLs(raw []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, candidate := range raw {
		for _, line := range strings.Split(candidate, "\n") {
			line = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "\ufeff"))
			if line == "" {
				continue
			}
			// Browser text drags sometimes prefix the link with its title.
			lowerLine := strings.ToLower(line)
			if idx := strings.Index(lowerLine, "https://"); idx > 0 {
				line = line[idx:]
			} else if idx := strings.Index(lowerLine, "http://"); idx > 0 {
				line = line[idx:]
			}
			line = strings.TrimRight(line, ".,;:!?)]}>\"'")
			if !strings.Contains(line, "://") && strings.Contains(line, ".") {
				line = "https://" + line
			}
			u, err := url.Parse(line)
			if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
				continue
			}
			key := u.String()
			if seen[key] {
				continue
			}
			seen[key] = true
			out = append(out, key)
		}
	}
	return out
}

func splitDroppedPaths(paths []string) (urls, files []string) {
	for _, raw := range paths {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" {
			continue
		}
		lower := strings.ToLower(trimmed)
		// Keep URL detection explicit so filesystem paths such as /tmp/a.jpg
		// never become URLs.
		if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
			urls = append(urls, trimmed)
			continue
		}
		files = append(files, raw)
	}
	return urls, files
}

// handleURLDrops resolves every dropped URL through the plugin index. The first
// matching resolver runs and returns media candidates; only if no plugin claims
// the URL does the host try the URL itself as a direct media download.
func (a *App) handleURLDropsToFolder(rawURLs []string, folderID string) {
	if a.svc == nil {
		return
	}
	urls := normalizeDroppedURLs(rawURLs)
	if len(urls) == 0 {
		return
	}
	a.showToast(a.t("dropzone.urlImporting"))
	go func() {
		imported := 0
		var firstErr error
		for _, raw := range urls {
			item, err := a.importURL(raw, folderID)
			if err != nil {
				if firstErr == nil {
					firstErr = err
				}
				continue
			}
			if item != nil {
				imported++
			}
		}
		a.post(func() {
			if firstErr != nil {
				a.showToast(firstErr.Error())
			} else if imported > 0 {
				a.showToast(a.t("dropzone.urlImported"))
			}
			if imported > 0 {
				a.refreshAll()
			}
		})
	}()
}

func (a *App) importURL(raw string, folderID string) (*core.Item, error) {
	var resolverID string
	var resolution *plugin.ResolveResult
	if a.pluginHost != nil {
		res, id, err := a.pluginHost.Resolve(raw)
		if err == nil && res != nil {
			resolution, resolverID = res, id
		} else if err != nil && !errors.Is(err, plugin.ErrNoURLResolver) {
			if id != "" {
				return nil, fmt.Errorf("%s: %w", id, err)
			}
			return nil, err
		}
	}

	opts := core.ImportItemOptions{SkipURL: !a.prefs.RecordImportURL}
	if a.prefs.RecordImportURL {
		opts.URL = raw
	}
	if folderID != "" {
		opts.FolderIDs = []string{folderID}
	} else if a.nav == NavFolder && a.folderID != "" {
		opts.FolderIDs = []string{a.folderID}
	}

	candidates := []string{raw}
	if resolution != nil {
		if a.prefs.RecordImportURL {
			opts.URL = firstNonEmpty(resolution.SourceURL, raw)
		} else {
			opts.URL = ""
			opts.SkipURL = true
		}
		opts.Name = resolution.Name
		opts.Tags = resolution.Tags
		if resolverID != "" {
			if p, ok := a.pluginHost.Get(resolverID); ok && p.Settings != nil {
				if cookie := strings.TrimSpace(p.Settings["cookie"]); cookie != "" {
					opts.Headers = map[string]string{"Cookie": cookie}
				}
			}
		}
		candidates = uniqueURLs(append([]string{resolution.URL}, resolution.Candidates...))
	}
	if len(candidates) == 0 {
		return nil, errors.New("plugin returned no media URL")
	}

	var lastErr error
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		item, err := a.svc.ImportFromURLWithOptions(candidate, opts)
		if err == nil && item != nil {
			return item, nil
		}
		if err != nil {
			lastErr = err
		}
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, errors.New("URL import failed")
}

func uniqueURLs(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
