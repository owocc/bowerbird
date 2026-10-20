/**
 * The desktop host bridge used by the frontend.
 *
 * The app is built on mygo now, but most components were written against the
 * shape of the Wails runtime: `Events.On(name, cb)` where the callback receives
 * `{ data }`, `Window.Reload()`, and `Clipboard.SetText()`. This module keeps
 * that shape and forwards to the typed mygo client, so the migration does not
 * touch every call site.
 */
import { currentWindow, isMyGo, on, once } from "mygo-runtime";
import { Service } from "../mygo";

/** Whether the page runs inside the desktop host (not a plain browser tab). */
export function isDesktopHost(): boolean {
  return isMyGo();
}

/** Events emitted by Go. The callback gets the Wails-style `{ data }` payload. */
export const Events = {
  On(name: string, callback: (event: { data: unknown }) => void): () => void {
    return on(name, (payload) => callback({ data: payload }));
  },
  Once(name: string, callback: (event: { data: unknown }) => void): () => void {
    return once(name, (payload) => callback({ data: payload }));
  },
};

/** Text clipboard access through the Go side (works without browser permissions). */
export const Clipboard = {
  async SetText(text: string): Promise<void> {
    await Service.writeClipboardText(text);
  },
};

let zoom = 1;

function applyZoom(next: number) {
  zoom = Math.min(3, Math.max(0.5, next));
  document.documentElement.style.zoom = zoom === 1 ? "" : String(zoom);
}

/** Window controls. Reload and zoom are page-local; the rest is native. */
export const Window = {
  Reload(): void {
    window.location.reload();
  },
  ForceReload(): void {
    window.location.reload();
  },
  ToggleFullscreen(): void {
    void currentWindow.toggleFullScreen();
  },
  OpenDevTools(): void {
    // mygo has native inspector commands but no page API; development builds
    // open the inspector from the menu instead.
  },
  Close(): void {
    void currentWindow.close();
  },
  ZoomIn(): void {
    applyZoom(zoom + 0.1);
  },
  ZoomOut(): void {
    applyZoom(zoom - 0.1);
  },
  ZoomReset(): void {
    applyZoom(1);
  },
};
