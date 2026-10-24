package core

import (
	"context"
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

	"github.com/coder/websocket"
	"github.com/grandcat/zeroconf"
)

// MobileServerVersion is the mobile API contract version.
const MobileServerVersion = "1.2.0"

// MobileServer handles LAN HTTP endpoints and mDNS discovery for mobile clients.
type wsClient struct {
	conn       *websocket.Conn
	send       chan []byte
	token      string
	deviceName string
	connected  time.Time
}

// MobileServer handles LAN HTTP endpoints and mDNS discovery for mobile clients.
type MobileServer struct {
	mu          sync.RWMutex
	manager     *LibraryManager
	listener    net.Listener
	httpServer  *http.Server
	mdnsServer  *zeroconf.Server
	port        int
	running     bool
	pairingCode          string
	legacyPairToken      string
	legacyPairTokenCode  string
	codeMu      sync.RWMutex
	clientsMu   sync.Mutex
	clients     map[*wsClient]bool
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
	Name            string   `json:"name"`
	Version         string   `json:"version"`
	ItemCount       int64    `json:"itemCount"`
	PairingRequired bool     `json:"pairingRequired"`
	Capabilities    []string `json:"capabilities"`
}

// MobileDeviceInfo is a persisted token shown in desktop connection settings.
type MobileDeviceInfo struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Source     string `json:"source"`
	CreatedAt  int64  `json:"createdAt"`
	LastUsedAt int64  `json:"lastUsedAt,omitempty"`
	Connected  bool   `json:"connected"`
	TokenHint  string `json:"tokenHint,omitempty"`
}

// CreatedMobileToken is returned once when creating an API token.
type CreatedMobileToken struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Source    string `json:"source"`
	Token     string `json:"token"`
	CreatedAt int64  `json:"createdAt"`
}

// MobileServerStatus contains desktop-facing diagnostics and pairing details.
type MobileServerStatus struct {
	Enabled           bool                   `json:"enabled"`
	Running           bool                   `json:"running"`
	Port              int                    `json:"port"`
	PairingCode       string                 `json:"pairingCode"`
	Addresses         []string               `json:"addresses"`
	PairedDevices     int                    `json:"pairedDevices"`
	ItemCount         int64                  `json:"itemCount"`
	PairingRequired   bool                   `json:"pairingRequired"`
	AllowedNetworks   []string               `json:"allowedNetworks"`
	AvailableNetworks []NetworkInterfaceInfo `json:"availableNetworks"`
	Devices           []MobileDeviceInfo     `json:"devices"`
}

// newMobileServer initializes the mobile server instance.
func newMobileServer(manager *LibraryManager) *MobileServer {
	s := &MobileServer{
		manager: manager,
		port:    17878,
		clients: make(map[*wsClient]bool),
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
	mux.HandleFunc("/api/v1/ws", s.handleWebSocket)
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/api/v1/libraries", s.authMiddleware(s.handleLibrariesList))
	mux.HandleFunc("/api/v1/libraries/switch", s.authMiddleware(s.handleLibrarySwitch))
	mux.HandleFunc("/api/v1/upload", s.authMiddleware(s.handleUpload))
	mux.HandleFunc("/api/v1/tags", s.authMiddleware(s.handleTagsList))
	mux.HandleFunc("/api/v1/folders", s.authMiddleware(s.handleFoldersList))
	mux.HandleFunc("/api/v1/colors", s.authMiddleware(s.handleColorsList))
	mux.HandleFunc("/api/v1/items", s.authMiddleware(s.handleItemsList))
	mux.HandleFunc("/api/v1/query", s.authMiddleware(s.handleQuery))
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

	s.clientsMu.Lock()
	for c := range s.clients {
		_ = c.conn.Close(websocket.StatusNormalClosure, "server stopped")
	}
	s.clients = make(map[*wsClient]bool)
	s.clientsMu.Unlock()
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
	} else {
		s.pairingCode = fmt.Sprintf("%06d", n.Int64())
	}
	s.legacyPairToken = ""
	s.legacyPairTokenCode = ""
}

