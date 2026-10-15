import type React from "react";
import type { Item } from "../../../bindings/bowerbird/core/models";
import {
  SaveItemThumbnail,
  OpenWithDefaultApp,
  RevealInFinder,
} from "../../../bindings/bowerbird/core/service";

export interface PreviewZoomController {
  scale: number;
  setScale: (newScale: number) => void;
  actualSize: () => void;
  zoomToFit: () => void;
}

export interface OriginalFileHandle {
  /** HTTP streaming URL for Range/MSE/fetch requests */
  url: string;
  /** Physical local filesystem path */
  filePath: string;
  /** RFC file:// URI */
  fileUrl: string;
  /** HTTP attachment download URL */
  downloadUrl: string;
  /** Detected MIME type */
  mimeType: string;
  /** Lowercase file extension without dot */
  extension: string;
  /** File size in bytes */
  size: number;
  /** Fetches the original file (or byte range) as a Blob */
  fetchBlob: (rangeHeader?: string) => Promise<Blob>;
  /** Fetches the original file (or byte range) as an ArrayBuffer */
  fetchArrayBuffer: (rangeHeader?: string) => Promise<ArrayBuffer>;
}

/**
 * Host capabilities exposed to every PreviewPlugin in both Viewport and InspectorPreview.
 */
export interface PreviewPluginHostAPI {
  /** Returns structured access to the original physical file and HTTP stream */
  getOriginalFile: () => OriginalFileHandle;
  /** Returns the current cover/thumbnail URL if available (cache-busted when updated) */
  getCoverUrl: () => string | undefined;
  /**
   * Saves a base64-encoded image (data URL or raw base64) as the item's cover `thumbnail.jpg`
   * and triggers backend perceptual color palette + dominant color + metadata extraction
   * so the item becomes searchable by color filter.
   *
   * @param base64Image PNG or JPEG base64 string
   * @param options.width Optional intrinsic media width
   * @param options.height Optional intrinsic media height
   * @param options.force If false (default), preserves existing cover if `item.hasThumbnail` is already true
   */
  saveCoverThumbnail: (
    base64Image: string,
    options?: { width?: number; height?: number; force?: boolean }
  ) => Promise<Item | null>;
  /** Opens the original file with the OS default application */
  openWithDefaultApp: () => Promise<void>;
  /** Reveals the original file in macOS Finder / Windows Explorer */
  revealInFinder: () => Promise<void>;
  /** Notifies the host workspace to refresh item state */
  onItemUpdated?: (updated: Item) => void;
}

export interface PreviewViewportProps {
  item: Item;
  mode: "inline" | "full-window";
  scale: number;
  onScaleChange: (scale: number) => void;
  controllerRef: React.MutableRefObject<PreviewZoomController | null>;
  api: PreviewPluginHostAPI;
}

export interface PreviewInspectorProps {
  item: Item;
  onOpenPreview?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  api: PreviewPluginHostAPI;
}

export interface PreviewPlugin {
  /** Unique identifier of the built-in or custom preview plugin */
  id: string;
  /** Human-readable name */
  name: string;
  /** Higher priority plugins are evaluated first (fallback = 0) */
  priority: number;
  /** Supported lowercase file extensions without leading dot */
  extensions?: string[];
  /** Supported MIME type prefixes (e.g. "image/", "video/") */
  mimePrefixes?: string[];
  /** Optional custom predicate for matching an item */
  match?: (item: Item) => boolean;
  /** Whether the main header should render ZoomControls for this plugin */
  supportsZoom?: boolean;
  /** Main viewport renderer (used by both inline and full-window QuickLook preview) */
  Viewport: React.ComponentType<PreviewViewportProps>;
  /** Borderless adaptive inspector preview renderer for the right detail panel */
  InspectorPreview: React.ComponentType<PreviewInspectorProps>;
}

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
    onItemUpdated,
  };
}
