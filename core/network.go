package core

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	ProxyModeSystem = "system"
	ProxyModeDirect = "direct"
	ProxyModeCustom = "custom"

	NetworkSettingsChangedEvent = "network-settings-changed"
)

// NetworkSettings stores user-configured proxy settings.
type NetworkSettings struct {
	ProxyMode   string `json:"proxyMode"`             // "system" | "direct" | "custom"
	CustomProxy string `json:"customProxy,omitempty"` // e.g. "http://127.0.0.1:7890" or "socks5://127.0.0.1:1080"
}

// NetworkTestResult holds the diagnostic outcome of a connectivity check.
type NetworkTestResult struct {
	Success     bool   `json:"success"`
	StatusCode  int    `json:"statusCode,omitempty"`
	LatencyMs   int64  `json:"latencyMs"`
	ActiveProxy string `json:"activeProxy,omitempty"`
	Error       string `json:"error,omitempty"`
}

// NormalizeProxyURL cleans and standardizes a proxy URL string.
// If scheme is omitted, http:// is assumed.
func NormalizeProxyURL(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", errors.New("proxy address cannot be empty")
	}

	if !strings.Contains(trimmed, "://") {
		trimmed = "http://" + trimmed
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return "", fmt.Errorf("invalid proxy URL %q: %w", raw, err)
	}

	scheme := strings.ToLower(parsed.Scheme)
	switch scheme {
	case "http", "https", "socks5", "socks5h":
		// supported
	default:
		return "", fmt.Errorf("unsupported proxy scheme %q (expected http, https, or socks5)", scheme)
	}

	if parsed.Host == "" {
		return "", fmt.Errorf("proxy URL %q is missing host/port", raw)
	}

	return parsed.String(), nil
}

// IsValidProxyMode checks whether the mode is recognized.
func IsValidProxyMode(mode string) bool {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case ProxyModeSystem, ProxyModeDirect, ProxyModeCustom, "":
		return true
	default:
		return false
	}
}

// ProxyFunc creates an http.Transport.Proxy function based on the given NetworkSettings.
func (s NetworkSettings) ProxyFunc() func(*http.Request) (*url.URL, error) {
	mode := strings.ToLower(strings.TrimSpace(s.ProxyMode))
	if mode == "" {
		mode = ProxyModeSystem
	}

	switch mode {
	case ProxyModeDirect:
		// Direct mode: explicitly bypass all proxies
		return func(*http.Request) (*url.URL, error) {
			return nil, nil
		}

	case ProxyModeCustom:
		normURL, err := NormalizeProxyURL(s.CustomProxy)
		if err != nil {
			return func(*http.Request) (*url.URL, error) {
				return nil, err
			}
		}
		parsed, err := url.Parse(normURL)
		if err != nil {
			return func(*http.Request) (*url.URL, error) {
				return nil, err
			}
		}
		return http.ProxyURL(parsed)

	case ProxyModeSystem:
		fallthrough
	default:
		// System mode: consult OS system proxy first, falling back to environment variables
		return systemProxyFunc()
	}
}

