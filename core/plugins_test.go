package core

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidateManifest(t *testing.T) {
	tests := []struct {
		name    string
		m       PluginManifest
		wantErr bool
	}{
		{
			name: "valid manifest",
			m: PluginManifest{
				ID:          "official.markdown-preview",
				Name:        "Markdown Preview",
				Version:     "1.0.0",
				Description: "Preview markdown files",
				Author:      "Bowerbird",
				Kind:        "preview",
				Priority:    50,
				Extensions:  []string{".MD", "markdown"},
				Main:        "index.js",
				Style:       "style.css",
			},
			wantErr: false,
		},
		{
			name: "missing id",
			m: PluginManifest{
				Name:    "Test",
				Version: "1.0.0",
				Author:  "Tester",
				Kind:    "preview",
			},
			wantErr: true,
		},
		{
			name: "invalid id with path traversal",
			m: PluginManifest{
				ID:      "../evil",
				Name:    "Test",
				Version: "1.0.0",
				Author:  "Tester",
				Kind:    "preview",
			},
			wantErr: true,
		},
		{
			name: "invalid id with slash",
			m: PluginManifest{
				ID:      "official/markdown",
				Name:    "Test",
				Version: "1.0.0",
				Author:  "Tester",
				Kind:    "preview",
			},
			wantErr: true,
		},
		{
			name: "invalid main with path traversal",
			m: PluginManifest{
				ID:      "test.plugin",
				Name:    "Test",
				Version: "1.0.0",
				Author:  "Tester",
				Kind:    "preview",
				Main:    "../index.js",
			},
			wantErr: true,
		},
		{
			name: "invalid style with absolute path",
			m: PluginManifest{
				ID:      "test.plugin",
				Name:    "Test",
				Version: "1.0.0",
				Author:  "Tester",
				Kind:    "preview",
				Main:    "index.js",
				Style:   "/etc/style.css",
			},
			wantErr: true,
		},
		{
			name: "invalid kind",
			m: PluginManifest{
				ID:      "test.plugin",
				Name:    "Test",
				Version: "1.0.0",
				Author:  "Tester",
				Kind:    "unknown",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mCopy := tt.m
			err := ValidateManifest(&mCopy)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ValidateManifest() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr {
				if mCopy.Extensions[0] != "md" || mCopy.Extensions[1] != "markdown" {
					t.Fatalf("expected normalized extensions [md, markdown], got %v", mCopy.Extensions)
				}
			}
		})
	}
}

