package core

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/grandcat/zeroconf"
)

// MobileServerVersion is the mobile API contract version.
const MobileServerVersion = "1.0.0"

// MobileServer handles LAN HTTP endpoints and mDNS discovery for mobile clients.
type MobileServer struct {
	mu          sync.RWMutex
	manager     *LibraryManager
	listener    net.Listener
	httpServer  *http.Server
	mdnsServer  *zeroconf.Server
	port        int
	running     bool
	pairingCode string
	codeMu      sync.RWMutex
}

// MobileItemSummary represents an item in the lightweight mobile timeline view.
type MobileItemSummary struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Filename     string   `json:"filename"`
	Extension    string   `json:"extension"`
	Width        int      `json:"width"`
	Height       int      `json:"height"`
	Size         int64    `json:"size"`
	MimeType     string   `json:"mimeType"`
	ThumbnailURL string   `json:"thumbnailUrl"`
	OriginalURL  string   `json:"originalUrl"`
	CreatedAt    int64    `json:"createdAt"`
	ImportedAt   int64    `json:"importedAt"`
	Date         int64    `json:"date"`
	Orientation  string   `json:"orientation"`
	Tags         []string `json:"tags"`
	Folders      []string `json:"folders"`
}

// MobileItemsResponse wraps paginated item results.
type MobileItemsResponse struct {
	Total  int                 `json:"total"`
	Limit  int                 `json:"limit"`
	Offset int                 `json:"offset"`
	Items  []MobileItemSummary `json:"items"`
}

// MobileStatusResponse represents the unauthenticated status response.
type MobileStatusResponse struct {
	Name            string `json:"name"`
	Version         string `json:"version"`
	ItemCount       int64  `json:"itemCount"`
	PairingRequired bool   `json:"pairingRequired"`
}

// MobileServerStatus contains desktop-facing diagnostics and pairing details.
type MobileServerStatus struct {
	Enabled         bool     `json:"enabled"`
	Running         bool     `json:"running"`
	Port            int      `json:"port"`
	PairingCode     string   `json:"pairingCode"`
	Addresses       []string `json:"addresses"`
	PairedDevices   int      `json:"pairedDevices"`
	ItemCount       int64    `json:"itemCount"`
	PairingRequired bool     `json:"pairingRequired"`
}

// newMobileServer initializes the mobile server instance.
func newMobileServer(manager *LibraryManager) *MobileServer {
	s := &MobileServer{
		manager: manager,
		port:    17878,
	}
	s.regeneratePairingCodeInternal()
	return s
}

// Start launches the mobile HTTP listener and announces mDNS if enabled.
func (s *MobileServer) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return nil
	}

	settings := MobileSettings{Enabled: true, Port: 17878, PairingRequired: true}
	if s.manager != nil && s.manager.userData != nil {
		settings = s.manager.userData.GetMobileSettings()
	}

	if !settings.Enabled {
		log.Printf("[MobileServer] mobile server is disabled in settings")
		return nil
	}

	targetPort := settings.Port
	if targetPort <= 0 {
		targetPort = 17878
	}

	listener, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", targetPort))
	if err != nil {
		log.Printf("[MobileServer] port %d busy, falling back to random port: %v", targetPort, err)
		listener, err = net.Listen("tcp", "0.0.0.0:0")
		if err != nil {
			log.Printf("[MobileServer] failed to listen on any port: %v", err)
			return err
		}
	}

	s.listener = listener
	s.port = listener.Addr().(*net.TCPAddr).Port

	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/status", s.handleStatus)
	mux.HandleFunc("/api/v1/pair", s.handlePair)
	mux.HandleFunc("/api/v1/tags", s.authMiddleware(s.handleTagsList))
	mux.HandleFunc("/api/v1/folders", s.authMiddleware(s.handleFoldersList))
	mux.HandleFunc("/api/v1/colors", s.authMiddleware(s.handleColorsList))
	mux.HandleFunc("/api/v1/items", s.authMiddleware(s.handleItemsList))
	mux.HandleFunc("/api/v1/items/", s.authMiddleware(s.handleItemDetail))
	mux.HandleFunc("/api/v1/thumbs/", s.authMiddleware(s.handleThumbnail))
	mux.HandleFunc("/api/v1/originals/", s.authMiddleware(s.handleOriginal))
	s.httpServer = &http.Server{
		Handler:      s.corsMiddleware(mux),
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 60 * time.Second,
	}

	s.running = true

	go func() {
		log.Printf("[MobileServer] HTTP server listening on http://0.0.0.0:%d", s.port)
		if serveErr := s.httpServer.Serve(listener); serveErr != nil && !errors.Is(serveErr, net.ErrClosed) && !errors.Is(serveErr, http.ErrServerClosed) {
			log.Printf("[MobileServer] HTTP serve error: %v", serveErr)
		}
	}()

	log.Printf("[MobileServer] mobile pairing code: %s", s.GetPairingCode())
	s.startMDNS(settings.PairingRequired)
	return nil
}

