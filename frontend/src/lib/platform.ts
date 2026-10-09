/**
 * Minimal platform detection for the webview. Mirrors the approach used by
 * `lib/macos.ts` (navigator.userAgentData first, then navigator.platform).
 */

import { isMacOS } from "@/lib/macos";

function currentPlatform(): string {
  if (typeof navigator === "undefined") return "";
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  if (nav.userAgentData?.platform) {
    return nav.userAgentData.platform;
  }
  return nav.platform || "";
}

/** Whether the client is running on Linux (WebKitGTK). */
export function isLinux(): boolean {
  if (typeof navigator === "undefined") return false;

  const platform = currentPlatform();
  if (platform) {
    return /linux/i.test(platform);
  }

  // Fallback: the user agent carries "Linux" on Linux, but also on Android.
  const ua = navigator.userAgent || "";
  return /linux/i.test(ua) && !/android/i.test(ua);
}

/** Whether the client is running on Windows (WebView2). */
export function isWindows(): boolean {
  if (typeof navigator === "undefined") return false;

  const platform = currentPlatform();
  if (platform) {
    // "Darwin" contains "win", hence the exclusion.
    return /win/i.test(platform) && !/darwin/i.test(platform);
  }
  return /windows/i.test(navigator.userAgent || "");
}

/**
 * Whether the app draws its own application menu button (the ≡ button).
 *
 * - macOS: no. The menu is registered natively into the global menu bar
 *   (`core.BuildNativeAppMenu`), which is OS-styled and needs no reimplementation.
 * - Windows and Linux: yes. Both render `AppMenuButton` from `core.GetAppMenu`,
 *   which keeps the two platforms identical.
 */
export function usesInAppMenuBar(): boolean {
  // Checked first so an ambiguous platform string can never make macOS draw a
  // second, duplicate menu.
  if (isMacOS()) return false;
  return isWindows() || isLinux();
}
