import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  Check,
  Palette,
  Folder as FolderIcon,
  Layers,
  Ratio,
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
} from "@/lib/workspace-search";
import { cn } from "@/lib/utils";

export const UNCATEGORIZED_FOLDER_FILTER = "__uncategorized__";
export const UNTAGGED_TAG_FILTER = "__untagged__";

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
  items: Item[];
  folders: Folder[];
  categoryFilter: WorkspaceCategory;
  colorFilter: string | null;
  folderFilter: string | null;
  orientationFilter: WorkspaceOrientation;
  onCategoryChange: (cat: WorkspaceCategory) => void;
  onColorChange: (color: string | null) => void;
  onFolderChange: (folderId: string | null) => void;
  onOrientationChange: (orientation: WorkspaceOrientation) => void;
  onClearAll: () => void;
}

export function FilterBar({
  items,
  folders,
  categoryFilter,
  colorFilter,
  folderFilter,
  orientationFilter,
  onCategoryChange,
  onColorChange,
  onFolderChange,
  onOrientationChange,
  onClearAll,
}: FilterBarProps) {
  const { t } = useTranslation();
  const [typeOpen, setTypeOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [orientOpen, setOrientOpen] = useState(false);

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

  // Extract top library colors dynamically from items to supplement preset swatches
  const libraryTopColors = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of items) {
      if (it.dominantColor) {
        const hex = it.dominantColor.toUpperCase();
        counts[hex] = (counts[hex] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([hex]) => hex);
  }, [items]);

  const activeCategoryLabel =
    categories.find((c) => c.id === categoryFilter)?.label ??
    t("filters.type");

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

  const hasAnyFilter =
    categoryFilter !== "all" ||
    Boolean(colorFilter) ||
    Boolean(folderFilter) ||
    orientationFilter !== "all";

  const pillBaseClass =
    "h-6.5 px-2 rounded-md text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer border select-none";
  const pillInactiveClass =
    "border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60";
  const pillActiveClass =
    "border-primary/40 bg-primary/10 text-primary font-semibold";

  return (
    <div className="flex items-center gap-1.5 flex-wrap header-interactive-container wails-no-drag">
      {/* 1. File Type Dropdown */}
      <Popover open={typeOpen} onOpenChange={setTypeOpen}>
        <PopoverTrigger
          className={cn(
            pillBaseClass,
            categoryFilter !== "all" ? pillActiveClass : pillInactiveClass
          )}
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
                    setTypeOpen(false);
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

      {/* 2. Color Palette Filter Dropdown */}
      <Popover open={colorOpen} onOpenChange={setColorOpen}>
        <PopoverTrigger
          className={cn(
            pillBaseClass,
            colorFilter ? pillActiveClass : pillInactiveClass
          )}
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
                  setColorOpen(false);
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
                    setColorOpen(false);
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
                        setColorOpen(false);
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


      {/* 4. Folder Filter Dropdown */}
      <Popover open={folderOpen} onOpenChange={setFolderOpen}>
        <PopoverTrigger
          className={cn(
            pillBaseClass,
            folderFilter ? pillActiveClass : pillInactiveClass
          )}
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
                setFolderOpen(false);
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
                setFolderOpen(false);
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

            {flatFolders.map((f) => {
              const isSelected = folderFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    onFolderChange(isSelected ? null : f.id);
                    setFolderOpen(false);
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

      {/* 5. Aspect Orientation Filter Dropdown */}
      <Popover open={orientOpen} onOpenChange={setOrientOpen}>
        <PopoverTrigger
          className={cn(
            pillBaseClass,
            orientationFilter !== "all" ? pillActiveClass : pillInactiveClass
          )}
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
                    setOrientOpen(false);
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
}
