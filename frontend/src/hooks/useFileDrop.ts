import { useState, useEffect, useRef, useCallback } from "react";
import { Events } from "@wailsio/runtime";
import { ImportFromBase64, ImportFromURL } from "../../bindings/bowerbird/core/service";

export type DropStatus = "idle" | "dragging-over" | "importing" | "success" | "error";

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
        filename: "Preparing import...",
        message: `Analyzing ${total} files...`,
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
        message: `Importing (${current}/${total}): ${filename}`,
      }));
    });

    const unsubCompleted = Events.On("import-completed", (event: any) => {
      const data = event?.data ?? event ?? {};
      const count = typeof data === "object" && data && "count" in data ? Number(data.count) : 0;
      const ids = typeof data === "object" && data && "ids" in data && Array.isArray(data.ids) ? data.ids : undefined;
      setState({
        status: "success",
        total: count,
        current: count,
        filename: "",
        message: `Imported ${count} assets successfully`,
      });
      onRefresh(ids);
      clearTimer();
      resetTimer.current = window.setTimeout(() => {
        setState((prev) => (prev.status === "success" ? { ...prev, status: "idle", message: null } : prev));
      }, 3000);
    });

    const unsubError = Events.On("import-error", (event: any) => {
      const msg = typeof event?.data === "string" ? event.data : typeof event === "string" ? event : "Unknown error";
      setState({
        status: "error",
        total: 0,
        current: 0,
        filename: "",
        message: `Import failed: ${msg}`,
      });
      clearTimer();
      resetTimer.current = window.setTimeout(() => {
        setState((prev) => (prev.status === "error" ? { ...prev, status: "idle", message: null } : prev));
      }, 4000);
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
  }, [onRefresh]);
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
        console.error("导入文件失败:", file.name, err);
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
        message: `正在导入 ${files.length} 个文件...`,
      });

      const importedIds: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setState({
          status: "importing",
          total: files.length,
          current: i + 1,
          filename: file.name,
          message: `正在处理 (${i + 1}/${files.length}): ${file.name}`,
        });
        const itemId = await importFileObject(file);
        if (itemId) importedIds.push(itemId);
      }

      setState({
        status: "success",
        total: importedIds.length,
        current: importedIds.length,
        filename: "",
        message: `成功导入 ${importedIds.length} 个文件`,
      });
      await onRefresh(importedIds);
      clearTimer();
      resetTimer.current = window.setTimeout(() => {
        setState((prev) => (prev.status === "success" ? { ...prev, status: "idle", message: null } : prev));
      }, 3000);
      return importedIds;
    },
    [importFileObject, onRefresh]
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
        message: "正在通过后端原生下载网络资源 (无 CORS 限制)...",
      });

      try {
        const item = await ImportFromURL(url);
        if (item) {
          setState({
            status: "success",
            total: 1,
            current: 1,
            filename: item.filename,
            message: `成功导入网络资源: ${item.name}`,
          });
          await onRefresh([item.id]);
        }
      } catch (err) {
        console.error("抓取网络资源失败:", err);
        setState({
          status: "error",
          total: 0,
          current: 0,
          filename: "",
          message: `网络资源抓取失败: ${String(err)}`,
        });
      } finally {
        clearTimer();
        resetTimer.current = window.setTimeout(() => {
          setState((prev) => ({ ...prev, status: "idle", message: null }));
        }, 3000);
      }
    },
    [onRefresh]
  );

  const isInternalDrag = (e: React.DragEvent): boolean => {
    if (!e.dataTransfer) return false;
    const types = Array.from(e.dataTransfer.types || []);
    return (
      types.includes("application/x-bowerbird-internal-drag") ||
      types.includes("application/x-bowerbird-item-id")
    );
  };

  // Global HTML5 Drag event handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (isInternalDrag(e)) return;
    dragCounter.current += 1;
    const types = Array.from(e.dataTransfer?.types || []);
    const hasFiles = types.some((t) => t.toLowerCase() === "files" || t === "text/uri-list" || t === "public.file-url" || t === "nsfilenamespboardtype") || (e.dataTransfer?.files && e.dataTransfer.files.length > 0);
    if (hasFiles) {
      setState((prev) => (prev.status === "importing" ? prev : { ...prev, status: "dragging-over" }));
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (isInternalDrag(e)) {
      e.dataTransfer.dropEffect = "none";
      return;
    }
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (isInternalDrag(e)) return;
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setState((prev) => (prev.status === "dragging-over" ? { ...prev, status: "idle" } : prev));
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      if (isInternalDrag(e)) {
        // Intra-app drag dropped on main window: ignore completely!
        return;
      }
      dragCounter.current = 0;
      setState((prev) => (prev.status === "dragging-over" ? { ...prev, status: "idle" } : prev));

      // 1. Files dropped via browser DataTransfer
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
        const uriList =
          e.dataTransfer.getData("text/uri-list") ||
          e.dataTransfer.getData("URL") ||
          e.dataTransfer.getData("text/plain");
        if (uriList && (uriList.startsWith("http://") || uriList.startsWith("https://") || uriList.startsWith("data:"))) {
          urlToImport = uriList.split("\r\n")[0].trim();
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
