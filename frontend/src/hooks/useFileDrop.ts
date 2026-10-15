import { useState, useEffect, useRef, useCallback } from "react";
import { Events } from "@wailsio/runtime";
import { ImportFromBase64, ImportFromURL } from "../../bindings/bowerbird/core/service";
import { isInternalDragActive } from "../lib/drag-state";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export type DropStatus = "idle" | "dragging-over" | "importing" | "success" | "error";

interface WailsFlagWindow extends Window {
  _wails?: { flags?: { enableFileDrop?: boolean } };
}

function hostReceivesFileDrops(): boolean {
  const host = window as WailsFlagWindow;
  return host._wails?.flags?.enableFileDrop === true;
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
  onRefresh: (newlyImportedIds?: string[]) => void | Promise<void>;
}

export function useFileDrop({ onRefresh }: UseFileDropOptions) {
  const { t } = useTranslation();
  const [state, setState] = useState<DropState>({
    status: "idle",
    total: 0,
    current: 0,
    filename: "",
    message: null,
  });

  const resetTimer = useRef<number | null>(null);
  const dragCounter = useRef(0);

  const clearTimer = () => {
    if (resetTimer.current !== null) {
      window.clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  };

  // Listen to Wails native events emitted by Go backend
  useEffect(() => {
    const unsubStarted = Events.On("import-started", (event: any) => {
      clearTimer();
      const data = event?.data ?? event ?? {};
      const total = typeof data === "object" && data && "total" in data ? Number(data.total) : 1;
      setState({
        status: "importing",
        total,
        current: 0,
        filename: t("importing.preparing"),
        message: t("importing.analyzing", { count: total }),
      });
    });

    const unsubProgress = Events.On("import-progress", (event: any) => {
      const data = event?.data ?? event ?? {};
      const current = typeof data === "object" && data && "current" in data ? Number(data.current) : 0;
      const total = typeof data === "object" && data && "total" in data ? Number(data.total) : 1;
      const filename = typeof data === "object" && data && "filename" in data ? String(data.filename) : "";
      setState((prev) => ({
        ...prev,
        status: "importing",
        total,
        current,
        filename,
        message: t("importing.progress", { current, total, filename }),
      }));
    });

    const unsubCompleted = Events.On("import-completed", (event: any) => {
      const data = event?.data ?? event ?? {};
      const count = typeof data === "object" && data && "count" in data ? Number(data.count) : 0;
      const ids = typeof data === "object" && data && "ids" in data && Array.isArray(data.ids) ? data.ids : undefined;
      setState({
        status: "idle",
        total: 0,
        current: 0,
        filename: "",
        message: null,
      });
      if (count > 0) {
        toast.success(t("importing.importedAssets", { count }));
      }
      onRefresh(ids);
      clearTimer();
    });

    const unsubError = Events.On("import-error", (event: any) => {
      const msg = typeof event?.data === "string" ? event.data : typeof event === "string" ? event : t("importing.unknownError");
      setState({
        status: "idle",
        total: 0,
        current: 0,
        filename: "",
        message: null,
      });
      toast.error(t("importing.failed", { error: msg }));
      clearTimer();
    });

    const unsubUpdated = Events.On("library-items-updated", () => {
      onRefresh();
    });

    return () => {
      unsubStarted();
      unsubProgress();
      unsubCompleted();
      unsubError();
      unsubUpdated();
      clearTimer();
    };
  }, [onRefresh, t]);
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

  // Import single File object via FileReader and return its new item ID
  const importFileObject = useCallback(async (file: globalThis.File): Promise<string | null> => {
    const { promise, resolve } = Promise.withResolvers<string | null>();
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const item = await ImportFromBase64(file.name, reader.result as string);
        resolve(item?.id || null);
      } catch (err) {
        console.error("Failed to import file:", file.name, err);
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
    return promise;
  }, []);

  // Batch import File objects
  const importFileList = useCallback(
    async (fileList: FileList | globalThis.File[]): Promise<string[]> => {
      const files = Array.from(fileList);
      if (files.length === 0) return [];

      clearTimer();
      setState({
        status: "importing",
        total: files.length,
        current: 0,
        filename: files[0].name,
        message: t("importing.importingFiles", { count: files.length }),
      });

      const importedIds: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setState({
          status: "importing",
          total: files.length,
          current: i + 1,
          filename: file.name,
          message: t("importing.processing", { current: i + 1, total: files.length, filename: file.name }),
        });
        const itemId = await importFileObject(file);
        if (itemId) importedIds.push(itemId);
      }
      if (importedIds.length > 0) {
        setState({
          status: "success",
          total: importedIds.length,
          current: importedIds.length,
          filename: "",
          message: t("importing.importedFiles", { count: importedIds.length }),
        });
        toast.success(t("importing.importedAssets", { count: importedIds.length }));
        await onRefresh(importedIds);
      } else {
        setState({
          status: "idle",
          total: 0,
          current: 0,
          filename: "",
          message: null,
        });
        toast.error(t("importing.failed", { error: t("importing.unknownError") }));
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
          toast.success(t("importing.importedAssets", { count: 1 }));
          await onRefresh([item.id]);
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
