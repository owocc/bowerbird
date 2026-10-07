package main

import (
	"crypto/rand"
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
	"net"
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

// LibraryInfo represents metadata about an opened library
type LibraryInfo struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Path      string `json:"path"`
	CreatedAt int64  `json:"createdAt"`
	ItemCount int64  `json:"itemCount"`
}

// Item represents a single managed asset in the library
type Item struct {
	ID            string   `json:"id"`
	Hex           string   `json:"hex"`           // uppercase content hash (SHA-256)
	Name          string   `json:"name"`
	Extension     string   `json:"extension"`
	Filename      string   `json:"filename"`
	Size          int64    `json:"size"`
	MimeType      string   `json:"mimeType"`
	Width         int      `json:"width"`
	Height        int      `json:"height"`
	HasThumbnail  bool     `json:"hasThumbnail"`
	Tags          []string `json:"tags"`
	CreatedAt     int64    `json:"createdAt"`
	ImportedAt    int64    `json:"importedAt"`
	ItemPath      string   `json:"itemPath"`      // local disk path of item directory
	FilePath      string   `json:"filePath"`      // absolute local path to physical file
	ShellPath     string   `json:"shellPath"`     // shell-escaped path with backslash spaces
	FileURL       string   `json:"fileUrl"`       // file:// URI pointing to physical file
	OriginalURL   string   `json:"originalUrl"`   // HTTP stream URL
	ThumbnailURL  string   `json:"thumbnailUrl"`  // HTTP thumbnail URL
	DownloadURL   string   `json:"downloadUrl"`   // HTTP download URL for OS drag-out
}
// ItemMetadata is serialized inside <item_id>/metadata.json
type ItemMetadata struct {
	ID           string   `json:"id"`
	Hex          string   `json:"hex"`
	Name         string   `json:"name"`
	Extension    string   `json:"extension"`
	Filename     string   `json:"filename"`
	Size         int64    `json:"size"`
	MimeType     string   `json:"mimeType"`
	Width        int      `json:"width"`
	Height       int      `json:"height"`
	HasThumbnail bool     `json:"hasThumbnail"`
	Tags         []string `json:"tags"`
	CreatedAt    int64    `json:"createdAt"`
	ImportedAt   int64    `json:"importedAt"`
}

// AppConfig persists user settings
type AppConfig struct {
	LastLibraryPath string `json:"lastLibraryPath"`
}

// LibraryService handles library management, imports, index db and asset streaming
type LibraryService struct {
	app           *application.App
	window        application.Window
	mu            sync.RWMutex
	activeLib     *LibraryInfo
	db            *sql.DB
	serverPort    int
	serverListener net.Listener
}

func NewLibraryService() *LibraryService {
	s := &LibraryService{}
	s.startAssetServer()
	return s
}

func (s *LibraryService) SetApp(app *application.App) {
	s.app = app
	// Attempt to restore last opened library on startup
	cfg, err := s.loadConfig()
	if err == nil && cfg.LastLibraryPath != "" {
		if _, statErr := os.Stat(cfg.LastLibraryPath); statErr == nil {
			_, _ = s.OpenLibrary(cfg.LastLibraryPath)
		}
	}
}

func (s *LibraryService) setWindow(w application.Window) {
	s.window = w
}

// startAssetServer spins up an internal HTTP server for thumbnails, originals and Drag-to-Finder downloads
func (s *LibraryService) startAssetServer() {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Printf("[AssetServer] failed to listen on dynamic port: %v", err)
		return
	}
	s.serverListener = listener
	s.serverPort = listener.Addr().(*net.TCPAddr).Port

	mux := http.NewServeMux()
	mux.HandleFunc("/asset/item/", s.handleAssetRequest)
	mux.HandleFunc("/asset/download/", s.handleDownloadRequest)

	go func() {
		if serveErr := http.Serve(listener, mux); serveErr != nil && !errors.Is(serveErr, net.ErrClosed) {
			log.Printf("[AssetServer] HTTP serve error: %v", serveErr)
		}
	}()
	log.Printf("[AssetServer] running on http://127.0.0.1:%d", s.serverPort)
}