// RestartMDNS re-registers mDNS service with current allowed network interfaces.
func (s *MobileServer) RestartMDNS() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}
	s.stopMDNSInternal()
	pairingRequired := true
	if s.manager != nil && s.manager.userData != nil {
		pairingRequired = s.manager.userData.GetMobileSettings().PairingRequired
	}
	s.startMDNS(pairingRequired)
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

	var allowed []string
	if s.manager != nil && s.manager.userData != nil {
		allowed = s.manager.userData.GetMobileSettings().AllowedNetworks
	}

	avail := GetAvailableNetworkInterfaces(allowed)
	selectedMap := make(map[string]bool)
	for _, a := range avail {
		if a.Selected {
			selectedMap[a.ID] = true
		}
	}
	var targetIfaces []net.Interface
	allIfaces, err := net.Interfaces()
	if err == nil {
		for _, iface := range allIfaces {
			if selectedMap[iface.Name] {
				targetIfaces = append(targetIfaces, iface)
			}
		}
	}

	if allowed != nil && len(targetIfaces) == 0 {
		log.Printf("[MobileServer] all discovery interfaces deselected, skipping mDNS registration")
		return
	}

	mdns, err := zeroconf.Register(
		instanceName,
		"_bowerbird._tcp",
		"local.",
		s.port,
		txtRecords,
		targetIfaces,
	)
	if err != nil {
		log.Printf("[MobileServer] failed to register mDNS service: %v", err)
		return
	}
	s.mdnsServer = mdns
	log.Printf("[MobileServer] mDNS announced: %s._bowerbird._tcp on port %d (interfaces: %d)", instanceName, s.port, len(targetIfaces))
}

// Broadcast sends a JSON event message to all connected WebSocket clients.
func (s *MobileServer) Broadcast(event string, data any) {
	payload := map[string]any{
		"event": event,
		"data":  data,
	}
	if m, ok := data.(map[string]any); ok {
		for k, v := range m {
			payload[k] = v
		}
	}
	msgBytes, err := json.Marshal(payload)
	if err != nil {
		return
	}

	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()
	for client := range s.clients {
		select {
		case client.send <- msgBytes:
		default:
			// drop if buffer full
		}
	}
}

func (s *MobileServer) connectedTokenSet() map[string]bool {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()
	out := make(map[string]bool, len(s.clients))
	for client := range s.clients {
		if client.token != "" {
			out[client.token] = true
		}
	}
	return out
}

