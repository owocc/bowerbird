package core

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// APIResponse wraps responses in standard JSON envelope compatible with extensions.
type APIResponse struct {
	Status  string `json:"status"` // "success" or "error"
	Code    string `json:"code,omitempty"`
	Data    any    `json:"data,omitempty"`
	Message string `json:"message,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, resp APIResponse) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(resp)
}

func writeSuccess(w http.ResponseWriter, data any) {
	writeJSON(w, http.StatusOK, APIResponse{Status: "success", Code: SuccessCodeOK, Data: data})
}

func writeSuccessWithCode(w http.ResponseWriter, code string, data any) {
	writeJSON(w, http.StatusOK, APIResponse{Status: "success", Code: code, Data: data})
}

func writeError(w http.ResponseWriter, status int, code string, message string) {
	writeJSON(w, status, APIResponse{Status: "error", Code: code, Message: message})
}

func writeAppError(w http.ResponseWriter, status int, err error) {
	if appErr, ok := err.(*AppError); ok {
		writeError(w, status, appErr.Code, appErr.Message)
		return
	}
	writeError(w, status, ErrCodeUnknown, err.Error())
}

// registerAPIRoutes registers all Open API endpoints for browser extensions.
func (s *AssetServer) registerAPIRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/ping", s.handleAPIPing)
	mux.HandleFunc("/api/health", s.handleAPIHealth)
	mux.HandleFunc("/api/info", s.handleAPIInfo)
	mux.HandleFunc("/api/application/info", s.handleAPIInfo)
	mux.HandleFunc("/api/folders", s.handleAPIFolders)
	mux.HandleFunc("/api/folder/list", s.handleAPIFolders)
	mux.HandleFunc("/api/folder/create", s.handleAPIFolderCreate)

	mux.HandleFunc("/api/tags", s.handleAPITags)
	mux.HandleFunc("/api/tag/list", s.handleAPITags)

	mux.HandleFunc("/api/item/addFromURL", s.handleAPIItemAddFromURL)
	mux.HandleFunc("/api/item/addFromUrl", s.handleAPIItemAddFromURL)
	mux.HandleFunc("/api/item/addFromBase64", s.handleAPIItemAddFromBase64)
	mux.HandleFunc("/api/item/addBookmark", s.handleAPIItemAddBookmark)
	mux.HandleFunc("/api/item/addFromURLs", s.handleAPIItemAddFromURLs)
	mux.HandleFunc("/api/items/batch", s.handleAPIItemAddFromURLs)

	mux.HandleFunc("/api/items", s.handleAPIItemList)
	mux.HandleFunc("/api/item/list", s.handleAPIItemList)

	mux.HandleFunc("/api/plugins", s.handleAPIPluginsList)
	mux.HandleFunc("/api/plugins/check-updates", s.handleAPIPluginsCheckUpdates)
	mux.HandleFunc("/api/plugins/upgrade", s.handleAPIPluginUpgrade)
	mux.HandleFunc("/api/plugin/install", s.handleAPIPluginInstall)
	mux.HandleFunc("/api/plugin/confirm-install", s.handleAPIPluginConfirmInstall)
	mux.HandleFunc("/api/plugin/uninstall", s.handleAPIPluginUninstall)
	mux.HandleFunc("/api/system/paths", s.handleAPISystemPaths)
	mux.HandleFunc("/api/system/open-user-data", s.handleAPIOpenUserData)
	mux.HandleFunc("/api/system/open-plugins", s.handleAPIOpenPlugins)
	mux.HandleFunc("/api/network/settings", s.handleAPINetworkSettings)
	mux.HandleFunc("/api/network/test", s.handleAPINetworkTest)
}

// handleAPIPing provides a lightweight check to determine if the desktop application is running.
func (s *AssetServer) handleAPIPing(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}
	writeSuccess(w, map[string]any{
		"running": true,
		"pong":    true,
		"name":    "Bowerbird",
		"port":    s.port,
	})
}

// handleAPIHealth provides a health check endpoint reporting whether the app is running and library status.
func (s *AssetServer) handleAPIHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}
	var activeLib *LibraryInfo
	if s.manager != nil {
		activeLib = s.manager.GetActiveLibrary()
	}
	writeSuccess(w, map[string]any{
		"running":          true,
		"hasActiveLibrary": activeLib != nil,
		"activeLibrary":    activeLib,
		"port":             s.port,
	})
}

// handleAPIInfo returns system status, version, and currently active library details.
func (s *AssetServer) handleAPIInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	var activeLib *LibraryInfo
	if s.manager != nil {
		activeLib = s.manager.GetActiveLibrary()
	}

	writeSuccess(w, map[string]any{
		"running":             true,
		"version":             "1.0.0",
		"prerequisiteVersion": "1.0.0",
		"name":                "Bowerbird",
		"port":                s.port,
		"activeLibrary":       activeLib,
	})
}

// handleAPIFolders returns the full folder hierarchy of the active library.
func (s *AssetServer) handleAPIFolders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	if s.manager == nil || s.manager.GetActiveLibrary() == nil {
		writeError(w, http.StatusServiceUnavailable, ErrCodeNoActiveLibrary, "no active library")
		return
	}

	folders, err := s.manager.GetFolders()
	if err != nil {
		writeAppError(w, http.StatusInternalServerError, err)
		return
	}
	if folders == nil {
		folders = []Folder{}
	}
	writeSuccess(w, folders)
}

// handleAPIFolderCreate creates a new folder in the active library.
func (s *AssetServer) handleAPIFolderCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	if s.manager == nil || s.manager.GetActiveLibrary() == nil {
		writeError(w, http.StatusServiceUnavailable, ErrCodeNoActiveLibrary, "no active library")
		return
	}

	var req struct {
		Name     string `json:"name"`
		ParentID string `json:"parentId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusBadRequest, ErrCodeFolderNameEmpty, "folder name cannot be empty")
		return
	}

	folder, err := s.manager.CreateFolder(req.Name, req.ParentID)
	if err != nil {
		writeAppError(w, http.StatusInternalServerError, err)
		return
	}
	writeSuccessWithCode(w, SuccessCodeFolderCreated, folder)
}

