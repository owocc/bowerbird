import { useEffect, useState } from "react";
import { APP_MENU_ACTION, runAppMenuAction } from "@/lib/app-menu";
import { eventMatchesAccelerator } from "@/lib/accelerator";
import { GetShortcutSettings } from "../../bindings/bowerbird/core/service";
import { Events } from "@/lib/host-runtime";

/**
 * In-app shortcut that opens the settings / logs windows.
 * Bindings come from persisted shortcut settings.
 */
export function useSettingsShortcut() {
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;

      const settingsAccel = bindings[APP_MENU_ACTION.settings];
      if (settingsAccel && eventMatchesAccelerator(e, settingsAccel)) {
        e.preventDefault();
        runAppMenuAction(APP_MENU_ACTION.settings).catch((err) => {
          console.error("Failed to open settings window:", err);
        });
        return;
      }
      const logsAccel = bindings[APP_MENU_ACTION.logs];
      if (logsAccel && eventMatchesAccelerator(e, logsAccel)) {
        e.preventDefault();
        runAppMenuAction(APP_MENU_ACTION.logs).catch((err) => {
          console.error("Failed to open logs window:", err);
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [bindings]);
}