func (s *MobileServer) closeClientsWithToken(token string) {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()
	for client := range s.clients {
		if token != "" && client.token == token {
			select {
			case client.send <- mustJSON(map[string]any{"event": "pairing_revoked", "data": map[string]any{}}):
			default:
			}
			_ = client.conn.Close(websocket.StatusPolicyViolation, "revoked")
		}
	}
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

func tokenHint(token string) string {
	if len(token) <= 8 {
		return token
	}
	return token[:4] + "…" + token[len(token)-4:]
}

func (s *MobileServer) listDevices() []MobileDeviceInfo {
	if s.manager == nil || s.manager.userData == nil {
		return []MobileDeviceInfo{}
	}
	connected := s.connectedTokenSet()
	tokens := s.manager.userData.ListMobileTokens()
	out := make([]MobileDeviceInfo, 0, len(tokens))
	for _, t := range tokens {
		id := t.ID
		if id == "" {
			id = t.Token
		}
		source := t.Source
		if source == "" {
			source = MobileTokenSourcePairing
		}
		name := t.DeviceName
		if name == "" {
			name = "Device"
		}
		out = append(out, MobileDeviceInfo{
			ID:         id,
			Name:       name,
			Source:     source,
			CreatedAt:  t.CreatedAt,
			LastUsedAt: t.LastUsedAt,
			Connected:  connected[t.Token],
			TokenHint:  tokenHint(t.Token),
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Connected != out[j].Connected {
			return out[i].Connected
		}
		return out[i].LastUsedAt > out[j].LastUsedAt
	})
	return out
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
		if token == "" {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized: valid pairing token required")
			return
		}
		if !s.manager.userData.HasMobileToken(token) {
			issued, ok := s.issueTokenFromLegacyPairingCode(token, r)
			if !ok {
				writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized: valid pairing token required")
				return
			}
			token = issued
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

func deviceNameFromRequest(r *http.Request) string {
	if r == nil {
		return "Mobile Device"
	}
	name := strings.TrimSpace(r.Header.Get("X-Device-Name"))
	if name == "" {
		name = strings.TrimSpace(r.URL.Query().Get("deviceName"))
	}
	if name == "" {
		name = "Mobile Device"
	}
	return name
}

// issueTokenFromLegacyPairingCode accepts a 6-digit pairing code sent as a Bearer
// token (legacy mobile clients) and persists a long-lived API token automatically.
func (s *MobileServer) issueTokenFromLegacyPairingCode(code string, r *http.Request) (string, bool) {
	code = strings.TrimSpace(code)
	if code == "" || code != s.GetPairingCode() {
		return "", false
	}
	if s.manager == nil || s.manager.userData == nil {
		return "", false
	}

	s.codeMu.Lock()
	if s.legacyPairToken != "" && s.legacyPairTokenCode == code && s.manager.userData.HasMobileToken(s.legacyPairToken) {
		token := s.legacyPairToken
		s.codeMu.Unlock()
		return token, true
	}
	s.codeMu.Unlock()

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		log.Printf("[MobileServer] failed to generate token from pairing code: %v", err)
		return "", false
	}
	token := hex.EncodeToString(tokenBytes)
	deviceName := deviceNameFromRequest(r)
	if err := s.manager.userData.AddMobileToken(MobileTokenEntry{
		Token:      token,
		DeviceName: deviceName,
		Source:     MobileTokenSourcePairing,
		CreatedAt:  time.Now().Unix(),
		LastUsedAt: time.Now().Unix(),
	}); err != nil {
		log.Printf("[MobileServer] failed to persist token from pairing code: %v", err)
		return "", false
	}
	s.codeMu.Lock()
	s.legacyPairToken = token
	s.legacyPairTokenCode = code
	s.codeMu.Unlock()
	log.Printf("[MobileServer] auto-issued API token from pairing code for %s", deviceName)
	return token, true
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
		Capabilities:    []string{"query"},
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
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error":   "invalid_code",
			"code":    "invalid_code",
			"message": "invalid or expired pairing code",
		})
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
			Source:     MobileTokenSourcePairing,
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

// handleWebSocket upgrades incoming requests to a full-duplex WebSocket connection.
func (s *MobileServer) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	token := extractToken(r)
	deviceName := ""
	if s.manager != nil && s.manager.userData != nil {
		settings := s.manager.userData.GetMobileSettings()
		if settings.PairingRequired {
			if token == "" {
				writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized: valid pairing token required")
				return
			}
			if !s.manager.userData.HasMobileToken(token) {
				issued, ok := s.issueTokenFromLegacyPairingCode(token, r)
				if !ok {
					writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "unauthorized: valid pairing token required")
					return
				}
				token = issued
			}
			go s.manager.userData.TouchMobileToken(token)
		}
		for _, entry := range s.manager.userData.ListMobileTokens() {
			if entry.Token == token {
				deviceName = entry.DeviceName
				break
			}
		}
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		log.Printf("[MobileServer] websocket handshake failed: %v", err)
		return
	}

	client := &wsClient{
		conn:       conn,
		send:       make(chan []byte, 64),
		token:      token,
		deviceName: deviceName,
		connected:  time.Now(),
	}

	s.clientsMu.Lock()
	s.clients[client] = true
	s.clientsMu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Write pump with heartbeat ping
	go func() {
		ticker := time.NewTicker(25 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-client.send:
				if !ok {
					return
				}
				wCtx, wCancel := context.WithTimeout(ctx, 5*time.Second)
				err := client.conn.Write(wCtx, websocket.MessageText, msg)
				wCancel()
				if err != nil {
					cancel()
					return
				}
			case <-ticker.C:
				pCtx, pCancel := context.WithTimeout(ctx, 5*time.Second)
				err := client.conn.Ping(pCtx)
				pCancel()
				if err != nil {
					cancel()
					return
				}
			}
		}
	}()

	// Read pump to detect disconnections and handle ping messages
	defer func() {
		s.clientsMu.Lock()
		delete(s.clients, client)
		s.clientsMu.Unlock()
		close(client.send)
		_ = client.conn.Close(websocket.StatusNormalClosure, "disconnect")
	}()

	for {
		_, msg, err := client.conn.Read(ctx)
		if err != nil {
			break
		}
		var req map[string]any
		if json.Unmarshal(msg, &req) == nil && req["type"] == "ping" {
			pong, _ := json.Marshal(map[string]string{"type": "pong"})
			select {
			case client.send <- pong:
			default:
			}
		}
	}
}

