import { useState, useEffect, useRef, useCallback } from "react";
import { Events, isDesktopHost } from "@/lib/host-runtime";
import { ImportFiles, ImportFromBase64, ImportFromURL } from "../../bindings/bowerbird/core/service";
import type { Item } from "../../bindings/bowerbird/core/models";
import { isInternalDragActive } from "../lib/drag-state";
import { notifySuccess, notifyError } from "@/lib/notify";
import { SuccessCodes, ErrorCodes } from "@/lib/error-codes";
import { logDiagnostic } from "@/lib/logger";
import { useTranslation } from "react-i18next";
export type DropStatus = "idle" | "dragging-over" | "importing" | "success" | "error";

function hostReceivesFileDrops(): boolean {
  return isDesktopHost();
}

/**
 * Extracts the first non-comment URI from a `text/uri-list`, `URL`, or `text/plain`
 * DataTransfer payload.
 */
function extractDroppedUri(dt: DataTransfer): string {
  const raw = dt.getData("text/uri-list") || dt.getData("URL") || dt.getData("text/plain") || "";
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      return trimmed;
    }
  }
  return "";
}

/**
 * Determines whether a drop is a genuine OS file drop (from Finder / Explorer)
 * that the native Wails `WindowFilesDropped` handler will import by disk path.
 *
 * Browser drags (e.g. dragging an `<img>` or blob out of Chrome/Safari) also
 * populate `dataTransfer.files` with an in-memory `File`, alongside a remote
 * `http(s):` / `blob:` / `data:` URI in `text/uri-list` or `text/html`. The native
 * host never receives `NSFilenamesPboardType` (macOS) or a disk path (Windows
 * `ICoreWebView2File::GetPath`) for those in-memory browser files, so skipping
 * them in the webview drops the import on the floor.
 */
