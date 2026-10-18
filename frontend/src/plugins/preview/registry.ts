import { useSyncExternalStore } from "react";
import type { Item } from "../../../bindings/bowerbird/core/models";
import type {
  PreviewPlugin,
  ContextMenuTarget,
  PluginContextMenuContext,
  PluginContextMenuItem,
} from "./types";
import { ImagePreviewPlugin } from "./builtin/image-plugin";
import { VideoPreviewPlugin } from "./builtin/video-plugin";
import { FallbackPreviewPlugin } from "./builtin/fallback-plugin";
import { PromptMetadataPlugin } from "./builtin/prompt-plugin";
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
      if ((plugin.kind && plugin.kind !== "preview") || !plugin.Viewport || !plugin.InspectorPreview) {
        continue;
      }
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

  /**
   * Resolves all currently enabled plugins that provide an `InspectorExtension`
   * matching `item`.
   */
  resolveInspectorExtensions(item: Item | null | undefined): PreviewPlugin[] {
    if (!item) return [];
    const ext = (item.extension || "").toLowerCase();
    const mime = (item.mimeType || "").toLowerCase();
    const matched: PreviewPlugin[] = [];

    for (const plugin of this.plugins) {
      if (!plugin.InspectorExtension || !this.isEnabled(plugin.id)) {
        continue;
      }
      if (plugin.match) {
        if (plugin.match(item)) matched.push(plugin);
        continue;
      }
      if (plugin.extensions && plugin.extensions.length > 0) {
        if (ext && plugin.extensions.includes(ext)) matched.push(plugin);
        continue;
      }
      if (plugin.mimePrefixes && plugin.mimePrefixes.length > 0) {
        if (
          mime &&
          plugin.mimePrefixes.some((prefix) => mime.startsWith(prefix.toLowerCase()))
        ) {
          matched.push(plugin);
        }
        continue;
      }
      matched.push(plugin);
    }

    return matched;
  }

  /**
   * Resolves all enabled context menu items matching the given target and context.
   */
  resolveContextMenuItems(
    target: ContextMenuTarget,
    context: PluginContextMenuContext<Item>
  ): PluginContextMenuItem<Item>[] {
    const matched: PluginContextMenuItem<Item>[] = [];

    for (const plugin of this.plugins) {
      if (!this.isEnabled(plugin.id)) continue;

      let items: PluginContextMenuItem<Item>[] = [];
      if (plugin.contextMenus && Array.isArray(plugin.contextMenus)) {
        items = plugin.contextMenus.filter((m) => m.target === target);
      }
      if (plugin.getContextMenuItems) {
        try {
          const dynamicItems = plugin.getContextMenuItems(target, context);
          if (Array.isArray(dynamicItems)) {
            items = [...items, ...dynamicItems];
          }
        } catch (err) {
          console.error(`[PluginRegistry] Error resolving dynamic context menus for ${plugin.id}:`, err);
        }
      }

      for (const item of items) {
        if (typeof item.hidden === "function") {
          try {
            if (item.hidden(context)) continue;
          } catch {
            continue;
          }
        } else if (item.hidden === true) {
          continue;
        }

        if (target === "file" && item.extensions && item.extensions.length > 0) {
          const targetItems = context.items || [];
          const anyMatches = targetItems.some((it) => {
            const ext = (it.extension || "").toLowerCase();
            return item.extensions!.some((e) => e.toLowerCase() === ext);
          });
          if (!anyMatches && targetItems.length > 0) {
            continue;
          }
        }

        matched.push(item);
      }
    }

    return matched;
  }

  /**
   * Dynamically loads and registers a remote plugin from an ES module URL.
   */
  async loadPluginFromUrl(moduleUrl: string): Promise<PreviewPlugin | null> {
    try {
      const mod = await import(/* @vite-ignore */ moduleUrl);
      const plugin: PreviewPlugin = mod.default || mod.plugin || mod;
      if (plugin && plugin.id && plugin.name) {
        this.register(plugin);
        return plugin;
      }
      return null;
    } catch (err) {
      console.error(`Failed to load plugin from ${moduleUrl}:`, err);
      return null;
    }
  }
}

/**
 * Singleton registry pre-populated with built-in preview and metadata plugins.
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
  PromptMetadataPlugin,
  FallbackPreviewPlugin,
};
