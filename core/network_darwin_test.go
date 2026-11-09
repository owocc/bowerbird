//go:build darwin

package core

import "testing"

// TestParseScutilProxyOutput exercises the darwin scutil parser, so it only
// exists on macOS where parseScutilProxyOutput is compiled in.
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
