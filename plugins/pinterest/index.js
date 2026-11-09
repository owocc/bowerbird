// Pinterest resolver for the native host. The host calls resolveUrl when a
// link is pasted or dropped. No DOM, React or bundler is involved; types live
// in @bowerbird/plugin-sdk. This follows the original PR implementation:
// anchor the page's image by content hash, then derive the /originals/ URL
// from any resized rendition.

const PINTEREST_HOST_RE = /(^|\.)pinterest\.[a-z.]+$/i;
const PINIMG_HOST_RE = /^i(?:-[a-z0-9]+)?\.pinimg\.com$/i;
const PIN_PATH_RE = /\/pin\/(\d+)/i;
const PINIMG_URL_RE = /(?:https?:)?\/\/i(?:-[a-z0-9]+)?\.pinimg\.com\/[^\s"'<>\\]+?\.(?:jpe?g|png|gif|webp)(?:\?[^\s"'<>\\]*)?/gi;
const META_TAG_RE = /<meta\b[^>]*>/gi;

function normalize(raw) {
  let value = String(raw || "").trim();
  if (value.startsWith("//")) value = "https:" + value;
  if (!value.includes("://") && value.includes(".")) value = "https://" + value;
  return value;
}

function parsePin(url) {
  const normalized = normalize(url);
  if (!normalized) return null;
  let parsed;
  try { parsed = new URL(normalized); } catch { return null; }
  const host = parsed.hostname.toLowerCase();
  if (!host) return null;
  if (host === "pin.it" || host.endsWith(".pin.it")) {
    return { id: "", host, sourceUrl: normalized, canonicalUrl: normalized, shortLink: true };
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

function isPinimgHost(host) {
  return PINIMG_HOST_RE.test(host);
}

function isPinimgURL(raw) {
  try { return isPinimgHost(new URL(normalize(raw)).hostname); } catch { return false; }
}

function parseInput(raw) {
  const pin = parsePin(raw);
  if (pin) return { kind: "pin", pin, url: pin.sourceUrl };
  const normalized = normalize(raw);
  if (isPinimgURL(normalized)) return { kind: "image", url: normalized };
  return null;
}

function decodeEntities(value) {
  return String(value)
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'").replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#x2f;/gi, "/").replace(/&#47;/gi, "/");
}

function normalizeImageCandidate(raw) {
  let candidate = String(raw || "").trim();
  candidate = candidate.replace(/\\\//g, "/").replace(/\\u002f/gi, "/");
  candidate = decodeEntities(candidate);
  candidate = candidate.replace(/^[\s"'()\[\]{}<>,;]+|[\s"'()\[\]{}<>,;]+$/g, "");
  if (candidate.startsWith("//")) candidate = "https:" + candidate;
  if (!/^https?:\/\//i.test(candidate)) return "";
  try { return new URL(candidate).toString(); } catch { return ""; }
}

function attr(tag, name) {
  const match = tag.match(new RegExp("\\b" + name + "\\s*=\\s*[\"']([^\"']*)[\"']", "i"));
  return match ? decodeEntities(match[1]) : "";
}

function imageHash(raw) {
  try {
    const parsed = new URL(raw);
    if (!isPinimgHost(parsed.hostname)) return "";
    const base = parsed.pathname.split("/").pop() || "";
    const dot = base.indexOf(".");
    const hash = dot > 0 ? base.slice(0, dot) : base;
    return hash.length >= 8 ? hash.toLowerCase() : "";
  } catch { return ""; }
}

function imageScore(candidate) {
  const lower = candidate.toLowerCase();
  let score = 0;
  try { if (isPinimgHost(new URL(candidate).hostname)) score += 20; } catch {}
  if (lower.includes("/originals/")) score += 130;
  else if (lower.includes("/1200x/")) score += 100;
  else if (lower.includes("/736x/")) score += 80;
  else if (lower.includes("/564x/")) score += 70;
  else if (lower.includes("/474x/")) score += 60;
  else score += 50;
  return score;
}

function bestImageCandidate(candidates) {
  let best = "";
  let bestScore = -1;
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    const score = imageScore(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function extractImageFromHtml(html) {
  if (!String(html || "").trim()) return "";
  const unescaped = decodeEntities(String(html).replace(/\\\//g, "/").replace(/\\u002f/gi, "/"));
  const metaCandidates = [];
  for (const tag of unescaped.match(META_TAG_RE) || []) {
    const lower = tag.toLowerCase();
    if (!lower.includes("og:image") && !lower.includes("twitter:image")) continue;
    const candidate = normalizeImageCandidate(attr(tag, "content"));
    if (candidate) metaCandidates.push(candidate);
  }
  const candidates = [...metaCandidates];
  for (const rawCandidate of unescaped.match(PINIMG_URL_RE) || []) {
    const candidate = normalizeImageCandidate(rawCandidate);
    if (candidate) candidates.push(candidate);
  }
  // og:image anchors the current pin. Related pins elsewhere in the HTML also
  // use /originals/ URLs, so only accept candidates with the same content hash.
  for (const metaCandidate of metaCandidates) {
    const anchor = imageHash(metaCandidate);
    if (!anchor) continue;
    const anchored = candidates.filter((candidate) => imageHash(candidate) === anchor);
    if (anchored.length > 0) return bestImageCandidate(anchored);
  }
  return bestImageCandidate(candidates);
}

function splitExtension(pathValue) {
  const dot = pathValue.lastIndexOf(".");
  if (dot < 0) return { stem: pathValue, ext: "" };
  return { stem: pathValue.slice(0, dot), ext: pathValue.slice(dot + 1).toLowerCase() };
}

function uniqueExtensions(ext) {
  const result = [];
  for (const candidate of [ext, "jpg", "png", "webp", "gif"]) {
    if (candidate && !result.includes(candidate)) result.push(candidate);
  }
  return result;
}

function buildPinimgURL(parsed, pathValue) {
  const copy = new URL(parsed.toString());
  copy.protocol = "https:";
  copy.pathname = pathValue;
  return copy.toString();
}

function pinterestImageCandidates(raw) {
  const normalized = normalizeImageCandidate(raw);
  if (!normalized) return [];
  let parsed;
  try { parsed = new URL(normalized); } catch { return [normalized]; }
  if (!isPinimgHost(parsed.hostname)) return [normalized];

  let pathValue = parsed.pathname.replace(/^\/+/, "");
  if (!pathValue) return [normalized];
  if (pathValue.toLowerCase().startsWith("webp/")) pathValue = pathValue.slice("webp/".length);

  const parts = pathValue.split("/");
  if (parts.length < 2) return [normalized];
  const isOriginal = parts[0].toLowerCase() === "originals";
  const rest = parts.slice(1).join("/");
  const { stem, ext } = splitExtension(rest);
  const candidates = [];
  if (isOriginal) {
    candidates.push(normalized);
  } else {
    for (const candidateExt of uniqueExtensions(ext)) {
      candidates.push(buildPinimgURL(parsed, `/originals/${stem}.${candidateExt}`));
    }
  }
  candidates.push(buildPinimgURL(parsed, `/1200x/${rest}`));
  if (!isOriginal) candidates.push(normalized);
  return [...new Set(candidates.filter(Boolean))];
}

async function host_fetch(url, options = {}) {
  const host = globalThis.host;
  const cookie = (host && host.settings && host.settings.get("cookie")) || "";
  const headers = {
    "User-Agent": "Mozilla/5.0 (compatible; Bowerbird/2.2; +https://github.com/owocc/bowerbird)",
    ...(options.headers || {}),
  };
  if (cookie) headers.Cookie = cookie;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { redirect: "follow", headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPinImage(pageUrl, options = {}) {
  try {
    const response = await host_fetch(pageUrl, options);
    if (!response.ok) {
      if (globalThis.host && typeof host.log === "function") {
        host.log("warn", "pinterest.page", `${pageUrl} status=${response.status}`);
      }
      return null;
    }
    const html = await response.text();
    const imageUrl = extractImageFromHtml(html);
    if (!imageUrl) {
      if (globalThis.host && typeof host.log === "function") {
        host.log("warn", "pinterest.page", `${pageUrl} no anchored image`);
      }
      return null;
    }
    return { pageUrl: response.url || pageUrl, imageUrl };
  } catch (err) {
    if (globalThis.host && typeof host.log === "function") {
      host.log("warn", "pinterest.page", `${pageUrl} ${String(err)}`);
    }
    return null;
  }
}

export async function resolveUrl({ url }) {
  const input = parseInput(url);
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
  if (globalThis.host && typeof host.log === "function") {
    host.log("info", "pinterest.match", pin.host);
  }

  const pageUrls = [pin.sourceUrl];
  if (pin.canonicalUrl && pin.canonicalUrl !== pin.sourceUrl) pageUrls.push(pin.canonicalUrl);

  for (const pageUrl of pageUrls) {
    // Keep direct attempts short when the main domain is blackholed.
    const resolved = await fetchPinImage(pageUrl, { timeoutMs: 8000 });
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
    // Original PR fallback: Fastly-fronted regional domains. The Host header
    // asks the front to serve the canonical Pinterest site.
    for (const frontHost of ["pinterest.ru", "pinterest.co.kr"]) {
      const resolved = await fetchPinImage(
        `https://${frontHost}/pin/${pin.id}/`,
        { headers: { Host: "www.pinterest.com" }, timeoutMs: 15000 },
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

export async function inspect({ item }) {
  const source = item && (item.url || item.originalUrl);
  if (!source) return null;
  let host = "";
  try { host = new URL(source).hostname.toLowerCase(); } catch { return null; }
  if (!PINTEREST_HOST_RE.test(host) && host !== "pin.it") return null;
  return {
    sections: [{
      title: "Pinterest",
      rows: [
        { label: "Source", value: source, copyable: true },
        { label: "Status", value: "Resolved image available" },
      ],
      textBlocks: [],
    }],
  };
}

export async function actions({ items }) {
  if (!items || items.length === 0) return [];
  if (typeof host === "undefined" || typeof host.platformOpen !== "function") return [];
  return [{ id: "open-source", title: "Open Pinterest page", icon: "external" }];
}

export async function runAction({ id, item, items }) {
  if (id !== "open-source") return null;
  const target = (item && (item.url || item.originalUrl)) || (items && items[0] && (items[0].url || items[0].originalUrl));
  if (!target) return { ok: false };
  if (typeof host !== "undefined" && typeof host.platformOpen === "function") host.platformOpen(target);
  return { ok: true };
}