// Stop shuts down the mobile server and deregisters mDNS.
func (s *MobileServer) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return nil
	}

	log.Printf("[MobileServer] stopping mobile server...")
	s.stopMDNSInternal()

	var err error
	if s.httpServer != nil {
		err = s.httpServer.Close()
		s.httpServer = nil
	}
	if s.listener != nil {
		_ = s.listener.Close()
		s.listener = nil
	}

	s.running = false
	log.Printf("[MobileServer] mobile server stopped")
	return err
}

// IsRunning reports whether the mobile server is actively serving.
func (s *MobileServer) IsRunning() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.running
}

// GetPort returns the currently bound port.
func (s *MobileServer) GetPort() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.port
}

// GetPairingCode returns the active 6-digit pairing code.
func (s *MobileServer) GetPairingCode() string {
	s.codeMu.RLock()
	defer s.codeMu.RUnlock()
	return s.pairingCode
}

// RegeneratePairingCode generates a new random 6-digit pairing code.
func (s *MobileServer) RegeneratePairingCode() string {
	s.codeMu.Lock()
	defer s.codeMu.Unlock()
	s.regeneratePairingCodeInternal()
	log.Printf("[MobileServer] regenerated pairing code: %s", s.pairingCode)
	return s.pairingCode
}

func (s *MobileServer) regeneratePairingCodeInternal() {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		s.pairingCode = "888888"
		return
	}
	s.pairingCode = fmt.Sprintf("%06d", n.Int64())
}

// startMDNS announces _bowerbird._tcp via Bonjour/mDNS.
func (s *MobileServer) startMDNS(pairingRequired bool) {
	hostname, _ := os.Hostname()
	instanceName := "Bowerbird"
	if hostname != "" {
		instanceName = fmt.Sprintf("Bowerbird (%s)", hostname)
	}

	txtRecords := []string{
		"version=" + MobileServerVersion,
		fmt.Sprintf("pairingRequired=%t", pairingRequired),
	}

	mdns, err := zeroconf.Register(
		instanceName,
		"_bowerbird._tcp",
		"local.",
		s.port,
		txtRecords,
		nil,
	)
	if err != nil {
		log.Printf("[MobileServer] failed to register mDNS service: %v", err)
		return
	}
	s.mdnsServer = mdns
	log.Printf("[MobileServer] mDNS announced: %s._bowerbird._tcp on port %d", instanceName, s.port)
}

func (s *MobileServer) stopMDNSInternal() {
	if s.mdnsServer != nil {
		s.mdnsServer.Shutdown()
		s.mdnsServer = nil
	}
}

// corsMiddleware injects CORS headers for cross-origin mobile and web requests.
func (s *MobileServer) corsMiddleware(next http.Handler) http.Handler {
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

// authMiddleware enforces Bearer token authentication if pairing is required.
func (s *MobileServer) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.manager == nil || s.manager.userData == nil {
			next(w, r)
			return
		}

		settings := s.manager.userData.GetMobileSettings()
		if !settings.PairingRequired {
			next(w, r)
			return
		}

		token := extractToken(r)
		if token == "" || !s.manager.userData.HasMobileToken(token) {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized: valid pairing token required")
			return
		}

		// Touch last used timestamp asynchronously
		go s.manager.userData.TouchMobileToken(token)
		next(w, r)
	}
}

func extractToken(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return strings.TrimSpace(authHeader[7:])
	}
	if queryToken := r.URL.Query().Get("token"); queryToken != "" {
		return strings.TrimSpace(queryToken)
	}
	return ""
}