// handleAPITags returns the tags taxonomy.
func (s *AssetServer) handleAPITags(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	if s.manager == nil || s.manager.GetActiveLibrary() == nil {
		writeError(w, http.StatusServiceUnavailable, ErrCodeNoActiveLibrary, "no active library")
		return
	}

	tags, err := s.manager.GetTags()
	if err != nil {
		writeAppError(w, http.StatusInternalServerError, err)
		return
	}
	if tags == nil {
		tags = []Tag{}
	}
	writeSuccess(w, tags)
}

// ItemImportRequest models incoming payload for adding items via URL or Base64.
type ItemImportRequest struct {
	URL         string            `json:"url"`
	Name        string            `json:"name"`
	Title       string            `json:"title"`
	Website     string            `json:"website"`
	Annotation  string            `json:"annotation"`
	Note        string            `json:"note"`
	Rating      int               `json:"rating"`
	Prompt      string            `json:"prompt"`
	Tags        []string          `json:"tags"`
	FolderID    string            `json:"folderId"`
	FolderIDs   []string          `json:"folderIds"`
	Headers     map[string]string `json:"headers"`
	Base64      string            `json:"base64"`
	Data        string            `json:"data"`
}

func (req *ItemImportRequest) ToOptions() ImportItemOptions {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = strings.TrimSpace(req.Title)
	}

	sourceURL := strings.TrimSpace(req.Website)
	if sourceURL == "" {
		sourceURL = strings.TrimSpace(req.URL)
	}

	note := strings.TrimSpace(req.Annotation)
	if note == "" {
		note = strings.TrimSpace(req.Note)
	}

	var folderIDs []string
	if strings.TrimSpace(req.FolderID) != "" {
		folderIDs = append(folderIDs, strings.TrimSpace(req.FolderID))
	}
	for _, fid := range req.FolderIDs {
		trimmed := strings.TrimSpace(fid)
		if trimmed != "" {
			folderIDs = append(folderIDs, trimmed)
		}
	}

	return ImportItemOptions{
		Name:      name,
		URL:       sourceURL,
		Note:      note,
		Rating:    req.Rating,
		Prompt:    strings.TrimSpace(req.Prompt),
		Tags:      req.Tags,
		FolderIDs: folderIDs,
		Headers:   req.Headers,
	}
}

