package core

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// AssetServer serves thumbnails, original files, and download streams over local HTTP.
type AssetServer struct {
	port     int
	listener net.Listener
	manager  *LibraryManager
}

func newAssetServer(manager *LibraryManager) *AssetServer {
	s := &AssetServer{manager: manager}
	s.start()
	return s
}

func (s *AssetServer) start() {
	targetPort := 41595
	if envPort := os.Getenv("BOWERBIRD_API_PORT"); envPort != "" {
		if p, parseErr := strconv.Atoi(envPort); parseErr == nil && p > 0 {
			targetPort = p
		}
	}

	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", targetPort))
	if err != nil {
		// Target port busy or unavailable, fall back to ephemeral port
		listener, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			log.Printf("[AssetServer] failed to listen: %v", err)
			return
		}
	}
	s.listener = listener
	s.port = listener.Addr().(*net.TCPAddr).Port

	mux := http.NewServeMux()
	mux.HandleFunc("/asset/item/", s.handleAssetRequest)
	mux.HandleFunc("/asset/download/", s.handleDownloadRequest)
	mux.HandleFunc("/asset/icon/", s.handleSystemIconRequest)

	// Register REST Open API routes for browser extensions and external tools
	s.registerAPIRoutes(mux)

	handler := s.corsMiddleware(mux)

	go func() {
		if serveErr := http.Serve(listener, handler); serveErr != nil && !errors.Is(serveErr, net.ErrClosed) {
			log.Printf("[AssetServer] serve error: %v", serveErr)
		}
	}()
	log.Printf("[AssetServer] running on http://127.0.0.1:%d", s.port)
}

func (s *AssetServer) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With, Range, Origin")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *AssetServer) Stop() error {
	if s.listener != nil {
		return s.listener.Close()
	}
	return nil
}

func (s *AssetServer) getPort() int {
	return s.port
}
func (s *AssetServer) handleAssetRequest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Range, Content-Type, Accept")
	w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Type")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/asset/item/"), "/")
	if len(parts) < 2 {
		http.NotFound(w, r)
		return
	}
	itemID := parts[0]
	assetKind := parts[1]

	activePath := s.manager.GetActiveLibraryPath()
	if activePath == "" {
		http.Error(w, "no active library", http.StatusServiceUnavailable)
		return
	}

	itemDir := filepath.Join(activePath, "items", itemID)
	if assetKind == "thumbnail" {
		if r.Method == http.MethodPost {
			var req struct {
				Base64Data string `json:"base64Data"`
				Width      int    `json:"width"`
				Height     int    `json:"height"`
			}
			body, err := io.ReadAll(io.LimitReader(r.Body, 16*1024*1024))
			if err != nil {
				http.Error(w, "failed to read request body", http.StatusBadRequest)
				return
			}
			if err := json.Unmarshal(body, &req); err != nil || strings.TrimSpace(req.Base64Data) == "" {
				http.Error(w, "invalid JSON payload", http.StatusBadRequest)
				return
			}
			updated, err := s.manager.SaveItemThumbnail(itemID, req.Base64Data, req.Width, req.Height)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(updated)
			return
		}
		thumbPath := filepath.Join(itemDir, "thumbnail.jpg")
		if _, err := os.Stat(thumbPath); err != nil {
			item, err := s.manager.GetItem(itemID)
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

	item, err := s.manager.GetItem(itemID)
	if err != nil || item == nil {
		http.NotFound(w, r)
		return
	}
	originalPath := filepath.Join(itemDir, item.Filename)
	mimeType := item.MimeType
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = DetectMimeType(originalPath, item.Extension)
	}
	if mimeType != "" {
		w.Header().Set("Content-Type", mimeType)
	}
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeFile(w, r, originalPath)
}

func (s *AssetServer) handleDownloadRequest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	itemID := strings.TrimPrefix(r.URL.Path, "/asset/download/")
	activePath := s.manager.GetActiveLibraryPath()
	if activePath == "" {
		http.Error(w, "no active library", http.StatusServiceUnavailable)
		return
	}

	item, err := s.manager.GetItem(itemID)
	if err != nil || item == nil {
		http.NotFound(w, r)
		return
	}

	originalPath := filepath.Join(activePath, "items", item.ID, item.Filename)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, item.Filename))
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeFile(w, r, originalPath)
}

func (s *AssetServer) handleSystemIconRequest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	ext := strings.TrimPrefix(r.URL.Path, "/asset/icon/")
	ext = strings.TrimPrefix(ext, ".")
	if ext == "" {
		http.NotFound(w, r)
		return
	}

	filePath := r.URL.Query().Get("path")
	pngBytes := GetSystemFileIconPNG(ext, filePath)
	if len(pngBytes) == 0 {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	_, _ = w.Write(pngBytes)
}
