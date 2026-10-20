package core

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

var (
	validPluginIDRegex = regexp.MustCompile(`^[a-zA-Z0-9_\-.]+$`)
)

// PluginManifest defines the schema for remote Bowerbird plugin manifests.
type PluginManifest struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Version      string   `json:"version"`
	Description  string   `json:"description"`
	Author       string   `json:"author"`
	Kind         string   `json:"kind"` // "preview" | "metadata"
	Priority     int      `json:"priority"`
	Extensions   []string `json:"extensions"`
	MimePrefixes []string `json:"mimePrefixes,omitempty"`
	SupportsZoom bool     `json:"supportsZoom,omitempty"`
	Main         string   `json:"main,omitempty"` // default "index.js"
	Style        string   `json:"style,omitempty"`
	Icon         string   `json:"icon,omitempty"`
	Homepage     string   `json:"homepage,omitempty"`
	Repository   string   `json:"repository,omitempty"`
	License      string   `json:"license,omitempty"`
	DownloadURL  string   `json:"downloadUrl,omitempty"`
}

// InstalledPlugin represents an installed plugin persisted in installed.json.
type InstalledPlugin struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Version        string   `json:"version"`
	Description    string   `json:"description"`
	Author         string   `json:"author"`
	Kind           string   `json:"kind"`
	Priority       int      `json:"priority"`
	Extensions     []string `json:"extensions"`
	MimePrefixes   []string `json:"mimePrefixes,omitempty"`
	SupportsZoom   bool     `json:"supportsZoom,omitempty"`
	Main           string   `json:"main"`
	Style          string   `json:"style,omitempty"`
	Enabled        bool     `json:"enabled"`
	InstalledAt    string   `json:"installedAt"`
	SourceURL      string   `json:"sourceUrl"`
	MarketplaceURL string   `json:"marketplaceUrl,omitempty"`
	UpdateURL      string   `json:"updateUrl,omitempty"`
}

// PluginInstallRequest represents a requested plugin installation.
type PluginInstallRequest struct {
	ManifestURL string `json:"manifestUrl"`
	ID          string `json:"id"`
	Version     string `json:"version"`
	Name        string `json:"name"`
}

// PluginUpdateInfo represents available update details for an installed plugin.
type PluginUpdateInfo struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	CurrentVersion string   `json:"currentVersion"`
	LatestVersion  string   `json:"latestVersion"`
	HasUpdate      bool     `json:"hasUpdate"`
	ManifestURL    string   `json:"manifestUrl"`
	DownloadURL    string   `json:"downloadUrl,omitempty"`
	MarketplaceURL string   `json:"marketplaceUrl,omitempty"`
	Changelog      []string `json:"changelog,omitempty"`
}

// BatchCheckUpdateRequest represents batch payload sent to a marketplace.
type BatchCheckUpdateRequest struct {
	Plugins []PluginCheckItem `json:"plugins"`
}

// PluginCheckItem represents individual plugin query in a batch update request.
type PluginCheckItem struct {
	ID      string `json:"id"`
	Version string `json:"version"`
}

// BatchCheckUpdateResponse represents response from a marketplace update check endpoint.
type BatchCheckUpdateResponse struct {
	Updates []PluginUpdateInfo `json:"updates"`
}

// PluginManager manages plugin installation, validation, storage, and persistence.
type PluginManager struct {
	mu              sync.RWMutex
	baseDir         string // <UserDataDir>/plugins
	indexPath       string // <UserDataDir>/plugins/installed.json
	plugins         map[string]*InstalledPlugin
	pendingInstall  *PluginInstallRequest
	httpClient      *http.Client
	host            Host
	hostMu          sync.RWMutex
	networkSettings NetworkSettings
}

// NewPluginManager creates a PluginManager with default path in UserDataDir()/plugins.
func NewPluginManager() *PluginManager {
	return NewPluginManagerWithDir(filepath.Join(UserDataDir(), "plugins"))
}

// NewPluginManagerWithDir creates a PluginManager rooted at a custom directory.
func NewPluginManagerWithDir(baseDir string) *PluginManager {
	pm := &PluginManager{
		baseDir:         baseDir,
		indexPath:       filepath.Join(baseDir, "installed.json"),
		plugins:         make(map[string]*InstalledPlugin),
		networkSettings: NetworkSettings{ProxyMode: ProxyModeSystem},
		httpClient: &http.Client{
			Timeout:   60 * time.Second,
			Transport: CreateProxyTransport(NetworkSettings{ProxyMode: ProxyModeSystem}),
		},
	}
	_ = os.MkdirAll(baseDir, 0755)
	pm.loadIndexLocked()
	pm.scanLocalPluginsLocked()
	return pm
}

// SetHost sets the desktop shell used for event emission.
func (pm *PluginManager) SetHost(host Host) {
	pm.hostMu.Lock()
	pm.host = host
	pm.hostMu.Unlock()
}

// emit forwards an event to the host when one is attached. It uses hostMu,
// not pm.mu: callers emit while holding pm.mu.
func (pm *PluginManager) emit(name string, payload any) {
	pm.hostMu.RLock()
	host := pm.host
	pm.hostMu.RUnlock()
	if host != nil {
		host.Emit(name, payload)
	}
}

// UpdateNetworkSettings updates the proxy configuration used for plugin downloads and update checks.
func (pm *PluginManager) UpdateNetworkSettings(settings NetworkSettings) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.networkSettings = settings
	if pm.httpClient != nil {
		pm.httpClient.Transport = CreateProxyTransport(settings)
	}
}

// GetNetworkSettings returns the current network/proxy settings of the plugin manager.
func (pm *PluginManager) GetNetworkSettings() NetworkSettings {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	return pm.networkSettings
}

// getProxyDescription returns a human-readable description of the proxy used for targetURL.
func (pm *PluginManager) getProxyDescription(targetURL string) string {
	pm.mu.RLock()
	settings := pm.networkSettings
	pm.mu.RUnlock()

	desc, err := ResolveActiveProxy(settings, targetURL)
	if err != nil {
		return fmt.Sprintf("error resolving proxy: %v", err)
	}
	return desc
}