// CreateProxyTransport creates a standard http.Transport using the provided network settings.
func CreateProxyTransport(settings NetworkSettings) *http.Transport {
	return &http.Transport{
		Proxy: settings.ProxyFunc(),
		DialContext: (&net.Dialer{
			Timeout:   15 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   15 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
}

// ResolveActiveProxy determines the proxy URL (if any) that would be used for targetURL.
func ResolveActiveProxy(settings NetworkSettings, targetURL string) (string, error) {
	parsedTarget, err := url.Parse(targetURL)
	if err != nil {
		return "", err
	}

	dummyReq := &http.Request{
		URL: parsedTarget,
	}

	pFunc := settings.ProxyFunc()
	proxyURL, err := pFunc(dummyReq)
	if err != nil {
		return "", err
	}
	if proxyURL == nil {
		return "direct", nil
	}
	return proxyURL.String(), nil
}

// TestNetworkConnectivity tests connection to targetURL using the specified NetworkSettings.
func TestNetworkConnectivity(settings NetworkSettings, targetURL string, timeout time.Duration) NetworkTestResult {
	if timeout <= 0 {
		timeout = 10 * time.Second
	}

	target := strings.TrimSpace(targetURL)
	if target == "" {
		target = "https://raw.githubusercontent.com"
	}
	if !strings.Contains(target, "://") {
		target = "https://" + target
	}

	activeProxy, _ := ResolveActiveProxy(settings, target)

	client := &http.Client{
		Transport: CreateProxyTransport(settings),
		Timeout:   timeout,
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return NetworkTestResult{
			Success:     false,
			ActiveProxy: activeProxy,
			Error:       err.Error(),
		}
	}
	req.Header.Set("User-Agent", "Bowerbird-Network-Diagnostic/1.0")

	startTime := time.Now()
	resp, err := client.Do(req)
	latency := time.Since(startTime).Milliseconds()

	if err != nil {
		RecordLog("warn", "network", fmt.Sprintf("Connectivity test to %s failed: %v", target, err),
			fmt.Sprintf("proxy=%s, latency=%dms", activeProxy, latency), latency)
		return NetworkTestResult{
			Success:     false,
			LatencyMs:   latency,
			ActiveProxy: activeProxy,
			Error:       err.Error(),
		}
	}
	defer resp.Body.Close()

	RecordLog("info", "network", fmt.Sprintf("Connectivity test to %s succeeded with HTTP %d", target, resp.StatusCode),
		fmt.Sprintf("proxy=%s, latency=%dms", activeProxy, latency), latency)

	return NetworkTestResult{
		Success:     resp.StatusCode >= 200 && resp.StatusCode < 400,
		StatusCode:  resp.StatusCode,
		LatencyMs:   latency,
		ActiveProxy: activeProxy,
	}
}

// OS system proxy caching to avoid subprocess/registry overhead on every request
var (
	sysProxyMu       sync.RWMutex
	sysProxyLastScan time.Time
	sysProxyCached   *osProxyConfig
)

type osProxyConfig struct {
	httpProxy  *url.URL
	httpsProxy *url.URL
	socksProxy *url.URL
	exceptions []string
}

func (c *osProxyConfig) isBypassed(host string) bool {
	hostname := host
	if h, _, err := net.SplitHostPort(host); err == nil {
		hostname = h
	}
	hostname = strings.ToLower(hostname)

	if hostname == "localhost" || hostname == "127.0.0.1" || hostname == "::1" {
		return true
	}

	for _, exc := range c.exceptions {
		exc = strings.ToLower(strings.TrimSpace(exc))
		if exc == "" || exc == "<local>" {
			if !strings.Contains(hostname, ".") {
				return true
			}
			continue
		}
		if strings.HasPrefix(exc, "*.") {
			suffix := exc[1:] // e.g. ".local"
			if strings.HasSuffix(hostname, suffix) {
				return true
			}
		} else if strings.HasPrefix(exc, ".") {
			if strings.HasSuffix(hostname, exc) || hostname == exc[1:] {
				return true
			}
		} else if exc == hostname {
			return true
		} else if strings.Contains(exc, "/") {
			// CIDR
			if _, ipNet, err := net.ParseCIDR(exc); err == nil {
				if ip := net.ParseIP(hostname); ip != nil && ipNet.Contains(ip) {
					return true
				}
			}
		}
	}
	return false
}

func systemProxyFunc() func(*http.Request) (*url.URL, error) {
	return func(req *http.Request) (*url.URL, error) {
		// 1. First check environment variables (HTTP_PROXY, HTTPS_PROXY, ALL_PROXY, NO_PROXY)
		if envURL, err := http.ProxyFromEnvironment(req); err == nil && envURL != nil {
			return envURL, nil
		}

		// 2. Query OS-level system proxy with a 5-second TTL cache
		cfg := getCachedOSProxyConfig()
		if cfg == nil {
			return nil, nil
		}

		host := req.URL.Host
		if cfg.isBypassed(host) {
			return nil, nil
		}

		scheme := strings.ToLower(req.URL.Scheme)
		if scheme == "https" {
			if cfg.httpsProxy != nil {
				return cfg.httpsProxy, nil
			}
			if cfg.socksProxy != nil {
				return cfg.socksProxy, nil
			}
			if cfg.httpProxy != nil {
				return cfg.httpProxy, nil
			}
		} else {
			if cfg.httpProxy != nil {
				return cfg.httpProxy, nil
			}
			if cfg.socksProxy != nil {
				return cfg.socksProxy, nil
			}
			if cfg.httpsProxy != nil {
				return cfg.httpsProxy, nil
			}
		}

		return nil, nil
	}
}

func getCachedOSProxyConfig() *osProxyConfig {
	sysProxyMu.RLock()
	if time.Since(sysProxyLastScan) < 5*time.Second && sysProxyCached != nil {
		defer sysProxyMu.RUnlock()
		return sysProxyCached
	}
	sysProxyMu.RUnlock()

	sysProxyMu.Lock()
	defer sysProxyMu.Unlock()

	// Recheck under lock
	if time.Since(sysProxyLastScan) < 5*time.Second && sysProxyCached != nil {
		return sysProxyCached
	}

	cfg := queryOSProxyConfig()
	sysProxyCached = cfg
	sysProxyLastScan = time.Now()
	return cfg
}
