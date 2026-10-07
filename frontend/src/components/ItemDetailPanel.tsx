import { useState } from "react";
import {
  X,
  Eye,
  FolderOpen,
  Trash2,
  Copy,
  Check,
  Folder as FolderIcon,
  Plus,
  Info,
  HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { UniversalThumbnail } from "./UniversalThumbnail";
import type { Item, Folder } from "../../bindings/bowerbird/core/models";
import { AddItemToFolder, RemoveItemFromFolder } from "../../bindings/bowerbird/core/service";
import { formatBytes, formatDate, escapePathForShell } from "@/lib/formatters";

export interface ItemDetailPanelProps {
  item: Item | null;
  currentFolder: Folder | null;
  allFolders: Folder[];
  totalItemCount: number;
  totalSizeBytes?: number;
  onClose?: () => void;
  onPreview?: () => void;
  onReveal?: () => void;
  onDelete?: () => void;
  onFolderUpdated?: () => void;
}

export function ItemDetailPanel({
  item,
  currentFolder,
  allFolders,
  totalItemCount,
  totalSizeBytes = 0,
  onClose,
  onPreview,
  onReveal,
  onDelete,
  onFolderUpdated,
}: ItemDetailPanelProps) {
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedHex, setCopiedHex] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  // Flatten folder tree for selection
  const flattenFolders = (folders: Folder[], prefix = ""): { id: string; name: string }[] => {
    let result: { id: string; name: string }[] = [];
    for (const f of folders) {
      const displayName = prefix ? `${prefix} / ${f.name}` : f.name;
      result.push({ id: f.id, name: displayName });
      if (f.children && f.children.length > 0) {
        result = result.concat(flattenFolders(f.children, displayName));
      }
    }
    return result;
  };

  const flatFolderList = flattenFolders(allFolders);

  // Handle adding item to folder
  const handleAddToFolder = async (folderId: string) => {
    if (!item) return;
    try {
      await AddItemToFolder(item.id, folderId);
      setShowFolderPicker(false);
      onFolderUpdated?.();
    } catch (err) {
      console.error("添加到目录失败:", err);
    }
  };

  // Handle removing item from folder
  const handleRemoveFromFolder = async (folderId: string) => {
    if (!item) return;
    try {
      await RemoveItemFromFolder(item.id, folderId);
      onFolderUpdated?.();
    } catch (err) {
      console.error("从目录移出失败:", err);
    }
  };

  // If no item is selected, display library / current directory summary
  if (!item) {
    return (
      <aside className="w-full h-full border-l-0 bg-sidebar/30 flex flex-col select-none overflow-y-auto">
        <div className="h-12 border-b border-border/60 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Info className="size-3.5" />
            <span>概览信息</span>
          </div>
        </div>

        <div className="p-5 space-y-6 flex-1 text-xs">
          {/* Current view card */}
          <div className="p-4 rounded-xl border border-border/80 bg-card/60 shadow-2xs space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                {currentFolder ? <FolderIcon className="size-4.5" /> : <HardDrive className="size-4.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-sm truncate">
                  {currentFolder ? currentFolder.name : "全部资产"}
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  共计 {totalItemCount} 项资产
                </p>
              </div>
            </div>

            {totalSizeBytes > 0 && (
              <div className="flex items-center justify-between text-[11px] pt-2 border-t border-border/60 text-muted-foreground">
                <span>占用体积</span>
                <span className="font-mono text-foreground">{formatBytes(totalSizeBytes)}</span>
              </div>
            )}
          </div>

          {/* Quick shortcuts cheat sheet */}
          <div className="space-y-2.5">
            <h5 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              桌面快捷操作
            </h5>
            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-2.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">快速预览</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px]">
                  空格 (Space)
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">双击文件</span>
                <span className="text-muted-foreground font-mono">全屏查看</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">导入文件</span>
                <span className="text-muted-foreground">拖拽 / 点击右上角</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">粘贴剪贴板</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px]">
                  Cmd + V
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">导出到访达</span>
                <span className="text-muted-foreground">直接拖出卡片</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg border border-border/40 bg-muted/10 text-center text-muted-foreground text-[11px] leading-relaxed">
            点击中间任意文件即可在此处查看高分辨率缩略图与完整元数据。
          </div>
        </div>
      </aside>
    );
  }

  // Active item details view
  const shellPath =
    item.shellPath ||
    escapePathForShell(item.filePath || `${item.itemPath}/${item.filename}`);

  // Resolve assigned folder objects
  const assignedFolderIds = new Set(item.folders || []);
  const assignedFolders = flatFolderList.filter((f) => assignedFolderIds.has(f.id));
  const unassignedFolders = flatFolderList.filter((f) => !assignedFolderIds.has(f.id));

  return (
    <aside className="w-full h-full border-l-0 bg-sidebar/40 flex flex-col select-none overflow-hidden">
      {/* Top Header */}
      <div className="h-12 border-b border-border/60 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Info className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold tracking-tight truncate">文件详细信息</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            title="关闭面板"
            className="size-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* Large Thumbnail Preview Box */}
        {/* Large Thumbnail Preview Box using UniversalThumbnail */}
        <div
          onClick={onPreview}
          className="group relative aspect-square w-full rounded-2xl overflow-hidden border border-border/80 bg-muted/20 cursor-pointer flex items-center justify-center shadow-xs hover:border-primary/60 transition-all"
        >
          <UniversalThumbnail
            item={item}
            draggable={true}
            objectFit="contain"
            className="w-full h-full border-none bg-transparent cursor-grab active:cursor-grabbing"
          />
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
            <div className="px-2.5 py-1 rounded-full bg-background/90 text-foreground text-[11px] font-medium flex items-center gap-1.5 shadow-md backdrop-blur-xs">
              <Eye className="size-3" />
              <span>按空格全屏预览</span>
            </div>
          </div>
        </div>

        {/* Title and Filename */}
        <div>
          <h3 className="font-semibold text-sm leading-tight text-foreground break-all select-text">
            {item.name}
          </h3>
          <p className="text-[11px] text-muted-foreground font-mono mt-0.5 break-all select-text">
            {item.filename}
          </p>
        </div>

        {/* Action Button Row */}
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <Button
            variant="outline"
            size="xs"
            onClick={onPreview}
            className="h-7 text-[11px] gap-1"
            title="全屏预览 (空格)"
          >
            <Eye className="size-3" />
            <span>预览</span>
          </Button>

          <Button
            variant="outline"
            size="xs"
            onClick={onReveal}
            className="h-7 text-[11px] gap-1"
            title="在访达中显示"
          >
            <FolderOpen className="size-3" />
            <span>访达</span>
          </Button>

          <Button
            variant="destructive"
            size="xs"
            onClick={onDelete}
            className="h-7 text-[11px] gap-1"
            title="删除文件"
          >
            <Trash2 className="size-3" />
            <span>删除</span>
          </Button>
        </div>

        <Separator className="bg-border/60" />

        {/* Folders Section (Directory memberships) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              所属目录 ({assignedFolders.length})
            </span>
            {unassignedFolders.length > 0 && (
              <button
                onClick={() => setShowFolderPicker(!showFolderPicker)}
                className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
              >
                <Plus className="size-2.5" />
                <span>添加至目录</span>
              </button>
            )}
          </div>

          {/* Folder picker dropdown */}
          {showFolderPicker && unassignedFolders.length > 0 && (
            <div className="p-2 rounded-lg border border-border bg-card shadow-md space-y-1">
              <div className="text-[10px] text-muted-foreground px-1 pb-1 font-medium">选择目标目录：</div>
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {unassignedFolders.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => handleAddToFolder(f.id)}
                    className="w-full text-left px-2 py-1 rounded text-[11px] hover:bg-muted flex items-center gap-1.5 truncate"
                  >
                    <FolderIcon className="size-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Assigned folder pills */}
          {assignedFolders.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">
              未分配目录 (仅在全部资产中显示)
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {assignedFolders.map((f) => (
                <Badge
                  key={f.id}
                  variant="secondary"
                  className="text-[10px] gap-1 pl-2 pr-1 py-0.5 font-normal h-5"
                >
                  <FolderIcon className="size-2.5 text-muted-foreground" />
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <button
                    onClick={() => handleRemoveFromFolder(f.id)}
                    title="从该目录移出"
                    className="hover:text-destructive p-0.5 rounded"
                  >
                    <X className="size-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Separator className="bg-border/60" />

        {/* Basic Metadata */}
        <div className="space-y-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            基础属性
          </span>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5 space-y-2 text-[11px]">
            {item.width > 0 && item.height > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">尺寸大小</span>
                <span className="font-mono text-foreground font-medium">
                  {item.width} × {item.height} px
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">文件大小</span>
              <span className="font-mono text-foreground">{formatBytes(item.size)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">格式扩展名</span>
              <span className="font-mono uppercase font-semibold text-foreground">
                {item.extension}
              </span>
            </div>
            {item.mimeType && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">MIME 类型</span>
                <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[150px]">
                  {item.mimeType}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">导入时间</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {formatDate(item.importedAt)}
              </span>
            </div>
          </div>
        </div>

        {/* SHA-256 Fingerprint */}
        {item.hex && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                内容指纹 (SHA-256)
              </span>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(item.hex);
                  setCopiedHex(true);
                  setTimeout(() => setCopiedHex(false), 1500);
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {copiedHex ? <Check className="size-2.5 text-green-500" /> : <Copy className="size-2.5" />}
                <span>{copiedHex ? "已复制" : "复制"}</span>
              </button>
            </div>
            <div className="p-2 rounded-lg border border-border/60 bg-muted/20 font-mono text-[10px] text-muted-foreground break-all select-text">
              {item.hex}
            </div>
          </div>
        )}

        {/* Physical Disk Path */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              物理文件路径
            </span>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(shellPath);
                setCopiedPath(true);
                setTimeout(() => setCopiedPath(false), 1500);
              }}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              {copiedPath ? <Check className="size-2.5 text-green-500" /> : <Copy className="size-2.5" />}
              <span>{copiedPath ? "已复制" : "终端转义路径"}</span>
            </button>
          </div>
          <div className="p-2 rounded-lg border border-border/60 bg-muted/20 font-mono text-[10px] text-muted-foreground break-all select-text max-h-24 overflow-y-auto">
            {shellPath}
          </div>
        </div>
      </div>
    </aside>
  );
}
