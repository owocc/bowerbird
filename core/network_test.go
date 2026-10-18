package core

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestNormalizeProxyURL(t *testing.T) {
	tests := []struct {
		input    string
		expected string
		wantErr  bool
	}{
		{"127.0.0.1:7890", "http://127.0.0.1:7890", false},
		{"http://127.0.0.1:7890", "http://127.0.0.1:7890", false},
		{"https://proxy.example.com:8443", "https://proxy.example.com:8443", false},
		{"socks5://127.0.0.1:1080", "socks5://127.0.0.1:1080", false},
		{"socks5h://127.0.0.1:1080", "socks5h://127.0.0.1:1080", false},
		{"ftp://127.0.0.1:21", "", true},
		{"", "", true},
		{"   ", "", true},
	}

	for _, tt := range tests {
		got, err := NormalizeProxyURL(tt.input)
		if (err != nil) != tt.wantErr {
			t.Errorf("NormalizeProxyURL(%q) err = %v, wantErr = %v", tt.input, err, tt.wantErr)
			continue
		}
		if !tt.wantErr && got != tt.expected {
			t.Errorf("NormalizeProxyURL(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestNetworkSettings_DirectMode(t *testing.T) {
	settings := NetworkSettings{
		ProxyMode: ProxyModeDirect,
	}

	pFunc := settings.ProxyFunc()
	req, _ := http.NewRequest(http.MethodGet, "https://example.com/test", nil)
	proxyURL, err := pFunc(req)
	if err != nil {
		t.Fatalf("unexpected error in direct mode: %v", err)
	}
	if proxyURL != nil {
		t.Fatalf("expected nil proxy URL in direct mode, got %v", proxyURL)
	}
}

func TestNetworkSettings_CustomMode(t *testing.T) {
	settings := NetworkSettings{
		ProxyMode:   ProxyModeCustom,
		CustomProxy: "http://127.0.0.1:9999",
	}

	pFunc := settings.ProxyFunc()
	req, _ := http.NewRequest(http.MethodGet, "https://example.com/test", nil)
	proxyURL, err := pFunc(req)
	if err != nil {
		t.Fatalf("unexpected error in custom mode: %v", err)
	}
	if proxyURL == nil || proxyURL.String() != "http://127.0.0.1:9999" {
		t.Fatalf("expected custom proxy URL http://127.0.0.1:9999, got %v", proxyURL)
	}
}

func TestParseScutilProxyOutput(t *testing.T) {
	raw := `
<dictionary> {
  ExceptionsList : <array> {
    0 : 127.0.0.1
    1 : 192.168.0.0/16
    2 : localhost
    3 : *.local
  }
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 7890
  HTTPSProxy : 127.0.0.1
  SOCKSEnable : 1
  SOCKSPort : 1080
  SOCKSProxy : 127.0.0.1
}
`
	cfg := parseScutilProxyOutput([]byte(raw))
	if cfg == nil {
		t.Fatalf("parseScutilProxyOutput returned nil")
	}

	if cfg.httpProxy == nil || cfg.httpProxy.String() != "http://127.0.0.1:7890" {
		t.Errorf("expected httpProxy http://127.0.0.1:7890, got %v", cfg.httpProxy)
	}

	if cfg.httpsProxy == nil || cfg.httpsProxy.String() != "http://127.0.0.1:7890" {
		t.Errorf("expected httpsProxy http://127.0.0.1:7890, got %v", cfg.httpsProxy)
	}

	if cfg.socksProxy == nil || cfg.socksProxy.String() != "socks5://127.0.0.1:1080" {
		t.Errorf("expected socksProxy socks5://127.0.0.1:1080, got %v", cfg.socksProxy)
	}

	// Test bypass
	if !cfg.isBypassed("localhost") {
		t.Errorf("expected localhost to be bypassed")
	}
	if !cfg.isBypassed("127.0.0.1") {
		t.Errorf("expected 127.0.0.1 to be bypassed")
	}
	if !cfg.isBypassed("192.168.1.100") {
		t.Errorf("expected 192.168.1.100 (in 192.168.0.0/16) to be bypassed")
	}
	if !cfg.isBypassed("myserver.local") {
		t.Errorf("expected myserver.local (*.local) to be bypassed")
	}
	if cfg.isBypassed("github.com") {
		t.Errorf("expected github.com NOT to be bypassed")
	}
}

func TestTestNetworkConnectivity(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer ts.Close()

	settings := NetworkSettings{
		ProxyMode: ProxyModeDirect,
	}

	res := TestNetworkConnectivity(settings, ts.URL, 2*time.Second)
	if !res.Success {
		t.Fatalf("expected connectivity test to succeed, got: %s", res.Error)
	}
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", res.StatusCode)
	}
	if res.ActiveProxy != "direct" {
		t.Fatalf("expected active proxy 'direct', got %s", res.ActiveProxy)
	}
}

func TestNetworkSettings_ServiceAndAPI(t *testing.T) {
	tempDir := t.TempDir()
	t.Setenv("BOWERBIRD_USER_DATA_DIR", tempDir)

	mgr := NewLibraryManager()
	srv := NewService(mgr)

	// 1. Initial default should be system
	initial := srv.GetNetworkSettings()
	if initial.ProxyMode != ProxyModeSystem {
		t.Errorf("expected initial ProxyMode to be %q, got %q", ProxyModeSystem, initial.ProxyMode)
	}

	// 2. Set to custom proxy
	err := srv.SetNetworkSettings(NetworkSettings{
		ProxyMode:   ProxyModeCustom,
		CustomProxy: "127.0.0.1:8888",
	})
	if err != nil {
		t.Fatalf("SetNetworkSettings failed: %v", err)
	}

	updated := srv.GetNetworkSettings()
	if updated.ProxyMode != ProxyModeCustom {
		t.Errorf("expected ProxyMode to be custom, got %s", updated.ProxyMode)
	}
	if updated.CustomProxy != "http://127.0.0.1:8888" {
		t.Errorf("expected normalized CustomProxy to be http://127.0.0.1:8888, got %s", updated.CustomProxy)
	}

	// 3. Test HTTP API /api/network/settings
	assetSrv := newAssetServer(mgr)

	// GET
	reqGet := httptest.NewRequest(http.MethodGet, "/api/network/settings", nil)
	wGet := httptest.NewRecorder()
	assetSrv.handleAPINetworkSettings(wGet, reqGet)
	if wGet.Result().StatusCode != http.StatusOK {
		t.Fatalf("GET /api/network/settings returned %d", wGet.Result().StatusCode)
	}

	// POST
	postBody := bytes.NewBufferString(`{"proxyMode":"direct"}`)
	reqPost := httptest.NewRequest(http.MethodPost, "/api/network/settings", postBody)
	wPost := httptest.NewRecorder()
	assetSrv.handleAPINetworkSettings(wPost, reqPost)
	if wPost.Result().StatusCode != http.StatusOK {
		t.Fatalf("POST /api/network/settings returned %d", wPost.Result().StatusCode)
	}

	if mgr.GetNetworkSettings().ProxyMode != ProxyModeDirect {
		t.Errorf("expected ProxyMode direct after API POST, got %s", mgr.GetNetworkSettings().ProxyMode)
	}

	// 4. Test HTTP API /api/network/test
	mockDest := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("pong"))
	}))
	defer mockDest.Close()

	testBody := bytes.NewBufferString(`{"targetUrl":"` + mockDest.URL + `","proxyMode":"direct"}`)
	reqTest := httptest.NewRequest(http.MethodPost, "/api/network/test", testBody)
	wTest := httptest.NewRecorder()
	assetSrv.handleAPINetworkTest(wTest, reqTest)
	if wTest.Result().StatusCode != http.StatusOK {
		t.Fatalf("POST /api/network/test returned %d", wTest.Result().StatusCode)
	}
}
