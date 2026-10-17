package core

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	_ "golang.org/x/image/bmp"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
	_ "modernc.org/sqlite"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// FavoriteTagName is the built-in "Favorites" tag.
//
// Its value is a historical sentinel shared with the frontend
// (see frontend/src/lib/favoriteTag.ts) and kept unchanged for backward
// compatibility with existing libraries. It is *data*, never UI copy: the
// frontend renders a localised label instead of this value.
const FavoriteTagName = "收藏"

// LibraryManager coordinates library lifecycle, storage, SQLite indexing, and user data.
type LibraryManager struct {
	mu          sync.RWMutex
	app         *application.App
	window      application.Window
	activeLib   *LibraryInfo
	db          *sql.DB
	userData    *UserDataStore
	assetServer *AssetServer

	// High-speed in-memory index for sub-millisecond queries and searches
	cacheMu     sync.RWMutex
	cacheLoaded bool
	itemsDesc   []Item          // non-trashed items sorted by ImportedAt DESC
	trashDesc   []Item          // trashed items sorted by TrashedAt DESC, ImportedAt DESC
	itemsByID   map[string]Item // O(1) lookup by ID or Hex (includes trashed & active)
	searchIndex map[string]string

	// Per-content-hash locks so concurrent imports of identical files never race on disk
	itemLocks sync.Map
}

var ioCopyBufPool = sync.Pool{
	New: func() any {
		buf := make([]byte, 256*1024)
		return &buf
	},
}

// NewLibraryManager initializes the manager, user data store, and asset server,
// and automatically mounts the remembered library if present.
func NewLibraryManager() *LibraryManager {
	mgr := &LibraryManager{}

	// Initialize ultra-thin user data store
	store, err := NewUserDataStore()
	if err != nil {
		log.Printf("[Core] failed to initialize user data store: %v", err)
	}
	mgr.userData = store

	// Start internal HTTP asset streaming server
	mgr.assetServer = newAssetServer(mgr)

	// Automatically mount remembered library on launch
	if store != nil {
		savedPath := store.GetActiveLibraryPath()
		if savedPath != "" {
			if _, statErr := os.Stat(savedPath); statErr == nil {
				if _, openErr := mgr.OpenLibrary(savedPath); openErr != nil {
					log.Printf("[Core] failed to restore saved library %s: %v", savedPath, openErr)
				} else {
					log.Printf("[Core] successfully restored library: %s", savedPath)
				}
			}
		}
	}

	return mgr
}

func (m *LibraryManager) SetApp(app *application.App) {
	m.app = app
}

func (m *LibraryManager) GetApp() *application.App {
	return m.app
}

func (m *LibraryManager) SetWindow(w application.Window) {
	m.window = w
}

func (m *LibraryManager) getWindow() application.Window {
	if m.window != nil {
		return m.window
	}
	if m.app != nil {
		return m.app.Window.Current()
	}
	return nil
}

// GetUserDataStore returns the user data store instance.
func (m *LibraryManager) GetUserDataStore() *UserDataStore {
	return m.userData
}

// GetAssetServerPort returns the local HTTP port.
func (m *LibraryManager) GetAssetServerPort() int {
	if m.assetServer != nil {
		return m.assetServer.getPort()
	}
	return 0
}

// CreateLibrary creates a new xxx.library container, initializes SQLite, and remembers it in user data.
func (m *LibraryManager) CreateLibrary(parentDir string, libName string) (*LibraryInfo, error) {
	if strings.TrimSpace(parentDir) == "" {
		return nil, errors.New("parent directory is required")
	}
	cleanName := strings.TrimSpace(libName)
	if cleanName == "" {
		cleanName = "Default"
	}
	if !strings.HasSuffix(strings.ToLower(cleanName), ".library") {
		cleanName = cleanName + ".library"
	}

	fullLibPath := filepath.Join(parentDir, cleanName)
	if err := os.MkdirAll(filepath.Join(fullLibPath, "items"), 0755); err != nil {
		return nil, fmt.Errorf("failed to create library directory: %w", err)
	}

	libID := fmt.Sprintf("%d_%s", time.Now().UnixNano(), randHex(6))
	now := time.Now().Unix()

	meta := struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		Version   string `json:"version"`
		CreatedAt int64  `json:"createdAt"`
	}{
		ID:        libID,
		Name:      strings.TrimSuffix(cleanName, ".library"),
		Version:   "1.0.0",
		CreatedAt: now,
	}

	metaBytes, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(filepath.Join(fullLibPath, "library.json"), metaBytes, 0644); err != nil {
		return nil, fmt.Errorf("failed to write library.json: %w", err)
	}

	dbPath := filepath.Join(fullLibPath, "index.db")
	db, err := openLibraryDB(dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize SQLite: %w", err)
	}

	if err := m.initSchema(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	m.mu.Lock()
	if m.db != nil {
		_ = m.db.Close()
	}
	m.db = db
	m.activeLib = &LibraryInfo{
		ID:        libID,
		Name:      strings.TrimSuffix(cleanName, ".library"),
		Path:      fullLibPath,
		CreatedAt: now,
		ItemCount: 0,
	}
	m.invalidateCache()
	m.mu.Unlock()
	// Persist to user data store
	if m.userData != nil {
		_ = m.userData.SetActiveLibraryPath(fullLibPath)
	}

	return m.activeLib, nil
}

// OpenLibrary mounts an existing xxx.library and persists it to the user data store.
func (m *LibraryManager) OpenLibrary(libraryPath string) (*LibraryInfo, error) {
	start := time.Now()
	libJSONPath := filepath.Join(libraryPath, "library.json")
	data, err := os.ReadFile(libJSONPath)
	if err != nil {
		RecordLog("error", "core", "Failed to open library.json", fmt.Sprintf("path=%s err=%v", libraryPath, err), 0)
		return nil, fmt.Errorf("invalid library directory (library.json not found): %w", err)
	}

	var meta struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		CreatedAt int64  `json:"createdAt"`
	}
	if err := json.Unmarshal(data, &meta); err != nil {
		RecordLog("error", "core", "Corrupted library.json", fmt.Sprintf("path=%s err=%v", libraryPath, err), 0)
		return nil, fmt.Errorf("corrupted library.json: %w", err)
	}

	_ = os.MkdirAll(filepath.Join(libraryPath, "items"), 0755)

	dbPath := filepath.Join(libraryPath, "index.db")
	db, err := openLibraryDB(dbPath)
	if err != nil {
		RecordLog("error", "core", "Failed to open SQLite database", fmt.Sprintf("path=%s err=%v", dbPath, err), 0)
		return nil, fmt.Errorf("failed to open SQLite database: %w", err)
	}

	if err := m.initSchema(db); err != nil {
		_ = db.Close()
		RecordLog("error", "core", "Schema migration failed", fmt.Sprintf("path=%s err=%v", dbPath, err), 0)
		return nil, fmt.Errorf("schema migration failed: %w", err)
	}

	var count int64
	_ = db.QueryRow("SELECT COUNT(*) FROM items").Scan(&count)

	m.mu.Lock()
	if m.db != nil {
		_ = m.db.Close()
	}
	m.db = db
	m.activeLib = &LibraryInfo{
		ID:        meta.ID,
		Name:      meta.Name,
		Path:      libraryPath,
		CreatedAt: meta.CreatedAt,
		ItemCount: count,
	}
	m.invalidateCache()
	m.mu.Unlock()
	go func() {
		_ = m.ensureCacheLoaded()
	}()

	// Persist to user data store so next launch reloads automatically
	if m.userData != nil {
		_ = m.userData.SetActiveLibraryPath(libraryPath)
	}

	// Backfill dominant color, palette, and extended metadata for legacy image items
	go m.backfillImageMetadata(libraryPath)

	RecordLog("info", "core", "Opened library", fmt.Sprintf("name=%s items=%d path=%s", meta.Name, count, libraryPath), time.Since(start).Milliseconds())
	return m.activeLib, nil
}

// CloseLibrary unmounts the active library and updates user data.
func (m *LibraryManager) CloseLibrary() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.db != nil {
		_ = m.db.Close()
		m.db = nil
	}
	m.activeLib = nil
	m.invalidateCache()
	if m.userData != nil {
		_ = m.userData.ClearActiveLibraryPath()
	}
	return nil
}

// GetActiveLibraryPath returns the active library directory path using a fast read-only lock.
func (m *LibraryManager) GetActiveLibraryPath() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.activeLib == nil {
		return ""
	}
	return m.activeLib.Path
}

// GetActiveLibrary returns the active library metadata.
func (m *LibraryManager) GetActiveLibrary() *LibraryInfo {
	m.mu.RLock()
	active := m.activeLib
	db := m.db
	m.mu.RUnlock()
	if active == nil {
		return nil
	}

	copyInfo := *active

	m.cacheMu.RLock()
	loaded := m.cacheLoaded
	cachedCount := int64(len(m.itemsDesc) + len(m.trashDesc))
	m.cacheMu.RUnlock()

	if loaded {
		copyInfo.ItemCount = cachedCount
		return &copyInfo
	}

	if db != nil {
		var count int64
		if err := db.QueryRow("SELECT COUNT(*) FROM items").Scan(&count); err == nil {
			copyInfo.ItemCount = count
		}
	}
	return &copyInfo
}

func (m *LibraryManager) invalidateCache() {
	m.cacheMu.Lock()
	m.cacheLoaded = false
	m.itemsDesc = nil
	m.trashDesc = nil
	m.itemsByID = nil
	m.searchIndex = nil
	m.cacheMu.Unlock()
}

func buildItemSearchKey(item *Item) string {
	return strings.ToLower(item.Name + "\x00" + strings.Join(item.Tags, ",") + "\x00" + item.Extension + "\x00" + item.Hex)
}

func (m *LibraryManager) acquireItemLock(hexID string) *sync.Mutex {
	val, _ := m.itemLocks.LoadOrStore(hexID, &sync.Mutex{})
	mtx := val.(*sync.Mutex)
	mtx.Lock()
	return mtx
}

func (m *LibraryManager) ensureCacheLoaded() error {
	m.cacheMu.RLock()
	if m.cacheLoaded {
		m.cacheMu.RUnlock()
		return nil
	}
	m.cacheMu.RUnlock()

	start := time.Now()

	m.mu.RLock()
	db := m.db
	active := m.activeLib
	port := m.GetAssetServerPort()
	m.mu.RUnlock()

	if db == nil || active == nil {
		return nil
	}

	activePath := active.Path

	folderMap := make(map[string][]string)
	fRows, fErr := db.Query("SELECT item_id, folder_id FROM item_folders")
	if fErr == nil {
		for fRows.Next() {
			var itID, fID string
			if fRows.Scan(&itID, &fID) == nil {
				folderMap[itID] = append(folderMap[itID], fID)
			}
		}
		fRows.Close()
	}

	rows, err := db.Query("SELECT id, COALESCE(hex, ''), name, extension, filename, size, mime_type, width, height, has_thumbnail, tags, created_at, imported_at, COALESCE(in_trash, 0), COALESCE(trashed_at, 0), COALESCE(trashed_folders, ''), COALESCE(dominant_color, ''), COALESCE(palette, ''), COALESCE(meta_json, '') FROM items ORDER BY imported_at DESC")
	if err != nil {
		RecordLog("error", "core", "Failed to load item cache", err.Error(), time.Since(start).Milliseconds())
		return fmt.Errorf("failed to query items: %w", err)
	}
	defer rows.Close()

	itemsDesc := make([]Item, 0, 256)
	trashDesc := make([]Item, 0, 32)
	itemsByID := make(map[string]Item, 256)
	searchIndex := make(map[string]string, 256)

	for rows.Next() {
		var item Item
		var tagsStr string
		var hasThumbInt int
		var inTrashInt int
		var trashedAtInt int64
		var trashedFoldersStr string
		var paletteStr string
		var metaJSONStr string
		if err := rows.Scan(
			&item.ID,
			&item.Hex,
			&item.Name,
			&item.Extension,
			&item.Filename,
			&item.Size,
			&item.MimeType,
			&item.Width,
			&item.Height,
			&hasThumbInt,
			&tagsStr,
			&item.CreatedAt,
			&item.ImportedAt,
			&inTrashInt,
			&trashedAtInt,
			&trashedFoldersStr,
			&item.DominantColor,
			&paletteStr,
			&metaJSONStr,
		); err != nil {
			continue
		}
		item.InTrash = inTrashInt == 1
		item.TrashedAt = trashedAtInt
		item.HasThumbnail = hasThumbInt == 1
		if paletteStr != "" {
			item.Palette = strings.Split(paletteStr, ",")
		} else {
			item.Palette = []string{}
		}
		if metaJSONStr != "" {
			var meta ImageMeta
			if json.Unmarshal([]byte(metaJSONStr), &meta) == nil {
				item.Meta = &meta
			}
		}
		if tagsStr != "" {
			item.Tags = strings.Split(tagsStr, ",")
		} else {
			item.Tags = []string{}
		}
		if item.InTrash {
			item.Folders = []string{}
			if trashedFoldersStr != "" {
				_ = json.Unmarshal([]byte(trashedFoldersStr), &item.Folders)
			}
			if item.Folders == nil {
				item.Folders = []string{}
			}
		} else {
			if fList, ok := folderMap[item.ID]; ok {
				item.Folders = fList
			} else {
				item.Folders = []string{}
			}
		}
		m.populateItemPaths(&item, activePath, port)

		itemsByID[item.ID] = item
		if item.Hex != "" && item.Hex != item.ID {
			itemsByID[item.Hex] = item
		}
		searchIndex[item.ID] = buildItemSearchKey(&item)

		if item.InTrash {
			trashDesc = append(trashDesc, item)
		} else {
			itemsDesc = append(itemsDesc, item)
		}
	}

	sort.Slice(trashDesc, func(i, j int) bool {
		if trashDesc[i].TrashedAt != trashDesc[j].TrashedAt {
			return trashDesc[i].TrashedAt > trashDesc[j].TrashedAt
		}
		return trashDesc[i].ImportedAt > trashDesc[j].ImportedAt
	})

	m.cacheMu.Lock()
	m.itemsDesc = itemsDesc
	m.trashDesc = trashDesc
	m.itemsByID = itemsByID
	m.searchIndex = searchIndex
	m.cacheLoaded = true
	m.cacheMu.Unlock()

	dur := time.Since(start).Milliseconds()
	RecordLog("perf", "core", "In-memory library index loaded", fmt.Sprintf("active=%d trash=%d folders_linked=%d", len(itemsDesc), len(trashDesc), len(folderMap)), dur)
	return nil
}

