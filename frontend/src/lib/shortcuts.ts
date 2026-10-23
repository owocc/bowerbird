import { APP_MENU_ACTION } from "@/lib/app-menu";

export type ShortcutScope = "app" | "global";

export type ShortcutDef = {
  id: string;
  titleKey: string;
  descKey: string;
  /** Default is in-app. Only a few actions are OS-global hotkeys. */
  scope?: ShortcutScope;
};

/**
 * Single catalog for Settings rows and in-app listeners.
 * Keep ids aligned with core/shortcuts.go.
 */
export const SHORTCUT_CATALOG: ShortcutDef[] = [
  {
    id: APP_MENU_ACTION.captureArea,
    titleKey: "settings.shortcuts.areaTitle",
    descKey: "settings.shortcuts.areaDesc",
    scope: "global",
  },
  {
    id: APP_MENU_ACTION.captureFullscreen,
    titleKey: "settings.shortcuts.fullscreenTitle",
    descKey: "settings.shortcuts.fullscreenDesc",
    scope: "global",
  },
  {
    id: APP_MENU_ACTION.captureWindow,
    titleKey: "settings.shortcuts.windowTitle",
    descKey: "settings.shortcuts.windowDesc",
    scope: "global",
  },
  {
    id: APP_MENU_ACTION.toggleMainWindow,
    titleKey: "settings.shortcuts.toggleMainTitle",
    descKey: "settings.shortcuts.toggleMainDesc",
    scope: "global",
  },
  {
    id: APP_MENU_ACTION.settings,
    titleKey: "settings.shortcuts.settingsTitle",
    descKey: "settings.shortcuts.settingsDesc",
  },
  {
    id: APP_MENU_ACTION.logs,
    titleKey: "settings.shortcuts.logsTitle",
    descKey: "settings.shortcuts.logsDesc",
  },
  {
    id: APP_MENU_ACTION.reload,
    titleKey: "settings.shortcuts.reloadTitle",
    descKey: "settings.shortcuts.reloadDesc",
  },
  {
    id: APP_MENU_ACTION.forceReload,
    titleKey: "settings.shortcuts.forceReloadTitle",
    descKey: "settings.shortcuts.forceReloadDesc",
  },
  {
    id: APP_MENU_ACTION.fullscreen,
    titleKey: "settings.shortcuts.fullscreenWinTitle",
    descKey: "settings.shortcuts.fullscreenWinDesc",
  },
  {
    id: APP_MENU_ACTION.devTools,
    titleKey: "settings.shortcuts.devtoolsTitle",
    descKey: "settings.shortcuts.devtoolsDesc",
  },
  {
    id: APP_MENU_ACTION.quit,
    titleKey: "settings.shortcuts.quitTitle",
    descKey: "settings.shortcuts.quitDesc",
  },
  {
    id: APP_MENU_ACTION.closeWindow,
    titleKey: "settings.shortcuts.closeTitle",
    descKey: "settings.shortcuts.closeDesc",
  },
  {
    id: APP_MENU_ACTION.zoomIn,
    titleKey: "settings.shortcuts.zoomInTitle",
    descKey: "settings.shortcuts.zoomInDesc",
  },
  {
    id: APP_MENU_ACTION.zoomOut,
    titleKey: "settings.shortcuts.zoomOutTitle",
    descKey: "settings.shortcuts.zoomOutDesc",
  },
  {
    id: APP_MENU_ACTION.zoomReset,
    titleKey: "settings.shortcuts.zoomResetTitle",
    descKey: "settings.shortcuts.zoomResetDesc",
  },
];

export function shortcutScope(id: string): ShortcutScope {
  return SHORTCUT_CATALOG.find((row) => row.id === id)?.scope ?? "app";
}

export function isGlobalShortcut(id: string): boolean {
  return shortcutScope(id) === "global";
}

export const APP_SHORTCUT_IDS = SHORTCUT_CATALOG.filter((row) => !isGlobalShortcut(row.id)).map(
  (row) => row.id,
);
