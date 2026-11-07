/**
 * Pinterest URL parsing and resolution.
 *
 * All site-specific logic lives here, in the plugin. The desktop app only
 * provides two generic services: fetch a remote URL as text, and import a
 * direct media URL. That means supporting another site later only requires a
 * new plugin, not another App release.
 */

import type {
  PluginUrlResolution,
  UrlFetchOptions,
  UrlFetchResult,
  UrlResolveContext,
} from "@bowerbird/plugin-sdk";

export interface PinterestPin {
  id: string;
  host: string;
  sourceUrl: string;
  canonicalUrl: string;
  shortLink: boolean;
}

export type PinterestInput =
  | { kind: "pin"; pin: PinterestPin; url: string }
  | { kind: "image"; url: string };

const PINTEREST_HOST_RE = /(^|\.)pinterest\.[a-z.]+$/i;
const PINIMG_HOST_RE = /^i(?:-[a-z0-9]+)?\.pinimg\.com$/i;
const PIN_PATH_RE = /\/pin\/(\d+)/i;
const PINIMG_URL_RE =
  /(?:https?:)?\/\/i(?:-[a-z0-9]+)?\.pinimg\.com\/[^\s"'<>\\]+?\.(?:jpe?g|png|gif|webp)(?:\?[^\s"'<>\\]*)?/gi;
const META_TAG_RE = /<meta\b[^>]*>/gi;

function normalizeInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (!trimmed.includes("://") && trimmed.includes(".")) return `https://${trimmed}`;
  return trimmed;
}

/** Parses a Pinterest pin URL (regional domains and pin.it short links included). */
export function parsePinterestPinUrl(raw: string): PinterestPin | null {
  const normalized = normalizeInput(raw);
  if (!normalized) return null;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) return null;

  if (host === "pin.it" || host.endsWith(".pin.it")) {
    return {
      id: "",
      host,
      sourceUrl: normalized,
      canonicalUrl: normalized,
      shortLink: true,
    };
  }

  if (!PINTEREST_HOST_RE.test(host)) return null;

  const match = parsed.pathname.match(PIN_PATH_RE);
  if (!match) return null;

  return {
    id: match[1],
    host,
    sourceUrl: normalized,
    canonicalUrl: `https://${host}/pin/${match[1]}/`,
    shortLink: false,
  };
}

export function isPinimgHost(host: string): boolean {
  return PINIMG_HOST_RE.test(host);
}

/** True when the URL points directly at a Pinterest image CDN asset. */
export function isPinterestImageUrl(raw: string): boolean {
  try {
    return isPinimgHost(new URL(normalizeInput(raw)).hostname);
  } catch {
    return false;
  }
}

/** Accepts either a pin page URL or a direct i.pinimg.com image URL. */
export function parsePinterestInput(raw: string): PinterestInput | null {
  const pin = parsePinterestPinUrl(raw);
  if (pin) return { kind: "pin", pin, url: pin.sourceUrl };

  const normalized = normalizeInput(raw);
  if (isPinterestImageUrl(normalized)) {
    return { kind: "image", url: normalized };
  }
  return null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#47;/gi, "/");
}