// handleStatus returns server status, version, and active library item count.
func (s *MobileServer) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	var itemCount int64
	name := "Bowerbird"
	pairingRequired := true

	if s.manager != nil {
		if active := s.manager.GetActiveLibrary(); active != nil {
			itemCount = active.ItemCount
			if active.Name != "" {
				name = active.Name
			}
		}
		if s.manager.userData != nil {
			pairingRequired = s.manager.userData.GetMobileSettings().PairingRequired
		}
	}

	resp := MobileStatusResponse{
		Name:            name,
		Version:         MobileServerVersion,
		ItemCount:       itemCount,
		PairingRequired: pairingRequired,
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

// handlePair exchanges a 6-digit pairing code for a long-lived access token.
func (s *MobileServer) handlePair(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		Code       string `json:"code"`
		DeviceName string `json:"deviceName"`
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 1024*1024))
	if err == nil && len(body) > 0 {
		_ = json.Unmarshal(body, &req)
	}
	if req.Code == "" {
		req.Code = r.URL.Query().Get("code")
	}

	inputCode := strings.TrimSpace(req.Code)
	activeCode := s.GetPairingCode()

	if inputCode == "" || inputCode != activeCode {
		log.Printf("[MobileServer] invalid pairing attempt: input=%s active=%s", inputCode, activeCode)
		writeError(w, http.StatusUnauthorized, "INVALID_PAIRING_CODE", "invalid or expired pairing code")
		return
	}

	// Generate secure 32-byte token (64 hex characters)
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to generate token")
		return
	}
	token := hex.EncodeToString(tokenBytes)

	deviceName := strings.TrimSpace(req.DeviceName)
	if deviceName == "" {
		deviceName = "Mobile Device"
	}

	if s.manager != nil && s.manager.userData != nil {
		if err := s.manager.userData.AddMobileToken(MobileTokenEntry{
			Token:      token,
			DeviceName: deviceName,
			CreatedAt:  time.Now().Unix(),
			LastUsedAt: time.Now().Unix(),
		}); err != nil {
			log.Printf("[MobileServer] failed to persist mobile token: %v", err)
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to persist token")
			return
		}
	}

	log.Printf("[MobileServer] successfully paired device: %s (token prefix %s...)", deviceName, token[:8])

	writeSuccess(w, map[string]any{
		"token": token,
		"name":  "Bowerbird",
	})
}