func (m *LibraryManager) mutateCachedItem(itemID string, mutator func(it *Item)) {
	m.cacheMu.Lock()
	defer m.cacheMu.Unlock()
	if !m.cacheLoaded {
		return
	}
	it, ok := m.itemsByID[itemID]
	if !ok {
		return
	}
	wasInTrash := it.InTrash
	mutator(&it)
	m.itemsByID[it.ID] = it
	if it.Hex != "" {
		m.itemsByID[it.Hex] = it
	}
	m.searchIndex[it.ID] = buildItemSearchKey(&it)

	if wasInTrash == it.InTrash {
		if !it.InTrash {
			for i := range m.itemsDesc {
				if m.itemsDesc[i].ID == it.ID || (it.Hex != "" && m.itemsDesc[i].Hex == it.Hex) {
					m.itemsDesc[i] = it
					break
				}
			}
		} else {
			for i := range m.trashDesc {
				if m.trashDesc[i].ID == it.ID || (it.Hex != "" && m.trashDesc[i].Hex == it.Hex) {
					m.trashDesc[i] = it
					break
				}
			}
		}
		return
	}

	if it.InTrash {
		// Moved from active to trash
		for i := range m.itemsDesc {
			if m.itemsDesc[i].ID == it.ID || (it.Hex != "" && m.itemsDesc[i].Hex == it.Hex) {
				m.itemsDesc = append(m.itemsDesc[:i], m.itemsDesc[i+1:]...)
				break
			}
		}
		m.trashDesc = append([]Item{it}, m.trashDesc...)
	} else {
		// Restored from trash to active
		for i := range m.trashDesc {
			if m.trashDesc[i].ID == it.ID || (it.Hex != "" && m.trashDesc[i].Hex == it.Hex) {
				m.trashDesc = append(m.trashDesc[:i], m.trashDesc[i+1:]...)
				break
			}
		}
		// Insert into itemsDesc maintaining ImportedAt DESC order
		insertIdx := sort.Search(len(m.itemsDesc), func(i int) bool {
			return m.itemsDesc[i].ImportedAt <= it.ImportedAt
		})
		m.itemsDesc = append(m.itemsDesc, Item{})
		copy(m.itemsDesc[insertIdx+1:], m.itemsDesc[insertIdx:])
		m.itemsDesc[insertIdx] = it
	}
}

func (m *LibraryManager) removeCachedItem(id string) {
	m.cacheMu.Lock()
	defer m.cacheMu.Unlock()
	if !m.cacheLoaded {
		return
	}
	it, ok := m.itemsByID[id]
	if ok {
		delete(m.itemsByID, it.ID)
		if it.Hex != "" {
			delete(m.itemsByID, it.Hex)
		}
		delete(m.searchIndex, it.ID)
	} else {
		delete(m.itemsByID, id)
		delete(m.searchIndex, id)
	}
	for i := range m.itemsDesc {
		if m.itemsDesc[i].ID == id || m.itemsDesc[i].Hex == id {
			m.itemsDesc = append(m.itemsDesc[:i], m.itemsDesc[i+1:]...)
			break
		}
	}
	for i := range m.trashDesc {
		if m.trashDesc[i].ID == id || m.trashDesc[i].Hex == id {
			m.trashDesc = append(m.trashDesc[:i], m.trashDesc[i+1:]...)
			break
		}
	}
}

func (m *LibraryManager) upsertItemsInCache(items []Item, folderID string) {
	if len(items) == 0 {
		return
	}
	m.cacheMu.Lock()
	defer m.cacheMu.Unlock()
	if !m.cacheLoaded {
		return
	}
	updatedSet := make(map[string]Item, len(items))
	for _, it := range items {
		if folderID != "" {
			hasFolder := false
			for _, f := range it.Folders {
				if f == folderID {
					hasFolder = true
					break
				}
			}
			if !hasFolder {
				it.Folders = append(append([]string{}, it.Folders...), folderID)
			}
		} else if existing, ok := m.itemsByID[it.ID]; ok && len(it.Folders) == 0 && len(existing.Folders) > 0 {
			it.Folders = existing.Folders
		}
		if existing, ok := m.itemsByID[it.ID]; ok && len(it.Tags) == 0 && len(existing.Tags) > 0 {
			it.Tags = existing.Tags
		}
		m.itemsByID[it.ID] = it
		if it.Hex != "" {
			m.itemsByID[it.Hex] = it
		}
		m.searchIndex[it.ID] = buildItemSearchKey(&it)
		updatedSet[it.ID] = it
	}

	// Update existing entries in itemsDesc in place, and prepend brand new ones
	seenExisting := make(map[string]bool, len(items))
	for i := range m.itemsDesc {
		if upd, ok := updatedSet[m.itemsDesc[i].ID]; ok {
			if !upd.InTrash {
				m.itemsDesc[i] = upd
				seenExisting[upd.ID] = true
			}
		}
	}
	var newActive []Item
	for _, it := range items {
		if !it.InTrash && !seenExisting[it.ID] {
			newActive = append(newActive, updatedSet[it.ID])
			seenExisting[it.ID] = true
		}
	}
	if len(newActive) > 0 {
		sort.Slice(newActive, func(i, j int) bool {
			return newActive[i].ImportedAt > newActive[j].ImportedAt
		})
		m.itemsDesc = append(newActive, m.itemsDesc...)
	}
}

func (m *LibraryManager) initSchema(db *sql.DB) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS items (
			id TEXT PRIMARY KEY,
			hex TEXT DEFAULT '',
			name TEXT NOT NULL,
			extension TEXT NOT NULL,
			filename TEXT NOT NULL,
			size INTEGER NOT NULL,
			mime_type TEXT NOT NULL,
			width INTEGER DEFAULT 0,
			height INTEGER DEFAULT 0,
			has_thumbnail INTEGER DEFAULT 0,
			tags TEXT DEFAULT '',
			created_at INTEGER NOT NULL,
			imported_at INTEGER NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_items_imported_at ON items(imported_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_items_extension ON items(extension)`,
		`CREATE INDEX IF NOT EXISTS idx_items_name ON items(name)`,
		`CREATE INDEX IF NOT EXISTS idx_items_hex ON items(hex)`,

		`CREATE TABLE IF NOT EXISTS folders (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			parent_id TEXT DEFAULT '',
			created_at INTEGER NOT NULL,
			sort_order INTEGER DEFAULT 0
		)`,
		`CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id)`,

		`CREATE TABLE IF NOT EXISTS item_folders (
			item_id TEXT NOT NULL,
			folder_id TEXT NOT NULL,
			added_at INTEGER NOT NULL,
			PRIMARY KEY (item_id, folder_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_item_folders_folder ON item_folders(folder_id)`,
		`CREATE INDEX IF NOT EXISTS idx_item_folders_item ON item_folders(item_id)`,
	}

	for _, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			return err
		}
	}

	_, _ = db.Exec("ALTER TABLE items ADD COLUMN hex TEXT DEFAULT ''")
	_, _ = db.Exec("ALTER TABLE items ADD COLUMN in_trash INTEGER DEFAULT 0")
	_, _ = db.Exec("ALTER TABLE items ADD COLUMN trashed_at INTEGER DEFAULT 0")
	_, _ = db.Exec("ALTER TABLE items ADD COLUMN trashed_folders TEXT DEFAULT ''")
	_, _ = db.Exec("ALTER TABLE items ADD COLUMN dominant_color TEXT DEFAULT ''")
	_, _ = db.Exec("ALTER TABLE items ADD COLUMN palette TEXT DEFAULT ''")
	_, _ = db.Exec("ALTER TABLE items ADD COLUMN meta_json TEXT DEFAULT ''")
	_, _ = db.Exec("CREATE INDEX IF NOT EXISTS idx_items_in_trash ON items(in_trash)")
	_, _ = db.Exec("CREATE INDEX IF NOT EXISTS idx_items_dominant_color ON items(dominant_color)")
	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS tags (
		name TEXT PRIMARY KEY,
		created_at INTEGER NOT NULL,
		color TEXT DEFAULT ''
	)`)
	return nil
}

// GetItems queries items from the in-memory index (falling back to SQLite load on first access).
func (m *LibraryManager) GetItems(query string, sortOrder string) ([]Item, error) {
	m.mu.RLock()
	db := m.db
	active := m.activeLib
	m.mu.RUnlock()

	if db == nil || active == nil {
		return []Item{}, nil
	}

	if err := m.ensureCacheLoaded(); err != nil {
		return nil, err
	}

	m.cacheMu.RLock()
	defer m.cacheMu.RUnlock()

	trimmed := strings.ToLower(strings.TrimSpace(query))
	isAsc := strings.ToLower(sortOrder) == "asc"

	n := len(m.itemsDesc)
	if n == 0 {
		return []Item{}, nil
	}

	if trimmed == "" {
		result := make([]Item, n)
		if !isAsc {
			copy(result, m.itemsDesc)
		} else {
			for i := range n {
				result[i] = m.itemsDesc[n-1-i]
			}
		}
		return result, nil
	}

	result := make([]Item, 0, 64)
	if !isAsc {
		for i := range n {
			it := m.itemsDesc[i]
			if strings.Contains(m.searchIndex[it.ID], trimmed) {
				result = append(result, it)
			}
		}
	} else {
		for i := n - 1; i >= 0; i-- {
			it := m.itemsDesc[i]
			if strings.Contains(m.searchIndex[it.ID], trimmed) {
				result = append(result, it)
			}
		}
	}
	return result, nil
}

// GetItem retrieves a single item by ID or Hex in O(1) from the in-memory index.
func (m *LibraryManager) GetItem(id string) (*Item, error) {
	m.mu.RLock()
	db := m.db
	active := m.activeLib
	port := m.GetAssetServerPort()
	m.mu.RUnlock()

	if db == nil || active == nil {
		return nil, errors.New("no active library")
	}

	m.cacheMu.RLock()
	if m.cacheLoaded {
		if it, ok := m.itemsByID[id]; ok {
			copyIt := it
			m.cacheMu.RUnlock()
			return &copyIt, nil
		}
		m.cacheMu.RUnlock()
		return nil, sql.ErrNoRows
	}
	m.cacheMu.RUnlock()

	row := db.QueryRow("SELECT id, COALESCE(hex, ''), name, extension, filename, size, mime_type, width, height, has_thumbnail, tags, created_at, imported_at, COALESCE(in_trash, 0), COALESCE(trashed_at, 0), COALESCE(dominant_color, ''), COALESCE(palette, ''), COALESCE(meta_json, '') FROM items WHERE id = ? OR hex = ?", id, id)
	var item Item
	var tagsStr string
	var hasThumbInt int
	var inTrashInt int
	var trashedAtInt int64
	var paletteStr string
	var metaJSONStr string
	if err := row.Scan(
		&item.ID,
		&item.Hex,
		&item.Name,
		&item.Extension,
		&item.Filename,
		&item.Size,
		&item.MimeType,
		&item.Width,
		&item.Height,
		&hasThumbInt,
		&tagsStr,
		&item.CreatedAt,
		&item.ImportedAt,
		&inTrashInt,
		&trashedAtInt,
		&item.DominantColor,
		&paletteStr,
		&metaJSONStr,
	); err != nil {
		return nil, err
	}
	item.InTrash = inTrashInt == 1
	item.TrashedAt = trashedAtInt
	item.HasThumbnail = hasThumbInt == 1
	if paletteStr != "" {
		item.Palette = strings.Split(paletteStr, ",")
	} else {
		item.Palette = []string{}
	}
	if metaJSONStr != "" {
		var meta ImageMeta
		if json.Unmarshal([]byte(metaJSONStr), &meta) == nil {
			item.Meta = &meta
		}
	}
	if tagsStr != "" {
		item.Tags = strings.Split(tagsStr, ",")
	} else {
		item.Tags = []string{}
	}
	item.Folders = []string{}
	fRows, fErr := db.Query("SELECT folder_id FROM item_folders WHERE item_id = ?", item.ID)
	if fErr == nil {
		for fRows.Next() {
			var fID string
			if err := fRows.Scan(&fID); err == nil {
				item.Folders = append(item.Folders, fID)
			}
		}
		fRows.Close()
	}
	m.populateItemPaths(&item, active.Path, port)
	return &item, nil
}

// ProgressCallback reports current item index (1-based), total count, and filename being processed.
type ProgressCallback func(current int, total int, filename string)

// ImportFiles imports a list of files or folders with physical copy isolation and content deduplication.
func (m *LibraryManager) ImportFiles(sourcePaths []string) ([]Item, error) {
	return m.ImportFilesWithProgress(sourcePaths, nil)
}

// ImportFilesWithProgress imports files concurrently using a bounded Go worker pool
// and batched SQLite transactions with real-time progress callbacks.
func (m *LibraryManager) ImportFilesWithProgress(sourcePaths []string, onProgress ProgressCallback) ([]Item, error) {
	m.mu.RLock()
	active := m.activeLib
	db := m.db
	m.mu.RUnlock()

	if active == nil || db == nil {
		return nil, errors.New("no active library")
	}

	_ = m.ensureCacheLoaded()

	// 1. Flatten directories to count total files for accurate progress
	var allFiles []string
	for _, srcPath := range sourcePaths {
		info, err := os.Stat(srcPath)
		if err != nil {
			continue
		}

		if info.IsDir() {
			_ = filepath.WalkDir(srcPath, func(path string, d os.DirEntry, walkErr error) error {
				if walkErr != nil {
					return nil
				}
				if d.IsDir() {
					if path != srcPath && strings.HasPrefix(d.Name(), ".") {
						return filepath.SkipDir
					}
					return nil
				}
				if strings.HasPrefix(d.Name(), ".") {
					return nil
				}
				allFiles = append(allFiles, path)
				return nil
			})
		} else {
			allFiles = append(allFiles, srcPath)
		}
	}

	total := len(allFiles)
	if total == 0 {
		return []Item{}, nil
	}

	jobs := make([]importJob, total)
	for i, p := range allFiles {
		jobs[i] = importJob{index: i, srcPath: p}
	}
	return m.runConcurrentImportJobs(jobs, onProgress)
}

type importJob struct {
	index    int
	srcPath  string
	folderID string
}

type preparedImportResult struct {
	index      int
	item       *Item
	folderID   string
	isExisting bool
	hasThumb   int
	paletteStr string
	metaJSON   string
	err        error
	srcPath    string
}

func importWorkerCount(total int) int {
	workers := runtime.NumCPU()
	if workers < 4 {
		workers = 4
	}
	if workers > 8 {
		workers = 8
	}
	if total < workers {
		workers = total
	}
	if workers < 1 {
		workers = 1
	}
	return workers
}

func (m *LibraryManager) runConcurrentImportJobs(jobs []importJob, onProgress ProgressCallback) ([]Item, error) {
	total := len(jobs)
	if total == 0 {
		return []Item{}, nil
	}

	workers := importWorkerCount(total)
	jobCh := make(chan importJob, min(total, workers*4))
	resCh := make(chan preparedImportResult, min(total, workers*4))

	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for job := range jobCh {
				res := m.prepareSingleFileImport(job)
				resCh <- res
			}
		}()
	}

	go func() {
		for _, j := range jobs {
			jobCh <- j
		}
		close(jobCh)
		wg.Wait()
		close(resCh)
	}()

	orderedItems := make([]*Item, total)
	var pendingBatch []preparedImportResult
	const batchSize = 32

	flushBatch := func() {
		if len(pendingBatch) == 0 {
			return
		}
		m.commitImportBatch(pendingBatch)
		pendingBatch = pendingBatch[:0]
	}

	var processed int32
	var lastEmitNano int64

	for res := range resCh {
		curr := int(atomic.AddInt32(&processed, 1))
		if onProgress != nil {
			nowNano := time.Now().UnixNano()
			prevNano := atomic.LoadInt64(&lastEmitNano)
			if curr == 1 || curr == total || nowNano-prevNano >= int64(25*time.Millisecond) {
				atomic.StoreInt64(&lastEmitNano, nowNano)
				onProgress(curr, total, filepath.Base(res.srcPath))
			}
		}
		if res.err != nil {
			LogDragTrace("import-failed", fmt.Sprintf("%s: %v", res.srcPath, res.err))
			continue
		}
		if res.item != nil {
			orderedItems[res.index] = res.item
			pendingBatch = append(pendingBatch, res)
			if len(pendingBatch) >= batchSize {
				flushBatch()
			}
		}
	}
	flushBatch()

	imported := make([]Item, 0, total)
	for _, it := range orderedItems {
		if it != nil {
			imported = append(imported, *it)
		}
	}
	return imported, nil
}

