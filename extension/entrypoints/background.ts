import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";
import i18n from "@/lib/i18n";
import {
  checkAppRunning,
  checkConnection,
  fetchFolders,
  createFolder,
  fetchTags,
  importFromURL,
  importFromBase64,
  importBookmark,
  importBatch,
} from "@/lib/api";

export default defineBackground(() => {
  // Initialize context menus
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: "bowerbird-save-image",
      title: i18n.t("contextMenu.saveImage"),
      contexts: ["image"],
    });

    browser.contextMenus.create({
      id: "bowerbird-save-link",
      title: i18n.t("contextMenu.saveLink"),
      contexts: ["link"],
    });

    browser.contextMenus.create({
      id: "bowerbird-save-screenshot",
      title: i18n.t("contextMenu.captureScreenshot"),
      contexts: ["page"],
    });

    browser.contextMenus.create({
      id: "bowerbird-batch-collect",
      title: i18n.t("contextMenu.batchCollect"),
      contexts: ["page"],
    });
  });

  // Handle context menu clicks
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
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
        const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, {
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
        await browser.tabs.sendMessage(tab.id, { type: "OPEN_BATCH_COLLECTOR" });
      } catch {
        // Content script might not be injected yet
        if (browser.scripting?.executeScript) {
          await browser.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["/content-scripts/content.js"],
          });
        }
        await browser.tabs.sendMessage(tab.id, { type: "OPEN_BATCH_COLLECTOR" });
      }
    }
  });

  // Handle messages from content script
  browser.runtime.onMessage.addListener((message: unknown, sender: unknown, sendResponse: (res: any) => void) => {
    if (!message || typeof message !== "object" || !("type" in message)) return;
    const msg = message as { type: string; [key: string]: any };

    const handle = async () => {
      switch (msg.type) {
        case "CHECK_APP_RUNNING":
          return await checkAppRunning(msg.targetUrl);
        case "CHECK_CONNECTION":
          return await checkConnection(msg.targetUrl);
        case "FETCH_FOLDERS":
          return await fetchFolders(msg.targetUrl);
        case "CREATE_FOLDER":
          return await createFolder(msg.name, msg.parentId, msg.targetUrl);
        case "FETCH_TAGS":
          return await fetchTags(msg.targetUrl);
        case "IMPORT_FROM_URL":
          return await importFromURL(msg.payload, msg.targetUrl);
        case "IMPORT_FROM_BASE64":
          return await importFromBase64(msg.payload, msg.targetUrl);
        case "IMPORT_BOOKMARK":
          return await importBookmark(msg.payload, msg.targetUrl);
        case "IMPORT_BATCH":
          return await importBatch(msg.payload, msg.targetUrl);
        case "CAPTURE_VISIBLE_TAB": {
          try {
            const winId = (sender as any)?.tab?.windowId;
            const dataUrl = winId !== undefined
              ? await browser.tabs.captureVisibleTab(winId, { format: "png" })
              : await browser.tabs.captureVisibleTab({ format: "png" });
            return { success: true, dataUrl };
          } catch (err: unknown) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
          }
        }
        case "FLASH_BADGE": {
          flashBadge(msg.text || "✓", msg.color || "#10b981");
          return { success: true };
        }
        default:
          return undefined;
      }
    };

    const promise = handle();
    promise.then((res) => {
      if (res !== undefined) {
        try {
          sendResponse(res);
        } catch {}
      }
    });
    return promise;
  });
});

function flashBadge(text: string, color: string) {
  const actionApi = browser.action ?? (browser as any).browserAction;
  if (!actionApi) return;
  try {
    actionApi.setBadgeText({ text });
    actionApi.setBadgeBackgroundColor({ color });
    setTimeout(() => {
      try {
        actionApi.setBadgeText({ text: "" });
      } catch {}
    }, 2500);
  } catch {}
}
