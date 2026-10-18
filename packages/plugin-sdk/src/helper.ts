import type { OriginalFileHandle, PluginItem, PreviewPlugin } from "./types";

/**
 * Type-safe helper to define a Bowerbird preview or metadata plugin.
 */
export function definePlugin<TItem = PluginItem>(
  plugin: PreviewPlugin<TItem>
): PreviewPlugin<TItem> {
  return plugin;
}

/**
 * Formats a byte size into a human-readable string (e.g. "1.2 MB").
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeI = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, safeI)).toFixed(dm))} ${sizes[safeI]}`;
}

/**
 * Extracts the filename from a file path or URL.
 */
export function getFilename(pathOrUrl: string): string {
  const normalized = pathOrUrl.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "";
}

/**
 * Checks if a given item matches extension and MIME patterns.
 */
export function matchesExtensionOrMime(
  item: { extension?: string; mimeType?: string },
  extensions?: string[],
  mimePrefixes?: string[]
): boolean {
  const ext = (item.extension || "").toLowerCase().replace(/^\./, "");
  const mime = (item.mimeType || "").toLowerCase();

  if (extensions && extensions.length > 0) {
    const normExtensions = extensions.map((e) => e.toLowerCase().replace(/^\./, ""));
    if (normExtensions.includes(ext)) {
      return true;
    }
  }

  if (mimePrefixes && mimePrefixes.length > 0) {
    for (const prefix of mimePrefixes) {
      const normPrefix = prefix.toLowerCase();
      if (normPrefix.endsWith("/")) {
        if (mime.startsWith(normPrefix)) return true;
      } else {
        if (mime === normPrefix || mime.startsWith(`${normPrefix}/`)) return true;
      }
    }
  }

  return false;
}

/**
 * Constructs a default OriginalFileHandle for an item.
 */
export function createDefaultOriginalFileHandle(item: PluginItem): OriginalFileHandle {
  const url = item.originalUrl || item.fileUrl || "";
  return {
    url,
    filePath: item.filePath || "",
    fileUrl: item.fileUrl || "",
    downloadUrl: item.downloadUrl || url,
    mimeType: item.mimeType || "application/octet-stream",
    extension: (item.extension || "").toLowerCase().replace(/^\./, ""),
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
    fetchText: async (rangeHeader?: string) => {
      const headers: Record<string, string> = {};
      if (rangeHeader) headers["Range"] = rangeHeader;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch original file: HTTP ${res.status}`);
      }
      return res.text();
    },
  };
}
