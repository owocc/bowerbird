import { defineContentScript } from "wxt/utils/define-content-script";
import { initMediaDragDropZone } from "./drag-drop-zone";
import {
  fetchFolders,
  fetchTags,
  importBatch,
  importFromBase64,
  type Folder,
  type Tag,
} from "@/lib/api";

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "manifest",
  main() {
    // Initialize floating media drag-and-drop quick import
    initMediaDragDropZone();

    // Listen for background or popup triggers
    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
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
   1. Area Selection Screenshot Tool
   ========================================================================= */

function startAreaSelection() {
  if (document.getElementById("bowerbird-area-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "bowerbird-area-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483640;
    cursor: crosshair; user-select: none;
    background: rgba(0, 0, 0, 0.35);
  `;

  const box = document.createElement("div");
  box.style.cssText = `
    position: absolute; border: 2px solid #6366f1;
    background: rgba(99, 102, 241, 0.1);
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
    display: none; pointer-events: none;
  `;

  const dimensionTag = document.createElement("div");
  dimensionTag.style.cssText = `
    position: absolute; top: -28px; left: 0;
    background: #1e1b4b; color: #e0e7ff;
    padding: 2px 8px; border-radius: 4px; font-size: 11px;
    font-family: -apple-system, sans-serif; white-space: nowrap;
    border: 1px solid #4338ca;
  `;
  box.appendChild(dimensionTag);

  const toolbar = document.createElement("div");
  toolbar.style.cssText = `
    position: absolute; bottom: -44px; right: 0;
    background: #0f172a; border: 1px solid #334155;
    border-radius: 8px; padding: 4px 8px; display: flex; gap: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5); pointer-events: auto;
  `;

  const confirmBtn = document.createElement("button");
  confirmBtn.innerText = "✓ Save to Bowerbird";
  confirmBtn.style.cssText = `
    background: #6366f1; color: white; border: none;
    padding: 4px 12px; border-radius: 6px; font-size: 12px;
    font-weight: 600; cursor: pointer;
  `;

  const cancelBtn = document.createElement("button");
  cancelBtn.innerText = "✕ Cancel";
  cancelBtn.style.cssText = `
    background: #334155; color: #cbd5e1; border: none;
    padding: 4px 10px; border-radius: 6px; font-size: 12px;
    cursor: pointer;
  `;

  toolbar.appendChild(cancelBtn);
  toolbar.appendChild(confirmBtn);

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let isDragging = false;

  const onMouseDown = (e: MouseEvent) => {
    if (toolbar.contains(e.target as Node)) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    box.style.display = "block";
    if (toolbar.parentNode === box) {
      box.removeChild(toolbar);
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    currentX = e.clientX;
    currentY = e.clientY;

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;

    dimensionTag.innerText = `${Math.round(width)} × ${Math.round(height)} px`;
  };

  const onMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    if (width > 10 && height > 10) {
      box.appendChild(toolbar);
    }
  };

  const cleanup = () => {
    overlay.remove();
    window.removeEventListener("keydown", onKeyDown);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      cleanup();
    }
  };

  cancelBtn.onclick = cleanup;

  confirmBtn.onclick = async () => {
    confirmBtn.innerText = "Saving...";
    confirmBtn.disabled = true;

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    const dpr = window.devicePixelRatio || 1;

    // Temporarily hide overlay so screenshot is clean
    overlay.style.display = "none";

    chrome.runtime.sendMessage(
      { type: "CAPTURE_VISIBLE_TAB" },
      async (res: unknown) => {
        cleanup();
        if (!res || typeof res !== "object" || !("success" in res) || !res.success) {
          showToast("Failed to capture tab", true);
          return;
        }

        if (!("dataUrl" in res) || typeof res.dataUrl !== "string") {
          showToast("No screenshot data received", true);
          return;
        }
        const dataUrl = res.dataUrl;
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(width * dpr);
          canvas.height = Math.round(height * dpr);
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          ctx.drawImage(
            img,
            Math.round(left * dpr),
            Math.round(top * dpr),
            Math.round(width * dpr),
            Math.round(height * dpr),
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
            showToast("✓ Area saved to Bowerbird");
          } else {
            showToast(importRes.error || "Failed to save", true);
          }
        };
        img.src = dataUrl;
      }
    );
  };

  overlay.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("keydown", onKeyDown);
}

/* =========================================================================
   2. Batch Page Image Collector Modal
   ========================================================================= */

interface ExtractedImage {
  url: string;
  width: number;
  height: number;
  ext: string;
  element: Element;
}

async function openBatchCollector() {
  const existing = document.getElementById("bowerbird-batch-modal");
  if (existing) existing.remove();

  // Scan images from page
  const images = scanPageImages();
  if (images.length === 0) {
    showToast("No images found on this page", true);
    return;
  }

  // Load folders & tags from Bowerbird API
  const [folders, existingTags] = await Promise.all([
    fetchFolders().catch(() => [] as Folder[]),
    fetchTags().catch(() => [] as Tag[]),
  ]);

  // Create UI Modal
  const modal = document.createElement("div");
  modal.id = "bowerbird-batch-modal";
  modal.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483645;
    background: rgba(3, 7, 18, 0.85); backdrop-filter: blur(8px);
    display: flex; flex-direction: column; color: #f8fafc;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  // Header
  const header = document.createElement("div");
  header.style.cssText = `
    height: 60px; padding: 0 24px; border-bottom: 1px solid #1e293b;
    display: flex; items-center; justify-content: space-between;
    background: #0f172a; align-items: center; shrink-0;
  `;
  header.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="width: 28px; height: 28px; border-radius: 8px; background: #6366f1; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px;">B</div>
      <div>
        <div style="font-weight: 700; font-size: 15px;">Bowerbird Batch Collector</div>
        <div style="font-size: 11px; color: #94a3b8;">Found ${images.length} images on this page</div>
      </div>
    </div>
    <div style="display: flex; align-items: center; gap: 12px;">
      <button id="bb-close-modal" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1; border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer;">✕ Close</button>
    </div>
  `;
  modal.appendChild(header);

  // Controls Bar
  const controls = document.createElement("div");
  controls.style.cssText = `
    padding: 12px 24px; border-bottom: 1px solid #1e293b; background: #0b1120;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
  `;
  controls.innerHTML = `
    <div style="display: flex; align-items: center; gap: 16px;">
      <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
        <input type="checkbox" id="bb-select-all" checked style="cursor: pointer;" />
        <span id="bb-selected-count">Selected (${images.length}/${images.length})</span>
      </label>

      <div style="height: 16px; width: 1px; background: #334155;"></div>

      <div style="display: flex; align-items: center; gap: 8px; font-size: 12px;">
        <span style="color: #94a3b8;">Min Width:</span>
        <select id="bb-size-filter" style="background: #1e293b; color: #f8fafc; border: 1px solid #334155; border-radius: 6px; padding: 4px 8px; font-size: 11px; cursor: pointer;">
          <option value="0">All Sizes</option>
          <option value="150">> 150 px</option>
          <option value="300" selected>> 300 px</option>
          <option value="600">> 600 px</option>
          <option value="1000">> 1000 px</option>
        </select>
      </div>

      <div style="display: flex; align-items: center; gap: 8px; font-size: 12px;">
        <span style="color: #94a3b8;">Target Folder:</span>
        <select id="bb-folder-select" style="background: #1e293b; color: #f8fafc; border: 1px solid #334155; border-radius: 6px; padding: 4px 8px; font-size: 11px; cursor: pointer; max-width: 160px;">
          <option value="">(Uncategorized)</option>
          ${folders.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("")}
        </select>
      </div>
    </div>

    <div style="display: flex; align-items: center; gap: 12px;">
      <button id="bb-import-btn" style="background: #6366f1; color: white; border: none; border-radius: 6px; padding: 7px 18px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
        <span>📥 Import to Bowerbird</span>
      </button>
    </div>
  `;
  modal.appendChild(controls);

  // Gallery Container
  const gallery = document.createElement("div");
  gallery.id = "bb-gallery-grid";
  gallery.style.cssText = `
    flex: 1; overflow-y: auto; padding: 20px 24px;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px; align-content: start;
  `;
  modal.appendChild(gallery);
  document.body.appendChild(modal);

  const selectedUrls = new Set<string>(images.map((it) => it.url));

  const renderGallery = () => {
    gallery.innerHTML = "";
    const minWidth = parseInt(
      (document.getElementById("bb-size-filter") as HTMLSelectElement)?.value || "0",
      10
    );

    const filtered = images.filter((img) => img.width >= minWidth);

    filtered.forEach((img, idx) => {
      const isSelected = selectedUrls.has(img.url);
      const card = document.createElement("div");
      card.style.cssText = `
        position: relative; border-radius: 8px; overflow: hidden;
        border: 2px solid ${isSelected ? "#6366f1" : "#1e293b"};
        background: #0f172a; aspect-ratio: 1; display: flex; flex-direction: column;
        cursor: pointer; transition: all 0.15s ease;
      `;

      card.innerHTML = `
        <div style="flex: 1; overflow: hidden; display: flex; items-center; justify-content: center; background: #020617; position: relative;">
          <img src="${img.url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%2250%%22 x=%2250%%22 text-anchor=%22middle%22 fill=%22%2394a3b8%22>Img</text></svg>'" />
          <input type="checkbox" ${isSelected ? "checked" : ""} style="position: absolute; top: 8px; left: 8px; width: 18px; height: 18px; cursor: pointer; accent-color: #6366f1;" />
          <span style="position: absolute; bottom: 6px; right: 6px; background: rgba(0,0,0,0.75); padding: 2px 6px; border-radius: 4px; font-size: 10px; font-family: monospace;">${img.width}×${img.height}</span>
        </div>
      `;

      card.onclick = (e) => {
        if (selectedUrls.has(img.url)) {
          selectedUrls.delete(img.url);
        } else {
          selectedUrls.add(img.url);
        }
        updateSelectedCount();
        renderGallery();
      };

      gallery.appendChild(card);
    });

    updateSelectedCount();
  };

  const updateSelectedCount = () => {
    const counter = document.getElementById("bb-selected-count");
    if (counter) {
      counter.innerText = `Selected (${selectedUrls.size}/${images.length})`;
    }
  };

  renderGallery();

  // Event handlers
  document.getElementById("bb-close-modal")!.onclick = () => modal.remove();
  document.getElementById("bb-size-filter")!.onchange = renderGallery;

  const selectAllCheckbox = document.getElementById("bb-select-all") as HTMLInputElement;
  selectAllCheckbox.onchange = () => {
    if (selectAllCheckbox.checked) {
      images.forEach((it) => selectedUrls.add(it.url));
    } else {
      selectedUrls.clear();
    }
    updateSelectedCount();
    renderGallery();
  };

  const importBtn = document.getElementById("bb-import-btn") as HTMLButtonElement;
  importBtn.onclick = async () => {
    if (selectedUrls.size === 0) {
      showToast("Please select at least one image", true);
      return;
    }

    importBtn.disabled = true;
    importBtn.innerText = `Importing (${selectedUrls.size})...`;

    const folderId = (document.getElementById("bb-folder-select") as HTMLSelectElement)?.value || "";
    const itemsToImport = Array.from(selectedUrls).map((u) => ({
      url: u,
      website: window.location.href,
      tags: ["web-batch"],
    }));

    const res = await importBatch({
      items: itemsToImport,
      folderId: folderId || undefined,
      tags: ["batch-collector"],
    });

    modal.remove();
    if (res.success) {
      showToast(`✓ Imported ${res.count || selectedUrls.size} images to Bowerbird`);
    } else {
      showToast(res.error || "Failed to import images", true);
    }
  };
}

function scanPageImages(): ExtractedImage[] {
  const result: ExtractedImage[] = [];
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
          element: img,
        });
      }
    }
  });

  // 2. Scan background images
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
              element: el,
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(message: string, isError = false) {
  const toast = document.createElement("div");
  toast.innerText = message;
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
    background: ${isError ? "#ef4444" : "#10b981"};
    color: white; padding: 10px 18px; border-radius: 8px;
    font-size: 13px; font-weight: 600; font-family: -apple-system, sans-serif;
    box-shadow: 0 4px 14px rgba(0,0,0,0.3); pointer-events: none;
    transition: opacity 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 350);
  }, 2500);
}
