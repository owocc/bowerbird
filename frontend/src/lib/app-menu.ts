import { Window } from "@wailsio/runtime";
import { GetAppMenu, InvokeAppMenu } from "../../bindings/bowerbird/core/service";
import type { AppMenuItem } from "../../bindings/bowerbird/core/models";

/**
 * Application menu actions, mirroring the `AppMenu*` constants in
 * `core/appmenu.go`.
 *
 * The Go bridge is the source of truth for the menu's content (labels, order,
 * shortcuts); these ids only exist so the shortcut layer can name an action and
 * hand it to the same dispatcher the menu button uses.
 */
export const APP_MENU_ACTION = {
  // Application-scoped: executed by the Go bridge.
  settings: "settings",
  about: "about",
  quit: "quit",

  // Window-scoped: executed in the webview, because they target one window.
  reload: "reload",
  forceReload: "force-reload",
  fullscreen: "fullscreen",
  devTools: "devtools",
  closeWindow: "close-window",
  zoomIn: "zoom-in",
  zoomOut: "zoom-out",
  zoomReset: "zoom-reset",
} as const;

export type AppMenuAction = (typeof APP_MENU_ACTION)[keyof typeof APP_MENU_ACTION];

/**
 * Window-scoped action implementations.
 *
 * Anything missing here is forwarded to the Go bridge (`InvokeAppMenu`), which
 * owns the application-scoped actions.
 */
const WINDOW_ACTIONS: Partial<Record<AppMenuAction, () => void>> = {
  [APP_MENU_ACTION.reload]: () => Window.Reload(),
  [APP_MENU_ACTION.forceReload]: () => Window.ForceReload(),
  [APP_MENU_ACTION.fullscreen]: () => Window.ToggleFullscreen(),
  [APP_MENU_ACTION.devTools]: () => Window.OpenDevTools(),
  [APP_MENU_ACTION.closeWindow]: () => Window.Close(),
  [APP_MENU_ACTION.zoomIn]: () => Window.ZoomIn(),
  [APP_MENU_ACTION.zoomOut]: () => Window.ZoomOut(),
  [APP_MENU_ACTION.zoomReset]: () => Window.ZoomReset(),
};

/**
 * Runs one application menu action.
 *
 * Both the ≡ menu button and the in-app shortcut layer go through here, so a
 * menu row and its keyboard shortcut can never drift apart.
 */
export async function runAppMenuAction(action: string): Promise<void> {
  const windowAction = WINDOW_ACTIONS[action as AppMenuAction];
  if (windowAction) {
    windowAction();
    return;
  }
  await InvokeAppMenu(action);
}

let menuPromise: Promise<AppMenuItem[]> | null = null;

/**
 * Loads the application menu model from the Go bridge, caching it for the
 * lifetime of the window.
 */
export function loadAppMenu(): Promise<AppMenuItem[]> {
  if (!menuPromise) {
    menuPromise = Promise.resolve(GetAppMenu())
      .then((items) => items ?? [])
      .catch((err) => {
        // Do not cache a failure: the next call may well succeed.
        menuPromise = null;
        throw err;
      });
  }
  return menuPromise;
}
