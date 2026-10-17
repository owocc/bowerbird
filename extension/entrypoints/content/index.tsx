import React from "react";
import { browser } from "wxt/browser";
import ReactDOM from "react-dom/client";
import { defineContentScript } from "wxt/utils/define-content-script";
import { initMediaDragDropZone } from "./drag-drop-zone";
import { BatchCollectorModal, type ExtractedImageItem } from "@/components/BatchCollectorModal";
import { AreaSelectionOverlay } from "@/components/AreaSelectionOverlay";
import contentStyle from "./style.css?inline";
import {
  fetchFolders,
  flattenFolders,
  importBatch,
  importFromBase64,
  type FlatFolder,
} from "@/lib/api";

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "manifest",
  main() {
    // 1. Initialize floating drag-and-drop drop zone on current page
    initMediaDragDropZone();

    // 2. Listen for background or popup triggers
    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (!message || typeof message !== "object" || !("type" in message)) return;
      const msgType = message.type;

      if (msgType === "OPEN_BATCH_COLLECTOR") {
        openBatchCollector();
        sendResponse({ success: true });
      } else if (msgType === "START_AREA_SELECTION") {
        startAreaSelection();
        sendResponse({ success: true });
      }
    });
  },
});

/* =========================================================================
   Batch Image Collector (React + shadcn UI inside Shadow DOM)
   ========================================================================= */

let batchShadowHost: HTMLElement | null = null;
let batchReactRoot: ReactDOM.Root | null = null;

async function openBatchCollector() {
  closeBatchCollector();

  const images = scanPageImages();
  if (images.length === 0) {
    showShadowToast("No images found on this page", true);
    return;
  }

  const folderTree = await fetchFolders().catch(() => []);
  const flatFolders = flattenFolders(folderTree);

  batchShadowHost = document.createElement("div");
  batchShadowHost.id = "bowerbird-batch-host";
  batchShadowHost.style.cssText = "position: fixed; inset: 0; z-index: 2147483646; pointer-events: auto;";

  const shadow = batchShadowHost.attachShadow({ mode: "open" });
  const styleEl = document.createElement("style");
  styleEl.textContent = contentStyle;
  shadow.appendChild(styleEl);

  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);
  document.body.appendChild(batchShadowHost);

  batchReactRoot = ReactDOM.createRoot(mountPoint);
  batchReactRoot.render(
    <BatchCollectorModal
      images={images}
      folders={flatFolders}
      onImport={async (urls, folderId) => {
        const payload = {
          items: urls.map((u) => ({
            url: u,
            website: window.location.href,
            tags: ["web-batch"],
          })),
          folderId,
          tags: ["batch-collector"],
        };
        const res = await importBatch(payload);
        if (res.success) {
          browser.runtime.sendMessage({ type: "FLASH_BADGE", text: "✓", color: "#10b981" });
        }
        return res;
      }}
      onClose={closeBatchCollector}
    />
  );
}

function closeBatchCollector() {
  if (batchShadowHost) {
    if (batchReactRoot) {
      batchReactRoot.unmount();
      batchReactRoot = null;
    }
    batchShadowHost.remove();
    batchShadowHost = null;
  }
}

/* =========================================================================
   Area Screenshot Overlay (React + shadcn UI inside Shadow DOM)
   ========================================================================= */

let areaShadowHost: HTMLElement | null = null;
let areaReactRoot: ReactDOM.Root | null = null;

