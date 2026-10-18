//go:build !darwin && !windows

package core

func queryOSProxyConfig() *osProxyConfig {
	// On Linux and other UNIX systems, http.ProxyFromEnvironment
	// (which reads HTTP_PROXY, HTTPS_PROXY, ALL_PROXY, NO_PROXY) is the standard mechanism.
	return nil
}