func TestPluginManager_InstallFromManifestURL(t *testing.T) {
	tempDir := t.TempDir()
	pm := NewPluginManagerWithDir(tempDir)

	manifest := PluginManifest{
		ID:           "test.markdown",
		Name:         "Test Markdown",
		Version:      "1.0.0",
		Description:  "Test Markdown Viewer",
		Author:       "Tester",
		Kind:         "preview",
		Priority:     60,
		Extensions:   []string{"md"},
		Main:         "index.js",
		Style:        "style.css",
		SupportsZoom: true,
	}

	mainJS := "console.log('markdown plugin loaded');"
	styleCSS := "body { color: red; }"

	// Start test HTTP server serving the manifest and assets
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/plugin/manifest.json":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(manifest)
		case "/plugin/index.js":
			w.Header().Set("Content-Type", "application/javascript")
			_, _ = w.Write([]byte(mainJS))
		case "/plugin/style.css":
			w.Header().Set("Content-Type", "text/css")
			_, _ = w.Write([]byte(styleCSS))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	installed, err := pm.InstallPluginFromURL(srv.URL + "/plugin/manifest.json")
	if err != nil {
		t.Fatalf("failed to install plugin: %v", err)
	}

	if installed.ID != "test.markdown" {
		t.Fatalf("expected id test.markdown, got %s", installed.ID)
	}
	if !installed.Enabled {
		t.Fatalf("expected installed plugin to be enabled")
	}

	// Verify plugin files on disk
	pluginDir := filepath.Join(tempDir, "test.markdown")
	if data, err := os.ReadFile(filepath.Join(pluginDir, "index.js")); err != nil || string(data) != mainJS {
		t.Fatalf("index.js mismatch or missing: %v", err)
	}
	if data, err := os.ReadFile(filepath.Join(pluginDir, "style.css")); err != nil || string(data) != styleCSS {
		t.Fatalf("style.css mismatch or missing: %v", err)
	}

	// Verify installed.json persistence
	list, err := pm.ListInstalledPlugins()
	if err != nil || len(list) != 1 {
		t.Fatalf("expected 1 installed plugin, got %d (err: %v)", len(list), err)
	}
	if list[0].Name != "Test Markdown" || list[0].Priority != 60 {
		t.Fatalf("installed plugin metadata mismatch: %+v", list[0])
	}

	// Toggle enabled
	if err := pm.SetPluginEnabled("test.markdown", false); err != nil {
		t.Fatalf("failed to disable plugin: %v", err)
	}
	p, err := pm.GetInstalledPlugin("test.markdown")
	if err != nil || p.Enabled {
		t.Fatalf("expected plugin to be disabled, got enabled=%v (err: %v)", p.Enabled, err)
	}

	// Uninstall
	if err := pm.UninstallPlugin("test.markdown"); err != nil {
		t.Fatalf("failed to uninstall plugin: %v", err)
	}
	listAfter, err := pm.ListInstalledPlugins()
	if err != nil || len(listAfter) != 0 {
		t.Fatalf("expected 0 plugins after uninstall, got %d", len(listAfter))
	}
	if _, err := os.Stat(pluginDir); !os.IsNotExist(err) {
		t.Fatalf("expected plugin dir to be deleted")
	}

	// Verify diagnostic lifecycle logs recorded
	logs := GetLogsSnapshot()
	var pluginLogs []LogEntry
	for _, l := range logs {
		if l.Category == "plugin" {
			pluginLogs = append(pluginLogs, l)
		}
	}
	if len(pluginLogs) == 0 {
		t.Fatalf("expected plugin lifecycle log entries, found none")
	}
	foundPhase1 := false
	foundPhase5 := false
	for _, l := range pluginLogs {
		if strings.Contains(l.Message, "[Phase 1/5]") {
			foundPhase1 = true
		}
		if strings.Contains(l.Message, "[Phase 5/5]") {
			foundPhase5 = true
		}
	}
	if !foundPhase1 || !foundPhase5 {
		t.Errorf("expected phase 1 and phase 5 markers in plugin logs, got: %+v", pluginLogs)
	}
}

func TestPluginManager_InstallFromZipBundle(t *testing.T) {
	tempDir := t.TempDir()
	pm := NewPluginManagerWithDir(tempDir)

	manifest := PluginManifest{
		ID:          "test.audio-player",
		Name:        "Test Audio Player",
		Version:     "1.0.0",
		Description: "Audio Player Plugin",
		Author:      "AudioTeam",
		Kind:        "preview",
		Priority:    40,
		Extensions:  []string{"mp3", "wav"},
		Main:        "index.js",
	}

	// Create test zip in memory
	var zipBuf bytes.Buffer
	zw := zip.NewWriter(&zipBuf)

	mBytes, _ := json.Marshal(manifest)
	mw, _ := zw.Create("manifest.json")
	_, _ = mw.Write(mBytes)

	jw, _ := zw.Create("index.js")
	_, _ = jw.Write([]byte("console.log('audio player');"))

	_ = zw.Close()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/zip")
		_, _ = w.Write(zipBuf.Bytes())
	}))
	defer srv.Close()

	installed, err := pm.InstallPluginFromURL(srv.URL + "/audio.zip")
	if err != nil {
		t.Fatalf("failed to install zip bundle: %v", err)
	}
	if installed.ID != "test.audio-player" {
		t.Fatalf("unexpected id: %s", installed.ID)
	}

	// Test Zip Slip Prevention
	var evilBuf bytes.Buffer
	ezw := zip.NewWriter(&evilBuf)
	emw, _ := ezw.Create("manifest.json")
	_, _ = emw.Write(mBytes)
	ew, _ := ezw.Create("../evil.js")
	_, _ = ew.Write([]byte("malicious"))
	_ = ezw.Close()

	evilSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/zip")
		_, _ = w.Write(evilBuf.Bytes())
	}))
	defer evilSrv.Close()

	if _, err := pm.InstallPluginFromURL(evilSrv.URL + "/evil.zip"); err == nil {
		t.Fatalf("expected error installing zip with path traversal, got nil")
	}
}