function startAreaSelection() {
  closeAreaSelection();

  areaShadowHost = document.createElement("div");
  areaShadowHost.id = "bowerbird-area-host";
  areaShadowHost.style.cssText = "position: fixed; inset: 0; z-index: 2147483647; pointer-events: auto;";

  const shadow = areaShadowHost.attachShadow({ mode: "open" });
  const styleEl = document.createElement("style");
  styleEl.textContent = contentStyle;
  shadow.appendChild(styleEl);

  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);
  document.body.appendChild(areaShadowHost);

  areaReactRoot = ReactDOM.createRoot(mountPoint);
  areaReactRoot.render(
    <AreaSelectionOverlay
      onConfirm={async (box) => {
        // Temporarily hide shadow host during screen capture
        if (areaShadowHost) {
          areaShadowHost.style.display = "none";
        }

        browser.runtime.sendMessage({ type: "CAPTURE_VISIBLE_TAB" }, async (res: unknown) => {
          closeAreaSelection();

          if (!res || typeof res !== "object" || !("success" in res) || !res.success) {
            showShadowToast("Failed to capture tab", true);
            return;
          }
          if (!("dataUrl" in res) || typeof res.dataUrl !== "string") {
            showShadowToast("No screenshot data received", true);
            return;
          }

          const img = new Image();
          img.onload = async () => {
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(box.width * box.dpr);
            canvas.height = Math.round(box.height * box.dpr);
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            ctx.drawImage(
              img,
              Math.round(box.x * box.dpr),
              Math.round(box.y * box.dpr),
              Math.round(box.width * box.dpr),
              Math.round(box.height * box.dpr),
              0,
              0,
              canvas.width,
              canvas.height
            );

            const croppedB64 = canvas.toDataURL("image/png");
            const pageTitle = document.title || "Selected Region";
            const importRes = await importFromBase64({
              base64: croppedB64,
              name: `${pageTitle} - Region`,
              website: window.location.href,
              tags: ["area-screenshot"],
            });

            if (importRes.success) {
              browser.runtime.sendMessage({ type: "FLASH_BADGE", text: "✓", color: "#10b981" });
              showShadowToast("✓ Area saved to Bowerbird");
            } else {
              showShadowToast(importRes.error || "Failed to save", true);
            }
          };
          img.src = res.dataUrl;
        });
      }}
      onCancel={closeAreaSelection}
    />
  );
}

function closeAreaSelection() {
  if (areaShadowHost) {
    if (areaReactRoot) {
      areaReactRoot.unmount();
      areaReactRoot = null;
    }
    areaShadowHost.remove();
    areaShadowHost = null;
  }
}

/* =========================================================================
   DOM Page Image Scanner
   ========================================================================= */

function scanPageImages(): ExtractedImageItem[] {
  const result: ExtractedImageItem[] = [];
  const seenUrls = new Set<string>();

  // 1. Scan <img>
  document.querySelectorAll("img").forEach((img) => {
    const src = img.currentSrc || img.src;
    if (isValidImageUrl(src) && !seenUrls.has(src)) {
      const w = img.naturalWidth || img.clientWidth || 0;
      const h = img.naturalHeight || img.clientHeight || 0;
      if (w >= 32 && h >= 32) {
        seenUrls.add(src);
        result.push({
          url: src,
          width: w,
          height: h,
          ext: getExtension(src),
        });
      }
    }
  });

  // 2. Scan background-image
  document.querySelectorAll("*").forEach((el) => {
    const bg = window.getComputedStyle(el).backgroundImage;
    if (bg && bg.startsWith("url(") && !bg.includes("data:image/svg+xml")) {
      const match = bg.match(/url\(['"]?(.*?)['"]?\)/);
      if (match && match[1]) {
        const url = match[1];
        if (isValidImageUrl(url) && !seenUrls.has(url)) {
          const rect = el.getBoundingClientRect();
          if (rect.width >= 32 && rect.height >= 32) {
            seenUrls.add(url);
            result.push({
              url,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              ext: getExtension(url),
            });
          }
        }
      }
    }
  });

  return result;
}

function isValidImageUrl(src: string): boolean {
  if (!src) return false;
  if (src.startsWith("javascript:") || src.startsWith("about:")) return false;
  return true;
}

function getExtension(url: string): string {
  try {
    const path = new URL(url).pathname;
    const parts = path.split(".");
    return parts.length > 1 ? parts.pop()?.toLowerCase() || "png" : "png";
  } catch {
    return "png";
  }
}

function showShadowToast(message: string, isError = false) {
  const toastHost = document.createElement("div");
  toastHost.style.cssText = "position: fixed; bottom: 24px; right: 24px; z-index: 2147483647; pointer-events: none;";

  const shadow = toastHost.attachShadow({ mode: "open" });
  const styleEl = document.createElement("style");
  styleEl.textContent = contentStyle;
  shadow.appendChild(styleEl);

  const toast = document.createElement("div");
  toast.className = `p-3 px-4 rounded-xl font-medium text-xs shadow-2xl flex items-center gap-2 border animate-in fade-in slide-in-from-bottom-2 duration-150 ${
    isError
      ? "bg-destructive/20 border-destructive/40 text-destructive"
      : "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
  }`;
  toast.innerText = message;
  shadow.appendChild(toast);
  document.body.appendChild(toastHost);

  setTimeout(() => {
    toastHost.style.transition = "opacity 0.2s ease";
    toastHost.style.opacity = "0";
    setTimeout(() => toastHost.remove(), 250);
  }, 2400);
}
