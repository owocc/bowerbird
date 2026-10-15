import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Copy,
  Check,
  Folder as FolderIcon,
  Plus,
  HardDrive,
  Star,
  Tag as TagIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  previewRegistry,
  usePreviewPlugins,
  createPreviewPluginHostAPI,
} from "@/plugins/preview/registry";
import type {
  Item,
  Folder,
  Tag as TagModel,
} from "../../bindings/bowerbird/core/models";
import {
  AddItemToFolder,
  RemoveItemFromFolder,
  AddTagToItem,
  RemoveTagFromItem,
} from "../../bindings/bowerbird/core/service";
import {
  formatBytes,
  formatDate,
  escapePathForShell,
} from "@/lib/formatters";
import { FAVORITE_TAG } from "@/lib/favoriteTag";
import { cn } from "@/lib/utils";
import { copyTextToClipboard } from "@/lib/clipboard";
import { toast } from "sonner";

export interface ItemDetailPanelProps {
  item: Item | null;
  currentFolder: Folder | null;
  allFolders: Folder[];
  allTags?: TagModel[];
  totalItemCount: number;
  totalSizeBytes?: number;
  isTrashView?: boolean;
  activeColorFilter?: string | null;
  onSelectColorFilter?: (hex: string | null) => void;
  onClose?: () => void;
  onPreview?: () => void;
  onReveal?: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
  onToggleFavorite?: () => void;
  onFolderUpdated?: () => void;
  onTagsUpdated?: () => void;
  onItemUpdated?: (updated: Item) => void;
}