// handleAPIItemAddFromURL imports a remote asset from URL.
func (s *AssetServer) handleAPIItemAddFromURL(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	if s.manager == nil || s.manager.GetActiveLibrary() == nil {
		writeError(w, http.StatusServiceUnavailable, ErrCodeNoActiveLibrary, "no active library")
		return
	}

	var req ItemImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "invalid request body")
		return
	}

	targetURL := strings.TrimSpace(req.URL)
	if targetURL == "" {
		writeError(w, http.StatusBadRequest, ErrCodeInvalidURL, "missing url field")
		return
	}

	opts := req.ToOptions()
	item, err := s.manager.ImportFromURLWithOptions(targetURL, opts)
	if err != nil {
		writeAppError(w, http.StatusInternalServerError, err)
		return
	}

	writeSuccessWithCode(w, SuccessCodeItemsImported, item)
}

// handleAPIItemAddFromBase64 imports binary data provided in Base64 (e.g. screenshots or canvas captures).
func (s *AssetServer) handleAPIItemAddFromBase64(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	if s.manager == nil || s.manager.GetActiveLibrary() == nil {
		writeError(w, http.StatusServiceUnavailable, ErrCodeNoActiveLibrary, "no active library")
		return
	}

	var req ItemImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "invalid request body")
		return
	}

	rawB64 := req.Base64
	if rawB64 == "" {
		rawB64 = req.Data
	}
	if strings.TrimSpace(rawB64) == "" {
		writeError(w, http.StatusBadRequest, ErrCodeInvalidBase64, "missing base64 data")
		return
	}

	opts := req.ToOptions()
	filename := opts.Name
	if filename == "" {
		filename = fmt.Sprintf("clip_%d.png", time.Now().Unix())
	} else if !strings.Contains(filename, ".") {
		filename = filename + ".png"
	}

	item, err := s.manager.ImportFromBase64WithOptions(filename, rawB64, opts)
	if err != nil {
		writeAppError(w, http.StatusInternalServerError, err)
		return
	}

	writeSuccessWithCode(w, SuccessCodeScreenshotSaved, item)
}

