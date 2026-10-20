import * as React from "react";
import * as ReactDOM from "react-dom";
import * as JsxRuntime from "react/jsx-runtime";
import { Events } from "@/lib/host-runtime";
import * as PluginSdk from "@bowerbird/plugin-sdk";
import type { PluginManifest } from "@bowerbird/plugin-sdk";
import type { PreviewPlugin } from "./types";
import { previewRegistry } from "./registry";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Switch } from "@workspace/ui/components/switch";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@workspace/ui/components/card";

export const DEFAULT_ASSET_BASE_URL = "http://127.0.0.1:41595";

export interface HostRuntimeBridge {
  React: typeof React;
  ReactDOM: typeof ReactDOM;
  jsxRuntime: typeof JsxRuntime;
  pluginSdk: typeof PluginSdk;
  ui: {
    Button: typeof Button;
    Badge: typeof Badge;
    Switch: typeof Switch;
    Card: typeof Card;
    CardHeader: typeof CardHeader;
    CardTitle: typeof CardTitle;
    CardDescription: typeof CardDescription;
    CardContent: typeof CardContent;
    CardFooter: typeof CardFooter;
  };
}

declare global {
  interface Window {
    React?: typeof React;
    ReactDOM?: typeof ReactDOM;
    __BOWERBIRD_RUNTIME__?: HostRuntimeBridge;
    BowerbirdHost?: HostRuntimeBridge;
  }
}

let runtimeBridgeInitialized = false;
let reactBlobUrl = "";
let jsxBlobUrl = "";
let sdkBlobUrl = "";

/**
 * Initializes the host runtime bridge on window and creates ESM shims
 * so dynamically loaded remote plugins can resolve bare specifiers.
 */
export function initHostRuntimeBridge(): HostRuntimeBridge {
  if (runtimeBridgeInitialized && window.__BOWERBIRD_RUNTIME__) {
    return window.__BOWERBIRD_RUNTIME__;
  }

  const bridge: HostRuntimeBridge = {
    React,
    ReactDOM,
    jsxRuntime: JsxRuntime,
    pluginSdk: PluginSdk,
    ui: {
      Button,
      Badge,
      Switch,
      Card,
      CardHeader,
      CardTitle,
      CardDescription,
      CardContent,
      CardFooter,
    },
  };

  if (typeof window !== "undefined") {
    window.React = React;
    window.ReactDOM = ReactDOM;
    window.__BOWERBIRD_RUNTIME__ = bridge;
    window.BowerbirdHost = bridge;

    // Create Blob URLs for ESM import resolution
    if (!reactBlobUrl) {
      reactBlobUrl = URL.createObjectURL(
        new Blob(
          [
            `const R = window.React || (window.__BOWERBIRD_RUNTIME__ && window.__BOWERBIRD_RUNTIME__.React);
export default R;
export const {
  useState, useEffect, useMemo, useCallback, useRef, useContext,
  useReducer, useLayoutEffect, useId, useTransition, useDeferredValue,
  createContext, forwardRef, memo, createElement, cloneElement, isValidElement,
  Fragment, Suspense, StrictMode
} = R;`,
          ],
          { type: "application/javascript" }
        )
      );
    }

    if (!jsxBlobUrl) {
      jsxBlobUrl = URL.createObjectURL(
        new Blob(
          [
            `const J = (window.__BOWERBIRD_RUNTIME__ && window.__BOWERBIRD_RUNTIME__.jsxRuntime) || {};
export const jsx = J.jsx;
export const jsxs = J.jsxs;
export const Fragment = J.Fragment;
export default J;`,
          ],
          { type: "application/javascript" }
        )
      );
    }

    if (!sdkBlobUrl) {
      sdkBlobUrl = URL.createObjectURL(
        new Blob(
          [
            `const S = (window.__BOWERBIRD_RUNTIME__ && window.__BOWERBIRD_RUNTIME__.pluginSdk) || {};
export const {
  definePlugin,
  formatBytes,
  getFilename,
  matchesExtensionOrMime,
  createDefaultOriginalFileHandle,
  validatePluginManifest,
  normalizePluginManifest
} = S;
export default S;`,
          ],
          { type: "application/javascript" }
        )
      );
    }
  }

  runtimeBridgeInitialized = true;
  return bridge;
}

const loadedRemotePlugins = new Map<string, PreviewPlugin>();

/**
 * Transforms external bare imports in plugin code to use host ESM blob adapters.
 */
