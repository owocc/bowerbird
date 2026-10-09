import { useEffect } from "react";
import { APP_MENU_ACTION, runAppMenuAction } from "@/lib/app-menu";
import { usesInAppMenuBar } from "@/lib/platform";

/**
 * Standard application/window shortcuts for the platforms that draw the app's
 * own menu (Windows and Linux - see `usesInAppMenuBar`).
 *
 * macOS gets these from the native menu roles (Reload, Toggle Full Screen,
 * Developer Tools), so nothing is registered there. Windows and Linux have no
 * usable native menu (a GTK menu bar cannot be hidden or restyled, and a native
 * bar next to the ≡ button would duplicate it), so the same actions are bound
 * here - and dispatched through `runAppMenuAction`, the very function the menu
 * rows use.
 *
 * Editing shortcuts (Ctrl+Z/X/C/V/A) are intentionally left alone: the webview
 * handles them natively inside editable elements.
 *
 * Keys are matched by `event.code` so the shortcuts stay on the same physical
 * keys across keyboard layouts.
 */
export function useAppShortcuts() {
  useEffect(() => {
    if (!usesInAppMenuBar()) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const { ctrlKey, shiftKey, altKey, metaKey, code } = event;

      // Never hijack Meta-based chords.
      if (metaKey) return;

      // Developer tools: Ctrl+Shift+I or F12.
      if (code === "F12" || (ctrlKey && shiftKey && code === "KeyI")) {
        event.preventDefault();
        void runAppMenuAction(APP_MENU_ACTION.devTools);
        return;
      }

      // Fullscreen: F11.
      if (code === "F11") {
        event.preventDefault();
        void runAppMenuAction(APP_MENU_ACTION.fullscreen);
        return;
      }

      if (!ctrlKey || altKey) return;

      switch (code) {
        case "KeyW":
          if (shiftKey) return;
          event.preventDefault();
          void runAppMenuAction(APP_MENU_ACTION.closeWindow);
          return;

        case "KeyQ":
          if (shiftKey) return;
          event.preventDefault();
          void runAppMenuAction(APP_MENU_ACTION.quit);
          return;

        case "KeyR":
          event.preventDefault();
          void runAppMenuAction(
            shiftKey ? APP_MENU_ACTION.forceReload : APP_MENU_ACTION.reload
          );
          return;

        // Zoom: Ctrl+0 / Ctrl+= / Ctrl+-
        case "Digit0":
        case "Numpad0":
          event.preventDefault();
          void runAppMenuAction(APP_MENU_ACTION.zoomReset);
          return;

        case "Equal":
        case "NumpadAdd":
          event.preventDefault();
          void runAppMenuAction(APP_MENU_ACTION.zoomIn);
          return;

        case "Minus":
        case "NumpadSubtract":
          event.preventDefault();
          void runAppMenuAction(APP_MENU_ACTION.zoomOut);
          return;

        default:
          return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
