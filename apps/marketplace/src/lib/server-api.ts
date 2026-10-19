import path from "node:path";
import fs from "node:fs";
import { INITIAL_OFFICIAL_PLUGINS } from "../data/plugins";

export const DEFAULT_REPO_INDEX_URL =
  "https://raw.githubusercontent.com/owocc/bowerbird-plugins/main/index.min.json";
export const DEFAULT_RELEASE_BASE_URL =
  "https://github.com/owocc/bowerbird-plugins/releases/download/plugins-latest";
export interface PluginIndexItem {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  kind: "preview" | "metadata";
  category?: "preview" | "metadata";
  priority: number;
  extensions: string[];
  mimePrefixes?: string[];
  supportsZoom?: boolean;
  main?: string;
  style?: string;
  icon?: string;
  iconName?: string;
  license?: string;
  featured?: boolean;
  downloadsCount?: number;
  rating?: number;
  longDescription?: string;
  changelog?: Array<{ version: string; date: string; notes: string[] }>;
  assetFileName?: string;
  manifestUrl?: string;
  downloadUrl?: string;
  updatedAt?: string;
}

export interface PluginRegistryIndex {
  schemaVersion: number;
  generatedAt: string;
  plugins: PluginIndexItem[];
}

let cachedIndex: { data: PluginRegistryIndex; timestamp: number } | null = null;

