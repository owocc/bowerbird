import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  Library,
  Tag,
  Tags,
  FolderX,
  History,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { isInternalDragActive } from "@/lib/drag-state";
import { useIsMacOS } from "@/lib/macos";
import {
  GetRecentLibraryRefs,
  OpenLibrary,
  SelectLibraryDialog,
} from "../../bindings/bowerbird/core/service";
import type {
  Folder,
  LibraryInfo,
  LibraryRef,
} from "../../bindings/bowerbird/core/models";

import {
  CreateLibraryDialog,
  DeleteFolderDialog,
  FolderContextMenu,
  FolderTreeItemNode,
  SidebarCount,
  SidebarFormDialog,
  SidebarLibrarySwitcher,
  SidebarRow,
  SidebarTitlebar,
  readDraggedItemIds,
} from "./sidebar";

export interface SidebarDirectoryTreeProps {
  library: LibraryInfo;
  folders: Folder[];
  activeFolderId: string | null;
  totalItemCount: number;
  untaggedCount?: number;
  uncategorizedCount?: number;
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

const ROW_ICON_CLASS = "size-4 shrink-0 text-muted-foreground";

export const SidebarDirectoryTree = React.memo(function SidebarDirectoryTree({
  library,
  folders,
  activeFolderId,
  totalItemCount,
  untaggedCount = 0,
  uncategorizedCount = 0,
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
  const { t } = useTranslation();
  const isMac = useIsMacOS();
  const asideRef = useRef<HTMLElement>(null);

  // Keep the folder callbacks in refs so the tree nodes stay referentially
  // stable and do not re-render on every parent update.
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
      return (
        onMoveItemToFolderRef.current?.(itemId, fromFolderId, toFolderId) ??
        Promise.resolve()
      );
    },
    []
  );
  const stableDropFolderImport = useCallback(
    (e: React.DragEvent, targetFolderId?: string) => {
      return (
        onDropFolderImportRef.current?.(e, targetFolderId) ?? Promise.resolve()
      );
    },
    []
  );

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newFolderParentId, setNewFolderParentId] = useState<
    string | undefined
  >(undefined);

  const [renameDialog, setRenameDialog] = useState<{
    folderId: string;
    folderName: string;
  } | null>(null);

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(
    {}
  );

  const [recentLibraries, setRecentLibraries] = useState<LibraryRef[]>([]);
  const [libPopoverOpen, setLibPopoverOpen] = useState(false);
  const [createLibraryOpen, setCreateLibraryOpen] = useState(false);

  const [folderContextMenu, setFolderContextMenu] = useState<{
    position: { x: number; y: number };
    folder: Folder | null;
    isTrash?: boolean;
  } | null>(null);
  const [deleteFolderDialog, setDeleteFolderDialog] = useState<{
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
    if (readDraggedItemIds(e.dataTransfer).length > 0) return;

    if (onDropFolderImport) {
      await onDropFolderImport(e, "");
    }
  };

  const loadRecentLibraries = useCallback(async () => {
    try {
      // Refs carry each library's own ID (from library.json) so the sidebar
      // orders by identity instead of by path.
      const list = await GetRecentLibraryRefs();
      setRecentLibraries(list || []);
    } catch (err) {
      console.error("Failed to load recent libraries:", err);
    }
  }, []);

  useEffect(() => {
    loadRecentLibraries();
  }, [loadRecentLibraries, library.path]);

  const handleSelectLibrary = async (path: string) => {
    if (path === library.path) return;
    try {
      const opened = await OpenLibrary(path);
      if (opened && onLibraryChanged) {
        onLibraryChanged(opened);
      }
    } catch (err) {
      console.error("Failed to switch library:", err);
    }
  };

  const handleOpenLibraryDialog = async () => {
    try {
      const chosen = await SelectLibraryDialog();
      if (!chosen) return;
      const opened = await OpenLibrary(chosen);
      if (opened && onLibraryChanged) {
        onLibraryChanged(opened);
      }
    } catch (err) {
      console.error("Failed to select library:", err);
    }
  };

  const toggleFolderExpand = useCallback(
    (folderId: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      setExpandedFolders((prev) => ({
        ...prev,
        [folderId]: !prev[folderId],
      }));
    },
    []
  );

  const handleOpenCreateRoot = useCallback(() => {
    setNewFolderParentId(undefined);
    setCreateDialogOpen(true);
  }, []);