func (s *LibraryService) handleAssetRequest(w http.ResponseWriter, r *http.Request) {
	// Format: /asset/item/{id}/thumbnail or /asset/item/{id}/original
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/asset/item/"), "/")
	if len(parts) < 2 {
		http.NotFound(w, r)
		return
	}
	itemID := parts[0]
	assetKind := parts[1]

	s.mu.RLock()
	active := s.activeLib
	s.mu.RUnlock()

	if active == nil {
		http.Error(w, "no active library", http.StatusServiceUnavailable)
		return
	}

	itemDir := filepath.Join(active.Path, "items", itemID)
	if assetKind == "thumbnail" {
		thumbPath := filepath.Join(itemDir, "thumbnail.jpg")
		if _, err := os.Stat(thumbPath); err != nil {
			// Fallback to original if thumbnail missing
			item, err := s.GetItem(itemID)
			if err != nil || item == nil {
				http.NotFound(w, r)
				return
			}
			originalPath := filepath.Join(itemDir, item.Filename)
			w.Header().Set("Cache-Control", "public, max-age=86400")
			http.ServeFile(w, r, originalPath)
			return
		}
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		http.ServeFile(w, r, thumbPath)
		return
	}

	// Original asset
	item, err := s.GetItem(itemID)
	if err != nil || item == nil {
		http.NotFound(w, r)
		return
	}
	originalPath := filepath.Join(itemDir, item.Filename)
	if item.MimeType != "" {
		w.Header().Set("Content-Type", item.MimeType)
	}
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeFile(w, r, originalPath)
}

func (s *LibraryService) handleDownloadRequest(w http.ResponseWriter, r *http.Request) {
	// Format: /asset/download/{id}
	itemID := strings.TrimPrefix(r.URL.Path, "/asset/download/")
	s.mu.RLock()
	active := s.activeLib
	s.mu.RUnlock()

	if active == nil {
		http.Error(w, "no active library", http.StatusServiceUnavailable)
		return
	}

	item, err := s.GetItem(itemID)
	if err != nil || item == nil {
		http.NotFound(w, r)
		return
	}

	originalPath := filepath.Join(active.Path, "items", itemID, item.Filename)
	// Standard Download header for OS drag-to-Finder
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, item.Filename))
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeFile(w, r, originalPath)
}

// GetAssetServerPort returns the dynamic port for asset serving
func (s *LibraryService) GetAssetServerPort() int {
	return s.serverPort
}

// SelectDirectory opens native system dialog to pick a target directory
func (s *LibraryService) SelectDirectory() (string, error) {
	if s.app == nil {
		return "", errors.New("application not initialized")
	}
	dialog := s.app.Dialog.OpenFile().
		CanChooseDirectories(true).
		CanChooseFiles(false).
		CanCreateDirectories(true).
		SetTitle("选择 Library 存储目录")
	return dialog.PromptForSingleSelection()
}

// SelectLibraryDialog opens native system dialog to pick an existing .library folder
func (s *LibraryService) SelectLibraryDialog() (string, error) {
	if s.app == nil {
		return "", errors.New("application not initialized")
	}
	dialog := s.app.Dialog.OpenFile().
		CanChooseDirectories(true).
		CanChooseFiles(false).
		CanCreateDirectories(false).
		SetTitle("选择现有的 .library 文件夹")
	return dialog.PromptForSingleSelection()
}