// SetPendingInstall records a pending installation request for the Settings window to consume.
func (pm *PluginManager) SetPendingInstall(req *PluginInstallRequest) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.pendingInstall = req
}

// GetPendingInstall returns the current pending installation request.
func (pm *PluginManager) GetPendingInstall() *PluginInstallRequest {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	if pm.pendingInstall == nil {
		return nil
	}
	copyReq := *pm.pendingInstall
	return &copyReq
}

// ClearPendingInstall clears the pending installation request.
func (pm *PluginManager) ClearPendingInstall() {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.pendingInstall = nil
}

// GetBaseDir returns the base plugins directory.
func (pm *PluginManager) GetBaseDir() string {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	return pm.baseDir
}

// GetPluginDir returns the absolute directory for a specific plugin.
func (pm *PluginManager) GetPluginDir(id string) string {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	return filepath.Join(pm.baseDir, id)
}

// ValidateManifest validates plugin manifest fields and prevents path traversal.
func ValidateManifest(m *PluginManifest) error {
	if m == nil {
		return errors.New("manifest is nil")
	}
	id := strings.TrimSpace(m.ID)
	if id == "" {
		return errors.New("missing or empty plugin id")
	}
	if !validPluginIDRegex.MatchString(id) {
		return fmt.Errorf("invalid plugin id %q: only alphanumeric, dots, dashes, and underscores allowed", id)
	}
	if strings.Contains(id, "..") {
		return errors.New("plugin id cannot contain path traversal")
	}
	m.ID = id

	if strings.TrimSpace(m.Name) == "" {
		return errors.New("missing or empty plugin name")
	}
	if strings.TrimSpace(m.Version) == "" {
		return errors.New("missing or empty plugin version")
	}
	if strings.TrimSpace(m.Author) == "" {
		return errors.New("missing or empty plugin author")
	}
	if m.Kind != "preview" && m.Kind != "metadata" {
		return fmt.Errorf("invalid kind %q: must be 'preview' or 'metadata'", m.Kind)
	}
	if m.Priority < 0 || m.Priority > 100 {
		return fmt.Errorf("invalid priority %d: must be between 0 and 100", m.Priority)
	}
	if m.Priority == 0 {
		m.Priority = 50
	}

	if m.Main == "" {
		m.Main = "index.js"
	}
	cleanMain := filepath.Clean(m.Main)
	if strings.HasPrefix(cleanMain, "..") || filepath.IsAbs(cleanMain) || strings.HasPrefix(cleanMain, "/") || strings.HasPrefix(cleanMain, "\\") {
		return fmt.Errorf("invalid main file path %q: path traversal or absolute paths not allowed", m.Main)
	}
	m.Main = filepath.ToSlash(cleanMain)

	if m.Style != "" {
		cleanStyle := filepath.Clean(m.Style)
		if strings.HasPrefix(cleanStyle, "..") || filepath.IsAbs(cleanStyle) || strings.HasPrefix(cleanStyle, "/") || strings.HasPrefix(cleanStyle, "\\") {
			return fmt.Errorf("invalid style file path %q: path traversal or absolute paths not allowed", m.Style)
		}
		m.Style = filepath.ToSlash(cleanStyle)
	}

	normExtensions := make([]string, 0, len(m.Extensions))
	for _, ext := range m.Extensions {
		cleaned := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(ext), "."))
		if cleaned != "" {
			normExtensions = append(normExtensions, cleaned)
		}
	}
	m.Extensions = normExtensions

	return nil
}

// loadIndexLocked reads installed.json if present.
func (pm *PluginManager) loadIndexLocked() {
	data, err := os.ReadFile(pm.indexPath)
	if err != nil {
		return
	}

	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 {
		return
	}

	var list []InstalledPlugin
	if trimmed[0] == '[' {
		if err := json.Unmarshal(trimmed, &list); err != nil {
			return
		}
	} else if trimmed[0] == '{' {
		var wrapper struct {
			Plugins []InstalledPlugin `json:"plugins"`
		}
		if err := json.Unmarshal(trimmed, &wrapper); err == nil {
			list = wrapper.Plugins
		}
	}

	for _, p := range list {
		copyP := p
		pm.plugins[copyP.ID] = &copyP
	}
}

// saveIndexLocked atomically writes installed.json.
func (pm *PluginManager) saveIndexLocked() error {
	list := make([]InstalledPlugin, 0, len(pm.plugins))
	for _, p := range pm.plugins {
		list = append(list, *p)
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].Priority != list[j].Priority {
			return list[i].Priority > list[j].Priority
		}
		return list[i].ID < list[j].ID
	})

	bytesData, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}

	tmpFile := fmt.Sprintf("%s.tmp.%d", pm.indexPath, time.Now().UnixNano())
	if err := os.WriteFile(tmpFile, bytesData, 0644); err != nil {
		return err
	}

	if runtime.GOOS == "windows" {
		_ = os.Remove(pm.indexPath)
	}
	return os.Rename(tmpFile, pm.indexPath)
}

// ListInstalledPlugins returns a list of installed plugins.
func (pm *PluginManager) ListInstalledPlugins() ([]InstalledPlugin, error) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	return pm.listInstalledPluginsLocked(), nil
}

func (pm *PluginManager) listInstalledPluginsLocked() []InstalledPlugin {
	result := make([]InstalledPlugin, 0, len(pm.plugins))
	for _, p := range pm.plugins {
		result = append(result, *p)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Priority != result[j].Priority {
			return result[i].Priority > result[j].Priority
		}
		return result[i].ID < result[j].ID
	})
	return result
}

