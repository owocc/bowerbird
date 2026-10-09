import { useEffect } from "react";
import { APP_MENU_ACTION, runAppMenuAction } from "@/lib/app-menu";
import { isMacOS } from "@/lib/macos";

/**
 * In-app shortcut that opens the settings window.
 *
 *   macOS          Cmd+,   (platform standard)
 *   Windows/Linux  Ctrl+I  (letter key; Wails' accelerator tables do not map
 *                           punctuation like "," reliably on these platforms)
 *
 * These mirror `appMenuShortcutLabel(AppMenuSettings)` in core/appmenu.go, which
 * is the source of truth for the accelerator shown in the menu.
 *
 * On Windows and Linux this backs up the app's own ≡ menu (the platforms that
 * draw it - see `usesInAppMenuBar`); on macOS it backs up the native
 * "Settings…" menu item. It is deliberately NOT a system-wide (global)
 * shortcut - the DOM `keydown` listener only fires while one of the app's own
 * windows has focus.
 *
 * Mount once per window (see the router's RootLayout) so it covers every route,
 * including the settings window itself.
 */
export function useSettingsShortcut() {
  useEffect(() => {
    const mac = isMacOS();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore auto-repeat and extra modifiers such as Ctrl+Shift+I / Alt+I.
      if (e.repeat || e.altKey || e.shiftKey) return;

      if (mac) {
        if (!e.metaKey || e.ctrlKey) return;
        if (e.key !== "," && e.code !== "Comma") return;
      } else {
        if (!e.ctrlKey || e.metaKey) return;
        if (e.key.toLowerCase() !== "i" && e.code !== "KeyI") return;
      }

      e.preventDefault();
      runAppMenuAction(APP_MENU_ACTION.settings).catch((err) => {
        console.error("Failed to open settings window:", err);
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
