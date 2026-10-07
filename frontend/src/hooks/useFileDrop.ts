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
    const unsubStarted = Events.On("import-started", (event: { data: { total: number } }) => {
      clearTimer();
      const total = event?.data?.total || 1;
      setState({
        status: "importing",
        total,
        current: 0,
        filename: "正在准备导入...",
        message: `正在分析 ${total} 个文件...`,
      });
    });

    const unsubProgress = Events.On(
      "import-progress",
      (event: { data: { current: number; total: number; filename: string } }) => {
        const { current, total, filename } = event.data;
        setState((prev) => ({
          ...prev,
          status: "importing",
          total,
          current,
          filename,
          message: `正在复制并生成索引 (${current}/${total}): ${filename}`,
        }));
      }
    );

    const unsubCompleted = Events.On("import-completed", (event: { data: { count: number; ids?: string[] } }) => {
      const count = event?.data?.count || 0;
      const ids = event?.data?.ids;
      setState({
        status: "success",
        total: count,
        current: count,
        filename: "",
        message: `成功导入 ${count} 项资产 (已完成 SHA-256 去重与物理隔离)`,
      });
      onRefresh(ids);
      clearTimer();
      resetTimer.current = window.setTimeout(() => {
        setState((prev) => (prev.status === "success" ? { ...prev, status: "idle", message: null } : prev));
      }, 3000);
    });

    const unsubError = Events.On("import-error", (event: { data: string }) => {
      setState({
        status: "error",
        total: 0,
        current: 0,
        filename: "",
        message: `导入失败: ${event?.data || "未知错误"}`,
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
    if (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes("text/uri-list")) {
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
