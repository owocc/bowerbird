import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  Check,
  Palette,
  Folder as FolderIcon,
  Layers,
  Ratio,
  HardDrive,
  Link as LinkIcon,
  FileText,
  Star,
  Plus,
  Pin,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import type {
  Folder,
  Item,
} from "../../bindings/bowerbird/core/models";
import type {
  WorkspaceCategory,
  WorkspaceOrientation,
  WorkspaceSizeFilter,
  WorkspacePresenceFilter,
} from "@/lib/workspace-search";
import { cn } from "@/lib/utils";

export const UNCATEGORIZED_FOLDER_FILTER = "__uncategorized__";
export const UNTAGGED_TAG_FILTER = "__untagged__";

const PINNED_FILTERS_STORAGE_KEY = "bowerbird-pinned-filters";

export type FilterCriterionId =
  | "type"
  | "color"
  | "folder"
  | "orientation"
  | "size"
  | "url"
  | "notes"
  | "rating";

const ALL_CRITERIA_ORDER: FilterCriterionId[] = [
  "type",
  "color",
  "folder",
  "orientation",
  "size",
  "url",
  "notes",
  "rating",
];

const DEFAULT_PINNED_CRITERIA: FilterCriterionId[] = [
  "type",
  "color",
  "folder",
  "orientation",
];

function loadPinnedCriteria(): FilterCriterionId[] {
  if (typeof window === "undefined") return DEFAULT_PINNED_CRITERIA;
  try {
    const raw = window.localStorage.getItem(PINNED_FILTERS_STORAGE_KEY);
    if (!raw) return DEFAULT_PINNED_CRITERIA;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const valid = parsed.filter((id): id is FilterCriterionId =>
        ALL_CRITERIA_ORDER.includes(id as FilterCriterionId)
      );
      return valid;
    }
  } catch {
    // Ignore localStorage parse errors
  }
  return DEFAULT_PINNED_CRITERIA;
}

function savePinnedCriteria(list: FilterCriterionId[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PINNED_FILTERS_STORAGE_KEY,
      JSON.stringify(list)
    );
  } catch {
    // Ignore quota errors
  }
}

/** Standard preset color swatches for color filtering */
export const PRESET_FILTER_COLORS = [
  { hex: "#EF4444", name: "Red" },
  { hex: "#F97316", name: "Orange" },
  { hex: "#EAB308", name: "Yellow" },
  { hex: "#22C55E", name: "Green" },
  { hex: "#14B8A6", name: "Teal" },
  { hex: "#3B82F6", name: "Blue" },
  { hex: "#6366F1", name: "Indigo" },
  { hex: "#A855F7", name: "Purple" },
  { hex: "#EC4899", name: "Pink" },
  { hex: "#78350F", name: "Brown" },
  { hex: "#171717", name: "Black" },
  { hex: "#737373", name: "Gray" },
  { hex: "#F5F5F5", name: "White" },
];

export function parseHexRgb(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, "");
  if (clean.length !== 6) return null;
  const num = Number.parseInt(clean, 16);
  if (Number.isNaN(num)) return null;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/** Perceptual RGB color distance (low-cost redmean approximation, range 0..765) */
export function colorDistanceHex(hexA: string, hexB: string): number {
  const a = parseHexRgb(hexA);
  const b = parseHexRgb(hexB);
  if (!a || !b) return 999;
  const rmean = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(
    (2 + rmean / 256) * dr * dr +
      4 * dg * dg +
      (2 + (255 - rmean) / 256) * db * db
  );
}

/** Checks if an item's dominant color or palette matches the target hex within tolerance */
export function itemMatchesColorFilter(
  item: Item,
  targetHex: string,
  tolerance = 115
): boolean {
  const candidates: string[] = [];
  if (item.dominantColor) candidates.push(item.dominantColor);
  if (item.palette && item.palette.length > 0) {
    for (const c of item.palette) {
      if (c && !candidates.includes(c)) candidates.push(c);
    }
  }
  if (candidates.length === 0) return false;
  return candidates.some((c) => colorDistanceHex(c, targetHex) <= tolerance);
}

