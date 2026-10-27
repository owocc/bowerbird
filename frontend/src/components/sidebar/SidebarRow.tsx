import React from "react";

import { SidebarMenuItem } from "@/components/ui/sidebar";

import {
  SIDEBAR_DROP_MASK_PASSIVE,
  SIDEBAR_DROP_MASK_PASSIVE_DESTRUCTIVE,
  SIDEBAR_DROP_MASK_PRIMARY,
  SIDEBAR_DROP_MASK_DESTRUCTIVE,
  SIDEBAR_DROP_ROW,
  SIDEBAR_ROW_GUTTER,
  sidebarRowClass,
} from "./styles";

export interface SidebarRowProps {
  /** Leading icon; callers pass `className="size-4 shrink-0 text-muted-foreground"`. */
  icon: React.ReactNode;
  label: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
  /** Optional trailing content (usually a count). */
  trailing?: React.ReactNode;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  /** Value for `data-file-drop-target`; omit for non-drop rows. */
  dropTarget?: "all" | "trash";
  dropActive?: boolean;
  destructiveDrop?: boolean;
}

/**
 * A single entry in the sidebar's fixed list (All / Untagged / Uncategorized /
 * History / All Tags / Trash). Owns the gutter, hover/selected styling, the
 * drop mask and the passive file-drop mask so call sites stay declarative.
 */
export function SidebarRow({
  icon,
  label,
  selected,
  onSelect,
  trailing,
  onContextMenu,
  onDrop,
  dropTarget,
  dropActive = false,
  destructiveDrop = false,
}: SidebarRowProps) {
  return (
    <SidebarMenuItem className="relative">
      <div
        data-file-drop-target={dropTarget}
        data-drag-over={dropActive ? "true" : undefined}
        onDrop={onDrop}
        onContextMenu={onContextMenu}
        className={SIDEBAR_DROP_ROW}
      >
        <div className={SIDEBAR_ROW_GUTTER} />
        <button
          type="button"
          onClick={onSelect}
          className={sidebarRowClass(selected)}
        >
          {icon}
          <span className="truncate flex-1 text-xs">{label}</span>
          {trailing}

          {dropActive && (
            <div
              className={
                destructiveDrop
                  ? SIDEBAR_DROP_MASK_DESTRUCTIVE
                  : SIDEBAR_DROP_MASK_PRIMARY
              }
            />
          )}
          <div
            className={
              destructiveDrop
                ? SIDEBAR_DROP_MASK_PASSIVE_DESTRUCTIVE
                : SIDEBAR_DROP_MASK_PASSIVE
            }
          />
        </button>
      </div>
    </SidebarMenuItem>
  );
}
