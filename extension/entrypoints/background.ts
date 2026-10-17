import { defineBackground } from "wxt/utils/define-background";
import {
  importFromURL,
  importFromBase64,
  importBookmark,
  checkConnection,
  getStoredApiUrl,
} from "@/lib/api";

export default defineBackground(() => {
  // Initialize context menus
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "bowerbird-save-image",
      title: "Save Image to Bowerbird",
      contexts: ["image"],
    });

    chrome.contextMenus.create({
      id: "bowerbird-save-link",
      title: "Save Link to Bowerbird",
      contexts: ["link"],
    });

    chrome.contextMenus.create({
      id: "bowerbird-save-screenshot",
      title: "Capture Visible Screen to Bowerbird",
      contexts: ["page"],
    });

    chrome.contextMenus.create({
      id: "bowerbird-batch-collect",
      title: "Batch Save Page Images...",
      contexts: ["page"],
    });
  });

  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const pageUrl = info.pageUrl || tab?.url || "";
    const pageTitle = tab?.title || "";

    if (info.menuItemId === "bowerbird-save-image" && info.srcUrl) {
      flashBadge("...", "#6366f1");
      const res = await importFromURL({
        url: info.srcUrl,
        website: pageUrl,
        tags: ["web-clip"],
        headers: pageUrl ? { Referer: pageUrl } : undefined,
      });
      if (res.success) {
        flashBadge("✓", "#10b981");
      } else {
        flashBadge("✕", "#ef4444");
      }
    } else if (info.menuItemId === "bowerbird-save-link" && info.linkUrl) {
      flashBadge("...", "#6366f1");
      const res = await importBookmark({
        url: info.linkUrl,
        title: info.linkUrl,
        tags: ["bookmark"],
      });
      if (res.success) {
        flashBadge("✓", "#10b981");
      } else {
        flashBadge("✕", "#ef4444");
      }
    } else if (info.menuItemId === "bowerbird-save-screenshot" && tab?.id) {
      flashBadge("...", "#6366f1");
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: "png",
        });
        const res = await importFromBase64({
          base64: dataUrl,
          name: pageTitle ? `${pageTitle} - Screenshot` : "Web Screenshot",
          website: pageUrl,
          tags: ["screenshot"],
        });
        if (res.success) {
          flashBadge("✓", "#10b981");
        } else {
          flashBadge("✕", "#ef4444");
        }
      } catch {
        flashBadge("✕", "#ef4444");
      }
    } else if (info.menuItemId === "bowerbird-batch-collect" && tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "OPEN_BATCH_COLLECTOR" });
      } catch {
        // Content script might not be injected yet
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content-scripts/content.js"],
        });
        await chrome.tabs.sendMessage(tab.id, { type: "OPEN_BATCH_COLLECTOR" });
      }
    }
  });

  // Handle messages from content script or popup
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!message || typeof message !== "object" || !("type" in message)) return;
    const msgType = message.type;

    if (msgType === "CAPTURE_VISIBLE_TAB") {
      const capturePromise = sender.tab?.windowId !== undefined
        ? chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" })
        : chrome.tabs.captureVisibleTab({ format: "png" });

      capturePromise
        .then((dataUrl) => sendResponse({ success: true, dataUrl }))
        .catch((err: unknown) => {
          const errText = err instanceof Error ? err.message : String(err);
          sendResponse({ success: false, error: errText });
        });
      return true; // async sendResponse
    }

    if (msgType === "CHECK_CONNECTION") {
      checkConnection().then((res) => sendResponse(res));
      return true;
    }

    if (msgType === "FLASH_BADGE") {
      const text = "text" in message && typeof message.text === "string" ? message.text : "✓";
      const color = "color" in message && typeof message.color === "string" ? message.color : "#10b981";
      flashBadge(text, color);
      sendResponse({ success: true });
      return true;
    }
  });
});

function flashBadge(text: string, color: string) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "" });
  }, 2500);
}