export interface FilterBarProps {
  libraryTopColors?: string[];
  folders: Folder[];
  categoryFilter: WorkspaceCategory;
  colorFilter: string | null;
  folderFilter: string | null;
  orientationFilter: WorkspaceOrientation;
  sizeFilter: WorkspaceSizeFilter;
  hasUrlFilter: WorkspacePresenceFilter;
  hasNoteFilter: WorkspacePresenceFilter;
  ratingFilter: number | null;
  onCategoryChange: (cat: WorkspaceCategory) => void;
  onColorChange: (color: string | null) => void;
  onFolderChange: (folderId: string | null) => void;
  onOrientationChange: (orientation: WorkspaceOrientation) => void;
  onSizeChange: (size: WorkspaceSizeFilter) => void;
  onHasUrlChange: (hasUrl: WorkspacePresenceFilter) => void;
  onHasNoteChange: (hasNote: WorkspacePresenceFilter) => void;
  onRatingChange: (rating: number | null) => void;
  onClearAll: () => void;
}

export const FilterBar = React.memo(function FilterBar({
  libraryTopColors = [],
  folders,
  categoryFilter,
  colorFilter,
  folderFilter,
  orientationFilter,
  sizeFilter,
  hasUrlFilter,
  hasNoteFilter,
  ratingFilter,
  onCategoryChange,
  onColorChange,
  onFolderChange,
  onOrientationChange,
  onSizeChange,
  onHasUrlChange,
  onHasNoteChange,
  onRatingChange,
  onClearAll,
}: FilterBarProps) {
  const { t } = useTranslation();
  const [pinned, setPinned] = useState<FilterCriterionId[]>(loadPinnedCriteria);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [addPanelOpen, setAddPanelOpen] = useState(false);

  const togglePin = (id: FilterCriterionId, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setPinned((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((x) => x !== id) : [...prev, id];
      const ordered = ALL_CRITERIA_ORDER.filter((k) => next.includes(k));
      savePinnedCriteria(ordered);
      return ordered;
    });
  };

  const categories: { id: WorkspaceCategory; label: string }[] = [
    { id: "all", label: t("workspace.categories.all") },
    { id: "image", label: t("workspace.categories.images") },
    { id: "video", label: t("workspace.categories.videos") },
    { id: "audio", label: t("workspace.categories.audio") },
    { id: "document", label: t("workspace.categories.docs") },
    { id: "archive", label: t("workspace.categories.archives") },
    { id: "other", label: t("workspace.categories.other") },
  ];

  const orientations: { id: WorkspaceOrientation; label: string }[] = [
    { id: "all", label: t("filters.allOrientations") },
    { id: "landscape", label: t("filters.landscape") },
    { id: "portrait", label: t("filters.portrait") },
    { id: "square", label: t("filters.square") },
  ];

  const sizeRanges: { id: WorkspaceSizeFilter; label: string }[] = [
    { id: "all", label: t("filters.sizeAll") },
    { id: "small", label: t("filters.sizeSmall") },
    { id: "medium", label: t("filters.sizeMedium") },
    { id: "large", label: t("filters.sizeLarge") },
  ];

  const urlOptions: { id: WorkspacePresenceFilter; label: string }[] = [
    { id: "all", label: t("filters.urlAll") },
    { id: "has", label: t("filters.urlHas") },
    { id: "empty", label: t("filters.urlEmpty") },
  ];

  const noteOptions: { id: WorkspacePresenceFilter; label: string }[] = [
    { id: "all", label: t("filters.notesAll") },
    { id: "has", label: t("filters.notesHas") },
    { id: "empty", label: t("filters.notesEmpty") },
  ];

  const ratingOptions: { value: number | null; label: string }[] = [
    { value: null, label: t("filters.ratingAll") },
    { value: 5, label: "★★★★★ (5)" },
    { value: 4, label: "★★★★☆ (4)" },
    { value: 3, label: "★★★☆☆ (3)" },
    { value: 2, label: "★★☆☆☆ (2)" },
    { value: 1, label: "★☆☆☆☆ (1)" },
    { value: 0, label: t("filters.ratingUnrated") },
  ];

  // Flatten folders for dropdown filter
  const flatFolders = useMemo(() => {
    const out: { id: string; name: string; count: number }[] = [];
    const walk = (list: Folder[], prefix = "") => {
      for (const f of list) {
        const display = prefix ? `${prefix} / ${f.name}` : f.name;
        out.push({ id: f.id, name: display, count: f.itemCount ?? 0 });
        if (f.children && f.children.length > 0) {
          walk(f.children, display);
        }
      }
    };
    walk(folders);
    return out;
  }, [folders]);


  const isCriterionActive = (id: FilterCriterionId): boolean => {
    switch (id) {
      case "type":
        return categoryFilter !== "all";
      case "color":
        return Boolean(colorFilter);
      case "folder":
        return Boolean(folderFilter);
      case "orientation":
        return orientationFilter !== "all";
      case "size":
        return sizeFilter !== "all";
      case "url":
        return hasUrlFilter !== "all";
      case "notes":
        return hasNoteFilter !== "all";
      case "rating":
        return ratingFilter !== null && ratingFilter !== undefined;
    }
  };

  // Visible pills: pinned criteria + any currently active unpinned criterion
  const visibleCriteria = useMemo(() => {
    return ALL_CRITERIA_ORDER.filter(
      (id) => pinned.includes(id) || isCriterionActive(id)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pinned,
    categoryFilter,
    colorFilter,
    folderFilter,
    orientationFilter,
    sizeFilter,
    hasUrlFilter,
    hasNoteFilter,
    ratingFilter,
  ]);

  const activeCategoryLabel =
    categoryFilter === "all"
      ? t("filters.type")
      : categories.find((c) => c.id === categoryFilter)?.label ?? t("filters.type");

  const activeFolderLabel = useMemo(() => {
    if (!folderFilter) return t("filters.folder");
    if (folderFilter === UNCATEGORIZED_FOLDER_FILTER) {
      return t("filters.uncategorized");
    }
    return (
      flatFolders.find((f) => f.id === folderFilter)?.name ??
      t("filters.folder")
    );
  }, [folderFilter, flatFolders, t]);

  const activeOrientationLabel =
    orientationFilter === "all"
      ? t("filters.orientation")
      : orientations.find((o) => o.id === orientationFilter)?.label ??
        t("filters.orientation");

  const activeSizeLabel =
    sizeFilter === "all"
      ? t("filters.size")
      : sizeRanges.find((s) => s.id === sizeFilter)?.label ?? t("filters.size");

  const activeUrlLabel =
    hasUrlFilter === "all"
      ? t("filters.url")
      : urlOptions.find((u) => u.id === hasUrlFilter)?.label ?? t("filters.url");

  const activeNoteLabel =
    hasNoteFilter === "all"
      ? t("filters.notes")
      : noteOptions.find((n) => n.id === hasNoteFilter)?.label ?? t("filters.notes");

  const activeRatingLabel =
    ratingFilter === null || ratingFilter === undefined
      ? t("filters.rating")
      : ratingFilter === 0
      ? t("filters.ratingUnrated")
      : `${ratingFilter} ★`;

  const hasAnyFilter = ALL_CRITERIA_ORDER.some((id) => isCriterionActive(id));

  const pillBaseClass =
    "h-6.5 px-2 rounded-md text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer border select-none";
  const pillInactiveClass =
    "border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60";
  const pillActiveClass =
    "border-primary/40 bg-primary/10 text-primary font-semibold";

  const renderCriterionPill = (id: FilterCriterionId) => {
    const isOpen = openMenuId === id;
    const setOpen = (open: boolean) => setOpenMenuId(open ? id : null);
    const active = isCriterionActive(id);

    switch (id) {
      case "type":
        return (
          <Popover key={id} open={isOpen} onOpenChange={setOpen}>
            <PopoverTrigger
              className={cn(pillBaseClass, active ? pillActiveClass : pillInactiveClass)}
            >
              <Layers className="size-3 shrink-0" />
              <span>{activeCategoryLabel}</span>
              <ChevronDown className="size-3 opacity-70" />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="w-40 p-1 rounded-xl shadow-xl border border-border bg-popover text-popover-foreground z-50 text-xs"
            >
              <div className="space-y-0.5">
                {categories.map((cat) => {
                  const isSelected = categoryFilter === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        onCategoryChange(cat.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer",
                        isSelected
                          ? "bg-primary/10 text-primary font-semibold"
                          : "hover:bg-accent text-foreground"
                      )}
                    >
                      <span>{cat.label}</span>
                      {isSelected && <Check className="size-3.5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        );

      case "color":
        return (
          <Popover key={id} open={isOpen} onOpenChange={setOpen}>
            <PopoverTrigger
              className={cn(pillBaseClass, active ? pillActiveClass : pillInactiveClass)}
            >
              {colorFilter ? (
                <span
                  style={{ backgroundColor: colorFilter }}
                  className="size-3 rounded-full ring-1 ring-black/20 dark:ring-white/30 shrink-0"
                />
              ) : (
                <Palette className="size-3 shrink-0" />
              )}
              <span>{colorFilter ? colorFilter.toUpperCase() : t("filters.color")}</span>
              <ChevronDown className="size-3 opacity-70" />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="w-52 p-2.5 rounded-xl shadow-xl border border-border bg-popover text-popover-foreground z-50 text-xs space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("filters.color")}
                </span>
                {colorFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      onColorChange(null);
                      setOpen(false);
                    }}
                    className="text-[10px] text-primary hover:underline cursor-pointer"
                  >
                    {t("filters.allColors")}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {PRESET_FILTER_COLORS.map((swatch) => {
                  const isSelected =
                    colorFilter?.toLowerCase() === swatch.hex.toLowerCase();
                  return (
                    <button
                      key={swatch.hex}
                      type="button"
                      title={swatch.name}
                      onClick={() => {
                        onColorChange(isSelected ? null : swatch.hex);
                        setOpen(false);
                      }}
                      style={{ backgroundColor: swatch.hex }}
                      className={cn(
                        "size-5 rounded-full transition-transform hover:scale-115 cursor-pointer ring-1 ring-black/15 dark:ring-white/20 flex items-center justify-center",
                        isSelected && "ring-2 ring-primary scale-115"
                      )}
                    />
                  );
                })}
              </div>

              {libraryTopColors.length > 0 && (
                <div className="pt-1.5 border-t border-border/50 space-y-1.5">
                  <span className="text-[10px] text-muted-foreground block">
                    {t("inspector.colorPalette")}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {libraryTopColors.map((hex) => {
                      const isSelected =
                        colorFilter?.toLowerCase() === hex.toLowerCase();
                      return (
                        <button
                          key={hex}
                          type="button"
                          title={hex}
                          onClick={() => {
                            onColorChange(isSelected ? null : hex);
                            setOpen(false);
                          }}
                          style={{ backgroundColor: hex }}
                          className={cn(
                            "size-5 rounded-xs transition-transform hover:scale-110 cursor-pointer ring-1 ring-black/15 dark:ring-white/20",
                            isSelected && "ring-2 ring-primary scale-110"
                          )}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </PopoverContent>
          </Popover>
        );

      case "folder":
        return (
          <Popover key={id} open={isOpen} onOpenChange={setOpen}>
            <PopoverTrigger
              className={cn(pillBaseClass, active ? pillActiveClass : pillInactiveClass)}
            >
              <FolderIcon className="size-3 shrink-0" />
              <span className="max-w-28 truncate">{activeFolderLabel}</span>
              <ChevronDown className="size-3 opacity-70" />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="w-52 p-1 rounded-xl shadow-xl border border-border bg-popover text-popover-foreground z-50 text-xs max-h-64 overflow-y-auto"
            >
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    onFolderChange(null);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer",
                    !folderFilter
                      ? "bg-primary/10 text-primary font-semibold"
                      : "hover:bg-accent text-foreground"
                  )}
                >
                  <span>{t("filters.allFolders")}</span>
                  {!folderFilter && <Check className="size-3.5 text-primary" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onFolderChange(
                      folderFilter === UNCATEGORIZED_FOLDER_FILTER
                        ? null
                        : UNCATEGORIZED_FOLDER_FILTER
                    );
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer",
                    folderFilter === UNCATEGORIZED_FOLDER_FILTER
                      ? "bg-primary/10 text-primary font-semibold"
                      : "hover:bg-accent text-muted-foreground"
                  )}
                >
                  <span>{t("filters.uncategorized")}</span>
                  {folderFilter === UNCATEGORIZED_FOLDER_FILTER && (
                    <Check className="size-3.5 text-primary" />
                  )}
                </button>

                {flatFolders.length > 0 && <div className="my-1 h-px bg-border/50" />}

                {isOpen &&
                  flatFolders.map((f) => {
                    const isSelected = folderFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          onFolderChange(isSelected ? null : f.id);
                          setOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer",
                          isSelected
                            ? "bg-primary/10 text-primary font-semibold"
                            : "hover:bg-accent text-foreground"
                        )}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <FolderIcon className="size-3 text-muted-foreground shrink-0" />
                          <span className="truncate">{f.name}</span>
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {f.count}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </PopoverContent>
          </Popover>
        );

      case "orientation":
        return (
          <Popover key={id} open={isOpen} onOpenChange={setOpen}>
            <PopoverTrigger
              className={cn(pillBaseClass, active ? pillActiveClass : pillInactiveClass)}
            >
              <Ratio className="size-3 shrink-0" />
              <span>{activeOrientationLabel}</span>
              <ChevronDown className="size-3 opacity-70" />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="w-40 p-1 rounded-xl shadow-xl border border-border bg-popover text-popover-foreground z-50 text-xs"
            >
              <div className="space-y-0.5">
                {orientations.map((o) => {
                  const isSelected = orientationFilter === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        onOrientationChange(o.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer",
                        isSelected
                          ? "bg-primary/10 text-primary font-semibold"
                          : "hover:bg-accent text-foreground"
                      )}
                    >
                      <span>{o.label}</span>
                      {isSelected && <Check className="size-3.5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        );

      case "size":
        return (
          <Popover key={id} open={isOpen} onOpenChange={setOpen}>
            <PopoverTrigger
              className={cn(pillBaseClass, active ? pillActiveClass : pillInactiveClass)}
            >
              <HardDrive className="size-3 shrink-0" />
              <span>{activeSizeLabel}</span>
              <ChevronDown className="size-3 opacity-70" />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="w-44 p-1 rounded-xl shadow-xl border border-border bg-popover text-popover-foreground z-50 text-xs"
            >
              <div className="space-y-0.5">
                {sizeRanges.map((s) => {
                  const isSelected = sizeFilter === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        onSizeChange(s.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer",
                        isSelected
                          ? "bg-primary/10 text-primary font-semibold"
                          : "hover:bg-accent text-foreground"
                      )}
                    >
                      <span>{s.label}</span>
                      {isSelected && <Check className="size-3.5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        );

      case "url":
        return (
          <Popover key={id} open={isOpen} onOpenChange={setOpen}>
            <PopoverTrigger
              className={cn(pillBaseClass, active ? pillActiveClass : pillInactiveClass)}
            >
              <LinkIcon className="size-3 shrink-0" />
              <span>{activeUrlLabel}</span>
              <ChevronDown className="size-3 opacity-70" />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="w-40 p-1 rounded-xl shadow-xl border border-border bg-popover text-popover-foreground z-50 text-xs"
            >
              <div className="space-y-0.5">
                {urlOptions.map((u) => {
                  const isSelected = hasUrlFilter === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        onHasUrlChange(u.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer",
                        isSelected
                          ? "bg-primary/10 text-primary font-semibold"
                          : "hover:bg-accent text-foreground"
                      )}
                    >
                      <span>{u.label}</span>
                      {isSelected && <Check className="size-3.5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        );

      case "notes":
        return (
          <Popover key={id} open={isOpen} onOpenChange={setOpen}>
            <PopoverTrigger
              className={cn(pillBaseClass, active ? pillActiveClass : pillInactiveClass)}
            >
              <FileText className="size-3 shrink-0" />
              <span>{activeNoteLabel}</span>
              <ChevronDown className="size-3 opacity-70" />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="w-40 p-1 rounded-xl shadow-xl border border-border bg-popover text-popover-foreground z-50 text-xs"
            >
              <div className="space-y-0.5">
                {noteOptions.map((n) => {
                  const isSelected = hasNoteFilter === n.id;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        onHasNoteChange(n.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer",
                        isSelected
                          ? "bg-primary/10 text-primary font-semibold"
                          : "hover:bg-accent text-foreground"
                      )}
                    >
                      <span>{n.label}</span>
                      {isSelected && <Check className="size-3.5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        );

      case "rating":
        return (
          <Popover key={id} open={isOpen} onOpenChange={setOpen}>
            <PopoverTrigger
              className={cn(pillBaseClass, active ? pillActiveClass : pillInactiveClass)}
            >
              <Star className="size-3 shrink-0" />
              <span>{activeRatingLabel}</span>
              <ChevronDown className="size-3 opacity-70" />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="w-44 p-1 rounded-xl shadow-xl border border-border bg-popover text-popover-foreground z-50 text-xs"
            >
              <div className="space-y-0.5">
                {ratingOptions.map((opt) => {
                  const isSelected =
                    (ratingFilter ?? null) === opt.value;
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => {
                        onRatingChange(isSelected ? null : opt.value);
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer",
                        isSelected
                          ? "bg-primary/10 text-primary font-semibold"
                          : "hover:bg-accent text-foreground"
                      )}
                    >
                      <span>{opt.label}</span>
                      {isSelected && <Check className="size-3.5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        );
    }
  };

  const criteriaCatalog: {
    id: FilterCriterionId;
    label: string;
    icon: React.ReactNode;
  }[] = [
    { id: "type", label: t("filters.type"), icon: <Layers className="size-3.5" /> },
    { id: "color", label: t("filters.color"), icon: <Palette className="size-3.5" /> },
    { id: "folder", label: t("filters.folder"), icon: <FolderIcon className="size-3.5" /> },
    { id: "orientation", label: t("filters.orientation"), icon: <Ratio className="size-3.5" /> },
    { id: "size", label: t("filters.size"), icon: <HardDrive className="size-3.5" /> },
    { id: "url", label: t("filters.url"), icon: <LinkIcon className="size-3.5" /> },
    { id: "notes", label: t("filters.notes"), icon: <FileText className="size-3.5" /> },
    { id: "rating", label: t("filters.rating"), icon: <Star className="size-3.5" /> },
  ];

  return (
    <div className="flex items-center gap-1.5 flex-wrap header-interactive-container wails-no-drag">
      {visibleCriteria.map((id) => renderCriterionPill(id))}

      {/* [+] Button: Popover panel listing all filter criteria with right-aligned Pin toggles */}
      <Popover open={addPanelOpen} onOpenChange={setAddPanelOpen}>
        <PopoverTrigger
          title={t("filters.manageFilters")}
          className={cn(
            "size-6.5 rounded-md inline-flex items-center justify-center transition-colors cursor-pointer border select-none",
            addPanelOpen
              ? pillActiveClass
              : "border-dashed border-border/80 bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/60"
          )}
        >
          <Plus className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-56 p-1.5 rounded-xl shadow-xl border border-border bg-popover text-popover-foreground z-50 text-xs"
        >
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50 mb-1">
            {t("filters.manageFilters")}
          </div>
          <div className="space-y-0.5">
            {criteriaCatalog.map((entry) => {
              const isPinned = pinned.includes(entry.id);
              const isActive = isCriterionActive(entry.id);
              return (
                <div
                  key={entry.id}
                  onClick={() => {
                    if (!isPinned) {
                      togglePin(entry.id);
                    }
                    setAddPanelOpen(false);
                    window.setTimeout(() => setOpenMenuId(entry.id), 30);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer group",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-accent text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={cn(
                        "shrink-0",
                        isActive ? "text-primary" : "text-muted-foreground"
                      )}
                    >
                      {entry.icon}
                    </span>
                    <span className="truncate">{entry.label}</span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => togglePin(entry.id, e)}
                    title={isPinned ? t("filters.unpinFilter") : t("filters.pinFilter")}
                    className={cn(
                      "p-1 rounded-md transition-colors cursor-pointer shrink-0",
                      isPinned
                        ? "text-primary bg-primary/10 hover:bg-primary/20"
                        : "text-muted-foreground/45 hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <Pin
                      className={cn(
                        "size-3",
                        isPinned && "fill-current"
                      )}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* Clear all active filters button */}
      {hasAnyFilter && (
        <button
          type="button"
          onClick={onClearAll}
          title={t("filters.clearAll")}
          className="h-6.5 px-2 rounded-md text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center gap-1 transition-colors cursor-pointer"
        >
          <X className="size-3" />
          <span>{t("filters.clearAll")}</span>
        </button>
      )}
    </div>
  );
}, (prev, next) =>
  prev.libraryTopColors === next.libraryTopColors &&
  prev.folders === next.folders &&
  prev.categoryFilter === next.categoryFilter &&
  prev.colorFilter === next.colorFilter &&
  prev.folderFilter === next.folderFilter &&
  prev.orientationFilter === next.orientationFilter &&
  prev.sizeFilter === next.sizeFilter &&
  prev.hasUrlFilter === next.hasUrlFilter &&
  prev.hasNoteFilter === next.hasNoteFilter &&
  prev.ratingFilter === next.ratingFilter
);
