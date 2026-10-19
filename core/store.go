package core

import (
	"os"
	"strings"
)

// The plugin store is the app's single configurable address: it serves the store
// front end, per-plugin metadata and the plugin archives, so no distribution host
// is hardcoded in the app.
//
// The build injects it from the environment through the linker, e.g.
//
//	go build -ldflags "-X bowerbird/core.storeURL=https://plugins.example.com"
//
// The same environment variable overrides the injected value at runtime, so dev
// builds and tests can point at a local store without rebuilding. A build with no
// store injected simply has no plugin store: OpenMarketplace reports it and the
// store fallback downloads are skipped instead of hitting a vendor host.
var storeURL string // injected from EnvPluginStoreURL

// EnvPluginStoreURL is the store base URL (front end, store API and plugin files).
const EnvPluginStoreURL = "PLUGIN_STORE_URL"

// storeRoutes are the per-plugin paths the store serves (see
// apps/marketplace/src/lib/server-api.ts).
const (
	storePluginsPath  = "/api/plugins"
	storeManifestPath = "/manifest.json"
	storeDownloadPath = "/download"
)

// resolveStoreEndpoint prefers the runtime environment override, then the value
// injected at build time, trimming trailing slashes so paths can be appended
// unconditionally.
func resolveStoreEndpoint(envKey, injected string) string {
	value := strings.TrimSpace(os.Getenv(envKey))
	if value == "" {
		value = strings.TrimSpace(injected)
	}
	return strings.TrimRight(value, "/")
}

// PluginStoreURL returns the configured plugin store URL, or "" when unset.
func PluginStoreURL() string {
	return resolveStoreEndpoint(EnvPluginStoreURL, storeURL)
}

// PluginManifestURL returns the store's manifest URL for a plugin, or "" when no
// store is configured.
func PluginManifestURL(pluginID string) string {
	store := PluginStoreURL()
	if store == "" {
		return ""
	}
	return store + storePluginsPath + "/" + pluginID + storeManifestPath
}

// PluginDownloadURL returns the store's archive URL for a plugin, or "" when no
// store is configured. The store resolves the current version and redirects to
// (or serves) the matching plugin zip.
func PluginDownloadURL(pluginID string) string {
	store := PluginStoreURL()
	if store == "" {
		return ""
	}
	return store + storePluginsPath + "/" + pluginID + storeDownloadPath
}

// pluginAssetURL returns the store URL of a file inside a plugin bundle, or ""
// when no store is configured.
func pluginAssetURL(pluginID, relativePath string) string {
	store := PluginStoreURL()
	if store == "" {
		return ""
	}
	return store + storePluginsPath + "/" + pluginID + "/" + relativePath
}
