import { useEffect, useMemo, useRef } from "react";
import { default as Edit2 } from "~icons/ri/edit-line";
import { default as FolderPlus } from "~icons/ri/folder-add-line";
import { default as Puzzle } from "~icons/ri/puzzle-line";
import { default as Trash2 } from "~icons/ri/delete-bin-line";
import { useTranslation } from "react-i18next";

import {
  previewRegistry,
  type PluginContextMenuContext,
} from "@/plugins/preview/registry";
import type { Folder, Item } from "../../../bindings/bowerbird/core/models";
import { SidebarMenuItemButton, SidebarMenuSeparator } from "./SidebarMenuItemButton";

export interface FolderContextMenuProps {
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

/** Desktop right-click menu for the folders section and the trash row. */
export function FolderContextMenu({
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

  const pluginContext = useMemo<PluginContextMenuContext<Item> | null>(() => {
    if (!folder) return null;
    return {
      target: "folder",
      folder: {
        id: folder.id,
        name: folder.name,
        itemCount: folder.itemCount,
        parentId: folder.parentId,
      },
      position: position || undefined,
      // The plugin API is not wired into sidebar menus; keep the shape but do
      // not pretend to implement it.
      api: {} as unknown as PluginContextMenuContext<Item>["api"],
    };
  }, [folder, position]);

  const pluginItems = useMemo(
    () =>
      pluginContext
        ? previewRegistry.resolveContextMenuItems("folder", pluginContext)
        : [],
    [pluginContext]
  );

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
        <SidebarMenuItemButton
          destructive
          icon={<Trash2 className="size-3.5 text-destructive" />}
          onClick={() => {
            onEmptyTrash?.();
            onClose();
          }}
        >
          {t("workspace.emptyTrash")}
        </SidebarMenuItemButton>
      ) : folder ? (
        <>
          <SidebarMenuItemButton
            icon={<FolderPlus className="size-3.5 text-muted-foreground" />}
            onClick={() => {
              onCreateSubfolder(folder.id);
              onClose();
            }}
          >
            {t("sidebar.newSubfolderMenu")}
          </SidebarMenuItemButton>
          <SidebarMenuItemButton
            icon={<Edit2 className="size-3.5 text-muted-foreground" />}
            onClick={() => {
              onRenameFolder(folder);
              onClose();
            }}
          >
            {t("sidebar.renameMenu")}
          </SidebarMenuItemButton>
          <SidebarMenuSeparator />
          <SidebarMenuItemButton
            destructive
            icon={<Trash2 className="size-3.5 text-destructive" />}
            onClick={async () => {
              onClose();
              await onDeleteFolder(folder.id, folder.name);
            }}
          >
            {t("sidebar.deleteFolderMenu")}
          </SidebarMenuItemButton>
          {pluginItems.length > 0 && (
            <>
              <SidebarMenuSeparator />
              {pluginItems.map((pItem) => (
                <SidebarMenuItemButton
                  key={pItem.id}
                  icon={<Puzzle className="size-3.5 text-primary" />}
                  onClick={() => {
                    onClose();
                    if (pluginContext) pItem.onClick(pluginContext);
                  }}
                >
                  {pItem.label}
                </SidebarMenuItemButton>
              ))}
            </>
          )}
        </>
      ) : (
        <SidebarMenuItemButton
          icon={<FolderPlus className="size-3.5 text-muted-foreground" />}
          onClick={() => {
            onCreateRootFolder();
            onClose();
          }}
        >
          {t("sidebar.newFolderMenu")}
        </SidebarMenuItemButton>
      )}
    </div>
  );
}
