// Bowerbird Desktop API Client for Browser Extension
import { browser } from "wxt/browser";

export interface LibraryInfo {
  id: string;
  name: string;
  path: string;
  itemCount: number;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string;
  sortOrder?: number;
  itemCount?: number;
  children?: Folder[];
}

export interface Tag {
  name: string;
  itemCount: number;
}

export interface Item {
  id: string;
  name: string;
  extension: string;
  filename: string;
  size: number;
  mimeType: string;
  width: number;
  height: number;
  url: string;
  note: string;
  tags: string[];
  folders: string[];
}

export interface APIStatusResult {
  connected: boolean;
  libraryName?: string;
  itemCount?: number;
  port?: number;
  error?: string;
}

export interface AppRunningStatus {
  running: boolean;
  hasActiveLibrary: boolean;
  libraryName?: string;
  itemCount?: number;
  port?: number;
  error?: string;
}

export interface FlatFolder {
  id: string;
  name: string;
  path: string;
  itemCount: number;
}

export function flattenFolders(folders: Folder[], prefix = ""): FlatFolder[] {
  const result: FlatFolder[] = [];
  for (const f of folders) {
    const fullPath = prefix ? `${prefix} / ${f.name}` : f.name;
    result.push({
      id: f.id,
      name: f.name,
      path: fullPath,
      itemCount: f.itemCount || 0,
    });
    if (f.children && f.children.length > 0) {
      result.push(...flattenFolders(f.children, fullPath));
    }
  }
  return result;
}

export const DEFAULT_API_URL = "http://127.0.0.1:41595";

export function isContentScript(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const extUrl = browser?.runtime?.getURL?.("");
    if (!extUrl) return false;
    // An extension page (popup, options, background) starts with the extension base URL.
    // A webpage content script URL does NOT start with the extension base URL.
    return !window.location.href.startsWith(extUrl);
  } catch {
    return false;
  }
}

async function callBackgroundAPI<T>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = (await browser.runtime.sendMessage({
    type: "BOWERBIRD_API_PROXY",
    action,
    args,
  })) as { data?: T; error?: string } | undefined;
  if (res && res.error) {
    throw new Error(res.error);
  }
  return res?.data as T;
}

export async function getStoredApiUrl(): Promise<string> {
  try {
    const res = (await browser.storage.local.get(["apiUrl"])) as { apiUrl?: string };
    if (res.apiUrl && typeof res.apiUrl === "string") {
      return res.apiUrl.replace(/\/+$/, "");
    }
  } catch {}
  return DEFAULT_API_URL;
}

export async function setStoredApiUrl(url: string): Promise<void> {
  const clean = url.trim().replace(/\/+$/, "");
  await browser.storage.local.set({ apiUrl: clean });
}

/**
 * Universal interface to check whether Bowerbird desktop application is currently running.
 * Uses a fast 1500ms timeout to avoid UI blocking.
 */
export async function checkAppRunning(targetUrl?: string): Promise<AppRunningStatus> {
  if (isContentScript()) {
    try {
      return await callBackgroundAPI<AppRunningStatus>("checkAppRunning", { targetUrl });
    } catch (err: unknown) {
      return {
        running: false,
        hasActiveLibrary: false,
        error: err instanceof Error ? err.message : "Bowerbird desktop app is not running",
      };
    }
  }
  const base = targetUrl || (await getStoredApiUrl());
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const resp = await fetch(`${base}/api/health`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      return { running: false, hasActiveLibrary: false, error: `HTTP ${resp.status}` };
    }

    const json = await resp.json();
    if (json.status === "success" && json.data) {
      const activeLib = json.data.activeLibrary;
      return {
        running: true,
        hasActiveLibrary: Boolean(json.data.hasActiveLibrary),
        libraryName: activeLib ? activeLib.name : undefined,
        itemCount: activeLib ? activeLib.itemCount : 0,
        port: json.data.port,
      };
    }
    return { running: false, hasActiveLibrary: false, error: json.message || "Invalid response" };
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      running: false,
      hasActiveLibrary: false,
      error: isTimeout ? "Connection timed out" : "Bowerbird desktop app is not running",
    };
  }
}

export async function checkConnection(targetUrl?: string): Promise<APIStatusResult> {
  if (isContentScript()) {
    try {
      return await callBackgroundAPI<APIStatusResult>("checkConnection", { targetUrl });
    } catch (err: unknown) {
      return {
        connected: false,
        error: err instanceof Error ? err.message : "Bowerbird not reachable",
      };
    }
  }
  const base = targetUrl || (await getStoredApiUrl());
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(`${base}/api/info`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      return { connected: false, error: `HTTP ${resp.status}` };
    }

    const json = await resp.json();
    if (json.status === "success" && json.data) {
      const activeLib = json.data.activeLibrary;
      return {
        connected: true,
        libraryName: activeLib ? activeLib.name : "No Library Open",
        itemCount: activeLib ? activeLib.itemCount : 0,
        port: json.data.port,
      };
    }
    return { connected: false, error: json.message || "Invalid response" };
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      connected: false,
      error: isTimeout ? "Connection timed out" : "Bowerbird not reachable",
    };
  }
}