func (m *LibraryManager) commitImportBatch(batch []preparedImportResult) {
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()
	if db == nil || len(batch) == 0 {
		return
	}

	tx, err := db.Begin()
	if err == nil {
		itemStmt, itemStmtErr := tx.Prepare(`INSERT INTO items (id, hex, name, extension, filename, size, mime_type, width, height, has_thumbnail, dominant_color, palette, meta_json, tags, created_at, imported_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
			hex = excluded.hex,
			name = excluded.name,
			extension = excluded.extension,
			filename = excluded.filename,
			size = excluded.size,
			mime_type = excluded.mime_type,
			width = excluded.width,
			height = excluded.height,
			has_thumbnail = excluded.has_thumbnail,
			dominant_color = excluded.dominant_color,
			palette = excluded.palette,
			meta_json = excluded.meta_json`)
		folderStmt, folderStmtErr := tx.Prepare(`INSERT OR IGNORE INTO item_folders (item_id, folder_id, added_at) VALUES (?, ?, ?)`)

		now := time.Now().Unix()
		for _, r := range batch {
			if r.item == nil {
				continue
			}
			if !r.isExisting && itemStmtErr == nil {
				_, _ = itemStmt.Exec(
					r.item.ID, r.item.Hex, r.item.Name, r.item.Extension, r.item.Filename, r.item.Size, r.item.MimeType,
					r.item.Width, r.item.Height, r.hasThumb, r.item.DominantColor, r.paletteStr, r.metaJSON, "", r.item.CreatedAt, r.item.ImportedAt,
				)
			}
			if r.folderID != "" && folderStmtErr == nil {
				_, _ = folderStmt.Exec(r.item.ID, r.folderID, now)
			}
		}
		if itemStmt != nil {
			_ = itemStmt.Close()
		}
		if folderStmt != nil {
			_ = folderStmt.Close()
		}
		_ = tx.Commit()
	}

	// Update in-memory cache immediately so live queries during background import see new items
	for _, r := range batch {
		if r.item != nil {
			m.upsertItemsInCache([]Item{*r.item}, r.folderID)
		}
	}

	if m.app != nil && len(batch) > 1 {
		m.app.Event.Emit("library-items-updated", len(batch))
	}
}

// ensureItemDir creates the content-addressed item directory if needed.
//
// Imports of the same bytes share this directory (an OS file drop reaches the app
// through both the webview drop handler and the native drop handler, and on
// Windows they race), so a failed import deliberately leaves whatever is already
// on disk untouched: deleting it would remove the payload of an item whose row is
// already committed, which the UI can only ever show as a broken card.
func ensureItemDir(dir string) error {
	return os.MkdirAll(dir, 0o755)
}

// itemPayloadPresent reports whether an item's file is still on disk. Rows can
// outlive their directory (an import that failed after another one committed the
// same content), and re-importing the same bytes is what repairs them.
func itemPayloadPresent(item *Item) bool {
	if item == nil || item.ItemPath == "" || item.Filename == "" {
		return false
	}
	info, err := os.Stat(filepath.Join(item.ItemPath, item.Filename))
	return err == nil && info.Mode().IsRegular()
}

// sqliteDSNOptions is appended to the database path when opening a library.
//
// busy_timeout makes contention wait instead of failing: the same content can be
// imported through two drop paths at once (the webview drop handler and the native
// drop handler), and a library can live on a synced or virtual drive where writes
// take longer, so "database is locked" is a routine event rather than a bug.
const sqliteDSNOptions = "?_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=cache_size(-64000)&_pragma=temp_store(MEMORY)"

func openLibraryDB(dbPath string) (*sql.DB, error) {
	return sql.Open("sqlite", dbPath+sqliteDSNOptions)
}

func copyAndHashFile(srcPath, tempDestPath string) (string, int64, []byte, error) {
	srcFile, err := os.Open(srcPath)
	if err != nil {
		return "", 0, nil, err
	}
	defer srcFile.Close()

	destFile, err := os.Create(tempDestPath)
	if err != nil {
		return "", 0, nil, err
	}

	hasher := sha256.New()
	bufPtr := ioCopyBufPool.Get().(*[]byte)
	buf := *bufPtr
	defer ioCopyBufPool.Put(bufPtr)

	var header [512]byte
	headerLen := 0
	var totalSize int64

	for {
		nr, rErr := srcFile.Read(buf)
		if nr > 0 {
			chunk := buf[:nr]
			if headerLen < len(header) {
				copied := copy(header[headerLen:], chunk)
				headerLen += copied
			}
			_, _ = hasher.Write(chunk)
			nw, wErr := destFile.Write(chunk)
			if wErr != nil {
				_ = destFile.Close()
				return "", 0, nil, wErr
			}
			if nw != nr {
				_ = destFile.Close()
				return "", 0, nil, io.ErrShortWrite
			}
			totalSize += int64(nw)
		}
		if rErr != nil {
			if rErr == io.EOF {
				break
			}
			_ = destFile.Close()
			return "", 0, nil, rErr
		}
	}

	if err := destFile.Close(); err != nil {
		return "", 0, nil, err
	}

	contentHex := strings.ToUpper(hex.EncodeToString(hasher.Sum(nil)))
	return contentHex, totalSize, header[:headerLen], nil
}