// scanLocalPluginsLocked scans baseDir for manually placed plugin folders,
// validates manifests, registers new plugins as disabled by default,
// cleans up removed plugins, and saves installed.json.
func (pm *PluginManager) scanLocalPluginsLocked() bool {
	entries, err := os.ReadDir(pm.baseDir)
	if err != nil {
		return false
	}

	changed := false
	seenIDs := make(map[string]bool)

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}

		pluginFolder := filepath.Join(pm.baseDir, name)
		manifestPath := filepath.Join(pluginFolder, "manifest.json")
		manifestBytes, err := os.ReadFile(manifestPath)
		if err != nil {
			continue
		}

		var m PluginManifest
		if err := json.Unmarshal(manifestBytes, &m); err != nil {
			RecordLog("warn", "plugin", fmt.Sprintf("Ignored invalid manifest in %s: %v", name, err), "", 0)
			continue
		}

		if err := ValidateManifest(&m); err != nil {
			RecordLog("warn", "plugin", fmt.Sprintf("Manifest validation failed for %s: %v", name, err), "", 0)
			continue
		}

		// Verify main entry file exists
		mainFile := filepath.Join(pluginFolder, filepath.FromSlash(m.Main))
		if info, err := os.Stat(mainFile); err != nil || info.IsDir() {
			RecordLog("warn", "plugin", fmt.Sprintf("Plugin main entry %q not found in %s", m.Main, name), "", 0)
			continue
		}

		// Verify style file if defined
		if m.Style != "" {
			styleFile := filepath.Join(pluginFolder, filepath.FromSlash(m.Style))
			if info, err := os.Stat(styleFile); err != nil || info.IsDir() {
				RecordLog("warn", "plugin", fmt.Sprintf("Plugin style file %q not found in %s", m.Style, name), "", 0)
				continue
			}
		}

		seenIDs[m.ID] = true

		if existing, found := pm.plugins[m.ID]; found {
			// Update metadata if changed on disk
			if existing.Name != m.Name || existing.Version != m.Version ||
				existing.Description != m.Description || existing.Author != m.Author ||
				existing.Priority != m.Priority || existing.Main != m.Main || existing.Style != m.Style {
				existing.Name = m.Name
				existing.Version = m.Version
				existing.Description = m.Description
				existing.Author = m.Author
				existing.Priority = m.Priority
				existing.Extensions = m.Extensions
				existing.MimePrefixes = m.MimePrefixes
				existing.SupportsZoom = m.SupportsZoom
				existing.Main = m.Main
				existing.Style = m.Style
				changed = true
			}
		} else {
			// Newly discovered manual plugin: register as disabled by default
			installed := &InstalledPlugin{
				ID:           m.ID,
				Name:         m.Name,
				Version:      m.Version,
				Description:  m.Description,
				Author:       m.Author,
				Kind:         m.Kind,
				Priority:     m.Priority,
				Extensions:   m.Extensions,
				MimePrefixes: m.MimePrefixes,
				SupportsZoom: m.SupportsZoom,
				Main:         m.Main,
				Style:        m.Style,
				Enabled:      false, // 默认禁用 per user requirement
				InstalledAt:  time.Now().UTC().Format(time.RFC3339),
				SourceURL:    "manual",
			}
			pm.plugins[m.ID] = installed
			changed = true
			RecordLog("info", "plugin", fmt.Sprintf("Discovered manual plugin %q (v%s, id: %s) in directory %s, registered as disabled", m.Name, m.Version, m.ID, name), pluginFolder, 0)
		}
	}

	// Remove index entries for plugins whose directories no longer exist on disk
	for id := range pm.plugins {
		if !seenIDs[id] {
			pluginDir := filepath.Join(pm.baseDir, id)
			if _, err := os.Stat(pluginDir); os.IsNotExist(err) {
				delete(pm.plugins, id)
				changed = true
				RecordLog("info", "plugin", fmt.Sprintf("Removed orphaned plugin %q from index: directory %s no longer exists", id, pluginDir), "", 0)
			}
		}
	}

	if changed {
		_ = pm.saveIndexLocked()
	}
	return changed
}

// ScanLocalPlugins scans the plugin directory for manually dropped plugins and updates the index.
func (pm *PluginManager) ScanLocalPlugins() ([]InstalledPlugin, error) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	changed := pm.scanLocalPluginsLocked()
	if changed {
		pm.emit("plugin:changed", map[string]any{
			"action": "scanned",
		})
	}
	return pm.listInstalledPluginsLocked(), nil
}

// GetInstalledPlugin returns details of an installed plugin by ID.
func (pm *PluginManager) GetInstalledPlugin(id string) (*InstalledPlugin, error) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	p, exists := pm.plugins[id]
	if !exists {
		return nil, fmt.Errorf("plugin %q not found", id)
	}
	copyP := *p
	return &copyP, nil
}

// InstallPlugin is an alias for InstallPluginFromURL.
func (pm *PluginManager) InstallPlugin(pluginURL string) (*InstalledPlugin, error) {
	return pm.InstallPluginFromURL(pluginURL)
}

