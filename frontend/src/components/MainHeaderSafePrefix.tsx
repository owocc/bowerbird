import React from "react";
import { default as LayoutSidebar } from "~icons/tabler/layout-sidebar";
import { Button } from "@/components/ui/button";
import { AppMenuButton } from "@/components/AppMenuButton";
import { MacTrafficLightSpacer } from "@/components/MacTrafficLightSpacer";

export interface MainHeaderSafePrefixProps {
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  children?: React.ReactNode;
}

/**
 * Universal safe padding & sidebar toggle container for main column headers.
 * Shared across:
 * 1. Main Gallery view header
 * 2. Double-click inline preview modal header
 *
 * When the sidebar is collapsed, it provides the 80px macOS traffic lights safe padding
 * and renders the persistent sidebar toggle button.
 */
export function MainHeaderSafePrefix({
  sidebarOpen = true,
  onToggleSidebar,
  children,
}: MainHeaderSafePrefixProps) {
  return (
    <div className="h-full flex items-center gap-2 min-w-0 header-interactive-container wails-no-drag">
      {!sidebarOpen && (
        <div className="flex items-center gap-1.5 shrink-0 mr-1.5">
          <MacTrafficLightSpacer className="w-[80px] h-(--titlebar-height) shrink-0" />
          {onToggleSidebar && (
            <>
              {/* App menu (Linux only, renders nothing elsewhere). While the
                  sidebar is collapsed its own ≡ would be unmounted, so the app
                  menu follows the expand button and stays reachable. */}
              <AppMenuButton align="start" />
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onToggleSidebar}
                title="Toggle Sidebar"
                className="size-7 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg shrink-0"
              >
                <LayoutSidebar className="size-4" />
              </Button>
            </>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