// handleLibrariesList lists user libraries with their active status and item counts.
func (s *MobileServer) handleLibrariesList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	var activePath string
	var activeLib *LibraryInfo
	var recentPaths []string
	if s.manager != nil {
		activePath = s.manager.GetActiveLibraryPath()
		activeLib = s.manager.GetActiveLibrary()
		if s.manager.userData != nil {
			recentPaths = s.manager.userData.GetRecentLibraries()
		}
	}

	allPaths := make([]string, 0, len(recentPaths)+1)
	seen := make(map[string]bool)
	if activePath != "" {
		allPaths = append(allPaths, activePath)
		seen[filepath.Clean(activePath)] = true
	}
	for _, p := range recentPaths {
		clean := filepath.Clean(p)
		if !seen[clean] {
			seen[clean] = true
			allPaths = append(allPaths, clean)
		}
	}

	libraries := make([]MobileLibraryEntry, 0, len(allPaths))
	for _, p := range allPaths {
		stat, err := os.Stat(p)
		if err != nil || !stat.IsDir() {
			continue
		}

		libJSONPath := filepath.Join(p, "library.json")
		data, err := os.ReadFile(libJSONPath)
		if err != nil {
			continue
		}
		var meta struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		}
		_ = json.Unmarshal(data, &meta)

		name := meta.Name
		if strings.TrimSpace(name) == "" {
			name = strings.TrimSuffix(filepath.Base(p), ".library")
		}

		isActive := (activePath != "" && filepath.Clean(activePath) == filepath.Clean(p))
		var count int64
		if isActive && activeLib != nil {
			count = activeLib.ItemCount
		} else {
			dbPath := filepath.Join(p, "index.db")
			if _, dbStatErr := os.Stat(dbPath); dbStatErr == nil {
				if db, openErr := openLibraryDB(dbPath); openErr == nil {
					_ = db.QueryRow("SELECT COUNT(*) FROM items").Scan(&count)
					_ = db.Close()
				}
			}
		}

		libraries = append(libraries, MobileLibraryEntry{
			ID:        meta.ID,
			Name:      name,
			Path:      p,
			ItemCount: count,
			IsActive:  isActive,
		})
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"libraries": libraries,
	})
}

// handleLibrarySwitch changes the active library and notifies desktop and mobile clients.
func (s *MobileServer) handleLibrarySwitch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		ID   string `json:"id"`
		Path string `json:"path"`
	}
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1024*1024))
	_ = json.Unmarshal(body, &req)

	targetPath := strings.TrimSpace(req.Path)
	if targetPath == "" && req.ID != "" && s.manager != nil && s.manager.userData != nil {
		for _, p := range s.manager.userData.GetRecentLibraries() {
			data, _ := os.ReadFile(filepath.Join(p, "library.json"))
			var meta struct {
				ID string `json:"id"`
			}
			_ = json.Unmarshal(data, &meta)
			if meta.ID == req.ID {
				targetPath = p
				break
			}
		}
	}

	if targetPath == "" {
		writeError(w, http.StatusBadRequest, "INVALID_PARAM", "library path or id is required")
		return
	}

	if _, err := os.Stat(filepath.Join(targetPath, "library.json")); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_LIB_DIR", "invalid library directory: library.json not found")
		return
	}

	info, err := s.manager.OpenLibrary(targetPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "SWITCH_FAILED", err.Error())
		return
	}

	// Notify desktop UI via LibraryOpenedEvent
	s.manager.emit(LibraryOpenedEvent, info)

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":  "success",
		"library": info,
	})
}