// InstallPluginFromURL downloads, extracts, validates, and installs a plugin atomically.
func (pm *PluginManager) InstallPluginFromURL(pluginURL string) (*InstalledPlugin, error) {
	startTotal := time.Now()
	proxyDesc := pm.getProxyDescription(pluginURL)

	RecordLog("info", "plugin", fmt.Sprintf("Starting plugin installation from URL: %s", pluginURL),
		fmt.Sprintf("proxy=%s", proxyDesc), 0)

	if strings.TrimSpace(pluginURL) == "" {
		err := errors.New("plugin URL is required")
		RecordLog("error", "plugin", "Plugin installation aborted: empty plugin URL", "", 0)
		return nil, err
	}

	// Phase 1: Staging directory creation
	stagingName := fmt.Sprintf(".staging-%d-%d", time.Now().UnixNano(), os.Getpid())
	stagingDir := filepath.Join(pm.baseDir, stagingName)
	if err := os.MkdirAll(stagingDir, 0755); err != nil {
		RecordLog("error", "plugin", fmt.Sprintf("[Phase 1/5] Failed to create staging directory: %v", err), stagingDir, 0)
		return nil, fmt.Errorf("failed to create staging directory: %w", err)
	}
	RecordLog("info", "plugin", fmt.Sprintf("[Phase 1/5] Created staging directory: %s", stagingName), stagingDir, 0)
	defer func() {
		_ = os.RemoveAll(stagingDir)
	}()

	// Phase 2: Download & Extraction
	RecordLog("info", "plugin", fmt.Sprintf("[Phase 2/5] Downloading plugin from %s (proxy: %s)", pluginURL, proxyDesc), "", 0)
	manifest, err := pm.downloadAndExtract(pluginURL, stagingDir)
	if err != nil {
		// Fallback for official plugins: if marketplace worker endpoint fails, try official GitHub releases
		if pID := extractPluginIDFromURL(pluginURL); pID != "" {
			RecordLog("info", "plugin", fmt.Sprintf("Primary download failed for %s (%v), attempting fallback from official GitHub releases...", pID, err), "", 0)
			fallbackCandidates := []string{
				fmt.Sprintf("https://github.com/owocc/bowerbird-plugins/releases/download/plugins-latest/%s-v1.0.0.zip", pID),
				fmt.Sprintf("https://github.com/owocc/bowerbird-plugins/releases/download/plugins-latest/%s-v1.0.0-alpha.zip", pID),
				fmt.Sprintf("https://raw.githubusercontent.com/owocc/bowerbird-plugins/main/repo/%s/manifest.json", pID),
			}
			for _, candURL := range fallbackCandidates {
				if fbManifest, fbErr := pm.downloadAndExtract(candURL, stagingDir); fbErr == nil {
					manifest = fbManifest
					err = nil
					RecordLog("info", "plugin", fmt.Sprintf("Fallback installation succeeded via %s", candURL), "", 0)
					break
				}
			}
		}
	}
	if err != nil {
		elapsed := time.Since(startTotal).Milliseconds()
		RecordLog("error", "plugin", fmt.Sprintf("[Phase 2/5] Plugin download/extraction failed: %v", err),
			fmt.Sprintf("url=%s, proxy=%s, elapsed=%dms", pluginURL, proxyDesc, elapsed), elapsed)
		return nil, fmt.Errorf("failed to download plugin: %w", err)
	}

	// Phase 3: Manifest & Files Validation
	RecordLog("info", "plugin", fmt.Sprintf("[Phase 3/5] Validating plugin manifest: id=%s, name=%q, version=%s", manifest.ID, manifest.Name, manifest.Version), "", 0)
	if err := ValidateManifest(manifest); err != nil {
		RecordLog("error", "plugin", fmt.Sprintf("[Phase 3/5] Plugin manifest validation failed for %s: %v", manifest.ID, err), "", 0)
		return nil, fmt.Errorf("invalid plugin manifest: %w", err)
	}

	// Verify main entry file exists in stagingDir
	mainPath := filepath.Join(stagingDir, filepath.FromSlash(manifest.Main))
	if info, err := os.Stat(mainPath); err != nil || info.IsDir() {
		RecordLog("error", "plugin", fmt.Sprintf("[Phase 3/5] Plugin main file check failed: %q (err: %v)", manifest.Main, err), "", 0)
		return nil, fmt.Errorf("plugin main file %q not found or is a directory", manifest.Main)
	}

	// Verify style file if specified
	if manifest.Style != "" {
		stylePath := filepath.Join(stagingDir, filepath.FromSlash(manifest.Style))
		if info, err := os.Stat(stylePath); err != nil || info.IsDir() {
			RecordLog("error", "plugin", fmt.Sprintf("[Phase 3/5] Plugin style file check failed: %q (err: %v)", manifest.Style, err), "", 0)
			return nil, fmt.Errorf("plugin style file %q not found", manifest.Style)
		}
	}
	RecordLog("info", "plugin", fmt.Sprintf("[Phase 3/5] Plugin validation passed: %s (main: %s, style: %s)", manifest.ID, manifest.Main, manifest.Style), "", 0)

	destDir := filepath.Join(pm.baseDir, manifest.ID)

	pm.mu.Lock()
	defer pm.mu.Unlock()

	// Phase 4: Atomic directory swap
	RecordLog("info", "plugin", fmt.Sprintf("[Phase 4/5] Deploying plugin files to destination: %s", destDir), "", 0)
	if _, err := os.Stat(destDir); err == nil {
		_ = os.RemoveAll(destDir)
	}
	if err := os.Rename(stagingDir, destDir); err != nil {
		RecordLog("error", "plugin", fmt.Sprintf("[Phase 4/5] Failed to move plugin directory to %s: %v", destDir, err), "", 0)
		return nil, fmt.Errorf("failed to move plugin to destination directory: %w", err)
	}

	// Phase 5: Registration & Persistence
	RecordLog("info", "plugin", fmt.Sprintf("[Phase 5/5] Registering plugin in installed.json: %s (v%s)", manifest.ID, manifest.Version), "", 0)
	installed := &InstalledPlugin{
		ID:             manifest.ID,
		Name:           manifest.Name,
		Version:        manifest.Version,
		Description:    manifest.Description,
		Author:         manifest.Author,
		Kind:           manifest.Kind,
		Priority:       manifest.Priority,
		Extensions:     manifest.Extensions,
		MimePrefixes:   manifest.MimePrefixes,
		SupportsZoom:   manifest.SupportsZoom,
		Main:           manifest.Main,
		Style:          manifest.Style,
		Enabled:        true,
		InstalledAt:    time.Now().UTC().Format(time.RFC3339),
		SourceURL:      pluginURL,
		MarketplaceURL: extractMarketplaceURL(pluginURL),
		UpdateURL:      pluginURL,
	}

	pm.plugins[manifest.ID] = installed
	if err := pm.saveIndexLocked(); err != nil {
		RecordLog("error", "plugin", fmt.Sprintf("[Phase 5/5] Failed to save installed.json: %v", err), "", 0)
		return nil, fmt.Errorf("failed to save installed.json: %w", err)
	}

	pm.emit("plugin:changed", map[string]any{
		"action": "installed",
		"id":     manifest.ID,
	})

	totalDuration := time.Since(startTotal).Milliseconds()
	RecordLog("info", "plugin", fmt.Sprintf("Plugin %q (v%s, id: %s) installed successfully in %dms", manifest.Name, manifest.Version, manifest.ID, totalDuration),
		fmt.Sprintf("dir=%s, proxy=%s, source=%s", destDir, proxyDesc, pluginURL), totalDuration)

	copyP := *installed
	return &copyP, nil
}

