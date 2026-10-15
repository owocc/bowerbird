/**
 * Windows native drag-out bridge.
 *
 * A drag started inside the webview can only publish text formats, so on
 * Windows every drop target sees a text/URL payload instead of files (a browser
 * navigates to the file:// URI, which Chrome reports as about:blank#blocked).
 * This module cancels the webview's HTML5 drag and hands the dragged item ids
 * to the Go side, which runs a real OLE drag carrying CF_HDROP - the same
 * payload Explorer publishes for its own file drags.
 *
 * Attached once at the document level (after the drag source handlers have
 * filled the DataTransfer), so every drag source in the app is covered.
 *
 * macOS keeps the webview drag session - installNativeDragHook rewrites its
 * pasteboard - and Linux has no native drag path yet.
 */
import { StartDragItems } from "../../bindings/bowerbird/core/service";
import type { DragRequest } from "../../bindings/bowerbird/core/models";
import { traceDrag } from "./drag-trace";
import { setInternalDragActive } from "./drag-state";
import { isWindows } from "./platform";

let installed = false;

/** Item ids the drag source put on the DataTransfer; multi-selection first. */
function readDraggedItemIds(dataTransfer: DataTransfer | null): string[] {
  if (!dataTransfer) return [];

  const multi = dataTransfer.getData("application/x-bowerbird-item-ids");
  if (multi) {
    try {
      const parsed: unknown = JSON.parse(multi);
      if (Array.isArray(parsed)) {
        return parsed.filter((value): value is string => typeof value === "string");
      }
    } catch {
      // Not our multi-selection payload; fall back to the single-id format.
    }
  }

  const single = dataTransfer.getData("application/x-bowerbird-item-id");
  return single ? [single] : [];
}

/**
 * Where inside the dragged element the pointer is and how big that element is,
 * in physical pixels. The native drag image is drawn at that size and offset so
 * the ghost lines up with what the user grabbed.
 */
function dragGeometry(e: DragEvent): Pick<DragRequest, "grabX" | "grabY" | "width" | "height"> {
  const target = e.target instanceof Element ? e.target : null;
  const source = target?.closest('[draggable="true"]') ?? target;
  const rect = source?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return { grabX: 0, grabY: 0, width: 0, height: 0 };
  }

  // CSS pixels would be half the size of the ghost on a 200% display.
  const ratio = window.devicePixelRatio || 1;
  return {
    grabX: Math.round((e.clientX - rect.left) * ratio),
    grabY: Math.round((e.clientY - rect.top) * ratio),
    width: Math.round(rect.width * ratio),
    height: Math.round(rect.height * ratio),
  };
}

function handleDragStart(e: DragEvent): void {
  // Another handler already cancelled this gesture (long-press hijack).
  if (e.defaultPrevented) return;

  const itemIds = readDraggedItemIds(e.dataTransfer);
  if (itemIds.length === 0) return;

  e.preventDefault();
  const geometry = dragGeometry(e);
  traceDrag(
    "drag-out-native",
    `items=${itemIds.length} ids=[${itemIds.join(", ")}] image=${geometry.width}x${geometry.height} grab=${geometry.grabX},${geometry.grabY}`
  );

  // The native drag re-enters the window as an external file drag, so the app
  // has to be told this drag is ours until the call returns, i.e. until the drop.
  setInternalDragActive(true);

  // The call returns when the OLE drag loop ends, so it is never awaited here;
  // the Go side traces the resulting drop effect.
  void StartDragItems({ ids: itemIds, ...geometry })
    .catch((err: unknown) => traceDrag("drag-out-error", `items=${itemIds.length} ${String(err)}`))
    .finally(() => setInternalDragActive(false));
}

/** Routes webview drags through the native OLE drag source. Idempotent. */
export function installNativeDragOut(): void {
  if (installed) return;
  installed = true;

  if (!isWindows()) return; // macOS: webview drag session + pasteboard hook; Linux: unsupported

  document.addEventListener("dragstart", handleDragStart);
  traceDrag("drag-out-installed", "platform=windows mechanism=ole-cf-hdrop");
}