function normalizeImageCandidate(raw: string): string {
  let candidate = raw.trim();
  candidate = candidate.replace(/\\\//g, "/");
  candidate = candidate.replace(/\\u002f/gi, "/");
  candidate = decodeHtmlEntities(candidate);
  candidate = candidate.replace(/^[\s"'()\[\]{}<>,;]+|[\s"'()\[\]{}<>,;]+$/g, "");
  if (candidate.startsWith("//")) candidate = `https:${candidate}`;
  if (!/^https?:\/\//i.test(candidate)) return "";
  try {
    return new URL(candidate).toString();
  } catch {
    return "";
  }
}

function getHtmlAttribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match ? decodeHtmlEntities(match[1]) : "";
}

function imageHash(raw: string): string {
  try {
    const parsed = new URL(raw);
    if (!isPinimgHost(parsed.hostname)) return "";
    const base = parsed.pathname.split("/").pop() || "";
    const dot = base.indexOf(".");
    const hash = dot > 0 ? base.slice(0, dot) : base;
    return hash.length >= 8 ? hash.toLowerCase() : "";
  } catch {
    return "";
  }
}

function imageScore(candidate: string): number {
  const lower = candidate.toLowerCase();
  let score = 0;
  try {
    if (isPinimgHost(new URL(candidate).hostname)) score += 20;
  } catch {
    // Not a pinimg URL.
  }
  if (lower.includes("/originals/")) score += 130;
  else if (lower.includes("/1200x/")) score += 100;
  else if (lower.includes("/736x/")) score += 80;
  else if (lower.includes("/564x/")) score += 70;
  else if (lower.includes("/474x/")) score += 60;
  else score += 50;
  return score;
}

function bestImageCandidate(candidates: string[]): string {
  let best = "";
  let bestScore = -1;
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const score = imageScore(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Extracts the pin's image from page HTML. og:image anchors the current pin's
 * content hash so related-pin originals elsewhere in the page are ignored.
 */
export function extractPinterestImageFromHtml(html: string): string {
  if (!html.trim()) return "";

  const unescaped = decodeHtmlEntities(html.replace(/\\\//g, "/").replace(/\\u002f/gi, "/"));
  const metaCandidates: string[] = [];
  for (const tag of unescaped.match(META_TAG_RE) || []) {
    const lower = tag.toLowerCase();
    if (!lower.includes("og:image") && !lower.includes("twitter:image")) continue;
    const candidate = normalizeImageCandidate(getHtmlAttribute(tag, "content"));
    if (candidate) metaCandidates.push(candidate);
  }

  const candidates = [...metaCandidates];
  for (const rawCandidate of unescaped.match(PINIMG_URL_RE) || []) {
    const candidate = normalizeImageCandidate(rawCandidate);
    if (candidate) candidates.push(candidate);
  }

  for (const metaCandidate of metaCandidates) {
    const anchorHash = imageHash(metaCandidate);
    if (!anchorHash) continue;
    const anchored = candidates.filter((candidate) => imageHash(candidate) === anchorHash);
    if (anchored.length > 0) return bestImageCandidate(anchored);
  }

  return bestImageCandidate(candidates);
}

function splitPathExtension(pathValue: string): { stem: string; ext: string } {
  const dot = pathValue.lastIndexOf(".");
  if (dot < 0) return { stem: pathValue, ext: "" };
  return { stem: pathValue.slice(0, dot), ext: pathValue.slice(dot + 1).toLowerCase() };
}

function uniqueExtensions(ext: string): string[] {
  const result: string[] = [];
  for (const candidate of [ext, "jpg", "png", "webp", "gif"]) {
    if (candidate && !result.includes(candidate)) result.push(candidate);
  }
  return result;
}

function buildPinimgUrl(parsed: URL, pathValue: string): string {
  const copy = new URL(parsed.toString());
  copy.protocol = "https:";
  copy.pathname = pathValue;
  return copy.toString();
}

/**
 * Builds download candidates, best quality first. Pinterest keeps the content
 * hash stable across renditions, so from any resized URL we can try
 * /originals/<hash>.<ext> and only then fall back to 1200x / the original URL.
 */
export function pinterestImageCandidates(raw: string): string[] {
  const normalized = normalizeImageCandidate(raw);
  if (!normalized) return [];

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return [normalized];
  }
  if (!isPinimgHost(parsed.hostname)) return [normalized];

  let pathValue = parsed.pathname.replace(/^\/+/, "");
  if (!pathValue) return [normalized];
  if (pathValue.toLowerCase().startsWith("webp/")) pathValue = pathValue.slice("webp/".length);

  const parts = pathValue.split("/");
  if (parts.length < 2) return [normalized];

  const isOriginal = parts[0].toLowerCase() === "originals";
  const rest = parts.slice(1).join("/");
  const { stem, ext } = splitPathExtension(rest);

  const candidates: string[] = [];
  if (isOriginal) {
    candidates.push(normalized);
  } else {
    for (const candidateExt of uniqueExtensions(ext)) {
      candidates.push(buildPinimgUrl(parsed, `/originals/${stem}.${candidateExt}`));
    }
  }
  candidates.push(buildPinimgUrl(parsed, `/1200x/${rest}`));
  if (!isOriginal) candidates.push(normalized);

  return Array.from(new Set(candidates.filter(Boolean)));
}

/** Fetches a URL as text through the desktop's generic HTTP bridge. */
export async function fetchTextViaBackend(
  apiBaseUrl: string,
  url: string,
  options?: UrlFetchOptions
): Promise<UrlFetchResult> {
  const response = await fetch(`${apiBaseUrl}/api/url/fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      headers: options?.headers,
      maxBytes: options?.maxBytes,
      timeoutMs: options?.timeoutMs,
    }),
  });

  let payload: {
    status?: string;
    message?: string;
    data?: UrlFetchResult;
  } | null = null;
  try {
    payload = await response.json();
  } catch {
    // Keep the HTTP status as the failure message.
  }
  if (!response.ok || payload?.status !== "success" || !payload.data) {
    throw new Error(payload?.message || `URL fetch failed: HTTP ${response.status}`);
  }
  return payload.data;
}

async function fetchPinPage(
  context: UrlResolveContext,
  url: string,
  headers?: Record<string, string>,
  timeoutMs = 15_000
): Promise<{ pageUrl: string; imageUrl: string } | null> {
  try {
    const result = await context.fetchText(url, { headers, timeoutMs, maxBytes: 8 * 1024 * 1024 });
    if (result.statusCode < 200 || result.statusCode >= 300) return null;
    const imageUrl = extractPinterestImageFromHtml(result.body);
    if (!imageUrl) return null;
    return { pageUrl: result.url || url, imageUrl };
  } catch {
    return null;
  }
}

/**
 * Plugin URL resolver entrypoint. Returns direct media candidates + the source
 * page URL; the host then imports the first candidate that downloads.
 */
export async function resolvePinterestResolution(
  raw: string,
  context: UrlResolveContext
): Promise<PluginUrlResolution | null> {
  const input = parsePinterestInput(raw);
  if (!input) return null;

  if (input.kind === "image") {
    return {
      url: input.url,
      candidates: pinterestImageCandidates(input.url),
      sourceUrl: input.url,
      tags: ["pinterest"],
    };
  }

  const pin = input.pin;
  const pageUrls = [pin.sourceUrl];
  if (pin.canonicalUrl && pin.canonicalUrl !== pin.sourceUrl) pageUrls.push(pin.canonicalUrl);

  for (const pageUrl of pageUrls) {
    // Keep direct attempts short: if pinterest.com is blackholed we immediately
    // try the Fastly frontends below instead of waiting for the full timeout.
    const resolved = await fetchPinPage(context, pageUrl, undefined, 8_000);
    if (resolved) {
      return {
        url: resolved.imageUrl,
        candidates: pinterestImageCandidates(resolved.imageUrl),
        sourceUrl: pin.sourceUrl,
        tags: ["pinterest"],
      };
    }
  }

  if (pin.id) {
    for (const frontHost of ["pinterest.ru", "pinterest.co.kr"]) {
      const resolved = await fetchPinPage(
        context,
        `https://${frontHost}/pin/${pin.id}/`,
        { Host: "www.pinterest.com" },
        15_000
      );
      if (resolved) {
        return {
          url: resolved.imageUrl,
          candidates: pinterestImageCandidates(resolved.imageUrl),
          sourceUrl: pin.sourceUrl,
          tags: ["pinterest"],
        };
      }
    }
  }

  return null;
}

/** Resolves the Bowerbird local HTTP API origin, falling back to the default port. */
export function resolveApiBase(item?: { originalUrl?: string; thumbnailUrl?: string; downloadUrl?: string }): string {
  for (const candidate of [item?.originalUrl, item?.thumbnailUrl, item?.downloadUrl]) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.origin;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return "http://127.0.0.1:41595";
}
