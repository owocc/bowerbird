import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Eye,
  FolderOpen,
  Trash2,
  Copy,
  Check,
  Folder as FolderIcon,
  Plus,
  HardDrive,
  Star,
  Tag as TagIcon,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { UniversalThumbnail } from "./UniversalThumbnail";
import type { Item, Folder, Tag as TagModel } from "../../bindings/bowerbird/core/models";
import { AddItemToFolder, RemoveItemFromFolder, AddTagToItem, RemoveTagFromItem, ToggleFavorite } from "../../bindings/bowerbird/core/service";
import { formatBytes, formatDate, escapePathForShell } from "@/lib/formatters";
import { FAVORITE_TAG } from "@/lib/favoriteTag";
import { cn } from "cn";

export interface ItemDetailPanelProps {
  item: Item | null;
  currentFolder: Folder | null;
  allFolders: Folder[];
  allTags?: TagModel[];
  totalItemCount: number;
  totalSizeBytes?: number;
  isTrashView?: boolean;
  onClose?: () => void;
  onPreview?: () => void;
  onReveal?: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
  onToggleFavorite?: () => void;
  onFolderUpdated?: () => void;
  onTagsUpdated?: () => void;
}

export function ItemDetailPanel({
  item,
  currentFolder,
  allFolders,
  allTags = [],
  totalItemCount,
  totalSizeBytes = 0,
  isTrashView = false,
  onClose,
  onPreview,
  onReveal,
  onDelete,
  onRestore,
  onToggleFavorite,
  onFolderUpdated,
  onTagsUpdated,
}: ItemDetailPanelProps) {
  const { t } = useTranslation();
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedHex, setCopiedHex] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  const [showTagInput, setShowTagInput] = useState(false);
  const [newTagText, setNewTagText] = useState("");
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
      console.error("Failed to add item to folder:", err);
    }
  };

  // Handle removing item from folder
  const handleRemoveFromFolder = async (folderId: string) => {
    if (!item) return;
    try {
      await RemoveItemFromFolder(item.id, folderId);
      onFolderUpdated?.();
    } catch (err) {
      console.error("Failed to remove item from folder:", err);
    }
  };

  // If no item is selected, display library / current directory summary
  if (!item) {
    return (
      <aside className="w-full h-full border-l-0 bg-sidebar/30 flex flex-col select-none overflow-y-auto">

        <div className="p-5 space-y-6 flex-1 text-xs">
          {/* Current view card */}
          <div className="p-4 rounded-xl border border-border/80 bg-card/60 shadow-2xs space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                {currentFolder ? <FolderIcon className="size-4.5" /> : <HardDrive className="size-4.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-sm truncate">
                  {currentFolder ? currentFolder.name : t("inspector.allAssets")}
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  {t("inspector.totalItems", { count: totalItemCount })}
                </p>
              </div>
            </div>

            {totalSizeBytes > 0 && (
              <div className="flex items-center justify-between text-[11px] pt-2 border-t border-border/60 text-muted-foreground">
                <span>{t("inspector.storageUsed")}</span>
                <span className="font-mono text-foreground">{formatBytes(totalSizeBytes)}</span>
              </div>
            )}
          </div>

          {/* Quick shortcuts cheat sheet */}
          <div className="space-y-2.5">
            <h5 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t("inspector.desktopShortcuts")}
            </h5>
            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-2.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("inspector.quickPreview")}</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px]">
                  {t("inspector.shortcutSpace")}
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("inspector.doubleClickFile")}</span>
                <span className="text-muted-foreground font-mono">{t("inspector.viewFullscreen")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("inspector.importFiles")}</span>
                <span className="text-muted-foreground">{t("inspector.dragOrClickTopRight")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("inspector.pasteClipboard")}</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px]">
                  Cmd + V
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("inspector.exportToFinder")}</span>
                <span className="text-muted-foreground">{t("inspector.dragOutCard")}</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg border border-border/40 bg-muted/10 text-center text-muted-foreground text-[11px] leading-relaxed">
            {t("inspector.emptyHint")}
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

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* Large Thumbnail Preview Box */}
        {/* Large Thumbnail Preview Box using UniversalThumbnail */}
        <div
          onClick={onPreview}
          className="group relative aspect-square w-full rounded-sm overflow-hidden border border-border/80 bg-muted/20 cursor-pointer flex items-center justify-center shadow-xs hover:border-primary/60 transition-all"
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
              <span>{t("inspector.spaceToPreview")}</span>
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
        {isTrashView ? (
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <Button
              variant="outline"
              size="xs"
              onClick={onRestore}
              className="h-7 text-[11px] gap-1 text-primary hover:text-primary"
              title={t("inspector.restore")}
            >
              <RotateCcw className="size-3" />
              <span>{t("inspector.restore")}</span>
            </Button>
            <Button
              variant="destructive"
              size="xs"
              onClick={onDelete}
              className="h-7 text-[11px] gap-1"
              title={t("inspector.deletePermanentlyHint")}
            >
              <Trash2 className="size-3" />
              <span>{t("inspector.deletePermanently")}</span>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1 pt-1">
            <Button
              variant="outline"
              size="xs"
              onClick={onPreview}
              className="h-7 text-[11px] px-1 gap-1"
              title={t("inspector.previewTitle")}
            >
              <Eye className="size-3" />
              <span>{t("inspector.preview")}</span>
            </Button>

            <Button
              variant="outline"
              size="xs"
              onClick={onReveal}
              className="h-7 text-[11px] px-1 gap-1"
              title={t("inspector.revealInFinder")}
            >
              <FolderOpen className="size-3" />
              <span>{t("inspector.revealInFinder")}</span>
            </Button>

            <Button
              variant={item.tags?.includes(FAVORITE_TAG) ? "secondary" : "outline"}
              size="xs"
              onClick={async () => {
                if (onToggleFavorite) {
                  onToggleFavorite();
                } else {
                  await ToggleFavorite(item.id);
                  onTagsUpdated?.();
                }
              }}
              className={cn(
                "h-7 text-[11px] px-1 gap-1",
                item.tags?.includes(FAVORITE_TAG) && "text-amber-500 font-medium"
              )}
              title={t("inspector.favoriteHint")}
            >
              <Star
                className={cn(
                  "size-3",
                  item.tags?.includes(FAVORITE_TAG) && "fill-amber-500"
                )}
              />
              <span>{item.tags?.includes(FAVORITE_TAG) ? t("inspector.favorited") : t("inspector.favorite")}</span>
            </Button>

            <Button
              variant="destructive"
              size="xs"
              onClick={onDelete}
              className="h-7 text-[11px] px-1 gap-1"
              title={t("inspector.moveToTrash")}
            >
              <Trash2 className="size-3" />
              <span>{t("common.delete")}</span>
            </Button>
          </div>
        )}
        <Separator className="bg-border/60" />

        {/* Folders Section (Directory memberships) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t("inspector.foldersCount", { count: assignedFolders.length })}
            </span>
            {unassignedFolders.length > 0 && (
              <button
                onClick={() => setShowFolderPicker(!showFolderPicker)}
                className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
              >
                <Plus className="size-2.5" />
                <span>{t("inspector.addToFolder")}</span>
              </button>
            )}
          </div>

          {/* Folder picker dropdown */}
          {showFolderPicker && unassignedFolders.length > 0 && (
            <div className="p-2 rounded-lg border border-border bg-card shadow-md space-y-1">
              <div className="text-[10px] text-muted-foreground px-1 pb-1 font-medium">{t("inspector.selectTargetFolder")}</div>
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
              {t("inspector.noFolder")}
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
                    title={t("inspector.removeFromFolder")}
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

        {/* Tags Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t("inspector.tagsCount", { count: item.tags?.length || 0 })}
            </span>
            {!isTrashView && (
              <button
                onClick={() => setShowTagInput(!showTagInput)}
                className="text-[10px] text-primary hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <Plus className="size-2.5" />
                <span>{t("inspector.addTag")}</span>
              </button>
            )}
          </div>

          {/* Tag add input */}
          {showTagInput && !isTrashView && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const clean = newTagText.trim();
                if (!clean) return;
                await AddTagToItem(item.id, clean);
                setNewTagText("");
                setShowTagInput(false);
                onTagsUpdated?.();
              }}
              className="flex items-center gap-1"
            >
              <input
                autoFocus
                value={newTagText}
                onChange={(e) => setNewTagText(e.target.value)}
                placeholder={t("inspector.tagPlaceholder")}
                className="flex-1 h-6 px-2 text-[11px] rounded border border-border bg-card text-foreground"
              />
              <Button type="submit" size="xs" className="h-6 px-2 text-[10px]">
                {t("inspector.add")}
              </Button>
            </form>
          )}

          {/* Tag Badges */}
          {!item.tags || item.tags.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">
              {t("inspector.noTags")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className={cn(
                    "text-[10px] gap-1 pl-2 pr-1 py-0.5 font-normal h-5",
                    tag === FAVORITE_TAG && "border border-amber-500/40 text-amber-500 bg-amber-500/10"
                  )}
                >
                  {tag === FAVORITE_TAG ? (
                    <Star className="size-2.5 fill-amber-500" />
                  ) : (
                    <TagIcon className="size-2.5 text-muted-foreground" />
                  )}
                  <span className="max-w-[120px] truncate">{tag === FAVORITE_TAG ? t("common.favorites") : tag}</span>
                  {!isTrashView && (
                    <button
                      onClick={async () => {
                        await RemoveTagFromItem(item.id, tag);
                        onTagsUpdated?.();
                      }}
                      title={t("inspector.removeTag")}
                      className="hover:text-destructive p-0.5 rounded cursor-pointer"
                    >
                      <X className="size-2.5" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <Separator className="bg-border/60" />

        {/* Basic Metadata */}
        <div className="space-y-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {t("inspector.basicProperties")}
          </span>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5 space-y-2 text-[11px]">
            {item.width > 0 && item.height > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("inspector.dimensions")}</span>
                <span className="font-mono text-foreground font-medium">
                  {item.width} × {item.height} px
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("inspector.fileSize")}</span>
              <span className="font-mono text-foreground">{formatBytes(item.size)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("inspector.extension")}</span>
              <span className="font-mono uppercase font-semibold text-foreground">
                {item.extension}
              </span>
            </div>
            {item.mimeType && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("inspector.mimeType")}</span>
                <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[150px]">
                  {item.mimeType}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("inspector.importedAt")}</span>
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
                {t("inspector.contentHash")}
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
                <span>{copiedHex ? t("inspector.copied") : t("common.copy")}</span>
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
              {t("inspector.physicalPath")}
            </span>
            <button
              onClick={async () => {
                const plainPath = item.filePath || (item.itemPath ? `${item.itemPath}/${item.filename}` : shellPath);
                await navigator.clipboard.writeText(plainPath);
                setCopiedPath(true);
                setTimeout(() => setCopiedPath(false), 1500);
              }}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              {copiedPath ? <Check className="size-2.5 text-green-500" /> : <Copy className="size-2.5" />}
              <span>{copiedPath ? t("inspector.copied") : t("inspector.copyFilePath")}</span>
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