func (m *LibraryManager) prepareSingleFileImport(job importJob) preparedImportResult {
	srcPath := job.srcPath
	m.mu.RLock()
	active := m.activeLib
	db := m.db
	port := m.GetAssetServerPort()
	m.mu.RUnlock()

	if active == nil || db == nil {
		return preparedImportResult{index: job.index, srcPath: srcPath, err: errors.New("no active library")}
	}

	stat, err := os.Stat(srcPath)
	if err != nil {
		return preparedImportResult{index: job.index, srcPath: srcPath, err: err}
	}

	itemsRoot := filepath.Join(active.Path, "items")
	tempFile, tempErr := os.CreateTemp(itemsRoot, ".import_*")
	var contentHex string
	var size int64
	var headerBytes []byte
	var tempPath string

	if tempErr == nil {
		tempPath = tempFile.Name()
		_ = tempFile.Close()
		contentHex, size, headerBytes, err = copyAndHashFile(srcPath, tempPath)
		if err != nil {
			_ = os.Remove(tempPath)
			return preparedImportResult{index: job.index, srcPath: srcPath, err: fmt.Errorf("failed to copy/hash file: %w", err)}
		}
	} else {
		contentHex, err = ComputeFileSHA256(srcPath)
		if err != nil {
			return preparedImportResult{index: job.index, srcPath: srcPath, err: fmt.Errorf("failed to compute file hash: %w", err)}
		}
	}

	itemLock := m.acquireItemLock(contentHex)
	defer itemLock.Unlock()

	existing, err := m.GetItem(contentHex)
	if err == nil && existing != nil && itemPayloadPresent(existing) {
		if tempPath != "" {
			_ = os.Remove(tempPath)
		}
		if job.folderID != "" {
			hasFolder := false
			for _, f := range existing.Folders {
				if f == job.folderID {
					hasFolder = true
					break
				}
			}
			if !hasFolder {
				existing.Folders = append(append([]string{}, existing.Folders...), job.folderID)
			}
		}
		return preparedImportResult{
			index:      job.index,
			item:       existing,
			folderID:   job.folderID,
			isExisting: true,
			srcPath:    srcPath,
		}
	}

	itemID := contentHex
	itemDir := filepath.Join(active.Path, "items", itemID)
	if err := ensureItemDir(itemDir); err != nil {
		if tempPath != "" {
			_ = os.Remove(tempPath)
		}
		return preparedImportResult{index: job.index, srcPath: srcPath, err: err}
	}

	originalFilename := filepath.Base(srcPath)
	destPath := filepath.Join(itemDir, originalFilename)

	if tempPath != "" {
		if err := os.Rename(tempPath, destPath); err != nil {
			_ = os.Remove(tempPath)
			// Fallback copy if rename failed
			srcFile, oErr := os.Open(srcPath)
			if oErr != nil {
				return preparedImportResult{index: job.index, srcPath: srcPath, err: oErr}
			}
			destFile, cErr := os.Create(destPath)
			if cErr != nil {
				_ = srcFile.Close()
				return preparedImportResult{index: job.index, srcPath: srcPath, err: cErr}
			}
			size, err = io.Copy(destFile, srcFile)
			_ = srcFile.Close()
			_ = destFile.Close()
			if err != nil {
				return preparedImportResult{index: job.index, srcPath: srcPath, err: err}
			}
		}
	} else {
		srcFile, oErr := os.Open(srcPath)
		if oErr != nil {
			return preparedImportResult{index: job.index, srcPath: srcPath, err: oErr}
		}
		destFile, cErr := os.Create(destPath)
		if cErr != nil {
			_ = srcFile.Close()
			return preparedImportResult{index: job.index, srcPath: srcPath, err: cErr}
		}
		size, err = io.Copy(destFile, srcFile)
		_ = srcFile.Close()
		_ = destFile.Close()
		if err != nil {
			return preparedImportResult{index: job.index, srcPath: srcPath, err: err}
		}
	}

	now := time.Now().Unix()
	createdAt := stat.ModTime().Unix()
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(originalFilename), "."))
	nameWithoutExt := strings.TrimSuffix(originalFilename, filepath.Ext(originalFilename))
	mimeType := DetectMimeTypeWithHeader(destPath, ext, headerBytes)

	width, height, hasThumbnail, dominantColor, palette, imgMeta := m.processImageThumbnail(destPath, itemDir, ext)

	folders := []string{}
	if job.folderID != "" {
		folders = []string{job.folderID}
	}

	item := Item{
		ID:            itemID,
		Hex:           contentHex,
		Name:          nameWithoutExt,
		Extension:     ext,
		Filename:      originalFilename,
		Size:          size,
		MimeType:      mimeType,
		Width:         width,
		Height:        height,
		HasThumbnail:  hasThumbnail,
		DominantColor: dominantColor,
		Palette:       palette,
		Meta:          imgMeta,
		Tags:          []string{},
		Folders:       folders,
		CreatedAt:     createdAt,
		ImportedAt:    now,
	}
	m.populateItemPaths(&item, active.Path, port)

	metaBytes, _ := json.Marshal(ItemMetadata{
		ID:            item.ID,
		Hex:           item.Hex,
		Name:          item.Name,
		Extension:     item.Extension,
		Filename:      item.Filename,
		Size:          item.Size,
		MimeType:      item.MimeType,
		Width:         item.Width,
		Height:        item.Height,
		HasThumbnail:  item.HasThumbnail,
		DominantColor: item.DominantColor,
		Palette:       item.Palette,
		Meta:          item.Meta,
		Tags:          item.Tags,
		Folders:       item.Folders,
		CreatedAt:     item.CreatedAt,
		ImportedAt:    item.ImportedAt,
	})
	_ = os.WriteFile(filepath.Join(itemDir, "metadata.json"), metaBytes, 0644)

	hasThumbInt := 0
	if hasThumbnail {
		hasThumbInt = 1
	}
	paletteStr := strings.Join(palette, ",")
	metaJSONStr := ""
	if imgMeta != nil {
		metaJSONBytes, _ := json.Marshal(imgMeta)
		metaJSONStr = string(metaJSONBytes)
	}

	return preparedImportResult{
		index:      job.index,
		item:       &item,
		folderID:   job.folderID,
		isExisting: false,
		hasThumb:   hasThumbInt,
		paletteStr: paletteStr,
		metaJSON:   metaJSONStr,
		srcPath:    srcPath,
	}
}

func (m *LibraryManager) importSingleFile(srcPath string) (*Item, error) {
	res := m.prepareSingleFileImport(importJob{index: 0, srcPath: srcPath})
	if res.err != nil {
		return nil, res.err
	}
	if res.item != nil {
		m.commitImportBatch([]preparedImportResult{res})
	}
	return res.item, nil
}

// ImportFromBase64 imports binary payload from browser drops or clipboard paste.
func (m *LibraryManager) ImportFromBase64(filename string, base64Data string) (*Item, error) {
	m.mu.RLock()
	active := m.activeLib
	db := m.db
	port := m.GetAssetServerPort()
	m.mu.RUnlock()

	if active == nil || db == nil {
		return nil, errors.New("no active library")
	}

	idx := strings.Index(base64Data, ",")
	pureData := base64Data
	if idx != -1 {
		pureData = base64Data[idx+1:]
	}

	data, err := base64.StdEncoding.DecodeString(pureData)
	if err != nil {
		return nil, fmt.Errorf("invalid base64 payload: %w", err)
	}

	contentHex := ComputeBytesSHA256(data)
	existing, err := m.GetItem(contentHex)
	if err == nil && existing != nil && itemPayloadPresent(existing) {
		return existing, nil
	}

	itemID := contentHex
	itemDir := filepath.Join(active.Path, "items", itemID)
	if err := ensureItemDir(itemDir); err != nil {
		return nil, err
	}

	cleanFilename := strings.TrimSpace(filename)
	if cleanFilename == "" {
		cleanFilename = fmt.Sprintf("pasted_%d.png", time.Now().Unix())
	}

	destPath := filepath.Join(itemDir, cleanFilename)
	if err := os.WriteFile(destPath, data, 0644); err != nil {
		return nil, err
	}

	now := time.Now().Unix()
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(cleanFilename), "."))
	nameWithoutExt := strings.TrimSuffix(cleanFilename, filepath.Ext(cleanFilename))
	mimeType := DetectMimeType(destPath, ext)

	width, height, hasThumbnail, dominantColor, palette, imgMeta := m.processImageThumbnail(destPath, itemDir, ext)

	item := Item{
		ID:            itemID,
		Hex:           contentHex,
		Name:          nameWithoutExt,
		Extension:     ext,
		Filename:      cleanFilename,
		Size:          int64(len(data)),
		MimeType:      mimeType,
		Width:         width,
		Height:        height,
		HasThumbnail:  hasThumbnail,
		DominantColor: dominantColor,
		Palette:       palette,
		Meta:          imgMeta,
		Tags:          []string{},
		CreatedAt:     now,
		ImportedAt:    now,
	}
	m.populateItemPaths(&item, active.Path, port)

	metaBytes, _ := json.MarshalIndent(ItemMetadata{
		ID:            item.ID,
		Hex:           item.Hex,
		Name:          item.Name,
		Extension:     item.Extension,
		Filename:      item.Filename,
		Size:          item.Size,
		MimeType:      item.MimeType,
		Width:         item.Width,
		Height:        item.Height,
		HasThumbnail:  item.HasThumbnail,
		DominantColor: item.DominantColor,
		Palette:       item.Palette,
		Meta:          item.Meta,
		Tags:          item.Tags,
		CreatedAt:     item.CreatedAt,
		ImportedAt:    item.ImportedAt,
	}, "", "  ")
	_ = os.WriteFile(filepath.Join(itemDir, "metadata.json"), metaBytes, 0644)

	hasThumbInt := 0
	if hasThumbnail {
		hasThumbInt = 1
	}
	paletteStr := strings.Join(palette, ",")
	metaJSONBytes, _ := json.Marshal(imgMeta)
	metaJSONStr := ""
	if imgMeta != nil {
		metaJSONStr = string(metaJSONBytes)
	}
	_, err = db.Exec(
		`INSERT INTO items (id, hex, name, extension, filename, size, mime_type, width, height, has_thumbnail, dominant_color, palette, meta_json, tags, created_at, imported_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
			hex = excluded.hex,
			name = excluded.name,
			extension = excluded.extension,
			filename = excluded.filename,
			size = excluded.size,
			mime_type = excluded.mime_type,
			width = excluded.width,
			height = excluded.height,
			has_thumbnail = excluded.has_thumbnail,
			dominant_color = excluded.dominant_color,
			palette = excluded.palette,
			meta_json = excluded.meta_json`,
		item.ID, item.Hex, item.Name, item.Extension, item.Filename, item.Size, item.MimeType,
		item.Width, item.Height, hasThumbInt, item.DominantColor, paletteStr, metaJSONStr, "", item.CreatedAt, item.ImportedAt,
	)
	if err != nil {
		return nil, err
	}
	m.upsertItemsInCache([]Item{item}, "")
	return &item, nil
}