// CreateLibrary creates a new library directory ending in .library and initializes libSQL database
func (s *LibraryService) CreateLibrary(parentDir string, libName string) (*LibraryInfo, error) {
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

	libID := generateID()
	now := time.Now().Unix()

	// library.json
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

	// Initialize libSQL database
	dbPath := filepath.Join(fullLibPath, "index.db")
	db, err := sql.Open("libsql", "file:"+dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize libSQL: %w", err)
	}

	if err := s.initSchema(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	s.mu.Lock()
	if s.db != nil {
		_ = s.db.Close()
	}
	s.db = db
	s.activeLib = &LibraryInfo{
		ID:        libID,
		Name:      strings.TrimSuffix(cleanName, ".library"),
		Path:      fullLibPath,
		CreatedAt: now,
		ItemCount: 0,
	}
	s.mu.Unlock()

	_ = s.saveConfig(&AppConfig{LastLibraryPath: fullLibPath})
	return s.activeLib, nil
}

// OpenLibrary opens an existing library at libraryPath
func (s *LibraryService) OpenLibrary(libraryPath string) (*LibraryInfo, error) {
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

	// Ensure items directory exists
	_ = os.MkdirAll(filepath.Join(libraryPath, "items"), 0755)

	dbPath := filepath.Join(libraryPath, "index.db")
	db, err := sql.Open("libsql", "file:"+dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open libSQL database: %w", err)
	}

	if err := s.initSchema(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("schema migration failed: %w", err)
	}

	var count int64
	_ = db.QueryRow("SELECT COUNT(*) FROM items").Scan(&count)

	s.mu.Lock()
	if s.db != nil {
		_ = s.db.Close()
	}
	s.db = db
	s.activeLib = &LibraryInfo{
		ID:        meta.ID,
		Name:      meta.Name,
		Path:      libraryPath,
		CreatedAt: meta.CreatedAt,
		ItemCount: count,
	}
	s.mu.Unlock()

	_ = s.saveConfig(&AppConfig{LastLibraryPath: libraryPath})
	return s.activeLib, nil
}

func (s *LibraryService) initSchema(db *sql.DB) error {
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

// GetActiveLibrary returns the currently active library or nil if none open
func (s *LibraryService) GetActiveLibrary() (*LibraryInfo, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.activeLib == nil {
		return nil, nil
	}

	// Refresh item count
	if s.db != nil {
		var count int64
		if err := s.db.QueryRow("SELECT COUNT(*) FROM items").Scan(&count); err == nil {
			s.activeLib.ItemCount = count
		}
	}
	return s.activeLib, nil
}

// CloseLibrary unloads the currently active library
func (s *LibraryService) CloseLibrary() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db != nil {
		_ = s.db.Close()
		s.db = nil
	}
	s.activeLib = nil
	_ = s.saveConfig(&AppConfig{LastLibraryPath: ""})
	return nil
}

func escapeShellPath(p string) string {
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

func pathToURL(filePath string) string {
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

func (s *LibraryService) populateItemPaths(item *Item, activePath string, port int) {
	item.ItemPath = filepath.Join(activePath, "items", item.ID)
	item.FilePath = filepath.Join(item.ItemPath, item.Filename)
	item.ShellPath = escapeShellPath(item.FilePath)
	item.FileURL = pathToURL(item.FilePath)
	item.OriginalURL = fmt.Sprintf("http://127.0.0.1:%d/asset/item/%s/original", port, item.ID)
	item.ThumbnailURL = fmt.Sprintf("http://127.0.0.1:%d/asset/item/%s/thumbnail", port, item.ID)
	item.DownloadURL = fmt.Sprintf("http://127.0.0.1:%d/asset/download/%s", port, item.ID)
}

// GetItems queries items from libSQL index database
func (s *LibraryService) GetItems(query string, sortOrder string) ([]Item, error) {
	s.mu.RLock()
	db := s.db
	active := s.activeLib
	port := s.serverPort
	s.mu.RUnlock()

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
		s.populateItemPaths(&item, active.Path, port)

		items = append(items, item)
	}
	if items == nil {
		items = []Item{}
	}
	return items, nil
}

// GetItem retrieves a single item by ID
func (s *LibraryService) GetItem(id string) (*Item, error) {
	s.mu.RLock()
	db := s.db
	active := s.activeLib
	port := s.serverPort
	s.mu.RUnlock()

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
	s.populateItemPaths(&item, active.Path, port)
	return &item, nil
}

// ImportFiles imports a list of file or folder paths into the library.
// All files are physically copied into their own dedicated subdirectories, isolated from the original sources.
func (s *LibraryService) ImportFiles(sourcePaths []string) ([]Item, error) {
	s.mu.RLock()
	active := s.activeLib
	db := s.db
	s.mu.RUnlock()

	if active == nil || db == nil {
		return nil, errors.New("no active library")
	}

	var imported []Item
	for _, srcPath := range sourcePaths {
		info, err := os.Stat(srcPath)
		if err != nil {
			continue
		}

		if info.IsDir() {
			// Walk directory recursively and copy each file into its own item folder
			err := filepath.WalkDir(srcPath, func(path string, d os.DirEntry, walkErr error) error {
				if walkErr != nil || d.IsDir() {
					return nil
				}
				// Skip macOS hidden metadata files
				if strings.HasPrefix(d.Name(), ".") {
					return nil
				}
				item, itemErr := s.importSingleFile(path)
				if itemErr == nil && item != nil {
					imported = append(imported, *item)
				}
				return nil
			})
			if err != nil {
				log.Printf("Error walking directory %s: %v", srcPath, err)
			}
		} else {
			item, itemErr := s.importSingleFile(srcPath)
			if itemErr == nil && item != nil {
				imported = append(imported, *item)
			}
		}
	}

	return imported, nil
}
func computeFileSHA256(filePath string) (string, error) {
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

func computeBytesSHA256(data []byte) string {
	sum := sha256.Sum256(data)
	return strings.ToUpper(hex.EncodeToString(sum[:]))
}


func (s *LibraryService) importSingleFile(srcPath string) (*Item, error) {
	s.mu.RLock()
	active := s.activeLib
	db := s.db
	port := s.serverPort
	s.mu.RUnlock()

	if active == nil || db == nil {
		return nil, errors.New("no active library")
	}

	stat, err := os.Stat(srcPath)
	if err != nil {
		return nil, err
	}

	contentHex, err := computeFileSHA256(srcPath)
	if err != nil {
		return nil, fmt.Errorf("failed to compute file hash: %w", err)
	}

	// Content-addressed deduplication
	existing, err := s.GetItem(contentHex)
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

	// Copy with full isolation
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
	mimeType := detectMimeType(destPath, ext)

	// Check if image and generate compressed thumbnail
	width, height, hasThumbnail := s.processImageThumbnail(destPath, itemDir, ext)

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
	s.populateItemPaths(&item, active.Path, port)

	// Save metadata.json inside item directory
	metaBytes, _ := json.MarshalIndent(ItemMetadata{
		ID:           item.ID,
		Hex:          item.Hex,
		Name:         item.Name,
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

	// Insert into libSQL index database
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

// ImportFromBase64 imports image or binary data from browser drag-drop or clipboard paste
func (s *LibraryService) ImportFromBase64(filename string, base64Data string) (*Item, error) {
	s.mu.RLock()
	active := s.activeLib
	db := s.db
	port := s.serverPort
	s.mu.RUnlock()

	if active == nil || db == nil {
		return nil, errors.New("no active library")
	}

	// Strip data URL scheme if present (e.g., data:image/png;base64,...)
	idx := strings.Index(base64Data, ",")
	pureData := base64Data
	if idx != -1 {
		pureData = base64Data[idx+1:]
	}

	data, err := base64.StdEncoding.DecodeString(pureData)
	if err != nil {
		return nil, fmt.Errorf("invalid base64 payload: %w", err)
	}

	contentHex := computeBytesSHA256(data)

	// Content-addressed deduplication
	existing, err := s.GetItem(contentHex)
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
	mimeType := detectMimeType(destPath, ext)

	width, height, hasThumbnail := s.processImageThumbnail(destPath, itemDir, ext)

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
	s.populateItemPaths(&item, active.Path, port)

	metaBytes, _ := json.MarshalIndent(ItemMetadata{
		ID:           item.ID,
		Hex:          item.Hex,
		Name:         item.Name,
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

// processImageThumbnail decodes the image, extracts width/height, and generates a compressed thumbnail.jpg
func (s *LibraryService) processImageThumbnail(imagePath string, itemDir string, ext string) (int, int, bool) {
	isImg := isImageExtension(ext)
	if !isImg {
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

	// Calculate thumbnail dimensions (max 480px on long edge)
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

// DeleteItem removes an item from disk and deletes its row from libSQL
func (s *LibraryService) DeleteItem(id string) error {
	s.mu.RLock()
	active := s.activeLib
	db := s.db
	s.mu.RUnlock()

	if active == nil || db == nil {
		return errors.New("no active library")
	}

	itemDir := filepath.Join(active.Path, "items", id)
	_ = os.RemoveAll(itemDir)

	_, err := db.Exec("DELETE FROM items WHERE id = ?", id)
	return err
}

// RevealInFinder opens macOS Finder or Windows Explorer highlighting the item file
func (s *LibraryService) RevealInFinder(id string) error {
	item, err := s.GetItem(id)
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

func (s *LibraryService) loadConfig() (*AppConfig, error) {
	cfgDir, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	cfgFile := filepath.Join(cfgDir, "bowerbird", "config.json")
	data, err := os.ReadFile(cfgFile)
	if err != nil {
		return &AppConfig{}, nil
	}
	var cfg AppConfig
	_ = json.Unmarshal(data, &cfg)
	return &cfg, nil
}

func (s *LibraryService) saveConfig(cfg *AppConfig) error {
	cfgDir, err := os.UserConfigDir()
	if err != nil {
		return err
	}
	appDir := filepath.Join(cfgDir, "bowerbird")
	_ = os.MkdirAll(appDir, 0755)
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(appDir, "config.json"), data, 0644)
}

func generateID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%d_%s", time.Now().UnixNano(), hex.EncodeToString(b))
}

func isImageExtension(ext string) bool {
	switch strings.ToLower(ext) {
	case "png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "ico":
		return true
	default:
		return false
	}
}

func detectMimeType(filePath string, ext string) string {
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
