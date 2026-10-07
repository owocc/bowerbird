import React, { useEffect, useRef, useState } from "react";
import {
  Eye,
  FolderOpen,
  Copy,
  Trash2,
  FolderPlus,
  CheckSquare,
  Square,
  Upload,
  Folder,
  ChevronRight,
  FolderMinus,
} from "lucide-react";
import type { Folder as FolderModel } from "../../bindings/bowerbird/core/models";

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface ContextMenuProps {
  position: ContextMenuPosition | null;
  onClose: () => void;
  // Selection context
  selectedCount: number;
  isItemContext: boolean;
  activeFolderId: string | null;
  allFolders: FolderModel[];
  // Actions
  onPreview?: () => void;
  onReveal?: () => void;
  onCopyPath?: () => void;
  onDelete?: () => void;
  onAddToFolder?: (folderId: string) => void;
  onRemoveFromCurrentFolder?: () => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onImportFiles?: () => void;
  onCreateFolder?: () => void;
}

export function CustomContextMenu({
  position,
  onClose,
  selectedCount,
  isItemContext,
  activeFolderId,
  allFolders,
  onPreview,
  onReveal,
  onCopyPath,
  onDelete,
  onAddToFolder,
  onRemoveFromCurrentFolder,
  onSelectAll,
  onClearSelection,
  onImportFiles,
  onCreateFolder,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [folderSubmenuOpen, setFolderSubmenuOpen] = useState(false);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!position) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [position, onClose]);

  if (!position) return null;

  // Flatten folders tree for assignment
  const flatFolders: { id: string; name: string }[] = [];
  const collect = (list: FolderModel[], prefix = "") => {
    for (const f of list) {
      const name = prefix ? `${prefix} / ${f.name}` : f.name;
      flatFolders.push({ id: f.id, name });
      if (f.children && f.children.length > 0) {
        collect(f.children, name);
      }
    }
  };
  collect(allFolders);

  // Ensure menu stays within window boundaries
  const menuWidth = 220;
  const menuHeight = isItemContext ? 280 : 180;
  const adjustedX = Math.min(position.x, window.innerWidth - menuWidth - 12);
  const adjustedY = Math.min(position.y, window.innerHeight - menuHeight - 12);

  return (
    <div
      ref={menuRef}
      style={{ left: `${adjustedX}px`, top: `${adjustedY}px` }}
      className="fixed z-50 w-56 rounded-xl border border-border/80 bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-md p-1.5 text-xs select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {isItemContext ? (
        /* ================= ITEM CONTEXT MENU ================= */
        <div className="space-y-0.5">


          <MenuItem
            icon={<Eye className="size-3.5" />}
            label="全窗口预览"
            shortcut="空格"
            onClick={() => {
              onPreview?.();
              onClose();
            }}
          />

          <MenuItem
            icon={<FolderOpen className="size-3.5" />}
            label={selectedCount > 1 ? "在访达中显示全部" : "在访达中显示"}
            onClick={() => {
              onReveal?.();
              onClose();
            }}
          />

          {selectedCount === 1 && onCopyPath && (
            <MenuItem
              icon={<Copy className="size-3.5" />}
              label="复制终端路径"
              onClick={() => {
                onCopyPath();
                onClose();
              }}
            />
          )}

          {/* Add to Folder submenu */}
          {flatFolders.length > 0 && onAddToFolder && (
            <div
              className="relative"
              onMouseEnter={() => setFolderSubmenuOpen(true)}
              onMouseLeave={() => setFolderSubmenuOpen(false)}
            >
              <button
                type="button"
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Folder className="size-3.5 text-muted-foreground" />
                  <span>添加至目录</span>
                </div>
                <ChevronRight className="size-3 text-muted-foreground" />
              </button>

              {folderSubmenuOpen && (
                <div
                  style={{
                    left: `${menuWidth - 10}px`,
                    top: "-4px",
                  }}
                  className="absolute z-50 w-48 max-h-60 overflow-y-auto rounded-xl border border-border/80 bg-popover/95 shadow-xl backdrop-blur-md p-1 space-y-0.5"
                >

                  {flatFolders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        onAddToFolder(f.id);
                        onClose();
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-left text-xs hover:bg-muted truncate"
                    >
                      <Folder className="size-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{f.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Remove from current folder if in folder */}
          {activeFolderId && onRemoveFromCurrentFolder && (
            <MenuItem
              icon={<FolderMinus className="size-3.5 text-muted-foreground" />}
              label="从当前目录移出"
              onClick={() => {
                onRemoveFromCurrentFolder();
                onClose();
              }}
            />
          )}

          <div className="my-1 border-t border-border/60" />

          <MenuItem
            icon={<Trash2 className="size-3.5 text-destructive" />}
            label={selectedCount > 1 ? `删除所选 ${selectedCount} 项` : "删除文件"}
            destructive
            onClick={() => {
              onDelete?.();
              onClose();
            }}
          />
        </div>
      ) : (
        /* ================= CANVAS/BACKGROUND CONTEXT MENU ================= */
        <div className="space-y-0.5">
          <MenuItem
            icon={<CheckSquare className="size-3.5" />}
            label="全选文件"
            shortcut="Cmd+A"
            onClick={() => {
              onSelectAll?.();
              onClose();
            }}
          />

          {selectedCount > 0 && onClearSelection && (
            <MenuItem
              icon={<Square className="size-3.5" />}
              label="取消选择"
              onClick={() => {
                onClearSelection();
                onClose();
              }}
            />
          )}

          <div className="my-1 border-t border-border/60" />

          {onImportFiles && (
            <MenuItem
              icon={<Upload className="size-3.5" />}
              label="导入本地文件..."
              onClick={() => {
                onImportFiles();
                onClose();
              }}
            />
          )}

          {onCreateFolder && (
            <MenuItem
              icon={<FolderPlus className="size-3.5" />}
              label="新建分类目录"
              onClick={() => {
                onCreateFolder();
                onClose();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  shortcut,
  destructive = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-muted"
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span>{label}</span>
      </div>
      {shortcut && (
        <span className="text-[10px] text-muted-foreground font-mono ml-3">
          {shortcut}
        </span>
      )}
    </button>
  );
}
