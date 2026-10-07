import { useEffect, useState } from "react";

/**
 * Standard dimensions for macOS traffic lights (close, minimize, maximize buttons).
 * In macOS with hidden inset titlebar (MacTitleBarHiddenInset), the buttons occupy
 * roughly x = 13px to 68px. A 76px width provides clean, comfortable clearance.
 */
export const MACOS_TRAFFIC_LIGHTS = {
  width: 80,
  height: 54,
  widthClass: "w-[80px]",
  heightClass: "h-(--titlebar-height)",
} as const;

/**
 * Determines whether the client is running on macOS.
 */
export function isMacOS(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return true;
  }

  const userAgent = navigator.userAgent || "";
  const nav = navigator;
  let platform = "";
  if ("userAgentData" in nav && nav.userAgentData && typeof nav.userAgentData === "object" && "platform" in nav.userAgentData) {
    const p = nav.userAgentData.platform;
    if (typeof p === "string") {
      platform = p;
    }
  } else if ("platform" in nav && typeof nav.platform === "string") {
    platform = nav.platform;
  }

  return (
    /Mac|Macintosh|MacIntel|MacPPC|Mac68K/i.test(platform) ||
    /Mac OS X|Macintosh/i.test(userAgent)
  );
}

/**
 * React hook to reactively check if running on macOS.
 */
export function useIsMacOS(): boolean {
  const [isMac, setIsMac] = useState<boolean>(() => isMacOS());

  useEffect(() => {
    setIsMac(isMacOS());
  }, []);

  return isMac;
}
