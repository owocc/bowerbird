package core

import (
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
	"strings"
	"sync"
	"time"

	_ "github.com/tursodatabase/go-libsql"
	_ "golang.org/x/image/bmp"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// LibraryManager coordinates library lifecycle, storage, libSQL indexing, and user data.
type LibraryManager struct {
	mu          sync.RWMutex
	app         *application.App
	window      application.Window
	activeLib   *LibraryInfo
	db          *sql.DB
	userData    *UserDataStore
	assetServer *AssetServer
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

// CreateLibrary creates a new xxx.library container, initializes libSQL, and remembers it in user data.
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
	db, err := sql.Open("libsql", "file:"+dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize libSQL: %w", err)
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
	m.mu.Unlock()

	// Persist to user data store
	if m.userData != nil {
		_ = m.userData.SetActiveLibraryPath(fullLibPath)
	}

	return m.activeLib, nil
}

// OpenLibrary mounts an existing xxx.library and persists it to the user data store.
func (m *LibraryManager) OpenLibrary(libraryPath string) (*LibraryInfo, error) {
	libJSONPath := filepath.Join(libraryPath, "library.json")
	data, err := os.ReadFile(libJSONPath)
	if err != nil {
		return nil, fmt.Errorf("invalid library directory (library.json not found): %w", err)
	}

	var meta struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		CreatedAt int64  `json:"createdAt"`
	}
	if err := json.Unmarshal(data, &meta); err != nil {
		return nil, fmt.Errorf("corrupted library.json: %w", err)
	}

	_ = os.MkdirAll(filepath.Join(libraryPath, "items"), 0755)

	dbPath := filepath.Join(libraryPath, "index.db")
	db, err := sql.Open("libsql", "file:"+dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open libSQL database: %w", err)
	}

	if err := m.initSchema(db); err != nil {
		_ = db.Close()
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
	m.mu.Unlock()

	// Persist to user data store so next launch reloads automatically
	if m.userData != nil {
		_ = m.userData.SetActiveLibraryPath(libraryPath)
	}

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

	if m.userData != nil {
		_ = m.userData.ClearActiveLibraryPath()
	}
	return nil
}

// GetActiveLibrary returns the active library metadata.
func (m *LibraryManager) GetActiveLibrary() *LibraryInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.activeLib == nil {
		return nil
	}

	if m.db != nil {
		var count int64
		if err := m.db.QueryRow("SELECT COUNT(*) FROM items").Scan(&count); err == nil {
			m.activeLib.ItemCount = count
		}
	}
	return m.activeLib
}

func (m *LibraryManager) initSchema(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS items (
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
	);
	CREATE INDEX IF NOT EXISTS idx_items_imported_at ON items(imported_at DESC);
	CREATE INDEX IF NOT EXISTS idx_items_extension ON items(extension);
	CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
	CREATE INDEX IF NOT EXISTS idx_items_hex ON items(hex);
	`
	if _, err := db.Exec(schema); err != nil {
		return err
	}
	_, _ = db.Exec("ALTER TABLE items ADD COLUMN hex TEXT DEFAULT ''")
	return nil
}

// GetItems queries items from the libSQL database.
func (m *LibraryManager) GetItems(query string, sortOrder string) ([]Item, error) {
	m.mu.RLock()
	db := m.db
	active := m.activeLib
	port := m.GetAssetServerPort()
	m.mu.RUnlock()

	if db == nil || active == nil {
		return []Item{}, nil
	}

	sqlQuery := "SELECT id, COALESCE(hex, ''), name, extension, filename, size, mime_type, width, height, has_thumbnail, tags, created_at, imported_at FROM items"
	var args []any

	trimmed := strings.TrimSpace(query)
	if trimmed != "" {
		sqlQuery += " WHERE (name LIKE ? OR tags LIKE ? OR extension LIKE ? OR hex LIKE ?)"
		like := "%" + trimmed + "%"
		args = append(args, like, like, like, like)
	}

	if strings.ToLower(sortOrder) == "asc" {
		sqlQuery += " ORDER BY imported_at ASC"
	} else {
		sqlQuery += " ORDER BY imported_at DESC"
	}

	rows, err := db.Query(sqlQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query items: %w", err)
	}
	defer rows.Close()

	var items []Item
	for rows.Next() {
		var item Item
		var tagsStr string
		var hasThumbInt int
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
		); err != nil {
			continue
		}

		item.HasThumbnail = hasThumbInt == 1
		if tagsStr != "" {
			item.Tags = strings.Split(tagsStr, ",")
		} else {
			item.Tags = []string{}
		}
		m.populateItemPaths(&item, active.Path, port)
		items = append(items, item)
	}

	if items == nil {
		items = []Item{}
	}
	return items, nil
}

// GetItem retrieves a single item by ID or Hex.
func (m *LibraryManager) GetItem(id string) (*Item, error) {
	m.mu.RLock()
	db := m.db
	active := m.activeLib
	port := m.GetAssetServerPort()
	m.mu.RUnlock()

	if db == nil || active == nil {
		return nil, errors.New("no active library")
	}

	row := db.QueryRow("SELECT id, COALESCE(hex, ''), name, extension, filename, size, mime_type, width, height, has_thumbnail, tags, created_at, imported_at FROM items WHERE id = ? OR hex = ?", id, id)
	var item Item
	var tagsStr string
	var hasThumbInt int
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
	); err != nil {
		return nil, err
	}

	item.HasThumbnail = hasThumbInt == 1
	if tagsStr != "" {
		item.Tags = strings.Split(tagsStr, ",")
	} else {
		item.Tags = []string{}
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

// ImportFilesWithProgress imports files with real-time progress callbacks for UI feedback.
func (m *LibraryManager) ImportFilesWithProgress(sourcePaths []string, onProgress ProgressCallback) ([]Item, error) {
	m.mu.RLock()
	active := m.activeLib
	db := m.db
	m.mu.RUnlock()

	if active == nil || db == nil {
		return nil, errors.New("no active library")
	}

	// 1. Flatten directories to count total files for accurate progress
	var allFiles []string
	for _, srcPath := range sourcePaths {
		info, err := os.Stat(srcPath)
		if err != nil {
			continue
		}

		if info.IsDir() {
			_ = filepath.WalkDir(srcPath, func(path string, d os.DirEntry, walkErr error) error {
				if walkErr != nil || d.IsDir() {
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
	var imported []Item
	for i, path := range allFiles {
		if onProgress != nil {
			onProgress(i+1, total, filepath.Base(path))
		}
		item, err := m.importSingleFile(path)
		if err == nil && item != nil {
			imported = append(imported, *item)
		}
	}

	return imported, nil
}

func (m *LibraryManager) importSingleFile(srcPath string) (*Item, error) {
	m.mu.RLock()
	active := m.activeLib
	db := m.db
	port := m.GetAssetServerPort()
	m.mu.RUnlock()

	if active == nil || db == nil {
		return nil, errors.New("no active library")
	}

	stat, err := os.Stat(srcPath)
	if err != nil {
		return nil, err
	}

	// Content-addressed deduplication via SHA-256 uppercase hex
	contentHex, err := ComputeFileSHA256(srcPath)
	if err != nil {
		return nil, fmt.Errorf("failed to compute file hash: %w", err)
	}

	existing, err := m.GetItem(contentHex)
	if err == nil && existing != nil {
		return existing, nil
	}

	itemID := contentHex
	itemDir := filepath.Join(active.Path, "items", itemID)
	if err := os.MkdirAll(itemDir, 0755); err != nil {
		return nil, err
	}

	srcFile, err := os.Open(srcPath)
	if err != nil {
		_ = os.RemoveAll(itemDir)
		return nil, err
	}
	defer srcFile.Close()

	originalFilename := filepath.Base(srcPath)
	destPath := filepath.Join(itemDir, originalFilename)
	destFile, err := os.Create(destPath)
	if err != nil {
		_ = os.RemoveAll(itemDir)
		return nil, err
	}

	size, err := io.Copy(destFile, srcFile)
	_ = destFile.Close()
	if err != nil {
		_ = os.RemoveAll(itemDir)
		return nil, err
	}

	now := time.Now().Unix()
	createdAt := stat.ModTime().Unix()
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(originalFilename), "."))
	nameWithoutExt := strings.TrimSuffix(originalFilename, filepath.Ext(originalFilename))
	mimeType := DetectMimeType(destPath, ext)

	width, height, hasThumbnail := m.processImageThumbnail(destPath, itemDir, ext)

	item := Item{
		ID:           itemID,
		Hex:          contentHex,
		Name:         nameWithoutExt,
		Extension:    ext,
		Filename:     originalFilename,
		Size:         size,
		MimeType:     mimeType,
		Width:        width,
		Height:       height,
		HasThumbnail: hasThumbnail,
		Tags:         []string{},
		CreatedAt:    createdAt,
		ImportedAt:   now,
	}
	m.populateItemPaths(&item, active.Path, port)

	metaBytes, _ := json.MarshalIndent(ItemMetadata{
		ID:           item.ID,
		Hex:          item.Hex,
		Name:         item.Name,
		Extension:    item.Extension,
		Filename:     item.Filename,
		Size:         item.Size,
		MimeType:     item.MimeType,
		Width:        item.Width,
		Height:       item.Height,
		HasThumbnail: item.HasThumbnail,
		Tags:         item.Tags,
		CreatedAt:    item.CreatedAt,
		ImportedAt:   item.ImportedAt,
	}, "", "  ")
	_ = os.WriteFile(filepath.Join(itemDir, "metadata.json"), metaBytes, 0644)

	hasThumbInt := 0
	if hasThumbnail {
		hasThumbInt = 1
	}
	_, err = db.Exec(
		`INSERT INTO items (id, hex, name, extension, filename, size, mime_type, width, height, has_thumbnail, tags, created_at, imported_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		item.ID, item.Hex, item.Name, item.Extension, item.Filename, item.Size, item.MimeType,
		item.Width, item.Height, hasThumbInt, "", item.CreatedAt, item.ImportedAt,
	)
	if err != nil {
		_ = os.RemoveAll(itemDir)
		return nil, fmt.Errorf("failed to insert item into libSQL: %w", err)
	}

	return &item, nil
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
	if err == nil && existing != nil {
		return existing, nil
	}

	itemID := contentHex
	itemDir := filepath.Join(active.Path, "items", itemID)
	if err := os.MkdirAll(itemDir, 0755); err != nil {
		return nil, err
	}

	cleanFilename := strings.TrimSpace(filename)
	if cleanFilename == "" {
		cleanFilename = fmt.Sprintf("pasted_%d.png", time.Now().Unix())
	}

	destPath := filepath.Join(itemDir, cleanFilename)
	if err := os.WriteFile(destPath, data, 0644); err != nil {
		_ = os.RemoveAll(itemDir)
		return nil, err
	}

	now := time.Now().Unix()
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(cleanFilename), "."))
	nameWithoutExt := strings.TrimSuffix(cleanFilename, filepath.Ext(cleanFilename))
	mimeType := DetectMimeType(destPath, ext)

	width, height, hasThumbnail := m.processImageThumbnail(destPath, itemDir, ext)

	item := Item{
		ID:           itemID,
		Hex:          contentHex,
		Name:         nameWithoutExt,
		Extension:    ext,
		Filename:     cleanFilename,
		Size:         int64(len(data)),
		MimeType:     mimeType,
		Width:        width,
		Height:       height,
		HasThumbnail: hasThumbnail,
		Tags:         []string{},
		CreatedAt:    now,
		ImportedAt:   now,
	}
	m.populateItemPaths(&item, active.Path, port)

	metaBytes, _ := json.MarshalIndent(ItemMetadata{
		ID:           item.ID,
		Hex:          item.Hex,
		Name:         item.Name,
		Extension:    item.Extension,
		Filename:     item.Filename,
		Size:         item.Size,
		MimeType:     item.MimeType,
		Width:        item.Width,
		Height:       item.Height,
		HasThumbnail: item.HasThumbnail,
		Tags:         item.Tags,
		CreatedAt:    item.CreatedAt,
		ImportedAt:   item.ImportedAt,
	}, "", "  ")
	_ = os.WriteFile(filepath.Join(itemDir, "metadata.json"), metaBytes, 0644)

	hasThumbInt := 0
	if hasThumbnail {
		hasThumbInt = 1
	}
	_, err = db.Exec(
		`INSERT INTO items (id, hex, name, extension, filename, size, mime_type, width, height, has_thumbnail, tags, created_at, imported_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		item.ID, item.Hex, item.Name, item.Extension, item.Filename, item.Size, item.MimeType,
		item.Width, item.Height, hasThumbInt, "", item.CreatedAt, item.ImportedAt,
	)
	if err != nil {
		_ = os.RemoveAll(itemDir)
		return nil, err
	}

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

func (m *LibraryManager) processImageThumbnail(imagePath string, itemDir string, ext string) (int, int, bool) {
	if !IsImageExtension(ext) {
		return 0, 0, false
	}

	file, err := os.Open(imagePath)
	if err != nil {
		return 0, 0, false
	}
	defer file.Close()

	img, _, err := image.Decode(file)
	if err != nil {
		return 0, 0, false
	}

	bounds := img.Bounds()
	origW := bounds.Dx()
	origH := bounds.Dy()
	if origW == 0 || origH == 0 {
		return 0, 0, false
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

	thumbFile, err := os.Create(filepath.Join(itemDir, "thumbnail.jpg"))
	if err != nil {
		return origW, origH, false
	}
	defer thumbFile.Close()

	if err := jpeg.Encode(thumbFile, thumb, &jpeg.Options{Quality: 82}); err != nil {
		return origW, origH, false
	}

	return origW, origH, true
}

// DeleteItem removes the item folder from disk and its row from libSQL.
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

	_, err := db.Exec("DELETE FROM items WHERE id = ? OR hex = ?", id, id)
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

func DetectMimeType(filePath string, ext string) string {
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
	case "mp4":
		return "video/mp4"
	case "mov":
		return "video/quicktime"
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
		f, err := os.Open(filePath)
		if err == nil {
			defer f.Close()
			buf := make([]byte, 512)
			n, _ := f.Read(buf)
			if n > 0 {
				return http.DetectContentType(buf[:n])
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
