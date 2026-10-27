import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { default as Search } from "~icons/ri/search-line";
import { default as ArrowUpDown } from "~icons/ri/arrow-up-down-line";
import { default as Upload } from "~icons/ri/upload-line";
import { default as X } from "~icons/ri/close-line";
import { default as Trash2 } from "~icons/ri/delete-bin-line";
import { default as Minus } from "~icons/ri/subtract-line";
import { default as Plus } from "~icons/ri/add-line";
import { default as RotateCcw } from "~icons/ri/arrow-go-back-line";
import { default as Settings } from "~icons/ri/settings-line";
import { default as TagIcon } from "~icons/ri/price-tag-line";
import { default as FolderIcon } from "~icons/ri/folder-line";
import { default as FolderX } from "~icons/ri/folder-forbid-line";
import { default as History } from "~icons/ri/history-line";
import { default as Check } from "~icons/ri/check-line";
import { default as ChevronDown } from "~icons/ri/arrow-down-s-line";
import { default as ChevronRight } from "~icons/ri/arrow-right-s-line";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
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
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { MainHeaderSafePrefix } from "@/components/MainHeaderSafePrefix";
import { SidebarDirectoryTree } from "@/components/SidebarDirectoryTree";
import { TagsManager } from "@/components/TagsManager";
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
} from "@/components/FilterBar";
import { notifySuccess, notifyError } from "@/lib/notify";
import { SuccessCodes, ErrorCodes } from "@/lib/error-codes";
import {
  GetItem,
  GetTrashItems,
  GetTrashCount,
  GetFolderPreviews,
  GetWorkspaceStats,
  QueryWorkspace,
  BatchMoveToTrash,
  BatchRestoreFromTrash,
  PermanentDeleteItem,
  EmptyTrash,
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
  RevealInFinder,
  CopyItemsToClipboard,
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
import { isDesktopHost } from "@/lib/host-runtime";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  useWorkspaceSearch,
  TRASH_FOLDER_ID,
  UNTAGGED_FOLDER_ID,
  UNCATEGORIZED_FOLDER_ID,
  HISTORY_FOLDER_ID,
  type PreviewMode,
} from "@/lib/workspace-search";
import { buildWorkspaceQuery, type WorkspaceQuery } from "@/lib/workspace-query";
import type { WorkspaceStats } from "../mygo";
import {
  getDragHistory,
  setActiveHistoryLibraryId,
  subscribeDragHistory,
  type DragHistoryEntry,
} from "@/lib/drag-history";
import { useHistoryNavigation } from "@/hooks/useHistoryNavigation";
import { useFileDrop } from "@/hooks/useFileDrop";
import { useTrackpadZoom } from "@/hooks/useTrackpadZoom";
import { useGalleryDisplayPrefs } from "@/lib/gallery-display";
import { UniversalThumbnail } from "@/components/UniversalThumbnail";
import { logDiagnostic } from "@/lib/logger";
import { cn } from "@/lib/utils";

const WORKSPACE_PAGE_SIZE = 200;

// The sidebar owns its width (instead of being a resizable panel) so that it
// cannot drift when the panel layout changes between views.
const SIDEBAR_WIDTH_KEY = "bowerbird.workspace.sidebarWidth";
const SIDEBAR_DEFAULT_WIDTH = 220;
const SIDEBAR_MIN_WIDTH = 220;

