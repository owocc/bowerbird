import React from "react";
import { cn } from "@/lib/utils";
import { useIsMacOS, MACOS_TRAFFIC_LIGHTS } from "@/lib/macos";

export interface MacTrafficLightSpacerProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Whether this spacer acts as a native macOS window drag region.
   * Defaults to true so users can click & drag the window titlebar.
   */
  draggable?: boolean;
}

/**
 * Universal macOS traffic lights spacer tool.
 *
 * In macOS with hidden inset titlebar (MacTitleBarHiddenInset), the window
 * controls (close, minimize, zoom) overlap the web content at x = 13px - 68px.
 *
 * This component reserves 76px of blank space on macOS to ensure no UI
 * elements (icons, text, buttons) clash with system traffic lights.
 * On non-macOS platforms, it renders nothing.
 */
export function MacTrafficLightSpacer({
  className,
  draggable = true,
  children,
  ...props
}: MacTrafficLightSpacerProps) {
  const isMac = useIsMacOS();

  if (!isMac) {
    return null;
  }

  return (
    <div
      data-mac-traffic-lights="true"
      className={cn(
        MACOS_TRAFFIC_LIGHTS.widthClass,
        MACOS_TRAFFIC_LIGHTS.heightClass,
        "shrink-0 select-none pointer-events-auto",
        draggable && "wails-drag",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { MACOS_TRAFFIC_LIGHTS };
