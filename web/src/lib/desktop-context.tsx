import * as React from "react";
import type { MarketplacePlugin } from "../data/plugins";

export interface InstalledPluginStatus {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
}

export interface DesktopContextValue {
  connected: boolean;
  checking: boolean;
  installedPlugins: Map<string, InstalledPluginStatus>;
  installingId: string | null;
  refresh: () => Promise<void>;
  installViaProtocol: (plugin: MarketplacePlugin) => void;
  installViaAPI: (plugin: MarketplacePlugin) => Promise<boolean>;
}

export const DesktopContext = React.createContext<DesktopContextValue>({
  connected: false,
  checking: true,
  installedPlugins: new Map(),
  installingId: null,
  refresh: async () => {},
  installViaProtocol: () => {},
  installViaAPI: async () => false,
});

export const DESKTOP_API_BASE = "http://127.0.0.1:41595";

export function DesktopProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = React.useState<boolean>(false);
  const [checking, setChecking] = React.useState<boolean>(true);
  const [installedPlugins, setInstalledPlugins] = React.useState<Map<string, InstalledPluginStatus>>(new Map());
  const [installingId, setInstallingId] = React.useState<string | null>(null);

  const checkConnection = React.useCallback(async () => {
    try {
      const pingRes = await fetch(`${DESKTOP_API_BASE}/api/ping`, {
        method: "GET",
        signal: AbortSignal.timeout(1500),
      });
      if (!pingRes.ok) {
        setConnected(false);
        setChecking(false);
        return;
      }
      setConnected(true);

      const pluginsRes = await fetch(`${DESKTOP_API_BASE}/api/plugins`, {
        method: "GET",
        signal: AbortSignal.timeout(1500),
      });
      if (pluginsRes.ok) {
        const json = await pluginsRes.json();
        const list: InstalledPluginStatus[] = json?.data || [];
        const nextMap = new Map<string, InstalledPluginStatus>();
        for (const item of list) {
          nextMap.set(item.id, item);
        }
        setInstalledPlugins(nextMap);
      }
    } catch {
      setConnected(false);
    } finally {
      setChecking(false);
    }
  }, []);

  React.useEffect(() => {
    checkConnection();
    const timer = setInterval(checkConnection, 6000);
    return () => clearInterval(timer);
  }, [checkConnection]);

  const installViaProtocol = React.useCallback((plugin: MarketplacePlugin) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const manifestUrl = plugin.manifestUrl.startsWith("http")
      ? plugin.manifestUrl
      : `${origin}${plugin.manifestUrl}`;
    const uri = `bowerbird://plugin/install?manifest=${encodeURIComponent(manifestUrl)}&id=${encodeURIComponent(plugin.id)}&version=${encodeURIComponent(plugin.version)}`;
    if (typeof window !== "undefined") {
      window.location.href = uri;
    }
  }, []);

  const installViaAPI = React.useCallback(
    async (plugin: MarketplacePlugin): Promise<boolean> => {
      setInstallingId(plugin.id);
      try {
        const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
        const manifestUrl = plugin.manifestUrl.startsWith("http")
          ? plugin.manifestUrl
          : `${origin}${plugin.manifestUrl}`;
        const res = await fetch(`${DESKTOP_API_BASE}/api/plugin/install?auto=true`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manifestUrl,
            id: plugin.id,
            version: plugin.version,
            name: plugin.name,
            autoInstall: true,
          }),
        });
        if (res.ok) {
          await checkConnection();
          return true;
        }
        // Fallback to protocol
        installViaProtocol(plugin);
        return true;
      } catch {
        installViaProtocol(plugin);
        return false;
      } finally {
        setInstallingId(null);
      }
    },
    [checkConnection, installViaProtocol]
  );

  return (
    <DesktopContext.Provider
      value={{
        connected,
        checking,
        installedPlugins,
        installingId,
        refresh: checkConnection,
        installViaProtocol,
        installViaAPI,
      }}
    >
      {children}
    </DesktopContext.Provider>
  );
}