  const handleOpenCreateSub = useCallback(
    (parentId: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      setNewFolderParentId(parentId);
      setCreateDialogOpen(true);
    },
    []
  );

  const handleOpenRename = useCallback((folder: Folder, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setRenameDialog({ folderId: folder.id, folderName: folder.name });
  }, []);

  const handleClearDragTarget = useCallback(() => {
    setDragTarget(null);
  }, []);

  const handleOpenFolderContextMenu = useCallback(
    (e: React.MouseEvent, f: Folder) => {
      setFolderContextMenu({ position: { x: e.clientX, y: e.clientY }, folder: f });
    },
    []
  );

  const handleConfirmCreate = async (name: string) => {
    await onCreateFolder(name, newFolderParentId);
    if (newFolderParentId) {
      setExpandedFolders((prev) => ({ ...prev, [newFolderParentId]: true }));
    }
    setCreateDialogOpen(false);
  };

  const handleConfirmRename = async (name: string) => {
    if (!renameDialog) return;
    await onRenameFolder(renameDialog.folderId, name);
    setRenameDialog(null);
  };

  /** Moves every dragged item from the current folder into `targetFolderId`. */
  const moveDraggedItemsTo = async (
    e: React.DragEvent,
    targetFolderId: string
  ) => {
    if (!onMoveItemToFolder) return;
    for (const id of readDraggedItemIds(e.dataTransfer)) {
      await onMoveItemToFolder(id, activeFolderId || "", targetFolderId);
    }
  };

  const isTagsActive = tagsSidebarOpen;
  const collapseShortcutLabel = isMac ? "⌘B" : "Ctrl+B";
  const isRootDragActive = dragTarget?.kind === "root";

  return (
    <>
      <aside
        ref={asideRef}
        data-slot="sidebar"
        data-file-drop-target="sidebar"
        data-folder-id=""
        onDragEnter={handleSidebarDragOver}
        onDragOver={handleSidebarDragOver}
        onDragLeave={handleSidebarDragLeave}
        onDrop={handleSidebarRootDrop}
        // No fill of its own: the column shows the background layer, whatever
        // that is (theme colour, solid, gradient, or a see-through window).
        className="flex flex-col w-full h-full min-w-0 text-sidebar-foreground select-none overflow-hidden relative"
      >
        {/* Pure 10% opacity mask + dashed border for whole sidebar panel (NO inner content/text) */}
        {isRootDragActive && (
          <div className="pointer-events-none absolute inset-0 z-40 border-2 border-dashed border-primary/80 bg-foreground/10 rounded-[inherit]" />
        )}
        <div className="pointer-events-none absolute inset-0 z-40 hidden border-2 border-dashed border-primary/80 bg-foreground/10 rounded-[inherit] [.file-drop-target-active_&]:!block" />

        <SidebarTitlebar
          isMac={isMac}
          collapseShortcutLabel={collapseShortcutLabel}
          onToggleCollapse={onToggleCollapse}
          librarySwitcher={
            <SidebarLibrarySwitcher
              library={library}
              recentLibraries={recentLibraries}
              open={libPopoverOpen}
              onOpenChange={setLibPopoverOpen}
              onSelectLibrary={handleSelectLibrary}
              onOpenDialog={handleOpenLibraryDialog}
              onCreateLibrary={() => setCreateLibraryOpen(true)}
              onCloseLibrary={() => onCloseLibrary()}
            />
          }
        />

        <SidebarContent className="pl-0 pr-2 py-2.5 space-y-3.5 flex-1 overflow-y-auto no-scrollbar">
          <SidebarGroup className="py-0">
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                <SidebarRow
                  icon={<Library className={ROW_ICON_CLASS} />}
                  label={t("sidebar.all")}
                  selected={activeFolderId === null && !tagsSidebarOpen}
                  onSelect={() => onSelectFolder(null)}
                  trailing={<SidebarCount value={totalItemCount} />}
                  dropTarget="all"
                  dropActive={dragTarget?.kind === "all"}
                  onDrop={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragTarget(null);
                    await moveDraggedItemsTo(e, "");
                  }}
                />

                <SidebarRow
                  icon={<Tag className={ROW_ICON_CLASS} />}
                  label={t("sidebar.untagged")}
                  selected={activeFolderId === "__untagged__" && !tagsSidebarOpen}
                  onSelect={() => onSelectFolder("__untagged__")}
                  trailing={<SidebarCount value={untaggedCount} />}
                />

