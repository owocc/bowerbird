import React from "react";
import { browser } from "wxt/browser";
import ReactDOM from "react-dom/client";
import { DragDropPanel } from "@/components/DragDropPanel";
import contentStyle from "./style.css?inline";
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
let shadowHost: HTMLElement | null = null;
let reactRoot: ReactDOM.Root | null = null;
let hideTimer: number | null = null;
let cachedFolders: FlatFolder[] = [];
let cachedStatus: AppRunningStatus | null = null;
let lastStatusCheckTime = 0;

/**
 * Initializes the floating media drag-and-drop overlay on the current webpage.
 */
export function initMediaDragDropZone() {
  window.addEventListener("dragstart", (e: DragEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    let mediaUrl = "";
    let mediaName = "";

    if (target instanceof HTMLImageElement) {
      mediaUrl = target.currentSrc || target.src;
      mediaName = target.alt || target.title || document.title || "Dragged Image";
    } else if (target instanceof HTMLAnchorElement) {
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

  window.addEventListener("dragenter", (e: DragEvent) => {
    if (!e.dataTransfer) return;
    const types = Array.from(e.dataTransfer.types);
    if (types.includes("Files") || types.includes("text/uri-list") || types.includes("text/plain")) {
      showDropZone();
    }
  });

  window.addEventListener("dragend", () => {
    currentDragMedia = null;
    scheduleHideDropZone(200);
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
    hideDropZone();
  }, delayMs);
}

function hideDropZone() {
  if (shadowHost) {
    if (reactRoot) {
      reactRoot.unmount();
      reactRoot = null;
    }
    shadowHost.remove();
    shadowHost = null;
  }
}

async function showDropZone() {
  clearTimeout(hideTimer ?? undefined);
  hideTimer = null;

  const now = Date.now();
  if (!cachedStatus || now - lastStatusCheckTime > 5000) {
    cachedStatus = await getAppStatus();
    lastStatusCheckTime = now;
    if (cachedStatus.running) {
      cachedFolders = await getFoldersList();
    }
  }

  if (!shadowHost) {
    shadowHost = document.createElement("div");
    shadowHost.id = "bowerbird-drag-drop-host";
    shadowHost.style.cssText = `
      position: fixed; right: 24px; top: 50%; transform: translateY(-50%);
      z-index: 2147483646; pointer-events: auto;
    `;

    const shadow = shadowHost.attachShadow({ mode: "open" });
    const styleEl = document.createElement("style");
    styleEl.textContent = contentStyle;
    shadow.appendChild(styleEl);

    const mountPoint = document.createElement("div");
    shadow.appendChild(mountPoint);
    document.body.appendChild(shadowHost);

    reactRoot = ReactDOM.createRoot(mountPoint);
  }

  renderPanel();
}

function renderPanel() {
  if (!reactRoot || !cachedStatus) return;

  reactRoot.render(
    <DragDropPanel
      status={cachedStatus}
      folders={cachedFolders}
      onDropMedia={handleMediaDrop}
      onClose={hideDropZone}
    />
  );
}

async function handleMediaDrop(
  folderId?: string,
  _folderName?: string,
  dataTransfer?: DataTransfer | null
): Promise<{ success: boolean; error?: string }> {
  try {
    let targetUrl = currentDragMedia?.url;
    let targetName = currentDragMedia?.name || document.title || "Dropped Asset";

    // If not detected from dragstart, try dataTransfer fallback (crucial for Safari & external files)
    if (!targetUrl && dataTransfer) {
      if (dataTransfer.files && dataTransfer.files.length > 0) {
        const file = dataTransfer.files[0];
        if (file) {
          targetName = file.name || targetName;
          targetUrl = await readFileAsDataURL(file);
        }
      } else {
        const uriList = dataTransfer.getData("text/uri-list");
        const urlData = dataTransfer.getData("URL");
        const textData = dataTransfer.getData("text/plain")?.trim();
        targetUrl = uriList || urlData || (textData?.startsWith("http") || textData?.startsWith("data:") ? textData : undefined);
      }
    }

    if (!targetUrl) {
      return { success: false, error: "No media detected" };
    }

    let res: { success: boolean; error?: string } | null = null;
    try {
      if (targetUrl.startsWith("data:")) {
        res = (await browser.runtime.sendMessage({
          type: "IMPORT_FROM_BASE64",
          payload: {
            base64: targetUrl,
            name: targetName,
            website: window.location.href,
            tags: ["web-drop"],
            folderId,
          },
        })) as { success: boolean; error?: string } | null;
      } else {
        res = (await browser.runtime.sendMessage({
          type: "IMPORT_FROM_URL",
          payload: {
            url: targetUrl,
            name: targetName,
            website: window.location.href,
            tags: ["web-drop"],
            folderId,
            headers: { Referer: window.location.href },
          },
        })) as { success: boolean; error?: string } | null;
      }
    } catch {}

    if (!res) {
      res = targetUrl.startsWith("data:")
        ? await importFromBase64({
            base64: targetUrl,
            name: targetName,
            website: window.location.href,
            tags: ["web-drop"],
            folderId,
          })
        : await importFromURL({
            url: targetUrl,
            name: targetName,
            website: window.location.href,
            tags: ["web-drop"],
            folderId,
            headers: { Referer: window.location.href },
          });
    }
    if (res.success) {
      browser.runtime.sendMessage({ type: "FLASH_BADGE", text: "✓", color: "#10b981" });
      return { success: true };
    }
    return { success: false, error: res.error || "Import failed" };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Drop error";
    return { success: false, error: errorMsg };
  }
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function getAppStatus(): Promise<AppRunningStatus> {
  try {
    const res = await browser.runtime.sendMessage({ type: "CHECK_APP_RUNNING" });
    if (res && typeof res === "object" && typeof (res as any).running === "boolean") {
      return res as AppRunningStatus;
    }
  } catch {}
  return await checkAppRunning();
}

async function getFoldersList(): Promise<FlatFolder[]> {
  try {
    const res = await browser.runtime.sendMessage({ type: "FETCH_FOLDERS" });
    if (Array.isArray(res)) {
      return flattenFolders(res);
    }
  } catch {}
  return flattenFolders(await fetchFolders());
}
