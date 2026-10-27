/**
 * Drag-and-drop payload helpers for the sidebar.
 *
 * The app moves items around by putting item ids on the DataTransfer; the same
 * parsing was duplicated in every drop handler.
 */

const MULTI_IDS_MIME = "application/x-bowerbird-item-ids";
const SINGLE_ID_MIME = "application/x-bowerbird-item-id";

/** Reads the dragged item ids (multi-selection first, then single). */
export function readDraggedItemIds(dataTransfer: DataTransfer): string[] {
  const multi = dataTransfer.getData(MULTI_IDS_MIME);
  if (multi) {
    try {
      const parsed = JSON.parse(multi);
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === "string");
      }
    } catch {
      /* malformed payload: fall through to the single-id variant */
    }
  }
  const single = dataTransfer.getData(SINGLE_ID_MIME);
  return single ? [single] : [];
}