// ImportFromURL downloads a remote network resource (image, document, media) using Go's HTTP client,
// completely bypassing browser CORS, mixed-content, and webview IP/sandboxing restrictions.
func (m *LibraryManager) ImportFromURL(rawURL string) (*Item, error) {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return nil, errors.New("empty URL")
	}

	// 1. If it's a data URL, decode directly via base64
	if strings.HasPrefix(trimmed, "data:") {
		return m.ImportFromBase64("web_resource.png", trimmed)
	}

	parsedURL, err := url.Parse(trimmed)
	if err != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		return nil, fmt.Errorf("unsupported or invalid URL: %s", rawURL)
	}

	// 2. Fetch using native Go HTTP client
	req, err := http.NewRequest("GET", trimmed, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "*/*")

	client := &http.Client{Timeout: 45 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch network resource: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("network resource returned HTTP %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}
	if len(data) == 0 {
		return nil, errors.New("empty network resource")
	}

	// 3. Determine filename and extension
	filename := filepath.Base(parsedURL.Path)
	if filename == "" || filename == "/" || filename == "." || !strings.Contains(filename, ".") {
		contentType := resp.Header.Get("Content-Type")
		ext := "png"
		if strings.Contains(contentType, "/") {
			sub := strings.Split(strings.Split(contentType, ";")[0], "/")[1]
			if sub == "jpeg" {
				ext = "jpg"
			} else if sub != "" {
				ext = sub
			}
		}
		filename = fmt.Sprintf("web_resource_%d.%s", time.Now().Unix(), ext)
	}

	// 4. Encode as base64 and use content-addressed ImportFromBase64
	b64 := base64.StdEncoding.EncodeToString(data)
	return m.ImportFromBase64(filename, b64)
}

func encodeThumbnailAndExtractPalette(img image.Image, origW, origH int, itemDir, ext, filePath string) (int, int, bool, string, []string, *ImageMeta) {
	bounds := img.Bounds()
	if origW <= 0 {
		origW = bounds.Dx()
	}
	if origH <= 0 {
		origH = bounds.Dy()
	}
	if origW <= 0 || origH <= 0 {
		return 0, 0, false, "", []string{}, nil
	}

	maxEdge := 480
	targetW := origW
	targetH := origH
	if origW > maxEdge || origH > maxEdge {
		if origW >= origH {
			targetW = maxEdge
			targetH = int(float64(origH) * float64(maxEdge) / float64(origW))
		} else {
			targetH = maxEdge
			targetW = int(float64(origW) * float64(maxEdge) / float64(origH))
		}
	}
	if targetW < 1 {
		targetW = 1
	}
	if targetH < 1 {
		targetH = 1
	}

	thumb := image.NewRGBA(image.Rect(0, 0, targetW, targetH))
	draw.BiLinear.Scale(thumb, thumb.Bounds(), img, bounds, draw.Over, nil)

	dominantColor, palette, imgMeta := ExtractPaletteAndMeta(img, thumb, origW, origH, ext, filePath)

	thumbFile, err := os.Create(filepath.Join(itemDir, "thumbnail.jpg"))
	if err != nil {
		return origW, origH, false, dominantColor, palette, imgMeta
	}
	defer thumbFile.Close()

	if err := jpeg.Encode(thumbFile, thumb, &jpeg.Options{Quality: 84}); err != nil {
		return origW, origH, false, dominantColor, palette, imgMeta
	}

	return origW, origH, true, dominantColor, palette, imgMeta
}

func (m *LibraryManager) processImageThumbnail(mediaPath string, itemDir string, ext string) (int, int, bool, string, []string, *ImageMeta) {
	if IsImageExtension(ext) {
		file, err := os.Open(mediaPath)
		if err != nil {
			return 0, 0, false, "", []string{}, nil
		}
		defer file.Close()

		img, _, err := image.Decode(file)
		if err != nil {
			return 0, 0, false, "", []string{}, nil
		}
		bounds := img.Bounds()
		return encodeThumbnailAndExtractPalette(img, bounds.Dx(), bounds.Dy(), itemDir, ext, mediaPath)
	}

	if IsVideoExtension(ext) {
		// 1. Check if a custom cover thumbnail already exists in itemDir
		existingThumbPath := filepath.Join(itemDir, "thumbnail.jpg")
		if tf, err := os.Open(existingThumbPath); err == nil {
			img, _, decErr := image.Decode(tf)
			_ = tf.Close()
			if decErr == nil {
				b := img.Bounds()
				sampleW := min(b.Dx(), 128)
				sampleH := min(b.Dy(), 128)
				sample := image.NewRGBA(image.Rect(0, 0, max(1, sampleW), max(1, sampleH)))
				draw.BiLinear.Scale(sample, sample.Bounds(), img, b, draw.Over, nil)
				dominantColor, palette, imgMeta := ExtractPaletteAndMeta(img, sample, b.Dx(), b.Dy(), ext, mediaPath)
				return b.Dx(), b.Dy(), true, dominantColor, palette, imgMeta
			}
		}

		// 2. Extract embedded video cover artwork or first frame via native OS extractor
		if img, vw, vh := ExtractNativeVideoFrame(mediaPath); img != nil {
			return encodeThumbnailAndExtractPalette(img, vw, vh, itemDir, ext, mediaPath)
		}
	}

	return 0, 0, false, "", []string{}, nil
}

// SaveItemThumbnail decodes a base64-encoded image (e.g., extracted video cover or first frame from a preview plugin),
// saves it as thumbnail.jpg, runs perceptual color palette & metadata extraction, updates SQLite and metadata.json,
// and returns the updated Item.
func (m *LibraryManager) SaveItemThumbnail(itemID string, base64Data string, videoWidth int, videoHeight int) (*Item, error) {
	m.mu.RLock()
	active := m.activeLib
	db := m.db
	port := m.GetAssetServerPort()
	m.mu.RUnlock()

	if active == nil || db == nil {
		return nil, errors.New("no active library")
	}

	item, err := m.GetItem(itemID)
	if err != nil || item == nil {
		return nil, errors.New("item not found")
	}

	pureData := strings.TrimSpace(base64Data)
	if idx := strings.Index(pureData, ","); idx != -1 {
		pureData = pureData[idx+1:]
	}
	rawBytes, err := base64.StdEncoding.DecodeString(pureData)
	if err != nil {
		return nil, fmt.Errorf("invalid base64 image data: %w", err)
	}

	img, _, err := image.Decode(bytes.NewReader(rawBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to decode thumbnail image: %w", err)
	}

	itemDir := filepath.Join(active.Path, "items", item.ID)
	if err := ensureItemDir(itemDir); err != nil {
		return nil, err
	}
	origPath := filepath.Join(itemDir, item.Filename)

	origW := videoWidth
	origH := videoHeight
	if origW <= 0 || origH <= 0 {
		b := img.Bounds()
		origW = b.Dx()
		origH = b.Dy()
	}

	w, h, hasThumb, dominantColor, palette, imgMeta := encodeThumbnailAndExtractPalette(
		img,
		origW,
		origH,
		itemDir,
		item.Extension,
		origPath,
	)
	if !hasThumb {
		return nil, errors.New("failed to write thumbnail.jpg")
	}

	paletteStr := strings.Join(palette, ",")
	metaJSONBytes, _ := json.Marshal(imgMeta)
	metaJSONStr := ""
	if imgMeta != nil {
		metaJSONStr = string(metaJSONBytes)
	}

	_, err = db.Exec(
		`UPDATE items SET width = ?, height = ?, has_thumbnail = 1, dominant_color = ?, palette = ?, meta_json = ? WHERE id = ? OR hex = ?`,
		w, h, dominantColor, paletteStr, metaJSONStr, item.ID, item.ID,
	)
	if err != nil {
		return nil, err
	}

	metaPath := filepath.Join(itemDir, "metadata.json")
	if raw, rErr := os.ReadFile(metaPath); rErr == nil {
		var meta ItemMetadata
		if json.Unmarshal(raw, &meta) == nil {
			meta.Width = w
			meta.Height = h
			meta.HasThumbnail = true
			meta.DominantColor = dominantColor
			meta.Palette = palette
			meta.Meta = imgMeta
			if out, mErr := json.MarshalIndent(meta, "", "  "); mErr == nil {
				_ = os.WriteFile(metaPath, out, 0644)
			}
		}
	}

	item.Width = w
	item.Height = h
	item.HasThumbnail = true
	item.DominantColor = dominantColor
	item.Palette = palette
	item.Meta = imgMeta
	m.populateItemPaths(item, active.Path, port)
	m.upsertItemsInCache([]Item{*item}, "")

	if m.app != nil {
		m.app.Event.Emit("library-items-updated", 1)
	}

	return item, nil
}

// backfillImageMetadata populates dominant_color, palette, thumbnail, and meta_json for existing image and video items
// that were imported before extended metadata extraction was introduced.
func (m *LibraryManager) backfillImageMetadata(libPath string) {
	m.mu.RLock()
	db := m.db
	active := m.activeLib
	m.mu.RUnlock()
	if db == nil || active == nil || active.Path != libPath {
		return
	}

	rows, err := db.Query("SELECT id, filename, extension, COALESCE(has_thumbnail, 0) FROM items WHERE COALESCE(dominant_color, '') = '' OR COALESCE(has_thumbnail, 0) = 0")
	if err != nil {
		return
	}
	type pendingItem struct {
		id       string
		filename string
		ext      string
		hasThumb int
	}
	var list []pendingItem
	for rows.Next() {
		var p pendingItem
		if rows.Scan(&p.id, &p.filename, &p.ext, &p.hasThumb) == nil && (IsImageExtension(p.ext) || IsVideoExtension(p.ext)) {
			list = append(list, p)
		}
	}
	rows.Close()

	if len(list) == 0 {
		return
	}

	updatedCount := 0
	workers := max(1, min(4, len(list)))
	jobCh := make(chan pendingItem, len(list))
	type backfillRes struct {
		p             pendingItem
		w, h          int
		hasThumb      bool
		dominantColor string
		palette       []string
		imgMeta       *ImageMeta
	}
	resCh := make(chan backfillRes, len(list))
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for p := range jobCh {
				m.mu.RLock()
				currLib := m.activeLib
				m.mu.RUnlock()
				if currLib == nil || currLib.Path != libPath {
					return
				}
				itemDir := filepath.Join(libPath, "items", p.id)
				origPath := filepath.Join(itemDir, p.filename)
				w, h, hasThumb, dominantColor, palette, imgMeta := m.processImageThumbnail(origPath, itemDir, p.ext)
				if dominantColor == "" && !hasThumb {
					continue
				}
				resCh <- backfillRes{
					p:             p,
					w:             w,
					h:             h,
					hasThumb:      hasThumb,
					dominantColor: dominantColor,
					palette:       palette,
					imgMeta:       imgMeta,
				}
			}
		}()
	}
	for _, p := range list {
		jobCh <- p
	}
	close(jobCh)
	wg.Wait()
	close(resCh)

	m.mu.RLock()
	currLib := m.activeLib
	currDB := m.db
	m.mu.RUnlock()
	if currDB == nil || currLib == nil || currLib.Path != libPath {
		return
	}

	tx, txErr := currDB.Begin()
	var updStmt *sql.Stmt
	if txErr == nil {
		updStmt, _ = tx.Prepare("UPDATE items SET width = CASE WHEN ? > 0 THEN ? ELSE width END, height = CASE WHEN ? > 0 THEN ? ELSE height END, has_thumbnail = ?, dominant_color = ?, palette = ?, meta_json = ? WHERE id = ?")
	}

	for r := range resCh {
		hasThumbInt := r.p.hasThumb
		if r.hasThumb {
			hasThumbInt = 1
		}
		paletteStr := strings.Join(r.palette, ",")
		metaBytes, _ := json.Marshal(r.imgMeta)
		var execErr error
		if updStmt != nil {
			_, execErr = updStmt.Exec(r.w, r.w, r.h, r.h, hasThumbInt, r.dominantColor, paletteStr, string(metaBytes), r.p.id)
		} else {
			_, execErr = currDB.Exec(
				"UPDATE items SET width = CASE WHEN ? > 0 THEN ? ELSE width END, height = CASE WHEN ? > 0 THEN ? ELSE height END, has_thumbnail = ?, dominant_color = ?, palette = ?, meta_json = ? WHERE id = ?",
				r.w, r.w, r.h, r.h, hasThumbInt, r.dominantColor, paletteStr, string(metaBytes), r.p.id,
			)
		}
		if execErr == nil {
			updatedCount++
			itemDir := filepath.Join(libPath, "items", r.p.id)
			metaPath := filepath.Join(itemDir, "metadata.json")
			if raw, rErr := os.ReadFile(metaPath); rErr == nil {
				var meta ItemMetadata
				if json.Unmarshal(raw, &meta) == nil {
					if r.w > 0 && r.h > 0 {
						meta.Width = r.w
						meta.Height = r.h
					}
					if r.hasThumb {
						meta.HasThumbnail = true
					}
					meta.DominantColor = r.dominantColor
					meta.Palette = r.palette
					meta.Meta = r.imgMeta
					if out, mErr := json.Marshal(meta); mErr == nil {
						_ = os.WriteFile(metaPath, out, 0644)
					}
				}
			}
		}
	}
	if updStmt != nil {
		_ = updStmt.Close()
	}
	if tx != nil {
		_ = tx.Commit()
	}

	if updatedCount > 0 {
		m.invalidateCache()
		_ = m.ensureCacheLoaded()
		if m.app != nil {
			m.app.Event.Emit("library-items-updated", updatedCount)
		}
	}
}

// DeleteItem removes the item folder from disk and its row from SQLite.
func (m *LibraryManager) DeleteItem(id string) error {
	m.mu.RLock()
	active := m.activeLib
	db := m.db
	m.mu.RUnlock()

	if active == nil || db == nil {
		return errors.New("no active library")
	}

	itemDir := filepath.Join(active.Path, "items", id)
	_ = os.RemoveAll(itemDir)

	_, _ = db.Exec("DELETE FROM item_folders WHERE item_id = ?", id)
	_, err := db.Exec("DELETE FROM items WHERE id = ? OR hex = ?", id, id)
	m.removeCachedItem(id)
	return err
}

// RevealInFinder reveals the item in macOS Finder or Windows Explorer.
func (m *LibraryManager) RevealInFinder(id string) error {
	item, err := m.GetItem(id)
	if err != nil || item == nil {
		return errors.New("item not found")
	}

	filePath := filepath.Join(item.ItemPath, item.Filename)
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", "-R", filePath).Run()
	case "windows":
		return exec.Command("explorer.exe", "/select,", filePath).Run()
	default:
		return exec.Command("xdg-open", item.ItemPath).Run()
	}
}

func (m *LibraryManager) populateItemPaths(item *Item, activePath string, port int) {
	item.ItemPath = filepath.Join(activePath, "items", item.ID)
	item.FilePath = filepath.Join(item.ItemPath, item.Filename)
	item.ShellPath = EscapeShellPath(item.FilePath)
	item.FileURL = PathToURL(item.FilePath)
	item.OriginalURL = fmt.Sprintf("http://127.0.0.1:%d/asset/item/%s/original", port, item.ID)
	item.ThumbnailURL = fmt.Sprintf("http://127.0.0.1:%d/asset/item/%s/thumbnail", port, item.ID)
	item.DownloadURL = fmt.Sprintf("http://127.0.0.1:%d/asset/download/%s", port, item.ID)
}

// Helper utilities

func PathToURL(filePath string) string {
	slashPath := filepath.ToSlash(filePath)
	if !strings.HasPrefix(slashPath, "/") {
		slashPath = "/" + slashPath
	}
	u := url.URL{
		Scheme: "file",
		Path:   slashPath,
	}
	return u.String()
}

func EscapeShellPath(p string) string {
	var sb strings.Builder
	for _, r := range p {
		switch r {
		case ' ', '\t', '\u00a0', '\u202f', '(', ')', '[', ']', '{', '}', '\'', '"', '\\', '$', '`', '!', '#', '&', '*', '?', ';', '<', '>', '~':
			sb.WriteRune('\\')
			sb.WriteRune(r)
		default:
			sb.WriteRune(r)
		}
	}
	return sb.String()
}

func ComputeFileSHA256(filePath string) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	hasher := sha256.New()
	if _, err := io.Copy(hasher, f); err != nil {
		return "", err
	}
	return strings.ToUpper(hex.EncodeToString(hasher.Sum(nil))), nil
}

func ComputeBytesSHA256(data []byte) string {
	sum := sha256.Sum256(data)
	return strings.ToUpper(hex.EncodeToString(sum[:]))
}

func IsImageExtension(ext string) bool {
	switch strings.ToLower(ext) {
	case "png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "ico":
		return true
	default:
		return false
	}
}