function isRealFolderIdValue(id: string | null): id is string {
  return Boolean(id) &&
    id !== TRASH_FOLDER_ID &&
    id !== UNTAGGED_FOLDER_ID &&
    id !== UNCATEGORIZED_FOLDER_ID &&
    id !== HISTORY_FOLDER_ID;
}

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
  const tagsManagerOpen = ws.isTags;
  const categoryFilter = ws.type;
  const sortOrder = ws.sort;
  const layoutMode = ws.layout;
  const colorFilter = ws.color ?? null;
  const folderFilter = ws.filterFolder ?? null;
  const orientationFilter = ws.orientation;
  const sizeFilter = ws.size;
  const hasUrlFilter = ws.hasUrl;
  const hasNoteFilter = ws.hasNote;
  const ratingFilter = ws.rating ?? null;
  const inlinePreviewOpen = ws.preview === "inline";
  const fullWindowPreviewOpen = ws.preview === "full";

  const { prefs: displayPrefs, setPrefs: setDisplayPrefs } =
    useGalleryDisplayPrefs();
  const sidebarOpen = displayPrefs.showSidebar;
  const setSidebarOpen = useCallback(
    (open: boolean | ((value: boolean) => boolean)) => {
      setDisplayPrefs((prev) => ({
        showSidebar:
          typeof open === "function" ? open(prev.showSidebar) : open,
      }));
    },
    [setDisplayPrefs]
  );
  const inspectorOpen = displayPrefs.showInspector;

  // The sidebar used to share a ResizablePanelGroup with the inspector. The tag
  // manager hides the inspector, which changes the set of panels and makes the
  // group re-split the remaining space proportionally — so the sidebar silently
  // changed width when switching views. Owning the width here makes that
  // impossible: it only ever changes when the user drags the divider.
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return Number.isFinite(stored) && stored >= SIDEBAR_MIN_WIDTH
      ? stored
      : SIDEBAR_DEFAULT_WIDTH;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [sidebarWidth]);

  const handleSidebarDividerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const target = event.currentTarget;
      const startX = event.clientX;
      const startWidth = sidebarWidth;
      target.setPointerCapture(event.pointerId);
      const onMove = (moveEvent: PointerEvent) => {
        const max = Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth * 0.4);
        const next = Math.min(
          max,
          Math.max(SIDEBAR_MIN_WIDTH, startWidth + moveEvent.clientX - startX)
        );
        setSidebarWidth(next);
      };
      const onUp = () => {
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onUp);
        document.body.style.cursor = "";
      };
      document.body.style.cursor = "col-resize";
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onUp);
    },
    [sidebarWidth]
  );

  const setInspectorOpen = useCallback(
    (open: boolean | ((value: boolean) => boolean)) => {
      setDisplayPrefs((prev) => ({
        showInspector:
          typeof open === "function" ? open(prev.showInspector) : open,
      }));
    },
    [setDisplayPrefs]
  );

  // The two side panels are treated as one layout unit: the sidebar's collapse
  // button hides *both* the sidebar and the inspector, and brings both back when
  // the layout is already collapsed. They remain independently toggleable from
  // the context menu / display settings — this is only the combined shortcut.
  const layoutCollapsed = !sidebarOpen && !inspectorOpen;
  const toggleLayoutPanels = useCallback(() => {
    const next = layoutCollapsed;
    setDisplayPrefs((prev) => ({
      ...prev,
      showSidebar: next,
      showInspector: next,
    }));
  }, [layoutCollapsed, setDisplayPrefs]);
  const [items, setItems] = useState<Item[]>([]);
  const [trashItems, setTrashItems] = useState<Item[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [trashCount, setTrashCount] = useState<number>(0);
  const [historyEntries, setHistoryEntries] = useState<DragHistoryEntry[]>(() => {
    const libKey = library.id || library.path;
    setActiveHistoryLibraryId(libKey);
    return getDragHistory(libKey);
  });
  const [folderPaletteOpen, setFolderPaletteOpen] = useState(false);
  const [subfoldersCollapsed, setSubfoldersCollapsed] = useState(false);
  const includeSubfolders = displayPrefs.includeSubfolders;
  const setIncludeSubfolders = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setDisplayPrefs((prev) => ({
        includeSubfolders:
          typeof value === "function" ? value(prev.includeSubfolders) : value,
      }));
    },
    [setDisplayPrefs]
  );
  const [dragHoverSubfolderId, setDragHoverSubfolderId] = useState<string | null>(null);
  const draggingItemIdsRef = useRef<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [rowHeight, setRowHeight] = useState<number>(80);
  // Ordered selection queue: earliest selected at index 0, most recently selected at the end.
  const [selectedOrder, setSelectedOrder] = useState<string[]>([]);
  const selectedItemIds = useMemo(() => new Set(selectedOrder), [selectedOrder]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const indexCacheRef = useRef<{
    itemsRef: Item[];
    byId: Map<string, Item>;
    byFolder: Map<string, Item[]>;
    untagged: number;
    uncategorized: number;
    totalActiveBytes: number;
  } | null>(null);
  const itemsVersionRef = useRef<number>(0);
  const galleryViewportRef = useRef<HTMLDivElement>(null);
  const [queryTotal, setQueryTotal] = useState(0);
  const [queryTotalSize, setQueryTotalSize] = useState(0);
  const [workspaceStats, setWorkspaceStats] = useState<WorkspaceStats | null>(null);
  const [folderPreviewMap, setFolderPreviewMap] = useState<
    Map<string, { totalCount: number; previewItems: Item[] }>
  >(() => new Map());
  const [historyItems, setHistoryItems] = useState<Item[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const loadedPagesRef = useRef(1);
  const queryVersionRef = useRef(0);
  const querySignatureRef = useRef("");
  const loadingMoreRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);

  // Folder lookup/descendants are needed by the query builder, so compute them
  // before the first data-loading effect.
  const folderTreeIndex = useMemo(() => {
    const byId = new Map<string, Folder>();
    const descendantsById = new Map<string, Set<string>>();

    const walk = (f: Folder): Set<string> => {
      byId.set(f.id, f);
      const desc = new Set<string>([f.id]);
      if (f.children && f.children.length > 0) {
        for (const ch of f.children) {
          const childSet = walk(ch);
          for (const cid of childSet) {
            desc.add(cid);
          }
        }
      }
      descendantsById.set(f.id, desc);
      return desc;
    };

    for (const root of folders) {
      walk(root);
    }
    return { byId, descendantsById };
  }, [folders]);

  const currentFolder = useMemo(
    () =>
      isRealFolderIdValue(activeFolderId)
        ? folderTreeIndex.byId.get(activeFolderId) ?? null
        : null,
    [activeFolderId, folderTreeIndex]
  );

  const currentSubfolders = useMemo(
    () => currentFolder?.children ?? [],
    [currentFolder]
  );

  const activeFolderMatchSet = useMemo(() => {
    if (!currentFolder) return null;
    if (includeSubfolders) {
      return (
        folderTreeIndex.descendantsById.get(currentFolder.id) ??
        new Set<string>([currentFolder.id])
      );
    }
    return new Set<string>([currentFolder.id]);
  }, [currentFolder, includeSubfolders, folderTreeIndex]);

  // Enable trackpad 2-finger pinch zoom on the main gallery viewport
  useTrackpadZoom({
    containerRef: galleryViewportRef,
    min: 60,
    max: 240,
    enabled: !inlinePreviewOpen && !fullWindowPreviewOpen,
    onChange: setRowHeight,
  });

  const previewPushedRef = useRef(false);

  const navStartTsRef = useRef<number>(0);

  const navigateToFolder = (id: string | null) => {
    navStartTsRef.current = performance.now();
    if (id === null) ws.selectAll();
    else if (id === TRASH_FOLDER_ID) ws.selectTrash();
    else if (id === UNTAGGED_FOLDER_ID) ws.selectUntagged();
    else if (id === UNCATEGORIZED_FOLDER_ID) ws.selectUncategorized();
    else if (id === HISTORY_FOLDER_ID) ws.selectHistory();
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

  const [emptyTrashConfirmOpen, setEmptyTrashConfirmOpen] = useState(false);
  const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);
  const [renameDialog, setRenameDialog] = useState<{
    isOpen: boolean;
    item: Item | null;
    newName: string;
  } | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    position: ContextMenuPosition;
    targetType: "file" | "folder" | "general";
    targetItem?: Item | null;
    targetFolder?: Folder | null;
  } | null>(null);

  const [folderCreateDialog, setFolderCreateDialog] = useState<{
    open: boolean;
    parentId?: string;
  }>({ open: false });
  const [folderCreateName, setFolderCreateName] = useState("");

  const [folderRenameDialog, setFolderRenameDialog] = useState<{
    open: boolean;
    folder: Folder | null;
    newName: string;
  }>({ open: false, folder: null, newName: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const disableContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener("contextmenu", disableContextMenu);
    return () => window.removeEventListener("contextmenu", disableContextMenu);
  }, []);

  const isTrashView = activeFolderId === TRASH_FOLDER_ID;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), 150);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const workspaceQuery = useMemo<WorkspaceQuery>(
    () =>
      buildWorkspaceQuery({
        search: debouncedSearch,
        activeFolderId,
        includeSubfolders,
        activeFolderMatchSet,
        activeTag,
        category: categoryFilter,
        folderFilter,
        orientation: orientationFilter,
        color: colorFilter,
        size: sizeFilter,
        hasUrl: hasUrlFilter,
        hasNote: hasNoteFilter,
        rating: ratingFilter,
      }),
    [
      debouncedSearch,
      activeFolderId,
      includeSubfolders,
      activeFolderMatchSet,
      activeTag,
      categoryFilter,
      folderFilter,
      orientationFilter,
      colorFilter,
      sizeFilter,
      hasUrlFilter,
      hasNoteFilter,
      ratingFilter,
    ]
  );

  querySignatureRef.current = workspaceQuery.signature;

  const fetchWorkspacePages = useCallback(
    async (params: WorkspaceQuery, pageCount: number) => {
      const version = ++queryVersionRef.current;
      const t0 = performance.now();
      const pages = await Promise.all(
        Array.from({ length: Math.max(1, pageCount) }, (_, pageIndex) =>
          QueryWorkspace(
            params.query,
            sortOrder,
            pageIndex * WORKSPACE_PAGE_SIZE,
            WORKSPACE_PAGE_SIZE,
            params.folderScope,
            params.onlyUnrated
          )
        )
      );
      if (version !== queryVersionRef.current) return;
      const merged: Item[] = [];
      const seen = new Set<string>();
      for (const page of pages) {
        for (const item of page?.items ?? []) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }
      }
      setItems(merged);
      setQueryTotal(pages[0]?.total ?? 0);
      setQueryTotalSize(pages[0]?.totalSize ?? 0);
      loadedPagesRef.current = Math.max(1, Math.ceil(merged.length / WORKSPACE_PAGE_SIZE));
      const dur = performance.now() - t0;
      if (dur >= 25 || merged.length === 0) {
        logDiagnostic(
          "perf",
          "perf",
          "Loaded library items",
          `count=${merged.length} total=${pages[0]?.total ?? 0} pages=${pages.length} sort=${sortOrder}`,
          dur
        );
      }
    },
    [sortOrder]
  );

  const refreshActiveItems = useCallback(async () => {
    try {
      await fetchWorkspacePages(workspaceQuery, 1);
    } catch (err) {
      console.error("Failed to load items:", err);
      logDiagnostic("error", "ui", "Failed to load items", String(err), 0);
    } finally {
      setLoading(false);
    }
  }, [fetchWorkspacePages, workspaceQuery]);

  const refreshActiveWindow = useCallback(async () => {
    try {
      await fetchWorkspacePages(
        workspaceQuery,
        Math.max(1, loadedPagesRef.current)
      );
    } catch (err) {
      console.error("Failed to refresh items:", err);
      logDiagnostic("error", "ui", "Failed to refresh items", String(err), 0);
    }
  }, [fetchWorkspacePages, workspaceQuery]);

  // Right after a library switch the backend may still be repopulating its
  // in-memory index, in which case the very first read legitimately reports an
  // empty library. Retry a few times (cheap: one pass over the index) so the
  // sidebar counts settle on the real numbers instead of staying at 0.
  const refreshWorkspaceStats = useCallback(
    async (attempt = 0): Promise<void> => {
      try {
        const stats = await GetWorkspaceStats(sortOrder);
        if (!stats) return;
        setWorkspaceStats(stats);
        const looksEmpty = (stats.total ?? 0) === 0;
        if (looksEmpty && attempt < 5) {
          window.setTimeout(() => {
            void refreshWorkspaceStats(attempt + 1);
          }, 120 * (attempt + 1));
        }
      } catch (err) {
        console.error("Failed to load workspace stats:", err);
      }
    },
    [sortOrder]
  );

  // Coalesce bursts of upsert/trash events into one window refresh instead of
  // re-running the query for every item.
  const scheduleActiveRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      setRefreshToken((v) => v + 1);
    }, 150);
  }, []);

  const loadMoreActive = useCallback(async () => {
    if (
      loadingMoreRef.current ||
      items.length >= queryTotal ||
      workspaceQuery.signature !== querySignatureRef.current
    ) {
      return;
    }
    loadingMoreRef.current = true;
    const version = queryVersionRef.current;
    const offset = items.length;
    try {
      const page = await QueryWorkspace(
        workspaceQuery.query,
        sortOrder,
        offset,
        WORKSPACE_PAGE_SIZE,
        workspaceQuery.folderScope,
        workspaceQuery.onlyUnrated
      );
      if (version !== queryVersionRef.current) return;
      if (!page) return;
      setItems((prev) => {
        const seen = new Set(prev.map((it) => it.id));
        const next = [...prev];
        for (const item of page.items ?? []) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            next.push(item);
          }
        }
        loadedPagesRef.current = Math.max(
          1,
          Math.ceil(next.length / WORKSPACE_PAGE_SIZE)
        );
        return next;
      });
      setQueryTotal(page.total ?? 0);
      setQueryTotalSize(page.totalSize ?? 0);
    } catch (err) {
      console.error("Failed to load more items:", err);
      logDiagnostic("error", "ui", "Failed to load more items", String(err), 0);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [items.length, queryTotal, workspaceQuery, sortOrder]);

  const refreshTrashItems = useCallback(async () => {
    const t0 = performance.now();
    try {
      const data = await GetTrashItems("", sortOrder);
      const list = data || [];
      setTrashItems(list);
      setTrashCount(list.length);
      const dur = performance.now() - t0;
      if (dur >= 25) {
        logDiagnostic("perf", "perf", "Loaded trash items", `count=${list.length} sort=${sortOrder}`, dur);
      }
    } catch (err) {
      console.error("Failed to load trash items:", err);
      logDiagnostic("error", "ui", "Failed to load trash items", String(err), 0);
    }
  }, [sortOrder]);

  const refreshItems = useCallback(async () => {
    if (!isTrashView && activeFolderId !== HISTORY_FOLDER_ID) {
      await refreshActiveItems();
    }
    if (isTrashView) {
      await refreshTrashItems();
    }
  }, [
    refreshActiveItems,
    refreshTrashItems,
    isTrashView,
    activeFolderId,
  ]);

  const handleItemUpdatedInPlace = useCallback(
    (updated?: Item) => {
      if (updated && updated.id) {
        setItems((prev) =>
          prev.map((it) => (it.id === updated.id ? updated : it))
        );
        setTrashItems((prev) =>
          prev.map((it) => (it.id === updated.id ? updated : it))
        );
        // The update may change filter membership (tags/folders/rating), so
        // re-run the loaded window shortly after the optimistic paint.
        scheduleActiveRefresh();
        return;
      }
      void refreshItems();
    },
    [refreshItems, scheduleActiveRefresh]
  );
  // Merge newly imported or updated items directly into React state in O(N) without re-fetching 37k+ items over IPC
  const handleItemsUpsertedInPlace = useCallback(
    (upsertedList: Item[], extraFolderId?: string | null) => {
      if (!upsertedList || upsertedList.length === 0) return;
      const cleanFolderId =
        extraFolderId &&
        extraFolderId !== TRASH_FOLDER_ID &&
        extraFolderId !== UNTAGGED_FOLDER_ID &&
        extraFolderId !== UNCATEGORIZED_FOLDER_ID &&
        extraFolderId !== HISTORY_FOLDER_ID
          ? extraFolderId
          : null;

      const tUpsert0 = performance.now();
      setItems((prev) => {
        const byId = new Map<string, Item>();
        for (const u of upsertedList) {
          if (!u || !u.id || u.inTrash) continue;
          const nextFolders = cleanFolderId
            ? Array.from(new Set([...(u.folders || []), cleanFolderId]))
            : u.folders || [];
          byId.set(u.id, { ...u, folders: nextFolders });
        }
        if (byId.size === 0) return prev;

        let anyUpdated = false;
        let seen: Set<string> | null = null;
        for (let i = 0; i < prev.length; i++) {
          if (byId.has(prev[i].id)) {
            anyUpdated = true;
            break;
          }
        }

        let baseList = prev;
        if (anyUpdated) {
          seen = new Set<string>();
          baseList = prev.map((it) => {
            const upd = byId.get(it.id);
            if (upd) {
              seen!.add(it.id);
              const mergedFolders =
                upd.folders && upd.folders.length > 0
                  ? Array.from(new Set([...(it.folders || []), ...upd.folders]))
                  : it.folders || [];
              const mergedTags =
                upd.tags && upd.tags.length > 0
                  ? Array.from(new Set([...(it.tags || []), ...upd.tags]))
                  : it.tags || [];
              return { ...it, ...upd, folders: mergedFolders, tags: mergedTags };
            }
            return it;
          });
        }

        const brandNew: Item[] = [];
        for (const [id, it] of byId.entries()) {
          if (!seen || !seen.has(id)) {
            brandNew.push(it);
          }
        }
        const nextList =
          brandNew.length === 0
            ? baseList
            : sortOrder === "asc"
            ? [...baseList, ...brandNew]
            : [...brandNew, ...baseList];
        logDiagnostic(
          "perf",
          "perf",
          "React state handleItemsUpsertedInPlace",
          `upserted=${upsertedList.length} brandNew=${brandNew.length} anyUpdated=${anyUpdated} totalItems=${nextList.length}`,
          Math.round(performance.now() - tUpsert0)
        );
        return nextList;
      });
      scheduleActiveRefresh();
    },
    [sortOrder, scheduleActiveRefresh]
  );

  // Optimistically move items from active list to trash in 0ms without re-fetching 37k+ items
  const applyOptimisticMoveToTrash = useCallback((ids: string[]) => {
    if (!ids || ids.length === 0) return;
    const tTrash0 = performance.now();
    const removeSet = new Set(ids);
    setSelectedOrder((prev) => prev.filter((id) => !removeSet.has(id)));
    setActiveItemId((prev) => (prev && removeSet.has(prev) ? null : prev));

    const nowSec = Math.floor(Date.now() / 1000);
    const trashedNow: Item[] = [];
    const byId = indexCacheRef.current?.byId;
    for (const id of ids) {
      const it = byId?.get(id);
      if (it) {
        trashedNow.push({ ...it, inTrash: true, trashedAt: nowSec });
      }
    }
    if (trashedNow.length > 0) {
      setTrashItems((tPrev) => [...trashedNow, ...tPrev]);
      setTrashCount((c) => c + trashedNow.length);
    }
    setItems((prev) => {
      const remaining = prev.filter((it) => !removeSet.has(it.id));
      logDiagnostic(
        "perf",
        "perf",
        "Optimistic move to trash state update",
        `removed=${removeSet.size} remaining=${remaining.length}`,
        Math.round(performance.now() - tTrash0)
      );
      return remaining;
    });
    if (!isTrashView) {
      setQueryTotal((prev) => Math.max(0, prev - removeSet.size));
    }
    scheduleActiveRefresh();
  }, [scheduleActiveRefresh, isTrashView]);
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
    if (isTrashView || activeFolderId === HISTORY_FOLDER_ID) {
      setLoading(false);
      return;
    }
    void refreshActiveItems();
  }, [refreshActiveItems, isTrashView, activeFolderId]);

  // Event-driven refresh: re-run the loaded window after the 150ms coalescing
  // timer, keeping the user's scroll depth instead of snapping back to page 1.
  useEffect(() => {
    if (refreshToken === 0) return;
    if (isTrashView) {
      void refreshTrashItems();
      void refreshFolders();
      void refreshTrashCount();
      return;
    }
    if (activeFolderId === HISTORY_FOLDER_ID) {
      void refreshWorkspaceStats();
      return;
    }
    void refreshActiveWindow();
    void refreshWorkspaceStats();
    void refreshFolders();
    void refreshTrashCount();
    // Only a new refresh token should trigger this pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  useEffect(() => {
    void refreshWorkspaceStats();
  }, [refreshWorkspaceStats]);

  useEffect(() => {
    if (isTrashView) {
      void refreshTrashItems();
    }
  }, [isTrashView, refreshTrashItems]);
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
      setDragHoverSubfolderId(null);
      draggingItemIdsRef.current = [];
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

  useEffect(() => {
    const libKey = library.id || library.path;
    setActiveHistoryLibraryId(libKey);
    setHistoryEntries(getDragHistory(libKey));
    return subscribeDragHistory((entries) => {
      setHistoryEntries(entries);
    });
  }, [library.id, library.path]);

  // History is a short list that may point past the loaded page window, so
  // resolve it by ID instead of depending on the whole library being in memory.
  useEffect(() => {
    let cancelled = false;
    const ids = Array.from(new Set(historyEntries.map((entry) => entry.itemId)));
    if (ids.length === 0) {
      setHistoryItems([]);
      return;
    }
    void Promise.all(
      ids.map((id) =>
        GetItem(id).catch(() => null)
      )
    ).then((resolved) => {
      if (cancelled) return;
      const byId = new Map<string, Item>();
      for (const item of resolved) {
        if (item && !item.inTrash) byId.set(item.id, item);
      }
      const ordered: Item[] = [];
      for (const entry of historyEntries) {
        const item = byId.get(entry.itemId);
        if (item) ordered.push(item);
      }
      setHistoryItems(ordered);
    });
    return () => {
      cancelled = true;
    };
  }, [historyEntries, refreshToken, library.path]);

  // Subfolder covers are first 4 items + full count per folder scope, computed
  // in core so the renderer never needs the whole library.
  useEffect(() => {
    let cancelled = false;
    if (currentSubfolders.length === 0) {
      setFolderPreviewMap(new Map());
      return;
    }
    const groups = currentSubfolders.map((sub) =>
      Array.from(
        folderTreeIndex.descendantsById.get(sub.id) ?? new Set<string>([sub.id])
      )
    );
    void GetFolderPreviews(groups, sortOrder)
      .then((previews) => {
        if (cancelled) return;
        const map = new Map<
          string,
          { totalCount: number; previewItems: Item[] }
        >();
        currentSubfolders.forEach((sub, index) => {
          const preview = previews?.[index];
          if (preview) {
            map.set(sub.id, {
              totalCount: preview.total,
              previewItems: preview.items ?? [],
            });
          }
        });
        setFolderPreviewMap(map);
      })
      .catch((err) => {
        console.error("Failed to load folder previews:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [
    currentSubfolders,
    folderTreeIndex,
    sortOrder,
    refreshToken,
    library.path,
  ]);

  useEffect(() => {
    if (isTrashView || activeFolderId === HISTORY_FOLDER_ID) return;
    const el = galleryViewportRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 900) {
        void loadMoreActive();
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [isTrashView, activeFolderId, loadMoreActive]);

  // If the first page does not fill the viewport, keep fetching until it does.
  useEffect(() => {
    if (
      loading ||
      isTrashView ||
      activeFolderId === HISTORY_FOLDER_ID ||
      items.length >= queryTotal
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      const el = galleryViewportRef.current;
      if (el && el.scrollHeight <= el.clientHeight + 200) {
        void loadMoreActive();
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [
    loading,
    isTrashView,
    activeFolderId,
    items.length,
    queryTotal,
    loadMoreActive,
  ]);

  // Switching libraries must not leave anything behind: every per-library slice
  // is cleared and re-primed from the newly opened library's index.
  const previousLibraryPathRef = useRef(library.path);
  useEffect(() => {
    if (previousLibraryPathRef.current === library.path) return;
    previousLibraryPathRef.current = library.path;

    // Invalidate in-flight work so a late response from the old library cannot
    // write into the new library's state.
    queryVersionRef.current++;
    querySignatureRef.current = "";
    itemsVersionRef.current = 0;
    loadingMoreRef.current = false;
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    setSelectedOrder([]);
    setActiveItemId(null);
    setTrashItems([]);
    setItems([]);
    setHistoryItems([]);
    setFolders([]);
    setTags([]);
    setTrashCount(0);
    setQueryTotal(0);
    setQueryTotalSize(0);
    setWorkspaceStats(null);
    setFolderPreviewMap(new Map());
    setSearchQuery("");
    loadedPagesRef.current = 1;
    setLoading(true);
    previewPushedRef.current = false;
    ws.reset();

    // Sidebar/filter aggregates. This used to be missing here, so a freshly
    // switched library showed 0/0/0 until some other event happened to refresh
    // them. Prime them together with the rest of the first paint.
    void refreshWorkspaceStats();
    void refreshActiveItems();
    void refreshFolders();
    void refreshTags();
    void refreshTrashCount();
    // `ws` is stable across renders (workspace-search state machine).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.path, refreshWorkspaceStats, refreshActiveItems, refreshFolders, refreshTags, refreshTrashCount]);

  const isRealFolderId = (id: string | null): id is string =>
    Boolean(id) &&
    id !== TRASH_FOLDER_ID &&
    id !== UNTAGGED_FOLDER_ID &&
    id !== UNCATEGORIZED_FOLDER_ID &&
    id !== HISTORY_FOLDER_ID;

  const activeFolderIdRef = useRef<string | null>(activeFolderId);
  useEffect(() => {
    activeFolderIdRef.current = activeFolderId;
    if (galleryViewportRef.current) {
      galleryViewportRef.current.scrollTop = 0;
    }
  }, [activeFolderId]);
  const { state: dropState, importFileList, dragHandlers } = useFileDrop({
    onRefresh: async (newlyImportedIds?: string[], newlyImportedItems?: Item[]) => {
      const targetFolderId = activeFolderIdRef.current;
      const validFolderId = isRealFolderId(targetFolderId) ? targetFolderId : null;
      if (validFolderId && newlyImportedIds && newlyImportedIds.length > 0) {
        for (const id of newlyImportedIds) {
          try {
            await AddItemToFolder(id, validFolderId);
          } catch (err) {
            console.error("Failed to add item to current folder:", err);
          }
        }
      }

      if (newlyImportedItems && newlyImportedItems.length > 0) {
        flushSync(() => {
          handleItemsUpsertedInPlace(newlyImportedItems, validFolderId);
        });
        const hasAnyFolder =
          newlyImportedItems.some((it) => it.folders && it.folders.length > 0);
        const hasAnyTag = newlyImportedItems.some(
          (it) => it.tags && it.tags.length > 0
        );
        if (hasAnyFolder || hasAnyTag) {
          window.setTimeout(() => {
            if (hasAnyFolder) void refreshFolders();
            if (hasAnyTag) void refreshTags();
          }, 120);
        }
        return;
      }
      await handleFullRefresh();
    },
    onItemsUpserted: (upsertedItems) => {
      handleItemsUpsertedInPlace(upsertedItems);
    },
    onItemsTrashed: (trashedIds) => {
      applyOptimisticMoveToTrash(trashedIds);
      void refreshFolders();
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

  // Incremental O(1) index cache for 37,000+ / 100,000+ items:
  // When a single screenshot/file is prepended, deleted, or updated, update the existing Map/counts
  // in O(1) instead of rebuilding a 37,000-entry Map and 37,000-entry folder index from scratch!
  const { activeItemsById } = useMemo(() => {
    const tIdx0 = performance.now();
    const prev = indexCacheRef.current;
    const len = items.length;

    // Fast path: 1..16 new items prepended or 1..16 items deleted
    if (prev && prev.itemsRef.length > 0) {
      const delta = len - prev.itemsRef.length;
      if (
        delta > 0 &&
        delta <= 16 &&
        items[delta] === prev.itemsRef[0]
      ) {
        let canFastPrepend = true;
        for (let i = 0; i < delta; i++) {
          if (prev.byId.has(items[i].id)) {
            canFastPrepend = false;
            break;
          }
        }
        if (canFastPrepend) {
          const byId = prev.byId;
          const byFolder = prev.byFolder;
          let untagged = prev.untagged;
          let uncategorized = prev.uncategorized;
          let totalBytes = prev.totalActiveBytes;

          for (let i = delta - 1; i >= 0; i--) {
            const it = items[i];
            byId.set(it.id, it);
            totalBytes += it.size || 0;
            if (!it.tags || it.tags.length === 0) untagged++;
            const fids = it.folders;
            if (!fids || fids.length === 0) {
              uncategorized++;
            } else {
              for (let f = 0; f < fids.length; f++) {
                const fid = fids[f];
                const existingList = byFolder.get(fid);
                byFolder.set(fid, existingList ? [it, ...existingList] : [it]);
              }
            }
          }
          indexCacheRef.current = {
            itemsRef: items,
            byId,
            byFolder,
            untagged,
            uncategorized,
            totalActiveBytes: totalBytes,
          };
          return {
            activeItemsById: byId,
            itemsByFolderId: byFolder,
            untaggedCount: untagged,
            uncategorizedCount: uncategorized,
            totalActiveBytes: totalBytes,
          };
        }
      } else if (delta < 0 && delta >= -16) {
        // Fast path for deletion: identify the 1..16 removed items via two-pointer scan
        let p1 = 0, p2 = 0;
        const removedItems: Item[] = [];
        while (p1 < prev.itemsRef.length && p2 < items.length) {
          if (prev.itemsRef[p1] === items[p2]) {
            p1++; p2++;
          } else {
            removedItems.push(prev.itemsRef[p1]);
            p1++;
          }
        }
        while (p1 < prev.itemsRef.length) {
          removedItems.push(prev.itemsRef[p1++]);
        }
        if (removedItems.length === -delta) {
          const byId = prev.byId;
          const byFolder = prev.byFolder;
          let untagged = prev.untagged;
          let uncategorized = prev.uncategorized;
          let totalBytes = prev.totalActiveBytes;

          for (const rem of removedItems) {
            byId.delete(rem.id);
            totalBytes = Math.max(0, totalBytes - (rem.size || 0));
            if (!rem.tags || rem.tags.length === 0) untagged = Math.max(0, untagged - 1);
            const fids = rem.folders;
            if (!fids || fids.length === 0) {
              uncategorized = Math.max(0, uncategorized - 1);
            } else {
              for (let f = 0; f < fids.length; f++) {
                const fid = fids[f];
                const list = byFolder.get(fid);
                if (list && list.length > 0) {
                  byFolder.set(fid, list.filter((it) => it.id !== rem.id));
                }
              }
            }
          }
          indexCacheRef.current = {
            itemsRef: items,
            byId,
            byFolder,
            untagged,
            uncategorized,
            totalActiveBytes: totalBytes,
          };
          return {
            activeItemsById: byId,
            itemsByFolderId: byFolder,
            untaggedCount: untagged,
            uncategorizedCount: uncategorized,
            totalActiveBytes: totalBytes,
          };
        }
      }
    }

    const byId = new Map<string, Item>();
    const byFolder = new Map<string, Item[]>();
    let untagged = 0;
    let uncategorized = 0;
    let totalBytes = 0;

    for (let i = 0; i < len; i++) {
      const it = items[i];
      byId.set(it.id, it);
      totalBytes += it.size || 0;
      const tgs = it.tags;
      if (!tgs || tgs.length === 0) {
        untagged++;
      }

      const fids = it.folders;
      if (!fids || fids.length === 0) {
        uncategorized++;
      } else {
        for (let f = 0; f < fids.length; f++) {
          const fid = fids[f];
          let list = byFolder.get(fid);
          if (!list) {
            list = [];
            byFolder.set(fid, list);
          }
          list.push(it);
        }
      }
    }

    indexCacheRef.current = {
      itemsRef: items,
      byId,
      byFolder,
      untagged,
      uncategorized,
      totalActiveBytes: totalBytes,
    };

    const idxDur = performance.now() - tIdx0;
    if (idxDur >= 10) {
      logDiagnostic(
        "perf",
        "perf",
        "Full item index rebuilt",
        `items=${len} folders=${byFolder.size}`,
        Math.round(idxDur)
      );
    }

    return {
      activeItemsById: byId,
      itemsByFolderId: byFolder,
      untaggedCount: untagged,
      uncategorizedCount: uncategorized,
      totalActiveBytes: totalBytes,
    };
  }, [items]);

  // Extract top 8 dominant colors once per library/view switch (sampled on first 1,000 items)
  // so FilterBar never receives the 37,000-element items array prop!
  const libraryTopColors = useMemo(() => {
    if (!isTrashView) return workspaceStats?.topColors ?? [];
    const source = trashItems;
    if (source.length === 0) return [];
    const counts: Record<string, number> = {};
    const limit = Math.min(source.length, 1000);
    for (let i = 0; i < limit; i++) {
      const hex = source[i]?.dominantColor;
      if (hex) {
        const upper = hex.toUpperCase();
        counts[upper] = (counts[upper] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([hex]) => hex);
  }, [isTrashView, trashItems, workspaceStats]);

  // Fast lookup map for O(1) resolution of selectedOrder -> Item[] in current view
  const itemsById = useMemo(() => {
    const map = new Map<string, Item>(activeItemsById);
    for (const it of trashItems) {
      map.set(it.id, it);
    }
    for (const it of historyItems) {
      map.set(it.id, it);
    }
    return map;
  }, [activeItemsById, trashItems, historyItems]);
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

  // Multi-dimensional filtering: instant in-memory search + sidebar folder/tag + FilterBar (type, color, tag, folder, orientation)
  const normalizedQuery = useMemo(
    () => searchQuery.trim().toLowerCase(),
    [searchQuery]
  );

  // Counts come from GetWorkspaceStats; only trash/history still filter locally.
  const flatFolderList = useMemo(() => {
    if (!folderPaletteOpen) return [];
    const out: { id: string; name: string; count: number }[] = [];
    const walk = (list: Folder[], prefix = "") => {
      for (const f of list) {
        const display = prefix ? `${prefix} / ${f.name}` : f.name;
        out.push({ id: f.id, name: display, count: f.itemCount ?? 0 });
        if (f.children && f.children.length > 0) {
          walk(f.children, display);
        }
      }
    };
    walk(folders);
    return out;
  }, [folders, folderPaletteOpen]);
  // Precompute O(1) folder lookup map and descendant folder ID sets once per folders tree change
  // (computed near the top so the query builder can use it).

  const subfolderPreviewData = useMemo(() => {
    const map = new Map<string, { totalCount: number; previewItems: Item[] }>();
    if (currentSubfolders.length === 0) return map;
    for (const sub of currentSubfolders) {
      const preview = folderPreviewMap.get(sub.id);
      if (preview) map.set(sub.id, preview);
    }
    return map;
  }, [currentSubfolders, folderPreviewMap]);

  const filteredItems = useMemo(() => {
    // Active-library browsing/search/filter/sort is fully server-side now.
    if (
      activeFolderId !== TRASH_FOLDER_ID &&
      activeFolderId !== HISTORY_FOLDER_ID
    ) {
      return items;
    }

    const sourceItems: Item[] =
      activeFolderId === TRASH_FOLDER_ID
        ? trashItems
        : sortOrder === "asc"
        ? [...historyItems].reverse()
        : historyItems;
    const hasExtraFilters =
      Boolean(normalizedQuery) ||
      Boolean(activeTag) ||
      categoryFilter !== "all" ||
      Boolean(folderFilter) ||
      orientationFilter !== "all" ||
      Boolean(colorFilter) ||
      sizeFilter !== "all" ||
      hasUrlFilter !== "all" ||
      hasNoteFilter !== "all" ||
      ratingFilter !== null;
    if (!hasExtraFilters) {
      return sourceItems;
    }

    return sourceItems.filter((item) => {
      if (normalizedQuery) {
        const matchesName = item.name?.toLowerCase().includes(normalizedQuery);
        const matchesExt = item.extension?.toLowerCase().includes(normalizedQuery);
        const matchesHex = item.hex?.toLowerCase().includes(normalizedQuery);
        const matchesNote = item.note?.toLowerCase().includes(normalizedQuery);
        const matchesPrompt = item.prompt?.toLowerCase().includes(normalizedQuery);
        const matchesTag = (item.tags || []).some((t) =>
          t.toLowerCase().includes(normalizedQuery)
        );
        if (
          !matchesName &&
          !matchesExt &&
          !matchesHex &&
          !matchesNote &&
          !matchesPrompt &&
          !matchesTag
        ) {
          return false;
        }
      }

      // A tag picked in the tag manager narrows the "all" view to it.
      if (activeFolderId !== TRASH_FOLDER_ID && activeTag !== null) {
        if (!(item.tags || []).includes(activeTag)) {
          return false;
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

      // 3. Orientation filter
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

      // 4. Color filter
      if (colorFilter) {
        if (!itemMatchesColorFilter(item, colorFilter)) {
          return false;
        }
      }

      // 5. File Size filter
      if (sizeFilter !== "all") {
        const sz = item.size || 0;
        const ONE_MB = 1024 * 1024;
        const TEN_MB = 10 * ONE_MB;
        if (sizeFilter === "small" && sz >= ONE_MB) return false;
        if (sizeFilter === "medium" && (sz < ONE_MB || sz > TEN_MB)) return false;
        if (sizeFilter === "large" && sz <= TEN_MB) return false;
      }

      // 6. URL presence filter
      if (hasUrlFilter !== "all") {
        const hasLink = Boolean(item.url && item.url.trim().length > 0);
        if (hasUrlFilter === "has" && !hasLink) return false;
        if (hasUrlFilter === "empty" && hasLink) return false;
      }

      // 7. Notes presence filter
      if (hasNoteFilter !== "all") {
        const hasNote = Boolean(item.note && item.note.trim().length > 0);
        if (hasNoteFilter === "has" && !hasNote) return false;
        if (hasNoteFilter === "empty" && hasNote) return false;
      }

      // 8. Star Rating filter
      if (ratingFilter !== null) {
        const itemRating = item.rating || 0;
        if (itemRating !== ratingFilter) return false;
      }

      return true;
    });
  }, [
    items,
    trashItems,
    historyItems,
    sortOrder,
    normalizedQuery,
    activeFolderId,
    activeTag,
    categoryFilter,
    folderFilter,
    orientationFilter,
    colorFilter,
    sizeFilter,
    hasUrlFilter,
    hasNoteFilter,
    ratingFilter,
  ]);

  // Wrap filteredItems in a shallow object with non-enumerable `items` so React 19 DEV Profiler
  // (`logComponentRender -> addObjectDiffToProperties`) checks 1 integer (`version`) in O(1)
  // instead of iterating 37,366 array keys (which blocked the main thread for ~2,300ms)!
  const galleryItemsSource = useMemo(() => {
    itemsVersionRef.current += 1;
    const box = { version: itemsVersionRef.current } as {
      items: Item[];
      version: number;
    };
    Object.defineProperty(box, "items", {
      value: filteredItems,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    return box;
  }, [filteredItems]);
  useEffect(() => {
    if (navStartTsRef.current > 0) {
      const dur = performance.now() - navStartTsRef.current;
      logDiagnostic(
        "perf",
        "ui",
        "Folder switch rendered",
        `folder=${activeFolderId ?? "all"} items=${filteredItems.length} subfolders=${currentSubfolders.length}`,
        dur
      );
      navStartTsRef.current = 0;
    }
  }, [activeFolderId, filteredItems.length, currentSubfolders.length]);

  // Native OS & In-App Drag Start
  const handleDragStart = useCallback((e: React.DragEvent, item: Item) => {
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
    draggingItemIdsRef.current = itemIds;
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
  }, [selectedItemIds, selectedItems, activeFolderId]);

  const handleGallerySelectionChange = useCallback(
    (nextOrder: string[], lastItem?: Item) => {
      setSelectedOrder(nextOrder);
      if (lastItem) {
        setActiveItemId(lastItem.id);
      } else if (nextOrder.length === 0) {
        setActiveItemId(null);
      } else {
        setActiveItemId(nextOrder[nextOrder.length - 1]);
      }
    },
    []
  );

  const handleGalleryDoubleClickItem = useCallback(
    (item: Item) => {
      setActiveItemId(item.id);
      setSelectedOrder([item.id]);
      previewPushedRef.current = !ws.preview;
      ws.openPreview("inline", item.id);
    },
    [ws]
  );

  const handleGalleryItemContextMenu = useCallback(
    (e: React.MouseEvent, item: Item) => {
      setSelectedOrder((prev) => (prev.includes(item.id) ? prev : [item.id]));
      setActiveItemId((prev) => (prev === item.id ? prev : item.id));
      setContextMenu({
        position: { x: e.clientX, y: e.clientY },
        targetType: "file",
        targetItem: item,
      });
    },
    []
  );

  const handleGalleryCanvasContextMenu = useCallback(
    (e: React.MouseEvent) => {
      setContextMenu({
        position: { x: e.clientX, y: e.clientY },
        targetType: "general",
      });
    },
    []
  );
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

    if (isRealFolderId(activeFolderId)) {
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
      const ids = targets.map((i) => i.id);
      const tDeleteStart = performance.now();
      logDiagnostic(
        "perf",
        "ui",
        "[Pipeline-Delete 1/3] User initiated deletion",
        `count=${ids.length} firstId=${ids[0]?.slice(0, 12)}`
      );

      // Synchronously flush optimistic deletion into DOM so card vanishes instantly (0ms)
      flushSync(() => {
        applyOptimisticMoveToTrash(ids);
      });
      const flushMs = Math.round(performance.now() - tDeleteStart);
      logDiagnostic(
        "perf",
        "ui",
        "[Pipeline-Delete 2/3] Frontend DOM painted deletion",
        `count=${ids.length} via=flushSync`,
        flushMs
      );

      try {
        await BatchMoveToTrash(ids);
        const ipcDur = Math.round(performance.now() - tDeleteStart);
        logDiagnostic(
          "perf",
          "ui",
          "[Pipeline-Delete 3/3] Backend BatchMoveToTrash finished",
          `count=${ids.length}`,
          ipcDur
        );
        window.setTimeout(() => {
          void refreshFolders();
        }, 120);
      } catch (err) {
        console.error("Failed to move to trash:", err);
        await handleFullRefresh();
      }
    })();
  };

  const handleRestore = async (targetItem?: Item) => {
    const targets = targetItem ? [targetItem] : selectedItems;
    if (targets.length === 0) return;
    const ids = targets.map((i) => i.id);
    const removeSet = new Set(ids);
    const restoredItems = targets.map((it) => ({ ...it, inTrash: false, trashedAt: 0 }));
    // Instant 0ms optimistic restore
    setSelectedOrder((prev) => prev.filter((id) => !removeSet.has(id)));
    if (activeItemId && removeSet.has(activeItemId)) {
      setActiveItemId(null);
    }
    setTrashItems((prev) => prev.filter((it) => !removeSet.has(it.id)));
    setTrashCount((c) => Math.max(0, c - restoredItems.length));
    handleItemsUpsertedInPlace(restoredItems);
    try {
      await BatchRestoreFromTrash(ids);
      void Promise.all([refreshFolders(), refreshTrashCount()]);
    } catch (err) {
      console.error("Failed to restore from trash:", err);
      await handleFullRefresh();
    }
  };

  const handleRequestEmptyTrash = () => {
    if (trashCount <= 0 && filteredItems.length <= 0) return;
    setEmptyTrashConfirmOpen(true);
  };

  const handleConfirmEmptyTrash = async () => {
    if (isEmptyingTrash) return;
    setIsEmptyingTrash(true);
    try {
      setEmptyTrashConfirmOpen(false);
      setSelectedOrder([]);
      setActiveItemId(null);
      setTrashItems([]);
      setTrashCount(0);
      await EmptyTrash();
      notifySuccess(SuccessCodes.EMPTY_TRASH);
      setIsEmptyingTrash(false);
    } catch (err) {
      console.error("Failed to empty trash:", err);
      notifyError(err);
      setIsEmptyingTrash(false);
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

  const handleCopyItems = useCallback(
    async (targetList?: Item[]) => {
      const targets =
        targetList && targetList.length > 0
          ? targetList
          : ws.preview && previewActiveItem
          ? [previewActiveItem]
          : selectedItems.length > 0
          ? selectedItems
          : activeItem
          ? [activeItem]
          : [];
      if (targets.length === 0) return;
      try {
        await CopyItemsToClipboard(targets.map((i) => i.id));
        notifySuccess(SuccessCodes.COPIED_TO_CLIPBOARD, { count: targets.length });
      } catch (err) {
        console.error("Failed to copy items to clipboard:", err);
        notifyError(err);
      }
    },
    [ws.preview, previewActiveItem, selectedItems, activeItem, t]
  );

  const handleCopyPath = useCallback(
    async (targetItem?: Item) => {
      const targets = targetItem
        ? [targetItem]
        : selectedItems.length > 0
        ? selectedItems
        : activeItem
        ? [activeItem]
        : [];
      if (targets.length === 0) return;
      const paths = targets
        .map(
          (item) =>
            item.filePath ||
            (item.itemPath ? `${item.itemPath}/${item.filename}` : item.shellPath)
        )
        .filter(Boolean);
      if (paths.length === 0) return;
      const ok = await copyTextToClipboard(paths.join("\n"));
      if (ok) {
        notifySuccess(paths.length === 1 ? SuccessCodes.PATH_COPIED : SuccessCodes.PATHS_COPIED, { count: paths.length });
      } else {
        notifyError(ErrorCodes.COPY_TO_CLIPBOARD_FAILED);
      }
    },
    [selectedItems, activeItem, t]
  );

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
    const prevTags = item.tags || [];
    const wasFav = prevTags.includes(FAVORITE_TAG);
    const nextTags = wasFav
      ? prevTags.filter((t) => t !== FAVORITE_TAG)
      : [...prevTags, FAVORITE_TAG];
    handleItemUpdatedInPlace({ ...item, tags: nextTags });
    try {
      const nowFav = await ToggleFavorite(item.id);
      void refreshTags();
      notifySuccess(
        nowFav ? SuccessCodes.FAVORITE_ADDED : SuccessCodes.FAVORITE_REMOVED
      );
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
      await handleFullRefresh();
    }
  };

  const handleBatchAddToFolder = async (folderId: string) => {
    const targetSet = new Set(selectedOrder);
    setItems((prev) =>
      prev.map((it) => {
        if (!targetSet.has(it.id)) return it;
        const fids = it.folders || [];
        return fids.includes(folderId) ? it : { ...it, folders: [...fids, folderId] };
      })
    );
    try {
      for (const id of selectedOrder) {
        await AddItemToFolder(id, folderId);
      }
      await refreshFolders();
    } catch (err) {
      console.error("Failed to add items to folder:", err);
      await handleFullRefresh();
    }
  };

  const handleBatchRemoveFromFolder = async (folderId: string) => {
    const targetSet = new Set(selectedOrder);
    setItems((prev) =>
      prev.map((it) => {
        if (!targetSet.has(it.id)) return it;
        return { ...it, folders: (it.folders || []).filter((f) => f !== folderId) };
      })
    );
    try {
      for (const id of selectedOrder) {
        await RemoveItemFromFolder(id, folderId);
      }
      await refreshFolders();
    } catch (err) {
      console.error("Failed to remove items to folder:", err);
      await handleFullRefresh();
    }
  };

  const handleBatchAddTag = async (tag: string) => {
    const targetSet = new Set(selectedOrder);
    setItems((prev) =>
      prev.map((it) => {
        if (!targetSet.has(it.id)) return it;
        const tgs = it.tags || [];
        return tgs.includes(tag) ? it : { ...it, tags: [...tgs, tag] };
      })
    );
    try {
      for (const id of selectedOrder) {
        await AddTagToItem(id, tag);
      }
      await refreshTags();
    } catch (err) {
      console.error("Failed to add tag to items:", err);
      await handleFullRefresh();
    }
  };

  const handleBatchRemoveTag = async (tag: string) => {
    const targetSet = new Set(selectedOrder);
    setItems((prev) =>
      prev.map((it) => {
        if (!targetSet.has(it.id)) return it;
        return { ...it, tags: (it.tags || []).filter((t) => t !== tag) };
      })
    );
    try {
      for (const id of selectedOrder) {
        await RemoveTagFromItem(id, tag);
      }
      await refreshTags();
    } catch (err) {
      console.error("Failed to remove tag from items:", err);
      await handleFullRefresh();
    }
  };

  const handleCreateFolder = async (
    name: string,
    parentId?: string,
    onCreated?: (folder: Folder) => void
  ) => {
    try {
      const created = await CreateFolder(name, parentId || "");
      await refreshFolders();
      // Hand the new folder back so the caller can start renaming it inline.
      if (created) onCreated?.(created);
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
      notifySuccess(SuccessCodes.FOLDER_DELETED);
    } catch (err) {
      console.error("Failed to delete folder:", err);
      notifyError(err);
    }
  };

  const handleMoveItemToFolder = async (
    itemId: string,
    fromFolderId: string,
    toFolderId: string
  ) => {
    const cleanFrom = isRealFolderId(fromFolderId) ? fromFolderId : "";
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const nextFolders = (it.folders || []).filter((f) => f !== cleanFrom);
        if (toFolderId && !nextFolders.includes(toFolderId)) {
          nextFolders.push(toFolderId);
        }
        return { ...it, folders: nextFolders };
      })
    );
    try {
      await MoveItemToFolder(itemId, cleanFrom, toFolderId);
      await refreshFolders();
      notifySuccess(SuccessCodes.ITEM_MOVED);
    } catch (err) {
      console.error("Failed to move item:", err);
      notifyError(err);
      await handleFullRefresh();
    }
  };

  const handleBatchMoveItemsToFolder = async (
    itemIds: string[],
    fromFolderId: string,
    toFolderId: string
  ) => {
    const uniqueIds = Array.from(new Set(itemIds.filter(Boolean)));
    if (uniqueIds.length === 0) return;
    const cleanFrom = isRealFolderId(fromFolderId) ? fromFolderId : "";
    const targetSet = new Set(uniqueIds);
    setItems((prev) =>
      prev.map((it) => {
        if (!targetSet.has(it.id)) return it;
        const nextFolders = (it.folders || []).filter((f) => f !== cleanFrom);
        if (toFolderId && !nextFolders.includes(toFolderId)) {
          nextFolders.push(toFolderId);
        }
        return { ...it, folders: nextFolders };
      })
    );
    try {
      for (const id of uniqueIds) {
        await MoveItemToFolder(id, cleanFrom, toFolderId);
      }
      await refreshFolders();
      notifySuccess(SuccessCodes.ITEM_MOVED);
    } catch (err) {
      console.error("Failed to move items to folder:", err);
      notifyError(err);
      await handleFullRefresh();
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

    if (isDesktopHost()) {
      return;
    }
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
  const activeTagLabel =
    activeTag === FAVORITE_TAG ? t("common.favorites") : activeTag;
  // Only compute totalSizeBytes when no item is selected (empty inspector state displays total library/folder size)
  // Compute totalSizeBytes in O(1) when viewing all active items, or only when no item is selected
  const filteredTotalCount =
    activeFolderId !== TRASH_FOLDER_ID && activeFolderId !== HISTORY_FOLDER_ID
      ? queryTotal
      : filteredItems.length;
  const totalSizeBytes = useMemo(() => {
    if (selectedOrder.length > 0 || activeItemId !== null) return 0;
    if (
      activeFolderId !== TRASH_FOLDER_ID &&
      activeFolderId !== HISTORY_FOLDER_ID
    ) {
      return queryTotalSize;
    }
    let sum = 0;
    for (let i = 0; i < filteredItems.length; i++) {
      sum += filteredItems[i].size || 0;
    }
    return sum;
  }, [
    filteredItems,
    queryTotalSize,
    activeFolderId,
    selectedOrder.length,
    activeItemId,
  ]);
  // Global Keyboard shortcuts & native copy event handler
  const lastCopyTsRef = useRef<number>(0);
  const triggerCopyShortcut = useCallback(() => {
    const now = Date.now();
    if (now - lastCopyTsRef.current < 150) return;
    lastCopyTsRef.current = now;
    void handleCopyItems();
  }, [handleCopyItems]);

  useEffect(() => {
    const isEditableOrTextSelected = (target: HTMLElement | null): boolean => {
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return true;
      }
      const sel = window.getSelection();
      return Boolean(sel && !sel.isCollapsed && sel.toString().trim().length > 0);
    };

    const handleCopyEvent = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (isEditableOrTextSelected(target)) return;
      const hasTarget =
        (ws.preview && previewActiveItem) ||
        selectedItems.length > 0 ||
        Boolean(activeItem);
      if (!hasTarget) return;
      e.preventDefault();
      triggerCopyShortcut();
    };

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

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.code === "KeyC") {
        if (isEditableOrTextSelected(target)) return;
        const hasTarget =
          (ws.preview && previewActiveItem) ||
          selectedItems.length > 0 ||
          Boolean(activeItem);
        if (hasTarget) {
          e.preventDefault();
          triggerCopyShortcut();
        }
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
    window.addEventListener("copy", handleCopyEvent);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("copy", handleCopyEvent);
    };
  }, [
    activeItem,
    previewActiveItem,
    selectedItems,
    ws.preview,
    contextMenu,
    selectedOrder,
    filteredItems,
    triggerCopyShortcut,
  ]);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <div
        data-slot="page-root"
        className="flex h-screen w-screen text-foreground antialiased select-none overflow-hidden wails-no-drag"
      >
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

        <div className="flex h-full w-full min-w-0 select-none overflow-hidden">
        {sidebarOpen && (
          <>
            {/* Fixed-pixel sidebar: its width never depends on how many panels
                the rest of the layout has. */}
            <div
              data-panel="sidebar"
              style={{ width: sidebarWidth }}
              className="h-full shrink-0 overflow-hidden"
            >
              <SidebarDirectoryTree
                  library={library}
                  folders={folders}
                  activeFolderId={activeFolderId}
                  totalItemCount={workspaceStats?.total ?? 0}
                  untaggedCount={workspaceStats?.untaggedCount ?? 0}
                  uncategorizedCount={workspaceStats?.uncategorizedCount ?? 0}
                  trashCount={trashCount}
                  tagsCount={tags.length}
                  tagsSidebarOpen={tagsManagerOpen}
                  onToggleTagsSidebar={() => {
                    ws.selectTags();
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
                    applyOptimisticMoveToTrash(ids);
                    await BatchMoveToTrash(ids);
                    void refreshFolders();
                    notifySuccess(SuccessCodes.MOVED_TO_TRASH);
                  }}
                  onEmptyTrash={handleRequestEmptyTrash}
                  onLibraryChanged={onLibraryChanged}
                  onToggleCollapse={toggleLayoutPanels}
                />
            </div>
            {/* The divider *is* the drag handle: one 1px line, so the seam never
                reads as 2px. Dragging updates the sidebar width directly. */}
            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={handleSidebarDividerPointerDown}
              className="w-px shrink-0 border-l border-sidebar-border bg-transparent hover:border-transparent hover:bg-primary/50 transition-colors cursor-col-resize z-20"
            />
          </>
        )}

        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full w-full min-w-0 select-none overflow-hidden"
        >
          {/* COLUMN 2: CENTER MAIN CONTENT (Justified Gallery) */}
          <ResizablePanel id="gallery-main-panel" minSize={380}>
            <main
              data-file-drop-target={isInternalDragging ? undefined : "main"}
              data-slot="content-surface"
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
              {tagsManagerOpen ? (
                /* Tag manager: browsing tags gets the whole content width, so
                   long names stay readable in narrow windows. */
                <header className="w-full bg-background shrink-0 select-none header-interactive-container wails-no-drag">
                  <div className="h-(--titlebar-height) px-3 flex items-center wails-no-drag">
                    <MainHeaderSafePrefix
                      sidebarOpen={sidebarOpen}
                      onToggleSidebar={toggleLayoutPanels}
                    >
                      <HistoryNavButtons className="mr-1" />
                      <span className="font-semibold text-xs tracking-tight truncate text-foreground header-interactive-container wails-no-drag">
                        {t("tags.title")}
                      </span>
                    </MainHeaderSafePrefix>
                    <div className="flex-1 h-full min-w-4 wails-drag" />
                  </div>
                </header>
              ) : null}

              {tagsManagerOpen && (
                <TagsManager
                  tags={tags}
                  activeTag={activeTag}
                  onSelectTag={(tagName) => {
                    ws.selectTag(tagName);
                    setSelectedOrder([]);
                    setActiveItemId(null);
                  }}
                  onCreateTag={handleCreateTag}
                  onDeleteTag={handleDeleteTag}
                />
              )}

              {/* Pure 10% opacity mask + dashed border for main area dropzone (NO inner text/icons) */}
              {!tagsManagerOpen &&
                dropState.status === "dragging-over" &&
                !isInternalDragging &&
                !dragHoverSubfolderId && (
                  <div className="pointer-events-none absolute inset-0 z-50 border-2 border-dashed border-primary/80 bg-foreground/10 rounded-[inherit]" />
                )}


              <header
                className={cn(
                  "w-full bg-background border-b-0 shrink-0 select-none header-interactive-container wails-no-drag",
                  tagsManagerOpen && "hidden"
                )}
              >
                {/* Row 1: Titlebar height row — parent is strictly wails-no-drag; ONLY the middle spacer is wails-drag */}
                <div className="h-(--titlebar-height) px-3 flex items-center justify-between wails-no-drag">
                  {/* Left operable container: full height, strictly header-interactive-container + wails-no-drag */}
                  <MainHeaderSafePrefix
                    sidebarOpen={sidebarOpen}
                    onToggleSidebar={toggleLayoutPanels}
                  >
                    <HistoryNavButtons className="mr-1" />

                    <span className="font-semibold text-xs tracking-tight truncate text-foreground header-interactive-container wails-no-drag">
                      {activeFolderId === TRASH_FOLDER_ID
                        ? t("workspace.trash")
                        : tagsManagerOpen
                        ? t("tags.title")
                        : activeTag
                        ? t("workspace.tagWithValue", { tag: activeTagLabel })
                        : activeFolderId === UNTAGGED_FOLDER_ID
                        ? t("sidebar.untagged")
                        : activeFolderId === UNCATEGORIZED_FOLDER_ID
                        ? t("sidebar.uncategorized")
                        : activeFolderId === HISTORY_FOLDER_ID
                        ? t("sidebar.history")
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
                      libraryTopColors={libraryTopColors}
                      folders={folders}
                      categoryFilter={categoryFilter}
                      colorFilter={colorFilter}
                      folderFilter={folderFilter}
                      orientationFilter={orientationFilter}
                      sizeFilter={sizeFilter}
                      hasUrlFilter={hasUrlFilter}
                      hasNoteFilter={hasNoteFilter}
                      ratingFilter={ratingFilter}
                      onCategoryChange={(cat) => ws.setCategory(cat)}
                      onColorChange={(c) => ws.setColorFilter(c)}
                      onFolderChange={(f) => ws.setFolderFilter(f)}
                      onOrientationChange={(o) => ws.setOrientationFilter(o)}
                      onSizeChange={(s) => ws.setSizeFilter(s)}
                      onHasUrlChange={(u) => ws.setHasUrlFilter(u)}
                      onHasNoteChange={(n) => ws.setHasNoteFilter(n)}
                      onRatingChange={(r) => ws.setRatingFilter(r)}
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
                        ) : null}
                        {(trashCount > 0 || filteredItems.length > 0) && (
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={handleRequestEmptyTrash}
                            className="h-6.5 text-[11px] gap-1 text-destructive hover:text-destructive cursor-pointer"
                          >
                            <Trash2 className="size-3" />
                            <span>{t("workspace.emptyTrash")}</span>
                          </Button>
                        )}
                      </>
                    ) : null}

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
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    position: { x: e.clientX, y: e.clientY },
                    targetType: "general",
                  });
                }}
                className={cn(
                  "flex-1 min-h-0 overflow-y-auto p-4 flex flex-col wails-no-drag",
                  tagsManagerOpen && "hidden"
                )}
              >
                {loading ? (
                  <div className="h-full flex-1 flex items-center justify-center text-xs text-muted-foreground">
                    {t("workspace.loadingIndex")}
                  </div>
                ) : (
                  <>
                    {/* Subfolders top panel (when the current folder has child folders) */}
                    {currentSubfolders.length > 0 && (
                      <section
                        data-slot="subfolders-section"
                        className="mb-4 shrink-0 select-none"
                      >
                        <div className="flex items-center justify-between gap-2 pb-2">
                          <button
                            type="button"
                            onClick={() => setSubfoldersCollapsed((v) => !v)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/90 hover:text-foreground transition-colors cursor-pointer"
                          >
                            {subfoldersCollapsed ? (
                              <ChevronRight className="size-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="size-3.5 text-muted-foreground" />
                            )}
                            <span>
                              {t("workspace.subfoldersCount", {
                                count: currentSubfolders.length,
                              })}
                            </span>
                          </button>

                          <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={includeSubfolders}
                              onChange={(e) =>
                                setIncludeSubfolders(e.target.checked)
                              }
                              className="size-3.5 rounded border-border accent-primary cursor-pointer"
                            />
                            <span>{t("workspace.includeSubfolders")}</span>
                          </label>
                        </div>

                        {!subfoldersCollapsed && (
                          <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3 pt-0.5">
                            {currentSubfolders.map((sub) => {
                              const subInfo = subfolderPreviewData.get(sub.id);
                              const previewItems = subInfo?.previewItems ?? [];
                              const count =
                                subInfo?.totalCount ?? sub.itemCount ?? 0;
                              const isSubDragOver =
                                dragHoverSubfolderId === sub.id;
                              return (
                                <button
                                  key={sub.id}
                                  type="button"
                                  data-file-drop-target="subfolder"
                                  data-folder-id={sub.id}
                                  data-subfolder-id={sub.id}
                                  data-drag-over={isSubDragOver ? "true" : undefined}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setContextMenu({
                                      position: { x: e.clientX, y: e.clientY },
                                      targetType: "folder",
                                      targetFolder: sub,
                                    });
                                  }}
                                  onClick={() => {
                                    navigateToFolder(sub.id);
                                    setSelectedOrder([]);
                                    setActiveItemId(null);
                                  }}
                                  onDragEnter={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDragHoverSubfolderId(sub.id);
                                  }}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.dataTransfer.dropEffect = isInternalDragging
                                      ? "move"
                                      : "copy";
                                    if (dragHoverSubfolderId !== sub.id) {
                                      setDragHoverSubfolderId(sub.id);
                                    }
                                  }}
                                  onDragLeave={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const nextEl = e.relatedTarget as Node | null;
                                    if (
                                      !nextEl ||
                                      !e.currentTarget.contains(nextEl)
                                    ) {
                                      setDragHoverSubfolderId((prev) =>
                                        prev === sub.id ? null : prev
                                      );
                                    }
                                  }}
                                  onDrop={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDragHoverSubfolderId(null);

                                    const fromId = isRealFolderId(activeFolderId)
                                      ? activeFolderId
                                      : "";

                                    // 1. Check DataTransfer for internal item IDs
                                    let droppedIds: string[] = [];
                                    const itemIdsJson = e.dataTransfer.getData(
                                      "application/x-bowerbird-item-ids"
                                    );
                                    if (itemIdsJson) {
                                      try {
                                        const parsed = JSON.parse(itemIdsJson);
                                        if (Array.isArray(parsed)) {
                                          droppedIds = parsed.filter(
                                            (id): id is string =>
                                              typeof id === "string" && id.length > 0
                                          );
                                        }
                                      } catch {
                                        // fallback
                                      }
                                    }
                                    if (droppedIds.length === 0) {
                                      const singleId = e.dataTransfer.getData(
                                        "application/x-bowerbird-item-id"
                                      );
                                      if (singleId) {
                                        droppedIds = [singleId];
                                      }
                                    }
                                    if (
                                      droppedIds.length === 0 &&
                                      draggingItemIdsRef.current.length > 0
                                    ) {
                                      droppedIds = [...draggingItemIdsRef.current];
                                    }

                                    if (droppedIds.length > 0) {
                                      draggingItemIdsRef.current = [];
                                      await handleBatchMoveItemsToFolder(
                                        droppedIds,
                                        fromId,
                                        sub.id
                                      );
                                      return;
                                    }

                                    // 2. External files/folders dropped in a plain browser
                                    if (isDesktopHost()) {
                                      return;
                                    }
                                    if (
                                      e.dataTransfer.files &&
                                      e.dataTransfer.files.length > 0
                                    ) {
                                      const importedIds = await importFileList(
                                        e.dataTransfer.files
                                      );
                                      if (importedIds.length > 0) {
                                        for (const id of importedIds) {
                                          await AddItemToFolder(id, sub.id);
                                        }
                                        await handleFullRefresh();
                                      }
                                    }
                                  }}
                                  className={cn(
                                    "group/subcard relative flex flex-col rounded-xl border border-border/70 bg-card/50 hover:bg-accent/50 hover:border-primary/40 p-2 text-left transition-all cursor-pointer shadow-2xs overflow-hidden",
                                    isSubDragOver &&
                                      "border-primary bg-primary/10 ring-1 ring-primary/50"
                                  )}
                                >
                                  {/* Pure 10% opacity mask + dashed border when dragging over */}
                                  {isSubDragOver && (
                                    <div className="pointer-events-none absolute inset-0 z-30 rounded-xl border-2 border-dashed border-primary bg-foreground/10" />
                                  )}
                                  <div className="pointer-events-none absolute inset-0 z-30 hidden rounded-xl border-2 border-dashed border-primary bg-foreground/10 [.file-drop-target-active_&]:!block" />

                                  {/* Large folder cover preview area */}
                                  <div className="relative w-full h-24 rounded-lg bg-muted/40 border border-border/40 overflow-hidden flex items-center justify-center mb-2 pointer-events-none">
                                    {previewItems.length === 0 ? (
                                      <FolderIcon className="size-10 text-primary/70 stroke-[1.5] transition-transform group-hover/subcard:scale-105" />
                                    ) : previewItems.length === 1 ? (
                                      <UniversalThumbnail
                                        item={previewItems[0]}
                                        width="100%"
                                        height="100%"
                                        objectFit="cover"
                                        draggable={false}
                                        borderless={true}
                                        className="w-full h-full pointer-events-none"
                                      />
                                    ) : (
                                      <div className="grid grid-cols-2 grid-rows-2 gap-0.5 w-full h-full">
                                        {[0, 1, 2, 3].map((slotIdx) => {
                                          const pItem = previewItems[slotIdx];
                                          return (
                                            <div
                                              key={slotIdx}
                                              className="w-full h-full bg-muted/50 overflow-hidden flex items-center justify-center"
                                            >
                                              {pItem ? (
                                                <UniversalThumbnail
                                                  item={pItem}
                                                  width="100%"
                                                  height="100%"
                                                  objectFit="cover"
                                                  draggable={false}
                                                  borderless={true}
                                                  className="w-full h-full pointer-events-none"
                                                />
                                              ) : (
                                                <FolderIcon className="size-4 text-muted-foreground/30" />
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex items-center justify-between gap-1.5 px-0.5 pointer-events-none">
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                      <FolderIcon className="size-3.5 text-primary/80 shrink-0" />
                                      <span className="text-xs font-medium text-foreground truncate">
                                        {sub.name}
                                      </span>
                                    </div>
                                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                                      {count}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    )}

                    {/* No "no folders" placeholder: an empty folder just shows the
                        normal file empty state (import CTA), never a nested one. */}
                    {filteredItems.length === 0 ? (
                      currentSubfolders.length === 0 ? (
                        <div className="h-full flex-1 flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto">
                          {activeFolderId === "__trash__" ? (
                            <>
                              <div className="mb-3 flex items-center justify-center text-muted-foreground">
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
                              <div className="mb-3 flex items-center justify-center text-muted-foreground">
                                <TagIcon className="size-6 text-muted-foreground" />
</div>
                              <h3 className="font-semibold text-sm mb-1">
                                {t("workspace.tagEmptyTitle", {
                                  tag: activeTagLabel,
                                })}
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                {t("workspace.tagEmptyDesc")}
                              </p>
                            </>
                          ) : activeFolderId === UNTAGGED_FOLDER_ID ? (
                            <>
                              <div className="mb-3 flex items-center justify-center text-muted-foreground">
                                <TagIcon className="size-6 text-muted-foreground" />
</div>
                              <h3 className="font-semibold text-sm mb-1">
                                {t("workspace.untaggedEmptyTitle")}
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                {t("workspace.untaggedEmptyDesc")}
                              </p>
                            </>
                          ) : activeFolderId === UNCATEGORIZED_FOLDER_ID ? (
                            <>
                              <div className="mb-3 flex items-center justify-center text-muted-foreground">
                                <FolderX className="size-6 text-muted-foreground" />
</div>
                              <h3 className="font-semibold text-sm mb-1">
                                {t("workspace.uncategorizedEmptyTitle")}
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                {t("workspace.uncategorizedEmptyDesc")}
                              </p>
                            </>
                          ) : activeFolderId === HISTORY_FOLDER_ID ? (
                            <>
                              <div className="mb-3 flex items-center justify-center text-muted-foreground">
                                <History className="size-6 text-muted-foreground" />
</div>
                              <h3 className="font-semibold text-sm mb-1">
                                {t("workspace.historyEmptyTitle")}
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                {t("workspace.historyEmptyDesc")}
                              </p>
                            </>
                          ) : (
                            <>
                              <div className="mb-3 flex items-center justify-center text-muted-foreground">
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
                      ) : null
                    ) : (
                      <JustifiedGallery
                        items={galleryItemsSource}
                        selectedOrder={selectedOrder}
                        layoutMode={layoutMode}
                        thumbnailQuality={displayPrefs.thumbnailQuality}
                        showName={displayPrefs.showName}
                        showItemInfo={displayPrefs.showItemInfo}
                        showExtension={displayPrefs.showExtension}
                        scrollElementRef={galleryViewportRef}
                        keyboardNavEnabled={
                          !inlinePreviewOpen &&
                          !fullWindowPreviewOpen &&
                          !contextMenu &&
                          !folderPaletteOpen &&
                          !deleteConfirmDialog &&
                          !emptyTrashConfirmOpen &&
                          !renameDialog
                        }
                        targetRowHeight={rowHeight}
                        onSelectionChange={handleGallerySelectionChange}
                        onDoubleClickItem={handleGalleryDoubleClickItem}
                        onDragStartItem={handleDragStart}
                        onItemContextMenu={handleGalleryItemContextMenu}
                        onCanvasContextMenu={handleGalleryCanvasContextMenu}
                      />
                    )}
                  </>
                )}
              </div>


              {/* Fixed Bottom Background Import Progress Bar inside main content area */}
              {!isInternalDragging && dropState.status === "importing" && (
                <DropzoneOverlay state={dropState} />
              )}
              {inlinePreviewOpen && previewActiveItem && (
                <UnifiedPreviewModal
                  open={inlinePreviewOpen}
                  mode="inline"
                  activeItem={previewActiveItem}
                  items={galleryItemsSource}
                  onClose={closePreview}
                  onIndexChange={(newItem) => {
                    setActiveItemId(newItem.id);
                    ws.setPreviewItem(newItem.id);
                  }}
                  sidebarOpen={sidebarOpen}
                  onToggleSidebar={toggleLayoutPanels}
                  onItemUpdated={handleItemUpdatedInPlace}
                />
              )}
            </main>
          </ResizablePanel>

          {/* COLUMN 3: RIGHT INSPECTOR PANEL (Single Item or Multi-Item) */}
          {/* Hidden in the tag manager: there is no selection to inspect there. */}
          {inspectorOpen && !tagsManagerOpen && (
            <>
              {/* The inspector edge: an opaque line, not the translucent --border,
                  because it sits between two filled surfaces and must read as a
                  real edge. Also independent of the sidebar hairline opacity. */}
              <ResizableHandle className="w-px shrink-0 border-l border-border-solid bg-transparent hover:border-transparent hover:bg-primary/50 transition-colors cursor-col-resize z-20" />
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
                    allTags={tags}
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
                    onBatchAddTag={handleBatchAddTag}
                    onBatchRemoveTag={handleBatchRemoveTag}
                  />
                ) : (
                  <ItemDetailPanel
                    item={activeItem}
                    currentFolder={currentFolder}
                    allFolders={folders}
                    allTags={tags}
                    totalItemCount={filteredTotalCount}
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
                    onFolderUpdated={refreshFolders}
                    onTagsUpdated={refreshTags}
                    onItemUpdated={handleItemUpdatedInPlace}
                  />
                )}
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
        </div>

        {/* FULL-WINDOW POPUP PREVIEW (Space key) */}
        {fullWindowPreviewOpen && (
          <UnifiedPreviewModal
            open={fullWindowPreviewOpen}
            mode="full-window"
            activeItem={previewActiveItem ?? activeItem}
            items={galleryItemsSource}
            onClose={closePreview}
            onIndexChange={(newItem) => {
              setActiveItemId(newItem.id);
              ws.setPreviewItem(newItem.id);
            }}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={toggleLayoutPanels}
            onItemUpdated={handleItemUpdatedInPlace}
          />
        )}
        {/* ENHANCED COMMAND CONTEXT MENU */}
        {contextMenu && (
          <CustomContextMenu
            position={contextMenu.position}
            onClose={() => setContextMenu(null)}
            targetType={contextMenu.targetType}
            selectedCount={selectedOrder.length}
            selectedItems={selectedItems}
            isItemContext={contextMenu.targetType === "file"}
            activeFolderId={activeFolderId}
            targetItem={contextMenu.targetItem || activeItem}
            targetFolder={contextMenu.targetFolder}
            isTrashFolder={activeFolderId === TRASH_FOLDER_ID}
            layoutMode={layoutMode}
            onLayoutModeChange={(mode) => ws.setLayout(mode)}
            thumbnailQuality={displayPrefs.thumbnailQuality}
            onThumbnailQualityChange={(quality) =>
              setDisplayPrefs({ thumbnailQuality: quality })
            }
            showName={displayPrefs.showName}
            onShowNameChange={(value) => setDisplayPrefs({ showName: value })}
            showItemInfo={displayPrefs.showItemInfo}
            onShowItemInfoChange={(value) =>
              setDisplayPrefs({ showItemInfo: value })
            }
            showExtension={displayPrefs.showExtension}
            onShowExtensionChange={(value) =>
              setDisplayPrefs({ showExtension: value })
            }
            includeSubfolders={includeSubfolders}
            onIncludeSubfoldersChange={setIncludeSubfolders}
            showSidebar={sidebarOpen}
            onShowSidebarChange={setSidebarOpen}
            showInspector={inspectorOpen}
            onShowInspectorChange={setInspectorOpen}
            onPreview={() => openPreview("full")}
            onRename={() => activeItem && handleOpenRename(activeItem)}
            onReveal={handleBatchReveal}
            onOpenWithDefaultApp={() =>
              activeItem && handleOpenDefaultApp(activeItem)
            }
            onCopy={() => handleCopyItems()}
            onCopyPath={() => handleCopyPath()}
            onToggleFavorite={() =>
              activeItem && handleToggleFavorite(activeItem)
            }
            onDelete={() => handleRequestDelete()}
            onEmptyTrash={
              trashCount > 0 || filteredItems.length > 0
                ? handleRequestEmptyTrash
                : undefined
            }
            onRestore={() => handleRestore()}
            onOpenAddToFolderPalette={() => setFolderPaletteOpen(true)}
            onRemoveFromCurrentFolder={() => {
              if (isRealFolderId(activeFolderId)) {
                handleBatchRemoveFromFolder(activeFolderId);
              }
            }}
            onCreateSubfolder={(parentId) => {
              setFolderCreateDialog({ open: true, parentId });
              setFolderCreateName("");
            }}
            onRenameFolder={(folder) => {
              setFolderRenameDialog({ open: true, folder, newName: folder.name });
            }}
            onDeleteFolder={async (fId, fName) => {
              await handleDeleteFolder(fId);
              notifySuccess(t("sidebar.folderDeleted", { defaultValue: `Deleted folder "${fName}"` }));
            }}
            onExportFolder={(folder) => {
              notifySuccess(t("sidebar.exportFolder", { defaultValue: `Exporting folder "${folder.name}"` }));
            }}
          />
        )}

        {/* FOLDER CREATE MODAL (FOR SUBFOLDERS & CANVAS RIGHT-CLICK) */}
        <Dialog
          open={folderCreateDialog.open}
          onOpenChange={(open) => !open && setFolderCreateDialog({ open: false })}
        >
          <DialogContent className="max-w-xs text-xs">
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold">
                {folderCreateDialog.parentId
                  ? t("sidebar.newSubfolderMenu", { defaultValue: "New Subfolder" })
                  : t("sidebar.newFolderMenu", { defaultValue: "New Folder" })}
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!folderCreateName.trim()) return;
                await handleCreateFolder(folderCreateName.trim(), folderCreateDialog.parentId);
                setFolderCreateDialog({ open: false });
                setFolderCreateName("");
              }}
              className="space-y-4 pt-2"
            >
              <Input
                autoFocus
                placeholder={t("sidebar.folderNamePlaceholder", { defaultValue: "Folder name" })}
                value={folderCreateName}
                onChange={(e) => setFolderCreateName(e.target.value)}
                className="h-8 text-xs"
              />
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFolderCreateDialog({ open: false })}
                  className="h-7 text-xs"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!folderCreateName.trim()}
                  className="h-7 text-xs"
                >
                  {t("common.create")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* FOLDER RENAME MODAL (FOR SUBFOLDERS) */}
        <Dialog
          open={folderRenameDialog.open}
          onOpenChange={(open) =>
            !open && setFolderRenameDialog({ open: false, folder: null, newName: "" })
          }
        >
          <DialogContent className="max-w-xs text-xs">
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold">
                {t("sidebar.renameMenu", { defaultValue: "Rename Folder" })}
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!folderRenameDialog.folder || !folderRenameDialog.newName.trim()) return;
                await handleRenameFolder(
                  folderRenameDialog.folder.id,
                  folderRenameDialog.newName.trim()
                );
                setFolderRenameDialog({ open: false, folder: null, newName: "" });
              }}
              className="space-y-4 pt-2"
            >
              <Input
                autoFocus
                value={folderRenameDialog.newName}
                onChange={(e) =>
                  setFolderRenameDialog((prev) => ({ ...prev, newName: e.target.value }))
                }
                className="h-8 text-xs"
              />
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFolderRenameDialog({ open: false, folder: null, newName: "" })
                  }
                  className="h-7 text-xs"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!folderRenameDialog.newName.trim()}
                  className="h-7 text-xs"
                >
                  {t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        {folderPaletteOpen && (
          <CommandDialog
            open={folderPaletteOpen}
            onOpenChange={setFolderPaletteOpen}
            title={t("contextMenu.addToFolder")}
            description={t("contextMenu.searchFolderPlaceholder")}
            className="max-w-sm rounded-xl! border border-border bg-popover text-popover-foreground shadow-2xl"
          >
            <Command className="rounded-xl bg-transparent p-0">
              <CommandInput
                placeholder={t("contextMenu.searchFolderPlaceholder")}
                wrapperClassName="p-0"
                groupClassName="rounded-none border-x-transparent! border-t-transparent! border-b-border/60! bg-transparent px-3 shadow-none ring-0!"
                addonClassName="pl-0 pr-2 [&_svg]:size-3.5"
                className="h-9 text-xs bg-transparent"
              />
              <CommandList className="max-h-64 p-1.5 overflow-y-auto">
                <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                  {flatFolderList.length === 0
                    ? t("sidebar.noFolders")
                    : t("contextMenu.noResults")}
                </CommandEmpty>
                <CommandGroup>
                  {flatFolderList.map((f) => {
                    const allAssigned =
                      selectedItems.length > 0 &&
                      selectedItems.every((it) => (it.folders || []).includes(f.id));
                    return (
                      <CommandItem
                        key={f.id}
                        value={`${f.name} ${f.id}`}
                        onSelect={async () => {
                          setFolderPaletteOpen(false);
                          await handleBatchAddToFolder(f.id);
                        }}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer"
                      >
                        <FolderIcon className="size-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate flex-1">{f.name}</span>
                        <span className="text-[10px] font-mono text-muted-foreground/70">
                          {f.count}
                        </span>
                        {allAssigned && (
                          <Check className="size-3.5 text-primary shrink-0" />
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </CommandDialog>
        )}

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
                      const targetIds = deleteConfirmDialog.items.map((i) => i.id);
                      const removeSet = new Set(targetIds);
                      setDeleteConfirmDialog(null);
                      setSelectedOrder([]);
                      setActiveItemId(null);
                      setTrashItems((prev) => prev.filter((it) => !removeSet.has(it.id)));
                      setTrashCount((c) => Math.max(0, c - targetIds.length));
                      for (const it of deleteConfirmDialog.items) {
                        await PermanentDeleteItem(it.id);
                      }
                      void refreshTrashCount();
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
                        const targetIds = deleteConfirmDialog.items.map((i) => i.id);
                        const targetSet = new Set(targetIds);
                        const folderToRemove = activeFolderId;
                        setDeleteConfirmDialog(null);
                        setSelectedOrder([]);
                        setActiveItemId(null);
                        if (folderToRemove) {
                          setItems((prev) =>
                            prev.map((it) =>
                              targetSet.has(it.id)
                                ? { ...it, folders: (it.folders || []).filter((f) => f !== folderToRemove) }
                                : it
                            )
                          );
                          for (const it of deleteConfirmDialog.items) {
                            await RemoveItemFromFolder(it.id, folderToRemove);
                          }
                        }
                        void refreshFolders();
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
                        setDeleteConfirmDialog(null);
                        applyOptimisticMoveToTrash(ids);
                        await BatchMoveToTrash(ids);
                        void refreshFolders();
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

        {/* EMPTY TRASH CONFIRMATION DIALOG */}
        {emptyTrashConfirmOpen && (
          <Dialog
            open={emptyTrashConfirmOpen}
            onOpenChange={(open) => !isEmptyingTrash && setEmptyTrashConfirmOpen(open)}
          >
          <DialogContent className="max-w-sm text-xs">
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold flex items-center gap-2 text-destructive">
                <Trash2 className="size-4 shrink-0" />
                <span>{t("workspace.emptyTrashConfirmTitle")}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 text-muted-foreground text-xs leading-relaxed">
              <p>
                {t("workspace.emptyTrashConfirmMessage", {
                  count: trashCount || filteredItems.length,
                })}
              </p>
            </div>
            <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isEmptyingTrash}
                onClick={() => setEmptyTrashConfirmOpen(false)}
                className="cursor-pointer"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={isEmptyingTrash}
                onClick={handleConfirmEmptyTrash}
                className="cursor-pointer"
              >
                {t("workspace.emptyTrash")}
              </Button>
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
                    const updated = await RenameItem(
                      renameDialog.item.id,
                      renameDialog.newName.trim()
                    );
                    setRenameDialog(null);
                    if (updated) {
                      handleItemUpdatedInPlace(updated);
                    } else {
                      await refreshItems();
                    }
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