// handleItemsList returns paginated, filtered library items for the mobile timeline.
func (s *MobileServer) handleItemsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	if s.manager == nil || s.manager.GetActiveLibrary() == nil {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(MobileItemsResponse{
			Total:  0,
			Limit:  50,
			Offset: 0,
			Items:  []MobileItemSummary{},
		})
		return
	}

	queryVals := r.URL.Query()
	q := strings.TrimSpace(queryVals.Get("q"))
	tagFilter := strings.TrimSpace(queryVals.Get("tag"))
	folderFilter := strings.TrimSpace(queryVals.Get("folder"))
	colorFilter := strings.TrimSpace(queryVals.Get("color"))
	typeFilter := strings.ToLower(strings.TrimSpace(queryVals.Get("type")))
	orientationFilter := strings.ToLower(strings.TrimSpace(queryVals.Get("orientation")))
	limit := 50
	if lStr := queryVals.Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			limit = l
		}
	}
	if limit > 200 {
		limit = 200
	}

	offset := 0
	if oStr := queryVals.Get("offset"); oStr != "" {
		if o, err := strconv.Atoi(oStr); err == nil && o >= 0 {
			offset = o
		}
	}

	allItems, err := s.manager.GetItems(q, "desc")
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrCodeUnknown, err.Error())
		return
	}

	filtered := make([]Item, 0, len(allItems))
	for _, it := range allItems {
		if it.InTrash {
			continue
		}

		if tagFilter != "" {
			hasTag := false
			for _, t := range it.Tags {
				if strings.EqualFold(t, tagFilter) {
					hasTag = true
					break
				}
			}
			if !hasTag {
				continue
			}
		}

		if folderFilter != "" {
			hasFolder := false
			for _, f := range it.Folders {
				if f == folderFilter {
					hasFolder = true
					break
				}
			}
			if !hasFolder {
				continue
			}
		}

		if colorFilter != "" {
			if !itemMatchesColor(it, colorFilter) {
				continue
			}
		}
		if typeFilter != "" {
			switch typeFilter {
			case "image":
				if !IsImageExtension(it.Extension) {
					continue
				}
			case "video":
				if !IsVideoExtension(it.Extension) && !strings.HasPrefix(it.MimeType, "video/") {
					continue
				}
			case "audio":
				if !IsAudioExtension(it.Extension) && !strings.HasPrefix(it.MimeType, "audio/") {
					continue
				}
			default:
				if !strings.EqualFold(it.Extension, typeFilter) && !strings.EqualFold(strings.TrimPrefix(it.Extension, "."), typeFilter) {
					continue
				}
			}
		}

		if orientationFilter != "" {
			itemOrientation := deriveOrientation(it)
			if itemOrientation != orientationFilter {
				continue
			}
		}

		filtered = append(filtered, it)
	}

	total := len(filtered)
	start := offset
	if start > total {
		start = total
	}
	end := start + limit
	if end > total {
		end = total
	}

	slice := filtered[start:end]
	summaries := make([]MobileItemSummary, 0, len(slice))

	for _, it := range slice {
		date := it.ImportedAt
		if it.CreatedAt > 0 {
			date = it.CreatedAt
		}
		if it.Meta != nil && it.Meta.ExifDate != "" {
			if t, parseErr := time.Parse("2006:01:02 15:04:05", it.Meta.ExifDate); parseErr == nil {
				date = t.UnixMilli()
			}
		}

		summaries = append(summaries, MobileItemSummary{
			ID:           it.ID,
			Name:         it.Name,
			Filename:     it.Filename,
			Extension:    it.Extension,
			Width:        it.Width,
			Height:       it.Height,
			Size:         it.Size,
			MimeType:     it.MimeType,
			ThumbnailURL: fmt.Sprintf("/api/v1/thumbs/%s", it.ID),
			OriginalURL:  fmt.Sprintf("/api/v1/originals/%s", it.ID),
			CreatedAt:    it.CreatedAt,
			ImportedAt:   it.ImportedAt,
			Date:         date,
			Orientation:  deriveOrientation(it),
			Tags:         it.Tags,
			Folders:      it.Folders,
		})
	}

	resp := MobileItemsResponse{
		Total:  total,
		Limit:  limit,
		Offset: offset,
		Items:  summaries,
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(resp)
}

// handleTagsList returns the tag taxonomy for the active library.
func (s *MobileServer) handleTagsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	if s.manager == nil || s.manager.GetActiveLibrary() == nil {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode([]Tag{})
		return
	}

	tags, err := s.manager.GetTags()
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrCodeUnknown, err.Error())
		return
	}
	if tags == nil {
		tags = []Tag{}
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(tags)
}

// handleFoldersList returns the full folder hierarchy for the active library.
func (s *MobileServer) handleFoldersList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	if s.manager == nil || s.manager.GetActiveLibrary() == nil {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode([]Folder{})
		return
	}

	folders, err := s.manager.GetFolders()
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrCodeUnknown, err.Error())
		return
	}
	if folders == nil {
		folders = []Folder{}
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(folders)
}

// handleColorsList returns aggregated dominant colors across library items.
func (s *MobileServer) handleColorsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	if s.manager == nil || s.manager.GetActiveLibrary() == nil {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode([]string{})
		return
	}

	items, err := s.manager.GetItems("", "desc")
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrCodeUnknown, err.Error())
		return
	}

	type colorCount struct {
		hex   string
		count int
	}
	counts := make(map[string]int)
	for _, it := range items {
		if it.InTrash {
			continue
		}
		c := strings.ToUpper(strings.TrimSpace(it.DominantColor))
		if c != "" && strings.HasPrefix(c, "#") {
			counts[c]++
		}
	}

	list := make([]colorCount, 0, len(counts))
	for c, cnt := range counts {
		list = append(list, colorCount{hex: c, count: cnt})
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].count == list[j].count {
			return list[i].hex < list[j].hex
		}
		return list[i].count > list[j].count
	})

	limit := 16
	if len(list) < limit {
		limit = len(list)
	}
	res := make([]string, 0, limit)
	for i := range limit {
		res = append(res, list[i].hex)
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(res)
}

