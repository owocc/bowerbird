import { useEffect, useState } from "react";
import { runAppMenuAction } from "@/lib/app-menu";
import { usesInAppMenuBar } from "@/lib/platform";
import { eventMatchesAccelerator } from "@/lib/accelerator";
import { APP_SHORTCUT_IDS } from "@/lib/shortcuts";
import { GetShortcutSettings } from "../../bindings/bowerbird/core/service";
import { Events } from "@/lib/host-runtime";

/**
 * In-app shortcuts for every catalog entry whose type is `app` (the default).
 * Global actions (capture, toggle main window) are OS hotkeys and must not
 * also fire here, or they would double-trigger while a window is focused.
 *
 * Window chrome actions (reload/zoom/…) only bind on platforms that draw
 * the app's own menu (`usesInAppMenuBar`); settings/logs bind in every window.
 */
const EVERY_WINDOW_APP_IDS = new Set(["settings", "logs"]);

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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;

      for (const action of APP_SHORTCUT_IDS) {
        if (!EVERY_WINDOW_APP_IDS.has(action) && !usesInAppMenuBar()) continue;
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
