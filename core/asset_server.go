package core

import (
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
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
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Printf("[AssetServer] failed to listen: %v", err)
		return
	}
	s.listener = listener
	s.port = listener.Addr().(*net.TCPAddr).Port

	mux := http.NewServeMux()
	mux.HandleFunc("/asset/item/", s.handleAssetRequest)
	mux.HandleFunc("/asset/download/", s.handleDownloadRequest)
	mux.HandleFunc("/asset/icon/", s.handleSystemIconRequest)
	go func() {
		if serveErr := http.Serve(listener, mux); serveErr != nil && !errors.Is(serveErr, net.ErrClosed) {
			log.Printf("[AssetServer] serve error: %v", serveErr)
		}
	}()
	log.Printf("[AssetServer] running on http://127.0.0.1:%d", s.port)
}

func (s *AssetServer) getPort() int {
	return s.port
}

func (s *AssetServer) handleAssetRequest(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/asset/item/"), "/")
	if len(parts) < 2 {
		http.NotFound(w, r)
		return
	}
	itemID := parts[0]
	assetKind := parts[1]

	active := s.manager.GetActiveLibrary()
	if active == nil {
		http.Error(w, "no active library", http.StatusServiceUnavailable)
		return
	}

	itemDir := filepath.Join(active.Path, "items", itemID)
	if assetKind == "thumbnail" {
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
	if item.MimeType != "" {
		w.Header().Set("Content-Type", item.MimeType)
	}
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeFile(w, r, originalPath)
}

func (s *AssetServer) handleDownloadRequest(w http.ResponseWriter, r *http.Request) {
	itemID := strings.TrimPrefix(r.URL.Path, "/asset/download/")
	active := s.manager.GetActiveLibrary()
	if active == nil {
		http.Error(w, "no active library", http.StatusServiceUnavailable)
		return
	}

	item, err := s.manager.GetItem(itemID)
	if err != nil || item == nil {
		http.NotFound(w, r)
		return
	}

	originalPath := filepath.Join(active.Path, "items", item.ID, item.Filename)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, item.Filename))
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeFile(w, r, originalPath)
}

func (s *AssetServer) handleSystemIconRequest(w http.ResponseWriter, r *http.Request) {
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
