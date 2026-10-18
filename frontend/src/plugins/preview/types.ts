import type React from "react";
import type { Item } from "../../../bindings/bowerbird/core/models";
import {
  SaveItemThumbnail,
  OpenWithDefaultApp,
  RevealInFinder,
  UpdateItemDetails,
  OpenExternalURL,
} from "../../../bindings/bowerbird/core/service";

import type {
  OriginalFileHandle,
  ItemDetailsPatch,
  PreviewZoomController,
  PreviewPluginHostAPI as BasePreviewPluginHostAPI,
  PreviewViewportProps as BasePreviewViewportProps,
  PreviewInspectorProps as BasePreviewInspectorProps,
  InspectorExtensionProps as BaseInspectorExtensionProps,
  PreviewPlugin as BasePreviewPlugin,
  PluginKind,
  PluginManifest,
  PluginItem,
  ContextMenuTarget,
  PluginContextMenuContext,
  PluginContextMenuItem,
  PluginContextMenuFolder,
} from "@bowerbird/plugin-sdk";

export type {
  OriginalFileHandle,
  ItemDetailsPatch,
  PreviewZoomController,
  PluginKind,
  PluginManifest,
  PluginItem,
  ContextMenuTarget,
  PluginContextMenuContext,
  PluginContextMenuItem,
  PluginContextMenuFolder,
};
export type PreviewPluginHostAPI = BasePreviewPluginHostAPI<Item>;

export interface PreviewViewportProps extends Omit<BasePreviewViewportProps<Item>, "controllerRef"> {
  controllerRef: React.MutableRefObject<PreviewZoomController | null>;
}

export type PreviewInspectorProps = BasePreviewInspectorProps<Item>;
export type InspectorExtensionProps = BaseInspectorExtensionProps<Item>;

export interface PreviewPlugin extends BasePreviewPlugin<Item> {
  Viewport?: React.ComponentType<PreviewViewportProps>;
}

export { definePlugin } from "@bowerbird/plugin-sdk";
/**
 * Creates a bound PreviewPluginHostAPI instance for a given `Item`.
 */
export function createPreviewPluginHostAPI(
  item: Item,
  onItemUpdated?: (updated: Item) => void
): PreviewPluginHostAPI {
  return {
    getOriginalFile: () => {
      const url = item.originalUrl || "";
      return {
        url,
        filePath: item.filePath || "",
        fileUrl: item.fileUrl || "",
        downloadUrl: item.downloadUrl || "",
        mimeType: item.mimeType || "application/octet-stream",
        extension: (item.extension || "").toLowerCase(),
        size: item.size || 0,
        fetchBlob: async (rangeHeader?: string) => {
          const headers: Record<string, string> = {};
          if (rangeHeader) headers["Range"] = rangeHeader;
          const res = await fetch(url, { headers });
          if (!res.ok) {
            throw new Error(`Failed to fetch original file: HTTP ${res.status}`);
          }
          return res.blob();
        },
        fetchArrayBuffer: async (rangeHeader?: string) => {
          const headers: Record<string, string> = {};
          if (rangeHeader) headers["Range"] = rangeHeader;
          const res = await fetch(url, { headers });
          if (!res.ok) {
            throw new Error(`Failed to fetch original file: HTTP ${res.status}`);
          }
          return res.arrayBuffer();
        },
      };
    },
    getCoverUrl: () => {
      if (item.hasThumbnail && item.thumbnailUrl) {
        return item.thumbnailUrl;
      }
      return undefined;
    },
    saveCoverThumbnail: async (base64Image, options) => {
      const force = options?.force ?? false;
      if (item.hasThumbnail && item.dominantColor && !force) {
        return item;
      }
      const w = options?.width ?? item.width ?? 0;
      const h = options?.height ?? item.height ?? 0;

      // 1. Try HTTP AssetServer POST endpoint first (works in both Wails desktop & browser dev mode)
      if (item.thumbnailUrl) {
        try {
          const res = await fetch(item.thumbnailUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              base64Data: base64Image,
              width: w,
              height: h,
            }),
          });
          if (res.ok) {
            const updated = (await res.json()) as Item;
            onItemUpdated?.(updated);
            return updated;
          }
        } catch {
          // Fall through to Wails RPC binding
        }
      }

      // 2. Fallback to Wails RPC binding
      try {
        const updated = await SaveItemThumbnail(item.id, base64Image, w, h);
        if (updated) {
          onItemUpdated?.(updated);
        }
        return updated;
      } catch {
        return null;
      }
    },
    openWithDefaultApp: async () => {
      await OpenWithDefaultApp(item.id);
    },
    revealInFinder: async () => {
      await RevealInFinder(item.id);
    },
    openExternalURL: async (rawUrl: string) => {
      await OpenExternalURL(rawUrl);
    },
    updateItemDetails: async (patch: ItemDetailsPatch) => {
      try {
        const updated = await UpdateItemDetails(
          item.id,
          patch.note !== undefined ? patch.note : item.note || "",
          patch.url !== undefined ? patch.url : item.url || "",
          patch.rating !== undefined ? patch.rating : item.rating || 0,
          patch.prompt !== undefined ? patch.prompt : item.prompt || ""
        );
        if (updated) {
          onItemUpdated?.(updated);
        }
        return updated;
      } catch {
        return null;
      }
    },
    getTheme: () => {
      if (typeof document !== "undefined") {
        return document.documentElement.classList.contains("dark") ? "dark" : "light";
      }
      return "dark";
    },
    subscribeTheme: (cb) => {
      if (typeof window === "undefined" || typeof document === "undefined") {
        return () => {};
      }
      const notify = () => {
        const mode = document.documentElement.classList.contains("dark") ? "dark" : "light";
        cb(mode);
      };
      const observer = new MutationObserver(() => notify());
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    },
    onItemUpdated,
  };
}