// downloadAndExtract handles both zip bundle archives and standalone JSON manifests.
func (pm *PluginManager) downloadAndExtract(rawURL string, stagingDir string) (*PluginManifest, error) {
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("invalid URL: %w", err)
	}

	var bodyBytes []byte
	if parsedURL.Scheme == "file" {
		filePath := parsedURL.Path
		if runtime.GOOS == "windows" && strings.HasPrefix(filePath, "/") {
			filePath = strings.TrimPrefix(filePath, "/")
		}
		RecordLog("info", "plugin", fmt.Sprintf("Reading local plugin package from file: %s", filePath), "", 0)
		data, err := os.ReadFile(filePath)
		if err != nil {
			RecordLog("error", "plugin", fmt.Sprintf("Failed reading local plugin package %s: %v", filePath, err), "", 0)
			return nil, err
		}
		bodyBytes = data
	} else {
		proxyDesc := pm.getProxyDescription(rawURL)
		req, err := http.NewRequest(http.MethodGet, rawURL, nil)
		if err != nil {
			RecordLog("error", "plugin", fmt.Sprintf("Failed building HTTP request for %s: %v", rawURL, err), "", 0)
			return nil, err
		}
		req.Header.Set("User-Agent", "Bowerbird-Plugin-Installer/1.0")

		RecordLog("info", "plugin", fmt.Sprintf("Sending HTTP GET %s (via %s)", rawURL, proxyDesc), "", 0)
		dlStart := time.Now()
		resp, err := pm.httpClient.Do(req)
		dlDuration := time.Since(dlStart).Milliseconds()
		if err != nil {
			RecordLog("error", "plugin", fmt.Sprintf("Network connection to %s failed: %v", rawURL, err),
				fmt.Sprintf("proxy=%s, duration=%dms", proxyDesc, dlDuration), dlDuration)
			return nil, fmt.Errorf("%w (proxy: %s)", err, proxyDesc)
		}
		defer resp.Body.Close()

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			RecordLog("error", "plugin", fmt.Sprintf("Server returned HTTP %d %s for %s", resp.StatusCode, resp.Status, rawURL),
				fmt.Sprintf("proxy=%s, duration=%dms", proxyDesc, dlDuration), dlDuration)
			return nil, fmt.Errorf("HTTP error %d downloading plugin from %s", resp.StatusCode, rawURL)
		}

		data, err := io.ReadAll(resp.Body)
		if err != nil {
			RecordLog("error", "plugin", fmt.Sprintf("Failed reading response stream from %s: %v", rawURL, err), "", 0)
			return nil, err
		}
		bodyBytes = data
		RecordLog("info", "plugin", fmt.Sprintf("Downloaded %d bytes from %s in %dms", len(bodyBytes), rawURL, dlDuration), "", dlDuration)
	}

	// Check if this payload is a zip archive
	isZip := strings.HasSuffix(strings.ToLower(parsedURL.Path), ".zip") ||
		(len(bodyBytes) >= 4 && bodyBytes[0] == 0x50 && bodyBytes[1] == 0x4B && bodyBytes[2] == 0x03 && bodyBytes[3] == 0x04)

	if isZip {
		RecordLog("info", "plugin", fmt.Sprintf("Detected ZIP bundle archive (%d bytes), unzipping...", len(bodyBytes)), "", 0)
		zipReader, err := zip.NewReader(bytes.NewReader(bodyBytes), int64(len(bodyBytes)))
		if err != nil {
			RecordLog("error", "plugin", fmt.Sprintf("Corrupt ZIP archive from %s: %v", rawURL, err), "", 0)
			return nil, fmt.Errorf("invalid zip archive: %w", err)
		}
		if err := extractZipSafely(zipReader, stagingDir); err != nil {
			RecordLog("error", "plugin", fmt.Sprintf("Failed extracting ZIP entries: %v", err), "", 0)
			return nil, fmt.Errorf("failed to extract zip archive: %w", err)
		}
		if err := flattenIfSingleFolder(stagingDir); err != nil {
			RecordLog("error", "plugin", fmt.Sprintf("Failed reorganizing ZIP directory structure: %v", err), "", 0)
			return nil, fmt.Errorf("failed to reorganize archive structure: %w", err)
		}

		manifestPath := filepath.Join(stagingDir, "manifest.json")
		manifestBytes, err := os.ReadFile(manifestPath)
		if err != nil {
			RecordLog("error", "plugin", fmt.Sprintf("manifest.json missing in unpacked ZIP: %v", err), "", 0)
			return nil, errors.New("manifest.json not found in plugin archive")
		}

		var m PluginManifest
		if err := json.Unmarshal(manifestBytes, &m); err != nil {
			RecordLog("error", "plugin", fmt.Sprintf("Failed to parse manifest.json from ZIP: %v", err), "", 0)
			return nil, fmt.Errorf("failed to parse manifest.json: %w", err)
		}
		RecordLog("info", "plugin", fmt.Sprintf("ZIP unpacked successfully with %d files: plugin %s (%s)", len(zipReader.File), m.ID, m.Version), "", 0)
		return &m, nil
	}

	// Treat as JSON manifest
	RecordLog("info", "plugin", fmt.Sprintf("Detected standalone JSON manifest (%d bytes), parsing...", len(bodyBytes)), "", 0)
	var m PluginManifest
	if err := json.Unmarshal(bodyBytes, &m); err != nil {
		RecordLog("error", "plugin", fmt.Sprintf("Failed to parse plugin manifest from %s: %v", rawURL, err), "", 0)
		return nil, fmt.Errorf("failed to parse plugin manifest from %s: %w", rawURL, err)
	}
	if err := ValidateManifest(&m); err != nil {
		RecordLog("error", "plugin", fmt.Sprintf("Validation of standalone manifest failed: %v", err), "", 0)
		return nil, err
	}
	// Save manifest.json in stagingDir
	if err := os.WriteFile(filepath.Join(stagingDir, "manifest.json"), bodyBytes, 0644); err != nil {
		return nil, err
	}

	// Resolve asset base URL
	// E.g. http://example.com/plugins/my-plugin/manifest.json -> http://example.com/plugins/my-plugin/
	baseURL := *parsedURL
	if !strings.HasSuffix(baseURL.Path, "/") {
		baseURL.Path = path.Dir(baseURL.Path) + "/"
	}

	// Download main JS
	if m.Main != "" {
		if err := pm.downloadAssetToStaging(&baseURL, m.Main, stagingDir, m.ID); err != nil {
			return nil, fmt.Errorf("failed to download main file %q: %w", m.Main, err)
		}
	}

	// Download style CSS if specified
	if m.Style != "" {
		if err := pm.downloadAssetToStaging(&baseURL, m.Style, stagingDir, m.ID); err != nil {
			return nil, fmt.Errorf("failed to download style file %q: %w", m.Style, err)
		}
	}

	// Download icon if relative
	if m.Icon != "" && !strings.HasPrefix(m.Icon, "data:") && !strings.Contains(m.Icon, "://") {
		_ = pm.downloadAssetToStaging(&baseURL, m.Icon, stagingDir, m.ID)
	}

	return &m, nil
}

