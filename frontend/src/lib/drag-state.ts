/**
 * Whether the drag currently in flight is one started by this app.
 *
 * The webview tracks its own HTML5 drags, but on Windows that drag is cancelled
 * and replaced by a native OLE drag (see lib/drag-out.ts). Everything the app
 * then sees is the CF_HDROP payload re-entering the window, which is
 * indistinguishable from a drag coming from Explorer - yet the two must be
 * handled differently: an external drag imports files/folders, an internal one
 * moves library items.
 *
 * The state lives here rather than in component state because it has to be
 * readable from every drag handler (import affordances, folder drop targets,
 * tracing), including ones outside the workspace that started the drag.
 */

const DRAG_FLAG_ATTRIBUTE = "data-internal-dragging";

interface DragFlagWindow extends Window {
  __isInternalDragging?: boolean;
}

/** Marks (or clears) an in-app drag. Kept for the whole native drag lifetime. */
export function setInternalDragActive(active: boolean): void {
  // Both mirrors are our own globals: the window flag is what legacy code reads,
  // the body attribute also survives React re-renders and is CSS-visible.
  const dragWindow = window as DragFlagWindow;
  dragWindow.__isInternalDragging = active;
  if (active) {
    document.body.setAttribute(DRAG_FLAG_ATTRIBUTE, "true");
  } else {
    document.body.removeAttribute(DRAG_FLAG_ATTRIBUTE);
  }
}

/**
 * True when the drag carrying `event` was started by this app. Accepts both a
 * native and a React drag event, since only `dataTransfer` is inspected.
 */
export function isInternalDragActive(event?: { dataTransfer?: DataTransfer | null }): boolean {
  const dragWindow = window as DragFlagWindow;
  if (dragWindow.__isInternalDragging === true) return true;
  if (document.body.hasAttribute(DRAG_FLAG_ATTRIBUTE)) return true;
  const types = Array.from(event?.dataTransfer?.types ?? []);
  return types.some((type) => type.startsWith("application/x-bowerbird"));
}
