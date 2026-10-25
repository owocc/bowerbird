import React from "react";

import { cn } from "@/lib/utils";

import {
  SIDEBAR_MENU_ITEM_CLASS,
  SIDEBAR_MENU_ITEM_DESTRUCTIVE_CLASS,
} from "./styles";

export interface SidebarMenuItemButtonProps {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}

/** A single entry inside a sidebar context menu or popover list. */
export function SidebarMenuItemButton({
  icon,
  children,
  onClick,
  destructive = false,
}: SidebarMenuItemButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        destructive
          ? SIDEBAR_MENU_ITEM_DESTRUCTIVE_CLASS
          : SIDEBAR_MENU_ITEM_CLASS
      )}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

/** Horizontal rule between groups of menu entries. */
export function SidebarMenuSeparator() {
  return <div className="my-1 h-px bg-border/60" />;
}