func IsVideoExtension(ext string) bool {
	switch strings.ToLower(ext) {
	case "mp4", "mov", "qt", "webm", "mkv", "avi", "m4v", "flv", "f4v", "mts", "m2ts", "m3u8", "m3u", "mpd", "ogv", "ogm", "3gp", "3g2", "wmv", "asf", "mpg", "mpeg", "m2v", "vob", "rmvb", "rm":
		return true
	default:
		return false
	}
}

func DetectMimeType(filePath string, ext string) string {
	return DetectMimeTypeWithHeader(filePath, ext, nil)
}

func DetectMimeTypeWithHeader(filePath string, ext string, header []byte) string {
	switch strings.ToLower(ext) {
	case "png":
		return "image/png"
	case "jpg", "jpeg":
		return "image/jpeg"
	case "webp":
		return "image/webp"
	case "gif":
		return "image/gif"
	case "svg":
		return "image/svg+xml"
	case "pdf":
		return "application/pdf"
	case "mp4", "m4v", "f4v", "m4s":
		return "video/mp4"
	case "mov", "qt":
		return "video/quicktime"
	case "webm":
		return "video/webm"
	case "mkv":
		return "video/x-matroska"
	case "avi":
		return "video/x-msvideo"
	case "flv":
		return "video/x-flv"
	case "mts", "m2ts":
		return "video/mp2t"
	case "ts":
		buf := header
		if len(buf) == 0 && filePath != "" {
			if f, err := os.Open(filePath); err == nil {
				tmp := make([]byte, 376)
				n, _ := f.Read(tmp)
				_ = f.Close()
				buf = tmp[:n]
			}
		}
		n := len(buf)
		if n >= 188 && buf[0] == 0x47 && (n < 189 || buf[188] == 0x47) {
			return "video/mp2t"
		} else if n > 0 {
			for i := range n {
				if buf[i] == 0 {
					return "video/mp2t"
				}
			}
			return "text/typescript"
		}
		return "text/typescript"
	case "m3u8", "m3u":
		return "application/vnd.apple.mpegurl"
	case "mpd":
		return "application/dash+xml"
	case "ogv", "ogm":
		return "video/ogg"
	case "3gp":
		return "video/3gpp"
	case "3g2":
		return "video/3gpp2"
	case "wmv":
		return "video/x-ms-wmv"
	case "asf":
		return "video/x-ms-asf"
	case "mpg", "mpeg", "m2v", "vob":
		return "video/mpeg"
	case "rmvb", "rm":
		return "application/vnd.rn-realmedia-vbr"
	case "mp3":
		return "audio/mpeg"
	case "wav":
		return "audio/wav"
	case "zip":
		return "application/zip"
	case "json":
		return "application/json"
	case "txt", "md":
		return "text/plain"
	default:
		if len(header) > 0 {
			return http.DetectContentType(header)
		}
		if filePath != "" {
			f, err := os.Open(filePath)
			if err == nil {
				defer f.Close()
				buf := make([]byte, 512)
				n, _ := f.Read(buf)
				if n > 0 {
					return http.DetectContentType(buf[:n])
				}
			}
		}
		return "application/octet-stream"
	}
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = io.ReadFull(strings.NewReader(fmt.Sprintf("%d", time.Now().UnixNano())), b)
	return hex.EncodeToString(b)
}

// GetFolders returns all folders structured as a tree with item counts.
func (m *LibraryManager) GetFolders() ([]Folder, error) {
	start := time.Now()
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()

	if db == nil {
		return []Folder{}, nil
	}

	// 1. Get counts of items in each folder (prefer in-memory index when loaded)
	counts := make(map[string]int)
	m.cacheMu.RLock()
	cacheReady := m.cacheLoaded
	if cacheReady {
		for i := range m.itemsDesc {
			for _, fID := range m.itemsDesc[i].Folders {
				counts[fID]++
			}
		}
	}
	m.cacheMu.RUnlock()

	if !cacheReady {
		cRows, err := db.Query(`
			SELECT item_folders.folder_id, COUNT(DISTINCT item_folders.item_id)
			FROM item_folders
			JOIN items ON item_folders.item_id = items.id
			WHERE (items.in_trash = 0 OR items.in_trash IS NULL)
			GROUP BY item_folders.folder_id
		`)
		if err == nil {
			for cRows.Next() {
				var fID string
				var count int
				if scanErr := cRows.Scan(&fID, &count); scanErr == nil {
					counts[fID] = count
				}
			}
			cRows.Close()
		}
	}

	// 2. Query all folders
	rows, err := db.Query("SELECT id, name, COALESCE(parent_id, ''), created_at, sort_order FROM folders ORDER BY sort_order ASC, created_at ASC")
	if err != nil {
		return []Folder{}, err
	}
	defer rows.Close()

	var allFolders []Folder
	lookup := make(map[string]bool)

	for rows.Next() {
		var f Folder
		if err := rows.Scan(&f.ID, &f.Name, &f.ParentID, &f.CreatedAt, &f.SortOrder); err != nil {
			continue
		}
		f.ItemCount = counts[f.ID]
		f.Children = []Folder{}
		allFolders = append(allFolders, f)
		lookup[f.ID] = true
	}

	// O(N) children adjacency index instead of O(N^2) recursive scans
	childrenByParent := make(map[string][]int, len(allFolders))
	var rootIndices []int
	for i := range allFolders {
		parentID := allFolders[i].ParentID
		if parentID == "" || !lookup[parentID] {
			rootIndices = append(rootIndices, i)
		} else {
			childrenByParent[parentID] = append(childrenByParent[parentID], i)
		}
	}

	var assemble func(parentID string) []Folder
	assemble = func(parentID string) []Folder {
		childIdxs := childrenByParent[parentID]
		if len(childIdxs) == 0 {
			return []Folder{}
		}
		result := make([]Folder, len(childIdxs))
		for k, idx := range childIdxs {
			f := allFolders[idx]
			f.Children = assemble(f.ID)
			result[k] = f
		}
		return result
	}

	tree := make([]Folder, len(rootIndices))
	for k, idx := range rootIndices {
		root := allFolders[idx]
		root.Children = assemble(root.ID)
		tree[k] = root
	}

	if dur := time.Since(start).Milliseconds(); dur >= 15 {
		RecordLog("perf", "core", "GetFolders slow query", fmt.Sprintf("total_folders=%d roots=%d", len(allFolders), len(tree)), dur)
	}
	return tree, nil
}

// CreateFolder creates a new virtual folder.
func (m *LibraryManager) CreateFolder(name string, parentID string) (*Folder, error) {
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()

	if db == nil {
		return nil, errors.New("no active library")
	}

	cleanName := strings.TrimSpace(name)
	if cleanName == "" {
		cleanName = "New Folder"
	}

	folderID := fmt.Sprintf("folder_%d_%04d", time.Now().UnixNano(), time.Now().Nanosecond()%10000)
	now := time.Now().Unix()

	_, err := db.Exec("INSERT INTO folders (id, name, parent_id, created_at, sort_order) VALUES (?, ?, ?, ?, ?)",
		folderID, cleanName, strings.TrimSpace(parentID), now, 0,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create folder: %w", err)
	}

	return &Folder{
		ID:        folderID,
		Name:      cleanName,
		ParentID:  strings.TrimSpace(parentID),
		CreatedAt: now,
		SortOrder: 0,
		Children:  []Folder{},
		ItemCount: 0,
	}, nil
}

// RenameFolder updates a folder's display name.
func (m *LibraryManager) RenameFolder(id string, name string) error {
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()

	if db == nil {
		return errors.New("no active library")
	}

	cleanName := strings.TrimSpace(name)
	if cleanName == "" {
		return errors.New("folder name cannot be empty")
	}

	_, err := db.Exec("UPDATE folders SET name = ? WHERE id = ?", cleanName, id)
	return err
}

// DeleteFolder deletes a folder and its children (without deleting items).
func (m *LibraryManager) DeleteFolder(id string) error {
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()

	if db == nil {
		return errors.New("no active library")
	}

	folderIDs := []string{id}
	queue := []string{id}
	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]
		rows, err := db.Query("SELECT id FROM folders WHERE parent_id = ?", curr)
		if err == nil {
			for rows.Next() {
				var childID string
				if rows.Scan(&childID) == nil {
					folderIDs = append(folderIDs, childID)
					queue = append(queue, childID)
				}
			}
			rows.Close()
		}
	}

	deletedSet := make(map[string]bool, len(folderIDs))
	for _, fID := range folderIDs {
		deletedSet[fID] = true
		_, _ = db.Exec("DELETE FROM item_folders WHERE folder_id = ?", fID)
		_, _ = db.Exec("DELETE FROM folders WHERE id = ?", fID)
	}
	m.cacheMu.Lock()
	if m.cacheLoaded {
		for i := range m.itemsDesc {
			if len(m.itemsDesc[i].Folders) == 0 {
				continue
			}
			filtered := make([]string, 0, len(m.itemsDesc[i].Folders))
			for _, fid := range m.itemsDesc[i].Folders {
				if !deletedSet[fid] {
					filtered = append(filtered, fid)
				}
			}
			if len(filtered) != len(m.itemsDesc[i].Folders) {
				m.itemsDesc[i].Folders = filtered
				m.itemsByID[m.itemsDesc[i].ID] = m.itemsDesc[i]
				if m.itemsDesc[i].Hex != "" {
					m.itemsByID[m.itemsDesc[i].Hex] = m.itemsDesc[i]
				}
			}
		}
	}
	m.cacheMu.Unlock()
	return nil
}

// AddItemToFolder links an item to a folder.
func (m *LibraryManager) AddItemToFolder(itemID string, folderID string) error {
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()

	if db == nil {
		return errors.New("no active library")
	}

	_, err := db.Exec("INSERT OR IGNORE INTO item_folders (item_id, folder_id, added_at) VALUES (?, ?, ?)",
		itemID, folderID, time.Now().Unix(),
	)
	if err == nil && folderID != "" {
		m.mutateCachedItem(itemID, func(it *Item) {
			for _, f := range it.Folders {
				if f == folderID {
					return
				}
			}
			it.Folders = append(append([]string{}, it.Folders...), folderID)
		})
	}
	return err
}

// RemoveItemFromFolder unlinks an item from a folder.
func (m *LibraryManager) RemoveItemFromFolder(itemID string, folderID string) error {
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()

	if db == nil {
		return errors.New("no active library")
	}

	_, err := db.Exec("DELETE FROM item_folders WHERE item_id = ? AND folder_id = ?", itemID, folderID)
	if err == nil && folderID != "" {
		m.mutateCachedItem(itemID, func(it *Item) {
			next := make([]string, 0, len(it.Folders))
			for _, f := range it.Folders {
				if f != folderID {
					next = append(next, f)
				}
			}
			it.Folders = next
		})
	}
	return err
}

// SetItemFolders sets the complete list of folders for an item.
func (m *LibraryManager) SetItemFolders(itemID string, folderIDs []string) error {
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()

	if db == nil {
		return errors.New("no active library")
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM item_folders WHERE item_id = ?", itemID); err != nil {
		return err
	}

	now := time.Now().Unix()
	stmt, err := tx.Prepare("INSERT OR IGNORE INTO item_folders (item_id, folder_id, added_at) VALUES (?, ?, ?)")
	if err != nil {
		return err
	}
	defer stmt.Close()

	cleanFolders := make([]string, 0, len(folderIDs))
	for _, fID := range folderIDs {
		trimmed := strings.TrimSpace(fID)
		if trimmed != "" {
			if _, err := stmt.Exec(itemID, trimmed, now); err != nil {
				return err
			}
			cleanFolders = append(cleanFolders, trimmed)
		}
	}

	err = tx.Commit()
	if err == nil {
		m.mutateCachedItem(itemID, func(it *Item) {
			it.Folders = cleanFolders
		})
	}
	return err
}

// PermanentDeleteItem permanently removes an item directory from disk and database.
func (m *LibraryManager) PermanentDeleteItem(id string) error {
	return m.DeleteItem(id)
}

// MoveToTrash moves an item to the recycle bin, preserving all folder references for restore.
func (m *LibraryManager) MoveToTrash(id string) error {
	m.mu.RLock()
	active := m.activeLib
	db := m.db
	m.mu.RUnlock()

	if active == nil || db == nil {
		return errors.New("no active library")
	}

	// 1. Collect current folder associations
	var currentFolders []string
	rows, err := db.Query("SELECT folder_id FROM item_folders WHERE item_id = ?", id)
	if err == nil {
		for rows.Next() {
			var fID string
			if rows.Scan(&fID) == nil {
				currentFolders = append(currentFolders, fID)
			}
		}
		rows.Close()
	}
	if currentFolders == nil {
		currentFolders = []string{}
	}

	foldersJSON, _ := json.Marshal(currentFolders)
	now := time.Now().Unix()

	// 2. Update database row
	_, err = db.Exec("UPDATE items SET in_trash = 1, trashed_at = ?, trashed_folders = ? WHERE id = ? OR hex = ?",
		now, string(foldersJSON), id, id,
	)
	if err != nil {
		return err
	}

	// 3. Remove active links from item_folders so it no longer counts in active views
	_, _ = db.Exec("DELETE FROM item_folders WHERE item_id = ?", id)

	// 4. Update metadata.json on disk if present
	itemDir := filepath.Join(active.Path, "items", id)
	metaPath := filepath.Join(itemDir, "metadata.json")
	if data, readErr := os.ReadFile(metaPath); readErr == nil {
		var meta ItemMetadata
		if json.Unmarshal(data, &meta) == nil {
			meta.InTrash = true
			meta.TrashedAt = now
			meta.TrashedFolders = currentFolders
			updated, _ := json.MarshalIndent(meta, "", "  ")
			_ = os.WriteFile(metaPath, updated, 0644)
		}
	}

	m.mutateCachedItem(id, func(it *Item) {
		it.InTrash = true
		it.TrashedAt = now
		it.Folders = currentFolders
	})
	return nil
}

