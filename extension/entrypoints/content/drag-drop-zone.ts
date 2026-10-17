import {
  checkAppRunning,
  fetchFolders,
  flattenFolders,
  importFromURL,
  importFromBase64,
  type FlatFolder,
  type AppRunningStatus,
} from "@/lib/api";

interface DraggedMediaInfo {
  url?: string;
  name?: string;
  website?: string;
}

let currentDragMedia: DraggedMediaInfo | null = null;
let dropZoneContainer: HTMLElement | null = null;
let hideTimer: number | null = null;
let cachedFolders: FlatFolder[] = [];
let cachedStatus: AppRunningStatus | null = null;
let lastStatusCheckTime = 0;

/**
 * Initializes the floating media drag-and-drop overlay on the current webpage.
 */
export function initMediaDragDropZone() {
  // Capture element being dragged on the webpage
  window.addEventListener("dragstart", (e: DragEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    let mediaUrl = "";
    let mediaName = "";

    if (target instanceof HTMLImageElement) {
      mediaUrl = target.currentSrc || target.src;
      mediaName = target.alt || target.title || document.title || "Dragged Image";
    } else if (target instanceof HTMLAnchorElement) {
      // If anchor contains an image, prefer the image src
      const childImg = target.querySelector("img");
      if (childImg && (childImg.currentSrc || childImg.src)) {
        mediaUrl = childImg.currentSrc || childImg.src;
        mediaName = childImg.alt || childImg.title || target.innerText.trim();
      } else {
        mediaUrl = target.href;
        mediaName = target.innerText.trim() || target.title || "Dragged Link";
      }
    } else if (target instanceof HTMLVideoElement) {
      mediaUrl = target.poster || target.src;
      mediaName = "Dragged Video";
    } else {
      // Check for CSS background-image
      const bg = window.getComputedStyle(target).backgroundImage;
      if (bg && bg.startsWith("url(")) {
        const match = bg.match(/url\(['"]?(.*?)['"]?\)/);
        if (match && match[1]) {
          mediaUrl = match[1];
          mediaName = "Dragged Background Image";
        }
      }
    }

    if (mediaUrl) {
      currentDragMedia = {
        url: mediaUrl,
        name: mediaName,
        website: window.location.href,
      };
      showDropZone();
    }
  });

  // Handle external drags (e.g. drag from another tab or desktop)
  window.addEventListener("dragenter", (e: DragEvent) => {
    if (!e.dataTransfer) return;
    const types = Array.from(e.dataTransfer.types);
    if (types.includes("Files") || types.includes("text/uri-list") || types.includes("text/plain")) {
      showDropZone();
    }
  });

  window.addEventListener("dragend", () => {
    currentDragMedia = null;
    scheduleHideDropZone(150);
  });

  document.documentElement.addEventListener("dragleave", (e: DragEvent) => {
    if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
      scheduleHideDropZone(300);
    }
  });
}

function scheduleHideDropZone(delayMs = 200) {
  clearTimeout(hideTimer ?? undefined);
  hideTimer = window.setTimeout(() => {
    if (dropZoneContainer) {
      dropZoneContainer.style.opacity = "0";
      dropZoneContainer.style.transform = "translateY(-50%) translateX(30px)";
      setTimeout(() => {
        if (dropZoneContainer) {
          dropZoneContainer.remove();
          dropZoneContainer = null;
        }
      }, 200);
    }
  }, delayMs);
}

async function showDropZone() {
  clearTimeout(hideTimer ?? undefined);
  hideTimer = null;

  // Refresh status if older than 5 seconds
  const now = Date.now();
  if (!cachedStatus || now - lastStatusCheckTime > 5000) {
    cachedStatus = await checkAppRunning();
    lastStatusCheckTime = now;
    if (cachedStatus.running) {
      const folderTree = await fetchFolders();
      cachedFolders = flattenFolders(folderTree);
    }
  }

  if (dropZoneContainer) {
    dropZoneContainer.style.opacity = "1";
    dropZoneContainer.style.transform = "translateY(-50%) translateX(0)";
    return;
  }

  // Build Floating Drop Zone Panel
  const panel = document.createElement("div");
  panel.id = "bowerbird-drag-drop-panel";
  panel.style.cssText = `
    position: fixed; right: 24px; top: 50%; transform: translateY(-50%) translateX(20px);
    z-index: 2147483646; width: 280px; max-height: 80vh;
    background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(12px);
    border: 1px solid #334155; border-radius: 14px;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05);
    display: flex; flex-direction: column; overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #f8fafc; opacity: 0; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    user-select: none;
  `;

  // Prevent dragover default so drop is permitted everywhere inside the panel
  panel.addEventListener("dragover", (e: DragEvent) => {
    e.preventDefault();
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  });

  panel.addEventListener("dragleave", (e: DragEvent) => {
    // If leaving the panel container completely
    const rect = panel.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      scheduleHideDropZone(300);
    }
  });

  // Header
  const header = document.createElement("div");
  header.style.cssText = `
    padding: 12px 14px; border-bottom: 1px solid #1e293b;
    display: flex; align-items: center; justify-content: space-between;
    background: #0b1120;
  `;
  header.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <div style="width: 20px; height: 20px; border-radius: 5px; background: #6366f1; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px; color: white;">B</div>
      <div style="font-weight: 700; font-size: 12px; letter-spacing: -0.01em;">Bowerbird Quick Drop</div>
    </div>
    <div style="display: flex; align-items: center; gap: 5px;">
      <span style="width: 7px; height: 7px; border-radius: 50%; background: ${cachedStatus.running ? "#10b981" : "#ef4444"}; display: inline-block;"></span>
      <span style="font-size: 10px; color: #94a3b8;">${cachedStatus.running ? "Active" : "Stopped"}</span>
    </div>
  `;
  panel.appendChild(header);

  // If application is not running, display guidance banner
  if (!cachedStatus.running) {
    const offlineBody = document.createElement("div");
    offlineBody.style.cssText = `
      padding: 18px 14px; display: flex; flex-direction: column;
      align-items: center; text-align: center; gap: 8px;
    `;
    offlineBody.innerHTML = `
      <div style="font-size: 24px;">⚠️</div>
      <div style="font-size: 12px; font-weight: 600; color: #f87171;">Bowerbird is not running</div>
      <div style="font-size: 11px; color: #94a3b8; line-height: 1.4;">
        Please launch the Bowerbird desktop application to save dragged media directly into your library.
      </div>
    `;
    panel.appendChild(offlineBody);
    document.body.appendChild(panel);
    dropZoneContainer = panel;
    requestAnimationFrame(() => {
      panel.style.opacity = "1";
      panel.style.transform = "translateY(-50%) translateX(0)";
    });
    return;
  }

  // Content Area with Drop Slots
  const content = document.createElement("div");
  content.style.cssText = `
    padding: 10px; display: flex; flex-direction: column; gap: 8px;
    overflow-y: auto; max-height: calc(80vh - 50px);
  `;

  // 1. Primary Drop Slot: Quick Save (All Assets)
  const quickSaveSlot = createDropSlot({
    title: "Quick Save",
    subtitle: cachedStatus.libraryName || "Library Root (Unclassified)",
    icon: "📥",
    isPrimary: true,
    onDrop: async (e) => {
      await handleMediaDrop(e, undefined, quickSaveSlot);
    },
  });
  content.appendChild(quickSaveSlot);

  // 2. Folders Direct Listing
  if (cachedFolders.length > 0) {
    const foldersHeader = document.createElement("div");
    foldersHeader.style.cssText = `
      font-size: 10px; font-weight: 600; color: #64748b;
      padding: 4px 4px 0 4px; text-transform: uppercase; letter-spacing: 0.04em;
    `;
    foldersHeader.innerText = `Drop into Folder (${cachedFolders.length})`;
    content.appendChild(foldersHeader);

    const folderListContainer = document.createElement("div");
    folderListContainer.style.cssText = `
      display: flex; flex-direction: column; gap: 6px;
    `;

    for (const folder of cachedFolders) {
      const folderSlot = createDropSlot({
        title: folder.name,
        subtitle: folder.path !== folder.name ? folder.path : undefined,
        icon: "📁",
        badge: folder.itemCount > 0 ? String(folder.itemCount) : undefined,
        onDrop: async (e) => {
          await handleMediaDrop(e, folder.id, folderSlot, folder.name);
        },
      });
      folderListContainer.appendChild(folderSlot);
    }
    content.appendChild(folderListContainer);
  } else {
    const emptyHint = document.createElement("div");
    emptyHint.style.cssText = `
      font-size: 10px; color: #64748b; text-align: center; padding: 6px;
    `;
    emptyHint.innerText = "No virtual folders created yet";
    content.appendChild(emptyHint);
  }

  panel.appendChild(content);
  document.body.appendChild(panel);
  dropZoneContainer = panel;

  requestAnimationFrame(() => {
    panel.style.opacity = "1";
    panel.style.transform = "translateY(-50%) translateX(0)";
  });
}

function createDropSlot(options: {
  title: string;
  subtitle?: string;
  icon: string;
  badge?: string;
  isPrimary?: boolean;
  onDrop: (e: DragEvent) => Promise<void>;
}): HTMLElement {
  const slot = document.createElement("div");
  slot.style.cssText = `
    border-radius: 8px; padding: 10px 12px;
    border: 1.5px dashed ${options.isPrimary ? "#6366f1" : "#334155"};
    background: ${options.isPrimary ? "rgba(99, 102, 241, 0.12)" : "rgba(30, 41, 59, 0.5)"};
    display: flex; align-items: center; justify-content: space-between;
    transition: all 0.15s ease; cursor: copy;
  `;

  slot.innerHTML = `
    <div style="display: flex; align-items: center; gap: 9px; pointer-events: none; min-width: 0;">
      <span style="font-size: 15px; shrink-0;">${options.icon}</span>
      <div style="min-width: 0;">
        <div style="font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(options.title)}</div>
        ${options.subtitle ? `<div style="font-size: 9px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(options.subtitle)}</div>` : ""}
      </div>
    </div>
    ${options.badge ? `<span style="font-size: 10px; font-family: monospace; background: #334155; color: #cbd5e1; padding: 2px 5px; border-radius: 4px; pointer-events: none;">${options.badge}</span>` : ""}
  `;

  slot.addEventListener("dragenter", (e: DragEvent) => {
    e.preventDefault();
    slot.style.borderColor = "#6366f1";
    slot.style.background = "rgba(99, 102, 241, 0.3)";
    slot.style.transform = "scale(1.02)";
  });

  slot.addEventListener("dragover", (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  });

  slot.addEventListener("dragleave", () => {
    slot.style.borderColor = options.isPrimary ? "#6366f1" : "#334155";
    slot.style.background = options.isPrimary ? "rgba(99, 102, 241, 0.12)" : "rgba(30, 41, 59, 0.5)";
    slot.style.transform = "scale(1)";
  });

  slot.addEventListener("drop", async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    slot.style.borderColor = "#10b981";
    slot.style.background = "rgba(16, 185, 129, 0.25)";
    await options.onDrop(e);
  });

  return slot;
}

async function handleMediaDrop(
  e: DragEvent,
  folderId?: string,
  slotEl?: HTMLElement,
  folderName?: string
) {
  if (slotEl) {
    slotEl.innerHTML = `
      <div style="font-size: 11px; font-weight: 600; color: #818cf8; display: flex; align-items: center; gap: 6px;">
        <span>⏳</span>
        <span>Saving to ${escapeHtml(folderName || "Library")}...</span>
      </div>
    `;
  }

  try {
    let targetUrl = currentDragMedia?.url;
    let targetName = currentDragMedia?.name || document.title || "Dropped Asset";

    // 1. Check if files were dropped directly
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (!file) {
        showErrorAndClose(slotEl, "File access error");
        return;
      }
      const base64Data = await readFileAsBase64(file);
      const res = await importFromBase64({
        base64: base64Data,
        name: file.name,
        website: window.location.href,
        tags: ["web-drop"],
        folderId,
      });

      if (res.success) {
        showSuccessAndClose(slotEl, folderName);
      } else {
        showErrorAndClose(slotEl, res.error);
      }
      return;
    }

    // 2. Extract URL from dataTransfer if not already captured
    if (!targetUrl && e.dataTransfer) {
      targetUrl = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");

      // Check text/html for img src
      if (!targetUrl) {
        const html = e.dataTransfer.getData("text/html");
        if (html) {
          const doc = new DOMParser().parseFromString(html, "text/html");
          const img = doc.querySelector("img");
          if (img && img.src) {
            targetUrl = img.src;
            targetName = img.alt || targetName;
          }
        }
      }
    }

    if (!targetUrl) {
      showErrorAndClose(slotEl, "No media found in drop");
      return;
    }

    // Hand off download completely to Go backend to resolve true extension,
    // Content-Disposition filename, and magic bytes sniffing
    const res = await importFromURL({
      url: targetUrl,
      website: window.location.href,
      tags: ["web-drop"],
      folderId,
      headers: { Referer: window.location.href },
    });

    if (res.success) {
      showSuccessAndClose(slotEl, folderName);
    } else {
      showErrorAndClose(slotEl, res.error);
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Drop error";
    showErrorAndClose(slotEl, errorMsg);
  }
}

function showSuccessAndClose(slotEl?: HTMLElement, folderName?: string) {
  if (slotEl) {
    slotEl.innerHTML = `
      <div style="font-size: 11px; font-weight: 600; color: #34d399; display: flex; align-items: center; gap: 6px;">
        <span>✓</span>
        <span>Saved to ${escapeHtml(folderName || "Library")}</span>
      </div>
    `;
  }
  chrome.runtime.sendMessage({ type: "FLASH_BADGE", text: "✓", color: "#10b981" });
  setTimeout(() => {
    scheduleHideDropZone(400);
  }, 800);
}

function showErrorAndClose(slotEl?: HTMLElement, error?: string) {
  if (slotEl) {
    slotEl.innerHTML = `
      <div style="font-size: 11px; font-weight: 600; color: #f87171; display: flex; align-items: center; gap: 6px;">
        <span>✕</span>
        <span>${escapeHtml(error || "Failed")}</span>
      </div>
    `;
  }
  chrome.runtime.sendMessage({ type: "FLASH_BADGE", text: "✕", color: "#ef4444" });
  setTimeout(() => {
    scheduleHideDropZone(1200);
  }, 1000);
}

function readFileAsBase64(file: File): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") {
      resolve(reader.result);
    } else {
      reject(new Error("Failed to read file as string"));
    }
  };
  reader.onerror = () => reject(reader.error || new Error("File read error"));
  reader.readAsDataURL(file);
  return promise;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
