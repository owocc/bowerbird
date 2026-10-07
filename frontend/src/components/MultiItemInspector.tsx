import { useState } from "react";
import {
  X,
  FolderOpen,
  Trash2,
  Folder as FolderIcon,
  Plus,
  Files,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Item, Folder } from "../../bindings/bowerbird/core/models";
import { formatBytes } from "@/lib/formatters";
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
}: MultiItemInspectorProps) {
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  // Take the last 4 selected items to preview
  const lastSelectedItems = selectedItems.slice(-4);
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
      {/* Top Header */}
      <div className="h-12 border-b border-border/60 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Files className="size-3.5 text-primary" />
          <span className="text-xs font-semibold tracking-tight">
            已选中 {selectedItems.length} 项资产
          </span>
        </div>
        <button
          onClick={onClearSelection}
          title="取消选择"
          className="size-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* 
          ========================================================================
          MULTI-ITEM PREVIEW STACK:
          Displays previews of the last few selected files using UniversalThumbnail.
          Every thumbnail natively supports drag-out to Finder / Desktop / Terminal!
          ========================================================================
        */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              最近选中预览 (支持直接拖出)
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              {lastSelectedItems.length} / {selectedItems.length}
            </span>
          </div>

          {/* Desktop stacked overlapping cascade preview */}
          <div className="p-3 rounded-2xl border border-border/70 bg-muted/20 relative">
            <div className="grid grid-cols-2 gap-2.5">
              {lastSelectedItems.map((item, idx) => (
                <div key={item.id} className="flex flex-col gap-1 min-w-0">
                  <div className="aspect-square w-full rounded-xl overflow-hidden shadow-xs border border-border/60 bg-background/80 hover:border-primary/50 transition-colors">
                    <UniversalThumbnail
                      item={item}
                      draggable={true}
                      objectFit="cover"
                      showFormatBadge={true}
                      className="w-full h-full cursor-grab active:cursor-grabbing"
                    />
                  </div>
                  <span
                    className="text-[11px] truncate text-foreground/90 font-medium px-0.5"
                    title={item.name}
                  >
                    {item.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Batch Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button
            variant="outline"
            size="xs"
            onClick={onBatchReveal}
            className="h-7 text-[11px] gap-1.5"
            title="在访达中显示全部选中文件"
          >
            <FolderOpen className="size-3" />
            <span>在访达中定位</span>
          </Button>

          <Button
            variant="destructive"
            size="xs"
            onClick={onBatchDelete}
            className="h-7 text-[11px] gap-1.5"
            title="删除所有选中的资产"
          >
            <Trash2 className="size-3" />
            <span>删除所选 ({selectedItems.length})</span>
          </Button>
        </div>

        <Separator className="bg-border/60" />

        {/* Batch Folder Assignment */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              批量目录归类
            </span>
            {flatFolderList.length > 0 && (
              <button
                onClick={() => setShowFolderPicker(!showFolderPicker)}
                className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
              >
                <Plus className="size-2.5" />
                <span>批量添加到目录</span>
              </button>
            )}
          </div>

          {/* Folder dropdown picker */}
          {showFolderPicker && flatFolderList.length > 0 && (
            <div className="p-2 rounded-lg border border-border bg-card shadow-md space-y-1">
              <div className="text-[10px] text-muted-foreground px-1 pb-1 font-medium">
                将选中的 {selectedItems.length} 项添加至：
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
              className="w-full h-7 text-[11px] text-muted-foreground hover:text-destructive"
            >
              <span>从当前目录移出所选文件</span>
            </Button>
          )}
        </div>

        <Separator className="bg-border/60" />

        {/* Combined Metadata Summary */}
        <div className="space-y-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            所选统计汇总
          </span>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">选中数量</span>
              <span className="font-mono font-medium">{selectedItems.length} 项</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">合计占用体积</span>
              <span className="font-mono font-semibold text-foreground">
                {formatBytes(totalSizeBytes)}
              </span>
            </div>

            <div className="pt-1.5 border-t border-border/40">
              <div className="text-[10px] text-muted-foreground mb-1">包含格式分布：</div>
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