// handleUpload accepts multipart uploaded media, imports them into the active library, and broadcasts items_updated.
func (s *MobileServer) handleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}
	if s.manager == nil || s.manager.GetActiveLibrary() == nil {
		writeError(w, http.StatusServiceUnavailable, "NO_ACTIVE_LIBRARY", "no active library opened")
		return
	}

	// 500 MB max request body
	r.Body = http.MaxBytesReader(w, r.Body, 500<<20)
	mr, err := r.MultipartReader()
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_MULTIPART", "invalid multipart request: "+err.Error())
		return
	}

	tempDir, err := os.MkdirTemp("", "bowerbird_upload_*")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create temporary upload directory")
		return
	}
	defer os.RemoveAll(tempDir)

	var savedPaths []string
	for {
		part, pErr := mr.NextPart()
		if pErr == io.EOF {
			break
		}
		if pErr != nil {
			writeError(w, http.StatusBadRequest, "INVALID_MULTIPART", pErr.Error())
			return
		}
		filename := part.FileName()
		if filename == "" {
			_ = part.Close()
			continue
		}

		// Security: prevent path traversal
		cleanName := filepath.Base(filepath.Clean(filename))
		if cleanName == "." || cleanName == "/" || strings.Contains(cleanName, "..") {
			_ = part.Close()
			writeError(w, http.StatusBadRequest, "INVALID_FILENAME", "unsafe filename provided")
			return
		}

		destPath := filepath.Join(tempDir, cleanName)
		out, cErr := os.Create(destPath)
		if cErr != nil {
			_ = part.Close()
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to save uploaded file")
			return
		}
		_, copyErr := io.Copy(out, part)
		_ = out.Close()
		_ = part.Close()
		if copyErr != nil {
			writeError(w, http.StatusBadRequest, "UPLOAD_FAILED", "file upload interrupted: "+copyErr.Error())
			return
		}
		savedPaths = append(savedPaths, destPath)
	}

	if len(savedPaths) == 0 {
		writeError(w, http.StatusBadRequest, "NO_FILES", "no files found in upload request")
		return
	}

	items, importErr := s.manager.ImportFilesFromMobile(savedPaths)
	if importErr != nil {
		writeError(w, http.StatusInternalServerError, "IMPORT_FAILED", importErr.Error())
		return
	}

	if len(items) > 0 {
		// The import pipeline already broadcast items_updated to mobile clients;
		// notify the desktop UI exactly once with the imported summaries.
		s.manager.emit("library-items-upserted", items)
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status": "success",
		"count":  len(items),
		"items":  items,
	})
}

// handleItemsList is the legacy mobile timeline endpoint. It keeps the old
// query parameters and limit ceiling for compatibility, but delegates all
// filtering to the shared query engine.
func (s *MobileServer) handleItemsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	queryVals := r.URL.Query()
	spec := QuerySpec{Text: strings.TrimSpace(queryVals.Get("q"))}
	if tag := strings.TrimSpace(queryVals.Get("tag")); tag != "" {
		spec.Tags = append(spec.Tags, tag)
	}
	if folder := strings.TrimSpace(queryVals.Get("folder")); folder != "" {
		spec.Folders = append(spec.Folders, folder)
	}
	if color := strings.TrimSpace(queryVals.Get("color")); color != "" {
		spec.Colors = append(spec.Colors, color)
	}
	if mediaType := strings.TrimSpace(queryVals.Get("type")); mediaType != "" {
		spec.Types = append(spec.Types, mediaType)
	}
	if orientation := strings.TrimSpace(queryVals.Get("orientation")); orientation != "" {
		spec.Orientations = append(spec.Orientations, orientation)
	}

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

	s.writeQueryResponse(w, spec, "desc", offset, limit)
}