// BatchMoveToTrash moves multiple items to the recycle bin.
func (m *LibraryManager) BatchMoveToTrash(ids []string) error {
	for _, id := range ids {
		if err := m.MoveToTrash(id); err != nil {
			return err
		}
	}
	return nil
}

// RestoreFromTrash restores an item from the recycle bin back to its original folders.
func (m *LibraryManager) RestoreFromTrash(id string) error {
	m.mu.RLock()
	active := m.activeLib
	db := m.db
	m.mu.RUnlock()

	if active == nil || db == nil {
		return errors.New("no active library")
	}

	var trashedFoldersStr string
	err := db.QueryRow("SELECT COALESCE(trashed_folders, '') FROM items WHERE id = ? OR hex = ?", id, id).Scan(&trashedFoldersStr)
	if err != nil {
		return err
	}

	var restoredFolders []string
	if trashedFoldersStr != "" {
		_ = json.Unmarshal([]byte(trashedFoldersStr), &restoredFolders)
	}

	now := time.Now().Unix()
	for _, fID := range restoredFolders {
		var exists int
		_ = db.QueryRow("SELECT COUNT(*) FROM folders WHERE id = ?", fID).Scan(&exists)
		if exists > 0 {
			_, _ = db.Exec("INSERT OR IGNORE INTO item_folders (item_id, folder_id, added_at) VALUES (?, ?, ?)", id, fID, now)
		}
	}

	_, err = db.Exec("UPDATE items SET in_trash = 0, trashed_at = 0, trashed_folders = '' WHERE id = ? OR hex = ?", id, id)
	if err != nil {
		return err
	}

	itemDir := filepath.Join(active.Path, "items", id)
	metaPath := filepath.Join(itemDir, "metadata.json")
	if data, readErr := os.ReadFile(metaPath); readErr == nil {
		var meta ItemMetadata
		if json.Unmarshal(data, &meta) == nil {
			meta.InTrash = false
			meta.TrashedAt = 0
			meta.TrashedFolders = nil
			updated, _ := json.MarshalIndent(meta, "", "  ")
			_ = os.WriteFile(metaPath, updated, 0644)
		}
	}

	m.mutateCachedItem(id, func(it *Item) {
		it.InTrash = false
		it.TrashedAt = 0
		if restoredFolders == nil {
			it.Folders = []string{}
		} else {
			it.Folders = restoredFolders
		}
	})
	return nil
}

// BatchRestoreFromTrash restores multiple items from the recycle bin.
func (m *LibraryManager) BatchRestoreFromTrash(ids []string) error {
	for _, id := range ids {
		if err := m.RestoreFromTrash(id); err != nil {
			return err
		}
	}
	return nil
}

// EmptyTrash permanently deletes all items in the recycle bin.
func (m *LibraryManager) EmptyTrash() error {
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()

	if db == nil {
		return errors.New("no active library")
	}

	rows, err := db.Query("SELECT id FROM items WHERE in_trash = 1")
	if err != nil {
		return err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var itID string
		if rows.Scan(&itID) == nil {
			ids = append(ids, itID)
		}
	}

	for _, itID := range ids {
		_ = m.PermanentDeleteItem(itID)
	}
	return nil
}

// GetTrashItems retrieves items that are currently in the recycle bin.
func (m *LibraryManager) GetTrashItems(query string, sortOrder string) ([]Item, error) {
	m.mu.RLock()
	db := m.db
	active := m.activeLib
	m.mu.RUnlock()

	if db == nil || active == nil {
		return []Item{}, nil
	}

	if err := m.ensureCacheLoaded(); err != nil {
		return nil, err
	}

	m.cacheMu.RLock()
	defer m.cacheMu.RUnlock()

	trimmed := strings.ToLower(strings.TrimSpace(query))
	isAsc := strings.ToLower(sortOrder) == "asc"
	n := len(m.trashDesc)
	if n == 0 {
		return []Item{}, nil
	}

	if trimmed == "" {
		result := make([]Item, n)
		if !isAsc {
			copy(result, m.trashDesc)
		} else {
			for i := range n {
				result[i] = m.trashDesc[n-1-i]
			}
		}
		return result, nil
	}

	result := make([]Item, 0, 16)
	if !isAsc {
		for i := range n {
			it := m.trashDesc[i]
			if strings.Contains(m.searchIndex[it.ID], trimmed) {
				result = append(result, it)
			}
		}
	} else {
		for i := n - 1; i >= 0; i-- {
			it := m.trashDesc[i]
			if strings.Contains(m.searchIndex[it.ID], trimmed) {
				result = append(result, it)
			}
		}
	}
	return result, nil
}

// GetTrashCount returns the number of items currently in the recycle bin.
func (m *LibraryManager) GetTrashCount() (int, error) {
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()

	if db == nil {
		return 0, nil
	}

	m.cacheMu.RLock()
	if m.cacheLoaded {
		c := len(m.trashDesc)
		m.cacheMu.RUnlock()
		return c, nil
	}
	m.cacheMu.RUnlock()

	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM items WHERE in_trash = 1").Scan(&count)
	return count, err
}

