import type {
  PluginDefinition,
  PluginItem,
  PluginLogLevel,
  PluginManifest,
} from "./types";

/** Marks a plugin module for editor completion. It is a no-op at runtime. */
export function definePlugin<T extends PluginDefinition>(plugin: T): T {
  return plugin;
}

/** Formats a byte size into a compact human-readable string. */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/** Returns the final path/URL segment. */
export function getFilename(pathOrUrl: string): string {
  const normalized = String(pathOrUrl || "").replace(/\\/g, "/");
  return normalized.split("/").pop() || "";
}

/** Returns the lowercase extension without a leading dot. */
export function extensionOf(item: Pick<PluginItem, "extension" | "filename">): string {
  const fromItem = String(item.extension || "").replace(/^\./, "").toLowerCase();
  if (fromItem) return fromItem;
  const name = String(item.filename || "");
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Checks an item against extension and MIME declarations. */
export function matchesItem(
  item: Pick<PluginItem, "extension" | "mimeType">,
  extensions?: string[],
  mimePrefixes?: string[]
): boolean {
  const ext = String(item.extension || "").replace(/^\./, "").toLowerCase();
  const mime = String(item.mimeType || "").toLowerCase();

  if (extensions?.some((candidate) => candidate.replace(/^\./, "").toLowerCase() === ext)) {
    return true;
  }
  for (const prefix of mimePrefixes ?? []) {
    const p = prefix.toLowerCase();
    if (p.endsWith("/") ? mime.startsWith(p) : mime === p || mime.startsWith(`${p}/`) || mime.startsWith(`${p};`)) {
      return true;
    }
  }
  return false;
}

/** Reads a plugin setting, falling back when the host has no value yet. */
export function setting(key: string, fallback = ""): string {
  if (typeof globalThis === "undefined" || !globalThis.host) return fallback;
  return globalThis.host.settings.get(key, fallback);
}

/** Returns true when the current manifest describes a native-only plugin. */
export function isNativePlugin(manifest: PluginManifest): boolean {
  return Boolean(manifest.native ?? manifest.preview?.renderer);
}

/** Writes one line to the host's unified plugin log. */
export function log(message: string, detail?: string): void;
export function log(level: PluginLogLevel, message: string, detail?: string): void;
export function log(levelOrMessage: PluginLogLevel | string, messageOrDetail = "", detail = ""): void {
  const host = globalThis.host;
  if (!host || typeof host.log !== "function") return;
  if (["trace", "debug", "info", "warn", "error"].includes(levelOrMessage)) {
    host.log(levelOrMessage as PluginLogLevel, messageOrDetail, detail);
    return;
  }
  host.log(levelOrMessage, messageOrDetail);
}
