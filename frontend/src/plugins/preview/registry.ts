import { useSyncExternalStore } from "react";
import type { Item } from "../../../bindings/bowerbird/core/models";
import type { PreviewPlugin } from "./types";
import { ImagePreviewPlugin } from "./builtin/image-plugin";
import { VideoPreviewPlugin } from "./builtin/video-plugin";
import { FallbackPreviewPlugin } from "./builtin/fallback-plugin";

const DISABLED_PLUGINS_STORAGE_KEY = "bowerbird-disabled-preview-plugins";

function loadDisabledPluginIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISABLED_PLUGINS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((id): id is string => typeof id === "string"));
    }
  } catch {
    // Ignore corrupt localStorage entries
  }
  return new Set();
}

function saveDisabledPluginIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DISABLED_PLUGINS_STORAGE_KEY,
      JSON.stringify(Array.from(ids))
    );
  } catch {
    // Ignore storage quota errors
  }
}

export interface PreviewPluginStatus {
  plugin: PreviewPlugin;
  enabled: boolean;
  canDisable: boolean;
}

export class PreviewPluginRegistry {
  private plugins: PreviewPlugin[] = [];
  private disabledIds: Set<string>;
  private listeners: Set<() => void> = new Set();
  private snapshotCache: readonly PreviewPluginStatus[] = [];

  constructor(initialPlugins: PreviewPlugin[] = []) {
    this.disabledIds = loadDisabledPluginIds();
    for (const plugin of initialPlugins) {
      this.register(plugin);
    }
    this.rebuildSnapshot();

    if (typeof window !== "undefined") {
      window.addEventListener("storage", (e) => {
        if (e.key === DISABLED_PLUGINS_STORAGE_KEY) {
          this.disabledIds = loadDisabledPluginIds();
          this.sanitizeDisabledIds();
          this.notify();
        }
      });
    }
  }

  private canPluginDisable(plugin: PreviewPlugin): boolean {
    if (plugin.canDisable === false) return false;
    if (plugin.builtin) return false;
    return plugin.canDisable ?? true;
  }

  private sanitizeDisabledIds(): void {
    let changed = false;
    for (const plugin of this.plugins) {
      if (!this.canPluginDisable(plugin) && this.disabledIds.has(plugin.id)) {
        this.disabledIds.delete(plugin.id);
        changed = true;
      }
    }
    if (changed) {
      saveDisabledPluginIds(this.disabledIds);
    }
  }

  private rebuildSnapshot(): void {
    this.snapshotCache = this.plugins
      .filter((p) => !p.internal)
      .map((plugin) => {
        const canDisable = this.canPluginDisable(plugin);
        const enabled = canDisable ? !this.disabledIds.has(plugin.id) : true;
        return {
          plugin,
          enabled,
          canDisable,
        };
      });
  }

  private notify(): void {
    this.rebuildSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): readonly PreviewPluginStatus[] => {
    return this.snapshotCache;
  };

  /**
   * Registers a new preview plugin or replaces an existing one with the same id.
   * Plugins are automatically sorted by descending priority.
   */
  register(plugin: PreviewPlugin): void {
    this.plugins = this.plugins.filter((p) => p.id !== plugin.id);
    this.plugins.push(plugin);
    this.plugins.sort((a, b) => b.priority - a.priority);
    this.sanitizeDisabledIds();
    this.notify();
  }

  /**
   * Unregisters a preview plugin by id.
   * Built-in non-disableable plugins cannot be unregistered.
   */
  unregister(pluginId: string): void {
    const target = this.plugins.find((p) => p.id === pluginId);
    if (!target || !this.canPluginDisable(target)) {
      return;
    }
    this.plugins = this.plugins.filter((p) => p.id !== pluginId);
    this.notify();
  }

  /**
   * Returns whether a given plugin is currently enabled.
   */
  isEnabled(pluginId: string): boolean {
    const plugin = this.plugins.find((p) => p.id === pluginId);
    if (!plugin) return false;
    if (!this.canPluginDisable(plugin)) return true;
    return !this.disabledIds.has(pluginId);
  }

  /**
   * Enables or disables a plugin if it allows disabling.
   * Built-in core plugins (Image, Video) cannot be disabled.
   */
  setEnabled(pluginId: string, enabled: boolean): boolean {
    const plugin = this.plugins.find((p) => p.id === pluginId);
    if (!plugin || !this.canPluginDisable(plugin)) {
      return false;
    }
    if (enabled) {
      this.disabledIds.delete(pluginId);
    } else {
      this.disabledIds.add(pluginId);
    }
    saveDisabledPluginIds(this.disabledIds);
    this.notify();
    return true;
  }

  /**
   * Returns all registered preview plugins ordered by priority.
   */
  getAll(): readonly PreviewPlugin[] {
    return this.plugins;
  }

  /**
   * Returns all user-visible installed plugins with their enabled and lock states.
   */
  getInstalledPlugins(): readonly PreviewPluginStatus[] {
    return this.snapshotCache;
  }

  /**
   * Resolves the highest-priority enabled preview plugin capable of rendering `item`.
   */
  resolve(item: Item | null | undefined): PreviewPlugin {
    if (!item) return FallbackPreviewPlugin;
    const ext = (item.extension || "").toLowerCase();
    const mime = (item.mimeType || "").toLowerCase();

    for (const plugin of this.plugins) {
      if (!this.isEnabled(plugin.id)) {
        continue;
      }
      if (plugin.match && plugin.match(item)) {
        return plugin;
      }
      if (plugin.extensions && ext && plugin.extensions.includes(ext)) {
        return plugin;
      }
      if (
        plugin.mimePrefixes &&
        mime &&
        plugin.mimePrefixes.some((prefix) => mime.startsWith(prefix.toLowerCase()))
      ) {
        return plugin;
      }
    }

    return FallbackPreviewPlugin;
  }
}

/**
 * Singleton registry pre-populated with built-in preview plugins.
 */
export const previewRegistry = new PreviewPluginRegistry([
  ImagePreviewPlugin,
  VideoPreviewPlugin,
  FallbackPreviewPlugin,
]);

/**
 * React hook subscribing to the installed preview plugins and their state.
 */
export function usePreviewPlugins(): readonly PreviewPluginStatus[] {
  return useSyncExternalStore(
    previewRegistry.subscribe,
    previewRegistry.getSnapshot,
    previewRegistry.getSnapshot
  );
}

export * from "./types";
export {
  ImagePreviewPlugin,
  VideoPreviewPlugin,
  FallbackPreviewPlugin,
};
