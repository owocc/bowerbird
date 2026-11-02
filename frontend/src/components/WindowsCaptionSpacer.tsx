import React from "react";

import { cn } from "@/lib/utils";
import { useIsWindows, WINDOWS_CAPTION } from "@/lib/windows";

export interface WindowsCaptionSpacerProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Whether this spacer also acts as a window drag region. Defaults to true so
   * the reserved strip behaves like the rest of the titlebar.
   */
  draggable?: boolean;
}

/**
 * Windows caption buttons spacer — the Windows counterpart of
 * `MacTrafficLightSpacer`.
 *
 * On Windows the OS draws minimize / maximize / close over the top-right corner
 * of the webview (the window runs with a hidden inset titlebar). Any row that
 * ends up flush with the window's right edge must reserve that strip first, or
 * its own buttons get covered by the caption buttons.
 *
 * Renders nothing on non-Windows platforms, so it is safe to mount
 * unconditionally next to right-aligned action groups.
 */
export function WindowsCaptionSpacer({
  className,
  draggable = true,
  children,
  ...props
}: WindowsCaptionSpacerProps) {
  const onWindows = useIsWindows();

  if (!onWindows) {
    return null;
  }

  return (
    <div
      data-windows-caption-spacer="true"
      aria-hidden={children ? undefined : "true"}
      className={cn(
        WINDOWS_CAPTION.widthClass,
        "h-full shrink-0 select-none",
        draggable && "wails-drag",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { WINDOWS_CAPTION };