                <SidebarRow
                  icon={<FolderX className={ROW_ICON_CLASS} />}
                  label={t("sidebar.uncategorized")}
                  selected={
                    activeFolderId === "__uncategorized__" && !tagsSidebarOpen
                  }
                  onSelect={() => onSelectFolder("__uncategorized__")}
                  trailing={<SidebarCount value={uncategorizedCount} />}
                />

                <SidebarRow
                  icon={<History className={ROW_ICON_CLASS} />}
                  label={t("sidebar.history")}
                  selected={activeFolderId === "__history__" && !tagsSidebarOpen}
                  onSelect={() => onSelectFolder("__history__")}
                />

                <SidebarRow
                  icon={<Tags className={ROW_ICON_CLASS} />}
                  label={t("sidebar.allTags")}
                  selected={isTagsActive}
                  onSelect={() => onToggleTagsSidebar?.()}
                  trailing={<SidebarCount value={tagsCount} />}
                />

                <SidebarRow
                  icon={<Trash2 className={ROW_ICON_CLASS} />}
                  label={t("sidebar.trash")}
                  selected={activeFolderId === "__trash__"}
                  onSelect={() => onSelectFolder("__trash__")}
                  trailing={<SidebarCount value={trashCount} />}
                  dropTarget="trash"
                  dropActive={dragTarget?.kind === "trash"}
                  destructiveDrop
                  onDrop={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragTarget(null);
                    const ids = readDraggedItemIds(e.dataTransfer);
                    if (ids.length > 0 && onDropItemOnTrash) {
                      await onDropItemOnTrash(ids);
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
                />
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
                  <span className="text-[9px] font-mono text-muted-foreground/70">
                    {folders.length}
                  </span>
                )}
              </span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {folders.length === 0 ? (
                  <div className="py-5 px-3 text-center border border-dashed border-sidebar-border rounded-xl my-1 bg-muted/5">
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

      <CreateLibraryDialog
        open={createLibraryOpen}
        onOpenChange={setCreateLibraryOpen}
        onCreated={async (created) => {
          // The backend already broadcasts "library-opened" for a new library;
          // forward it too so the local workspace state switches immediately.
          if (created.path !== library.path) {
            onLibraryChanged?.(created);
          }
        }}
      />

      <SidebarFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        title={
          newFolderParentId
            ? t("sidebar.newSubfolder")
            : t("sidebar.newFolder")
        }
        label={t("sidebar.folderName")}
        submitLabel={t("common.create")}
        placeholder={t("sidebar.folderNamePlaceholder")}
        onSubmit={handleConfirmCreate}
      />

      <SidebarFormDialog
        open={Boolean(renameDialog)}
        onOpenChange={(open) => !open && setRenameDialog(null)}
        title={t("sidebar.renameFolder")}
        label={t("sidebar.newName")}
        submitLabel={t("common.save")}
        placeholder={t("sidebar.newNamePlaceholder")}
        initialValue={renameDialog?.folderName ?? ""}
        onSubmit={handleConfirmRename}
      />

      <FolderContextMenu
        position={folderContextMenu?.position || null}
        folder={folderContextMenu?.folder || null}
        isTrash={folderContextMenu?.isTrash}
        onClose={() => setFolderContextMenu(null)}
        onCreateSubfolder={(parentId) => handleOpenCreateSub(parentId)}
        onCreateRootFolder={handleOpenCreateRoot}
        onRenameFolder={(f) => handleOpenRename(f)}
        onDeleteFolder={async (id, name) => {
          setDeleteFolderDialog({ folderId: id, folderName: name });
        }}
        onEmptyTrash={onEmptyTrash}
      />

      <DeleteFolderDialog
        target={deleteFolderDialog}
        onClose={() => setDeleteFolderDialog(null)}
        onConfirm={async (id) => {
          await onDeleteFolder(id);
        }}
      />
    </>
  );
}, (prev, next) =>
  prev.library === next.library &&
  prev.folders === next.folders &&
  prev.activeFolderId === next.activeFolderId &&
  prev.totalItemCount === next.totalItemCount &&
  prev.untaggedCount === next.untaggedCount &&
  prev.uncategorizedCount === next.uncategorizedCount &&
  prev.trashCount === next.trashCount &&
  prev.tagsCount === next.tagsCount &&
  prev.tagsSidebarOpen === next.tagsSidebarOpen
);