// MoveItemToFolder moves an item from one folder to another. If fromFolderID is empty, it replaces item folders with toFolderID.
func (m *LibraryManager) MoveItemToFolder(itemID string, fromFolderID string, toFolderID string) error {
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()

	if db == nil {
		return errors.New("no active library")
	}

	cleanTo := strings.TrimSpace(toFolderID)
	cleanFrom := strings.TrimSpace(fromFolderID)
	if cleanFrom != "" && cleanFrom == cleanTo {
		return nil
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if cleanFrom != "" {
		_, _ = tx.Exec("DELETE FROM item_folders WHERE item_id = ? AND folder_id = ?", itemID, cleanFrom)
	} else {
		_, _ = tx.Exec("DELETE FROM item_folders WHERE item_id = ?", itemID)
	}

	if cleanTo != "" {
		_, err = tx.Exec("INSERT OR IGNORE INTO item_folders (item_id, folder_id, added_at) VALUES (?, ?, ?)",
			itemID, cleanTo, time.Now().Unix(),
		)
		if err != nil {
			return err
		}
	}

	err = tx.Commit()
	if err == nil {
		m.mutateCachedItem(itemID, func(it *Item) {
			var next []string
			if cleanFrom != "" {
				for _, f := range it.Folders {
					if f != cleanFrom && f != cleanTo {
						next = append(next, f)
					}
				}
			}
			if cleanTo != "" {
				next = append(next, cleanTo)
			}
			if next == nil {
				next = []string{}
			}
			it.Folders = next
		})
	}
	return err
}

// ImportFolderRecursively imports an external directory into the library, creating matching virtual folders
// and importing files into the library concurrently while associating them with their respective virtual folders.
func (m *LibraryManager) ImportFolderRecursively(dirPath string, parentFolderID string) (*Folder, error) {
	return m.ImportFolderRecursivelyWithProgress(dirPath, parentFolderID, nil)
}

// ImportFolderRecursivelyWithProgress imports a directory hierarchy concurrently with progress callbacks.
func (m *LibraryManager) ImportFolderRecursivelyWithProgress(dirPath string, parentFolderID string, onProgress ProgressCallback) (*Folder, error) {
	m.mu.RLock()
	active := m.activeLib
	db := m.db
	m.mu.RUnlock()

	if active == nil || db == nil {
		return nil, errors.New("no active library")
	}

	stat, err := os.Stat(dirPath)
	if err != nil {
		return nil, fmt.Errorf("stat failed on %s: %w", dirPath, err)
	}
	if !stat.IsDir() {
		return nil, fmt.Errorf("%s is not a directory", dirPath)
	}

	_ = m.ensureCacheLoaded()

	folderName := filepath.Base(dirPath)
	rootFolder, err := m.CreateFolder(folderName, parentFolderID)
	if err != nil {
		return nil, err
	}

	var jobs []importJob
	var walkDir func(currentPath string, currentFolderID string)
	walkDir = func(currentPath string, currentFolderID string) {
		entries, err := os.ReadDir(currentPath)
		if err != nil {
			return
		}

		for _, entry := range entries {
			entryName := entry.Name()
			if strings.HasPrefix(entryName, ".") {
				continue
			}
			fullPath := filepath.Join(currentPath, entryName)

			if entry.IsDir() {
				subFolder, err := m.CreateFolder(entryName, currentFolderID)
				if err == nil && subFolder != nil {
					walkDir(fullPath, subFolder.ID)
				}
			} else {
				jobs = append(jobs, importJob{
					index:    len(jobs),
					srcPath:  fullPath,
					folderID: currentFolderID,
				})
			}
		}
	}

	walkDir(dirPath, rootFolder.ID)
	if len(jobs) > 0 {
		_, _ = m.runConcurrentImportJobs(jobs, onProgress)
	}
	return rootFolder, nil
}

// ImportFoldersRecursively imports multiple external directories into the library.
func (m *LibraryManager) ImportFoldersRecursively(dirPaths []string, parentFolderID string) ([]Folder, error) {
	return m.ImportFoldersRecursivelyWithProgress(dirPaths, parentFolderID, nil)
}

// ImportFoldersRecursivelyWithProgress imports multiple external directories concurrently with progress callbacks.
func (m *LibraryManager) ImportFoldersRecursivelyWithProgress(dirPaths []string, parentFolderID string, onProgress ProgressCallback) ([]Folder, error) {
	m.mu.RLock()
	active := m.activeLib
	db := m.db
	m.mu.RUnlock()

	if active == nil || db == nil {
		return []Folder{}, errors.New("no active library")
	}

	_ = m.ensureCacheLoaded()

	var created []Folder
	var jobs []importJob

	var walkDir func(currentPath string, currentFolderID string)
	walkDir = func(currentPath string, currentFolderID string) {
		entries, err := os.ReadDir(currentPath)
		if err != nil {
			return
		}
		for _, entry := range entries {
			entryName := entry.Name()
			if strings.HasPrefix(entryName, ".") {
				continue
			}
			fullPath := filepath.Join(currentPath, entryName)
			if entry.IsDir() {
				subFolder, err := m.CreateFolder(entryName, currentFolderID)
				if err == nil && subFolder != nil {
					walkDir(fullPath, subFolder.ID)
				}
			} else {
				jobs = append(jobs, importJob{
					index:    len(jobs),
					srcPath:  fullPath,
					folderID: currentFolderID,
				})
			}
		}
	}

	for _, p := range dirPaths {
		stat, err := os.Stat(p)
		if err != nil || !stat.IsDir() {
			continue
		}
		f, err := m.CreateFolder(filepath.Base(p), parentFolderID)
		if err == nil && f != nil {
			created = append(created, *f)
			walkDir(p, f.ID)
		}
	}

	if len(jobs) > 0 {
		_, _ = m.runConcurrentImportJobs(jobs, onProgress)
	}

	return created, nil
}

// GetTags returns all tags with item count, with the built-in Favorites tag
// (FavoriteTagName) pinned first.
func (m *LibraryManager) GetTags() ([]Tag, error) {
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()

	if db == nil {
		return []Tag{}, nil
	}

	// 1. Get all declared tags from tags table
	tagSet := make(map[string]int64)
	tRows, err := db.Query("SELECT name, created_at FROM tags")
	if err == nil {
		for tRows.Next() {
			var name string
			var createdAt int64
			if tRows.Scan(&name, &createdAt) == nil {
				name = strings.TrimSpace(name)
				if name != "" {
					tagSet[name] = createdAt
				}
			}
		}
		tRows.Close()
	}

	if _, ok := tagSet[FavoriteTagName]; !ok {
		tagSet[FavoriteTagName] = time.Now().Unix()
	}

	// 2. Count non-trashed items for each tag (prefer in-memory index when loaded)
	tagCounts := make(map[string]int)
	m.cacheMu.RLock()
	cacheReady := m.cacheLoaded
	if cacheReady {
		nowUnix := time.Now().Unix()
		for i := range m.itemsDesc {
			for _, t := range m.itemsDesc[i].Tags {
				t = strings.TrimSpace(t)
				if t != "" {
					tagCounts[t]++
					if _, ok := tagSet[t]; !ok {
						tagSet[t] = nowUnix
					}
				}
			}
		}
	}
	m.cacheMu.RUnlock()

	if !cacheReady {
		iRows, err := db.Query("SELECT tags FROM items WHERE (in_trash = 0 OR in_trash IS NULL) AND tags != ''")
		if err == nil {
			for iRows.Next() {
				var tagsStr string
				if iRows.Scan(&tagsStr) == nil && tagsStr != "" {
					for _, t := range strings.Split(tagsStr, ",") {
						t = strings.TrimSpace(t)
						if t != "" {
							tagCounts[t]++
							if _, ok := tagSet[t]; !ok {
								tagSet[t] = time.Now().Unix()
							}
						}
					}
				}
			}
			iRows.Close()
		}
	}

	var tags []Tag
	for name, createdAt := range tagSet {
		tags = append(tags, Tag{
			Name:      name,
			CreatedAt: createdAt,
			ItemCount: tagCounts[name],
		})
	}

	sort.Slice(tags, func(i, j int) bool {
		if tags[i].Name == FavoriteTagName {
			return true
		}
		if tags[j].Name == FavoriteTagName {
			return false
		}
		return tags[i].Name < tags[j].Name
	})

	return tags, nil
}

// CreateTag creates a new tag in the library taxonomy.
func (m *LibraryManager) CreateTag(name string) (*Tag, error) {
	m.mu.RLock()
	db := m.db
	m.mu.RUnlock()

	if db == nil {
		return nil, errors.New("no active library")
	}

	clean := strings.TrimSpace(name)
	if clean == "" {
		return nil, errors.New("tag name cannot be empty")
	}

	now := time.Now().Unix()
	_, err := db.Exec("INSERT OR IGNORE INTO tags (name, created_at, color) VALUES (?, ?, '')", clean, now)
	if err != nil {
		return nil, err
	}

	return &Tag{
		Name:      clean,
		CreatedAt: now,
		ItemCount: 0,
	}, nil
}

// DeleteTag deletes a tag from library and removes it from all items.
func (m *LibraryManager) DeleteTag(name string) error {
	m.mu.RLock()
	db := m.db
	active := m.activeLib
	m.mu.RUnlock()

	if db == nil {
		return errors.New("no active library")
	}

	clean := strings.TrimSpace(name)
	if clean == "" || clean == FavoriteTagName {
		return errors.New("cannot delete the built-in Favorites tag")
	}

	_, _ = db.Exec("DELETE FROM tags WHERE name = ?", clean)

	rows, err := db.Query("SELECT id, tags FROM items WHERE tags LIKE ?", "%"+clean+"%")
	if err == nil {
		type itemTagUpdate struct {
			id      string
			newTags []string
		}
		var updates []itemTagUpdate
		for rows.Next() {
			var itID, tagsStr string
			if rows.Scan(&itID, &tagsStr) == nil {
				var remaining []string
				for _, t := range strings.Split(tagsStr, ",") {
					t = strings.TrimSpace(t)
					if t != "" && t != clean {
						remaining = append(remaining, t)
					}
				}
				updates = append(updates, itemTagUpdate{id: itID, newTags: remaining})
			}
		}
		rows.Close()

		for _, u := range updates {
			newStr := strings.Join(u.newTags, ",")
			_, _ = db.Exec("UPDATE items SET tags = ? WHERE id = ?", newStr, u.id)
			if active != nil {
				metaPath := filepath.Join(active.Path, "items", u.id, "metadata.json")
				if data, rErr := os.ReadFile(metaPath); rErr == nil {
					var meta ItemMetadata
					if json.Unmarshal(data, &meta) == nil {
						meta.Tags = u.newTags
						updated, _ := json.MarshalIndent(meta, "", "  ")
						_ = os.WriteFile(metaPath, updated, 0644)
					}
				}
			}
		}
	}
	m.invalidateCache()
	return nil
}

// AddTagToItem associates a tag with an item.
func (m *LibraryManager) AddTagToItem(itemID string, tag string) error {
	m.mu.RLock()
	db := m.db
	active := m.activeLib
	m.mu.RUnlock()

	if db == nil || active == nil {
		return errors.New("no active library")
	}

	cleanTag := strings.TrimSpace(tag)
	if cleanTag == "" {
		return errors.New("tag cannot be empty")
	}

	var tagsStr string
	err := db.QueryRow("SELECT COALESCE(tags, '') FROM items WHERE id = ? OR hex = ?", itemID, itemID).Scan(&tagsStr)
	if err != nil {
		return err
	}

	var existingTags []string
	if tagsStr != "" {
		for _, t := range strings.Split(tagsStr, ",") {
			t = strings.TrimSpace(t)
			if t != "" {
				if t == cleanTag {
					return nil
				}
				existingTags = append(existingTags, t)
			}
		}
	}
	existingTags = append(existingTags, cleanTag)
	newTagsStr := strings.Join(existingTags, ",")

	_, err = db.Exec("UPDATE items SET tags = ? WHERE id = ? OR hex = ?", newTagsStr, itemID, itemID)
	if err != nil {
		return err
	}

	_, _ = db.Exec("INSERT OR IGNORE INTO tags (name, created_at, color) VALUES (?, ?, '')", cleanTag, time.Now().Unix())

	metaPath := filepath.Join(active.Path, "items", itemID, "metadata.json")
	if data, readErr := os.ReadFile(metaPath); readErr == nil {
		var meta ItemMetadata
		if json.Unmarshal(data, &meta) == nil {
			meta.Tags = existingTags
			updated, _ := json.MarshalIndent(meta, "", "  ")
			_ = os.WriteFile(metaPath, updated, 0644)
		}
	}
	m.mutateCachedItem(itemID, func(it *Item) {
		it.Tags = existingTags
	})
	return nil
}

// RemoveTagFromItem removes a tag from an item.
func (m *LibraryManager) RemoveTagFromItem(itemID string, tag string) error {
	m.mu.RLock()
	db := m.db
	active := m.activeLib
	m.mu.RUnlock()

	if db == nil || active == nil {
		return errors.New("no active library")
	}

	cleanTag := strings.TrimSpace(tag)
	var tagsStr string
	err := db.QueryRow("SELECT COALESCE(tags, '') FROM items WHERE id = ? OR hex = ?", itemID, itemID).Scan(&tagsStr)
	if err != nil {
		return err
	}

	var newTags []string
	if tagsStr != "" {
		for _, t := range strings.Split(tagsStr, ",") {
			t = strings.TrimSpace(t)
			if t != "" && t != cleanTag {
				newTags = append(newTags, t)
			}
		}
	}
	newTagsStr := strings.Join(newTags, ",")

	_, err = db.Exec("UPDATE items SET tags = ? WHERE id = ? OR hex = ?", newTagsStr, itemID, itemID)
	if err != nil {
		return err
	}

	metaPath := filepath.Join(active.Path, "items", itemID, "metadata.json")
	if data, readErr := os.ReadFile(metaPath); readErr == nil {
		var meta ItemMetadata
		if json.Unmarshal(data, &meta) == nil {
			meta.Tags = newTags
			updated, _ := json.MarshalIndent(meta, "", "  ")
			_ = os.WriteFile(metaPath, updated, 0644)
		}
	}
	m.mutateCachedItem(itemID, func(it *Item) {
		if newTags == nil {
			it.Tags = []string{}
		} else {
			it.Tags = newTags
		}
	})
	return nil
}

// SetItemTags sets the complete list of tags for an item.
func (m *LibraryManager) SetItemTags(itemID string, tags []string) error {
	m.mu.RLock()
	db := m.db
	active := m.activeLib
	m.mu.RUnlock()

	if db == nil || active == nil {
		return errors.New("no active library")
	}

	var cleanTags []string
	seen := make(map[string]bool)
	now := time.Now().Unix()
	for _, t := range tags {
		c := strings.TrimSpace(t)
		if c != "" && !seen[c] {
			seen[c] = true
			cleanTags = append(cleanTags, c)
			_, _ = db.Exec("INSERT OR IGNORE INTO tags (name, created_at, color) VALUES (?, ?, '')", c, now)
		}
	}
	if cleanTags == nil {
		cleanTags = []string{}
	}

	newTagsStr := strings.Join(cleanTags, ",")
	_, err := db.Exec("UPDATE items SET tags = ? WHERE id = ? OR hex = ?", newTagsStr, itemID, itemID)
	if err != nil {
		return err
	}

	metaPath := filepath.Join(active.Path, "items", itemID, "metadata.json")
	if data, readErr := os.ReadFile(metaPath); readErr == nil {
		var meta ItemMetadata
		if json.Unmarshal(data, &meta) == nil {
			meta.Tags = cleanTags
			updated, _ := json.MarshalIndent(meta, "", "  ")
			_ = os.WriteFile(metaPath, updated, 0644)
		}
	}
	m.mutateCachedItem(itemID, func(it *Item) {
		it.Tags = cleanTags
	})
	return nil
}

// ToggleFavorite toggles the built-in Favorites tag for an item.
func (m *LibraryManager) ToggleFavorite(itemID string) (bool, error) {
	item, err := m.GetItem(itemID)
	if err != nil || item == nil {
		return false, errors.New("item not found")
	}

	isFav := false
	for _, t := range item.Tags {
		if t == FavoriteTagName {
			isFav = true
			break
		}
	}

	if isFav {
		err = m.RemoveTagFromItem(itemID, FavoriteTagName)
		return false, err
	}
	err = m.AddTagToItem(itemID, FavoriteTagName)
	return true, err
}

// RenameItem renames the asset's display name and physical file on disk, updating metadata.json.
func (m *LibraryManager) RenameItem(id string, newName string) (*Item, error) {
	m.mu.RLock()
	active := m.activeLib
	db := m.db
	port := m.GetAssetServerPort()
	m.mu.RUnlock()

	if active == nil || db == nil {
		return nil, errors.New("no active library")
	}

	cleanName := strings.TrimSpace(newName)
	for _, badChar := range []string{"/", "\\", ":", "*", "?", "\"", "<", ">", "|", "\x00"} {
		cleanName = strings.ReplaceAll(cleanName, badChar, "")
	}
	cleanName = strings.TrimSpace(cleanName)
	if cleanName == "" {
		return nil, errors.New("file name cannot be empty")
	}

	item, err := m.GetItem(id)
	if err != nil || item == nil {
		return nil, errors.New("item not found")
	}

	extSuffix := "." + strings.ToLower(item.Extension)
	var newFilename string
	var displayName string
	if strings.HasSuffix(strings.ToLower(cleanName), extSuffix) {
		newFilename = cleanName
		displayName = cleanName[:len(cleanName)-len(extSuffix)]
	} else {
		newFilename = cleanName + "." + item.Extension
		displayName = cleanName
	}

	oldPhysicalPath := filepath.Join(item.ItemPath, item.Filename)
	newPhysicalPath := filepath.Join(item.ItemPath, newFilename)

	if oldPhysicalPath != newPhysicalPath {
		if _, statErr := os.Stat(oldPhysicalPath); statErr == nil {
			if err := os.Rename(oldPhysicalPath, newPhysicalPath); err != nil {
				return nil, fmt.Errorf("failed to rename file on disk: %w", err)
			}
		}
	}

	_, err = db.Exec("UPDATE items SET name = ?, filename = ? WHERE id = ? OR hex = ?", displayName, newFilename, id, id)
	if err != nil {
		return nil, fmt.Errorf("failed to update item in database: %w", err)
	}

	metaPath := filepath.Join(item.ItemPath, "metadata.json")
	if data, readErr := os.ReadFile(metaPath); readErr == nil {
		var meta ItemMetadata
		if json.Unmarshal(data, &meta) == nil {
			meta.Name = displayName
			meta.Filename = newFilename
			updated, _ := json.MarshalIndent(meta, "", "  ")
			_ = os.WriteFile(metaPath, updated, 0644)
		}
	}

	item.Name = displayName
	item.Filename = newFilename
	m.populateItemPaths(item, active.Path, port)
	m.mutateCachedItem(id, func(it *Item) {
		it.Name = displayName
		it.Filename = newFilename
		m.populateItemPaths(it, active.Path, port)
	})
	return item, nil
}

// OpenWithDefaultApp opens the physical file with the OS default application.
func (m *LibraryManager) OpenWithDefaultApp(id string) error {
	item, err := m.GetItem(id)
	if err != nil || item == nil {
		return errors.New("item not found")
	}

	filePath := filepath.Join(item.ItemPath, item.Filename)
	if _, statErr := os.Stat(filePath); statErr != nil {
		return fmt.Errorf("file not found on disk: %s", filePath)
	}

	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", filePath).Run()
	case "windows":
		return exec.Command("cmd", "/c", "start", "", filePath).Run()
	default:
		return exec.Command("xdg-open", filePath).Run()
	}
}
