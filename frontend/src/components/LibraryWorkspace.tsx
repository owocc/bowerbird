import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  ArrowUpDown,
  Upload,
  X,
  Trash2,
  Minus,
  Plus,
  RotateCcw,
  Settings,
  Tag as TagIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { SidebarProvider } from "@/components/ui/sidebar";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { MainHeaderSafePrefix } from "@/components/MainHeaderSafePrefix";
import { SidebarDirectoryTree } from "@/components/SidebarDirectoryTree";
import { TagsSidebar } from "@/components/TagsSidebar";
import { JustifiedGallery } from "@/components/JustifiedGallery";
import { ItemDetailPanel } from "@/components/ItemDetailPanel";
import { MultiItemInspector } from "@/components/MultiItemInspector";
import { UnifiedPreviewModal } from "@/components/UnifiedPreviewModal";
import {
  CustomContextMenu,
  type ContextMenuPosition,
} from "@/components/CustomContextMenu";
import { DropzoneOverlay } from "@/components/DropzoneOverlay";
import {
  FilterBar,
  itemMatchesColorFilter,
  UNCATEGORIZED_FOLDER_FILTER,
  UNTAGGED_TAG_FILTER,
} from "@/components/FilterBar";
import { toast } from "sonner";
import {
  GetItems,
  GetTrashItems,
  GetTrashCount,
  BatchMoveToTrash,
  BatchRestoreFromTrash,
  PermanentDeleteItem,
  EmptyTrash,
  CloseLibrary,
  GetFolders,
  CreateFolder,
  RenameFolder,
  DeleteFolder,
  AddItemToFolder,
  RemoveItemFromFolder,
  MoveItemToFolder,
  ImportFoldersRecursively,
  ImportFromBase64,
  GetTags,
  CreateTag,
  DeleteTag,
  AddTagToItem,
  RemoveTagFromItem,
  ToggleFavorite,
  RenameItem,
  OpenWithDefaultApp,
  OpenSettingsWindow,
  OpenSetupWindow,
  RevealInFinder,
} from "../../bindings/bowerbird/core/service";
import type {
  Item,
  Folder,
  Tag,
  LibraryInfo,
} from "../../bindings/bowerbird/core/models";
import { HistoryNavButtons } from "@/components/HistoryNavButtons";
import { getFileCategory } from "@/lib/formatters";
import { FAVORITE_TAG } from "@/lib/favoriteTag";
import { setInternalDragActive } from "@/lib/drag-state";
import {
  useWorkspaceSearch,
  TRASH_FOLDER_ID,
  type PreviewMode,
} from "@/lib/workspace-search";
import { useHistoryNavigation } from "@/hooks/useHistoryNavigation";
import { useFileDrop } from "@/hooks/useFileDrop";
import { useTrackpadZoom } from "@/hooks/useTrackpadZoom";

export interface LibraryWorkspaceProps {
  library: LibraryInfo;
  onLibraryClosed: () => void;
  onLibraryChanged?: (newLib: LibraryInfo) => void;
}

