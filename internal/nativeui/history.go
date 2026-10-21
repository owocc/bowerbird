package nativeui

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"bowerbird/core"

	"github.com/egoist/mygo/transfer"
)

// dragHistoryEntry is one item dragged out of the library, as the webview
// keeps in localStorage. UsedAt is in milliseconds, most recent first.
type dragHistoryEntry struct {
	ItemID string `json:"itemId"`
	UsedAt int64  `json:"usedAt"`
}

const dragHistoryLimit = 500

// historySaveMu serializes the read-modify-write of the shared history file
// when several drags finish close together.
var historySaveMu sync.Mutex

// dragHistoryFile is where native keeps each library's history. The webview
// uses localStorage; the native build keeps the same shape in user data.
func dragHistoryFile() string {
	dir := core.UserDataDir()
	if dir == "" {
		return ""
	}
	return filepath.Join(dir, "native-drag-history.json")
}

// loadHistory reads every library's entries from disk. It runs on the main
// thread when a library opens; the file is small (a few KB per library).
func (a *App) loadHistory(libPath string) {
	a.historyLibrary = libPath
	a.history = nil
	if libPath == "" {
		return
	}
	path := dragHistoryFile()
	if path == "" {
		return
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var all map[string][]dragHistoryEntry
	if json.Unmarshal(raw, &all) != nil {
		return
	}
	a.history = all[libPath]
}

// applyHistory switches to the active library's history when the library
// changed, then recounts the collection.
func (a *App) applyHistory(lib *core.LibraryInfo) {
	path := ""
	if lib != nil {
		path = lib.Path
	}
	if path != a.historyLibrary {
		a.loadHistory(path)
	}
	a.historyCount = len(a.historyItems())
}

// saveHistory writes the history map off the main thread. Failures are not
// worth a toast: history is a convenience, not library data.
func (a *App) saveHistory() {
	path := dragHistoryFile()
	if path == "" || a.historyLibrary == "" {
		return
	}
	libPath := a.historyLibrary
	entries := append([]dragHistoryEntry(nil), a.history...)
	go func() {
		historySaveMu.Lock()
		defer historySaveMu.Unlock()
		all := map[string][]dragHistoryEntry{}
		if raw, err := os.ReadFile(path); err == nil {
			_ = json.Unmarshal(raw, &all)
		}
		all[libPath] = entries
		if len(all) > 50 {
			// Keep the most recently written libraries only.
			type libAge struct {
				path string
				at   int64
			}
			var ages []libAge
			for p, list := range all {
				var newest int64
				for _, e := range list {
					if e.UsedAt > newest {
						newest = e.UsedAt
					}
				}
				ages = append(ages, libAge{p, newest})
			}
			sort.Slice(ages, func(i, j int) bool { return ages[i].at > ages[j].at })
			for _, age := range ages[50:] {
				delete(all, age.path)
			}
		}
		raw, err := json.MarshalIndent(all, "", "  ")
		if err != nil {
			return
		}
		_ = os.MkdirAll(filepath.Dir(path), 0o755)
		tmp := path + ".tmp"
		if os.WriteFile(tmp, raw, 0o644) == nil {
			_ = os.Rename(tmp, path)
		}
	}()
}

// recordDragHistory puts ids at the front of the history, most recently used
// first, deduplicated and capped as the webview does.
func (a *App) recordDragHistory(ids []string) {
	if a.historyLibrary == "" || len(ids) == 0 {
		return
	}
	seen := map[string]bool{}
	now := time.Now().UnixMilli()
	fresh := make([]dragHistoryEntry, 0, len(ids))
	for i, id := range ids {
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		fresh = append(fresh, dragHistoryEntry{ItemID: id, UsedAt: now - int64(i)})
	}
	if len(fresh) == 0 {
		return
	}
	kept := make([]dragHistoryEntry, 0, len(a.history)+len(fresh))
	kept = append(kept, fresh...)
	for _, e := range a.history {
		if !seen[e.ItemID] {
			kept = append(kept, e)
		}
	}
	if len(kept) > dragHistoryLimit {
		kept = kept[:dragHistoryLimit]
	}
	a.update(func() {
		a.history = kept
		a.historyCount = len(a.historyItems())
		a.saveHistory()
		if a.view == viewHistory {
			a.markDirty()
		}
		a.host.invalidateAll()
	})
}

func (a *App) clearDragHistory() {
	if a.historyLibrary == "" {
		return
	}
	a.update(func() {
		a.history = nil
		a.historyCount = 0
		a.saveHistory()
		if a.view == viewHistory {
			a.markDirty()
			a.setView(viewAll)
		}
		a.host.invalidateAll()
	})
}

// dragOptionsFor records a drag that ends outside the app, as the webview's
// dragend listener does. Drops on folders or the trash are internal moves,
// not history.
func (a *App) dragOptionsFor(it *core.Item) transfer.DragOptions {
	ids := a.dragValuesFor(it)
	return transfer.DragOptions{
		Done: func(res transfer.Result) {
			// The webview records every drag that ends outside the app,
			// whatever effect the destination chose; only an internal drop
			// (folder or trash) is not history.
			if time.Since(a.lastInternalDrop) < 1500*time.Millisecond {
				return
			}
			if res.Err == nil && !res.Canceled {
				a.recordDragHistory(ids)
			}
		},
	}
}

func (a *App) markInternalDrop() { a.lastInternalDrop = time.Now() }
