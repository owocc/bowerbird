import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Search,
  ArrowUpDown,
  Upload,
  X,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SidebarDirectoryTree } from "@/components/SidebarDirectoryTree";
import { JustifiedGallery } from "@/components/JustifiedGallery";
import { ItemDetailPanel } from "@/components/ItemDetailPanel";
import { MultiItemInspector } from "@/components/MultiItemInspector";
import { UnifiedPreviewModal } from "@/components/UnifiedPreviewModal";
import { CustomContextMenu, type ContextMenuPosition } from "@/components/CustomContextMenu";
import { DropzoneOverlay } from "@/components/DropzoneOverlay";
import {
  GetItems,
  DeleteItem,
  RevealInFinder,
  CloseLibrary,
  GetFolders,
  CreateFolder,
  RenameFolder,
  DeleteFolder,
  AddItemToFolder,
  RemoveItemFromFolder,
} from "../../bindings/bowerbird/core/service";
import type { Item, Folder, LibraryInfo } from "../../bindings/bowerbird/core/models";
import { formatBytes, getFileCategory, escapePathForShell } from "@/lib/formatters";
import { useFileDrop } from "@/hooks/useFileDrop";

export interface LibraryWorkspaceProps {
  library: LibraryInfo;
  onLibraryClosed: () => void;
}

