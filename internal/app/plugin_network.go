package app

import (
	"net/http"
	"time"

	"bowerbird/core"
)

// syncPluginHTTPClient wires the plugin resolver network stack to the same
// system/custom proxy transport as native URL imports.
func (a *App) syncPluginHTTPClient() {
	if a.pluginHost == nil || a.svc == nil {
		return
	}
	settings := a.svc.GetNetworkSettings()
	a.pluginHost.SetHTTPClient(&http.Client{
		Timeout:   20 * time.Second,
		Transport: core.CreateProxyTransport(settings),
	})
	core.RecordLog("info", "plugin", "Plugin HTTP client updated",
		"proxyMode="+settings.ProxyMode+" custom="+settings.CustomProxy+" timeout=20s", 0)
}
