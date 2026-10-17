import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Folder as FolderIcon,
  Plus,
  Tag as TagIcon,
  Star,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/command";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import type { Item, Folder, Tag as TagModel } from "../../bindings/bowerbird/core/models";
import { formatBytes, getFileCategory } from "@/lib/formatters";
import { FAVORITE_TAG } from "@/lib/favoriteTag";
import { cn } from "@/lib/utils";
import { UniversalThumbnail } from "./UniversalThumbnail";

export interface MultiItemInspectorProps {
  selectedItems: Item[];
  allFolders: Folder[];
  allTags?: TagModel[];
  activeFolderId: string | null;
  onClearSelection: () => void;
  onBatchReveal: () => void;
  onBatchDelete: () => void;
  onBatchAddToFolder: (folderId: string) => void;
  onBatchRemoveFromFolder?: (folderId: string) => void;
  onBatchAddTag?: (tag: string) => Promise<void> | void;
  onBatchRemoveTag?: (tag: string) => Promise<void> | void;
  onBatchRestore?: () => void;
}

export function MultiItemInspector({
  selectedItems,
  allFolders,
  allTags = [],
  activeFolderId,
  onBatchAddToFolder,
  onBatchRemoveFromFolder,
  onBatchAddTag,
  onBatchRemoveTag,
}: MultiItemInspectorProps) {
  const { t } = useTranslation();
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  // Strict FIFO sliding window of the last 6 selected items:
  // Whoever is selected last joins the top of the stack; whoever was selected first gets pushed out once > 6.
  const stackedItems = selectedItems.slice(-6);
  const totalSizeBytes = selectedItems.reduce(
    (acc, curr) => acc + (curr.size || 0),
    0
  );

  const extensionCounts: Record<string, number> = {};
  for (const item of selectedItems) {
    const ext = (item.extension || "other").toUpperCase();
    extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
  }

  const flatFolderList = useMemo(() => {
    const out: { id: string; name: string }[] = [];
    const collect = (list: Folder[], prefix = "") => {
      for (const f of list) {
        const name = prefix ? `${prefix} / ${f.name}` : f.name;
        out.push({ id: f.id, name });
        if (f.children && f.children.length > 0) {
          collect(f.children, name);
        }
      }
    };
    collect(allFolders);
    return out;
  }, [allFolders]);
  const isRealFolder =
    Boolean(activeFolderId) &&
    activeFolderId !== "__trash__" &&
    activeFolderId !== "__untagged__" &&
    activeFolderId !== "__uncategorized__" &&
    activeFolderId !== "__history__";

  // Tags shared across all selected items
  const commonTags =
    selectedItems.length > 0
      ? (selectedItems[0].tags || []).filter((tg) =>
          selectedItems.every((it) => (it.tags || []).includes(tg))
        )
      : [];
  return (
    <aside className="w-full h-full border-l-0 bg-sidebar/40 flex flex-col select-none overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-xs">
        {/* Stacked preview of the last 6 selected items in selection order */}
        <div className="relative w-full h-44 flex items-center justify-center my-1 select-none">
          {stackedItems.map((item, idx) => {
            const offsetFromTop = stackedItems.length - 1 - idx;
            const presets = [
              { rotate: 0, x: 0, y: 0 },
              { rotate: -4, x: -6, y: 3 },
              { rotate: 5, x: 5, y: 5 },
              { rotate: -7, x: -10, y: 8 },
              { rotate: 7, x: 9, y: 11 },
              { rotate: -10, x: -13, y: 14 },
            ];
            const preset = presets[Math.min(offsetFromTop, presets.length - 1)];

            const STACK_HEIGHT = 132;
            const ratio = (() => {
              if (item.width && item.height && item.width > 0 && item.height > 0) {
                return Math.max(0.55, Math.min(2.1, item.width / item.height));
              }
              const category = getFileCategory(item.extension, item.mimeType);
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
                className="absolute rounded-sm overflow-hidden shadow-md transition-transform hover:scale-105 cursor-grab active:cursor-grabbing"
              >
                <UniversalThumbnail
                  item={item}
                  height={STACK_HEIGHT}
                  width={calculatedWidth}
                  draggable={true}
                  objectFit="cover"
                  borderless={true}
                  showFormatBadge={false}
                  className="w-full h-full"
                />
              </div>
            );
          })}
        </div>

        {/* Selection summary (no available actions row) */}
        <div className="text-center space-y-0.5 pb-1">
          <p className="text-xs font-semibold text-foreground">
            {t("multiInspector.selectedCount", { count: selectedItems.length })}
          </p>
          <p className="text-[10px] text-muted-foreground font-mono">
            {formatBytes(totalSizeBytes)}
          </p>
        </div>

        {/* Accordion sections replacing cards */}
        <Accordion
          type="multiple"
          defaultValue={["folders", "tags", "summary"]}
          className="border-t border-border/50"
        >
          {activeFolderId !== "__trash__" && (
            <AccordionItem value="folders">
              <AccordionTrigger
                action={
                  flatFolderList.length > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowFolderPicker((v) => !v);
                      }}
                      className="text-[10px] text-primary hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="size-2.5" />
                      <span>{t("multiInspector.addToFolder")}</span>
                    </button>
                  ) : undefined
                }
              >
                {t("multiInspector.folders")}
              </AccordionTrigger>
              <AccordionContent className="space-y-2">
                {showFolderPicker && flatFolderList.length > 0 && (
                  <div className="py-1 border-b border-border/50 space-y-0.5 max-h-36 overflow-y-auto">
                    {flatFolderList.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          onBatchAddToFolder(f.id);
                          setShowFolderPicker(false);
                        }}
                        className="w-full text-left px-1.5 py-1 rounded text-[11px] hover:bg-muted flex items-center gap-1.5 truncate cursor-pointer"
                      >
                        <FolderIcon className="size-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{f.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {isRealFolder && activeFolderId && onBatchRemoveFromFolder && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => onBatchRemoveFromFolder(activeFolderId)}
                    className="w-full h-7 text-[11px] text-destructive hover:bg-destructive/10 border-destructive/30 cursor-pointer"
                  >
                    <span>{t("multiInspector.removeFromCurrentFolder")}</span>
                  </Button>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          {activeFolderId !== "__trash__" && (onBatchAddTag || onBatchRemoveTag) && (
            <AccordionItem value="tags">
              <AccordionTrigger
                action={
                  onBatchAddTag ? (
                    <Popover
                      open={tagPopoverOpen}
                      onOpenChange={(open) => {
                        setTagPopoverOpen(open);
                        if (!open) setTagSearch("");
                      }}
                    >
                      <PopoverTrigger
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] text-primary hover:underline flex items-center gap-0.5 cursor-pointer bg-transparent border-0 p-0"
                      >
                        <Plus className="size-2.5" />
                        <span>{t("inspector.add")}</span>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        sideOffset={4}
                        className="w-56 p-0 rounded-xl shadow-xl border border-border bg-popover text-popover-foreground z-50 overflow-hidden"
                      >
                        <Command className="rounded-xl bg-transparent p-0">
                          <CommandInput
                            value={tagSearch}
                            onValueChange={setTagSearch}
                            placeholder={t("inspector.searchOrCreateTagPlaceholder")}
                            wrapperClassName="p-0"
                            groupClassName="rounded-none border-x-transparent! border-t-transparent! border-b-border/60! bg-transparent px-2.5 shadow-none ring-0!"
                            addonClassName="pl-0 pr-1.5 [&_svg]:size-3.5"
                            className="h-8 text-xs bg-transparent"
                            onKeyDown={async (e) => {
                              if (e.key === "Enter") {
                                const clean = tagSearch.trim();
                                if (!clean) return;
                                const exactExisting = allTags.find(
                                  (tg) => tg.name.toLowerCase() === clean.toLowerCase()
                                );
                                if (!exactExisting) {
                                  e.preventDefault();
                                  await onBatchAddTag(clean);
                                  setTagSearch("");
                                }
                              }
                            }}
                          />
                          <CommandList className="max-h-56 p-1 overflow-y-auto">
                            <CommandEmpty className="py-2.5 px-2 text-center text-xs text-muted-foreground">
                              {tagSearch.trim() ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const clean = tagSearch.trim();
                                    if (!clean) return;
                                    await onBatchAddTag(clean);
                                    setTagSearch("");
                                  }}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-primary hover:bg-primary/10 transition-colors cursor-pointer text-left font-medium"
                                >
                                  <Plus className="size-3.5 shrink-0" />
                                  <span className="truncate">
                                    {t("inspector.createTag", {
                                      name: tagSearch.trim(),
                                    })}
                                  </span>
                                </button>
                              ) : (
                                t("tags.empty")
                              )}
                            </CommandEmpty>
                            <CommandGroup>
                              {tagSearch.trim() &&
                                !allTags.some(
                                  (tg) =>
                                    tg.name.toLowerCase() ===
                                    tagSearch.trim().toLowerCase()
                                ) && (
                                  <CommandItem
                                    value={`__create__ ${tagSearch.trim()}`}
                                    onSelect={async () => {
                                      const clean = tagSearch.trim();
                                      if (!clean) return;
                                      await onBatchAddTag(clean);
                                      setTagSearch("");
                                    }}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-primary font-medium cursor-pointer"
                                  >
                                    <Plus className="size-3.5 shrink-0 text-primary" />
                                    <span className="truncate flex-1">
                                      {t("inspector.createTag", {
                                        name: tagSearch.trim(),
                                      })}
                                    </span>
                                  </CommandItem>
                                )}
                              {allTags.map((tg) => {
                                const allHaveTag = commonTags.includes(tg.name);
                                const isFav = tg.name === FAVORITE_TAG;
                                const displayLabel = isFav
                                  ? t("common.favorites")
                                  : tg.name;
                                return (
                                  <CommandItem
                                    key={tg.name}
                                    value={`${displayLabel} ${tg.name}`}
                                    onSelect={async () => {
                                      if (allHaveTag && onBatchRemoveTag) {
                                        await onBatchRemoveTag(tg.name);
                                      } else {
                                        await onBatchAddTag(tg.name);
                                      }
                                    }}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer"
                                  >
                                    {isFav ? (
                                      <Star
                                        className={cn(
                                          "size-3.5 shrink-0",
                                          allHaveTag
                                            ? "text-amber-500 fill-amber-500"
                                            : "text-amber-500/80"
                                        )}
                                      />
                                    ) : (
                                      <TagIcon className="size-3.5 text-muted-foreground shrink-0" />
                                    )}
                                    <span className="truncate flex-1">
                                      {displayLabel}
                                    </span>
                                    {allHaveTag && (
                                      <Check className="size-3.5 text-primary shrink-0" />
                                    )}
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  ) : undefined
                }
              >
                {t("inspector.tagsCount", { count: commonTags.length })}
              </AccordionTrigger>
              <AccordionContent className="space-y-2">
                {commonTags.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    {t("inspector.noTags")}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {commonTags.map((tag) => (
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
                        {onBatchRemoveTag && (
                          <button
                            type="button"
                            onClick={async () => {
                              await onBatchRemoveTag(tag);
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
          )}

          <AccordionItem value="summary">
            <AccordionTrigger>{t("multiInspector.summary")}</AccordionTrigger>
            <AccordionContent className="space-y-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("multiInspector.count")}
                </span>
                <span className="font-mono font-medium">
                  {selectedItems.length}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("multiInspector.totalSize")}
                </span>
                <span className="font-mono font-medium">
                  {formatBytes(totalSizeBytes)}
                </span>
              </div>

              <div className="pt-1 space-y-1">
                <span className="text-muted-foreground text-[10px]">
                  {t("multiInspector.formats")}
                </span>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(extensionCounts).map(([ext, count]) => (
                    <Badge
                      key={ext}
                      variant="secondary"
                      className="text-[10px] font-mono px-1.5 py-0 h-4.5 font-normal"
                    >
                      {ext} × {count}
                    </Badge>
                  ))}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </aside>
  );
}
