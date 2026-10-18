import { useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Eye,
  Delete,
  FolderOpen,
  Copy,
  Trash2,
  FolderPlus,
  CheckSquare,
  Square,
  Upload,
  FolderMinus,
  Edit2,
  ExternalLink,
  Star,
  RotateCcw,
  Check,
  LayoutGrid,
  LayoutList,
  Columns3,
  Rows3,
  Puzzle,
} from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command";
import type { Item, Folder } from "../../bindings/bowerbird/core/models";
import {
  previewRegistry,
  createPreviewPluginHostAPI,
  type PluginContextMenuContext,
  type ContextMenuTarget,
} from "@/plugins/preview/registry";
import { cn } from "cn";
import { FAVORITE_TAG } from "@/lib/favoriteTag";
import { isMacOS } from "@/lib/macos";
import type { GalleryLayoutMode } from "@/lib/workspace-search";

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface ContextMenuProps {
  position: ContextMenuPosition | null;
  onClose: () => void;
  // Target mode: "file" | "folder" | "general"
  targetType?: ContextMenuTarget;
  // Selection context (file)
  selectedCount?: number;
  isItemContext?: boolean;
  activeFolderId?: string | null;
  targetItem?: Item | null;
  selectedItems?: Item[];
  // Folder context
  targetFolder?: Folder | null;
  isTrashFolder?: boolean;
  onCreateSubfolder?: (parentId: string) => void;
  onRenameFolder?: (folder: Folder) => void;
  onDeleteFolder?: (folderId: string, folderName: string) => Promise<void> | void;
  onExportFolder?: (folder: Folder) => void;
  // General / layout
  layoutMode?: GalleryLayoutMode;
  onLayoutModeChange?: (mode: GalleryLayoutMode) => void;
  onPreview?: () => void;
  onRename?: () => void;
  onReveal?: () => void;
  onOpenWithDefaultApp?: () => void;
  onCopy?: () => void;
  onCopyPath?: () => void;
  onToggleFavorite?: () => void;
  onDelete?: () => void;
  onEmptyTrash?: () => void;
  onRestore?: () => void;
  onOpenAddToFolderPalette?: () => void;
  onRemoveFromCurrentFolder?: () => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onImportFiles?: () => void;
  onCreateFolder?: () => void;
}

