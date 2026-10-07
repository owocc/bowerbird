import React, { useState } from "react";
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
  Sparkles,
} from "lucide-react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarMenuSub,
  SidebarFooter,
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
}: SidebarDirectoryTreeProps) {
  // Dialog state for creating a folder
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState<string | undefined>(undefined);

  // Dialog state for renaming a folder
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameFolderId, setRenameFolderId] = useState("");
  const [renameFolderName, setRenameFolderName] = useState("");

  // Set of expanded folder IDs
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

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
      <Sidebar
        side="left"
        variant="sidebar"
        className="w-64 border-r border-sidebar-border bg-sidebar/95 backdrop-blur-md select-none flex flex-col h-full"
      >
        {/* Workspace Brand / Library Header */}
        <SidebarHeader className="p-3 border-b border-sidebar-border/70">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-xs font-bold">
                <Layers3 className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-xs tracking-tight truncate text-sidebar-foreground">
                    {library.name}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[130px]" title={library.path}>
                  {library.path}
                </p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onCloseLibrary}
              title="切换资源库"
              className="size-7 text-muted-foreground hover:text-foreground shrink-0 rounded-lg hover:bg-sidebar-accent"
            >
              <LogOut className="size-3.5" />
            </Button>
          </div>
        </SidebarHeader>

        {/* Directory Navigation Tree */}
        <SidebarContent className="p-2 space-y-4 flex-1 overflow-y-auto">
          {/* Library Section: "All" view */}
          <SidebarGroup className="py-0">
            <SidebarGroupLabel className="text-[10px] tracking-wider text-muted-foreground/80 font-semibold px-2 h-6">
              资产视图
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeFolderId === null}
                    onClick={() => onSelectFolder(null)}
                    className={`h-8 gap-2.5 px-2 transition-all ${
                      activeFolderId === null
                        ? "bg-primary/10 text-primary font-semibold shadow-2xs"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/70"
                    }`}
                  >
                    <div className="size-5 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Library className="size-3.5" />
                    </div>
                    <span className="truncate flex-1 text-xs">全部资产 (All)</span>
                    <SidebarMenuBadge className="text-[10px] font-mono px-1.5 py-0 bg-sidebar-accent/80">
                      {totalItemCount}
                    </SidebarMenuBadge>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Folders Section: Hierarchical virtual folders */}
          <SidebarGroup className="py-0">
            <SidebarGroupLabel className="flex items-center justify-between text-[10px] tracking-wider text-muted-foreground/80 font-semibold px-2 h-6">
              <span className="flex items-center gap-1.5">
                <span>文件夹 (Folders)</span>
                {folders.length > 0 && (
                  <span className="text-[9px] font-mono px-1 rounded bg-muted/60 text-muted-foreground">
                    {folders.length}
                  </span>
                )}
              </span>
              <SidebarGroupAction
                onClick={handleOpenCreateRoot}
                title="新建根目录"
                className="hover:bg-sidebar-accent text-muted-foreground hover:text-foreground rounded-md size-5.5 flex items-center justify-center transition-colors"
              >
                <Plus className="size-3.5" />
              </SidebarGroupAction>
            </SidebarGroupLabel>

            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {folders.length === 0 ? (
                  <div className="py-5 px-3 text-center border border-dashed border-sidebar-border/80 rounded-xl my-1 bg-muted/5">
                    <p className="text-[11px] text-muted-foreground">暂无分类目录</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      拖拽卡片至此即可关联分类
                    </p>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={handleOpenCreateRoot}
                      className="mt-2.5 text-[11px] h-6.5 gap-1 shadow-2xs"
                    >
                      <Plus className="size-3" />
                      <span>新建目录</span>
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
                    />
                  ))
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* Sidebar Footer with system info */}
        <SidebarFooter className="p-2.5 border-t border-sidebar-border/70 mt-auto bg-sidebar/60">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono px-1">
            <span className="flex items-center gap-1">
              <Sparkles className="size-2.5 text-primary" />
              <span>拖拽添加引用</span>
            </span>
            <span>物理单份</span>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Dialog for creating folder */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-xs text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              {newFolderParentId ? "新建子目录" : "新建根目录"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleConfirmCreate} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">目录名称</label>
              <Input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="例如: 界面设计、参考灵感..."
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
                取消
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!newFolderName.trim()}
                className="h-7 text-xs"
              >
                确认创建
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog for renaming folder */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="max-w-xs text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">重命名目录</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleConfirmRename} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">新目录名称</label>
              <Input
                autoFocus
                value={renameFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="请输入新名称"
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
                取消
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!renameFolderName.trim()}
                className="h-7 text-xs"
              >
                保存修改
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
    <SidebarMenuItem className="group/item relative">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex items-center rounded-lg transition-all duration-150 ${
          isDragOver
            ? "bg-primary/20 ring-2 ring-primary ring-inset text-primary font-medium scale-[1.01] shadow-xs"
            : isSelected
            ? "bg-primary/10 text-primary font-semibold shadow-2xs"
            : "hover:bg-sidebar-accent/70 text-sidebar-foreground"
        }`}
      >
        <SidebarMenuButton
          isActive={isSelected}
          onClick={() => onSelectFolder(folder.id)}
          className={`h-7.5 gap-1.5 pl-1.5 pr-2 transition-colors ${
            isSelected
              ? "bg-transparent text-primary font-semibold"
              : "text-sidebar-foreground hover:bg-transparent"
          }`}
        >
          {/* Expand / collapse trigger for folders with children */}
          <button
            type="button"
            onClick={(e) => onToggleExpand(folder.id, e)}
            className={`p-0.5 rounded hover:bg-sidebar-accent text-muted-foreground transition-transform ${
              hasChildren ? "visible" : "invisible pointer-events-none"
            }`}
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </button>

          {/* Folder Icon with warm amber tones (Eagle / Finder style) */}
          {isSelected || expanded ? (
            <FolderOpen className="size-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
          ) : (
            <FolderIcon className="size-3.5 text-amber-500/80 dark:text-amber-400/80 shrink-0" />
          )}

          {/* Folder Name */}
          <span className="truncate flex-1 text-xs">{folder.name}</span>

          {/* Visual indicator when dragging over */}
          {isDragOver ? (
            <span className="text-[9px] bg-primary text-primary-foreground font-semibold px-1 py-0.2 rounded animate-pulse">
              + 引用
            </span>
          ) : (
            /* Item Count Badge */
            <SidebarMenuBadge className="text-[10px] font-mono px-1.5 py-0 bg-sidebar-accent/70">
              {folder.itemCount || 0}
            </SidebarMenuBadge>
          )}
        </SidebarMenuButton>

        {/* Actions button group on hover */}
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity bg-sidebar/95 backdrop-blur-xs rounded-md px-1 py-0.5 shadow-2xs border border-sidebar-border/60 z-10">
          <button
            type="button"
            onClick={(e) => onCreateSubfolder(folder.id, e)}
            title="新建子目录"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          >
            <FolderPlus className="size-3" />
          </button>
          <button
            type="button"
            onClick={(e) => onRenameFolder(folder, e)}
            title="重命名目录"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          >
            <Edit2 className="size-3" />
          </button>
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              if (window.confirm(`确定要删除目录 "${folder.name}" 吗？\n（目录只是组织结构，不会删除实际文件）`)) {
                await onDeleteFolder(folder.id);
              }
            }}
            title="删除目录 (不影响实际文件)"
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
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
              depth={depth + 1}
            />
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}
