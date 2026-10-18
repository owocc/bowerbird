import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Folder as FolderIcon,
  FolderOpen,
  Plus,
  ChevronRight,
  ChevronDown,
  Edit2,
  Trash2,
  FolderPlus,
  Layers3,
  Library,
  LogOut,
  PanelLeftClose,
  ChevronsUpDown,
  Check,
  Tag,
  Tags,
  FolderX,
  History,
} from "lucide-react";
import {
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuBadge,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AppMenuButton } from "@/components/AppMenuButton";
import { Input } from "@/components/ui/input";
import { isInternalDragActive } from "@/lib/drag-state";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { MacTrafficLightSpacer } from "@/components/MacTrafficLightSpacer";
import { useIsMacOS } from "@/lib/macos";
import { useTranslation } from "react-i18next";
import {
  GetRecentLibraries,
  OpenLibrary,
  SelectLibraryDialog,
} from "../../bindings/bowerbird/core/service";
import type { Folder, LibraryInfo } from "../../bindings/bowerbird/core/models";

export interface SidebarDirectoryTreeProps {
  library: LibraryInfo;
  folders: Folder[];
  activeFolderId: string | null;
  totalItemCount: number;
  untaggedCount?: number;
  uncategorizedCount?: number;
  historyCount?: number;
  trashCount?: number;
  tagsCount?: number;
  tagsSidebarOpen?: boolean;
  onToggleTagsSidebar?: () => void;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: (name: string, parentId?: string) => Promise<void>;
  onRenameFolder: (folderId: string, name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onDropItemOnFolder?: (itemId: string, folderId: string) => Promise<void>;
  onMoveItemToFolder?: (
    itemId: string,
    fromFolderId: string,
    toFolderId: string
  ) => Promise<void>;
  onDropExternalFilesOnFolder?: (
    fileList: FileList,
    folderId: string
  ) => Promise<void>;
  onDropFolderImport?: (
    e: React.DragEvent,
    targetFolderId?: string
  ) => Promise<void>;
  onDropItemOnTrash?: (itemIds: string[]) => Promise<void>;
  onEmptyTrash?: () => void;
  onCloseLibrary: () => void;
  onLibraryChanged?: (newLib: LibraryInfo) => void;
  onToggleCollapse?: () => void;
}

type DragHoverTarget =
  | { kind: "root" }
  | { kind: "all" }
  | { kind: "trash" }
  | { kind: "folder"; id: string }
  | null;

export const SidebarDirectoryTree = React.memo(function SidebarDirectoryTree({
  library,
  folders,
  activeFolderId,
  totalItemCount,
  untaggedCount = 0,
  uncategorizedCount = 0,
  historyCount = 0,
  trashCount = 0,
  tagsCount = 0,
  tagsSidebarOpen = false,
  onToggleTagsSidebar,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveItemToFolder,
  onDropFolderImport,
  onDropItemOnTrash,
  onEmptyTrash,
  onCloseLibrary,
  onLibraryChanged,
  onToggleCollapse,
}: SidebarDirectoryTreeProps) {
  const onSelectFolderRef = useRef(onSelectFolder);
  const onDeleteFolderRef = useRef(onDeleteFolder);
  const onMoveItemToFolderRef = useRef(onMoveItemToFolder);
  const onDropFolderImportRef = useRef(onDropFolderImport);
  useEffect(() => {
    onSelectFolderRef.current = onSelectFolder;
    onDeleteFolderRef.current = onDeleteFolder;
    onMoveItemToFolderRef.current = onMoveItemToFolder;
    onDropFolderImportRef.current = onDropFolderImport;
  }, [onSelectFolder, onDeleteFolder, onMoveItemToFolder, onDropFolderImport]);

  const stableSelectFolder = useCallback((folderId: string) => {
    onSelectFolderRef.current(folderId);
  }, []);
  const stableDeleteFolder = useCallback((folderId: string) => {
    return onDeleteFolderRef.current(folderId);
  }, []);
  const stableMoveItemToFolder = useCallback(
    (itemId: string, fromFolderId: string, toFolderId: string) => {
      return onMoveItemToFolderRef.current?.(itemId, fromFolderId, toFolderId) ?? Promise.resolve();
    },
    []
  );
  const stableDropFolderImport = useCallback(
    (e: React.DragEvent, targetFolderId?: string) => {
      return onDropFolderImportRef.current?.(e, targetFolderId) ?? Promise.resolve();
    },
    []
  );
  const { t } = useTranslation();
  const asideRef = useRef<HTMLElement>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState<string | undefined>(
    undefined
  );

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameFolderId, setRenameFolderId] = useState("");
  const [renameFolderName, setRenameFolderName] = useState("");

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(
    {}
  );

  const [recentLibraries, setRecentLibraries] = useState<string[]>([]);
  const [libPopoverOpen, setLibPopoverOpen] = useState(false);

  const isMac = useIsMacOS();

  const [folderContextMenu, setFolderContextMenu] = useState<{
    position: { x: number; y: number };
    folder: Folder | null;
    isTrash?: boolean;
  } | null>(null);
  const [deleteFolderDialog, setDeleteFolderDialog] = useState<{
    isOpen: boolean;
    folderId: string;
    folderName: string;
  } | null>(null);

  // Unified drag target state: prevents conflicting root vs row highlights
  const [dragTarget, setDragTarget] = useState<DragHoverTarget>(null);

  useEffect(() => {
    const clearDrag = () => setDragTarget(null);
    window.addEventListener("dragend", clearDrag);
    window.addEventListener("drop", clearDrag);
    return () => {
      window.removeEventListener("dragend", clearDrag);
      window.removeEventListener("drop", clearDrag);
    };
  }, []);

  const resolveHoverTarget = (e: React.DragEvent): DragHoverTarget => {
    const targetEl = e.target as HTMLElement | null;
    const rowTarget = targetEl?.closest<HTMLElement>(
      "[data-file-drop-target='folder'], [data-file-drop-target='all'], [data-file-drop-target='trash']"
    );
    if (rowTarget) {
      const kind = rowTarget.dataset.fileDropTarget;
      if (kind === "all") return { kind: "all" };
      if (kind === "trash") return { kind: "trash" };
      if (kind === "folder" && rowTarget.dataset.folderId) {
        return { kind: "folder", id: rowTarget.dataset.folderId };
      }
    }
    // Root sidebar drop is only valid for external folder imports
    if (isInternalDragActive(e)) return null;
    return { kind: "root" };
  };

  const handleSidebarDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const resolved = resolveHoverTarget(e);
    if (!resolved) {
      e.dataTransfer.dropEffect = "none";
      if (dragTarget !== null) setDragTarget(null);
      return;
    }
    e.dataTransfer.dropEffect =
      resolved.kind === "root" && !isInternalDragActive(e) ? "copy" : "move";
    setDragTarget((prev) => {
      if (
        prev?.kind === resolved.kind &&
        ("id" in prev ? prev.id : undefined) ===
          ("id" in resolved ? resolved.id : undefined)
      ) {
        return prev;
      }
      return resolved;
    });
  };

