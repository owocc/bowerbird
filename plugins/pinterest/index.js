// Pinterest resolver for the native host. The host calls resolveUrl when a
// link is pasted or dropped; the returned candidates are imported by core.
// No DOM, React or bundler is involved.

const PIN_RE = /\/pin\/(\d+)/i;
const PINIMG_RE = /^i(?:-[a-z0-9]+)?\.pinimg\.com$/i;
const IMG_RE = /(?:https?:)?\/\/i(?:-[a-z0-9]+)?\.pinimg\.com\/[^\s"'<>\\]+?\.(?:jpe?g|png|gif|webp)(?:\?[^\s"'<>\\]*)?/gi;
const META_RE = /<meta\b[^>]*>/gi;

function normalize(raw) {
  let s = String(raw || "").trim();
  if (s.startsWith("//")) s = "https:" + s;
  if (!s.includes("://") && s.includes(".")) s = "https://" + s;
  return s;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'").replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#x2f;/gi, "/").replace(/&#47;/gi, "/");
}

function attr(tag, name) {
  const m = tag.match(new RegExp("\\b" + name + "\\s*=\\s*[\"']([^\"']*)[\"']", "i"));
  return m ? decodeEntities(m[1]) : "";
}

function candidate(raw) {
  let s = decodeEntities(String(raw || "").replace(/\\\//g, "/").replace(/\\u002f/gi, "/"));
  s = s.replace(/^[\s"'()\[\]{}<>,;]+|[\s"'()\[\]{}<>,;]+$/g, "");
  if (s.startsWith("//")) s = "https:" + s;
  if (!/^https?:\/\//i.test(s)) return "";
  try { return new URL(s).toString(); } catch { return ""; }
}

function score(url) {
  const u = url.toLowerCase();
  let n = 0;
  try { if (PINIMG_RE.test(new URL(url).hostname)) n += 20; } catch {}
  if (u.includes("/originals/")) n += 130;
  else if (u.includes("/1200x/")) n += 100;
  else if (u.includes("/736x/")) n += 80;
  else if (u.includes("/564x/")) n += 70;
  else if (u.includes("/474x/")) n += 60;
  return n;
}

function fromHtml(html) {
  const text = decodeEntities(String(html || "").replace(/\\\//g, "/").replace(/\\u002f/gi, "/"));
  const out = [];
  for (const tag of text.match(META_RE) || []) {
    const lower = tag.toLowerCase();
    if (!lower.includes("og:image") && !lower.includes("twitter:image")) continue;
    const c = candidate(attr(tag, "content"));
    if (c) out.push(c);
  }
  for (const m of text.match(IMG_RE) || []) {
    const c = candidate(m);
    if (c) out.push(c);
  }
  return [...new Set(out)].sort((a, b) => score(b) - score(a));
}

export async function resolveUrl({ url }) {
  const normalized = normalize(url);
  if (!normalized) return null;
  let parsed;
  try { parsed = new URL(normalized); } catch { return null; }
  const host = parsed.hostname.toLowerCase();

  if (PINIMG_RE.test(host)) {
    return { url: normalized, candidates: [normalized], sourceUrl: normalized, name: "", tags: ["pinterest"] };
  }
  if (host === "pin.it" || host.endsWith(".pin.it") || /(^|\.)pinterest\.[a-z.]+$/i.test(host)) {
    const res = await host_fetch(normalized);
    const html = res.ok ? await res.text() : "";
    let candidates = fromHtml(html);
    if (candidates.length === 0 && res.url && res.url !== normalized) {
      const again = await host_fetch(res.url);
      if (again.ok) candidates = fromHtml(await again.text());
    }
    const m = parsed.pathname.match(PIN_RE);
    const sourceUrl = m ? `https://${host}/pin/${m[1]}/` : normalized;
    if (candidates.length === 0) throw new Error("Pinterest returned no image candidates");
    const name = m ? `pinterest-${m[1]}` : "pinterest-image";
    return { url: candidates[0], candidates, sourceUrl, name, tags: ["pinterest"] };
  }
  return null;
}

async function host_fetch(url) {
  const cookie = (globalThis.host && host.settings && host.settings.get("cookie")) || "";
  const init = { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 bowerbird" } };
  if (cookie) init.headers.Cookie = cookie;
  return fetch(url, init);
}

export async function inspect({ item }) {
  const source = item && (item.url || item.originalUrl);
  if (!source) return null;
  let host = "";
  try { host = new URL(source).hostname.toLowerCase(); } catch { return null; }
  if (!/(^|\.)pinterest\./.test(host) && host !== "pin.it") return null;
  return {
    sections: [{
      title: "Pinterest",
      rows: [
        { label: "Source", value: source, copyable: true },
        { label: "Status", value: "Resolved image available" }
      ],
      textBlocks: []
    }]
  };
}

export async function actions({ items }) {
  if (!items || items.length === 0) return [];
  return [{ id: "open-source", title: "Open Pinterest page", icon: "external" }];
}

export async function runAction({ id, item, items }) {
  if (id !== "open-source") return null;
  const target = (item && (item.url || item.originalUrl)) || (items && items[0] && (items[0].url || items[0].originalUrl));
  if (target) host.platformOpen?.(target);
  return { ok: true };
}