// downloadAssetToStaging downloads a relative asset referenced by the manifest into stagingDir.
func (pm *PluginManager) downloadAssetToStaging(baseURL *url.URL, relativePath string, stagingDir string, pluginID string) error {
	destPath := filepath.Join(stagingDir, filepath.FromSlash(relativePath))
	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		return err
	}

	assetURL := baseURL.ResolveReference(&url.URL{Path: relativePath})

	if assetURL.Scheme == "file" {
		filePath := assetURL.Path
		if runtime.GOOS == "windows" && strings.HasPrefix(filePath, "/") {
			filePath = strings.TrimPrefix(filePath, "/")
		}
		data, err := os.ReadFile(filePath)
		if err != nil {
			RecordLog("error", "plugin", fmt.Sprintf("Failed reading local plugin asset %s: %v", filePath, err), "", 0)
			return err
		}
		return os.WriteFile(destPath, data, 0644)
	}

	proxyDesc := pm.getProxyDescription(assetURL.String())
	req, err := http.NewRequest(http.MethodGet, assetURL.String(), nil)
	if err != nil {
		RecordLog("error", "plugin", fmt.Sprintf("Failed building asset request %s: %v", assetURL.String(), err), "", 0)
		return err
	}
	req.Header.Set("User-Agent", "Bowerbird-Plugin-Installer/1.0")

	RecordLog("info", "plugin", fmt.Sprintf("Downloading plugin asset: %s (via %s)", assetURL.String(), proxyDesc), "", 0)
	dlStart := time.Now()
	resp, err := pm.httpClient.Do(req)
	dlDuration := time.Since(dlStart).Milliseconds()
	if err != nil {
		if strings.HasPrefix(pluginID, "official.") {
			fallbackURL := fmt.Sprintf("https://raw.githubusercontent.com/owocc/bowerbird-plugins/main/repo/%s/%s", pluginID, relativePath)
			RecordLog("info", "plugin", fmt.Sprintf("Asset download failed, trying official GitHub fallback: %s", fallbackURL), "", 0)
			if fbErr := pm.downloadDirectFile(fallbackURL, destPath); fbErr == nil {
				RecordLog("info", "plugin", fmt.Sprintf("Downloaded %s successfully from GitHub fallback", relativePath), "", 0)
				return nil
			}
		}
		RecordLog("error", "plugin", fmt.Sprintf("Failed downloading plugin asset %s: %v", assetURL.String(), err),
			fmt.Sprintf("proxy=%s, duration=%dms", proxyDesc, dlDuration), dlDuration)
		return fmt.Errorf("%w (proxy: %s)", err, proxyDesc)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if strings.HasPrefix(pluginID, "official.") {
			fallbackURL := fmt.Sprintf("https://raw.githubusercontent.com/owocc/bowerbird-plugins/main/repo/%s/%s", pluginID, relativePath)
			RecordLog("info", "plugin", fmt.Sprintf("Asset HTTP %d, trying official GitHub fallback: %s", resp.StatusCode, fallbackURL), "", 0)
			if fbErr := pm.downloadDirectFile(fallbackURL, destPath); fbErr == nil {
				RecordLog("info", "plugin", fmt.Sprintf("Downloaded %s successfully from GitHub fallback", relativePath), "", 0)
				return nil
			}
		}
		RecordLog("error", "plugin", fmt.Sprintf("HTTP %d error downloading plugin asset %s", resp.StatusCode, assetURL.String()),
			fmt.Sprintf("status=%s, proxy=%s, duration=%dms", resp.Status, proxyDesc, dlDuration), dlDuration)
		return fmt.Errorf("HTTP error %d downloading %s", resp.StatusCode, assetURL.String())
	}

	outFile, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer outFile.Close()

	n, err := io.Copy(outFile, resp.Body)
	if err == nil {
		RecordLog("info", "plugin", fmt.Sprintf("Downloaded plugin asset %s (%d bytes in %dms)", relativePath, n, dlDuration), "", dlDuration)
	}
	return err
}

func (pm *PluginManager) downloadDirectFile(rawURL string, destPath string) error {
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "Bowerbird-Plugin-Installer/1.0")

	resp, err := pm.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP error %d from %s", resp.StatusCode, rawURL)
	}

	outFile, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer outFile.Close()

	_, err = io.Copy(outFile, resp.Body)
	return err
}

