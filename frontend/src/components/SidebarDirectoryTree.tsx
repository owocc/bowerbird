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
import { Input } from "@/components/ui/input";
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
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: (name: string, parentId?: string) => Promise<void>;
  onRenameFolder: (folderId: string, name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onDropItemOnFolder?: (itemId: string, folderId: string) => Promise<void>;
  onDropExternalFilesOnFolder?: (fileList: FileList, folderId: string) => Promise<void>;
  onCloseLibrary: () => void;
  onLibraryChanged?: (newLib: LibraryInfo) => void;
  onToggleCollapse?: () => void;
}
export function SidebarDirectoryTree({
  library,
  folders,
  activeFolderId,
  totalItemCount,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onDropItemOnFolder,
  onDropExternalFilesOnFolder,
  onCloseLibrary,
  onLibraryChanged,
  onToggleCollapse,
}: SidebarDirectoryTreeProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState<string | undefined>(undefined);

  // Dialog state for renaming a folder
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameFolderId, setRenameFolderId] = useState("");
  const [renameFolderName, setRenameFolderName] = useState("");

  // Set of expanded folder IDs
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // Recent libraries list for dropdown
  const [recentLibraries, setRecentLibraries] = useState<string[]>([]);
  const [libPopoverOpen, setLibPopoverOpen] = useState(false);

  // Context menu state for folders
  const [folderContextMenu, setFolderContextMenu] = useState<{
    position: { x: number; y: number };
    folder: Folder | null;
  } | null>(null);

  const loadRecentLibraries = useCallback(async () => {
    try {
      const list = await GetRecentLibraries();
      setRecentLibraries(list || []);
    } catch (err) {
      console.error("加载最近资源库列表失败:", err);
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
        console.error("选择资源库失败:", err);
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
        console.error("切换资源库失败:", err);
      }
    }
  };

  const otherRecentLibraries = recentLibraries.filter((p) => p !== library.path);
  const toggleFolderExpand = (folderId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  const handleOpenCreateRoot = () => {
    setNewFolderParentId(undefined);
    setNewFolderName("");
    setCreateDialogOpen(true);
  };

  const handleOpenCreateSub = (parentId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setNewFolderParentId(parentId);
    setNewFolderName("");
    setCreateDialogOpen(true);
  };

  const handleOpenRename = (folder: Folder, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setRenameFolderId(folder.id);
    setRenameFolderName(folder.name);
    setRenameDialogOpen(true);
  };

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

  return (
    <>
      <aside
        className="flex flex-col w-full h-full min-w-[200px] bg-sidebar text-sidebar-foreground select-none overflow-hidden"
      >
        {/* Workspace Brand / Library Header */}
        <SidebarHeader className="p-0 border-b-0 select-none shrink-0">
          {/* Top Row: macOS Traffic Lights Spacer + Collapse Button on the far right */}
          <div className="h-(--titlebar-height) pl-2 pr-2.5 flex items-center justify-between wails-drag">
            {/* Universal macOS Traffic Lights Spacer (80px blank on Mac) */}
            <MacTrafficLightSpacer className="w-[80px] h-(--titlebar-height) shrink-0" />

            {/* Draggable header filler */}
            <div className="flex-1 min-w-0 h-full" />

            {/* Collapse button: all the way to the right */}
            {onToggleCollapse && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onToggleCollapse}
                title="Collapse Sidebar (⌘B)"
                className="size-7 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg shrink-0 wails-no-drag"
              >
                <PanelLeftClose className="size-4" />
              </Button>
            )}
          </div>

          {/* Library Select Row: Unified padding with items, height h-9 matches main header Div 2 */}
          <div className="h-9 px-2 flex items-center wails-no-drag">
            <div className="flex items-center w-full gap-0.5">
              <div className="w-3.5 shrink-0" />
              <Popover open={libPopoverOpen} onOpenChange={setLibPopoverOpen}>
                <PopoverTrigger
                  className="w-fit max-w-[calc(100%-16px)] h-8 px-2 py-1 flex items-center gap-1.5 text-xs font-semibold rounded-lg hover:bg-sidebar-accent/80 text-sidebar-foreground transition-colors cursor-pointer outline-none border-0 shadow-none bg-transparent"
                  title={library.name}
                >
                  <Layers3 className="size-4 shrink-0 text-foreground/80" />
                  <span className="truncate max-w-[140px] leading-tight">{library.name}</span>
                  <ChevronsUpDown className="size-3 text-muted-foreground/70 shrink-0" />
                </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={4}
                className="w-64 p-0 rounded-xl shadow-xl border border-neutral-300 dark:border-neutral-700 bg-popover text-popover-foreground z-50 overflow-hidden ring-0"
              >
                <Command className="rounded-xl">
                  <CommandInput placeholder="Search library..." className="h-8 text-xs" />
                  <CommandList className="max-h-64 p-1">
                    <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                      No libraries found
                    </CommandEmpty>
                    <CommandGroup>
                      {/* Current library item without redundant "当前资源库" label */}
                      <CommandItem
                        value={`${library.name} ${library.path}`}
                        onSelect={() => setLibPopoverOpen(false)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer bg-accent/40 font-medium"
                      >
                        <Layers3 className="size-3.5 text-primary shrink-0" />
                        <span className="truncate flex-1 text-xs">{library.name}</span>
                        <Check className="size-3.5 text-primary shrink-0" />
                      </CommandItem>

                      {/* Recent libraries without redundant "最近使用的资源库" label */}
                      {otherRecentLibraries.map((p) => {
                        const normalized = p.replace(/[/\\]+$/, "");
                        const parts = normalized.split(/[/\\]/);
                        const lastPart = parts[parts.length - 1] || p;
                        const displayName = lastPart.endsWith(".library") ? lastPart.slice(0, -8) : lastPart;
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
                        <span>Open Library...</span>
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
                        <span>Close Library</span>
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
              </Popover>
            </div>
          </div>
        </SidebarHeader>

        {/* Directory Navigation Tree */}
        <SidebarContent className="px-2 py-2.5 space-y-3.5 flex-1 overflow-y-auto">
          {/* Top Views: All Assets + Trash (no "资产视图" label) */}
          <SidebarGroup className="py-0">
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {/* 1. All Assets */}
                <SidebarMenuItem>
                  <div className="flex items-center w-full gap-0.5">
                    <div className="w-3.5 shrink-0" />
                    <button
                      type="button"
                      onClick={() => onSelectFolder(null)}
                      className={cn(
                        "flex-1 flex items-center gap-2 min-w-0 h-8 px-2 rounded-lg text-left text-xs transition-colors cursor-pointer",
                        activeFolderId === null
                          ? "bg-primary/10 text-primary font-semibold shadow-2xs"
                          : "hover:bg-sidebar-accent/70 text-sidebar-foreground"
                      )}
                    >
                      <Library className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1 text-xs">All</span>
                      <SidebarMenuBadge className="text-[10px] font-mono px-1.5 py-0 bg-sidebar-accent/80">
                        {totalItemCount}
                      </SidebarMenuBadge>
                    </button>
                  </div>
                </SidebarMenuItem>

                {/* 2. Trash (future recycling bin integration) */}
                <SidebarMenuItem>
                  <div className="flex items-center w-full gap-0.5">
                    <div className="w-3.5 shrink-0" />
                    <button
                      type="button"
                      onClick={() => onSelectFolder("__trash__")}
                      className={cn(
                        "flex-1 flex items-center gap-2 min-w-0 h-8 px-2 rounded-lg text-left text-xs transition-colors cursor-pointer",
                        activeFolderId === "__trash__"
                          ? "bg-primary/10 text-primary font-semibold shadow-2xs"
                          : "hover:bg-sidebar-accent/70 text-sidebar-foreground"
                      )}
                    >
                      <Trash2 className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1 text-xs">Trash</span>
                      <SidebarMenuBadge className="text-[10px] font-mono px-1.5 py-0 bg-sidebar-accent/80">
                        0
                      </SidebarMenuBadge>
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
            <SidebarGroupLabel className="flex items-center justify-between text-[10px] tracking-wider text-muted-foreground/80 font-semibold pl-[18px] pr-2 h-6 select-none cursor-default">
              <span className="flex items-center gap-1.5">
                <span>Folders</span>
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
                    <p className="text-[11px] text-muted-foreground">No folders</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      Drag items here to organize
                    </p>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={handleOpenCreateRoot}
                      className="mt-2.5 text-[11px] h-6.5 gap-1 shadow-2xs"
                    >
                      <Plus className="size-3" />
                      <span>New Folder</span>
                    </Button>
                  </div>
                ) : (
                  folders.map((folder) => (
                    <FolderTreeItemNode
                      key={folder.id}
                      folder={folder}
                      activeFolderId={activeFolderId}
                      expanded={!!expandedFolders[folder.id]}
                      onToggleExpand={toggleFolderExpand}
                      onSelectFolder={onSelectFolder}
                      onCreateSubfolder={handleOpenCreateSub}
                      onRenameFolder={handleOpenRename}
                      onDeleteFolder={onDeleteFolder}
                      onDropItemOnFolder={onDropItemOnFolder}
                      onDropExternalFilesOnFolder={onDropExternalFilesOnFolder}
                      onOpenContextMenu={(e, f) => {
                        setFolderContextMenu({
                          position: { x: e.clientX, y: e.clientY },
                          folder: f,
                        });
                      }}
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
              {newFolderParentId ? "New Subfolder" : "New Folder"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleConfirmCreate} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Folder Name</label>
              <Input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g. Design, Inspiration..."
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
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!newFolderName.trim()}
                className="h-7 text-xs"
              >
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog for renaming folder */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="max-w-xs text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Rename Folder</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleConfirmRename} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">New Name</label>
              <Input
                autoFocus
                value={renameFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Enter new name..."
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
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!renameFolderName.trim()}
                className="h-7 text-xs"
              >
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Desktop context menu for folders */}
      <FolderContextMenu
        position={folderContextMenu?.position || null}
        folder={folderContextMenu?.folder || null}
        onClose={() => setFolderContextMenu(null)}
        onCreateSubfolder={(parentId) => handleOpenCreateSub(parentId)}
        onCreateRootFolder={handleOpenCreateRoot}
        onRenameFolder={(f) => handleOpenRename(f)}
        onDeleteFolder={async (id, name) => {
          if (window.confirm(`Are you sure you want to delete folder "${name}"?`)) {
            await onDeleteFolder(id);
          }
        }}
      />
    </>
  );
}

interface FolderTreeItemNodeProps {
  folder: Folder;
  activeFolderId: string | null;
  expanded: boolean;
  onToggleExpand: (folderId: string, e?: React.MouseEvent) => void;
  onSelectFolder: (folderId: string) => void;
  onCreateSubfolder: (parentId: string, e?: React.MouseEvent) => void;
  onRenameFolder: (folder: Folder, e?: React.MouseEvent) => void;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onDropItemOnFolder?: (itemId: string, folderId: string) => Promise<void>;
  onDropExternalFilesOnFolder?: (fileList: FileList, folderId: string) => Promise<void>;
  onOpenContextMenu: (e: React.MouseEvent, folder: Folder) => void;
  depth?: number;
}

function FolderTreeItemNode({
  folder,
  activeFolderId,
  expanded,
  onToggleExpand,
  onSelectFolder,
  onCreateSubfolder,
  onRenameFolder,
  onDeleteFolder,
  onDropItemOnFolder,
  onDropExternalFilesOnFolder,
  onOpenContextMenu,
  depth = 0,
}: FolderTreeItemNodeProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const hasChildren = folder.children && folder.children.length > 0;
  const isSelected = activeFolderId === folder.id;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    // 1. Intra-app asset drag: add reference to folder (supports multi-selection)
    const itemIdsJson = e.dataTransfer.getData("application/x-bowerbird-item-ids");
    if (itemIdsJson && onDropItemOnFolder) {
      try {
        const ids = JSON.parse(itemIdsJson);
        if (Array.isArray(ids) && ids.length > 0) {
          for (const id of ids) {
            await onDropItemOnFolder(id, folder.id);
          }
          return;
        }
      } catch {
        // fallback to single item ID
      }
    }
    const itemId = e.dataTransfer.getData("application/x-bowerbird-item-id");
    if (itemId && onDropItemOnFolder) {
      await onDropItemOnFolder(itemId, folder.id);
      return;
    }

    // 2. External file drop: import directly into this folder
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onDropExternalFilesOnFolder) {
      await onDropExternalFilesOnFolder(e.dataTransfer.files, folder.id);
      return;
    }
  };

  return (
    <SidebarMenuItem className="group/item relative select-none">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenContextMenu(e, folder);
        }}
        className="flex items-center w-full gap-0.5"
      >
        {/* Chevron arrow: OUTSIDE highlight, does NOT participate in highlighting */}
        <button
          type="button"
          onClick={(e) => onToggleExpand(folder.id, e)}
          className={cn(
            "size-3.5 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-transform cursor-pointer",
            hasChildren ? "visible" : "invisible pointer-events-none"
          )}
        >
          {expanded ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
        </button>

        {/* Highlighted name portion: ONLY this button receives highlight */}
        <button
          type="button"
          onClick={() => onSelectFolder(folder.id)}
          className={cn(
            "flex-1 flex items-center gap-2 min-w-0 h-8 px-2 rounded-lg text-left text-xs transition-colors cursor-pointer",
            isDragOver && "bg-primary/20 ring-2 ring-primary ring-inset text-primary font-medium",
            !isDragOver && isSelected && "bg-primary/10 text-primary font-semibold shadow-2xs",
            !isDragOver && !isSelected && "hover:bg-sidebar-accent/70 text-sidebar-foreground"
          )}
        >
          {isSelected || expanded ? (
            <FolderOpen className={cn("size-3.5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
          ) : (
            <FolderIcon className={cn("size-3.5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
          )}
          <span className="truncate flex-1">{folder.name}</span>
          {isDragOver ? (
            <span className="text-[9px] bg-primary text-primary-foreground font-semibold px-1 rounded animate-pulse">
              + 引用
            </span>
          ) : (
            folder.itemCount !== undefined && folder.itemCount > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0 rounded text-muted-foreground/70 bg-sidebar-accent/50">
                {folder.itemCount}
              </span>
            )
          )}
        </button>
      </div>

      {/* Recursive children rendering with tree guides */}
      {hasChildren && expanded && (
        <SidebarMenuSub className="ml-3.5 border-l border-sidebar-border/80 pl-2 my-0.5 space-y-0.5">
          {folder.children!.map((child) => (
            <FolderTreeItemNode
              key={child.id}
              folder={child}
              activeFolderId={activeFolderId}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onSelectFolder={onSelectFolder}
              onCreateSubfolder={onCreateSubfolder}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onDropItemOnFolder={onDropItemOnFolder}
              onDropExternalFilesOnFolder={onDropExternalFilesOnFolder}
              onOpenContextMenu={onOpenContextMenu}
              depth={depth + 1}
            />
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}

interface FolderContextMenuProps {
  position: { x: number; y: number } | null;
  folder: Folder | null;
  onClose: () => void;
  onCreateSubfolder: (parentId: string) => void;
  onCreateRootFolder: () => void;
  onRenameFolder: (folder: Folder) => void;
  onDeleteFolder: (folderId: string, folderName: string) => Promise<void>;
}

function FolderContextMenu({
  position,
  folder,
  onClose,
  onCreateSubfolder,
  onCreateRootFolder,
  onRenameFolder,
  onDeleteFolder,
}: FolderContextMenuProps) {
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
      className="fixed z-50 min-w-[145px] rounded-xl border border-border bg-popover/95 p-1 text-popover-foreground shadow-xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 select-none wails-no-drag"
    >
      {folder ? (
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
            <span>New Subfolder...</span>
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
            <span>Rename...</span>
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
            <span>Delete Folder</span>
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
          <span>New Folder...</span>
        </button>
      )}
    </div>
  );
}