export function CustomContextMenu({
  position,
  onClose,
  targetType,
  selectedCount = 0,
  isItemContext = false,
  activeFolderId,
  targetItem,
  selectedItems = [],
  targetFolder,
  isTrashFolder = false,
  onCreateSubfolder,
  onRenameFolder,
  onDeleteFolder,
  onExportFolder,
  layoutMode = "justified",
  onLayoutModeChange,
  onPreview,
  onRename,
  onReveal,
  onOpenWithDefaultApp,
  onCopy,
  onCopyPath,
  onToggleFavorite,
  onDelete,
  onEmptyTrash,
  onRestore,
  onOpenAddToFolderPalette,
  onRemoveFromCurrentFolder,
  onSelectAll,
  onClearSelection,
  onImportFiles,
  onCreateFolder,
}: ContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [measuredHeight, setMeasuredHeight] = useState<number>(320);

  const effectiveTarget: ContextMenuTarget =
    targetType || (targetFolder ? "folder" : isItemContext ? "file" : "general");

  const pluginMenuItems = useMemo(() => {
    const ctx: PluginContextMenuContext<Item> = {
      target: effectiveTarget,
      items: selectedItems.length > 0 ? selectedItems : targetItem ? [targetItem] : [],
      folder: targetFolder
        ? {
            id: targetFolder.id,
            name: targetFolder.name,
            itemCount: targetFolder.itemCount,
            parentId: targetFolder.parentId,
          }
        : null,
      position: position || undefined,
      api: targetItem
        ? createPreviewPluginHostAPI(targetItem)
        : ({} as any),
    };
    return previewRegistry.resolveContextMenuItems(effectiveTarget, ctx);
  }, [effectiveTarget, selectedItems, targetItem, targetFolder, position]);

  const renderPluginItems = () => {
    if (pluginMenuItems.length === 0) return null;
    return (
      <>
        <CommandSeparator className="my-1" />
        <CommandGroup heading={t("settings.plugins.title", { defaultValue: "Plugin Actions" })}>
          {pluginMenuItems.map((pItem) => (
            <CommandItem
              key={pItem.id}
              onSelect={() => {
                onClose();
                const ctx: PluginContextMenuContext<Item> = {
                  target: effectiveTarget,
                  items: selectedItems.length > 0 ? selectedItems : targetItem ? [targetItem] : [],
                  folder: targetFolder
                    ? {
                        id: targetFolder.id,
                        name: targetFolder.name,
                        itemCount: targetFolder.itemCount,
                        parentId: targetFolder.parentId,
                      }
                    : null,
                  position: position || undefined,
                  api: targetItem
                    ? createPreviewPluginHostAPI(targetItem)
                    : ({} as any),
                };
                pItem.onClick(ctx);
              }}
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
            >
              <Puzzle className="size-3.5 text-primary shrink-0" />
              <span>{pItem.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </>
    );
  };

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

  // Position adjustments to stay within window boundaries (max 80% viewport height)
  const menuWidth = 256;
  const maxMenuHeight = window.innerHeight * 0.8;
  const currentHeight = Math.min(measuredHeight || 320, maxMenuHeight);
  const adjustedX = Math.max(8, Math.min(position.x, window.innerWidth - menuWidth - 12));
  const adjustedY = Math.max(8, Math.min(position.y, window.innerHeight - currentHeight - 12));
  const isTrashView = activeFolderId === "__trash__";
  const isRealFolder =
    Boolean(activeFolderId) &&
    activeFolderId !== "__trash__" &&
    activeFolderId !== "__untagged__" &&
    activeFolderId !== "__uncategorized__" &&
    activeFolderId !== "__history__";
  const itemTags = targetItem?.tags || [];
  const isFavorite = itemTags.includes(FAVORITE_TAG);

  // Sections are separated by rules only (no group headings), so each rule is
  // rendered solely when both the preceding and the following section exist.
  const isMac = isMacOS();
  const copyShortcutLabel = isMac ? "⌘C" : "Ctrl+C";
  const selectAllShortcutLabel = isMac ? "⌘A" : "Ctrl+A";
  const hasPrimaryActions = Boolean(
    onPreview ||
      onReveal ||
      onCopy ||
      onCopyPath ||
      (selectedCount === 1 &&
        (onRename || onOpenWithDefaultApp || onToggleFavorite))
  );
  const hasFolderActions = Boolean(
    onOpenAddToFolderPalette || (isRealFolder && onRemoveFromCurrentFolder)
  );
  const hasTrashAction = Boolean(onDelete);
  const layoutOptions: {
    mode: GalleryLayoutMode;
    label: string;
    icon: typeof Rows3;
  }[] = [
    {
      mode: "justified",
      label: t("contextMenu.layoutJustified"),
      icon: Rows3,
    },
    {
      mode: "waterfall",
      label: t("contextMenu.layoutWaterfall"),
      icon: Columns3,
    },
    {
      mode: "grid",
      label: t("contextMenu.layoutGrid"),
      icon: LayoutGrid,
    },
    {
      mode: "list",
      label: t("contextMenu.layoutList"),
      icon: LayoutList,
    },
  ];

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
            {t("contextMenu.noResults")}
          </CommandEmpty>

          {/* ================= FOLDER CONTEXT ================= */}
          {effectiveTarget === "folder" ? (
            <>
              <CommandGroup heading={targetFolder?.name || t("sidebar.folders")}>
                {isTrashFolder ? (
                  onEmptyTrash && (
                    <CommandItem
                      onSelect={() => {
                        onEmptyTrash();
                        onClose();
                      }}
                      className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer text-destructive focus:text-destructive"
                    >
                      <Trash2 className="size-3.5 shrink-0" />
                      <span>{t("workspace.emptyTrash")}</span>
                    </CommandItem>
                  )
                ) : (
                  <>
                    {onCreateSubfolder && targetFolder && (
                      <CommandItem
                        onSelect={() => {
                          onCreateSubfolder(targetFolder.id);
                          onClose();
                        }}
                        className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                      >
                        <FolderPlus className="size-3.5 text-muted-foreground shrink-0" />
                        <span>{t("sidebar.newSubfolderMenu", { defaultValue: "New Subfolder" })}</span>
                      </CommandItem>
                    )}
                    {onRenameFolder && targetFolder && (
                      <CommandItem
                        onSelect={() => {
                          onRenameFolder(targetFolder);
                          onClose();
                        }}
                        className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                      >
                        <Edit2 className="size-3.5 text-muted-foreground shrink-0" />
                        <span>{t("sidebar.renameMenu", { defaultValue: "Rename" })}</span>
                      </CommandItem>
                    )}
                    {onExportFolder && targetFolder && (
                      <CommandItem
                        onSelect={() => {
                          onExportFolder(targetFolder);
                          onClose();
                        }}
                        className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                      >
                        <Upload className="size-3.5 text-muted-foreground shrink-0" />
                        <span>{t("sidebar.exportFolder", { defaultValue: "Export Folder" })}</span>
                      </CommandItem>
                    )}
                    {onDeleteFolder && targetFolder && (
                      <>
                        <CommandSeparator className="my-1" />
                        <CommandItem
                          onSelect={() => {
                            onDeleteFolder(targetFolder.id, targetFolder.name);
                            onClose();
                          }}
                          className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-3.5 shrink-0" />
                          <span>{t("sidebar.deleteMenu", { defaultValue: "Delete Folder" })}</span>
                        </CommandItem>
                      </>
                    )}
                  </>
                )}
              </CommandGroup>
              {renderPluginItems()}
            </>
          ) : isTrashView ? (
            isItemContext ? (
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
                {onEmptyTrash && (
                  <>
                    <CommandSeparator className="my-1" />
                    <CommandItem
                      onSelect={() => {
                        onEmptyTrash();
                        onClose();
                      }}
                      className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer text-destructive focus:text-destructive"
                    >
                      <Trash2 className="size-3.5 shrink-0" />
                      <span>{t("workspace.emptyTrash")}</span>
                    </CommandItem>
                  </>
                )}
              </CommandGroup>
            ) : (
              <>
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
                      <CommandShortcut className="text-[10px] font-mono tracking-normal">
                        {selectAllShortcutLabel}
                      </CommandShortcut>
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
                      <CommandShortcut className="text-[10px] font-mono tracking-normal">
                        Esc
                      </CommandShortcut>
                    </CommandItem>
                  )}
                  {onEmptyTrash && (
                    <CommandItem
                      onSelect={() => {
                        onEmptyTrash();
                        onClose();
                      }}
                      className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer text-destructive focus:text-destructive"
                    >
                      <Trash2 className="size-3.5 shrink-0" />
                      <span>{t("workspace.emptyTrash")}</span>
                    </CommandItem>
                  )}
                </CommandGroup>

                {onLayoutModeChange && (
                  <>
                    <CommandSeparator className="my-1" />
                    <CommandGroup heading={t("contextMenu.layout")}>
                      {layoutOptions.map(({ mode, label, icon: Icon }) => {
                        const active = layoutMode === mode;
                        return (
                          <CommandItem
                            key={mode}
                            onSelect={() => {
                              onLayoutModeChange(mode);
                              onClose();
                            }}
                            className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                          >
                            <Icon
                              className={cn(
                                "size-3.5 shrink-0",
                                active ? "text-primary" : "text-muted-foreground"
                              )}
                            />
                            <span className={cn("flex-1", active && "font-medium text-primary")}>
                              {label}
                            </span>
                            {active && <Check className="size-3.5 text-primary shrink-0" />}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </>
                )}
              </>
            )
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
                    <CommandShortcut className="text-[10px] font-mono tracking-normal">
                      {t("contextMenu.shortcutSpace")}
                    </CommandShortcut>
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
                    <CommandShortcut className="text-[10px] font-mono tracking-normal">Enter</CommandShortcut>
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

                {onCopy && (
                  <CommandItem
                    onSelect={() => {
                      onCopy();
                      onClose();
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                  >
                    <Copy className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1">{t("common.copy")}</span>
                    <CommandShortcut className="text-[10px] font-mono tracking-normal">
                      {copyShortcutLabel}
                    </CommandShortcut>
                  </CommandItem>
                )}

                {onCopyPath && (
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
              {hasFolderActions && (
                <CommandGroup>
                  {onOpenAddToFolderPalette && (
                    <CommandItem
                      onSelect={() => {
                        onOpenAddToFolderPalette();
                        onClose();
                      }}
                      className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                    >
                      <FolderPlus className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1">
                        {t("contextMenu.addToFolder")}
                      </span>
                    </CommandItem>
                  )}
                  {isRealFolder && onRemoveFromCurrentFolder && (
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

              {(hasPrimaryActions || hasFolderActions) && hasTrashAction && (
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
                    <CommandShortcut
                      aria-hidden="true"
                      className="text-destructive group-data-[selected=true]/command-item:text-destructive"
                    >
                      <Delete className="size-3.5" />
                    </CommandShortcut>
                  </CommandItem>
                </CommandGroup>
              )}
              {renderPluginItems()}
            </>
          ) : (
            /* ================= CANVAS / BACKGROUND CONTEXT ================= */
            <>
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
                    <CommandShortcut className="text-[10px] font-mono tracking-normal">{selectAllShortcutLabel}</CommandShortcut>
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
                    <CommandShortcut className="text-[10px] font-mono tracking-normal">Esc</CommandShortcut>
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

              {onLayoutModeChange && (
                <>
                  <CommandSeparator className="my-1" />
                  <CommandGroup heading={t("contextMenu.layout")}>
                    {layoutOptions.map(({ mode, label, icon: Icon }) => {
                      const active = layoutMode === mode;
                      return (
                        <CommandItem
                          key={mode}
                          onSelect={() => {
                            onLayoutModeChange(mode);
                            onClose();
                          }}
                          className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md cursor-pointer"
                        >
                          <Icon
                            className={cn(
                              "size-3.5 shrink-0",
                              active ? "text-primary" : "text-muted-foreground"
                            )}
                          />
                          <span className={cn("flex-1", active && "font-medium text-primary")}>
                            {label}
                          </span>
                          {active && <Check className="size-3.5 text-primary shrink-0" />}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </>
              )}
              {renderPluginItems()}
            </>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
