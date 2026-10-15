import type { Item } from "../../../bindings/bowerbird/core/models";
import type { PreviewPlugin } from "./types";
import { ImagePreviewPlugin } from "./builtin/image-plugin";
import { VideoPreviewPlugin } from "./builtin/video-plugin";
import { AudioPreviewPlugin } from "./builtin/audio-plugin";
import { DocumentPreviewPlugin } from "./builtin/document-plugin";
import { FallbackPreviewPlugin } from "./builtin/fallback-plugin";

export class PreviewPluginRegistry {
  private plugins: PreviewPlugin[] = [];

  constructor(initialPlugins: PreviewPlugin[] = []) {
    for (const plugin of initialPlugins) {
      this.register(plugin);
    }
  }

  /**
   * Registers a new preview plugin or replaces an existing one with the same id.
   * Plugins are automatically sorted by descending priority.
   */
  register(plugin: PreviewPlugin): void {
    this.plugins = this.plugins.filter((p) => p.id !== plugin.id);
    this.plugins.push(plugin);
    this.plugins.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Unregisters a preview plugin by id.
   */
  unregister(pluginId: string): void {
    this.plugins = this.plugins.filter((p) => p.id !== pluginId);
  }

  /**
   * Returns all registered preview plugins ordered by priority.
   */
  getAll(): readonly PreviewPlugin[] {
    return this.plugins;
  }

  /**
   * Resolves the highest-priority preview plugin capable of rendering `item`.
   */
  resolve(item: Item | null | undefined): PreviewPlugin {
    if (!item) return FallbackPreviewPlugin;
    const ext = (item.extension || "").toLowerCase();
    const mime = (item.mimeType || "").toLowerCase();

    for (const plugin of this.plugins) {
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
 * Singleton registry pre-populated with all built-in preview plugins.
 */
export const previewRegistry = new PreviewPluginRegistry([
  ImagePreviewPlugin,
  VideoPreviewPlugin,
  AudioPreviewPlugin,
  DocumentPreviewPlugin,
  FallbackPreviewPlugin,
]);

export * from "./types";
export {
  ImagePreviewPlugin,
  VideoPreviewPlugin,
  AudioPreviewPlugin,
  DocumentPreviewPlugin,
  FallbackPreviewPlugin,
};