export async function fetchFolders(targetUrl?: string): Promise<Folder[]> {
  if (isContentScript()) {
    try {
      return await callBackgroundAPI<Folder[]>("fetchFolders", { targetUrl });
    } catch {
      return [];
    }
  }
  const base = targetUrl || (await getStoredApiUrl());
  try {
    const resp = await fetch(`${base}/api/folders`);
    if (!resp.ok) return [];
    const json = await resp.json();
    if (json.status === "success" && Array.isArray(json.data)) {
      return json.data;
    }
  } catch {}
  return [];
}

export async function createFolder(name: string, parentId: string = "", targetUrl?: string): Promise<Folder | null> {
  if (isContentScript()) {
    try {
      return await callBackgroundAPI<Folder | null>("createFolder", { name, parentId, targetUrl });
    } catch {
      return null;
    }
  }
  const base = targetUrl || (await getStoredApiUrl());
  try {
    const resp = await fetch(`${base}/api/folder/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId }),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    if (json.status === "success" && json.data) {
      return json.data;
    }
  } catch {}
  return null;
}

export async function fetchTags(targetUrl?: string): Promise<Tag[]> {
  if (isContentScript()) {
    try {
      return await callBackgroundAPI<Tag[]>("fetchTags", { targetUrl });
    } catch {
      return [];
    }
  }
  const base = targetUrl || (await getStoredApiUrl());
  try {
    const resp = await fetch(`${base}/api/tags`);
    if (!resp.ok) return [];
    const json = await resp.json();
    if (json.status === "success" && Array.isArray(json.data)) {
      return json.data;
    }
  } catch {}
  return [];
}

export async function importFromURL(
  payload: {
    url: string;
    name?: string;
    website?: string;
    annotation?: string;
    tags?: string[];
    folderId?: string;
    folderIds?: string[];
    headers?: Record<string, string>;
  },
  targetUrl?: string
): Promise<{ success: boolean; item?: Item; error?: string }> {
  if (isContentScript()) {
    try {
      return await callBackgroundAPI("importFromURL", { payload, targetUrl });
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : "Network error" };
    }
  }
  const base = targetUrl || (await getStoredApiUrl());
  try {
    const resp = await fetch(`${base}/api/item/addFromURL`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await resp.json();
    if (resp.ok && json.status === "success") {
      return { success: true, item: json.data };
    }
    return { success: false, error: json.message || `HTTP ${resp.status}` };
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" };
  }
}

export async function importFromBase64(
  payload: {
    base64: string;
    name?: string;
    website?: string;
    annotation?: string;
    tags?: string[];
    folderId?: string;
    folderIds?: string[];
  },
  targetUrl?: string
): Promise<{ success: boolean; item?: Item; error?: string }> {
  if (isContentScript()) {
    try {
      return await callBackgroundAPI("importFromBase64", { payload, targetUrl });
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : "Network error" };
    }
  }
  const base = targetUrl || (await getStoredApiUrl());
  try {
    const resp = await fetch(`${base}/api/item/addFromBase64`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await resp.json();
    if (resp.ok && json.status === "success") {
      return { success: true, item: json.data };
    }
    return { success: false, error: json.message || `HTTP ${resp.status}` };
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" };
  }
}

export async function importBookmark(
  payload: {
    url: string;
    title?: string;
    base64?: string;
    annotation?: string;
    tags?: string[];
    folderId?: string;
  },
  targetUrl?: string
): Promise<{ success: boolean; item?: Item; error?: string }> {
  if (isContentScript()) {
    try {
      return await callBackgroundAPI("importBookmark", { payload, targetUrl });
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : "Network error" };
    }
  }
  const base = targetUrl || (await getStoredApiUrl());
  try {
    const resp = await fetch(`${base}/api/item/addBookmark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await resp.json();
    if (resp.ok && json.status === "success") {
      return { success: true, item: json.data };
    }
    return { success: false, error: json.message || `HTTP ${resp.status}` };
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" };
  }
}

export async function importBatch(
  payload: {
    items: Array<{
      url?: string;
      base64?: string;
      name?: string;
      website?: string;
      tags?: string[];
    }>;
    folderId?: string;
    folderIds?: string[];
    tags?: string[];
  },
  targetUrl?: string
): Promise<{ success: boolean; total?: number; count?: number; error?: string }> {
  if (isContentScript()) {
    try {
      return await callBackgroundAPI("importBatch", { payload, targetUrl });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Network error";
      return { success: false, error: errorMsg };
    }
  }
  const base = targetUrl || (await getStoredApiUrl());
  try {
    const resp = await fetch(`${base}/api/item/addFromURLs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await resp.json();
    if (resp.ok && json.status === "success") {
      return {
        success: true,
        total: json.data?.total || payload.items.length,
        count: json.data?.success || 0,
      };
    }
    return { success: false, error: json.message || `HTTP ${resp.status}` };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error";
    return { success: false, error: errorMsg };
  }
}