function rewriteBareImports(code: string): string {
  initHostRuntimeBridge();

  let rewritten = code;
  if (reactBlobUrl) {
    rewritten = rewritten.replace(
      /(from\s+["'])react(["'])/g,
      `$1${reactBlobUrl}$2`
    );
  }
  if (jsxBlobUrl) {
    rewritten = rewritten.replace(
      /(from\s+["'])react\/jsx-runtime(["'])/g,
      `$1${jsxBlobUrl}$2`
    );
  }
  if (sdkBlobUrl) {
    rewritten = rewritten.replace(
      /(from\s+["'])@bowerbird\/plugin-sdk(["'])/g,
      `$1${sdkBlobUrl}$2`
    );
  }
  return rewritten;
}

/**
 * Loads a remote plugin from http://127.0.0.1:41595/asset/plugins/:pluginId/index.js
 * and registers it into the previewRegistry.
 */
export async function loadRemotePlugin(
  pluginId: string,
  assetBaseUrl: string = DEFAULT_ASSET_BASE_URL
): Promise<PreviewPlugin | null> {
  initHostRuntimeBridge();

  try {
    const pluginJsUrl = `${assetBaseUrl}/asset/plugins/${encodeURIComponent(pluginId)}/index.js`;
    const manifestUrl = `${assetBaseUrl}/asset/plugins/${encodeURIComponent(pluginId)}/manifest.json`;

    // Fetch manifest if available to enrich metadata
    let manifest: Partial<PluginManifest> = {};
    try {
      const manifestRes = await fetch(manifestUrl, { method: "GET" });
      if (manifestRes.ok) {
        manifest = await manifestRes.json();
      }
    } catch (err) {
      console.warn(`[RemoteLoader] Could not fetch manifest for ${pluginId}:`, err);
    }

    // Fetch the plugin bundle source
    const scriptRes = await fetch(pluginJsUrl, { method: "GET" });
    if (!scriptRes.ok) {
      throw new Error(`Failed to fetch plugin code: HTTP ${scriptRes.status}`);
    }
    const rawCode = await scriptRes.text();

    // Rewrite bare imports so browser can evaluate ESM without bundler
    const rewrittenCode = rewriteBareImports(rawCode);
    const blob = new Blob([rewrittenCode], { type: "application/javascript" });
    const blobUrl = URL.createObjectURL(blob);

    // Import dynamic plugin module
    // Plugin loading from a runtime registry requires dynamic import
    const mod = await import(/* @vite-ignore */ blobUrl);
    URL.revokeObjectURL(blobUrl);

    // Extract plugin object from module
    const rawPlugin = (mod.default || mod.plugin || Object.values(mod)[0]) as unknown as PreviewPlugin;
    if (!rawPlugin || typeof rawPlugin !== "object") {
      throw new Error(`Plugin entry in ${pluginId} did not export a valid plugin object`);
    }

    // Normalize plugin representation
    const plugin: PreviewPlugin = {
      ...rawPlugin,
      id: manifest.id || rawPlugin.id || pluginId,
      name: manifest.name || rawPlugin.name || pluginId,
      version: manifest.version || rawPlugin.version || "1.0.0",
      kind: manifest.kind || rawPlugin.kind || "preview",
      priority: manifest.priority ?? rawPlugin.priority ?? 50,
      extensions: (manifest.extensions || rawPlugin.extensions || []).map((ext: string) =>
        ext.toLowerCase().replace(/^\./, "")
      ),
      mimePrefixes: manifest.mimePrefixes || rawPlugin.mimePrefixes || [],
      supportsZoom: manifest.supportsZoom ?? rawPlugin.supportsZoom ?? false,
      builtin: false,
      canDisable: true,
      internal: false,
    };

    // Register into previewRegistry
    previewRegistry.register(plugin);
    loadedRemotePlugins.set(plugin.id, plugin);
    console.info(`[RemoteLoader] Successfully loaded remote plugin: ${plugin.id} (${plugin.name})`);
    return plugin;
  } catch (err) {
    console.error(`[RemoteLoader] Failed to load remote plugin ${pluginId}:`, err);
    return null;
  }
}

/**
 * Probes the desktop backend for installed plugins and loads all of them.
 */
export async function loadAllInstalledPlugins(
  assetBaseUrl: string = DEFAULT_ASSET_BASE_URL
): Promise<void> {
  initHostRuntimeBridge();

  try {
    const res = await fetch(`${assetBaseUrl}/api/plugins`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      return;
    }
    const json = await res.json();
    const list: Array<{ id: string; name?: string; enabled?: boolean }> = json?.data || [];

    for (const item of list) {
      await loadRemotePlugin(item.id, assetBaseUrl);
      if (item.enabled === false) {
        previewRegistry.setEnabled(item.id, false);
      }
    }
  } catch (err) {
    // Desktop API server might not be running in tests or browser dev
    console.debug("[RemoteLoader] Could not fetch installed plugins from desktop:", err);
  }
}

/**
 * Subscribes to Wails backend events for plugin lifecycle updates.
 */
export function initRemotePluginRuntime(
  assetBaseUrl: string = DEFAULT_ASSET_BASE_URL
): () => void {
  initHostRuntimeBridge();
  loadAllInstalledPlugins(assetBaseUrl);

  const unsubscribe = Events.On("plugin:changed", (event: unknown) => {
    if (!event || typeof event !== "object" || !("data" in event)) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    const action = "action" in data && typeof data.action === "string" ? data.action : "";
    const id = "id" in data && typeof data.id === "string" ? data.id : "";
    if (!id) return;

    if (action === "installed" || action === "updated") {
      loadRemotePlugin(id, assetBaseUrl);
    } else if (action === "scanned") {
      loadAllInstalledPlugins(assetBaseUrl);
    } else if (action === "uninstalled") {
      previewRegistry.unregister(id);
      loadedRemotePlugins.delete(id);
    } else if (action === "enabled") {
      previewRegistry.setEnabled(id, true);
    } else if (action === "disabled") {
      previewRegistry.setEnabled(id, false);
    }
  });

  return unsubscribe;
}