  const handleSidebarDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextEl = e.relatedTarget as Node | null;
    if (!asideRef.current || !nextEl || !asideRef.current.contains(nextEl)) {
      setDragTarget(null);
    }
  };

  const handleSidebarRootDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragTarget(null);

    if (isInternalDragActive(e)) return;

    const itemIdsJson = e.dataTransfer.getData("application/x-bowerbird-item-ids");
    const singleId = e.dataTransfer.getData("application/x-bowerbird-item-id");
    if (itemIdsJson || singleId) return;

    if (onDropFolderImport) {
      await onDropFolderImport(e, "");
    }
  };

  const loadRecentLibraries = useCallback(async () => {
    try {
      const list = await GetRecentLibraries();
      setRecentLibraries(list || []);
    } catch (err) {
      console.error("Failed to load recent libraries:", err);
    }
  }, []);

  useEffect(() => {
    loadRecentLibraries();
  }, [loadRecentLibraries, library.path]);

  const handleSelectLibraryValue = async (val: string | null) => {
    if (!val) return;
    if (val === "__action_open_dialog__") {
      try {
        const chosen = await SelectLibraryDialog();
        if (chosen) {
          const opened = await OpenLibrary(chosen);
          if (opened && onLibraryChanged) {
            onLibraryChanged(opened);
          }
        }
      } catch (err) {
        console.error("Failed to select library:", err);
      }
      return;
    }
    if (val === "__action_close__") {
      onCloseLibrary();
      return;
    }
    if (val !== library.path) {
      try {
        const opened = await OpenLibrary(val);
        if (opened && onLibraryChanged) {
          onLibraryChanged(opened);
        }
      } catch (err) {
        console.error("Failed to switch library:", err);
      }
    }
  };

  const otherRecentLibraries = recentLibraries.filter((p) => p !== library.path);
  const toggleFolderExpand = useCallback((folderId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  }, []);

  const handleOpenCreateRoot = useCallback(() => {
    setNewFolderParentId(undefined);
    setNewFolderName("");
    setCreateDialogOpen(true);
  }, []);

  const handleOpenCreateSub = useCallback((parentId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setNewFolderParentId(parentId);
    setNewFolderName("");
    setCreateDialogOpen(true);
  }, []);

  const handleOpenRename = useCallback((folder: Folder, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setRenameFolderId(folder.id);
    setRenameFolderName(folder.name);
    setRenameDialogOpen(true);
  }, []);

  const handleClearDragTarget = useCallback(() => {
    setDragTarget(null);
  }, []);

  const handleOpenFolderContextMenu = useCallback((e: React.MouseEvent, f: Folder) => {
    setFolderContextMenu({
      position: { x: e.clientX, y: e.clientY },
      folder: f,
    });
  }, []);
  const handleConfirmCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newFolderName.trim()) return;
    await onCreateFolder(newFolderName.trim(), newFolderParentId);
    if (newFolderParentId) {
      setExpandedFolders((prev) => ({ ...prev, [newFolderParentId]: true }));
    }
    setCreateDialogOpen(false);
    setNewFolderName("");
  };

  const handleConfirmRename = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!renameFolderName.trim()) return;
    await onRenameFolder(renameFolderId, renameFolderName.trim());
    setRenameDialogOpen(false);
  };

  const librarySwitcher = (
    <Popover open={libPopoverOpen} onOpenChange={setLibPopoverOpen}>
      <PopoverTrigger
        className="min-w-0 w-fit max-w-full h-8 pl-1 pr-2 py-1 flex items-center gap-2 text-xs font-semibold rounded-lg hover:bg-sidebar-accent/80 text-sidebar-foreground transition-colors cursor-pointer outline-none border-0 shadow-none bg-transparent header-interactive-container wails-no-drag"
        title={library.name}
      >
        <Layers3 className="size-4 shrink-0 text-foreground/80" />
        <span className="truncate min-w-0 max-w-[140px] leading-tight">
          {library.name}
        </span>
        <ChevronsUpDown className="size-3 text-muted-foreground/70 shrink-0" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-64 p-0 rounded-xl shadow-xl border border-neutral-300 dark:border-neutral-700 bg-popover text-popover-foreground z-50 overflow-hidden ring-0"
      >
        <Command className="rounded-xl">
          <CommandInput
            placeholder={t("sidebar.searchLibraryPlaceholder")}
            className="h-8 text-xs"
          />
          <CommandList className="max-h-64 p-1">
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              {t("sidebar.noLibrariesFound")}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={`${library.name} ${library.path}`}
                onSelect={() => setLibPopoverOpen(false)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer bg-accent/40 font-medium"
              >
                <Layers3 className="size-3.5 text-primary shrink-0" />
                <span className="truncate flex-1 text-xs">{library.name}</span>
                <Check className="size-3.5 text-primary shrink-0" />
              </CommandItem>

              {otherRecentLibraries.map((p) => {
                const normalized = p.replace(/[/\\]+$/, "");
                const parts = normalized.split(/[/\\]/);
                const lastPart = parts[parts.length - 1] || p;
                const displayName = lastPart.endsWith(".library")
                  ? lastPart.slice(0, -8)
                  : lastPart;
                return (
                  <CommandItem
                    key={p}
                    value={`${displayName} ${p}`}
                    onSelect={() => {
                      setLibPopoverOpen(false);
                      handleSelectLibraryValue(p);
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-accent"
                  >
                    <FolderIcon className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1 text-xs">{displayName}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>

            <CommandSeparator className="my-1" />

            <CommandGroup>
              <CommandItem
                value="__action_open_dialog__ Open Library..."
                onSelect={() => {
                  setLibPopoverOpen(false);
                  handleSelectLibraryValue("__action_open_dialog__");
                }}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-accent"
              >
                <FolderOpen className="size-3.5 text-muted-foreground shrink-0" />
                <span>{t("sidebar.openLibrary")}</span>
              </CommandItem>
              <CommandItem
                value="__action_close__ Close Library"
                onSelect={() => {
                  setLibPopoverOpen(false);
                  handleSelectLibraryValue("__action_close__");
                }}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="size-3.5 shrink-0" />
                <span>{t("sidebar.closeLibrary")}</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  const collapseShortcutLabel = isMac ? "⌘B" : "Ctrl+B";
  const isRootDragActive = dragTarget?.kind === "root";
  const isAllDragActive = dragTarget?.kind === "all";
  const isTrashDragActive = dragTarget?.kind === "trash";

  return (
    <>
      <aside
        ref={asideRef}
        data-file-drop-target="sidebar"
        data-folder-id=""
        onDragEnter={handleSidebarDragOver}
        onDragOver={handleSidebarDragOver}
        onDragLeave={handleSidebarDragLeave}
        onDrop={handleSidebarRootDrop}
        className="flex flex-col w-full h-full min-w-0 bg-sidebar text-sidebar-foreground select-none overflow-hidden relative"
      >
        {/* Pure 10% opacity mask + dashed border for whole sidebar panel (NO inner content/text) */}
        {isRootDragActive && (
          <div className="pointer-events-none absolute inset-0 z-40 border-2 border-dashed border-primary/80 bg-foreground/10 rounded-[inherit]" />
        )}
        <div className="pointer-events-none absolute inset-0 z-40 hidden border-2 border-dashed border-primary/80 bg-foreground/10 rounded-[inherit] [.file-drop-target-active_&]:!block" />

        <SidebarHeader className="p-0 border-b-0 select-none shrink-0">
          {isMac ? (
            <>
              <div className="h-(--titlebar-height) pl-2 pr-2.5 flex items-center justify-between wails-no-drag">
                <MacTrafficLightSpacer className="w-[80px] h-(--titlebar-height) shrink-0" />
                <div className="flex-1 min-w-0 h-full wails-drag" />
                <div className="flex items-center header-interactive-container wails-no-drag">
                  <AppMenuButton align="end" />
                  {onToggleCollapse && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={onToggleCollapse}
                      title={t("sidebar.collapseSidebar", {
                        shortcut: collapseShortcutLabel,
                      })}
                      className="size-7 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg shrink-0 wails-no-drag"
                    >
                      <PanelLeftClose className="size-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="h-9 pl-0 pr-2 flex items-center header-interactive-container wails-no-drag">
                <div className="w-3 shrink-0" />
                {librarySwitcher}
              </div>
            </>
          ) : (
            <div className="h-(--titlebar-height) pl-2 pr-2.5 flex items-center justify-between gap-1.5 wails-no-drag">
              <div className="flex items-center flex-1 min-w-0 header-interactive-container wails-no-drag">
                {librarySwitcher}
              </div>
              <div className="flex-1 min-w-2 h-full wails-drag" />
              <div className="flex items-center header-interactive-container wails-no-drag">
                <AppMenuButton align="end" />
                {onToggleCollapse && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onToggleCollapse}
                    title={t("sidebar.collapseSidebar", {
                      shortcut: collapseShortcutLabel,
                    })}
                    className="size-7 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg shrink-0 wails-no-drag"
                  >
                    <PanelLeftClose className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </SidebarHeader>

        <SidebarContent className="pl-0 pr-2 py-2.5 space-y-3.5 flex-1 overflow-y-auto">
          <SidebarGroup className="py-0">
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {/* 1. All Assets */}
                <SidebarMenuItem className="relative group/all">
                  <div
                    data-file-drop-target="all"
                    data-drag-over={isAllDragActive ? "true" : undefined}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragTarget(null);
                      const itemIdsJson = e.dataTransfer.getData(
                        "application/x-bowerbird-item-ids"
                      );
                      if (itemIdsJson && onMoveItemToFolder) {
                        try {
                          const ids = JSON.parse(itemIdsJson);
                          for (const id of ids) {
                            await onMoveItemToFolder(
                              id,
                              activeFolderId || "",
                              ""
                            );
                          }
                        } catch {
                          /* ignore */
                        }
                      }
                    }}
                    className="flex items-center w-full relative rounded-lg overflow-hidden"
                  >
                    <div className="w-3 shrink-0" />
                    <button
                      type="button"
                      onClick={() => onSelectFolder(null)}
                      className={cn(
                        "flex-1 flex items-center gap-2 min-w-0 h-8 pl-1 pr-2 rounded-lg text-left text-xs transition-colors cursor-pointer relative",
                        activeFolderId === null && !tagsSidebarOpen
                          ? "bg-primary/10 text-primary font-semibold shadow-2xs"
                          : "hover:bg-sidebar-accent/70 text-sidebar-foreground"
                      )}
                    >
                      <Library className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1 text-xs">
                        {t("sidebar.all")}
                      </span>
                      <SidebarMenuBadge className="text-[10px] font-mono px-1.5 py-0 bg-sidebar-accent/80">
                        {totalItemCount}
                      </SidebarMenuBadge>

                      {isAllDragActive && (
                        <div className="pointer-events-none absolute inset-0 z-30 rounded-lg border border-dashed border-primary bg-foreground/10" />
                      )}
                      <div className="pointer-events-none absolute inset-0 z-30 hidden rounded-lg border border-dashed border-primary bg-foreground/10 [.file-drop-target-active_&]:!block" />
                    </button>
                  </div>
                </SidebarMenuItem>

                {/* 2. Untagged */}
                <SidebarMenuItem>
                  <div className="flex items-center w-full">
                    <div className="w-3 shrink-0" />
                    <button
                      type="button"
                      onClick={() => onSelectFolder("__untagged__")}
                      className={cn(
                        "flex-1 flex items-center gap-2 min-w-0 h-8 pl-1 pr-2 rounded-lg text-left text-xs transition-colors cursor-pointer",
                        activeFolderId === "__untagged__" && !tagsSidebarOpen
                          ? "bg-primary/10 text-primary font-semibold shadow-2xs"
                          : "hover:bg-sidebar-accent/70 text-sidebar-foreground"
                      )}
                    >
                      <Tag className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1 text-xs">
                        {t("sidebar.untagged")}
                      </span>
                      <SidebarMenuBadge className="text-[10px] font-mono px-1.5 py-0 bg-sidebar-accent/80">
                        {untaggedCount}
                      </SidebarMenuBadge>
                    </button>
                  </div>
                </SidebarMenuItem>

                {/* 3. Uncategorized */}
                <SidebarMenuItem>
                  <div className="flex items-center w-full">
                    <div className="w-3 shrink-0" />
                    <button
                      type="button"
                      onClick={() => onSelectFolder("__uncategorized__")}
                      className={cn(
                        "flex-1 flex items-center gap-2 min-w-0 h-8 pl-1 pr-2 rounded-lg text-left text-xs transition-colors cursor-pointer",
                        activeFolderId === "__uncategorized__" && !tagsSidebarOpen
                          ? "bg-primary/10 text-primary font-semibold shadow-2xs"
                          : "hover:bg-sidebar-accent/70 text-sidebar-foreground"
                      )}
                    >
                      <FolderX className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1 text-xs">
                        {t("sidebar.uncategorized")}
                      </span>
                      <SidebarMenuBadge className="text-[10px] font-mono px-1.5 py-0 bg-sidebar-accent/80">
                        {uncategorizedCount}
                      </SidebarMenuBadge>
                    </button>
                  </div>
                </SidebarMenuItem>

                {/* 4. History (Recent Dragged-Out Items) */}
                <SidebarMenuItem>
                  <div className="flex items-center w-full">
                    <div className="w-3 shrink-0" />
                    <button
                      type="button"
                      onClick={() => onSelectFolder("__history__")}
                      className={cn(
                        "flex-1 flex items-center gap-2 min-w-0 h-8 pl-1 pr-2 rounded-lg text-left text-xs transition-colors cursor-pointer",
                        activeFolderId === "__history__" && !tagsSidebarOpen
                          ? "bg-primary/10 text-primary font-semibold shadow-2xs"
                          : "hover:bg-sidebar-accent/70 text-sidebar-foreground"
                      )}
                    >
                      <History className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1 text-xs">
                        {t("sidebar.history")}
                      </span>
                      <SidebarMenuBadge className="text-[10px] font-mono px-1.5 py-0 bg-sidebar-accent/80">
                        {historyCount}
                      </SidebarMenuBadge>
                    </button>
                  </div>
                </SidebarMenuItem>

                {/* 5. All Tags */}
                <SidebarMenuItem>
                  <div className="flex items-center w-full">
                    <div className="w-3 shrink-0" />
                    <button
                      type="button"
                      onClick={() => onToggleTagsSidebar?.()}
                      className={cn(
                        "flex-1 flex items-center gap-2 min-w-0 h-8 pl-1 pr-2 rounded-lg text-left text-xs transition-colors cursor-pointer",
                        tagsSidebarOpen
                          ? "bg-primary/10 text-primary font-semibold shadow-2xs"
                          : "hover:bg-sidebar-accent/70 text-sidebar-foreground"
                      )}
                    >
                      <Tags className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1 text-xs">
                        {t("sidebar.allTags")}
                      </span>
                      <SidebarMenuBadge className="text-[10px] font-mono px-1.5 py-0 bg-sidebar-accent/80">
                        {tagsCount}
                      </SidebarMenuBadge>
                    </button>
                  </div>
                </SidebarMenuItem>
                {/* 3. Trash */}
                <SidebarMenuItem className="relative group/trash">
                  <div
                    data-file-drop-target="trash"
                    data-drag-over={isTrashDragActive ? "true" : undefined}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragTarget(null);
                      const itemIdsJson = e.dataTransfer.getData(
                        "application/x-bowerbird-item-ids"
                      );
                      if (itemIdsJson && onDropItemOnTrash) {
                        try {
                          const ids = JSON.parse(itemIdsJson);
                          await onDropItemOnTrash(ids);
                        } catch {
                          /* ignore */
                        }
                      }
                    }}
                    onContextMenu={(e) => {
                      if (!onEmptyTrash || trashCount <= 0) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setFolderContextMenu({
                        position: { x: e.clientX, y: e.clientY },
                        folder: null,
                        isTrash: true,
                      });
                    }}
                    className="flex items-center w-full relative rounded-lg overflow-hidden"
                  >
                    <div className="w-3 shrink-0" />
                    <button
                      type="button"
                      onClick={() => onSelectFolder("__trash__")}
                      className={cn(
                        "flex-1 flex items-center gap-2 min-w-0 h-8 pl-1 pr-2 rounded-lg text-left text-xs transition-colors cursor-pointer relative",
                        activeFolderId === "__trash__"
                          ? "bg-primary/10 text-primary font-semibold shadow-2xs"
                          : "hover:bg-sidebar-accent/70 text-sidebar-foreground"
                      )}
                    >
                      <Trash2 className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1 text-xs">
                        {t("sidebar.trash")}
                      </span>
                      <SidebarMenuBadge className="text-[10px] font-mono px-1.5 py-0 bg-sidebar-accent/80">
                        {trashCount}
                      </SidebarMenuBadge>

                      {isTrashDragActive && (
                        <div className="pointer-events-none absolute inset-0 z-30 rounded-lg border border-dashed border-destructive bg-foreground/10" />
                      )}
                      <div className="pointer-events-none absolute inset-0 z-30 hidden rounded-lg border border-dashed border-destructive bg-foreground/10 [.file-drop-target-active_&]:!block" />
                    </button>
                  </div>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Folders Section: Hierarchical virtual folders */}
          <SidebarGroup
            className="py-0"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setFolderContextMenu({
                position: { x: e.clientX, y: e.clientY },
                folder: null,
              });
            }}
          >
            <SidebarGroupLabel className="flex items-center justify-between text-[10px] tracking-wider text-muted-foreground/80 font-semibold pl-4 pr-2 h-6 select-none cursor-default">
              <span className="flex items-center gap-1.5">
                <span>{t("sidebar.folders")}</span>
                {folders.length > 0 && (
                  <span className="text-[9px] font-mono px-1 rounded bg-muted/60 text-muted-foreground">
                    {folders.length}
                  </span>
                )}
              </span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {folders.length === 0 ? (
                  <div className="py-5 px-3 text-center border border-dashed border-sidebar-border/80 rounded-xl my-1 bg-muted/5">
                    <p className="text-[11px] text-muted-foreground">
                      {t("sidebar.noFolders")}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {t("sidebar.noFoldersHint")}
                    </p>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={handleOpenCreateRoot}
                      className="mt-2.5 text-[11px] h-6.5 gap-1 shadow-2xs"
                    >
                      <Plus className="size-3" />
                      <span>{t("sidebar.newFolder")}</span>
                    </Button>
                  </div>
                ) : (
                  folders.map((folder) => (
                    <FolderTreeItemNode
                      key={folder.id}
                      folder={folder}
                      activeFolderId={activeFolderId}
                      dragHoverFolderId={
                        dragTarget?.kind === "folder" ? dragTarget.id : null
                      }
                      expandedMap={expandedFolders}
                      onToggleExpand={toggleFolderExpand}
                      onSelectFolder={stableSelectFolder}
                      onCreateSubfolder={handleOpenCreateSub}
                      onRenameFolder={handleOpenRename}
                      onDeleteFolder={stableDeleteFolder}
                      onMoveItemToFolder={stableMoveItemToFolder}
                      onDropFolderImport={stableDropFolderImport}
                      onClearDragTarget={handleClearDragTarget}
                      onOpenContextMenu={handleOpenFolderContextMenu}
                    />
                  ))
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </aside>

      {/* Dialog for creating folder */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-xs text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              {newFolderParentId
                ? t("sidebar.newSubfolder")
                : t("sidebar.newFolder")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleConfirmCreate} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">
                {t("sidebar.folderName")}
              </label>
              <Input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={t("sidebar.folderNamePlaceholder")}
                className="h-8 text-xs"
              />
            </div>
            <DialogFooter className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateDialogOpen(false)}
                className="h-7 text-xs"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!newFolderName.trim()}
                className="h-7 text-xs"
              >
                {t("common.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog for renaming folder */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="max-w-xs text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              {t("sidebar.renameFolder")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleConfirmRename} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">
                {t("sidebar.newName")}
              </label>
              <Input
                autoFocus
                value={renameFolderName}
                onChange={(e) => setRenameFolderName(e.target.value)}
                placeholder={t("sidebar.newNamePlaceholder")}
                className="h-8 text-xs"
              />
            </div>
            <DialogFooter className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRenameDialogOpen(false)}
                className="h-7 text-xs"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!renameFolderName.trim()}
                className="h-7 text-xs"
              >
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Desktop context menu for folders */}
      <FolderContextMenu
        position={folderContextMenu?.position || null}
        folder={folderContextMenu?.folder || null}
        isTrash={folderContextMenu?.isTrash}
        onClose={() => setFolderContextMenu(null)}
        onCreateSubfolder={(parentId) => handleOpenCreateSub(parentId)}
        onCreateRootFolder={handleOpenCreateRoot}
        onRenameFolder={(f) => handleOpenRename(f)}
        onDeleteFolder={async (id, name) => {
          setDeleteFolderDialog({
            isOpen: true,
            folderId: id,
            folderName: name,
          });
        }}
        onEmptyTrash={onEmptyTrash}
      />

      {/* Dialog for deleting folder */}
      {deleteFolderDialog && (
        <Dialog
          open={deleteFolderDialog.isOpen}
          onOpenChange={(open) => !open && setDeleteFolderDialog(null)}
        >
          <DialogContent className="max-w-xs text-xs">
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold">
                {t("sidebar.deleteFolderTitle")}
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 text-xs text-muted-foreground leading-relaxed">
              {t("sidebar.deleteFolderConfirm", {
                name: deleteFolderDialog.folderName,
              })}
              <p className="mt-1 text-[11px] text-muted-foreground/80">
                {t("sidebar.deleteFolderHint")}
              </p>
            </div>
            <DialogFooter className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeleteFolderDialog(null)}
                className="cursor-pointer text-xs"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={async () => {
                  const id = deleteFolderDialog.folderId;
                  setDeleteFolderDialog(null);
                  await onDeleteFolder(id);
                }}
                className="cursor-pointer text-xs"
              >
                {t("common.delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}, (prev, next) =>
  prev.library === next.library &&
  prev.folders === next.folders &&
  prev.activeFolderId === next.activeFolderId &&
  prev.totalItemCount === next.totalItemCount &&
  prev.untaggedCount === next.untaggedCount &&
  prev.uncategorizedCount === next.uncategorizedCount &&
  prev.historyCount === next.historyCount &&
  prev.trashCount === next.trashCount &&
  prev.tagsCount === next.tagsCount &&
  prev.tagsSidebarOpen === next.tagsSidebarOpen
);

interface FolderTreeItemNodeProps {
  folder: Folder;
  activeFolderId: string | null;
  dragHoverFolderId: string | null;
  expandedMap: Record<string, boolean>;
  onToggleExpand: (folderId: string, e?: React.MouseEvent) => void;
  onSelectFolder: (folderId: string) => void;
  onCreateSubfolder: (parentId: string, e?: React.MouseEvent) => void;
  onRenameFolder: (folder: Folder, e?: React.MouseEvent) => void;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onMoveItemToFolder?: (
    itemId: string,
    fromFolderId: string,
    toFolderId: string
  ) => Promise<void>;
  onDropFolderImport?: (
    e: React.DragEvent,
    targetFolderId?: string
  ) => Promise<void>;
  onClearDragTarget: () => void;
  onOpenContextMenu: (e: React.MouseEvent, folder: Folder) => void;
  depth?: number;
}

const FolderTreeItemNode = React.memo(function FolderTreeItemNode({
  folder,
  activeFolderId,
  dragHoverFolderId,
  expandedMap,
  onToggleExpand,
  onSelectFolder,
  onCreateSubfolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveItemToFolder,
  onDropFolderImport,
  onClearDragTarget,
  onOpenContextMenu,
  depth = 0,
}: FolderTreeItemNodeProps) {
  const hasChildren = Boolean(folder.children && folder.children.length > 0);
  const expanded = Boolean(expandedMap[folder.id]);
  const isSelected = activeFolderId === folder.id;
  const isDragOver = dragHoverFolderId === folder.id;

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClearDragTarget();

    const itemIdsJson = e.dataTransfer.getData(
      "application/x-bowerbird-item-ids"
    );
    if (itemIdsJson && onMoveItemToFolder) {
      try {
        const ids = JSON.parse(itemIdsJson);
        if (Array.isArray(ids) && ids.length > 0) {
          for (const id of ids) {
            await onMoveItemToFolder(id, activeFolderId || "", folder.id);
          }
          return;
        }
      } catch {
        // fallback
      }
    }
    const itemId = e.dataTransfer.getData("application/x-bowerbird-item-id");
    if (itemId && onMoveItemToFolder) {
      await onMoveItemToFolder(itemId, activeFolderId || "", folder.id);
      return;
    }
    if (!isInternalDragActive(e) && onDropFolderImport) {
      await onDropFolderImport(e, folder.id);
    }
  };

  return (
    <SidebarMenuItem className="group/item relative select-none">
      <div
        data-file-drop-target="folder"
        data-folder-id={folder.id}
        onDrop={handleDrop}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenContextMenu(e, folder);
        }}
        className="relative flex items-center w-full rounded-lg overflow-hidden"
      >
        <button
          type="button"
          onClick={(e) => onToggleExpand(folder.id, e)}
          className={cn(
            "size-3 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-transform cursor-pointer",
            hasChildren ? "visible" : "invisible pointer-events-none"
          )}
        >
          {expanded ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelectFolder(folder.id)}
          className={cn(
            "flex-1 flex items-center gap-2 min-w-0 h-8 pl-1 pr-2 rounded-lg text-left text-xs transition-colors cursor-pointer relative",
            isSelected
              ? "bg-primary/10 text-primary font-semibold shadow-2xs"
              : "hover:bg-sidebar-accent/70 text-sidebar-foreground"
          )}
        >
          {isSelected || expanded ? (
            <FolderOpen
              className={cn(
                "size-3.5 shrink-0 pointer-events-none",
                isSelected ? "text-primary" : "text-muted-foreground"
              )}
            />
          ) : (
            <FolderIcon
              className={cn(
                "size-3.5 shrink-0 pointer-events-none",
                isSelected ? "text-primary" : "text-muted-foreground"
              )}
            />
          )}
          <span className="truncate flex-1 pointer-events-none">
            {folder.name}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0 rounded text-muted-foreground/70 bg-sidebar-accent/50 pointer-events-none">
            {folder.itemCount ?? 0}
          </span>

          {/* Pure 10% opacity mask + dashed border (NO text/icons inside) */}
          {isDragOver && (
            <div className="pointer-events-none absolute inset-0 z-30 rounded-lg border border-dashed border-primary bg-foreground/10" />
          )}
          <div className="pointer-events-none absolute inset-0 z-30 hidden rounded-lg border border-dashed border-primary bg-foreground/10 [.file-drop-target-active_&]:!block" />
        </button>
      </div>

      {hasChildren && expanded && (
        <SidebarMenuSub className="ml-7.5 border-l border-sidebar-border/80 pl-2 my-0.5 space-y-0.5">
          {folder.children!.map((child) => (
            <FolderTreeItemNode
              key={child.id}
              folder={child}
              activeFolderId={activeFolderId}
              dragHoverFolderId={dragHoverFolderId}
              expandedMap={expandedMap}
              onToggleExpand={onToggleExpand}
              onSelectFolder={onSelectFolder}
              onCreateSubfolder={onCreateSubfolder}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onMoveItemToFolder={onMoveItemToFolder}
              onDropFolderImport={onDropFolderImport}
              onClearDragTarget={onClearDragTarget}
              onOpenContextMenu={onOpenContextMenu}
              depth={depth + 1}
            />
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
});

interface FolderContextMenuProps {
  position: { x: number; y: number } | null;
  folder: Folder | null;
  isTrash?: boolean;
  onClose: () => void;
  onCreateSubfolder: (parentId: string) => void;
  onCreateRootFolder: () => void;
  onRenameFolder: (folder: Folder) => void;
  onDeleteFolder: (folderId: string, folderName: string) => Promise<void>;
  onEmptyTrash?: () => void;
}

function FolderContextMenu({
  position,
  folder,
  isTrash,
  onClose,
  onCreateSubfolder,
  onCreateRootFolder,
  onRenameFolder,
  onDeleteFolder,
  onEmptyTrash,
}: FolderContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [position, onClose]);

  if (!position) return null;

  const menuWidth = 150;
  const menuHeight = folder ? 115 : 45;
  const x = Math.min(position.x, window.innerWidth - menuWidth - 8);
  const y = Math.min(position.y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={menuRef}
      style={{ left: `${Math.max(8, x)}px`, top: `${Math.max(8, y)}px` }}
      className="fixed z-50 min-w-[145px] rounded-xl border border-border bg-popover/95 p-1 text-popover-foreground shadow-xl backdrop-blur-md select-none wails-no-drag"
    >
      {isTrash ? (
        <button
          type="button"
          onClick={() => {
            onEmptyTrash?.();
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 text-left transition-colors cursor-pointer"
        >
          <Trash2 className="size-3.5 text-destructive" />
          <span>{t("workspace.emptyTrash")}</span>
        </button>
      ) : folder ? (
        <>
          <button
            type="button"
            onClick={() => {
              onCreateSubfolder(folder.id);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground text-left transition-colors cursor-pointer"
          >
            <FolderPlus className="size-3.5 text-muted-foreground" />
            <span>{t("sidebar.newSubfolderMenu")}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onRenameFolder(folder);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground text-left transition-colors cursor-pointer"
          >
            <Edit2 className="size-3.5 text-muted-foreground" />
            <span>{t("sidebar.renameMenu")}</span>
          </button>
          <div className="my-1 h-px bg-border/60" />
          <button
            type="button"
            onClick={async () => {
              onClose();
              await onDeleteFolder(folder.id, folder.name);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 text-left transition-colors cursor-pointer"
          >
            <Trash2 className="size-3.5 text-destructive" />
            <span>{t("sidebar.deleteFolderMenu")}</span>
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            onCreateRootFolder();
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground text-left transition-colors cursor-pointer"
        >
          <FolderPlus className="size-3.5 text-muted-foreground" />
          <span>{t("sidebar.newFolderMenu")}</span>
        </button>
      )}
    </div>
  );
}
