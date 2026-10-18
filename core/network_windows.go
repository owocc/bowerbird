//go:build windows

package core

import (
	"net/url"
	"strings"

	"golang.org/x/sys/windows/registry"
)

func queryOSProxyConfig() *osProxyConfig {
	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Internet Settings`, registry.QUERY_VALUE)
	if err != nil {
		return nil
	}
	defer k.Close()

	enable, _, err := k.GetIntegerValue("ProxyEnable")
	if err != nil || enable != 1 {
		return nil
	}

	serverStr, _, err := k.GetStringValue("ProxyServer")
	if err != nil || strings.TrimSpace(serverStr) == "" {
		return nil
	}

	cfg := &osProxyConfig{
		exceptions: []string{},
	}

	if overrideStr, _, err := k.GetStringValue("ProxyOverride"); err == nil {
		for _, part := range strings.Split(overrideStr, ";") {
			trimmed := strings.TrimSpace(part)
			if trimmed != "" {
				cfg.exceptions = append(cfg.exceptions, trimmed)
			}
		}
	}

	// ProxyServer can be a single host:port (e.g. "127.0.0.1:7890")
	// or protocol-specific mappings (e.g. "http=127.0.0.1:7890;https=127.0.0.1:7890;socks=127.0.0.1:1080")
	if strings.Contains(serverStr, "=") {
		for _, segment := range strings.Split(serverStr, ";") {
			kv := strings.SplitN(strings.TrimSpace(segment), "=", 2)
			if len(kv) != 2 {
				continue
			}
			proto := strings.ToLower(strings.TrimSpace(kv[0]))
			addr := strings.TrimSpace(kv[1])
			if addr == "" {
				continue
			}

			switch proto {
			case "http":
				if u, err := url.Parse("http://" + addr); err == nil {
					cfg.httpProxy = u
				}
			case "https":
				if u, err := url.Parse("http://" + addr); err == nil {
					cfg.httpsProxy = u
				}
			case "socks":
				if u, err := url.Parse("socks5://" + addr); err == nil {
					cfg.socksProxy = u
				}
			}
		}
	} else {
		// Single proxy for all protocols
		addr := strings.TrimSpace(serverStr)
		if u, err := url.Parse("http://" + addr); err == nil {
			cfg.httpProxy = u
			cfg.httpsProxy = u
		}
	}

	return cfg
}