func extractPluginIDFromURL(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	parts := strings.Split(parsed.Path, "/")
	for _, p := range parts {
		if strings.HasPrefix(p, "official.") {
			name := strings.TrimSuffix(p, ".zip")
			name = strings.TrimSuffix(name, ".json")
			return name
		}
	}
	return ""
}

// extractZipSafely unpacks all entries from a zip reader while preventing Zip Slip attacks.
func extractZipSafely(zipReader *zip.Reader, destDir string) error {
	destClean := filepath.Clean(destDir)
	for _, f := range zipReader.File {
		cleanName := filepath.Clean(f.Name)
		targetPath := filepath.Join(destClean, cleanName)

		// Guard against Zip Slip directory traversal
		if !strings.HasPrefix(targetPath, destClean+string(filepath.Separator)) && targetPath != destClean {
			return fmt.Errorf("illegal file path in zip archive: %s", f.Name)
		}

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(targetPath, 0755); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return err
		}

		rc, err := f.Open()
		if err != nil {
			return err
		}

		outFile, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode()&0755)
		if err != nil {
			_ = rc.Close()
			return err
		}

		_, copyErr := io.Copy(outFile, rc)
		closeErr := outFile.Close()
		_ = rc.Close()

		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	return nil
}

// flattenIfSingleFolder reorganizes extracted contents if the archive wrapped all files inside one folder.
func flattenIfSingleFolder(dir string) error {
	manifestPath := filepath.Join(dir, "manifest.json")
	if _, err := os.Stat(manifestPath); err == nil {
		return nil
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	var dirs []os.DirEntry
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), ".") {
			dirs = append(dirs, e)
		}
	}

	if len(dirs) == 1 && dirs[0].IsDir() {
		subDir := filepath.Join(dir, dirs[0].Name())
		subManifest := filepath.Join(subDir, "manifest.json")
		if _, err := os.Stat(subManifest); err == nil {
			subEntries, err := os.ReadDir(subDir)
			if err != nil {
				return err
			}
			for _, se := range subEntries {
				src := filepath.Join(subDir, se.Name())
				dst := filepath.Join(dir, se.Name())
				if err := os.Rename(src, dst); err != nil {
					return err
				}
			}
			_ = os.Remove(subDir)
		}
	}
	return nil
}

// UninstallPlugin removes the plugin folder and updates installed.json.
func (pm *PluginManager) UninstallPlugin(id string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	RecordLog("info", "plugin", fmt.Sprintf("Initiating uninstallation for plugin %s", id), "", 0)

	if _, exists := pm.plugins[id]; !exists {
		err := fmt.Errorf("plugin %q is not installed", id)
		RecordLog("warn", "plugin", fmt.Sprintf("Uninstall failed: plugin %s is not installed", id), "", 0)
		return err
	}

	destDir := filepath.Join(pm.baseDir, id)
	_ = os.RemoveAll(destDir)

	delete(pm.plugins, id)
	if err := pm.saveIndexLocked(); err != nil {
		RecordLog("error", "plugin", fmt.Sprintf("Failed to update installed.json during uninstallation of %s: %v", id, err), "", 0)
		return fmt.Errorf("failed to update installed.json: %w", err)
	}

	pm.emit("plugin:changed", map[string]any{
		"action": "uninstalled",
		"id":     id,
	})
	RecordLog("info", "plugin", fmt.Sprintf("Plugin %s uninstalled successfully", id), destDir, 0)
	return nil
}

// SetPluginEnabled toggles whether a plugin is enabled.
func (pm *PluginManager) SetPluginEnabled(id string, enabled bool) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	p, exists := pm.plugins[id]
	if !exists {
		return fmt.Errorf("plugin %q is not installed", id)
	}

	p.Enabled = enabled
	if err := pm.saveIndexLocked(); err != nil {
		return fmt.Errorf("failed to update installed.json: %w", err)
	}

	action := "enabled"
	if !enabled {
		action = "disabled"
	}
	pm.emit("plugin:changed", map[string]any{
		"action": action,
		"id":     id,
	})
	return nil
}

func extractMarketplaceURL(rawURL string) string {
	if parsed, err := url.Parse(rawURL); err == nil && parsed.Scheme != "" && parsed.Host != "" {
		return fmt.Sprintf("%s://%s", parsed.Scheme, parsed.Host)
	}
	return ""
}

// CompareSemVer compares two semantic version strings (e.g. "1.2.3" vs "1.2.0").
// Returns 1 if v1 > v2, -1 if v1 < v2, and 0 if v1 == v2.
func CompareSemVer(v1, v2 string) int {
	clean1 := strings.TrimPrefix(strings.TrimSpace(v1), "v")
	clean2 := strings.TrimPrefix(strings.TrimSpace(v2), "v")

	parts1 := strings.Split(clean1, ".")
	parts2 := strings.Split(clean2, ".")

	maxLen := max(len(parts1), len(parts2))
	for i := 0; i < maxLen; i++ {
		var n1, n2 int
		if i < len(parts1) {
			seg := strings.SplitN(parts1[i], "-", 2)[0]
			fmt.Sscanf(seg, "%d", &n1)
		}
		if i < len(parts2) {
			seg := strings.SplitN(parts2[i], "-", 2)[0]
			fmt.Sscanf(seg, "%d", &n2)
		}
		if n1 > n2 {
			return 1
		}
		if n1 < n2 {
			return -1
		}
	}
	return 0
}

