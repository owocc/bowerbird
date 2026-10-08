import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  ArrowUpDown,
  Upload,
  X,
  Trash2,
  Minus,
  Plus,
  RotateCcw,
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
import { CustomContextMenu, type ContextMenuPosition } from "@/components/CustomContextMenu";
import { DropzoneOverlay } from "@/components/DropzoneOverlay";
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
  RevealInFinder,
} from "../../bindings/bowerbird/core/service";
import type { Item, Folder, Tag, LibraryInfo } from "../../bindings/bowerbird/core/models";
import { getFileCategory } from "@/lib/formatters";
import { useFileDrop } from "@/hooks/useFileDrop";

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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [trashCount, setTrashCount] = useState<number>(0);

  // Active navigation: activeFolderId can be a folder ID, null (All), or "__trash__" (Trash)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  // Active tag: null or tag name
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tagsSidebarOpen, setTagsSidebarOpen] = useState(false);

  const [loading, setLoading] = useState(true);

  // Search & Filter & Sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [rowHeight, setRowHeight] = useState<number>(80);

  // Selection & Previews State
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  // Preview modes
  const [inlinePreviewOpen, setInlinePreviewOpen] = useState(false);
  const [fullWindowPreviewOpen, setFullWindowPreviewOpen] = useState(false);

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

  // Custom Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    position: ContextMenuPosition;
    isItemContext: boolean;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Disable native browser context menu globally
  useEffect(() => {
    const disableContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener("contextmenu", disableContextMenu);
    return () => window.removeEventListener("contextmenu", disableContextMenu);
  }, []);

  // Load items from database (either regular items or trash items)
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
      console.error("加载资产失败:", err);
    } finally {
      setLoading(false);
    }
  }, [activeFolderId, searchQuery, sortOrder]);

  // Load folders from database
  const refreshFolders = useCallback(async () => {
    try {
      const data = await GetFolders();
      setFolders(data || []);
    } catch (err) {
      console.error("加载文件夹目录失败:", err);
    }
  }, []);

  // Load tags from database
  const refreshTags = useCallback(async () => {
    try {
      const data = await GetTags();
      setTags(data || []);
    } catch (err) {
      console.error("加载标签列表失败:", err);
    }
  }, []);

  // Load trash count
  const refreshTrashCount = useCallback(async () => {
    try {
      const count = await GetTrashCount();
      setTrashCount(count || 0);
    } catch (err) {
      console.error("加载回收站数量失败:", err);
    }
  }, []);

  // Full refresh helper
  const handleFullRefresh = useCallback(async () => {
    await Promise.all([refreshItems(), refreshFolders(), refreshTags(), refreshTrashCount()]);
  }, [refreshItems, refreshFolders, refreshTags, refreshTrashCount]);

  // Initial & search/sort reload
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

  // Track whether an internal in-app drag is currently active
  const [isInternalDragging, setIsInternalDragging] = useState(false);

  useEffect(() => {
    const handleDragEnd = () => {
      setIsInternalDragging(false);
      document.querySelectorAll(".file-drop-target-active").forEach((el) => {
        el.classList.remove("file-drop-target-active");
      });
    };
    const handleDropGlobal = () => {
      document.querySelectorAll(".file-drop-target-active").forEach((el) => {
        el.classList.remove("file-drop-target-active");
      });
    };
    window.addEventListener("dragend", handleDragEnd);
    window.addEventListener("drop", handleDropGlobal);
    return () => {
      window.removeEventListener("dragend", handleDragEnd);
      window.removeEventListener("drop", handleDropGlobal);
    };
  }, []);
  // Reset selection & reload on library path change ONLY
  useEffect(() => {
    setActiveFolderId(null);
    setActiveTag(null);
    setTagsSidebarOpen(false);
    setSelectedItemIds(new Set());
    setActiveItemId(null);
    setInlinePreviewOpen(false);
    setFullWindowPreviewOpen(false);
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

  // File drop hook for MAIN WORKSPACE (recursive flat import into current folder or all)
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
            console.error("关联资产到当前目录失败:", err);
          }
        }
      }
      await handleFullRefresh();
    },
  });

  // Global paste handler (Cmd+V)
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

  // Selected items array
  const selectedItems = useMemo(() => {
    return items.filter((i) => selectedItemIds.has(i.id));
  }, [items, selectedItemIds]);

  // Active item for single inspector & preview
  const activeItem = useMemo(() => {
    if (activeItemId) {
      const found = items.find((i) => i.id === activeItemId);
      if (found) return found;
    }
    return selectedItems[0] || null;
  }, [items, activeItemId, selectedItems]);

  // Filter items by folder, tag, and category
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // In Trash view, items are already fetched from GetTrashItems
      if (activeFolderId !== "__trash__") {
        if (activeFolderId !== null) {
          const itemFolders = item.folders || [];
          if (!itemFolders.includes(activeFolderId)) {
            return false;
          }
        }

        if (activeTag !== null) {
          const itemTags = item.tags || [];
          if (!itemTags.includes(activeTag)) {
            return false;
          }
        }
      }

      if (categoryFilter !== "all") {
        if (getFileCategory(item.extension) !== categoryFilter) {
          return false;
        }
      }

      return true;
    });
  }, [items, activeFolderId, activeTag, categoryFilter]);

  // Native OS & In-App Drag Start
  const handleDragStart = (e: React.DragEvent, item: Item) => {
    setIsInternalDragging(true);
    const isMulti = selectedItemIds.has(item.id) && selectedItemIds.size > 1;
    const targetItems = isMulti
      ? items.filter((i) => selectedItemIds.has(i.id))
      : [item];

    const rawPaths = targetItems
      .map((i) => i.filePath || (i.itemPath ? `${i.itemPath}/${i.filename}` : ""))
      .filter(Boolean);

    const fileUrls = targetItems
      .map((i) => {
        const raw = i.filePath || (i.itemPath ? `${i.itemPath}/${i.filename}` : "");
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
    e.dataTransfer.setData("application/x-bowerbird-item-ids", JSON.stringify(itemIds));
    e.dataTransfer.setData("application/x-bowerbird-item-id", item.id);
    e.dataTransfer.setData("application/x-bowerbird-active-folder", activeFolderId || "");
    if (rawPaths.length > 0) {
      e.dataTransfer.setData("text/plain", rawPaths.join("\n"));
      e.dataTransfer.setData("application/x-bowerbird-file-paths", JSON.stringify(rawPaths));
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

  // Delete Request Handler (checks multi-folder reference condition)
  const handleRequestDelete = (targetItem?: Item, targetList?: Item[]) => {
    const targets = targetList || (targetItem ? [targetItem] : selectedItems);
    if (targets.length === 0) return;

    if (activeFolderId === "__trash__") {
      // In Trash -> Confirm Permanent Delete
      setDeleteConfirmDialog({
        isOpen: true,
        item: targets[0] || null,
        items: targets,
        type: "permanent",
      });
      return;
    }

    // In a folder view: check if any item is referenced in multiple folders
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

    // Otherwise, directly move to Trash
    (async () => {
      try {
        const ids = targets.map((i) => i.id);
        await BatchMoveToTrash(ids);
        setSelectedItemIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
        if (activeItemId && ids.includes(activeItemId)) {
          setActiveItemId(null);
        }
        await handleFullRefresh();
      } catch (err) {
        console.error("移至回收站失败:", err);
      }
    })();
  };

  // Restore handler
  const handleRestore = async (targetItem?: Item) => {
    const targets = targetItem ? [targetItem] : selectedItems;
    if (targets.length === 0) return;
    try {
      const ids = targets.map((i) => i.id);
      await BatchRestoreFromTrash(ids);
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      if (activeItemId && ids.includes(activeItemId)) {
        setActiveItemId(null);
      }
      await handleFullRefresh();
    } catch (err) {
      console.error("放回原处失败:", err);
    }
  };

  // Empty Trash handler
  const handleEmptyTrash = async () => {
    try {
      await EmptyTrash();
      setSelectedItemIds(new Set());
      setActiveItemId(null);
      await handleFullRefresh();
    } catch (err) {
      console.error("清空回收站失败:", err);
    }
  };

  // Rename handler
  const handleOpenRename = (targetItem?: Item) => {
    const item = targetItem || activeItem;
    if (!item) return;
    setRenameDialog({
      isOpen: true,
      item,
      newName: item.name,
    });
  };

  // Reveal in Finder
  const handleReveal = async (e: React.MouseEvent | undefined, id: string) => {
    e?.stopPropagation();
    try {
      await RevealInFinder(id);
    } catch (err) {
      console.error("定位文件失败:", err);
    }
  };

  const handleBatchReveal = async () => {
    for (const item of selectedItems.slice(0, 5)) {
      try {
        await RevealInFinder(item.id);
      } catch (err) {
        console.error("在访达中显示失败:", err);
      }
    }
  };

  // Open with Default Application
  const handleOpenDefaultApp = async (targetItem?: Item) => {
    const item = targetItem || activeItem;
    if (!item) return;
    try {
      await OpenWithDefaultApp(item.id);
    } catch (err) {
      console.error("用默认程序打开失败:", err);
    }
  };

  // Copy plain file path
  const handleCopyPath = async (targetItem?: Item) => {
    const item = targetItem || activeItem;
    if (!item) return;
    try {
      const plainPath = item.filePath || (item.itemPath ? `${item.itemPath}/${item.filename}` : item.shellPath);
      await navigator.clipboard.writeText(plainPath);
      toast.success("已复制文件路径");
    } catch (err) {
      console.error("复制文件路径失败:", err);
    }
  };

  // Toggle Favorite
  const handleToggleFavorite = async (targetItem?: Item) => {
    const item = targetItem || activeItem;
    if (!item) return;
    try {
      const nowFav = await ToggleFavorite(item.id);
      await handleFullRefresh();
      toast.success(nowFav ? "已添加到收藏" : "已取消收藏");
    } catch (err) {
      console.error("切换收藏状态失败:", err);
    }
  };

  // Batch Add to folder
  const handleBatchAddToFolder = async (folderId: string) => {
    try {
      for (const id of selectedItemIds) {
        await AddItemToFolder(id, folderId);
      }
      await handleFullRefresh();
    } catch (err) {
      console.error("批量添加到目录失败:", err);
    }
  };

  // Batch Remove from folder
  const handleBatchRemoveFromFolder = async (folderId: string) => {
    try {
      for (const id of selectedItemIds) {
        await RemoveItemFromFolder(id, folderId);
      }
      await handleFullRefresh();
    } catch (err) {
      console.error("批量移出目录失败:", err);
    }
  };

  // Folder CRUD handlers
  const handleCreateFolder = async (name: string, parentId?: string) => {
    try {
      await CreateFolder(name, parentId || "");
      await refreshFolders();
    } catch (err) {
      console.error("创建文件夹失败:", err);
    }
  };

  const handleRenameFolder = async (folderId: string, name: string) => {
    try {
      await RenameFolder(folderId, name);
      await refreshFolders();
    } catch (err) {
      console.error("重命名文件夹失败:", err);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await DeleteFolder(folderId);
      if (activeFolderId === folderId) {
        setActiveFolderId(null);
      }
      await handleFullRefresh();
    } catch (err) {
      console.error("删除文件夹失败:", err);
    }
  };

  // Sidebar drag = MOVE item to folder
  const handleMoveItemToFolder = async (
    itemId: string,
    fromFolderId: string,
    toFolderId: string
  ) => {
    try {
      await MoveItemToFolder(itemId, fromFolderId, toFolderId);
      await handleFullRefresh();
      toast.success("已移动至指定文件夹");
    } catch (err) {
      console.error("移动资产失败:", err);
    }
  };

  // Sidebar drop = FOLDER-ONLY recursive import
  const handleDropFolderImport = async (e: React.DragEvent, targetFolderId = "") => {
    e.preventDefault();
    e.stopPropagation();

    const folderPaths: string[] = [];
    const folderEntries: any[] = [];

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          const diskPath = (file as any)?.path;
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
        const diskPath = (f as any)?.path;
        if (diskPath && !folderPaths.includes(diskPath)) {
          folderPaths.push(diskPath);
        }
      }
    }

    if (folderPaths.length > 0) {
      try {
        const imported = await ImportFoldersRecursively(folderPaths, targetFolderId);
        if (imported && imported.length > 0) {
          await handleFullRefresh();
          return;
        }
      } catch (err) {
        console.warn("ImportFoldersRecursively failed, fallback to entry reading:", err);
      }
    }

    if (folderEntries.length > 0) {
      for (const entry of folderEntries) {
        await readEntryRecursively(entry, targetFolderId);
      }
      await handleFullRefresh();
      return;
    }

    console.warn("侧边栏仅接受文件夹类型拖入导入");
  };

  const readEntryRecursively = async (entry: any, parentId = "") => {
    if (entry.isDirectory) {
      const createdFolder = await CreateFolder(entry.name, parentId);
      const targetId = createdFolder?.id || "";
      const dirReader = entry.createReader();
      const readEntries = async (): Promise<any[]> => {
        return new Promise((resolve) => {
          dirReader.readEntries((entries: any[]) => resolve(entries || []));
        });
      };
      let batch: any[] = [];
      do {
        batch = await readEntries();
        for (const child of batch) {
          await readEntryRecursively(child, targetId);
        }
      } while (batch.length > 0);
    } else if (entry.isFile) {
      const file: File = await new Promise((resolve) => entry.file(resolve));
      const reader = new FileReader();
      const base64Data = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const imported = await ImportFromBase64(file.name, base64Data);
      if (imported && parentId) {
        await AddItemToFolder(imported.id, parentId);
      }
    }
  };

  // Tag Handlers
  const handleCreateTag = async (name: string) => {
    try {
      await CreateTag(name);
      await refreshTags();
    } catch (err) {
      console.error("创建标签失败:", err);
    }
  };

  const handleDeleteTag = async (name: string) => {
    try {
      await DeleteTag(name);
      if (activeTag === name) {
        setActiveTag(null);
      }
      await handleFullRefresh();
    } catch (err) {
      console.error("删除标签失败:", err);
    }
  };

  const handleAddTagToItem = async (itemId: string, tag: string) => {
    try {
      await AddTagToItem(itemId, tag);
      await handleFullRefresh();
    } catch (err) {
      console.error("添加标签失败:", err);
    }
  };

  const handleRemoveTagFromItem = async (itemId: string, tag: string) => {
    try {
      await RemoveTagFromItem(itemId, tag);
      await handleFullRefresh();
    } catch (err) {
      console.error("移除标签失败:", err);
    }
  };

  // Find active folder metadata
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

  const currentFolder = activeFolderId && activeFolderId !== "__trash__"
    ? findFolderById(folders, activeFolderId)
    : null;
  const totalSizeBytes = filteredItems.reduce((acc, curr) => acc + (curr.size || 0), 0);

  // Global Keyboard shortcuts:
  // - Space: Full-window popup preview
  // - Esc: Close previews, close context menu, clear selection
  // - Cmd+A: Select all
  // - Delete / Backspace: Delete selected
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

      if (e.code === "Space") {
        e.preventDefault();
        if (activeItem) {
          setFullWindowPreviewOpen((prev) => !prev);
        }
      } else if (e.code === "Escape") {
        if (fullWindowPreviewOpen) {
          setFullWindowPreviewOpen(false);
        } else if (inlinePreviewOpen) {
          setInlinePreviewOpen(false);
        } else if (contextMenu) {
          setContextMenu(null);
        } else if (selectedItemIds.size > 0) {
          setSelectedItemIds(new Set());
          setActiveItemId(null);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.code === "KeyA") {
        e.preventDefault();
        setSelectedItemIds(new Set(filteredItems.map((i) => i.id)));
        if (filteredItems.length > 0) {
          setActiveItemId(filteredItems[0].id);
        }
      } else if (e.code === "Backspace" || e.code === "Delete") {
        if (selectedItemIds.size > 0) {
          e.preventDefault();
          handleRequestDelete();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeItem, fullWindowPreviewOpen, inlinePreviewOpen, contextMenu, selectedItemIds, filteredItems]);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <div className="flex h-screen w-screen bg-background text-foreground antialiased select-none overflow-hidden wails-no-drag">
        {/* Hidden File Input for Native File Dialog fallback */}
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

        {/* RESIZABLE LAYOUT: SIDEBAR + TAGS SIDEBAR + MAIN GALLERY WORKSPACE */}
        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full w-full select-none overflow-hidden"
        >
          {sidebarOpen && (
            <>
              <ResizablePanel
                id="sidebar-panel"
                defaultSize={220}
                minSize={180}
                maxSize={400}
                className="min-w-[180px] max-w-[400px]"
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
                    setTagsSidebarOpen((prev) => !prev);
                  }}
                  onSelectFolder={(id) => {
                    setActiveFolderId(id);
                    setActiveTag(null);
                    setTagsSidebarOpen(false);
                    setSelectedItemIds(new Set());
                    setActiveItemId(null);
                    setInlinePreviewOpen(false);
                    setFullWindowPreviewOpen(false);
                  }}
                  onCreateFolder={handleCreateFolder}
                  onRenameFolder={handleRenameFolder}
                  onDeleteFolder={handleDeleteFolder}
                  onMoveItemToFolder={handleMoveItemToFolder}
                  onDropFolderImport={handleDropFolderImport}
                  onDropItemOnTrash={async (ids) => {
                    await BatchMoveToTrash(ids);
                    await handleFullRefresh();
                    toast.success("已移至回收站");
                  }}
                  onCloseLibrary={async () => {
                    await CloseLibrary();
                    onLibraryClosed();
                  }}
                  onLibraryChanged={onLibraryChanged}
                  onToggleCollapse={() => setSidebarOpen(false)}
                />
              </ResizablePanel>
              <ResizableHandle className="w-px bg-border hover:bg-primary/50 transition-colors cursor-col-resize z-20" />

              {/* SECONDARY SIDEBAR: TAGS TAXONOMY */}
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
                      onSelectTag={(t) => {
                        setActiveTag(t);
                        if (t === null) {
                          setActiveFolderId(null);
                          setTagsSidebarOpen(false);
                        } else {
                          setActiveFolderId(null);
                        }
                        setSelectedItemIds(new Set());
                        setActiveItemId(null);
                        setInlinePreviewOpen(false);
                      }}
                      onCreateTag={handleCreateTag}
                      onDeleteTag={handleDeleteTag}
                      onClose={() => {
                        setTagsSidebarOpen(false);
                        setActiveTag(null);
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
              className="relative flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-background"
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
              {/* Semi-transparent stroked motion overlay for main area dropzone */}
              <AnimatePresence>
                {dropState.status === "dragging-over" && !isInternalDragging && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.99 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.99 }}
                    transition={{ duration: 0.15 }}
                    className="absolute inset-0 z-50 pointer-events-none border-4 border-dashed border-primary bg-background/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none shadow-2xl"
                  >
                    <div className="size-16 rounded-2xl bg-primary/15 text-primary flex items-center justify-center mb-3 shadow-md animate-bounce">
                      <Upload className="size-8 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold tracking-tight text-foreground">
                      {currentFolder ? `松开以导入至「${currentFolder.name}」` : "松开以导入至「全部资产」"}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">
                      {currentFolder
                        ? `所选文件及子文件夹将扁平存入目录「${currentFolder.name}」`
                        : "所选文件及子文件夹将直接扁平存入全部资产"}
                    </p>
                    <div className="flex gap-2 mt-3 text-[11px] text-muted-foreground font-mono">
                      <span className="px-2.5 py-1 rounded-md bg-muted/70 border border-border/80 font-medium">自动排重</span>
                      <span className="px-2.5 py-1 rounded-md bg-muted/70 border border-border/80 font-medium">自动建立索引</span>
                      <span className="px-2.5 py-1 rounded-md bg-muted/70 border border-border/80 font-medium">生成缩略图</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Encapsulated Drag & Drop Progress Modal only for external drops */}
              {!isInternalDragging && dropState.status === "importing" && (
                <DropzoneOverlay state={dropState} />
              )}
              {/* INLINE PREVIEW MODAL (Double-click in main area) */}
              {inlinePreviewOpen && activeItem ? (
                <UnifiedPreviewModal
                  open={inlinePreviewOpen}
                  mode="inline"
                  activeItem={activeItem}
                  items={filteredItems}
                  onClose={() => setInlinePreviewOpen(false)}
                  onIndexChange={(newItem) => setActiveItemId(newItem.id)}
                  sidebarOpen={sidebarOpen}
                  onToggleSidebar={() => setSidebarOpen(true)}
                />
              ) : (
                <>
              <header className="w-full bg-background border-b-0 shrink-0 select-none">
                {/* Div 1: Height matches macOS traffic lights row */}
                <div className="h-(--titlebar-height) px-3 flex items-center justify-between">
                  {/* Left: Shared safe prefix + Title + Preview height zoom slider */}
                  <MainHeaderSafePrefix
                    sidebarOpen={sidebarOpen}
                    onToggleSidebar={() => setSidebarOpen(true)}
                  >
                    <span className="font-semibold text-xs tracking-tight truncate text-foreground">
                      {activeFolderId === "__trash__"
                        ? "回收站 (Trash)"
                        : activeTag
                        ? `标签: ${activeTag}`
                        : currentFolder
                        ? currentFolder.name
                        : "All"}
                    </span>

                    {/* Thumbnail row height zoom slider: [-] [slider] [+] */}
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-0.5 ml-2 p-1 -m-1 wails-no-drag slider-control-container select-none"
                    >
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRowHeight((h) => Math.max(60, h - 10));
                        }}
                        className="size-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors wails-no-drag cursor-pointer"
                        title="缩小预览"
                      >
                        <Minus className="size-3 wails-no-drag pointer-events-none" />
                      </button>
                      <div
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="w-16 wails-no-drag py-1"
                      >
                        <Slider
                          min={60}
                          max={200}
                          step={5}
                          value={rowHeight}
                          onValueChange={(val) => setRowHeight(Array.isArray(val) ? val[0] : val)}
                          className="wails-no-drag"
                        />
                      </div>
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRowHeight((h) => Math.min(200, h + 10));
                        }}
                        className="size-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors wails-no-drag cursor-pointer"
                        title="放大预览"
                      >
                        <Plus className="size-3 wails-no-drag pointer-events-none" />
                      </button>
                    </div>
                  </MainHeaderSafePrefix>

                  {/* Center: Window draggable filler */}
                  <div className="flex-1 h-full min-w-4 wails-drag" />

                  {/* Search Input */}
                  <div className="w-[150px] shrink-0 p-1 -m-1 wails-no-drag search-input-container select-text">
                    <div className="relative wails-no-drag">
                      <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search"
                        className="pl-8 pr-7 h-7 text-xs bg-muted/40 border-border/60 rounded-lg focus-visible:bg-background wails-no-drag select-text"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground wails-no-drag cursor-pointer"
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Div 2: Sub-toolbar for category pills, trash actions & size slider */}
                <div className="h-9 px-3 flex items-center justify-between text-xs wails-no-drag">
                  {/* Left: Category pills or active tag pill */}
                  <div className="flex items-center gap-1">
                    {activeTag && (
                      <Badge
                        variant="secondary"
                        className="text-[11px] gap-1 pl-2 pr-1 h-5 mr-1 font-normal bg-primary/10 text-primary border-primary/20"
                      >
                        <TagIcon className="size-2.5" />
                        <span>{activeTag}</span>
                        <button
                          onClick={() => setActiveTag(null)}
                          className="hover:text-destructive p-0.5 rounded cursor-pointer"
                        >
                          <X className="size-2.5" />
                        </button>
                      </Badge>
                    )}

                    {[
                      { id: "all", label: "All" },
                      { id: "image", label: "Images" },
                      { id: "video", label: "Videos" },
                      { id: "document", label: "Docs" },
                      { id: "archive", label: "Archives" },
                      { id: "other", label: "Other" },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setCategoryFilter(cat.id)}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                          categoryFilter === cat.id
                            ? "bg-secondary text-secondary-foreground shadow-2xs font-semibold"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {/* Right controls: Trash action buttons or sort toggle */}
                  <div className="flex items-center gap-2">
                    {activeFolderId === "__trash__" ? (
                      <>
                        {selectedItemIds.size > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => handleRestore()}
                              className="h-6.5 text-[11px] gap-1 text-primary hover:text-primary cursor-pointer"
                            >
                              <RotateCcw className="size-3" />
                              <span>放回原处 ({selectedItemIds.size})</span>
                            </Button>
                            <Button
                              variant="destructive"
                              size="xs"
                              onClick={() => handleRequestDelete()}
                              className="h-6.5 text-[11px] gap-1 cursor-pointer"
                            >
                              <Trash2 className="size-3" />
                              <span>彻底删除 ({selectedItemIds.size})</span>
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
                            <span>清空回收站</span>
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
                      onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-md hover:bg-muted/50 cursor-pointer"
                    >
                      <ArrowUpDown className="size-3" />
                      <span>{sortOrder === "desc" ? "Newest" : "Oldest"}</span>
                    </button>
                  </div>
                </div>
              </header>

              {/* Center Main Scrollable Area with Justified Gallery */}
              <div className="flex-1 overflow-y-auto p-4 wails-no-drag">
                {loading ? (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                    正在载入资产索引...
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-border/50 rounded-2xl max-w-md mx-auto my-8">
                    {activeFolderId === "__trash__" ? (
                      <>
                        <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground mb-3">
                          <Trash2 className="size-6 text-muted-foreground" />
                        </div>
                        <h3 className="font-semibold text-sm mb-1">回收站为空</h3>
                        <p className="text-xs text-muted-foreground">
                          被删除的素材会显示在这里，可以随时放回原处
                        </p>
                      </>
                    ) : activeTag ? (
                      <>
                        <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground mb-3">
                          <TagIcon className="size-6 text-muted-foreground" />
                        </div>
                        <h3 className="font-semibold text-sm mb-1">标签 "{activeTag}" 下暂无素材</h3>
                        <p className="text-xs text-muted-foreground">
                          可通过右键菜单或详细面板为素材添加此标签
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground mb-3">
                          <Upload className="size-6 text-muted-foreground" />
                        </div>
                        <h3 className="font-semibold text-sm mb-1">暂无文件</h3>
                        <p className="text-xs text-muted-foreground mb-4">
                          拖入文件或文件夹即可自动导入
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-xs cursor-pointer"
                        >
                          选择文件导入
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <JustifiedGallery
                    items={filteredItems}
                    selectedItemIds={selectedItemIds}
                    targetRowHeight={rowHeight}
                    onSelectionChange={(newSet, lastItem) => {
                      setSelectedItemIds(newSet);
                      if (lastItem) {
                        setActiveItemId(lastItem.id);
                      } else if (newSet.size === 0) {
                        setActiveItemId(null);
                      }
                    }}
                    onDoubleClickItem={(item) => {
                      setActiveItemId(item.id);
                      setSelectedItemIds(new Set([item.id]));
                      setInlinePreviewOpen(true);
                    }}
                    onDragStartItem={handleDragStart}
                    onItemContextMenu={(e, item) => {
                      if (!selectedItemIds.has(item.id)) {
                        setSelectedItemIds(new Set([item.id]));
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
                </>
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
                      setSelectedItemIds(new Set());
                      setActiveItemId(null);
                    }}
                    onBatchReveal={handleBatchReveal}
                    onBatchDelete={() => handleRequestDelete(undefined, selectedItems)}
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
                    onClose={() => {
                      setSelectedItemIds(new Set());
                      setActiveItemId(null);
                    }}
                    onPreview={() => setFullWindowPreviewOpen(true)}
                    onReveal={() => activeItem && handleReveal(undefined, activeItem.id)}
                    onDelete={() => activeItem && handleRequestDelete(activeItem)}
                    onRestore={() => activeItem && handleRestore(activeItem)}
                    onToggleFavorite={() => activeItem && handleToggleFavorite(activeItem)}
                    onFolderUpdated={handleFullRefresh}
                    onTagsUpdated={handleFullRefresh}
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
          activeItem={activeItem}
          items={filteredItems}
          onClose={() => setFullWindowPreviewOpen(false)}
          onIndexChange={(newItem) => setActiveItemId(newItem.id)}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(true)}
        />

        {/* ENHANCED COMMAND CONTEXT MENU */}
        <CustomContextMenu
          position={contextMenu?.position || null}
          onClose={() => setContextMenu(null)}
          selectedCount={selectedItemIds.size}
          isItemContext={contextMenu?.isItemContext || false}
          activeFolderId={activeFolderId}
          allFolders={folders}
          allTags={tags}
          targetItem={activeItem}
          onPreview={() => setFullWindowPreviewOpen(true)}
          onRename={() => activeItem && handleOpenRename(activeItem)}
          onReveal={handleBatchReveal}
          onOpenWithDefaultApp={() => activeItem && handleOpenDefaultApp(activeItem)}
          onCopyPath={() => activeItem && handleCopyPath(activeItem)}
          onToggleFavorite={() => activeItem && handleToggleFavorite(activeItem)}
          onDelete={() => handleRequestDelete()}
          onRestore={() => handleRestore()}
          onAddToFolder={handleBatchAddToFolder}
          onRemoveFromCurrentFolder={() => {
            if (activeFolderId) handleBatchRemoveFromFolder(activeFolderId);
          }}
          onAddTag={(tag) => activeItem && handleAddTagToItem(activeItem.id, tag)}
          onRemoveTag={(tag) => activeItem && handleRemoveTagFromItem(activeItem.id, tag)}
          onSelectAll={() => {
            setSelectedItemIds(new Set(filteredItems.map((i) => i.id)));
            if (filteredItems.length > 0) setActiveItemId(filteredItems[0].id);
          }}
          onClearSelection={() => {
            setSelectedItemIds(new Set());
            setActiveItemId(null);
          }}
          onImportFiles={() => fileInputRef.current?.click()}
          onCreateFolder={() => handleCreateFolder("新建文件夹")}
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
                  {deleteConfirmDialog.type === "permanent" ? "彻底删除素材" : "删除素材"}
                </DialogTitle>
              </DialogHeader>
              <div className="py-2 text-muted-foreground text-xs leading-relaxed">
                {deleteConfirmDialog.type === "permanent" ? (
                  <p>
                    确定要彻底删除选中的 {deleteConfirmDialog.items.length} 项素材吗？此操作将永久抹除磁盘文件与记录，无法撤销。
                  </p>
                ) : (
                  <p>
                    选中的素材被引用在多个文件夹中。您可以选择仅从当前文件夹移出引用，或将素材丢入回收站：
                  </p>
                )}
              </div>
              <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteConfirmDialog(null)}
                  className="cursor-pointer"
                >
                  取消
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
                      setSelectedItemIds(new Set());
                      setActiveItemId(null);
                      await handleFullRefresh();
                    }}
                  >
                    彻底删除
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
                        setSelectedItemIds(new Set());
                        setActiveItemId(null);
                        await handleFullRefresh();
                      }}
                    >
                      仅从当前文件夹移出
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="cursor-pointer"
                      onClick={async () => {
                        const ids = deleteConfirmDialog.items.map((i) => i.id);
                        await BatchMoveToTrash(ids);
                        setDeleteConfirmDialog(null);
                        setSelectedItemIds(new Set());
                        setActiveItemId(null);
                        await handleFullRefresh();
                      }}
                    >
                      丢到回收站
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
                <DialogTitle className="text-sm font-semibold">重命名素材</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!renameDialog.newName.trim() || !renameDialog.item) return;
                  try {
                    await RenameItem(renameDialog.item.id, renameDialog.newName.trim());
                    setRenameDialog(null);
                    await handleFullRefresh();
                  } catch (err) {
                    console.error("重命名失败:", err);
                  }
                }}
                className="space-y-4 pt-2"
              >
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">新文件名</label>
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
                    取消
                  </Button>
                  <Button type="submit" size="sm" className="cursor-pointer">
                    确定
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
