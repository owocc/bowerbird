import { useEffect, useState } from "react";
import { APP_MENU_ACTION, runAppMenuAction } from "@/lib/app-menu";
import { usesInAppMenuBar } from "@/lib/platform";
import { eventMatchesAccelerator } from "@/lib/accelerator";
import { GetShortcutSettings } from "../../bindings/bowerbird/core/service";
import { Events } from "@/lib/host-runtime";

const WINDOW_SHORTCUT_ACTIONS = [
  APP_MENU_ACTION.devTools,
  APP_MENU_ACTION.fullscreen,
  APP_MENU_ACTION.captureArea,
  APP_MENU_ACTION.captureFullscreen,
  APP_MENU_ACTION.captureWindow,
  APP_MENU_ACTION.closeWindow,
  APP_MENU_ACTION.quit,
  APP_MENU_ACTION.reload,
  APP_MENU_ACTION.forceReload,
  APP_MENU_ACTION.zoomReset,
  APP_MENU_ACTION.zoomIn,
  APP_MENU_ACTION.zoomOut,
] as const;

/**
 * Standard application/window shortcuts for the platforms that draw the app's
 * own menu (Windows and Linux - see `usesInAppMenuBar`).
 *
 * Bindings come from persisted shortcut settings so they stay in sync with
 * Settings, the ≡ menu, and global capture hotkeys.
 */
export function useAppShortcuts() {
  const [bindings, setBindings] = useState<Record<string, string>>({});

  useEffect(() => {
    const load = () => {
      GetShortcutSettings()
        .then((s) => setBindings(s?.bindings ?? {}))
        .catch(() => {});
    };
    load();
    const off = Events.On("shortcuts-changed", (event) => {
      const data = event.data as { bindings?: Record<string, string> } | undefined;
      if (data?.bindings) setBindings(data.bindings);
      else load();
    });
    return () => off();
  }, []);

  useEffect(() => {
    if (!usesInAppMenuBar()) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;

      for (const action of WINDOW_SHORTCUT_ACTIONS) {
        const accel = bindings[action];
        if (!accel) continue;
        if (eventMatchesAccelerator(event, accel)) {
          event.preventDefault();
          void runAppMenuAction(action);
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [bindings]);
}
