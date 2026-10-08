import { useState } from "react";
import {
  FolderOpen,
  Trash2,
  Folder as FolderIcon,
  Plus,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Item, Folder } from "../../bindings/bowerbird/core/models";
import { formatBytes, getFileCategory } from "@/lib/formatters";
import { UniversalThumbnail } from "./UniversalThumbnail";

export interface MultiItemInspectorProps {
  selectedItems: Item[];
  allFolders: Folder[];
  activeFolderId: string | null;
  onClearSelection: () => void;
  onBatchReveal: () => void;
  onBatchDelete: () => void;
  onBatchAddToFolder: (folderId: string) => void;
  onBatchRemoveFromFolder?: (folderId: string) => void;
  onBatchRestore?: () => void;
}

export function MultiItemInspector({
  selectedItems,
  allFolders,
  activeFolderId,
  onClearSelection,
  onBatchReveal,
  onBatchDelete,
  onBatchAddToFolder,
  onBatchRemoveFromFolder,
  onBatchRestore,
}: MultiItemInspectorProps) {
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  // Take up to the last 7 selected items to stack like newspapers
  const stackedItems = selectedItems.slice(-7);
  const totalSizeBytes = selectedItems.reduce((acc, curr) => acc + (curr.size || 0), 0);

  // Group by extension
  const extensionCounts: Record<string, number> = {};
  for (const item of selectedItems) {
    const ext = (item.extension || "other").toUpperCase();
    extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
  }

  // Flatten folders tree
  const flatFolderList: { id: string; name: string }[] = [];
  const collect = (list: Folder[], prefix = "") => {
    for (const f of list) {
      const name = prefix ? `${prefix} / ${f.name}` : f.name;
      flatFolderList.push({ id: f.id, name });
      if (f.children && f.children.length > 0) {
        collect(f.children, name);
      }
    }
  };
  collect(allFolders);

  return (
    <aside className="w-full h-full border-l-0 bg-sidebar/40 flex flex-col select-none overflow-hidden">
      {/* Inspector Body - Directly show info without header */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* Newspaper-style overlapping stack preview (fixed height, adapted width maintaining aspect ratio) */}
        <div className="relative w-full h-48 flex items-center justify-center my-1 select-none">
          {stackedItems.map((item, idx) => {
            const offsetFromTop = (stackedItems.length - 1) - idx;
            const presets = [
              { rotate: 0, x: 0, y: 0 },
              { rotate: -4, x: -6, y: 3 },
              { rotate: 5, x: 5, y: 5 },
              { rotate: -7, x: -10, y: 8 },
              { rotate: 7, x: 9, y: 11 },
              { rotate: -10, x: -13, y: 14 },
              { rotate: 9, x: 12, y: 16 },
            ];
            const preset = presets[Math.min(offsetFromTop, presets.length - 1)];

            const STACK_HEIGHT = 135;
            const ratio = (() => {
              if (item.width && item.height && item.width > 0 && item.height > 0) {
                return Math.max(0.55, Math.min(2.1, item.width / item.height));
              }
              const category = getFileCategory(item.extension);
              if (category === "document") return 0.75;
              if (category === "video") return 1.77;
              if (category === "audio") return 1.0;
              return 1.25;
            })();
            const calculatedWidth = Math.round(STACK_HEIGHT * ratio);

            return (
              <div
                key={item.id}
                style={{
                  zIndex: idx + 1,
                  height: `${STACK_HEIGHT}px`,
                  width: `${calculatedWidth}px`,
                  transform: `translate(${preset.x}px, ${preset.y}px) rotate(${preset.rotate}deg)`,
                }}
                className="absolute rounded-sm overflow-hidden border border-border/80 bg-card shadow-md transition-transform hover:scale-105 cursor-grab active:cursor-grabbing"
              >
                <UniversalThumbnail
                  item={item}
                  height={STACK_HEIGHT}
                  width={calculatedWidth}
                  draggable={true}
                  objectFit="cover"
                  showFormatBadge={false}
                  className="w-full h-full border-none bg-transparent"
                />
              </div>
            );
          })}
        </div>

        {/* Selection summary */}
        <div className="text-center space-y-0.5 pt-1">
          <p className="text-xs font-semibold text-foreground">
            {selectedItems.length} items selected
          </p>
          <p className="text-[10px] text-muted-foreground font-mono">
            {formatBytes(totalSizeBytes)}
          </p>
        </div>

        {/* Batch Action Buttons */}
        {activeFolderId === "__trash__" ? (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              variant="outline"
              size="xs"
              onClick={onBatchRestore}
              className="h-7 text-[11px] gap-1.5 text-primary hover:text-primary"
              title="放回原处"
            >
              <RotateCcw className="size-3" />
              <span>放回原处 ({selectedItems.length})</span>
            </Button>

            <Button
              variant="destructive"
              size="xs"
              onClick={onBatchDelete}
              className="h-7 text-[11px] gap-1.5"
              title="彻底删除"
            >
              <Trash2 className="size-3" />
              <span>彻底删除 ({selectedItems.length})</span>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              variant="outline"
              size="xs"
              onClick={onBatchReveal}
              className="h-7 text-[11px] gap-1.5"
              title="在访达中显示"
            >
              <FolderOpen className="size-3" />
              <span>在访达中显示</span>
            </Button>

            <Button
              variant="destructive"
              size="xs"
              onClick={onBatchDelete}
              className="h-7 text-[11px] gap-1.5"
              title="丢到回收站"
            >
              <Trash2 className="size-3" />
              <span>丢到回收站 ({selectedItems.length})</span>
            </Button>
          </div>
        )}

        <Separator className="bg-border/60" />

        {/* Batch Folder Assignment */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Folders
            </span>
            {flatFolderList.length > 0 && (
              <button
                onClick={() => setShowFolderPicker(!showFolderPicker)}
                className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
              >
                <Plus className="size-2.5" />
                <span>Add to folder...</span>
              </button>
            )}
          </div>

          {/* Folder dropdown picker */}
          {showFolderPicker && flatFolderList.length > 0 && (
            <div className="p-2 rounded-lg border border-border bg-card shadow-md space-y-1">
              <div className="text-[10px] text-muted-foreground px-1 pb-1 font-medium">
                Add {selectedItems.length} items to:
              </div>
              <div className="max-h-36 overflow-y-auto space-y-0.5">
                {flatFolderList.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      onBatchAddToFolder(f.id);
                      setShowFolderPicker(false);
                    }}
                    className="w-full text-left px-2 py-1 rounded text-[11px] hover:bg-muted flex items-center gap-1.5 truncate"
                  >
                    <FolderIcon className="size-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeFolderId && onBatchRemoveFromFolder && (
            <Button
              variant="outline"
              size="xs"
              onClick={() => onBatchRemoveFromFolder(activeFolderId)}
              className="w-full h-7 text-[11px] text-destructive hover:bg-destructive/10 border-destructive/30"
            >
              <span>Remove from Current Folder</span>
            </Button>
          )}
        </div>

        <Separator className="bg-border/60" />

        {/* Combined Metadata Summary */}
        <div className="space-y-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Summary
          </span>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Count</span>
              <span className="font-mono font-medium">{selectedItems.length}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total Size</span>
              <span className="font-mono font-semibold text-foreground">
                {formatBytes(totalSizeBytes)}
              </span>
            </div>

            <div className="pt-1.5 border-t border-border/40">
              <div className="text-[10px] text-muted-foreground mb-1">Formats:</div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(extensionCounts).map(([ext, count]) => (
                  <Badge key={ext} variant="secondary" className="text-[9px] font-mono h-4.5 px-1.5">
                    {ext}: {count}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