// CheckPluginUpdates inspects all installed plugins, groups them by marketplace origin,
// queries each marketplace in batch to minimize network requests, and falls back to single
// manifest checks when needed.
func (pm *PluginManager) CheckPluginUpdates() ([]PluginUpdateInfo, error) {
	pm.mu.RLock()
	allInstalled := make([]*InstalledPlugin, 0, len(pm.plugins))
	for _, p := range pm.plugins {
		copyP := *p
		allInstalled = append(allInstalled, &copyP)
	}
	pm.mu.RUnlock()

	if len(allInstalled) == 0 {
		return []PluginUpdateInfo{}, nil
	}

	// 1. Group plugins by MarketplaceURL
	groups := make(map[string][]*InstalledPlugin)
	var standalone []*InstalledPlugin

	for _, p := range allInstalled {
		market := strings.TrimSpace(p.MarketplaceURL)
		if market == "" && p.SourceURL != "" {
			market = extractMarketplaceURL(p.SourceURL)
		}

		if market != "" {
			groups[market] = append(groups[market], p)
		} else {
			standalone = append(standalone, p)
		}
	}

	var results []PluginUpdateInfo
	var mu sync.Mutex
	var wg sync.WaitGroup

	// 2. Query each marketplace in batch
	for marketURL, pluginList := range groups {
		wg.Add(1)
		go func(mURL string, pList []*InstalledPlugin) {
			defer wg.Done()
			updates, err := pm.checkMarketplaceBatch(mURL, pList)
			if err == nil && len(updates) > 0 {
				mu.Lock()
				results = append(results, updates...)
				mu.Unlock()
				return
			}

			// Fallback: check each plugin's manifest individually if batch endpoint unavailable
			for _, p := range pList {
				if info := pm.checkSinglePluginUpdate(p); info != nil {
					mu.Lock()
					results = append(results, *info)
					mu.Unlock()
				}
			}
		}(marketURL, pluginList)
	}

	// 3. Query standalone plugins individually
	for _, p := range standalone {
		wg.Add(1)
		go func(plugin *InstalledPlugin) {
			defer wg.Done()
			if info := pm.checkSinglePluginUpdate(plugin); info != nil {
				mu.Lock()
				results = append(results, *info)
				mu.Unlock()
			}
		}(p)
	}

	wg.Wait()

	sort.Slice(results, func(i, j int) bool {
		return results[i].ID < results[j].ID
	})

	return results, nil
}

func (pm *PluginManager) checkMarketplaceBatch(marketURL string, plugins []*InstalledPlugin) ([]PluginUpdateInfo, error) {
	checkURL := strings.TrimRight(marketURL, "/") + "/api/plugins/check-updates"

	reqPayload := BatchCheckUpdateRequest{
		Plugins: make([]PluginCheckItem, len(plugins)),
	}
	for i, p := range plugins {
		reqPayload.Plugins[i] = PluginCheckItem{
			ID:      p.ID,
			Version: p.Version,
		}
	}

	bodyBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(http.MethodPost, checkURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Bowerbird-Plugin-Updater/1.0")

	resp, err := pm.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("marketplace returned HTTP %d", resp.StatusCode)
	}

	var batchResp BatchCheckUpdateResponse
	if err := json.NewDecoder(resp.Body).Decode(&batchResp); err != nil {
		return nil, err
	}

	var validUpdates []PluginUpdateInfo
	for _, u := range batchResp.Updates {
		if u.HasUpdate || CompareSemVer(u.LatestVersion, u.CurrentVersion) > 0 {
			u.HasUpdate = true
			if u.MarketplaceURL == "" {
				u.MarketplaceURL = marketURL
			}
			validUpdates = append(validUpdates, u)
		}
	}
	return validUpdates, nil
}

func (pm *PluginManager) checkSinglePluginUpdate(p *InstalledPlugin) *PluginUpdateInfo {
	targetURL := p.UpdateURL
	if targetURL == "" {
		targetURL = p.SourceURL
	}
	if targetURL == "" || !strings.HasPrefix(targetURL, "http") {
		return nil
	}

	req, err := http.NewRequest(http.MethodGet, targetURL, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "Bowerbird-Plugin-Updater/1.0")

	resp, err := pm.httpClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		return nil
	}
	defer resp.Body.Close()

	var m PluginManifest
	if err := json.NewDecoder(resp.Body).Decode(&m); err != nil {
		return nil
	}

	if CompareSemVer(m.Version, p.Version) > 0 {
		return &PluginUpdateInfo{
			ID:             p.ID,
			Name:           p.Name,
			CurrentVersion: p.Version,
			LatestVersion:  m.Version,
			HasUpdate:      true,
			ManifestURL:    targetURL,
			MarketplaceURL: p.MarketplaceURL,
		}
	}
	return nil
}

// UpgradePlugin downloads and updates an installed plugin from its remembered update/source URL.
func (pm *PluginManager) UpgradePlugin(id string) (*InstalledPlugin, error) {
	RecordLog("info", "plugin", fmt.Sprintf("Initiating upgrade for plugin %s", id), "", 0)
	pm.mu.RLock()
	p, exists := pm.plugins[id]
	if !exists {
		pm.mu.RUnlock()
		RecordLog("error", "plugin", fmt.Sprintf("Upgrade failed: plugin %s not found", id), "", 0)
		return nil, fmt.Errorf("plugin %q not found", id)
	}
	targetURL := p.UpdateURL
	if targetURL == "" {
		targetURL = p.SourceURL
	}
	pm.mu.RUnlock()

	if targetURL == "" {
		RecordLog("error", "plugin", fmt.Sprintf("Upgrade failed: plugin %s has no source or update URL", id), "", 0)
		return nil, fmt.Errorf("plugin %q has no source or update URL", id)
	}

	RecordLog("info", "plugin", fmt.Sprintf("Upgrading plugin %s from URL: %s", id, targetURL), "", 0)
	updated, err := pm.InstallPluginFromURL(targetURL)
	if err != nil {
		RecordLog("error", "plugin", fmt.Sprintf("Upgrade failed for plugin %s: %v", id, err), "", 0)
		return nil, fmt.Errorf("failed to upgrade plugin %q: %w", id, err)
	}

	pm.emit("plugin:changed", map[string]any{
		"action": "updated",
		"id":     id,
	})
	RecordLog("info", "plugin", fmt.Sprintf("Plugin %s upgraded to v%s successfully", id, updated.Version), "", 0)

	return updated, nil
}