function compareSemVer(v1: string, v2: string): number {
  const p1 = (v1 || "0").replace(/^v/, "").split(".").map(Number);
  const p2 = (v2 || "0").replace(/^v/, "").split(".").map(Number);
  const max = Math.max(p1.length, p2.length);
  for (let i = 0; i < max; i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

export function getDirectDownloadUrl(
  plugin: PluginIndexItem,
  releaseBaseUrl?: string,
  origin?: string
): string {
  const effectiveReleaseBase = releaseBaseUrl || DEFAULT_RELEASE_BASE_URL;
  const assetName = plugin.assetFileName || `${plugin.id}-v${plugin.version}.zip`;
  if (effectiveReleaseBase && effectiveReleaseBase.startsWith("http")) {
    return `${effectiveReleaseBase.replace(/\/$/, "")}/${assetName}`;
  }
  return `${origin || ""}/api/plugins/${plugin.id}/download`;
}

export async function fetchPluginRegistry(env?: Record<string, string | undefined>): Promise<PluginRegistryIndex> {
  const ttl = Number(env?.PLUGIN_CACHE_TTL || process.env.PLUGIN_CACHE_TTL || "300") * 1000;
  const now = Date.now();

  if (cachedIndex && now - cachedIndex.timestamp < ttl) {
    return cachedIndex.data;
  }

  const indexUrl =
    env?.PLUGIN_REPO_INDEX_URL ||
    process.env.PLUGIN_REPO_INDEX_URL ||
    DEFAULT_REPO_INDEX_URL;
  const token = env?.GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  if (indexUrl && indexUrl.startsWith("http")) {
    try {
      const headers: Record<string, string> = {
        "User-Agent": "Bowerbird-Plugin-Store/1.0",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch(indexUrl, { headers });
      if (res.ok) {
        const data = (await res.json()) as PluginRegistryIndex;
        cachedIndex = { data, timestamp: now };
        return data;
      }
      console.warn(`[PluginAPI] Remote index HTTP ${res.status} from ${indexUrl}`);
    } catch (err) {
      console.warn(`[PluginAPI] Failed to fetch remote index from ${indexUrl}:`, err);
    }
  }

  // Local fallback: read from ../dist/plugins/index.min.json or ../dist/plugins/registry.json
  try {
    const localCandidates = [
      path.resolve(process.cwd(), "../dist/plugins/index.min.json"),
      path.resolve(process.cwd(), "dist/plugins/index.min.json"),
      path.resolve(process.cwd(), "../dist/plugins/registry.json"),
    ];
    for (const cand of localCandidates) {
      if (fs.existsSync(cand)) {
        const raw = fs.readFileSync(cand, "utf8");
        const data = JSON.parse(raw) as PluginRegistryIndex;
        cachedIndex = { data, timestamp: now };
        return data;
      }
    }
  } catch (err) {
    console.warn("[PluginAPI] Local fallback failed:", err);
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    plugins: INITIAL_OFFICIAL_PLUGINS as PluginIndexItem[],
  };
}

export async function handlePluginApiRequest(
  request: Request,
  env?: Record<string, string | undefined>
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const origin = url.origin;
  const releaseBaseUrl =
    env?.PLUGIN_RELEASE_BASE_URL ||
    process.env.PLUGIN_RELEASE_BASE_URL ||
    DEFAULT_RELEASE_BASE_URL;
  const indexUrl =
    env?.PLUGIN_REPO_INDEX_URL ||
    process.env.PLUGIN_REPO_INDEX_URL ||
    DEFAULT_REPO_INDEX_URL;

  // 1. GET /api/plugins - List all plugins
  if (pathname === "/api/plugins" || pathname === "/api/plugins/") {
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }
    const registry = await fetchPluginRegistry(env);
    const plugins = registry.plugins.map((p) => {
      return {
        ...p,
        manifestUrl: `${origin}/api/plugins/${p.id}/manifest.json`,
        downloadUrl: getDirectDownloadUrl(p, releaseBaseUrl, origin),
      };
    });

    return new Response(JSON.stringify({ plugins, generatedAt: registry.generatedAt }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
        ...corsHeaders,
      },
    });
  }

  // 2. POST /api/plugins/check-updates - Batch update check for desktop app
  if (pathname === "/api/plugins/check-updates" || pathname === "/api/plugins/check-updates/") {
    if (request.method !== "POST" && request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    let queryPlugins: Array<{ id: string; version: string }> = [];
    try {
      const body = await request.json();
      queryPlugins = (body as any)?.plugins || [];
    } catch {
      queryPlugins = [];
    }

    const registry = await fetchPluginRegistry(env);
    const updates: any[] = [];

    for (const q of queryPlugins) {
      const found = registry.plugins.find((p) => p.id === q.id);
      if (found) {
        const hasUpdate = compareSemVer(found.version, q.version) > 0;
        if (hasUpdate) {
          updates.push({
            id: found.id,
            name: found.name,
            currentVersion: q.version,
            latestVersion: found.version,
            hasUpdate: true,
            manifestUrl: `${origin}/api/plugins/${found.id}/manifest.json`,
            downloadUrl: getDirectDownloadUrl(found, releaseBaseUrl, origin),
            changelog: found.changelog?.[0]?.notes || [],
          });
        }
      }
    }

    return new Response(JSON.stringify({ updates }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  }

  // 3. /api/plugins/:id/manifest.json
  const manifestMatch = pathname.match(/^\/api\/plugins\/([a-zA-Z0-9_\-.]+)\/manifest\.json$/);
  if (manifestMatch) {
    const pluginId = manifestMatch[1];
    const registry = await fetchPluginRegistry(env);
    const plugin = registry.plugins.find((p) => p.id === pluginId);

    if (!plugin) {
      return new Response(JSON.stringify({ error: `Plugin ${pluginId} not found` }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const manifestData = {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      author: plugin.author,
      kind: plugin.kind,
      priority: plugin.priority,
      extensions: plugin.extensions || [],
      mimePrefixes: plugin.mimePrefixes,
      supportsZoom: plugin.supportsZoom,
      main: "index.js",
      style: plugin.style,
      icon: plugin.icon,
      license: plugin.license,
      downloadUrl: getDirectDownloadUrl(plugin, releaseBaseUrl, origin),
    };

    return new Response(JSON.stringify(manifestData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60, s-maxage=300",
        ...corsHeaders,
      },
    });
  }

  // 4. /api/plugins/:id/download -> ZIP download
  const downloadMatch = pathname.match(/^\/api\/plugins\/([a-zA-Z0-9_\-.]+)\/download$/);
  if (downloadMatch) {
    const pluginId = downloadMatch[1];
    const registry = await fetchPluginRegistry(env);
    const plugin = registry.plugins.find((p) => p.id === pluginId);

    if (!plugin) {
      return new Response(JSON.stringify({ error: `Plugin ${pluginId} not found` }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const assetName = plugin.assetFileName || `${plugin.id}-v${plugin.version}.zip`;

    // When configured with remote release base, redirect directly to original release ZIP
    if (releaseBaseUrl && releaseBaseUrl.startsWith("http")) {
      const remoteDownloadUrl = `${releaseBaseUrl.replace(/\/$/, "")}/${assetName}`;
      return Response.redirect(remoteDownloadUrl, 302);
    }

    // Local fallback
    const localZipCandidates = [
      path.resolve(process.cwd(), `../dist/plugins/releases/${assetName}`),
      path.resolve(process.cwd(), `dist/plugins/releases/${assetName}`),
    ];
    for (const cand of localZipCandidates) {
      if (fs.existsSync(cand)) {
        const fileBuf = fs.readFileSync(cand);
        return new Response(fileBuf, {
          status: 200,
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${path.basename(cand)}"`,
            ...corsHeaders,
          },
        });
      }
    }

    return new Response(JSON.stringify({ error: `Zip asset for ${pluginId} not found` }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // 5. /api/plugins/:id/<file> -> a file from the plugin bundle (index.js, style.css, icon, ...)
  //    One store origin therefore serves everything a manifest-based install needs.
  const fileMatch = pathname.match(/^\/api\/plugins\/([a-zA-Z0-9_\-.]+)\/([^/]+)$/);
  if (fileMatch) {
    const pluginId = fileMatch[1];
    const fileName = fileMatch[2];
    if (fileName.includes("..")) {
      return new Response("Not Found", { status: 404, headers: corsHeaders });
    }

    const contentType = fileName.endsWith(".js")
      ? "application/javascript"
      : fileName.endsWith(".css")
        ? "text/css"
        : fileName.endsWith(".json")
          ? "application/json"
          : "application/octet-stream";

    for (const bundleDir of [
      path.resolve(process.cwd(), `../dist/plugins/${pluginId}`),
      path.resolve(process.cwd(), `dist/plugins/${pluginId}`),
    ]) {
      const localPath = path.resolve(bundleDir, fileName);
      // Never serve anything outside the plugin's own bundle directory.
      if (!localPath.startsWith(bundleDir + path.sep) || !fs.existsSync(localPath)) {
        continue;
      }
      return new Response(fs.readFileSync(localPath), {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=300",
          ...corsHeaders,
        },
      });
    }

    // Remote fallback: if indexUrl is configured (e.g. raw.githubusercontent.com/.../index.min.json),
    // redirect to the same file in repo/<id>/<file>
    if (indexUrl && indexUrl.startsWith("http")) {
      const remoteFileUrl = indexUrl.replace(/\/index\.min\.json$/, `/repo/${pluginId}/${fileName}`);
      return Response.redirect(remoteFileUrl, 302);
    }

    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": contentType, ...corsHeaders },
    });
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
}