function isNativeOsFileDrop(dt: DataTransfer): boolean {
  if (!hostReceivesFileDrops()) return false;
  const files = dt.files;
  if (!files || files.length === 0) return false;

  const uri = extractDroppedUri(dt).toLowerCase();
  if (
    uri.startsWith("http://") ||
    uri.startsWith("https://") ||
    uri.startsWith("blob:") ||
    uri.startsWith("data:")
  ) {
    return false;
  }

  const htmlData = dt.getData("text/html");
  if (htmlData && /<img[^>]+src=["'](?:https?:|blob:|data:)/i.test(htmlData)) {
    return false;
  }

  return true;
}

export interface DropState {
  status: DropStatus;
  total: number;
  current: number;
  filename: string;
  message: string | null;
}

interface UseFileDropOptions {
  onRefresh: (newlyImportedIds?: string[], newlyImportedItems?: Item[]) => void | Promise<void>;
  onItemsUpserted?: (upsertedItems: Item[]) => void;
  onItemsTrashed?: (trashedIds: string[]) => void;
}

export function useFileDrop({ onRefresh, onItemsUpserted, onItemsTrashed }: UseFileDropOptions) {
  const { t } = useTranslation();
  const [state, setState] = useState<DropState>({
    status: "idle",
    total: 0,
    current: 0,
    filename: "",
    message: null,
  });

  const resetTimer = useRef<number | null>(null);
  const refreshThrottleTimer = useRef<number | null>(null);
  const lastRefreshTs = useRef<number>(0);
  const dragCounter = useRef(0);

  const clearTimer = () => {
    if (resetTimer.current !== null) {
      window.clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  };

  const clearRefreshThrottle = () => {
    if (refreshThrottleTimer.current !== null) {
      window.clearTimeout(refreshThrottleTimer.current);
      refreshThrottleTimer.current = null;
    }
  };

  function extractEventPayload(event: unknown): Record<string, unknown> {
    if (event && typeof event === "object") {
      if ("data" in event && event.data && typeof event.data === "object") {
        return event.data as Record<string, unknown>;
      }
      return event as Record<string, unknown>;
    }
    return {};
  }

  // Listen to Wails native events emitted by Go backend
  useEffect(() => {
    const unsubStarted = Events.On("import-started", (event: unknown) => {
      clearTimer();
      const data = extractEventPayload(event);
      const total = "total" in data ? Number(data.total) : 1;
      setState({
        status: "importing",
        total,
        current: 0,
        filename: t("importing.preparing"),
        message: t("importing.analyzing", { count: total }),
      });
    });

    const unsubProgress = Events.On("import-progress", (event: unknown) => {
      const data = extractEventPayload(event);
      const current = "current" in data ? Number(data.current) : 0;
      const total = "total" in data ? Number(data.total) : 1;
      const filename = "filename" in data ? String(data.filename) : "";
      setState((prev) => ({
        ...prev,
        status: "importing",
        total,
        current,
        filename,
        message: t("importing.progress", { current, total, filename }),
      }));
    });

    const unsubCompleted = Events.On("import-completed", (event: unknown) => {
      const recvTs = performance.now();
      const data = extractEventPayload(event);
      const count = "count" in data ? Number(data.count) : 0;
      const ids =
        "ids" in data && Array.isArray(data.ids)
          ? data.ids.filter((id): id is string => typeof id === "string")
          : undefined;
      const importedItems =
        "items" in data && Array.isArray(data.items)
          ? (data.items as Item[])
          : undefined;
      logDiagnostic(
        "perf",
        "ui",
        "[Pipeline 6a/6] Frontend received import-completed event",
        `count=${count} hasInlineItems=${Boolean(importedItems?.length)}`,
        Math.round(performance.now() - recvTs)
      );
      setState({
        status: "idle",
        total: 0,
        current: 0,
        filename: "",
        message: null,
      });
      if (count > 0) {
        notifySuccess(SuccessCodes.ITEMS_IMPORTED, { count });
      }
      void Promise.resolve(onRefresh(ids, importedItems)).then(() => {
        let done = false;
        const markPainted = (via: string) => {
          if (done) return;
          done = true;
          const rafTs = performance.now();
          logDiagnostic(
            "perf",
            "ui",
            "[Pipeline 6c/6] Frontend DOM committed & painted imported item",
            `count=${count} firstId=${ids?.[0]?.slice(0, 12) ?? "-"} via=${via}`,
            Math.round(rafTs - recvTs)
          );
        };

        requestAnimationFrame(() => markPainted("raf"));
        // Fallback: If window is backgrounded/unfocused and WebKit freezes rAF, don't report false freeze
        window.setTimeout(() => markPainted("fallback-timer"), 40);
      });
      clearTimer();
    });

    const unsubError = Events.On("import-error", (event: unknown) => {
      let msg = t("importing.unknownError");
      if (typeof event === "string") {
        msg = event;
      } else if (event && typeof event === "object" && "data" in event && typeof event.data === "string") {
        msg = event.data;
      }
      setState({
        status: "idle",
        total: 0,
        current: 0,
        filename: "",
        message: null,
      });
      notifyError(msg);
      clearTimer();
    });

    const unsubUpserted = Events.On("library-items-upserted", (event: unknown) => {
      if (!onItemsUpserted) return;
      const t0 = performance.now();
      let list: Item[] = [];
      if (Array.isArray(event)) {
        list = event as Item[];
      } else if (event && typeof event === "object" && "data" in event && Array.isArray(event.data)) {
        list = event.data as Item[];
      }
      if (list.length > 0) {
        onItemsUpserted(list);
        requestAnimationFrame(() => {
          logDiagnostic(
            "perf",
            "ui",
            "[Pipeline 6b/6] Frontend processed library-items-upserted",
            `upsertedCount=${list.length} firstName=${list[0]?.name ?? "-"}`,
            Math.round(performance.now() - t0)
          );
        });
      }
    });

    const unsubTrashed = Events.On("library-items-trashed", (event: unknown) => {
      if (!onItemsTrashed) return;
      let ids: string[] = [];
      if (Array.isArray(event)) {
        ids = event.filter((x): x is string => typeof x === "string");
      } else if (event && typeof event === "object" && "data" in event && Array.isArray(event.data)) {
        ids = event.data.filter((x): x is string => typeof x === "string");
      }
      if (ids.length > 0) {
        onItemsTrashed(ids);
      }
    });

    const unsubUpdated = Events.On("library-items-updated", () => {
      const now = Date.now();
      const elapsed = now - lastRefreshTs.current;
      if (elapsed >= 350) {
        lastRefreshTs.current = now;
        void onRefresh();
      } else if (refreshThrottleTimer.current === null) {
        refreshThrottleTimer.current = window.setTimeout(() => {
          refreshThrottleTimer.current = null;
          lastRefreshTs.current = Date.now();
          void onRefresh();
        }, 350 - elapsed);
      }
    });

    return () => {
      unsubStarted();
      unsubProgress();
      unsubCompleted();
      unsubError();
      unsubUpserted();
      unsubTrashed();
      unsubUpdated();
      clearTimer();
      clearRefreshThrottle();
    };
  }, [onRefresh, onItemsUpserted, onItemsTrashed, t]);
  // Window-level listener: whenever external files are dragged over the window,
  // dynamically set document.body[data-dragging-files="true"] to disable all window dragging (-webkit-app-region: drag)
  useEffect(() => {
    let windowDragCounter = 0;

    const onWindowDragEnter = (e: DragEvent) => {
      const types = Array.from(e.dataTransfer?.types || []);
      const isFileDrag =
        types.some(
          (t) =>
            t.toLowerCase() === "files" ||
            t === "text/uri-list" ||
            t === "public.file-url" ||
            t === "nsfilenamespboardtype"
        ) || ((e.dataTransfer?.files?.length || 0) > 0);

      if (isFileDrag) {
        windowDragCounter++;
        document.body.setAttribute("data-dragging-files", "true");
      }
    };

    const onWindowDragLeave = () => {
      windowDragCounter--;
      if (windowDragCounter <= 0) {
        windowDragCounter = 0;
        document.body.removeAttribute("data-dragging-files");
      }
    };

    const onWindowDrop = () => {
      windowDragCounter = 0;
      document.body.removeAttribute("data-dragging-files");
    };

    const onWindowDragEnd = () => {
      windowDragCounter = 0;
      document.body.removeAttribute("data-dragging-files");
    };

    window.addEventListener("dragenter", onWindowDragEnter);
    window.addEventListener("dragleave", onWindowDragLeave);
    window.addEventListener("drop", onWindowDrop);
    window.addEventListener("dragend", onWindowDragEnd);

    return () => {
      window.removeEventListener("dragenter", onWindowDragEnter);
      window.removeEventListener("dragleave", onWindowDragLeave);
      window.removeEventListener("drop", onWindowDrop);
      window.removeEventListener("dragend", onWindowDragEnd);
      document.body.removeAttribute("data-dragging-files");
    };
  }, []);

  // Import single File object via FileReader and return its new Item
  const importFileObject = useCallback(async (file: globalThis.File): Promise<Item | null> => {
    const { promise, resolve } = Promise.withResolvers<Item | null>();
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const item = await ImportFromBase64(file.name, reader.result as string);
        resolve(item || null);
      } catch (err) {
        console.error("Failed to import file:", file.name, err);
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
    return promise;
  }, []);
  // Batch import File objects (uses native Go multi-goroutine path import if disk paths are available)
  const importFileList = useCallback(
    async (fileList: FileList | globalThis.File[]): Promise<string[]> => {
      const files = Array.from(fileList);
      if (files.length === 0) return [];

      clearTimer();

      // Fast path: if File objects expose local filesystem paths, delegate directly to Go worker pool
      const nativePaths: string[] = [];
      for (const f of files) {
        const p = "path" in f && typeof f.path === "string" ? f.path.trim() : "";
        if (p) nativePaths.push(p);
      }

      if (nativePaths.length === files.length) {
        setState({
          status: "importing",
          total: nativePaths.length,
          current: 0,
          filename: files[0].name,
          message: t("importing.importingFiles", { count: nativePaths.length }),
        });
        try {
          const imported = await ImportFiles(nativePaths);
          const ids = (imported || []).map((it) => it.id);
          setState({
            status: "idle",
            total: 0,
            current: 0,
            filename: "",
            message: null,
          });
          if (ids.length > 0) {
            notifySuccess(SuccessCodes.ITEMS_IMPORTED, { count: ids.length });
            await onRefresh(ids, imported || []);
          }
        } catch (err) {
          setState({
            status: "idle",
            total: 0,
            current: 0,
            filename: "",
            message: null,
          });
          notifyError(err);
          return [];
        }
      }

      setState({
        status: "importing",
        total: files.length,
        current: 0,
        filename: files[0].name,
        message: t("importing.importingFiles", { count: files.length }),
      });

      const importedIds: string[] = [];
      const importedItems: Item[] = [];
      let completedCount = 0;
      let cursor = 0;
      const concurrency = Math.min(4, files.length);

      const runWorker = async () => {
        while (cursor < files.length) {
          const idx = cursor++;
          const file = files[idx];
          const item = await importFileObject(file);
          completedCount++;
          if (item) {
            importedIds.push(item.id);
            importedItems.push(item);
          }
          setState({
            status: "importing",
            total: files.length,
            current: completedCount,
            filename: file.name,
            message: t("importing.processing", {
              current: completedCount,
              total: files.length,
              filename: file.name,
            }),
          });
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => runWorker()));

      if (importedIds.length > 0) {
        setState({
          status: "success",
          total: importedIds.length,
          current: importedIds.length,
          filename: "",
          message: t("importing.importedFiles", { count: importedIds.length }),
        });
        notifySuccess(SuccessCodes.ITEMS_IMPORTED, { count: importedIds.length });
        await onRefresh(importedIds, importedItems);
      } else {
        setState({
          status: "idle",
          total: 0,
          current: 0,
          filename: "",
          message: null,
        });
        notifyError(ErrorCodes.IMPORT_FAILED);
      }
      clearTimer();
      resetTimer.current = window.setTimeout(() => {
        setState((prev) => (prev.status === "success" ? { ...prev, status: "idle", message: null } : prev));
      }, 3000);
      return importedIds;
    },
    [importFileObject, onRefresh, t]
  );

  // Import from network URL via Go backend
  const importFromURL = useCallback(
    async (url: string) => {
      clearTimer();
      setState({
        status: "importing",
        total: 1,
        current: 1,
        filename: url,
        message: t("importing.downloadingRemote"),
      });

      try {
        const item = await ImportFromURL(url);
        if (item) {
          setState({
            status: "success",
            total: 1,
            current: 1,
            filename: item.filename,
            message: t("importing.remoteImported", { name: item.name }),
          });
          notifySuccess(SuccessCodes.ITEMS_IMPORTED, { count: 1 });
          await onRefresh([item.id], [item]);
        }
      } catch (err) {
        console.error("Failed to fetch remote asset:", err);
        setState({
          status: "error",
          total: 0,
          current: 0,
          filename: "",
          message: t("importing.remoteFailed", { error: String(err) }),
        });
      } finally {
        clearTimer();
        resetTimer.current = window.setTimeout(() => {
          setState((prev) => ({ ...prev, status: "idle", message: null }));
        }, 3000);
      }
    },
    [onRefresh, t]
  );


  // Global HTML5 Drag event handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (isInternalDragActive(e)) return;
    dragCounter.current += 1;
    const types = Array.from(e.dataTransfer?.types || []);
    const hasFiles = types.some((t) => t.toLowerCase() === "files" || t === "text/uri-list" || t === "public.file-url" || t === "nsfilenamespboardtype") || (e.dataTransfer?.files && e.dataTransfer.files.length > 0);
    if (hasFiles) {
      setState((prev) => (prev.status === "importing" ? prev : { ...prev, status: "dragging-over" }));
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (isInternalDragActive(e)) {
      e.dataTransfer.dropEffect = "none";
      return;
    }
    e.dataTransfer.dropEffect = "copy";
    setState((prev) => (prev.status === "idle" ? { ...prev, status: "dragging-over" } : prev));
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (isInternalDragActive(e)) return;
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setState((prev) => (prev.status === "dragging-over" ? { ...prev, status: "idle" } : prev));
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      if (isInternalDragActive(e)) {
        // Intra-app drag dropped on main window: ignore completely!
        return;
      }
      dragCounter.current = 0;
      setState((prev) => (prev.status === "dragging-over" ? { ...prev, status: "idle" } : prev));

      // An OS file drop (a real drag out of Explorer / Finder) is delivered to the
      // app twice: as this DOM drop and to the native drop handler in main.go,
      // which imports by path. Importing here as well would push every dropped
      // file through the base64 bridge as a second, racing import of the same
      // content. Browser drags (which carry an in-memory File plus a remote/blob
      // URI) are NOT delivered to the native handler and must be imported here.
      if (isNativeOsFileDrop(e.dataTransfer)) return;

      // 1. Files dropped via browser DataTransfer (already in memory inside the webview)
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await importFileList(e.dataTransfer.files);
        return;
      }
      // 2. Extract network resource or image URL (from text/html, text/uri-list, or text/plain)
      let urlToImport = "";
      const htmlData = e.dataTransfer.getData("text/html");
      if (htmlData) {
        const match = htmlData.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (match && match[1]) {
          urlToImport = match[1];
        }
      }

      if (!urlToImport) {
        const uri = extractDroppedUri(e.dataTransfer);
        if (uri && (uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("data:"))) {
          urlToImport = uri;
        }
      }

      if (urlToImport) {
        await importFromURL(urlToImport);
      }
    },
    [importFileList, importFromURL]
  );

  return {
    state,
    importFileList,
    importFromURL,
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}