func TestAssetServer_PluginAssets(t *testing.T) {
	tempPluginsDir := t.TempDir()
	pluginDir := filepath.Join(tempPluginsDir, "demo.plugin")
	_ = os.MkdirAll(pluginDir, 0755)

	jsContent := "console.log('demo');"
	cssContent := "body { margin: 0; }"
	_ = os.WriteFile(filepath.Join(pluginDir, "index.js"), []byte(jsContent), 0644)
	_ = os.WriteFile(filepath.Join(pluginDir, "style.css"), []byte(cssContent), 0644)

	// Set BOWERBIRD_USER_DATA_DIR parent
	pm := NewPluginManagerWithDir(tempPluginsDir)
	mgr := &LibraryManager{
		pluginMgr: pm,
	}
	server := &AssetServer{
		manager: mgr,
	}

	// Test JS content and headers
	req := httptest.NewRequest(http.MethodGet, "/asset/plugins/demo.plugin/index.js", nil)
	w := httptest.NewRecorder()
	server.handlePluginAssetRequest(w, req)
	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/javascript; charset=utf-8" {
		t.Fatalf("expected application/javascript; charset=utf-8, got %s", ct)
	}
	if cors := resp.Header.Get("Access-Control-Allow-Origin"); cors != "*" {
		t.Fatalf("expected CORS *, got %s", cors)
	}
	if w.Body.String() != jsContent {
		t.Fatalf("expected body %s, got %s", jsContent, w.Body.String())
	}

	// Test CSS
	reqCSS := httptest.NewRequest(http.MethodGet, "/asset/plugins/demo.plugin/style.css", nil)
	wCSS := httptest.NewRecorder()
	server.handlePluginAssetRequest(wCSS, reqCSS)
	if ct := wCSS.Result().Header.Get("Content-Type"); ct != "text/css; charset=utf-8" {
		t.Fatalf("expected text/css; charset=utf-8, got %s", ct)
	}

	// Test Path Traversal Protection
	reqTraversal := httptest.NewRequest(http.MethodGet, "/asset/plugins/demo.plugin/../evil.txt", nil)
	wTraversal := httptest.NewRecorder()
	server.handlePluginAssetRequest(wTraversal, reqTraversal)
	if wTraversal.Result().StatusCode != http.StatusBadRequest && wTraversal.Result().StatusCode != http.StatusForbidden {
		t.Fatalf("expected bad request or forbidden for traversal, got %d", wTraversal.Result().StatusCode)
	}

	// Test Nonexistent file
	req404 := httptest.NewRequest(http.MethodGet, "/asset/plugins/demo.plugin/notfound.js", nil)
	w404 := httptest.NewRecorder()
	server.handlePluginAssetRequest(w404, req404)
	if w404.Result().StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for missing file, got %d", w404.Result().StatusCode)
	}
}