export function LibraryWorkspace({
  library,
  onLibraryClosed,
  onLibraryChanged,
}: LibraryWorkspaceProps) {
  const { t } = useTranslation();

  const ws = useWorkspaceSearch();
  const { canGoBack, goBack } = useHistoryNavigation();
  const activeFolderId = ws.activeFolderId;
  const activeTag = ws.activeTag;
  const tagsSidebarOpen = ws.tags;
  const categoryFilter = ws.type;
  const sortOrder = ws.sort;
  const colorFilter = ws.color ?? null;
  const folderFilter = ws.filterFolder ?? null;
  const tagFilter = ws.filterTag ?? null;
  const orientationFilter = ws.orientation;
  const inlinePreviewOpen = ws.preview === "inline";
  const fullWindowPreviewOpen = ws.preview === "full";

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [trashCount, setTrashCount] = useState<number>(0);

  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [rowHeight, setRowHeight] = useState<number>(80);

  // Ordered selection queue: earliest selected at index 0, most recently selected at the end.
  const [selectedOrder, setSelectedOrder] = useState<string[]>([]);
  const selectedItemIds = useMemo(() => new Set(selectedOrder), [selectedOrder]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const galleryViewportRef = useRef<HTMLDivElement>(null);

  // Enable trackpad 2-finger pinch zoom on the main gallery viewport
  useTrackpadZoom({
    containerRef: galleryViewportRef,
    min: 60,
    max: 240,
    enabled: !inlinePreviewOpen && !fullWindowPreviewOpen,
    onChange: setRowHeight,
  });

  const previewPushedRef = useRef(false);

  const navigateToFolder = (id: string | null) => {
    if (id === null) ws.selectAll();
    else if (id === TRASH_FOLDER_ID) ws.selectTrash();
    else ws.selectFolder(id);
  };

  const openPreview = (mode: PreviewMode, itemId?: string | null) => {
    const target = itemId ?? activeItem?.id;
    if (!target) return;
    previewPushedRef.current = !ws.preview;
    ws.openPreview(mode, target);
  };

  const closePreview = () => {
    if (previewPushedRef.current && canGoBack) {
      previewPushedRef.current = false;
      goBack();
      return;
    }
    previewPushedRef.current = false;
    ws.closePreview();
  };

  // Dialogs
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{
    isOpen: boolean;
    item: Item | null;
    items: Item[];
    type: "multi-folder" | "permanent";
  } | null>(null);

  const [renameDialog, setRenameDialog] = useState<{
    isOpen: boolean;
    item: Item | null;
    newName: string;
  } | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    position: ContextMenuPosition;
    isItemContext: boolean;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const disableContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener("contextmenu", disableContextMenu);
    return () => window.removeEventListener("contextmenu", disableContextMenu);
  }, []);

  const refreshItems = useCallback(async () => {
    try {
      if (activeFolderId === "__trash__") {
        const data = await GetTrashItems(searchQuery, sortOrder);
        setItems(data || []);
      } else {
        const data = await GetItems(searchQuery, sortOrder);
        setItems(data || []);
      }
    } catch (err) {
      console.error("Failed to load items:", err);
    } finally {
      setLoading(false);
    }
  }, [activeFolderId, searchQuery, sortOrder]);

  const refreshFolders = useCallback(async () => {
    try {
      const data = await GetFolders();
      setFolders(data || []);
    } catch (err) {
      console.error("Failed to load folders:", err);
    }
  }, []);

  const refreshTags = useCallback(async () => {
    try {
      const data = await GetTags();
      setTags(data || []);
    } catch (err) {
      console.error("Failed to load tags:", err);
    }
  }, []);

  const refreshTrashCount = useCallback(async () => {
    try {
      const count = await GetTrashCount();
      setTrashCount(count || 0);
    } catch (err) {
      console.error("Failed to load trash count:", err);
    }
  }, []);

  const handleFullRefresh = useCallback(async () => {
    await Promise.all([
      refreshItems(),
      refreshFolders(),
      refreshTags(),
      refreshTrashCount(),
    ]);
  }, [refreshItems, refreshFolders, refreshTags, refreshTrashCount]);

  useEffect(() => {
    refreshItems();
  }, [refreshItems]);

  useEffect(() => {
    refreshFolders();
  }, [refreshFolders]);

  useEffect(() => {
    refreshTags();
  }, [refreshTags]);

  useEffect(() => {
    refreshTrashCount();
  }, [refreshTrashCount]);

  const [isInternalDragging, setIsInternalDragging] = useState(false);

  useEffect(() => {
    const cleanupActiveClasses = () => {
      setIsInternalDragging(false);
      setInternalDragActive(false);
      document.querySelectorAll(".file-drop-target-active").forEach((el) => {
        el.classList.remove("file-drop-target-active");
      });
    };
    window.addEventListener("dragend", cleanupActiveClasses);
    window.addEventListener("drop", cleanupActiveClasses);
    window.addEventListener("mouseup", cleanupActiveClasses);
    return () => {
      window.removeEventListener("dragend", cleanupActiveClasses);
      window.removeEventListener("drop", cleanupActiveClasses);
      window.removeEventListener("mouseup", cleanupActiveClasses);
    };
  }, []);

  const previousLibraryPathRef = useRef(library.path);
  useEffect(() => {
    if (previousLibraryPathRef.current === library.path) return;
    previousLibraryPathRef.current = library.path;
    setSelectedOrder([]);
    setActiveItemId(null);
    previewPushedRef.current = false;
    ws.reset();
    refreshItems();
    refreshFolders();
    refreshTags();
    refreshTrashCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.path]);

  const activeFolderIdRef = useRef<string | null>(activeFolderId);
  useEffect(() => {
    activeFolderIdRef.current = activeFolderId;
  }, [activeFolderId]);

  const { state: dropState, importFileList, dragHandlers } = useFileDrop({
    onRefresh: async (newlyImportedIds?: string[]) => {
      const targetFolderId = activeFolderIdRef.current;
      if (
        targetFolderId &&
        targetFolderId !== "__trash__" &&
        newlyImportedIds &&
        newlyImportedIds.length > 0
      ) {
        for (const id of newlyImportedIds) {
          try {
            await AddItemToFolder(id, targetFolderId);
          } catch (err) {
            console.error("Failed to add item to current folder:", err);
          }
        }
      }
      await handleFullRefresh();
    },
  });

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const clipboardItems = e.clipboardData.items;
      const filesToImport: globalThis.File[] = [];

      for (let i = 0; i < clipboardItems.length; i++) {
        const item = clipboardItems[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            filesToImport.push(file);
          }
        }
      }

      if (filesToImport.length > 0) {
        e.preventDefault();
        await importFileList(filesToImport);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [importFileList]);

  // Fast lookup map for O(1) resolution of selectedOrder -> Item[]
  const itemsById = useMemo(() => {
    const map = new Map<string, Item>();
    for (const it of items) {
      map.set(it.id, it);
    }
    return map;
  }, [items]);

  // Selected items strictly ordered by selection sequence (FIFO)
  const selectedItems = useMemo(() => {
    const result: Item[] = [];
    for (const id of selectedOrder) {
      const found = itemsById.get(id);
      if (found) result.push(found);
    }
    return result;
  }, [selectedOrder, itemsById]);

  // Active item for single inspector & preview (defaults to the most recently selected item)
  const activeItem = useMemo(() => {
    if (activeItemId) {
      const found = itemsById.get(activeItemId);
      if (found) return found;
    }
    return selectedItems[selectedItems.length - 1] || null;
  }, [itemsById, activeItemId, selectedItems]);

  const previewActiveItem = useMemo(() => {
    if (!ws.preview || !ws.item) return null;
    return itemsById.get(ws.item) ?? null;
  }, [itemsById, ws.preview, ws.item]);

  useEffect(() => {
    if (!loading && ws.preview && !previewActiveItem) {
      ws.closePreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, ws.preview, previewActiveItem]);

  // Multi-dimensional filtering: sidebar folder/tag + FilterBar (type, color, tag, folder, orientation)
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (activeFolderId !== "__trash__") {
        // Sidebar folder selection
        if (activeFolderId !== null) {
          const itemFolders = item.folders || [];
          if (!itemFolders.includes(activeFolderId)) {
            return false;
          }
        }

        // Sidebar tag selection
        if (activeTag !== null) {
          const itemTags = item.tags || [];
          if (!itemTags.includes(activeTag)) {
            return false;
          }
        }
      }

      // 1. Category / Type filter
      if (categoryFilter !== "all") {
        if (getFileCategory(item.extension, item.mimeType) !== categoryFilter) {
          return false;
        }
      }

      // 2. Folder dropdown filter
      if (folderFilter) {
        const itemFolders = item.folders || [];
        if (folderFilter === UNCATEGORIZED_FOLDER_FILTER) {
          if (itemFolders.length > 0) return false;
        } else if (!itemFolders.includes(folderFilter)) {
          return false;
        }
      }

      // 3. Tag dropdown filter
      if (tagFilter) {
        const itemTags = item.tags || [];
        if (tagFilter === UNTAGGED_TAG_FILTER) {
          if (itemTags.length > 0) return false;
        } else if (!itemTags.includes(tagFilter)) {
          return false;
        }
      }

      // 4. Orientation filter
      if (orientationFilter !== "all") {
        const orient =
          item.meta?.orientation ||
          (item.width > 0 && item.height > 0
            ? Math.abs(item.width / item.height - 1) <= 0.05
              ? "square"
              : item.width > item.height
              ? "landscape"
              : "portrait"
            : "");
        if (orient !== orientationFilter) {
          return false;
        }
      }

      // 5. Color filter
      if (colorFilter) {
        if (!itemMatchesColorFilter(item, colorFilter)) {
          return false;
        }
      }

      return true;
    });
  }, [
    items,
    activeFolderId,
    activeTag,
    categoryFilter,
    folderFilter,
    tagFilter,
    orientationFilter,
    colorFilter,
  ]);

  // Native OS & In-App Drag Start
  const handleDragStart = (e: React.DragEvent, item: Item) => {
    setIsInternalDragging(true);
    setInternalDragActive(true);
    const isMulti = selectedItemIds.has(item.id) && selectedItemIds.size > 1;
    const targetItems = isMulti ? selectedItems : [item];

    const rawPaths = targetItems
      .map((i) => i.filePath || (i.itemPath ? `${i.itemPath}/${i.filename}` : ""))
      .filter(Boolean);

    const fileUrls = targetItems
      .map((i) => {
        const raw =
          i.filePath || (i.itemPath ? `${i.itemPath}/${i.filename}` : "");
        let u = i.fileUrl;
        if (!u && raw) {
          u = encodeURI(`file://${raw.startsWith("/") ? "" : "/"}${raw}`);
        } else if (u && u.includes(" ")) {
          u = encodeURI(u);
        }
        return u;
      })
      .filter((u): u is string => Boolean(u));

    const itemIds = targetItems.map((i) => i.id);
    e.dataTransfer.setData("application/x-bowerbird-internal-drag", "true");
    e.dataTransfer.setData(
      "application/x-bowerbird-item-ids",
      JSON.stringify(itemIds)
    );
    e.dataTransfer.setData("application/x-bowerbird-item-id", item.id);
    e.dataTransfer.setData(
      "application/x-bowerbird-active-folder",
      activeFolderId || ""
    );
    if (rawPaths.length > 0) {
      e.dataTransfer.setData("text/plain", rawPaths.join("\n"));
      e.dataTransfer.setData(
        "application/x-bowerbird-file-paths",
        JSON.stringify(rawPaths)
      );
    }

    if (fileUrls.length > 0) {
      e.dataTransfer.setData("text/uri-list", fileUrls.join("\r\n"));
      const mime = item.mimeType || "application/octet-stream";
      e.dataTransfer.setData(
        "application/x-moz-file-promise-url",
        `${mime}:${item.filename}:${fileUrls[0]}`
      );
    }

    e.dataTransfer.effectAllowed = "copyMove";
  };

  // Delete Request Handler
  const handleRequestDelete = (targetItem?: Item, targetList?: Item[]) => {
    const targets = targetList || (targetItem ? [targetItem] : selectedItems);
    if (targets.length === 0) return;

    if (activeFolderId === "__trash__") {
      setDeleteConfirmDialog({
        isOpen: true,
        item: targets[0] || null,
        items: targets,
        type: "permanent",
      });
      return;
    }

    if (activeFolderId && activeFolderId !== "__trash__") {
      const multiRef = targets.some((it) => (it.folders || []).length > 1);
      if (multiRef) {
        setDeleteConfirmDialog({
          isOpen: true,
          item: targets[0] || null,
          items: targets,
          type: "multi-folder",
        });
        return;
      }
    }

    (async () => {
      try {
        const ids = targets.map((i) => i.id);
        const removeSet = new Set(ids);
        await BatchMoveToTrash(ids);
        setSelectedOrder((prev) => prev.filter((id) => !removeSet.has(id)));
        if (activeItemId && removeSet.has(activeItemId)) {
          setActiveItemId(null);
        }
        await handleFullRefresh();
      } catch (err) {
        console.error("Failed to move to trash:", err);
      }
    })();
  };

  const handleRestore = async (targetItem?: Item) => {
    const targets = targetItem ? [targetItem] : selectedItems;
    if (targets.length === 0) return;
    try {
      const ids = targets.map((i) => i.id);
      const removeSet = new Set(ids);
      await BatchRestoreFromTrash(ids);
      setSelectedOrder((prev) => prev.filter((id) => !removeSet.has(id)));
      if (activeItemId && removeSet.has(activeItemId)) {
        setActiveItemId(null);
      }
      await handleFullRefresh();
    } catch (err) {
      console.error("Failed to restore from trash:", err);
    }
  };

  const handleEmptyTrash = async () => {
    try {
      await EmptyTrash();
      setSelectedOrder([]);
      setActiveItemId(null);
      await handleFullRefresh();
    } catch (err) {
      console.error("Failed to empty trash:", err);
    }
  };

  const handleOpenRename = (targetItem?: Item) => {
    const item = targetItem || activeItem;
    if (!item) return;
    setRenameDialog({
      isOpen: true,
      item,
      newName: item.name,
    });
  };

  const handleReveal = async (
    e: React.MouseEvent | undefined,
    id: string
  ) => {
    e?.stopPropagation();
    try {
      await RevealInFinder(id);
    } catch (err) {
      console.error("Failed to reveal file:", err);
    }
  };

  const handleBatchReveal = async () => {
    for (const item of selectedItems.slice(0, 5)) {
      try {
        await RevealInFinder(item.id);
      } catch (err) {
        console.error("Failed to reveal in file manager:", err);
      }
    }
  };

  const handleOpenDefaultApp = async (targetItem?: Item) => {
    const item = targetItem || activeItem;
    if (!item) return;
    try {
      await OpenWithDefaultApp(item.id);
    } catch (err) {
      console.error("Failed to open with default application:", err);
    }
  };

  const handleCopyPath = async (targetItem?: Item) => {
    const item = targetItem || activeItem;
    if (!item) return;
    try {
      const plainPath =
        item.filePath ||
        (item.itemPath ? `${item.itemPath}/${item.filename}` : item.shellPath);
      await navigator.clipboard.writeText(plainPath);
      toast.success(t("workspace.pathCopied"));
    } catch (err) {
      console.error("Failed to copy file path:", err);
    }
  };

  const handleOpenSettings = async () => {
    try {
      await OpenSettingsWindow();
    } catch (err) {
      console.error("Failed to open settings window:", err);
    }
  };

  const handleToggleFavorite = async (targetItem?: Item) => {
    const item = targetItem || activeItem;
    if (!item) return;
    try {
      const nowFav = await ToggleFavorite(item.id);
      await handleFullRefresh();
      toast.success(
        nowFav ? t("workspace.favoriteAdded") : t("workspace.favoriteRemoved")
      );
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    }
  };

  const handleBatchAddToFolder = async (folderId: string) => {
    try {
      for (const id of selectedOrder) {
        await AddItemToFolder(id, folderId);
      }
      await handleFullRefresh();
    } catch (err) {
      console.error("Failed to add items to folder:", err);
    }
  };

  const handleBatchRemoveFromFolder = async (folderId: string) => {
    try {
      for (const id of selectedOrder) {
        await RemoveItemFromFolder(id, folderId);
      }
      await handleFullRefresh();
    } catch (err) {
      console.error("Failed to remove items to folder:", err);
    }
  };

  const handleCreateFolder = async (name: string, parentId?: string) => {
    try {
      await CreateFolder(name, parentId || "");
      await refreshFolders();
    } catch (err) {
      console.error("Failed to create folder:", err);
    }
  };

  const handleRenameFolder = async (folderId: string, name: string) => {
    try {
      await RenameFolder(folderId, name);
      await refreshFolders();
    } catch (err) {
      console.error("Failed to rename folder:", err);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await DeleteFolder(folderId);
      if (activeFolderId === folderId) {
        navigateToFolder(null);
      }
      await handleFullRefresh();
      toast.success(t("workspace.folderDeleted"));
    } catch (err) {
      console.error("Failed to delete folder:", err);
      toast.error(t("workspace.folderDeleteFailed"));
    }
  };

  const handleMoveItemToFolder = async (
    itemId: string,
    fromFolderId: string,
    toFolderId: string
  ) => {
    try {
      await MoveItemToFolder(itemId, fromFolderId, toFolderId);
      await handleFullRefresh();
      toast.success(t("workspace.itemMoved"));
    } catch (err) {
      console.error("Failed to move item:", err);
    }
  };

  const readEntryRecursively = async (
    entry: FileSystemEntry,
    parentId = ""
  ) => {
    if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const createdFolder = await CreateFolder(dirEntry.name, parentId);
      const targetId = createdFolder?.id || "";
      const dirReader = dirEntry.createReader();
      const readEntries = async (): Promise<FileSystemEntry[]> => {
        const { promise, resolve } = Promise.withResolvers<FileSystemEntry[]>();
        dirReader.readEntries((entries) => resolve(entries || []));
        return promise;
      };
      let batch: FileSystemEntry[] = [];
      do {
        batch = await readEntries();
        for (const child of batch) {
          await readEntryRecursively(child, targetId);
        }
      } while (batch.length > 0);
    } else if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const fileResolver = Promise.withResolvers<File>();
      fileEntry.file(fileResolver.resolve);
      const file = await fileResolver.promise;
      const reader = new FileReader();
      const dataResolver = Promise.withResolvers<string>();
      reader.onload = () => dataResolver.resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
      const base64Data = await dataResolver.promise;
      const imported = await ImportFromBase64(file.name, base64Data);
      if (imported && parentId) {
        await AddItemToFolder(imported.id, parentId);
      }
    }
  };

  const handleDropFolderImport = async (
    e: React.DragEvent,
    targetFolderId = ""
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const folderPaths: string[] = [];
    const folderEntries: FileSystemEntry[] = [];

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          const diskPath =
            file && "path" in file && typeof file.path === "string"
              ? file.path
              : "";
          const entry = item.webkitGetAsEntry?.();
          if (diskPath) {
            folderPaths.push(diskPath);
          } else if (entry && entry.isDirectory) {
            folderEntries.push(entry);
          }
        }
      }
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const f = e.dataTransfer.files[i];
        const diskPath =
          "path" in f && typeof f.path === "string" ? f.path : "";
        if (diskPath && !folderPaths.includes(diskPath)) {
          folderPaths.push(diskPath);
        }
      }
    }

    if (folderPaths.length > 0) {
      try {
        const imported = await ImportFoldersRecursively(
          folderPaths,
          targetFolderId
        );
        if (imported && imported.length > 0) {
          await handleFullRefresh();
          return;
        }
      } catch (err) {
        console.warn(
          "ImportFoldersRecursively failed, fallback to entry reading:",
          err
        );
      }
    }

    if (folderEntries.length > 0) {
      for (const entry of folderEntries) {
        await readEntryRecursively(entry, targetFolderId);
      }
      await handleFullRefresh();
      return;
    }

    console.warn("Sidebar import accepts folders only");
  };

  // Tag Handlers
  const handleCreateTag = async (name: string) => {
    try {
      await CreateTag(name);
      await refreshTags();
    } catch (err) {
      console.error("Failed to create tag:", err);
    }
  };

  const handleDeleteTag = async (name: string) => {
    try {
      await DeleteTag(name);
      if (activeTag === name) {
        ws.selectTag(null);
      }
      await handleFullRefresh();
    } catch (err) {
      console.error("Failed to delete tag:", err);
    }
  };

  const handleAddTagToItem = async (itemId: string, tag: string) => {
    try {
      await AddTagToItem(itemId, tag);
      await handleFullRefresh();
    } catch (err) {
      console.error("Failed to add tag:", err);
    }
  };

  const handleRemoveTagFromItem = async (itemId: string, tag: string) => {
    try {
      await RemoveTagFromItem(itemId, tag);
      await handleFullRefresh();
    } catch (err) {
      console.error("Failed to remove tag:", err);
    }
  };

  const findFolderById = (list: Folder[], id: string): Folder | null => {
    for (const f of list) {
      if (f.id === id) return f;
      if (f.children && f.children.length > 0) {
        const found = findFolderById(f.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const currentFolder =
    activeFolderId && activeFolderId !== "__trash__"
      ? findFolderById(folders, activeFolderId)
      : null;
  const activeTagLabel =
    activeTag === FAVORITE_TAG ? t("common.favorites") : activeTag;
  const totalSizeBytes = filteredItems.reduce(
    (acc, curr) => acc + (curr.size || 0),
    0
  );

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (ws.preview) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (activeItem) {
          openPreview("full");
        }
      } else if (e.code === "Escape") {
        if (contextMenu) {
          setContextMenu(null);
        } else if (selectedOrder.length > 0) {
          setSelectedOrder([]);
          setActiveItemId(null);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.code === "KeyA") {
        e.preventDefault();
        setSelectedOrder(filteredItems.map((i) => i.id));
        if (filteredItems.length > 0) {
          setActiveItemId(filteredItems[filteredItems.length - 1].id);
        }
      } else if (e.code === "Backspace" || e.code === "Delete") {
        if (selectedOrder.length > 0) {
          e.preventDefault();
          handleRequestDelete();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeItem, ws.preview, contextMenu, selectedOrder, filteredItems]);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <div className="flex h-screen w-screen bg-background text-foreground antialiased select-none overflow-hidden wails-no-drag">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={async (e) => {
            if (e.target.files && e.target.files.length > 0) {
              await importFileList(e.target.files);
              e.target.value = "";
            }
          }}
        />

        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full w-full select-none overflow-hidden"
        >
          {sidebarOpen && (
            <>
              <ResizablePanel
                id="sidebar-panel"
                defaultSize={220}
                minSize={220}
                maxSize="40%"
                className="min-w-[220px]"
              >
                <SidebarDirectoryTree
                  library={library}
                  folders={folders}
                  activeFolderId={activeFolderId}
                  totalItemCount={items.length}
                  trashCount={trashCount}
                  tagsCount={tags.length}
                  tagsSidebarOpen={tagsSidebarOpen}
                  onToggleTagsSidebar={() => {
                    ws.toggleTagsPanel();
                  }}
                  onSelectFolder={(id) => {
                    navigateToFolder(id);
                    setSelectedOrder([]);
                    setActiveItemId(null);
                  }}
                  onCreateFolder={handleCreateFolder}
                  onRenameFolder={handleRenameFolder}
                  onDeleteFolder={handleDeleteFolder}
                  onMoveItemToFolder={handleMoveItemToFolder}
                  onDropFolderImport={handleDropFolderImport}
                  onDropItemOnTrash={async (ids) => {
                    await BatchMoveToTrash(ids);
                    await handleFullRefresh();
                    toast.success(t("workspace.movedToTrash"));
                  }}
                  onCloseLibrary={async () => {
                    await CloseLibrary();
                    onLibraryClosed();
                    OpenSetupWindow().catch(console.error);
                  }}
                  onLibraryChanged={onLibraryChanged}
                  onToggleCollapse={() => setSidebarOpen(false)}
                />
              </ResizablePanel>
              <ResizableHandle className="w-px bg-border hover:bg-primary/50 transition-colors cursor-col-resize z-20" />

              {tagsSidebarOpen && (
                <>
                  <ResizablePanel
                    id="tags-sidebar-panel"
                    defaultSize={190}
                    minSize={160}
                    maxSize={300}
                    className="min-w-[160px] max-w-[300px]"
                  >
                    <TagsSidebar
                      tags={tags}
                      activeTag={activeTag}
                      onSelectTag={(tg) => {
                        if (tg === null) {
                          ws.closeTagsPanel();
                        } else {
                          ws.selectTag(tg);
                        }
                        setSelectedOrder([]);
                        setActiveItemId(null);
                      }}
                      onCreateTag={handleCreateTag}
                      onDeleteTag={handleDeleteTag}
                      onClose={() => {
                        ws.closeTagsPanel();
                      }}
                    />
                  </ResizablePanel>
                  <ResizableHandle className="w-px bg-border hover:bg-primary/50 transition-colors cursor-col-resize z-20" />
                </>
              )}
            </>
          )}

          {/* COLUMN 2: CENTER MAIN CONTENT (Justified Gallery) */}
          <ResizablePanel id="gallery-main-panel" minSize={380}>
            <main
              data-file-drop-target={isInternalDragging ? undefined : "main"}
              className="group/main relative flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-background"
              {...(isInternalDragging
                ? {
                    onDragOver: (e: React.DragEvent) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "none";
                    },
                    onDrop: (e: React.DragEvent) => {
                      e.preventDefault();
                    },
                  }
                : dragHandlers)}
            >
              {/* Pure 10% opacity mask + dashed border for main area dropzone (NO inner text/icons) */}
              {dropState.status === "dragging-over" && !isInternalDragging && (
                <div className="pointer-events-none absolute inset-0 z-50 border-2 border-dashed border-primary/80 bg-foreground/10 rounded-[inherit]" />
              )}

              {!isInternalDragging && dropState.status === "importing" && (
                <DropzoneOverlay state={dropState} />
              )}

              <header className="w-full bg-background border-b-0 shrink-0 select-none header-interactive-container wails-no-drag">
                {/* Row 1: Titlebar height row — parent is strictly wails-no-drag; ONLY the middle spacer is wails-drag */}
                <div className="h-(--titlebar-height) px-3 flex items-center justify-between wails-no-drag">
                  {/* Left operable container: full height, strictly header-interactive-container + wails-no-drag */}
                  <MainHeaderSafePrefix
                    sidebarOpen={sidebarOpen}
                    onToggleSidebar={() => setSidebarOpen(true)}
                  >
                    <HistoryNavButtons className="mr-1" />

                    <span className="font-semibold text-xs tracking-tight truncate text-foreground header-interactive-container wails-no-drag">
                      {activeFolderId === "__trash__"
                        ? t("workspace.trash")
                        : activeTag
                        ? t("workspace.tagWithValue", { tag: activeTagLabel })
                        : currentFolder
                        ? currentFolder.name
                        : t("workspace.all")}
                    </span>

                    {/* Thumbnail row height zoom slider: [-] [slider] [+] (matches ZoomControls structure) */}
                    <div className="relative flex items-center gap-1 ml-2 header-interactive-container wails-no-drag slider-control-container select-none">
                      <button
                        type="button"
                        onClick={() => setRowHeight((h) => Math.max(60, h - 10))}
                        className="size-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors wails-no-drag cursor-pointer"
                        title={t("workspace.zoomOut")}
                      >
                        <Minus className="size-3 wails-no-drag pointer-events-none" />
                      </button>
                      <div className="w-20 py-1 wails-no-drag">
                        <Slider
                          min={60}
                          max={240}
                          step={5}
                          value={rowHeight}
                          onValueChange={(val) =>
                            setRowHeight(Array.isArray(val) ? val[0] : val)
                          }
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setRowHeight((h) => Math.min(240, h + 10))}
                        className="size-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors wails-no-drag cursor-pointer"
                        title={t("workspace.zoomIn")}
                      >
                        <Plus className="size-3 wails-no-drag pointer-events-none" />
                      </button>
                    </div>
                  </MainHeaderSafePrefix>

                  {/* Center: Window draggable filler */}
                  <div className="flex-1 h-full min-w-4 wails-drag" />

                  {/* Right operable container: Search + Settings wrapped in header-interactive-container */}
                  <div className="h-full flex items-center gap-2 shrink-0 header-interactive-container wails-no-drag">
                    <div className="w-[160px] shrink-0 p-1 -m-1 wails-no-drag search-input-container">
                      <div className="relative wails-no-drag">
                        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <Input
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder={t("common.search")}
                          className="pl-8 pr-7 h-7 text-xs bg-muted/40 border-border/60 rounded-lg focus-visible:bg-background wails-no-drag"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground wails-no-drag cursor-pointer"
                          >
                            <X className="size-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenSettings}
                      title={t("settings.title")}
                      className="inline-flex items-center justify-center size-7 shrink-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 wails-no-drag cursor-pointer"
                    >
                      <Settings className="size-3.5" />
                    </button>
                  </div>
                </div>

                {/* Row 2: Multi-dimensional FilterBar dropdowns & Sort controls */}
                <div className="h-9 px-3 flex items-center justify-between gap-2 text-xs header-interactive-container wails-no-drag">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    {activeTag && (
                      <Badge
                        variant="secondary"
                        className="text-[11px] gap-1 pl-2 pr-1 h-6 font-normal bg-primary/10 text-primary border-primary/20"
                      >
                        <TagIcon className="size-2.5" />
                        <span>{activeTagLabel}</span>
                        <button
                          type="button"
                          onClick={() => ws.selectTag(null)}
                          className="hover:text-destructive p-0.5 rounded cursor-pointer"
                        >
                          <X className="size-2.5" />
                        </button>
                      </Badge>
                    )}

                    <FilterBar
                      items={items}
                      folders={folders}
                      tags={tags}
                      categoryFilter={categoryFilter}
                      colorFilter={colorFilter}
                      folderFilter={folderFilter}
                      tagFilter={tagFilter}
                      orientationFilter={orientationFilter}
                      onCategoryChange={(cat) => ws.setCategory(cat)}
                      onColorChange={(c) => ws.setColorFilter(c)}
                      onFolderChange={(f) => ws.setFolderFilter(f)}
                      onTagChange={(tg) => ws.setTagFilter(tg)}
                      onOrientationChange={(o) => ws.setOrientationFilter(o)}
                      onClearAll={() => ws.clearAllFilters()}
                    />
                  </div>

                  {/* Right controls: Trash action buttons or sort toggle */}
                  <div className="flex items-center gap-2 shrink-0">
                    {activeFolderId === "__trash__" ? (
                      <>
                        {selectedOrder.length > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => handleRestore()}
                              className="h-6.5 text-[11px] gap-1 text-primary hover:text-primary cursor-pointer"
                            >
                              <RotateCcw className="size-3" />
                              <span>
                                {t("workspace.restoreCount", {
                                  count: selectedOrder.length,
                                })}
                              </span>
                            </Button>
                            <Button
                              variant="destructive"
                              size="xs"
                              onClick={() => handleRequestDelete()}
                              className="h-6.5 text-[11px] gap-1 cursor-pointer"
                            >
                              <Trash2 className="size-3" />
                              <span>
                                {t("workspace.deletePermanentlyCount", {
                                  count: selectedOrder.length,
                                })}
                              </span>
                            </Button>
                          </div>
                        ) : filteredItems.length > 0 ? (
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={handleEmptyTrash}
                            className="h-6.5 text-[11px] gap-1 text-destructive hover:text-destructive cursor-pointer"
                          >
                            <Trash2 className="size-3" />
                            <span>{t("workspace.emptyTrash")}</span>
                          </Button>
                        ) : null}
                      </>
                    ) : null}

                    {dropState.status === "importing" && dropState.message && (
                      <span className="text-[11px] text-primary font-medium animate-pulse font-mono truncate max-w-xs">
                        {dropState.message}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        ws.setSort(sortOrder === "desc" ? "asc" : "desc")
                      }
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-md hover:bg-muted/50 cursor-pointer"
                    >
                      <ArrowUpDown className="size-3" />
                      <span>
                        {sortOrder === "desc"
                          ? t("workspace.newest")
                          : t("workspace.oldest")}
                      </span>
                    </button>
                  </div>
                </div>
              </header>

              {/* Center Main Scrollable Area with Justified Gallery & Trackpad Zoom */}
              <div
                ref={galleryViewportRef}
                className="flex-1 overflow-y-auto p-4 flex flex-col wails-no-drag"
              >
                {loading ? (
                  <div className="h-full flex-1 flex items-center justify-center text-xs text-muted-foreground">
                    {t("workspace.loadingIndex")}
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="h-full flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-border/50 rounded-2xl max-w-md mx-auto my-8">
                    {activeFolderId === "__trash__" ? (
                      <>
                        <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground mb-3">
                          <Trash2 className="size-6 text-muted-foreground" />
                        </div>
                        <h3 className="font-semibold text-sm mb-1">
                          {t("workspace.trashEmptyTitle")}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {t("workspace.trashEmptyDesc")}
                        </p>
                      </>
                    ) : activeTag ? (
                      <>
                        <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground mb-3">
                          <TagIcon className="size-6 text-muted-foreground" />
                        </div>
                        <h3 className="font-semibold text-sm mb-1">
                          {t("workspace.tagEmptyTitle", { tag: activeTagLabel })}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {t("workspace.tagEmptyDesc")}
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground mb-3">
                          <Upload className="size-6 text-muted-foreground" />
                        </div>
                        <h3 className="font-semibold text-sm mb-1">
                          {t("workspace.noFilesTitle")}
                        </h3>
                        <p className="text-xs text-muted-foreground mb-4">
                          {t("workspace.noFilesDesc")}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-xs cursor-pointer"
                        >
                          {t("workspace.chooseFiles")}
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <JustifiedGallery
                    items={filteredItems}
                    selectedOrder={selectedOrder}
                    keyboardNavEnabled={
                      !inlinePreviewOpen &&
                      !fullWindowPreviewOpen &&
                      !contextMenu &&
                      !deleteConfirmDialog &&
                      !renameDialog
                    }
                    targetRowHeight={rowHeight}
                    onSelectionChange={(nextOrder, lastItem) => {
                      setSelectedOrder(nextOrder);
                      if (lastItem) {
                        setActiveItemId(lastItem.id);
                      } else if (nextOrder.length === 0) {
                        setActiveItemId(null);
                      } else {
                        setActiveItemId(nextOrder[nextOrder.length - 1]);
                      }
                    }}
                    onDoubleClickItem={(item) => {
                      setActiveItemId(item.id);
                      setSelectedOrder([item.id]);
                      openPreview("inline", item.id);
                    }}
                    onDragStartItem={handleDragStart}
                    onItemContextMenu={(e, item) => {
                      if (!selectedItemIds.has(item.id)) {
                        setSelectedOrder([item.id]);
                        setActiveItemId(item.id);
                      }
                      setContextMenu({
                        position: { x: e.clientX, y: e.clientY },
                        isItemContext: true,
                      });
                    }}
                    onCanvasContextMenu={(e) => {
                      setContextMenu({
                        position: { x: e.clientX, y: e.clientY },
                        isItemContext: false,
                      });
                    }}
                  />
                )}
              </div>

              {inlinePreviewOpen && previewActiveItem && (
                <UnifiedPreviewModal
                  open={inlinePreviewOpen}
                  mode="inline"
                  activeItem={previewActiveItem}
                  items={filteredItems}
                  onClose={closePreview}
                  onIndexChange={(newItem) => {
                    setActiveItemId(newItem.id);
                    ws.setPreviewItem(newItem.id);
                  }}
                  sidebarOpen={sidebarOpen}
                  onToggleSidebar={() => setSidebarOpen(true)}
                  onItemUpdated={refreshItems}
                />
              )}
            </main>
          </ResizablePanel>

          {/* COLUMN 3: RIGHT INSPECTOR PANEL (Single Item or Multi-Item) */}
          {sidebarOpen && (
            <>
              <ResizableHandle className="w-px bg-border hover:bg-primary/50 transition-colors cursor-col-resize z-20" />
              <ResizablePanel
                id="inspector-panel"
                defaultSize={260}
                minSize={220}
                maxSize={400}
                className="min-w-[220px] max-w-[400px]"
              >
                {selectedItems.length > 1 ? (
                  <MultiItemInspector
                    selectedItems={selectedItems}
                    allFolders={folders}
                    activeFolderId={activeFolderId}
                    onClearSelection={() => {
                      setSelectedOrder([]);
                      setActiveItemId(null);
                    }}
                    onBatchReveal={handleBatchReveal}
                    onBatchDelete={() =>
                      handleRequestDelete(undefined, selectedItems)
                    }
                    onBatchRestore={() => handleRestore()}
                    onBatchAddToFolder={handleBatchAddToFolder}
                    onBatchRemoveFromFolder={handleBatchRemoveFromFolder}
                  />
                ) : (
                  <ItemDetailPanel
                    item={activeItem}
                    currentFolder={currentFolder}
                    allFolders={folders}
                    allTags={tags}
                    totalItemCount={filteredItems.length}
                    totalSizeBytes={totalSizeBytes}
                    isTrashView={activeFolderId === "__trash__"}
                    activeColorFilter={colorFilter}
                    onSelectColorFilter={(hex) => ws.setColorFilter(hex)}
                    onClose={() => {
                      setSelectedOrder([]);
                      setActiveItemId(null);
                    }}
                    onPreview={() => openPreview("full")}
                    onReveal={() =>
                      activeItem && handleReveal(undefined, activeItem.id)
                    }
                    onDelete={() =>
                      activeItem && handleRequestDelete(activeItem)
                    }
                    onRestore={() => activeItem && handleRestore(activeItem)}
                    onToggleFavorite={() =>
                      activeItem && handleToggleFavorite(activeItem)
                    }
                    onFolderUpdated={handleFullRefresh}
                    onTagsUpdated={handleFullRefresh}
                    onItemUpdated={refreshItems}
                  />
                )}
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>

        {/* FULL-WINDOW POPUP PREVIEW (Space key) */}
        <UnifiedPreviewModal
          open={fullWindowPreviewOpen}
          mode="full-window"
          activeItem={previewActiveItem ?? activeItem}
          items={filteredItems}
          onClose={closePreview}
          onIndexChange={(newItem) => {
            setActiveItemId(newItem.id);
            ws.setPreviewItem(newItem.id);
          }}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(true)}
          onItemUpdated={refreshItems}
        />

        {/* ENHANCED COMMAND CONTEXT MENU */}
        <CustomContextMenu
          position={contextMenu?.position || null}
          onClose={() => setContextMenu(null)}
          selectedCount={selectedOrder.length}
          isItemContext={contextMenu?.isItemContext || false}
          activeFolderId={activeFolderId}
          allFolders={folders}
          allTags={tags}
          targetItem={activeItem}
          onPreview={() => openPreview("full")}
          onRename={() => activeItem && handleOpenRename(activeItem)}
          onReveal={handleBatchReveal}
          onOpenWithDefaultApp={() =>
            activeItem && handleOpenDefaultApp(activeItem)
          }
          onCopyPath={() => activeItem && handleCopyPath(activeItem)}
          onToggleFavorite={() =>
            activeItem && handleToggleFavorite(activeItem)
          }
          onDelete={() => handleRequestDelete()}
          onRestore={() => handleRestore()}
          onAddToFolder={handleBatchAddToFolder}
          onRemoveFromCurrentFolder={() => {
            if (activeFolderId) handleBatchRemoveFromFolder(activeFolderId);
          }}
          onAddTag={(tag) => activeItem && handleAddTagToItem(activeItem.id, tag)}
          onRemoveTag={(tag) =>
            activeItem && handleRemoveTagFromItem(activeItem.id, tag)
          }
          onSelectAll={() => {
            setSelectedOrder(filteredItems.map((i) => i.id));
            if (filteredItems.length > 0) {
              setActiveItemId(filteredItems[filteredItems.length - 1].id);
            }
          }}
          onClearSelection={() => {
            setSelectedOrder([]);
            setActiveItemId(null);
          }}
          onImportFiles={() => fileInputRef.current?.click()}
          onCreateFolder={() => handleCreateFolder(t("workspace.newFolder"))}
        />

        {/* MULTI-FOLDER DELETION & PERMANENT DELETION DIALOG */}
        {deleteConfirmDialog && (
          <Dialog
            open={deleteConfirmDialog.isOpen}
            onOpenChange={(open) => !open && setDeleteConfirmDialog(null)}
          >
            <DialogContent className="max-w-sm text-xs">
              <DialogHeader>
                <DialogTitle className="text-sm font-semibold">
                  {deleteConfirmDialog.type === "permanent"
                    ? t("workspace.deletePermanentlyTitle")
                    : t("workspace.deleteTitle")}
                </DialogTitle>
              </DialogHeader>
              <div className="py-2 text-muted-foreground text-xs leading-relaxed">
                {deleteConfirmDialog.type === "permanent" ? (
                  <p>
                    {t("workspace.deletePermanentlyMessage", {
                      count: deleteConfirmDialog.items.length,
                    })}
                  </p>
                ) : (
                  <p>{t("workspace.deleteMultiFolderMessage")}</p>
                )}
              </div>
              <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteConfirmDialog(null)}
                  className="cursor-pointer"
                >
                  {t("common.cancel")}
                </Button>
                {deleteConfirmDialog.type === "permanent" ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="cursor-pointer"
                    onClick={async () => {
                      for (const it of deleteConfirmDialog.items) {
                        await PermanentDeleteItem(it.id);
                      }
                      setDeleteConfirmDialog(null);
                      setSelectedOrder([]);
                      setActiveItemId(null);
                      await handleFullRefresh();
                    }}
                  >
                    {t("workspace.deletePermanently")}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="cursor-pointer"
                      onClick={async () => {
                        if (activeFolderId) {
                          for (const it of deleteConfirmDialog.items) {
                            await RemoveItemFromFolder(it.id, activeFolderId);
                          }
                        }
                        setDeleteConfirmDialog(null);
                        setSelectedOrder([]);
                        setActiveItemId(null);
                        await handleFullRefresh();
                      }}
                    >
                      {t("workspace.removeFromFolder")}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="cursor-pointer"
                      onClick={async () => {
                        const ids = deleteConfirmDialog.items.map((i) => i.id);
                        await BatchMoveToTrash(ids);
                        setDeleteConfirmDialog(null);
                        setSelectedOrder([]);
                        setActiveItemId(null);
                        await handleFullRefresh();
                      }}
                    >
                      {t("workspace.moveToTrash")}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* FILE RENAME DIALOG */}
        {renameDialog && (
          <Dialog
            open={renameDialog.isOpen}
            onOpenChange={(open) => !open && setRenameDialog(null)}
          >
            <DialogContent className="max-w-sm text-xs">
              <DialogHeader>
                <DialogTitle className="text-sm font-semibold">
                  {t("workspace.renameTitle")}
                </DialogTitle>
              </DialogHeader>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!renameDialog.newName.trim() || !renameDialog.item) return;
                  try {
                    await RenameItem(
                      renameDialog.item.id,
                      renameDialog.newName.trim()
                    );
                    setRenameDialog(null);
                    await handleFullRefresh();
                  } catch (err) {
                    console.error("Failed to rename item:", err);
                  }
                }}
                className="space-y-4 pt-2"
              >
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">
                    {t("workspace.newFileName")}
                  </label>
                  <Input
                    autoFocus
                    value={renameDialog.newName}
                    onChange={(e) =>
                      setRenameDialog((prev) =>
                        prev ? { ...prev, newName: e.target.value } : null
                      )
                    }
                    className="h-8 text-xs bg-muted/40"
                  />
                </div>
                <DialogFooter className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRenameDialog(null)}
                    className="cursor-pointer"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button type="submit" size="sm" className="cursor-pointer">
                    {t("common.confirm")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </SidebarProvider>
  );
}