export function LibraryWorkspace({ library, onLibraryClosed }: LibraryWorkspaceProps) {
  // Items and folder state
  const [items, setItems] = useState<Item[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Search & Filter & Sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [rowHeight, setRowHeight] = useState<number>(80);

  // Selection & Previews State
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  // Preview modes: Double click -> main inline; Space -> full-window popup
  const [inlinePreviewOpen, setInlinePreviewOpen] = useState(false);
  const [fullWindowPreviewOpen, setFullWindowPreviewOpen] = useState(false);

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

  // Load items from database
  const refreshItems = useCallback(async () => {
    try {
      const data = await GetItems(searchQuery, sortOrder);
      setItems(data || []);
    } catch (err) {
      console.error("加载资产失败:", err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, sortOrder]);

  // Load folders from database
  const refreshFolders = useCallback(async () => {
    try {
      const data = await GetFolders();
      setFolders(data || []);
    } catch (err) {
      console.error("加载文件夹目录失败:", err);
    }
  }, []);

  // Initial & search/sort reload
  useEffect(() => {
    refreshItems();
  }, [refreshItems]);

  useEffect(() => {
    refreshFolders();
  }, [refreshFolders]);

  // Full refresh helper
  const handleFullRefresh = useCallback(async () => {
    await Promise.all([refreshItems(), refreshFolders()]);
  }, [refreshItems, refreshFolders]);

  const activeFolderIdRef = useRef<string | null>(activeFolderId);
  useEffect(() => {
    activeFolderIdRef.current = activeFolderId;
  }, [activeFolderId]);

  // File drop hook (ignoring intra-app drags, auto-assigning newly imported IDs)
  const { state: dropState, importFileList, dragHandlers } = useFileDrop({
    onRefresh: async (newlyImportedIds?: string[]) => {
      const targetFolderId = activeFolderIdRef.current;
      if (targetFolderId && newlyImportedIds && newlyImportedIds.length > 0) {
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

  // Filter items by folder and category
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (activeFolderId !== null) {
        const itemFolders = item.folders || [];
        if (!itemFolders.includes(activeFolderId)) {
          return false;
        }
      }

      if (categoryFilter !== "all") {
        if (getFileCategory(item.extension) !== categoryFilter) {
          return false;
        }
      }

      return true;
    });
  }, [items, activeFolderId, categoryFilter]);

  // Native OS & In-App Drag Start:
  // Prepares physical file paths and RFC URI lists. Native backend hooks (macOS / Windows) intercept
  // the drag session, clear plain text, and inject genuine OS file objects (public.file-url / CF_HDROP)
  // so external programs (Figma, Finder, Explorer) read the original files directly.
  const handleDragStart = (e: React.DragEvent, item: Item) => {
    // If dragged item is part of multi-selection, drag all selected items; otherwise drag only item
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

    // Internal Bowerbird flags
    e.dataTransfer.setData("application/x-bowerbird-internal-drag", "true");
    e.dataTransfer.setData("application/x-bowerbird-item-id", item.id);
    if (isMulti) {
      e.dataTransfer.setData(
        "application/x-bowerbird-item-ids",
        JSON.stringify(targetItems.map((i) => i.id))
      );
    }

    // Raw unescaped physical file paths for OS / external programs
    if (rawPaths.length > 0) {
      e.dataTransfer.setData("text/plain", rawPaths.join("\n"));
      e.dataTransfer.setData("application/x-bowerbird-path", rawPaths[0]);
      e.dataTransfer.setData(
        "application/x-bowerbird-paths",
        JSON.stringify(rawPaths)
      );
    }

    // Standard RFC uri-list
    if (fileUrls.length > 0) {
      e.dataTransfer.setData("text/uri-list", fileUrls.join("\r\n"));
      const mime = item.mimeType || "application/octet-stream";
      e.dataTransfer.setData(
        "DownloadURL",
        `${mime}:${item.filename}:${fileUrls[0]}`
      );
    }

    e.dataTransfer.effectAllowed = "copyMove";
  };

  // Delete item
  const handleDeleteItem = async (e: React.MouseEvent | undefined, id: string) => {
    e?.stopPropagation();
    try {
      await DeleteItem(id);
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (activeItemId === id) {
        setActiveItemId(null);
      }
      await handleFullRefresh();
    } catch (err) {
      console.error("删除资产失败:", err);
    }
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

  // Batch Delete
  const handleBatchDelete = async () => {
    if (selectedItemIds.size === 0) return;
    try {
      for (const id of selectedItemIds) {
        await DeleteItem(id);
      }
      setSelectedItemIds(new Set());
      setActiveItemId(null);
      await handleFullRefresh();
    } catch (err) {
      console.error("批量删除失败:", err);
    }
  };

  // Batch Reveal
  const handleBatchReveal = async () => {
    for (const item of selectedItems.slice(0, 5)) {
      try {
        await RevealInFinder(item.id);
      } catch (err) {
        console.error("在访达中显示失败:", err);
      }
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

  const handleDropItemOnFolder = async (itemId: string, folderId: string) => {
    try {
      await AddItemToFolder(itemId, folderId);
      await handleFullRefresh();
    } catch (err) {
      console.error("添加资产引用至文件夹失败:", err);
    }
  };

  const handleDropExternalFilesOnFolder = async (fileList: FileList, folderId: string) => {
    try {
      const importedIds = await importFileList(fileList);
      if (importedIds && importedIds.length > 0) {
        for (const id of importedIds) {
          await AddItemToFolder(id, folderId);
        }
        await handleFullRefresh();
      }
    } catch (err) {
      console.error("外部文件拖入文件夹失败:", err);
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

  const currentFolder = activeFolderId ? findFolderById(folders, activeFolderId) : null;
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
          handleBatchDelete();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeItem, fullWindowPreviewOpen, inlinePreviewOpen, contextMenu, selectedItemIds, filteredItems]);

  return (
    <SidebarProvider defaultOpen={true}>
      <div
        data-file-drop-target="true"
        className="flex h-screen w-screen bg-background text-foreground antialiased select-none overflow-hidden wails-no-drag"
        {...dragHandlers}
      >
        {/* Hidden file input for manual browse selection */}
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

        {/* Encapsulated Drag & Drop State Overlay for external file drops */}
        <DropzoneOverlay state={dropState} />

        {/* ========================================================= */}
        {/* COLUMN 1: LEFT SIDEBAR DIRECTORY TREE (shadcn/ui Sidebar) */}
        {/* ========================================================= */}
        <SidebarDirectoryTree
          library={library}
          folders={folders}
          activeFolderId={activeFolderId}
          totalItemCount={items.length}
          onSelectFolder={(id) => {
            setActiveFolderId(id);
            setSelectedItemIds(new Set());
            setActiveItemId(null);
            setInlinePreviewOpen(false);
            setFullWindowPreviewOpen(false);
          }}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onDropItemOnFolder={handleDropItemOnFolder}
          onDropExternalFilesOnFolder={handleDropExternalFilesOnFolder}
          onCloseLibrary={async () => {
            await CloseLibrary();
            onLibraryClosed();
          }}
        />

        {/* ========================================================= */}
        {/* COLUMN 2: CENTER MAIN CONTENT (Justified Gallery)          */}
        {/* ========================================================= */}
        <main className="relative flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-background">
          {/* Top Desktop App Navigation Bar */}
          <header className="h-12 border-b border-border/80 bg-background/95 backdrop-blur-md px-4 flex items-center justify-between gap-3 shrink-0 select-none wails-drag">
            {/* Left: View title & count */}
            <div className="flex items-center gap-2.5 min-w-0 wails-no-drag">
              <span className="font-semibold text-xs tracking-tight truncate text-foreground">
                {currentFolder ? currentFolder.name : "全部资产"}
              </span>
              <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 h-4.5">
                {filteredItems.length} 项
              </Badge>
              {selectedItemIds.size > 0 && (
                <Badge variant="default" className="text-[10px] font-mono px-1.5 py-0 h-4.5">
                  已选 {selectedItemIds.size}
                </Badge>
              )}
            </div>

            {/* Center: Search input */}
            <div className="flex-1 max-w-sm mx-2 wails-no-drag">
              <div className="relative">
                <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索名称、格式、指纹..."
                  className="pl-8 pr-7 h-7.5 text-xs bg-muted/40 border-border/70 rounded-lg focus-visible:bg-background"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Right: Import button */}
            <div className="flex items-center gap-2 wails-no-drag">
              <Button
                size="xs"
                onClick={() => fileInputRef.current?.click()}
                className="h-7.5 gap-1.5 text-xs shadow-xs"
              >
                <Upload className="size-3.5" />
                <span>导入文件</span>
              </Button>
            </div>
          </header>

          {/* Sub-toolbar: Category Pills & Size Slider */}
          <div className="h-9 border-b border-border/60 bg-muted/15 px-4 flex items-center justify-between text-xs shrink-0 select-none wails-no-drag">
            {/* Category pills */}
            <div className="flex items-center gap-1">
              {[
                { id: "all", label: "全部" },
                { id: "image", label: "图片" },
                { id: "video", label: "视频" },
                { id: "document", label: "文档" },
                { id: "archive", label: "压缩包" },
                { id: "other", label: "其他" },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                    categoryFilter === cat.id
                      ? "bg-secondary text-secondary-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Right controls: sort toggle and justified row height slider */}
            <div className="flex items-center gap-2.5">
              {dropState.message && (
                <span className="text-[11px] text-primary font-medium animate-pulse font-mono truncate max-w-xs">
                  {dropState.message}
                </span>
              )}

              <button
                onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-md hover:bg-muted/50"
              >
                <ArrowUpDown className="size-3" />
                <span>{sortOrder === "desc" ? "最新导入" : "最早导入"}</span>
              </button>

              {/* Justified row height slider */}
              <div className="flex items-center gap-1.5 pl-2.5 border-l border-border/60">
                <span className="text-[10px] text-muted-foreground font-mono">高度</span>
                <div className="w-20">
                  <Slider
                    min={60}
                    max={200}
                    step={5}
                    value={rowHeight}
                    onValueChange={(val) => setRowHeight(Array.isArray(val) ? val[0] : val)}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">{rowHeight}px</span>
              </div>
            </div>
          </div>

          {/* Center Main Scrollable Area with Justified Gallery & Marquee Selection */}
          <div className="flex-1 overflow-y-auto p-4 wails-no-drag">
            {loading ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                正在载入资产索引...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-border/50 rounded-2xl max-w-md mx-auto my-8">
                <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground mb-3">
                  <Upload className="size-6" />
                </div>
                <h4 className="text-sm font-semibold tracking-tight">暂无资产</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
                  拖拽任意本地文件至此，或按快捷键 <kbd className="px-1 py-0.5 rounded bg-muted border font-mono text-[10px]">Cmd+V</kbd> 粘贴剪贴板图片。
                </p>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 text-xs h-7 gap-1.5"
                >
                  <Upload className="size-3" />
                  <span>选择文件导入</span>
                </Button>
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
                onDragStartItem={(e, item) => handleDragStart(e, item)}
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

          {/* Desktop App Status Footer */}
          <footer className="h-7 border-t border-border/60 bg-muted/20 px-4 flex items-center justify-between text-[10px] text-muted-foreground shrink-0 font-mono select-none wails-no-drag">
            <div className="flex items-center gap-2">
              <Database className="size-3 text-primary" />
              <span>libSQL 就绪</span>
              <span>·</span>
              <span>已展示 {filteredItems.length} 项</span>
              {selectedItemIds.size > 0 && (
                <>
                  <span>·</span>
                  <span className="text-primary font-semibold">已选 {selectedItemIds.size} 项</span>
                </>
              )}
              {totalSizeBytes > 0 && (
                <>
                  <span>·</span>
                  <span>{formatBytes(totalSizeBytes)}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span>双击中间预览 · 空格全屏弹窗 · 右键管理资产</span>
            </div>
          </footer>

          {/* 
            ====================================================================
            INLINE PREVIEW: Double-click preview inside main center column
            ====================================================================
          */}
          {inlinePreviewOpen && activeItem && (
            <UnifiedPreviewModal
              open={inlinePreviewOpen}
              mode="inline"
              activeItem={activeItem}
              items={filteredItems}
              onClose={() => setInlinePreviewOpen(false)}
              onIndexChange={(newItem) => setActiveItemId(newItem.id)}
            />
          )}
        </main>

        {/* ========================================================= */}
        {/* COLUMN 3: RIGHT DETAIL INSPECTOR PANEL                    */}
        {/* Multi-selection inspector when > 1 items selected,        */}
        {/* Single detail panel when 1 item selected,                 */}
        {/* Overview panel when 0 items selected.                     */}
        {/* ========================================================= */}
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
            onBatchDelete={handleBatchDelete}
            onBatchAddToFolder={handleBatchAddToFolder}
            onBatchRemoveFromFolder={
              activeFolderId ? () => handleBatchRemoveFromFolder(activeFolderId) : undefined
            }
          />
        ) : (
          <ItemDetailPanel
            item={activeItem}
            currentFolder={currentFolder}
            allFolders={folders}
            totalItemCount={filteredItems.length}
            totalSizeBytes={totalSizeBytes}
            onClose={() => {
              setSelectedItemIds(new Set());
              setActiveItemId(null);
            }}
            onPreview={() => setFullWindowPreviewOpen(true)}
            onReveal={() => activeItem && handleReveal(undefined, activeItem.id)}
            onDelete={() => activeItem && handleDeleteItem(undefined, activeItem.id)}
            onFolderUpdated={handleFullRefresh}
          />
        )}

        {/* 
          ========================================================================
          FULL-WINDOW POPUP PREVIEW:
          Triggered by Space bar, QuickLook style full-screen modal
          ========================================================================
        */}
        <UnifiedPreviewModal
          open={fullWindowPreviewOpen}
          mode="full-window"
          activeItem={activeItem}
          items={filteredItems}
          onClose={() => setFullWindowPreviewOpen(false)}
          onIndexChange={(newItem) => setActiveItemId(newItem.id)}
        />

        {/* 
          ========================================================================
          CUSTOM CONTEXT MENU:
          Replaces native system context menu for items and background canvas
          ========================================================================
        */}
        <CustomContextMenu
          position={contextMenu?.position || null}
          onClose={() => setContextMenu(null)}
          selectedCount={selectedItemIds.size}
          isItemContext={contextMenu?.isItemContext || false}
          activeFolderId={activeFolderId}
          allFolders={folders}
          onPreview={() => setFullWindowPreviewOpen(true)}
          onReveal={handleBatchReveal}
          onCopyPath={async () => {
            if (activeItem) {
              const path = activeItem.shellPath || escapePathForShell(activeItem.filePath || "");
              await navigator.clipboard.writeText(path);
            }
          }}
          onDelete={handleBatchDelete}
          onAddToFolder={handleBatchAddToFolder}
          onRemoveFromCurrentFolder={() => {
            if (activeFolderId) handleBatchRemoveFromFolder(activeFolderId);
          }}
          onSelectAll={() => {
            setSelectedItemIds(new Set(filteredItems.map((i) => i.id)));
            if (filteredItems.length > 0) setActiveItemId(filteredItems[0].id);
          }}
          onClearSelection={() => {
            setSelectedItemIds(new Set());
            setActiveItemId(null);
          }}
          onImportFiles={() => fileInputRef.current?.click()}
          onCreateFolder={() => {
            // Focus create folder in sidebar
          }}
        />
      </div>
    </SidebarProvider>
  );
}
