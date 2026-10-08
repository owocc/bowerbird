import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Eye,
  FolderOpen,
  Copy,
  Trash2,
  FolderPlus,
  CheckSquare,
  Square,
  Upload,
  Folder as FolderIcon,
  FolderMinus,
  Edit2,
  ExternalLink,
  Star,
  RotateCcw,
  Tag as TagIcon,
  Check,
  Plus,
} from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import type { Folder as FolderModel, Tag as TagModel, Item } from "../../bindings/bowerbird/core/models";
import { cn } from "cn";
import { FAVORITE_TAG } from "@/lib/favoriteTag";

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
  allTags?: TagModel[];
  targetItem?: Item | null;
  // Actions
  onPreview?: () => void;
  onRename?: () => void;
  onReveal?: () => void;
  onOpenWithDefaultApp?: () => void;
  onCopyPath?: () => void;
  onToggleFavorite?: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
  onAddToFolder?: (folderId: string) => void;
  onRemoveFromCurrentFolder?: () => void;
  onAddTag?: (tag: string) => void;
  onRemoveTag?: (tag: string) => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onImportFiles?: () => void;
  onCreateFolder?: () => void;
}

export function CustomContextMenu({
  position,
  onClose,
  selectedCount = 0,
  isItemContext,
  activeFolderId,
  allFolders,
  allTags = [],
  targetItem,
  onPreview,
  onRename,
  onReveal,
  onOpenWithDefaultApp,
  onCopyPath,
  onToggleFavorite,
  onDelete,
  onRestore,
  onAddToFolder,
  onRemoveFromCurrentFolder,
  onAddTag,
  onRemoveTag,
  onSelectAll,
  onClearSelection,
  onImportFiles,
  onCreateFolder,
}: ContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [measuredHeight, setMeasuredHeight] = useState<number>(320);

  useEffect(() => {
    if (menuRef.current) {
      setMeasuredHeight(menuRef.current.offsetHeight);
    }
  }, [position, search]);

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

  // Position adjustments to stay within window boundaries (max 80% viewport height)
  const menuWidth = 256;
  const maxMenuHeight = window.innerHeight * 0.8;
  const currentHeight = Math.min(measuredHeight || 320, maxMenuHeight);
  const adjustedX = Math.max(8, Math.min(position.x, window.innerWidth - menuWidth - 12));
  const adjustedY = Math.max(8, Math.min(position.y, window.innerHeight - currentHeight - 12));
  const isTrashView = activeFolderId === "__trash__";
  const itemTags = targetItem?.tags || [];
  const isFavorite = itemTags.includes(FAVORITE_TAG);

  // Sections are separated by rules only (no group headings), so each rule is
  // rendered solely when both the preceding and the following section exist.
  const hasPrimaryActions = Boolean(
    onPreview ||
      onReveal ||
      (selectedCount === 1 &&
        (onRename || onOpenWithDefaultApp || onCopyPath || onToggleFavorite))
  );
  const hasFolderActions = flatFolders.length > 0 && Boolean(onAddToFolder);
  const hasTagActions = allTags.length > 0 && Boolean(onAddTag || onRemoveTag);
  const hasTrashAction = Boolean(onDelete);

  return (
    <div
      ref={menuRef}
      style={{
        left: `${adjustedX}px`,
        top: `${adjustedY}px`,
        maxHeight: "80vh",
      }}
      className="fixed z-50 w-64 max-h-[80vh] flex flex-col rounded-xl border border-border/80 bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-md p-1 select-none overflow-hidden"
    >
      <Command className="rounded-lg bg-transparent p-0 flex flex-col max-h-[80vh] overflow-hidden">
        {/* Minimal search field: full-bleed, square, no fill — just a bottom rule. */}
        <CommandInput
          value={search}
          onValueChange={setSearch}
          placeholder={t("contextMenu.searchPlaceholder")}
          wrapperClassName="p-0"
          groupClassName="rounded-none border-x-transparent! border-t-transparent! border-b-border/60! bg-transparent px-2.5 shadow-none ring-0!"
          addonClassName="pl-0 pr-1.5 [&_svg]:size-3.5"
          className="h-8 text-xs bg-transparent placeholder:text-muted-foreground/70 shrink-0"
        />

        <CommandList className="max-h-[calc(80vh-44px)] p-1 overflow-y-auto flex-1">
          <CommandEmpty className="py-2.5 text-center text-xs text-muted-foreground">
            {search.trim() ? (
              <div className="space-y-1">
                <div>{t("contextMenu.noResults")}</div>
                {onAddTag && isItemContext && (
                  <button
                    type="button"
                    onClick={() => {
                      onAddTag(search.trim());
                      onClose();
                    }}
                    className="text-primary hover:underline text-[11px] font-medium flex items-center justify-center gap-1 mx-auto cursor-pointer"
                  >
                    <Plus className="size-3" />
                    <span>{t("contextMenu.createTag", { name: search.trim() })}</span>
                  </button>
                )}
              </div>
            ) : (
              t("contextMenu.noResults")
            )}
          </CommandEmpty>

          {/* ================= TRASH CONTEXT ================= */}
          {isTrashView ? (
            <CommandGroup>
              {onRestore && (
                <CommandItem
                  onSelect={() => {
                    onRestore();
                    onClose();
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                >
                  <RotateCcw className="size-3.5 text-primary shrink-0" />
                  <span>{t("contextMenu.restore")}</span>
                </CommandItem>
              )}
              {onDelete && (
                <CommandItem
                  onSelect={() => {
                    onDelete();
                    onClose();
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-3.5 shrink-0" />
                  <span>{t("contextMenu.deletePermanently")}</span>
                </CommandItem>
              )}
            </CommandGroup>
          ) : isItemContext ? (
            /* ================= ITEM CONTEXT ================= */
            <>
              {/* Primary file actions */}
              <CommandGroup>
                {onPreview && (
                  <CommandItem
                    onSelect={() => {
                      onPreview();
                      onClose();
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                  >
                    <Eye className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1">{t("contextMenu.fullPreview")}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{t("contextMenu.shortcutSpace")}</span>
                  </CommandItem>
                )}

                {selectedCount === 1 && onRename && (
                  <CommandItem
                    onSelect={() => {
                      onRename();
                      onClose();
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                  >
                    <Edit2 className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1">{t("common.rename")}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">Enter</span>
                  </CommandItem>
                )}

                {onReveal && (
                  <CommandItem
                    onSelect={() => {
                      onReveal();
                      onClose();
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                  >
                    <FolderOpen className="size-3.5 text-muted-foreground shrink-0" />
                    <span>{t("contextMenu.revealInFinder")}</span>
                  </CommandItem>
                )}

                {selectedCount === 1 && onOpenWithDefaultApp && (
                  <CommandItem
                    onSelect={() => {
                      onOpenWithDefaultApp();
                      onClose();
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                  >
                    <ExternalLink className="size-3.5 text-muted-foreground shrink-0" />
                    <span>{t("contextMenu.openWithDefaultApp")}</span>
                  </CommandItem>
                )}

                {selectedCount === 1 && onCopyPath && (
                  <CommandItem
                    onSelect={() => {
                      onCopyPath();
                      onClose();
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                  >
                    <Copy className="size-3.5 text-muted-foreground shrink-0" />
                    <span>{t("contextMenu.copyFilePath")}</span>
                  </CommandItem>
                )}

                {selectedCount === 1 && onToggleFavorite && (
                  <CommandItem
                    onSelect={() => {
                      onToggleFavorite();
                      onClose();
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                  >
                    <Star
                      className={cn(
                        "size-3.5 shrink-0",
                        isFavorite ? "text-amber-500 fill-amber-500" : "text-muted-foreground"
                      )}
                    />
                    <span>{isFavorite ? t("contextMenu.removeFromFavorites") : t("contextMenu.addToFavorites")}</span>
                  </CommandItem>
                )}
              </CommandGroup>

              {hasPrimaryActions && hasFolderActions && <CommandSeparator className="my-1" />}

              {/* Folders Assignment */}
              {flatFolders.length > 0 && onAddToFolder && (
                <CommandGroup>
                  {flatFolders.slice(0, 10).map((f) => (
                    <CommandItem
                      key={f.id}
                      onSelect={() => {
                        onAddToFolder(f.id);
                        onClose();
                      }}
                      className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                    >
                      <FolderIcon className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1">{f.name}</span>
                    </CommandItem>
                  ))}
                  {activeFolderId && onRemoveFromCurrentFolder && (
                    <CommandItem
                      onSelect={() => {
                        onRemoveFromCurrentFolder();
                        onClose();
                      }}
                      className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer text-amber-600 focus:text-amber-600"
                    >
                      <FolderMinus className="size-3.5 shrink-0" />
                      <span>{t("contextMenu.removeFromCurrentFolder")}</span>
                    </CommandItem>
                  )}
                </CommandGroup>
              )}

              {(hasPrimaryActions || hasFolderActions) && hasTagActions && (
                <CommandSeparator className="my-1" />
              )}

              {/* Tags Assignment */}
              {allTags.length > 0 && (onAddTag || onRemoveTag) && (
                <CommandGroup>
                  {allTags.map((tag) => {
                    const hasTag = itemTags.includes(tag.name);
                    return (
                      <CommandItem
                        key={tag.name}
                        onSelect={() => {
                          if (hasTag) {
                            onRemoveTag?.(tag.name);
                          } else {
                            onAddTag?.(tag.name);
                          }
                          onClose();
                        }}
                        className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                      >
                        <TagIcon className="size-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate flex-1">{tag.name}</span>
                        {hasTag && <Check className="size-3 text-primary shrink-0" />}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}

              {(hasPrimaryActions || hasFolderActions || hasTagActions) && hasTrashAction && (
                <CommandSeparator className="my-1" />
              )}

              {/* Move to Trash */}
              {onDelete && (
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      onDelete();
                      onClose();
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer text-destructive focus:text-destructive"
                  >
                    <Trash2 className="size-3.5 shrink-0" />
                    <span>{t("contextMenu.moveToTrash")}</span>
                    <span className="text-[10px] opacity-70 ml-auto font-mono">⌫</span>
                  </CommandItem>
                </CommandGroup>
              )}
            </>
          ) : (
            /* ================= CANVAS / BACKGROUND CONTEXT ================= */
            <CommandGroup>
              {onSelectAll && (
                <CommandItem
                  onSelect={() => {
                    onSelectAll();
                    onClose();
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                >
                  <CheckSquare className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1">{t("contextMenu.selectAll")}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">⌘A</span>
                </CommandItem>
              )}

              {onClearSelection && selectedCount > 0 && (
                <CommandItem
                  onSelect={() => {
                    onClearSelection();
                    onClose();
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                >
                  <Square className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1">{t("contextMenu.deselectAll")}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">Esc</span>
                </CommandItem>
              )}

              {onImportFiles && (
                <CommandItem
                  onSelect={() => {
                    onImportFiles();
                    onClose();
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                >
                  <Upload className="size-3.5 text-muted-foreground shrink-0" />
                  <span>{t("contextMenu.importLocalFiles")}</span>
                </CommandItem>
              )}

              {onCreateFolder && (
                <CommandItem
                  onSelect={() => {
                    onCreateFolder();
                    onClose();
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                >
                  <FolderPlus className="size-3.5 text-muted-foreground shrink-0" />
                  <span>{t("contextMenu.newFolder")}</span>
                </CommandItem>
              )}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