func TestAPIServer_PluginEndpoints(t *testing.T) {
	tempPluginsDir := t.TempDir()
	pm := NewPluginManagerWithDir(tempPluginsDir)
	pm.plugins["demo.plugin"] = &InstalledPlugin{
		ID:       "demo.plugin",
		Name:     "Demo Plugin",
		Version:  "1.0.0",
		Enabled:  true,
		Priority: 50,
	}

	mgr := &LibraryManager{
		pluginMgr: pm,
	}
	server := &AssetServer{
		manager: mgr,
	}

	// GET /api/plugins
	req := httptest.NewRequest(http.MethodGet, "/api/plugins", nil)
	w := httptest.NewRecorder()
	server.handleAPIPluginsList(w, req)
	if w.Result().StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Result().StatusCode)
	}

	var apiResp struct {
		Status string            `json:"status"`
		Data   []InstalledPlugin `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &apiResp); err != nil {
		t.Fatalf("failed to decode API response: %v", err)
	}
	if apiResp.Status != "success" || len(apiResp.Data) != 1 || apiResp.Data[0].ID != "demo.plugin" {
		t.Fatalf("unexpected API data: %+v", apiResp)
	}

	// POST /api/plugin/install - MUST NOT install automatically, only request confirmation
	body := bytes.NewBufferString(`{"manifestUrl":"http://example.com/manifest.json","id":"demo.plugin2","version":"1.0.0"}`)
	reqInstall := httptest.NewRequest(http.MethodPost, "/api/plugin/install", body)
	reqInstall.Header.Set("Content-Type", "application/json")
	wInstall := httptest.NewRecorder()
	server.handleAPIPluginInstall(wInstall, reqInstall)
	if wInstall.Result().StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", wInstall.Result().StatusCode)
	}

	// Verify demo.plugin2 was NOT installed into manager!
	if _, err := pm.GetInstalledPlugin("demo.plugin2"); err == nil {
		t.Fatalf("expected demo.plugin2 to NOT be installed by handleAPIPluginInstall")
	}
	if list, _ := pm.ListInstalledPlugins(); len(list) != 1 {
		t.Fatalf("expected installed plugin count to remain 1, got %d", len(list))
	}

	// POST /api/plugin/confirm-install - only manual confirmation triggers actual installation
	confirmSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/plugin/manifest.json":
			_ = json.NewEncoder(w).Encode(PluginManifest{
				ID:       "confirmed.plugin",
				Name:     "Confirmed Plugin",
				Version:  "1.0.0",
				Author:   "Test Author",
				Kind:     "preview",
				Priority: 50,
				Main:     "index.js",
			})
		case "/plugin/index.js":
			_, _ = w.Write([]byte("console.log('confirmed');"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer confirmSrv.Close()

	confirmBody := bytes.NewBufferString(fmt.Sprintf(`{"manifestUrl":"%s/plugin/manifest.json"}`, confirmSrv.URL))
	reqConfirm := httptest.NewRequest(http.MethodPost, "/api/plugin/confirm-install", confirmBody)
	reqConfirm.Header.Set("Content-Type", "application/json")
	wConfirm := httptest.NewRecorder()
	server.handleAPIPluginConfirmInstall(wConfirm, reqConfirm)
	if wConfirm.Result().StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", wConfirm.Result().StatusCode, wConfirm.Body.String())
	}

	// Verify confirmed.plugin is now installed
	if p, err := pm.GetInstalledPlugin("confirmed.plugin"); err != nil || p == nil {
		t.Fatalf("expected confirmed.plugin to be installed after explicit confirmation: %v", err)
	}
}

func TestCompareSemVer(t *testing.T) {
	if CompareSemVer("1.2.0", "1.1.0") <= 0 {
		t.Errorf("expected 1.2.0 > 1.1.0")
	}
	if CompareSemVer("1.0.0", "1.0.0") != 0 {
		t.Errorf("expected 1.0.0 == 1.0.0")
	}
	if CompareSemVer("1.0.0", "1.0.1") >= 0 {
		t.Errorf("expected 1.0.0 < 1.0.1")
	}
	if CompareSemVer("v2.0.0", "1.9.9") <= 0 {
		t.Errorf("expected v2.0.0 > 1.9.9")
	}
}

func TestCheckPluginUpdates_Batch(t *testing.T) {
	tempPluginsDir := t.TempDir()
	pm := NewPluginManagerWithDir(tempPluginsDir)

	// Start mock marketplace server
	marketSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/plugins/check-updates" && r.Method == http.MethodPost {
			var req BatchCheckUpdateRequest
			_ = json.NewDecoder(r.Body).Decode(&req)

			resp := BatchCheckUpdateResponse{
				Updates: []PluginUpdateInfo{
					{
						ID:             "market.p1",
						Name:           "Market Plugin 1",
						CurrentVersion: "1.0.0",
						LatestVersion:  "1.2.0",
						HasUpdate:      true,
						ManifestURL:    "/plugins/p1/manifest.json",
					},
				},
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(resp)
			return
		}
		http.NotFound(w, r)
	}))
	defer marketSrv.Close()

	pm.plugins["market.p1"] = &InstalledPlugin{
		ID:             "market.p1",
		Name:           "Market Plugin 1",
		Version:        "1.0.0",
		MarketplaceURL: marketSrv.URL,
		SourceURL:      marketSrv.URL + "/plugins/p1/manifest.json",
		Enabled:        true,
	}

	updates, err := pm.CheckPluginUpdates()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(updates) != 1 {
		t.Fatalf("expected 1 update, got %d", len(updates))
	}
	if updates[0].ID != "market.p1" || updates[0].LatestVersion != "1.2.0" {
		t.Fatalf("unexpected update payload: %+v", updates[0])
	}
}
