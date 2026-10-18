//go:build darwin

package core

import (
	"bufio"
	"bytes"
	"net/url"
	"os/exec"
	"strconv"
	"strings"
)

func queryOSProxyConfig() *osProxyConfig {
	out, err := exec.Command("scutil", "--proxy").Output()
	if err != nil || len(out) == 0 {
		return nil
	}
	return parseScutilProxyOutput(out)
}

func parseScutilProxyOutput(data []byte) *osProxyConfig {
	cfg := &osProxyConfig{
		exceptions: []string{},
	}

	scanner := bufio.NewScanner(bytes.NewReader(data))
	inExceptions := false

	var (
		httpEnabled  bool
		httpHost     string
		httpPort     int
		httpsEnabled bool
		httpsHost    string
		httpsPort    int
		socksEnabled bool
		socksHost    string
		socksPort    int
	)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		if inExceptions {
			if strings.HasPrefix(line, "}") {
				inExceptions = false
				continue
			}
			// Lines like: "0 : 127.0.0.1" or "1 : localhost"
			if idx := strings.Index(line, ":"); idx != -1 {
				val := strings.TrimSpace(line[idx+1:])
				if val != "" {
					cfg.exceptions = append(cfg.exceptions, val)
				}
			}
			continue
		}

		if strings.HasPrefix(line, "ExceptionsList : <array>") {
			inExceptions = true
			continue
		}

		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])

		switch key {
		case "HTTPEnable":
			httpEnabled = (val == "1")
		case "HTTPProxy":
			httpHost = val
		case "HTTPPort":
			httpPort, _ = strconv.Atoi(val)

		case "HTTPSEnable":
			httpsEnabled = (val == "1")
		case "HTTPSProxy":
			httpsHost = val
		case "HTTPSPort":
			httpsPort, _ = strconv.Atoi(val)

		case "SOCKSEnable":
			socksEnabled = (val == "1")
		case "SOCKSProxy":
			socksHost = val
		case "SOCKSPort":
			socksPort, _ = strconv.Atoi(val)
		}
	}

	if httpEnabled && httpHost != "" && httpPort > 0 {
		if u, err := url.Parse("http://" + netJoinHostPort(httpHost, httpPort)); err == nil {
			cfg.httpProxy = u
		}
	}

	if httpsEnabled && httpsHost != "" && httpsPort > 0 {
		// macOS HTTP proxies for HTTPS traffic typically accept HTTP CONNECT
		if u, err := url.Parse("http://" + netJoinHostPort(httpsHost, httpsPort)); err == nil {
			cfg.httpsProxy = u
		}
	}

	if socksEnabled && socksHost != "" && socksPort > 0 {
		if u, err := url.Parse("socks5://" + netJoinHostPort(socksHost, socksPort)); err == nil {
			cfg.socksProxy = u
		}
	}

	return cfg
}

func netJoinHostPort(host string, port int) string {
	return host + ":" + strconv.Itoa(port)
}
