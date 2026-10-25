import { cn } from "@/lib/utils";

/**
 * Shared class fragments for the sidebar. Every row in the sidebar (virtual
 * folders, tree nodes, menu entries) shares the same skeleton, so it lives here
 * instead of being re-typed at each call site.
 */

/** The interactive row itself. */
export const SIDEBAR_ROW_BASE =
  "flex-1 flex items-center gap-2 min-w-0 h-8 pl-1 pr-2 rounded-lg text-left text-xs transition-colors cursor-pointer";

/** Selected / hovered highlight, driven by the foreground colour so it stays neutral. */
export const SIDEBAR_ROW_SELECTED =
  "bg-foreground/5 text-sidebar-foreground font-semibold";
export const SIDEBAR_ROW_IDLE = "hover:bg-foreground/5 text-sidebar-foreground";

export function sidebarRowClass(
  selected: boolean,
  extra?: string | false | null
): string {
  return cn(
    SIDEBAR_ROW_BASE,
    "relative",
    selected ? SIDEBAR_ROW_SELECTED : SIDEBAR_ROW_IDLE,
    extra
  );
}

/** Wrapper that owns the drop target for a row. */
export const SIDEBAR_DROP_ROW =
  "flex items-center w-full relative rounded-lg overflow-hidden";

/** The 3px gutter that aligns rows with the sidebar header. */
export const SIDEBAR_ROW_GUTTER = "w-3 shrink-0";

/** Drag highlight masks (drawn as border + translucent fill, never text). */
export const SIDEBAR_DROP_MASK_PRIMARY =
  "pointer-events-none absolute inset-0 z-30 rounded-lg border border-dashed border-primary bg-foreground/10";
export const SIDEBAR_DROP_MASK_DESTRUCTIVE =
  "pointer-events-none absolute inset-0 z-30 rounded-lg border border-dashed border-destructive bg-foreground/10";
/** Mask shown when the OS-drag "file drop target" overlay is active. */
export const SIDEBAR_DROP_MASK_PASSIVE =
  "pointer-events-none absolute inset-0 z-30 hidden rounded-lg border border-dashed border-primary bg-foreground/10 [.file-drop-target-active_&]:!block";
export const SIDEBAR_DROP_MASK_PASSIVE_DESTRUCTIVE =
  "pointer-events-none absolute inset-0 z-30 hidden rounded-lg border border-dashed border-destructive bg-foreground/10 [.file-drop-target-active_&]:!block";

/** Read-only count shown at the end of a row. */
export const SIDEBAR_COUNT_CLASS =
  "text-[10px] font-mono text-muted-foreground/70";

/** Menu entry inside a context menu / popover. */
export const SIDEBAR_MENU_ITEM_BASE =
  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors cursor-pointer";
export const SIDEBAR_MENU_ITEM_CLASS = cn(
  SIDEBAR_MENU_ITEM_BASE,
  "hover:bg-foreground/5"
);
export const SIDEBAR_MENU_ITEM_DESTRUCTIVE_CLASS = cn(
  SIDEBAR_MENU_ITEM_BASE,
  "text-destructive hover:bg-destructive/10"
);