// handleAPIItemAddBookmark saves a bookmark item with source link and screenshot/card thumbnail.
func (s *AssetServer) handleAPIItemAddBookmark(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	if s.manager == nil || s.manager.GetActiveLibrary() == nil {
		writeError(w, http.StatusServiceUnavailable, ErrCodeNoActiveLibrary, "no active library")
		return
	}

	var req ItemImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "invalid request body")
		return
	}

	pageURL := strings.TrimSpace(req.URL)
	if pageURL == "" {
		pageURL = strings.TrimSpace(req.Website)
	}
	if pageURL == "" {
		writeError(w, http.StatusBadRequest, ErrCodeInvalidURL, "missing url field")
		return
	}

	opts := req.ToOptions()
	opts.URL = pageURL

	title := opts.Name
	if title == "" {
		title = pageURL
	}
	opts.Name = title

	rawB64 := req.Base64
	if rawB64 == "" {
		rawB64 = req.Data
	}

	filename := fmt.Sprintf("bookmark_%d.png", time.Now().Unix())
	if strings.TrimSpace(rawB64) == "" {
		// Generate an SVG bookmark visual card
		escapedTitle := strings.ReplaceAll(strings.ReplaceAll(title, "&", "&amp;"), "<", "&lt;")
		escapedURL := strings.ReplaceAll(strings.ReplaceAll(pageURL, "&", "&amp;"), "<", "&lt;")
		svgCard := fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
  <defs>
    <linearGradient id="bg" x1="0%%" y1="0%%" x2="100%%" y2="100%%">
      <stop offset="0%%" stop-color="#1e1b4b" />
      <stop offset="50%%" stop-color="#312e81" />
      <stop offset="100%%" stop-color="#0f172a" />
    </linearGradient>
  </defs>
  <rect width="800" height="500" rx="24" fill="url(#bg)" />
  <circle cx="100" cy="110" r="36" fill="#6366f1" opacity="0.25" />
  <text x="100" y="122" font-family="-apple-system, sans-serif" font-size="32" font-weight="bold" fill="#818cf8" text-anchor="middle">🔖</text>
  <text x="160" y="118" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="28" font-weight="700" fill="#f8fafc">%s</text>
  <text x="100" y="220" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="18" fill="#94a3b8">%s</text>
  <line x1="100" y1="260" x2="700" y2="260" stroke="#334155" stroke-width="1" />
  <text x="100" y="420" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="14" fill="#64748b">Saved via Bowerbird Web Extension</text>
</svg>`, escapedTitle, escapedURL)
		filename = fmt.Sprintf("bookmark_%d.svg", time.Now().Unix())
		rawB64 = base64.StdEncoding.EncodeToString([]byte(svgCard))
	}

	item, err := s.manager.ImportFromBase64WithOptions(filename, rawB64, opts)
	if err != nil {
		writeAppError(w, http.StatusInternalServerError, err)
		return
	}

	writeSuccessWithCode(w, SuccessCodeBookmarkSaved, item)
}

// handleAPIItemAddFromURLs imports multiple URLs in batch with worker concurrency.
func (s *AssetServer) handleAPIItemAddFromURLs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	if s.manager == nil || s.manager.GetActiveLibrary() == nil {
		writeError(w, http.StatusServiceUnavailable, ErrCodeNoActiveLibrary, "no active library")
		return
	}

	var batchPayload struct {
		Items     []ItemImportRequest `json:"items"`
		FolderID  string              `json:"folderId"`
		FolderIDs []string            `json:"folderIds"`
		Tags      []string            `json:"tags"`
	}

	// Try reading as object with items, or fallback to direct array
	bodyBytes := make([]byte, 0, 1024*1024)
	buf := make([]byte, 4096)
	for {
		n, err := r.Body.Read(buf)
		if n > 0 {
			bodyBytes = append(bodyBytes, buf[:n]...)
		}
		if err != nil {
			break
		}
	}

	if err := json.Unmarshal(bodyBytes, &batchPayload); err != nil || len(batchPayload.Items) == 0 {
		var rawList []ItemImportRequest
		if listErr := json.Unmarshal(bodyBytes, &rawList); listErr == nil && len(rawList) > 0 {
			batchPayload.Items = rawList
		} else {
			writeError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "invalid batch payload")
			return
		}
	}

	type importResult struct {
		item *Item
		err  error
	}

	itemsLen := len(batchPayload.Items)
	results := make([]importResult, itemsLen)
	var wg sync.WaitGroup
	sem := make(chan struct{}, 6) // concurrency limiter

	for idx, req := range batchPayload.Items {
		wg.Add(1)
		go func(i int, itReq ItemImportRequest) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			opts := itReq.ToOptions()
			// Merge shared batch folder IDs
			if strings.TrimSpace(batchPayload.FolderID) != "" {
				opts.FolderIDs = append(opts.FolderIDs, strings.TrimSpace(batchPayload.FolderID))
			}
			opts.FolderIDs = append(opts.FolderIDs, batchPayload.FolderIDs...)
			opts.Tags = append(opts.Tags, batchPayload.Tags...)

			var imported *Item
			var err error
			rawB64 := itReq.Base64
			if rawB64 == "" {
				rawB64 = itReq.Data
			}

			if rawB64 != "" {
				fn := opts.Name
				if fn == "" {
					fn = fmt.Sprintf("clip_%d_%d.png", time.Now().Unix(), i)
				}
				imported, err = s.manager.ImportFromBase64WithOptions(fn, rawB64, opts)
			} else if strings.TrimSpace(itReq.URL) != "" {
				imported, err = s.manager.ImportFromURLWithOptions(itReq.URL, opts)
			} else {
				err = fmt.Errorf("item #%d has neither url nor base64", i)
			}

			results[i] = importResult{item: imported, err: err}
		}(idx, req)
	}

	wg.Wait()

	var successItems []Item
	var failedCount int
	for _, res := range results {
		if res.err == nil && res.item != nil {
			successItems = append(successItems, *res.item)
		} else {
			failedCount++
		}
	}

	writeSuccess(w, map[string]any{
		"total":   itemsLen,
		"success": len(successItems),
		"failed":  failedCount,
		"items":   successItems,
	})
}

// handleAPIItemList lists items in the active library.
func (s *AssetServer) handleAPIItemList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	if s.manager == nil || s.manager.GetActiveLibrary() == nil {
		writeError(w, http.StatusServiceUnavailable, ErrCodeNoActiveLibrary, "no active library")
		return
	}

	q := r.URL.Query().Get("q")
	sortOrder := r.URL.Query().Get("sortOrder")
	items, err := s.manager.GetItems(q, sortOrder)
	if err != nil {
		writeAppError(w, http.StatusInternalServerError, err)
		return
	}
	if items == nil {
		items = []Item{}
	}
	writeSuccess(w, items)
}

// handleAPIPluginsList returns the list of installed plugins and their enabled status.
func (s *AssetServer) handleAPIPluginsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	var plugins []InstalledPlugin
	if s.manager != nil && s.manager.GetPluginManager() != nil {
		var err error
		plugins, err = s.manager.GetPluginManager().ListInstalledPlugins()
		if err != nil {
			writeError(w, http.StatusInternalServerError, ErrCodeUnknown, err.Error())
			return
		}
	}
	if plugins == nil {
		plugins = []InstalledPlugin{}
	}
	writeSuccess(w, plugins)
}

// APIPluginInstallRequest represents payload requesting plugin installation.
type APIPluginInstallRequest struct {
	ManifestURL string `json:"manifestUrl"`
	ID          string `json:"id"`
	Version     string `json:"version"`
	Name        string `json:"name"`
}

// handleAPIPluginInstall only emits an install request event to the desktop application
// to show the manual confirmation dialog. Auto-installation is strictly disallowed.
func (s *AssetServer) handleAPIPluginInstall(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	var req APIPluginInstallRequest
	if r.Header.Get("Content-Type") == "application/json" || r.ContentLength > 0 {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	if req.ManifestURL == "" {
		req.ManifestURL = r.URL.Query().Get("manifestUrl")
		if req.ManifestURL == "" {
			req.ManifestURL = r.URL.Query().Get("manifest")
		}
	}
	if req.ID == "" {
		req.ID = r.URL.Query().Get("id")
	}
	if req.Version == "" {
		req.Version = r.URL.Query().Get("version")
	}
	if req.Name == "" {
		req.Name = r.URL.Query().Get("name")
	}

	if req.ManifestURL == "" {
		writeError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "manifestUrl is required")
		return
	}

	RecordLog("info", "plugin", fmt.Sprintf("Received plugin install request: id=%s, version=%s, manifestUrl=%s", req.ID, req.Version, req.ManifestURL), fmt.Sprintf("remoteAddr=%s", r.RemoteAddr), 0)
	// Emit event and open Settings window for explicit manual user confirmation
	if s.manager != nil {
		if pm := s.manager.GetPluginManager(); pm != nil {
			pm.SetPendingInstall(&PluginInstallRequest{
				ManifestURL: req.ManifestURL,
				ID:          req.ID,
				Version:     req.Version,
				Name:        req.Name,
			})
		}
		if app := s.manager.GetApp(); app != nil {
			_ = OpenSettingsWindowWithApp(app)
			app.Event.Emit("plugin:install-requested", map[string]any{
				"manifestUrl": req.ManifestURL,
				"id":          req.ID,
				"version":     req.Version,
				"name":        req.Name,
			})
		}
	}

	// Auto-installation is strictly disallowed; always respond with requested: true
	writeSuccess(w, map[string]any{
		"requested":   true,
		"manifestUrl": req.ManifestURL,
		"id":          req.ID,
		"version":     req.Version,
		"name":        req.Name,
	})
}

// handleAPIPluginConfirmInstall executes plugin download and installation only after
// the user has explicitly confirmed the installation in the desktop application.
func (s *AssetServer) handleAPIPluginConfirmInstall(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		ManifestURL string `json:"manifestUrl"`
	}
	if r.Header.Get("Content-Type") == "application/json" || r.ContentLength > 0 {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	if req.ManifestURL == "" {
		req.ManifestURL = r.URL.Query().Get("manifestUrl")
		if req.ManifestURL == "" {
			req.ManifestURL = r.URL.Query().Get("manifest")
		}
	}

	if req.ManifestURL == "" {
		writeError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "manifestUrl is required")
		return
	}

	RecordLog("info", "plugin", fmt.Sprintf("User confirmed plugin installation: manifestUrl=%s", req.ManifestURL), fmt.Sprintf("remoteAddr=%s", r.RemoteAddr), 0)

	if s.manager == nil || s.manager.GetPluginManager() == nil {
		writeError(w, http.StatusServiceUnavailable, ErrCodeUnknown, "plugin manager not initialized")
		return
	}

	installed, err := s.manager.GetPluginManager().InstallPluginFromURL(req.ManifestURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrCodePluginInstallFailed, err.Error())
		return
	}

	writeSuccess(w, installed)
}

// handleAPIPluginUninstall handles plugin uninstallation request.
func (s *AssetServer) handleAPIPluginUninstall(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		ID string `json:"id"`
	}
	if r.Header.Get("Content-Type") == "application/json" || r.ContentLength > 0 {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	if req.ID == "" {
		req.ID = r.URL.Query().Get("id")
	}
	if req.ID == "" {
		writeError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "id is required")
		return
	}

	if s.manager != nil && s.manager.GetPluginManager() != nil {
		if err := s.manager.GetPluginManager().UninstallPlugin(req.ID); err != nil {
			writeError(w, http.StatusInternalServerError, ErrCodeUnknown, err.Error())
			return
		}
	}

	writeSuccess(w, map[string]any{"uninstalled": true, "id": req.ID})
}

// handleAPIPluginsCheckUpdates triggers grouped batch update check across marketplaces.
func (s *AssetServer) handleAPIPluginsCheckUpdates(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	if s.manager == nil || s.manager.GetPluginManager() == nil {
		writeSuccess(w, []PluginUpdateInfo{})
		return
	}

	updates, err := s.manager.GetPluginManager().CheckPluginUpdates()
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrCodeUnknown, err.Error())
		return
	}
	if updates == nil {
		updates = []PluginUpdateInfo{}
	}
	writeSuccess(w, updates)
}

// handleAPIPluginUpgrade upgrades an installed plugin to its latest available version.
func (s *AssetServer) handleAPIPluginUpgrade(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		ID string `json:"id"`
	}
	if r.Header.Get("Content-Type") == "application/json" || r.ContentLength > 0 {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	if req.ID == "" {
		req.ID = r.URL.Query().Get("id")
	}
	if req.ID == "" {
		writeError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "id is required")
		return
	}

	if s.manager == nil || s.manager.GetPluginManager() == nil {
		writeError(w, http.StatusServiceUnavailable, ErrCodeUnknown, "plugin manager not initialized")
		return
	}

	updated, err := s.manager.GetPluginManager().UpgradePlugin(req.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrCodePluginInstallFailed, err.Error())
		return
	}

	writeSuccess(w, updated)
}

func (s *AssetServer) handleAPISystemPaths(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}
	pluginsDir := filepath.Join(UserDataDir(), "plugins")
	if s.manager != nil && s.manager.GetPluginManager() != nil {
		pluginsDir = s.manager.GetPluginManager().GetBaseDir()
	}
	writeSuccess(w, map[string]string{
		"userDataDir": UserDataDir(),
		"pluginsDir":  pluginsDir,
	})
}

func (s *AssetServer) handleAPIOpenUserData(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}
	dir := UserDataDir()
	_ = os.MkdirAll(dir, 0755)
	var err error
	switch runtime.GOOS {
	case "darwin":
		err = exec.Command("open", dir).Start()
	case "windows":
		err = exec.Command("explorer.exe", dir).Start()
	default:
		err = exec.Command("xdg-open", dir).Start()
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrCodeUnknown, err.Error())
		return
	}
	writeSuccess(w, map[string]any{"opened": true, "path": dir})
}

func (s *AssetServer) handleAPIOpenPlugins(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}
	dir := filepath.Join(UserDataDir(), "plugins")
	if s.manager != nil && s.manager.GetPluginManager() != nil {
		dir = s.manager.GetPluginManager().GetBaseDir()
	}
	_ = os.MkdirAll(dir, 0755)
	var err error
	switch runtime.GOOS {
	case "darwin":
		err = exec.Command("open", dir).Start()
	case "windows":
		err = exec.Command("explorer.exe", dir).Start()
	default:
		err = exec.Command("xdg-open", dir).Start()
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrCodeUnknown, err.Error())
		return
	}
	writeSuccess(w, map[string]any{"opened": true, "path": dir})
}

// handleAPINetworkSettings handles GET and POST requests for network/proxy configuration.
func (s *AssetServer) handleAPINetworkSettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		var settings NetworkSettings
		if s.manager != nil && s.manager.userData != nil {
			settings = s.manager.userData.GetNetworkSettings()
		} else {
			settings = NetworkSettings{ProxyMode: ProxyModeSystem}
		}
		writeSuccess(w, settings)

	case http.MethodPost:
		var settings NetworkSettings
		if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
			writeError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "invalid JSON: "+err.Error())
			return
		}

		mode := strings.ToLower(strings.TrimSpace(settings.ProxyMode))
		if mode == "" {
			mode = ProxyModeSystem
		}
		if !IsValidProxyMode(mode) {
			writeError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "invalid proxyMode: "+settings.ProxyMode)
			return
		}
		settings.ProxyMode = mode

		if mode == ProxyModeCustom {
			norm, err := NormalizeProxyURL(settings.CustomProxy)
			if err != nil {
				writeError(w, http.StatusBadRequest, ErrCodeInvalidRequest, err.Error())
				return
			}
			settings.CustomProxy = norm
		}

		if s.manager != nil {
			if err := s.manager.SetNetworkSettings(settings); err != nil {
				writeError(w, http.StatusInternalServerError, ErrCodeUnknown, err.Error())
				return
			}
		}

		RecordLog("info", "network", fmt.Sprintf("Network settings updated via API: mode=%s, customProxy=%s", settings.ProxyMode, settings.CustomProxy), "", 0)

		if app := s.manager.GetApp(); app != nil {
			app.Event.Emit(NetworkSettingsChangedEvent, settings)
		}
		writeSuccess(w, settings)

	default:
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
	}
}

// handleAPINetworkTest conducts a live connectivity test to the target URL through proxy settings.
func (s *AssetServer) handleAPINetworkTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		TargetURL   string `json:"targetUrl"`
		ProxyMode   string `json:"proxyMode,omitempty"`
		CustomProxy string `json:"customProxy,omitempty"`
	}
	if r.Header.Get("Content-Type") == "application/json" || r.ContentLength > 0 {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	var settings NetworkSettings
	if req.ProxyMode != "" {
		settings = NetworkSettings{
			ProxyMode:   req.ProxyMode,
			CustomProxy: req.CustomProxy,
		}
	} else if s.manager != nil && s.manager.userData != nil {
		settings = s.manager.userData.GetNetworkSettings()
	} else {
		settings = NetworkSettings{ProxyMode: ProxyModeSystem}
	}

	result := TestNetworkConnectivity(settings, req.TargetURL, 10*time.Second)
	writeSuccess(w, result)
}