type mobileQueryRequest struct {
	Query  string `json:"query"`
	Sort   string `json:"sort"`
	Offset int    `json:"offset"`
	Limit  int    `json:"limit"`
}

// handleQuery executes a query string through the shared engine and returns a
// paginated summary page plus the full filtered total.
func (s *MobileServer) handleQuery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	var req mobileQueryRequest
	body := http.MaxBytesReader(w, r.Body, 64<<10)
	decoder := json.NewDecoder(body)
	if err := decoder.Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON body: "+err.Error())
		return
	}

	sortOrder := strings.ToLower(strings.TrimSpace(req.Sort))
	if sortOrder == "" {
		sortOrder = "desc"
	}
	if sortOrder != "desc" && sortOrder != "asc" {
		writeError(w, http.StatusBadRequest, "INVALID_QUERY", "sort must be desc or asc")
		return
	}

	spec, err := ParseQuery(req.Query)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_QUERY", err.Error())
		return
	}

	offset := req.Offset
	if offset < 0 {
		offset = 0
	}
	limit := req.Limit
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}

	s.writeQueryResponse(w, spec, sortOrder, offset, limit)
}

func (s *MobileServer) writeQueryResponse(w http.ResponseWriter, spec QuerySpec, sortOrder string, offset, limit int) {
	if s.manager == nil || s.manager.GetActiveLibrary() == nil {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(MobileItemsResponse{
			Total:  0,
			Limit:  limit,
			Offset: offset,
			Items:  []MobileItemSummary{},
		})
		return
	}

	items, total, err := s.manager.QueryItems(spec, sortOrder, offset, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrCodeUnknown, err.Error())
		return
	}

	resp := MobileItemsResponse{
		Total:  total,
		Limit:  limit,
		Offset: offset,
		Items:  mobileItemSummaries(items),
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(resp)
}

func mobileItemSummaries(items []Item) []MobileItemSummary {
	summaries := make([]MobileItemSummary, 0, len(items))
	for _, it := range items {
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
	return summaries
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
	if orientation := itemOrientation(it); orientation != "" {
		return orientation
	}
	return "landscape"
}

// handleItemDetail returns complete item metadata, or moves the item to the
// recycle bin when called with DELETE.
func (s *MobileServer) handleItemDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodDelete {
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

	if r.Method == http.MethodDelete {
		s.handleItemDelete(w, item)
		return
	}

	// Clone and set relative mobile URLs
	itemCopy := *item
	itemCopy.ThumbnailURL = fmt.Sprintf("/api/v1/thumbs/%s", item.ID)
	itemCopy.OriginalURL = fmt.Sprintf("/api/v1/originals/%s", item.ID)

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(itemCopy)
}

// handleItemDelete moves an item to the recycle bin (MoveToTrash). The item can
// still be restored from the desktop trash view; there is no permanent delete.
func (s *MobileServer) handleItemDelete(w http.ResponseWriter, item *Item) {
	if item.InTrash {
		writeError(w, http.StatusConflict, ErrCodeItemAlreadyTrashed, "item is already in trash")
		return
	}

	if err := s.manager.MoveToTrash(item.ID); err != nil {
		writeError(w, http.StatusInternalServerError, ErrCodeDeleteItemFailed, err.Error())
		return
	}

	// MoveToTrash broadcasts items_updated to mobile clients. Tell the desktop
	// UI to drop the item in place without broadcasting a second ws event.
	s.manager.emit("library-items-trashed", []string{item.ID})
	writeSuccess(w, map[string]any{"id": item.ID, "inTrash": true})
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

// GetAvailableNetworkInterfaces returns all active non-loopback network interfaces with their candidate status.
func GetAvailableNetworkInterfaces(allowedNetworks []string) []NetworkInterfaceInfo {
	interfaces, err := net.Interfaces()
	if err != nil {
		return []NetworkInterfaceInfo{}
	}

	var results []NetworkInterfaceInfo
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		var ips []string
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
			ips = append(ips, ip4.String())
		}
		if len(ips) == 0 {
			continue
		}

		sort.Strings(ips)
		netType := "other"
		hasLAN := false
		hasTailscale := false
		for _, ipStr := range ips {
			parsed := net.ParseIP(ipStr)
			if parsed != nil {
				if isLANIP(parsed.To4()) {
					hasLAN = true
				} else if isTailscaleIP(parsed.To4()) {
					hasTailscale = true
				}
			}
		}
		if hasLAN {
			netType = "lan"
		} else if hasTailscale {
			netType = "tailscale"
		}

		selected := false
		if allowedNetworks == nil {
			// Default: only LAN interfaces are selected
			selected = (netType == "lan")
		} else {
			for _, allowed := range allowedNetworks {
				if allowed == iface.Name || allowed == netType {
					selected = true
					break
				}
				for _, ipStr := range ips {
					if allowed == ipStr {
						selected = true
						break
					}
				}
			}
		}

		displayName := fmt.Sprintf("%s (%s)", iface.Name, strings.Join(ips, ", "))
		results = append(results, NetworkInterfaceInfo{
			ID:       iface.Name,
			Name:     displayName,
			Type:     netType,
			IPs:      ips,
			Selected: selected,
		})
	}

	return results
}

