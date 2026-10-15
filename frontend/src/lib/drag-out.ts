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
import { traceDrag } from "./drag-trace";
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

function handleDragStart(e: DragEvent): void {
  // Another handler already cancelled this gesture (long-press hijack).
  if (e.defaultPrevented) return;

  const itemIds = readDraggedItemIds(e.dataTransfer);
  if (itemIds.length === 0) return;

  e.preventDefault();
  traceDrag("drag-out-native", `items=${itemIds.length} ids=[${itemIds.join(", ")}]`);

  // The call returns when the OLE drag loop ends, i.e. after the user drops, so
  // it is never awaited here - the Go side traces the resulting drop effect.
  void StartDragItems(itemIds).catch((err: unknown) => {
    traceDrag("drag-out-error", `items=${itemIds.length} ${String(err)}`);
  });
}

/** Routes webview drags through the native OLE drag source. Idempotent. */
export function installNativeDragOut(): void {
  if (installed) return;
  installed = true;

  if (!isWindows()) return; // macOS: webview drag session + pasteboard hook; Linux: unsupported

  document.addEventListener("dragstart", handleDragStart);
  traceDrag("drag-out-installed", "platform=windows mechanism=ole-cf-hdrop");
}