export function ItemDetailPanel({
  item,
  currentFolder,
  allFolders,
  totalItemCount,
  totalSizeBytes = 0,
  isTrashView = false,
  activeColorFilter,
  onSelectColorFilter,
  onPreview,
  onFolderUpdated,
  onTagsUpdated,
  onItemUpdated,
}: ItemDetailPanelProps) {
  const { t } = useTranslation();
  usePreviewPlugins();
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedHex, setCopiedHex] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTagText, setNewTagText] = useState("");

  // Flatten folder tree for selection
  const flattenFolders = (
    folders: Folder[],
    prefix = ""
  ): { id: string; name: string }[] => {
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

  const handleRemoveFromFolder = async (folderId: string) => {
    if (!item) return;
    try {
      await RemoveItemFromFolder(item.id, folderId);
      onFolderUpdated?.();
    } catch (err) {
      console.error("Failed to remove item from folder:", err);
    }
  };

  // Empty state: clean accordion summary without heavy cards
  if (!item) {
    return (
      <aside className="w-full h-full border-l-0 bg-sidebar/30 flex flex-col select-none overflow-y-auto">
        <div className="p-4 space-y-4 flex-1 text-xs">
          <div className="flex items-center gap-2.5 py-2">
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
              {currentFolder ? (
                <FolderIcon className="size-4" />
              ) : (
                <HardDrive className="size-4" />
              )}
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

          <Accordion
            type="multiple"
            defaultValue={["overview", "shortcuts"]}
            className="border-t border-border/50"
          >
            {totalSizeBytes > 0 && (
              <AccordionItem value="overview">
                <AccordionTrigger>{t("inspector.basicProperties")}</AccordionTrigger>
                <AccordionContent className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {t("inspector.storageUsed")}
                    </span>
                    <span className="font-mono text-foreground">
                      {formatBytes(totalSizeBytes)}
                    </span>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            <AccordionItem value="shortcuts">
              <AccordionTrigger>{t("inspector.desktopShortcuts")}</AccordionTrigger>
              <AccordionContent className="space-y-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("inspector.quickPreview")}
                  </span>
                  <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px]">
                    {t("inspector.shortcutSpace")}
                  </kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("inspector.doubleClickFile")}
                  </span>
                  <span className="text-muted-foreground font-mono">
                    {t("inspector.viewFullscreen")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("inspector.pasteClipboard")}
                  </span>
                  <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px]">
                    Cmd + V
                  </kbd>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <p className="pt-2 text-muted-foreground/80 text-[11px] leading-relaxed">
            {t("inspector.emptyHint")}
          </p>
        </div>
      </aside>
    );
  }

  const shellPath =
    item.shellPath ||
    escapePathForShell(item.filePath || `${item.itemPath}/${item.filename}`);

  const assignedFolderIds = new Set(item.folders || []);
  const assignedFolders = flatFolderList.filter((f) => assignedFolderIds.has(f.id));
  const unassignedFolders = flatFolderList.filter((f) => !assignedFolderIds.has(f.id));

  const plugin = previewRegistry.resolve(item);
  const PluginInspectorPreview = plugin.InspectorPreview;
  const hostApi = createPreviewPluginHostAPI(item, (updated) => {
    onItemUpdated?.(updated);
    onFolderUpdated?.();
  });

  const paletteColors =
    item.palette && item.palette.length > 0
      ? item.palette
      : item.dominantColor
      ? [item.dominantColor]
      : [];

  const meta = item.meta;
  const hasExtendedMeta = Boolean(
    meta &&
      (meta.colorModel ||
        meta.aspectRatio ||
        meta.orientation ||
        meta.megapixels ||
        meta.exifMake ||
        meta.exifModel ||
        meta.exifDate)
  );

  return (
    <aside className="w-full h-full border-l-0 bg-sidebar/40 flex flex-col select-none overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-xs">
        {/* Borderless, centered adaptive preview powered by PreviewPlugin */}
        <div className="w-full flex items-center justify-center">
          <PluginInspectorPreview item={item} onOpenPreview={onPreview} api={hostApi} />
        </div>

        {/* Dominant Color Palette Swatches (if extracted) */}
        {paletteColors.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 py-0.5">
            {paletteColors.slice(0, 6).map((hex) => {
              const isColorActive =
                activeColorFilter?.toLowerCase() === hex.toLowerCase();
              return (
                <button
                  key={hex}
                  type="button"
                  onClick={async () => {
                    if (await copyTextToClipboard(hex)) {
                      toast.success(t("inspector.colorCopied", { hex }));
                    }
                    if (onSelectColorFilter) {
                      onSelectColorFilter(isColorActive ? null : hex);
                    }
                  }}
                  title={t("inspector.filterByColor", { hex })}
                  style={{ backgroundColor: hex }}
                  className={cn(
                    "h-4 flex-1 max-w-8 rounded-xs transition-transform hover:scale-110 cursor-pointer ring-1 ring-black/10 dark:ring-white/15",
                    isColorActive && "ring-2 ring-primary scale-110"
                  )}
                />
              );
            })}
          </div>
        )}

        {/* Title and Filename (no action buttons row) */}
        <div className="pt-0.5 pb-1">
          <h3 className="font-semibold text-sm leading-tight text-foreground break-all select-text">
            {item.name}
          </h3>
          <p className="text-[11px] text-muted-foreground font-mono mt-0.5 break-all select-text">
            {item.filename}
          </p>
        </div>

        {/* Accordion Metadata Sections (replaces bulky cards) */}
        <Accordion
          type="multiple"
          defaultValue={["folders", "tags", "basic", "imageMeta"]}
          className="border-t border-border/50"
        >
          {/* 1. Folders Accordion */}
          <AccordionItem value="folders">
            <AccordionTrigger
              action={
                unassignedFolders.length > 0 && !isTrashView ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowFolderPicker((v) => !v);
                    }}
                    className="text-[10px] text-primary hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <Plus className="size-2.5" />
                    <span>{t("inspector.add")}</span>
                  </button>
                ) : undefined
              }
            >
              {t("inspector.foldersCount", { count: assignedFolders.length })}
            </AccordionTrigger>
            <AccordionContent className="space-y-2">
              {showFolderPicker && unassignedFolders.length > 0 && (
                <div className="py-1 border-b border-border/50 space-y-0.5 max-h-32 overflow-y-auto">
                  {unassignedFolders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => handleAddToFolder(f.id)}
                      className="w-full text-left px-1.5 py-1 rounded text-[11px] hover:bg-muted flex items-center gap-1.5 truncate cursor-pointer"
                    >
                      <FolderIcon className="size-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{f.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {assignedFolders.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {t("inspector.noFolder")}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {assignedFolders.map((f) => (
                    <Badge
                      key={f.id}
                      variant="secondary"
                      className="text-[10px] gap-1 pl-2 pr-1 py-0.5 font-normal h-5"
                    >
                      <FolderIcon className="size-2.5 text-muted-foreground" />
                      <span className="max-w-[130px] truncate">{f.name}</span>
                      {!isTrashView && (
                        <button
                          type="button"
                          onClick={() => handleRemoveFromFolder(f.id)}
                          title={t("inspector.removeFromFolder")}
                          className="hover:text-destructive p-0.5 rounded cursor-pointer"
                        >
                          <X className="size-2.5" />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* 2. Tags Accordion */}
          <AccordionItem value="tags">
            <AccordionTrigger
              action={
                !isTrashView ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTagInput((v) => !v);
                    }}
                    className="text-[10px] text-primary hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <Plus className="size-2.5" />
                    <span>{t("inspector.add")}</span>
                  </button>
                ) : undefined
              }
            >
              {t("inspector.tagsCount", { count: item.tags?.length || 0 })}
            </AccordionTrigger>
            <AccordionContent className="space-y-2">
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

              {!item.tags || item.tags.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {t("inspector.noTags")}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {item.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className={cn(
                        "text-[10px] gap-1 pl-2 pr-1 py-0.5 font-normal h-5",
                        tag === FAVORITE_TAG &&
                          "border border-amber-500/40 text-amber-500 bg-amber-500/10"
                      )}
                    >
                      {tag === FAVORITE_TAG ? (
                        <Star className="size-2.5 fill-amber-500" />
                      ) : (
                        <TagIcon className="size-2.5 text-muted-foreground" />
                      )}
                      <span className="max-w-[120px] truncate">
                        {tag === FAVORITE_TAG ? t("common.favorites") : tag}
                      </span>
                      {!isTrashView && (
                        <button
                          type="button"
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
            </AccordionContent>
          </AccordionItem>

          {/* 3. Basic Properties Accordion */}
          <AccordionItem value="basic">
            <AccordionTrigger>{t("inspector.basicProperties")}</AccordionTrigger>
            <AccordionContent className="space-y-1.5 text-[11px]">
              {item.width > 0 && item.height > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("inspector.dimensions")}
                  </span>
                  <span className="font-mono text-foreground font-medium">
                    {item.width} × {item.height} px
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("inspector.fileSize")}
                </span>
                <span className="font-mono text-foreground">
                  {formatBytes(item.size)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("inspector.extension")}
                </span>
                <span className="font-mono uppercase font-semibold text-foreground">
                  {item.extension}
                </span>
              </div>
              {item.mimeType && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("inspector.mimeType")}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[145px]">
                    {item.mimeType}
                  </span>
                </div>
              )}
              {item.createdAt > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("inspector.createdAt")}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {formatDate(item.createdAt)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("inspector.importedAt")}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {formatDate(item.importedAt)}
                </span>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* 4. Extended Image / EXIF Metadata Accordion */}
          {hasExtendedMeta && meta && (
            <AccordionItem value="imageMeta">
              <AccordionTrigger>{t("inspector.imageMetadata")}</AccordionTrigger>
              <AccordionContent className="space-y-1.5 text-[11px]">
                {meta.aspectRatio && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {t("inspector.aspectRatio")}
                    </span>
                    <span className="font-mono text-foreground">
                      {meta.aspectRatio}
                    </span>
                  </div>
                )}
                {meta.megapixels && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {t("inspector.megapixels")}
                    </span>
                    <span className="font-mono text-foreground">
                      {meta.megapixels}
                    </span>
                  </div>
                )}
                {meta.colorModel && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {t("inspector.colorModel")}
                    </span>
                    <span className="font-mono text-foreground">
                      {meta.colorModel}
                    </span>
                  </div>
                )}
                {meta.colorSpace && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {t("inspector.colorSpace")}
                    </span>
                    <span className="font-mono text-foreground">
                      {meta.colorSpace}
                    </span>
                  </div>
                )}
                {meta.bitDepth && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {t("inspector.bitDepth")}
                    </span>
                    <span className="font-mono text-foreground">
                      {meta.bitDepth}-bit
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("inspector.alphaChannel")}
                  </span>
                  <span className="font-mono text-foreground">
                    {meta.hasAlpha ? t("inspector.yesval") : t("inspector.noval")}
                  </span>
                </div>
                {(meta.exifMake || meta.exifModel) && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">
                      {t("inspector.camera")}
                    </span>
                    <span className="font-mono text-foreground truncate">
                      {[meta.exifMake, meta.exifModel].filter(Boolean).join(" ")}
                    </span>
                  </div>
                )}
                {meta.exifDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {t("inspector.exifDate")}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {meta.exifDate}
                    </span>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          {/* 5. File & Content Fingerprint Accordion (Collapsed by default) */}
          <AccordionItem value="fingerprint">
            <AccordionTrigger>{t("inspector.fileAndHash")}</AccordionTrigger>
            <AccordionContent className="space-y-2.5 text-[11px]">
              {item.hex && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {t("inspector.contentHash")}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        if (await copyTextToClipboard(item.hex)) {
                          setCopiedHex(true);
                          setTimeout(() => setCopiedHex(false), 1500);
                        }
                      }}
                      className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                    >
                      {copiedHex ? (
                        <Check className="size-2.5 text-green-500" />
                      ) : (
                        <Copy className="size-2.5" />
                      )}
                      <span>
                        {copiedHex ? t("inspector.copied") : t("common.copy")}
                      </span>
                    </button>
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground break-all select-text">
                    {item.hex}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    {t("inspector.physicalPath")}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const plainPath =
                        item.filePath ||
                        (item.itemPath
                          ? `${item.itemPath}/${item.filename}`
                          : shellPath);
                      if (await copyTextToClipboard(plainPath)) {
                        setCopiedPath(true);
                        setTimeout(() => setCopiedPath(false), 1500);
                        toast.success(t("workspace.pathCopied"));
                      }
                    }}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                  >
                    {copiedPath ? (
                      <Check className="size-2.5 text-green-500" />
                    ) : (
                      <Copy className="size-2.5" />
                    )}
                    <span>
                      {copiedPath
                        ? t("inspector.copied")
                        : t("inspector.copyFilePath")}
                    </span>
                  </button>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground break-all select-text max-h-20 overflow-y-auto">
                  {shellPath}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </aside>
  );
}