func itemMatchesColor(it Item, targetHex string) bool {
	candidates := make([]string, 0, 1+len(it.Palette))
	if it.DominantColor != "" {
		candidates = append(candidates, it.DominantColor)
	}
	for _, p := range it.Palette {
		p = strings.TrimSpace(p)
		if p != "" {
			candidates = append(candidates, p)
		}
	}
	if len(candidates) == 0 {
		return false
	}

	const tolerance = 115.0
	for _, c := range candidates {
		if colorDistanceHex(c, targetHex) <= tolerance {
			return true
		}
	}
	return false
}

func colorDistanceHex(hexA, hexB string) float64 {
	r1, g1, b1, ok1 := parseHexRGB(hexA)
	r2, g2, b2, ok2 := parseHexRGB(hexB)
	if !ok1 || !ok2 {
		return 999.0
	}
	rmean := (float64(r1) + float64(r2)) / 2.0
	dr := float64(r1) - float64(r2)
	dg := float64(g1) - float64(g2)
	db := float64(b1) - float64(b2)
	return math.Sqrt((2.0+rmean/256.0)*dr*dr + 4.0*dg*dg + (2.0+(255.0-rmean)/256.0)*db*db)
}

func parseHexRGB(h string) (uint8, uint8, uint8, bool) {
	h = strings.TrimPrefix(strings.TrimSpace(h), "#")
	if len(h) != 6 {
		return 0, 0, 0, false
	}
	val, err := strconv.ParseUint(h, 16, 32)
	if err != nil {
		return 0, 0, 0, false
	}
	return uint8((val >> 16) & 0xFF), uint8((val >> 8) & 0xFF), uint8(val & 0xFF), true
}

func deriveOrientation(it Item) string {
	if it.Meta != nil && it.Meta.Orientation != "" {
		return strings.ToLower(it.Meta.Orientation)
	}
	if it.Width > 0 && it.Height > 0 {
		if it.Width > it.Height {
			return "landscape"
		} else if it.Height > it.Width {
			return "portrait"
		}
		return "square"
	}
	return "landscape"
}

// handleItemDetail returns complete item metadata.
func (s *MobileServer) handleItemDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	itemID := strings.TrimPrefix(r.URL.Path, "/api/v1/items/")
	itemID = strings.TrimSpace(strings.Split(itemID, "/")[0])
	if itemID == "" {
		writeError(w, http.StatusBadRequest, "INVALID_ID", "item id is required")
		return
	}

	if s.manager == nil {
		writeError(w, http.StatusServiceUnavailable, ErrCodeNoActiveLibrary, "no active library")
		return
	}

	item, err := s.manager.GetItem(itemID)
	if err != nil || item == nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "item not found")
		return
	}

	// Clone and set relative mobile URLs
	itemCopy := *item
	itemCopy.ThumbnailURL = fmt.Sprintf("/api/v1/thumbs/%s", item.ID)
	itemCopy.OriginalURL = fmt.Sprintf("/api/v1/originals/%s", item.ID)

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(itemCopy)
}

// handleThumbnail serves thumbnail image or falls back to original.
func (s *MobileServer) handleThumbnail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	itemID := strings.TrimPrefix(r.URL.Path, "/api/v1/thumbs/")
	itemID = strings.TrimSpace(strings.Split(itemID, "/")[0])
	if itemID == "" {
		http.NotFound(w, r)
		return
	}

	activePath := s.manager.GetActiveLibraryPath()
	if activePath == "" {
		http.Error(w, "no active library", http.StatusServiceUnavailable)
		return
	}

	itemDir := filepath.Join(activePath, "items", itemID)
	thumbPath := filepath.Join(itemDir, "thumbnail.jpg")

	if _, err := os.Stat(thumbPath); err == nil {
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		http.ServeFile(w, r, thumbPath)
		return
	}

	// Fallback to original image if thumbnail not generated yet
	item, err := s.manager.GetItem(itemID)
	if err != nil || item == nil {
		http.NotFound(w, r)
		return
	}

	originalPath := filepath.Join(itemDir, item.Filename)
	if _, err := os.Stat(originalPath); err != nil {
		http.NotFound(w, r)
		return
	}

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

