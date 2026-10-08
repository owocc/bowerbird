import React from "react";
import { PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MacTrafficLightSpacer } from "@/components/MacTrafficLightSpacer";
import { useIsMacOS } from "@/lib/macos";

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
 * and renders the persistent sidebar expand button (⌘B).
 */
export function MainHeaderSafePrefix({
  sidebarOpen = true,
  onToggleSidebar,
  children,
}: MainHeaderSafePrefixProps) {
  const isMac = useIsMacOS();

  return (
    <div className="flex items-center gap-2 min-w-0 wails-no-drag">
      {!sidebarOpen && (
        <div className="flex items-center gap-1.5 shrink-0 mr-1.5">
          <MacTrafficLightSpacer className="w-[80px] h-(--titlebar-height) shrink-0" />
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onToggleSidebar}
              title={`Expand Sidebar (${isMac ? "⌘B" : "Ctrl+B"})`}
              className="size-7 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg shrink-0"
            >
              <PanelLeftOpen className="size-4" />
            </Button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
