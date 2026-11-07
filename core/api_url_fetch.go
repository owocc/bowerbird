package core

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// URLFetchRequest lets a plugin fetch a remote URL through the desktop HTTP
// client. This keeps plugins independent from CORS and mixed-content rules while
// leaving all site-specific parsing in the plugin itself.
type URLFetchRequest struct {
	URL       string            `json:"url"`
	Headers   map[string]string `json:"headers,omitempty"`
	MaxBytes  int64             `json:"maxBytes,omitempty"`
	TimeoutMs int               `json:"timeoutMs,omitempty"`
}

// URLFetchResponse is the raw response returned to a plugin URL resolver.
type URLFetchResponse struct {
	URL         string `json:"url"`
	StatusCode  int    `json:"statusCode"`
	ContentType string `json:"contentType"`
	Body        string `json:"body"`
}

func (s *AssetServer) handleAPIURLFetch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	var req URLFetchRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "invalid request body")
		return
	}

	target := strings.TrimSpace(req.URL)
	parsed, err := url.Parse(target)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		writeError(w, http.StatusBadRequest, ErrCodeInvalidURL, "unsupported or invalid URL")
		return
	}

	maxBytes := req.MaxBytes
	if maxBytes <= 0 {
		maxBytes = 4 << 20
	}
	if maxBytes > 16<<20 {
		maxBytes = 16 << 20
	}
	timeoutMs := req.TimeoutMs
	if timeoutMs <= 0 {
		timeoutMs = 20_000
	}
	if timeoutMs > 60_000 {
		timeoutMs = 60_000
	}

	netSettings := NetworkSettings{ProxyMode: ProxyModeSystem}
	if s.manager != nil {
		netSettings = s.manager.GetNetworkSettings()
	}
	client := &http.Client{
		Transport: CreateProxyTransport(netSettings),
		Timeout:   time.Duration(timeoutMs) * time.Millisecond,
	}

	httpReq, err := http.NewRequest(http.MethodGet, target, nil)
	if err != nil {
		writeError(w, http.StatusBadRequest, ErrCodeInvalidURL, err.Error())
		return
	}
	httpReq.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	httpReq.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7")
	httpReq.Header.Set("Accept-Language", "en-US,en;q=0.9")

	for name, value := range req.Headers {
		name = strings.TrimSpace(name)
		value = strings.TrimSpace(value)
		if name == "" || value == "" {
			continue
		}
		// Host is not a regular header in net/http: plugins use it to request a
		// CDN/fronting domain with the canonical site host (e.g. Pinterest's
		// Fastly frontends). All other headers are forwarded normally.
		if strings.EqualFold(name, "Host") {
			httpReq.Host = value
			continue
		}
		httpReq.Header.Set(name, value)
	}

	resp, err := client.Do(httpReq)
	if err != nil {
		writeError(w, http.StatusBadGateway, ErrCodeUnknown, fmt.Sprintf("failed to fetch URL: %v", err))
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBytes))
	if err != nil {
		writeError(w, http.StatusBadGateway, ErrCodeUnknown, fmt.Sprintf("failed to read URL body: %v", err))
		return
	}

	finalURL := target
	if resp.Request != nil && resp.Request.URL != nil {
		finalURL = resp.Request.URL.String()
	}

	writeSuccess(w, URLFetchResponse{
		URL:         finalURL,
		StatusCode:  resp.StatusCode,
		ContentType: resp.Header.Get("Content-Type"),
		Body:        string(body),
	})
}