// handleOriginal streams original file with full HTTP Range request support.
func (s *MobileServer) handleOriginal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	itemID := strings.TrimPrefix(r.URL.Path, "/api/v1/originals/")
	itemID = strings.TrimSpace(strings.Split(itemID, "/")[0])
	if itemID == "" {
		http.NotFound(w, r)
		return
	}

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
	if _, err := os.Stat(originalPath); err != nil {
		http.NotFound(w, r)
		return
	}

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

// GetLocalIPs enumerates non-loopback active IPv4 addresses, prioritized by:
// 1) LAN addresses (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
// 2) Tailscale addresses (100.64-127.x.x)
// 3) Other IPv4 addresses
func GetLocalIPs() []string {
	var lanIPs []string
	var tailscaleIPs []string
	var otherIPs []string
	seen := make(map[string]bool)

	interfaces, err := net.Interfaces()
	if err != nil {
		return []string{}
	}

	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() {
				continue
			}
			ip4 := ip.To4()
			if ip4 == nil {
				continue
			}
			ipStr := ip4.String()
			if seen[ipStr] {
				continue
			}
			seen[ipStr] = true

			if isLANIP(ip4) {
				lanIPs = append(lanIPs, ipStr)
			} else if isTailscaleIP(ip4) {
				tailscaleIPs = append(tailscaleIPs, ipStr)
			} else {
				otherIPs = append(otherIPs, ipStr)
			}
		}
	}

	sort.Strings(lanIPs)
	sort.Strings(tailscaleIPs)
	sort.Strings(otherIPs)

	result := make([]string, 0, len(lanIPs)+len(tailscaleIPs)+len(otherIPs))
	result = append(result, lanIPs...)
	result = append(result, tailscaleIPs...)
	result = append(result, otherIPs...)
	return result
}

func isLANIP(ip net.IP) bool {
	if ip[0] == 10 {
		return true
	}
	if ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31 {
		return true
	}
	if ip[0] == 192 && ip[1] == 168 {
		return true
	}
	return false
}

func isTailscaleIP(ip net.IP) bool {
	// Tailscale CGNAT range is 100.64.0.0/10 (100.64.0.0 to 100.127.255.255)
	return ip[0] == 100 && (ip[1] >= 64 && ip[1] <= 127)
}

// PairingPayload models the bowerbird://pair?data= JSON payload.
type PairingPayload struct {
	V    int      `json:"v"`
	Name string   `json:"name"`
	IPs  []string `json:"ips"`
	Port int      `json:"port"`
	Code string   `json:"code"`
}

// GetPairingURL returns a bowerbird://pair?data= URL encoding candidate IPs, port, and active pairing code.
func (s *MobileServer) GetPairingURL() string {
	s.mu.RLock()
	port := s.port
	s.mu.RUnlock()

	name := "Bowerbird"
	if s.manager != nil {
		if active := s.manager.GetActiveLibrary(); active != nil && strings.TrimSpace(active.Name) != "" {
			name = active.Name
		}
	}

	payload := PairingPayload{
		V:    1,
		Name: name,
		IPs:  GetLocalIPs(),
		Port: port,
		Code: s.GetPairingCode(),
	}

	bytes, err := json.Marshal(payload)
	if err != nil {
		return ""
	}

	return fmt.Sprintf("bowerbird://pair?data=%s", url.QueryEscape(string(bytes)))
}

// GetStatus returns detailed diagnostics and pairing details for the desktop settings UI.
func (s *MobileServer) GetStatus() MobileServerStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	enabled := true
	pairedCount := 0
	pairingRequired := true
	if s.manager != nil && s.manager.userData != nil {
		ms := s.manager.userData.GetMobileSettings()
		enabled = ms.Enabled
		pairedCount = len(ms.Tokens)
		pairingRequired = ms.PairingRequired
	}

	var itemCount int64
	if s.manager != nil {
		if active := s.manager.GetActiveLibrary(); active != nil {
			itemCount = active.ItemCount
		}
	}

	return MobileServerStatus{
		Enabled:         enabled,
		Running:         s.running,
		Port:            s.port,
		PairingCode:     s.GetPairingCode(),
		Addresses:       GetLocalIPs(),
		PairedDevices:   pairedCount,
		ItemCount:       itemCount,
		PairingRequired: pairingRequired,
	}
}
