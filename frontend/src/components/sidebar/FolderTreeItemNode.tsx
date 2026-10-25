import React from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  FolderOpen,
} from "lucide-react";

import {
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import { isInternalDragActive } from "@/lib/drag-state";
import { cn } from "@/lib/utils";
import type { Folder } from "../../../bindings/bowerbird/core/models";

import { readDraggedItemIds } from "./drag-payload";
import {
  SIDEBAR_COUNT_CLASS,
  SIDEBAR_DROP_MASK_PASSIVE,
  SIDEBAR_DROP_MASK_PRIMARY,
  sidebarRowClass,
} from "./styles";

export interface FolderTreeItemNodeProps {
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

/** One (recursive) row in the folder tree. */
export const FolderTreeItemNode = React.memo(function FolderTreeItemNode({
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

    const ids = readDraggedItemIds(e.dataTransfer);
    if (ids.length > 0 && onMoveItemToFolder) {
      for (const id of ids) {
        await onMoveItemToFolder(id, activeFolderId || "", folder.id);
      }
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
          className={sidebarRowClass(isSelected)}
        >
          {isSelected || expanded ? (
            <FolderOpen
              className={cn(
                "size-3.5 shrink-0 pointer-events-none",
                isSelected
                  ? "text-sidebar-foreground"
                  : "text-muted-foreground"
              )}
            />
          ) : (
            <FolderIcon
              className={cn(
                "size-3.5 shrink-0 pointer-events-none",
                isSelected
                  ? "text-sidebar-foreground"
                  : "text-muted-foreground"
              )}
            />
          )}
          <span className="truncate flex-1 pointer-events-none">
            {folder.name}
          </span>
          <span
            className={cn(
              SIDEBAR_COUNT_CLASS,
              "py-0 rounded pointer-events-none"
            )}
          >
            {folder.itemCount ?? 0}
          </span>

          {isDragOver && <div className={SIDEBAR_DROP_MASK_PRIMARY} />}
          <div className={SIDEBAR_DROP_MASK_PASSIVE} />
        </button>
      </div>

      {hasChildren && expanded && (
        <SidebarMenuSub className="ml-7.5 border-l border-sidebar-border pl-2 my-0.5 space-y-0.5">
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