// GetFilteredLocalIPs returns candidate IPv4 addresses according to allowed networks configuration.
func GetFilteredLocalIPs(allowedNetworks []string) []string {
	avail := GetAvailableNetworkInterfaces(allowedNetworks)
	var lanIPs []string
	var tailscaleIPs []string
	var otherIPs []string
	seen := make(map[string]bool)

	for _, item := range avail {
		if !item.Selected {
			continue
		}
		for _, ip := range item.IPs {
			if seen[ip] {
				continue
			}
			seen[ip] = true
			switch item.Type {
			case "lan":
				lanIPs = append(lanIPs, ip)
			case "tailscale":
				tailscaleIPs = append(tailscaleIPs, ip)
			default:
				otherIPs = append(otherIPs, ip)
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

// GetLocalIPs enumerates default local IPv4 addresses (LAN first, then Tailscale, then others).
func GetLocalIPs() []string {
	return GetFilteredLocalIPs(nil)
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

	var allowed []string
	name := "Bowerbird"
	if s.manager != nil {
		if active := s.manager.GetActiveLibrary(); active != nil && strings.TrimSpace(active.Name) != "" {
			name = active.Name
		}
		if s.manager.userData != nil {
			allowed = s.manager.userData.GetMobileSettings().AllowedNetworks
		}
	}

	payload := PairingPayload{
		V:    1,
		Name: name,
		IPs:  GetFilteredLocalIPs(allowed),
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
	var allowed []string
	if s.manager != nil && s.manager.userData != nil {
		ms := s.manager.userData.GetMobileSettings()
		enabled = ms.Enabled
		pairedCount = len(ms.Tokens)
		pairingRequired = ms.PairingRequired
		allowed = ms.AllowedNetworks
	}

	var itemCount int64
	if s.manager != nil {
		if active := s.manager.GetActiveLibrary(); active != nil {
			itemCount = active.ItemCount
		}
	}

	return MobileServerStatus{
		Enabled:           enabled,
		Running:           s.running,
		Port:              s.port,
		PairingCode:       s.GetPairingCode(),
		Addresses:         GetFilteredLocalIPs(allowed),
		PairedDevices:     pairedCount,
		ItemCount:         itemCount,
		PairingRequired:   pairingRequired,
		AllowedNetworks:   allowed,
		AvailableNetworks: GetAvailableNetworkInterfaces(allowed),
		Devices:           s.listDevices(),
	}
}
