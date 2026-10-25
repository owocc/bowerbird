import React from "react";
import { PanelLeftClose } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AppMenuButton } from "@/components/AppMenuButton";
import { MacTrafficLightSpacer } from "@/components/MacTrafficLightSpacer";
import { Button } from "@/components/ui/button";
import { SidebarHeader } from "@/components/ui/sidebar";

const COLLAPSE_BUTTON_CLASS =
  "size-7 text-muted-foreground hover:text-sidebar-foreground hover:bg-foreground/5 rounded-lg shrink-0 wails-no-drag";

export interface SidebarTitlebarProps {
  isMac: boolean;
  librarySwitcher: React.ReactNode;
  onToggleCollapse?: () => void;
  collapseShortcutLabel: string;
}

/**
 * The sidebar's own titlebar. macOS keeps the traffic-light inset on its own
 * row with the library switcher below; other platforms put everything on one
 * row. Both variants share the collapse button.
 */
export function SidebarTitlebar({
  isMac,
  librarySwitcher,
  onToggleCollapse,
  collapseShortcutLabel,
}: SidebarTitlebarProps) {
  const { t } = useTranslation();

  const collapseButton = onToggleCollapse ? (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={onToggleCollapse}
      title={t("sidebar.collapseSidebar", { shortcut: collapseShortcutLabel })}
      className={COLLAPSE_BUTTON_CLASS}
    >
      <PanelLeftClose className="size-4" />
    </Button>
  ) : null;

  return (
    <SidebarHeader className="p-0 border-b-0 select-none shrink-0">
      {isMac ? (
        <>
          <div className="h-(--titlebar-height) pl-2 pr-2.5 flex items-center justify-between wails-no-drag">
            <MacTrafficLightSpacer className="w-[80px] h-(--titlebar-height) shrink-0" />
            <div className="flex-1 min-w-0 h-full wails-drag" />
            <div className="flex items-center header-interactive-container wails-no-drag">
              <AppMenuButton align="end" />
              {collapseButton}
            </div>
          </div>

          <div className="h-9 pl-0 pr-2 flex items-center header-interactive-container wails-no-drag">
            <div className="w-3 shrink-0" />
            {librarySwitcher}
          </div>
        </>
      ) : (
        <div className="h-(--titlebar-height) pl-2 pr-2.5 flex items-center justify-between gap-1.5 wails-no-drag">
          <div className="flex items-center flex-1 min-w-0 header-interactive-container wails-no-drag">
            {librarySwitcher}
          </div>
          <div className="flex-1 min-w-2 h-full wails-drag" />
          <div className="flex items-center header-interactive-container wails-no-drag">
            <AppMenuButton align="end" />
            {collapseButton}
          </div>
        </div>
      )}
    </SidebarHeader>
  );
}
