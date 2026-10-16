/**
 * Usage history tracker for items dragged out of the library.
 *
 * Persisted per-library in localStorage, ordered most-recently-dragged first.
 * Automatically listens for outbound drags (when an internal drag finishes
 * without landing on an in-app drop target) and records the dragged item IDs.
 */

export interface DragHistoryEntry {
  itemId: string;
  usedAt: number;
}

const STORAGE_PREFIX = "bowerbird-drag-history:";
const MAX_HISTORY_ENTRIES = 500;
const CHANGE_EVENT = "bowerbird:drag-history-changed";

let activeLibraryId = "";
let pendingDragItemIds: string[] = [];
let droppedInApp = false;
let listenerInstalled = false;

function storageKey(libraryId: string): string {
  return `${STORAGE_PREFIX}${libraryId || "default"}`;
}

export function setActiveHistoryLibraryId(libraryId: string): void {
  activeLibraryId = libraryId;
}

export function getDragHistory(libraryId = activeLibraryId): DragHistoryEntry[] {
  if (typeof localStorage === "undefined" || !libraryId) return [];
  try {
    const raw = localStorage.getItem(storageKey(libraryId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is DragHistoryEntry =>
        Boolean(
          entry &&
            typeof entry === "object" &&
            typeof (entry as DragHistoryEntry).itemId === "string" &&
            typeof (entry as DragHistoryEntry).usedAt === "number"
        )
    );
  } catch {
    return [];
  }
}

export function recordDraggedItems(
  itemIds: string[],
  libraryId = activeLibraryId
): DragHistoryEntry[] {
  const uniqueIds = Array.from(
    new Set(itemIds.map((id) => id.trim()).filter(Boolean))
  );
  if (uniqueIds.length === 0 || !libraryId) {
    return getDragHistory(libraryId);
  }

  const now = Date.now();
  const existing = getDragHistory(libraryId);
  const incomingSet = new Set(uniqueIds);
  const newEntries: DragHistoryEntry[] = uniqueIds.map((id, idx) => ({
    itemId: id,
    usedAt: now - idx,
  }));
  const remaining = existing.filter((entry) => !incomingSet.has(entry.itemId));
  const next = [...newEntries, ...remaining].slice(0, MAX_HISTORY_ENTRIES);

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(storageKey(libraryId), JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(CHANGE_EVENT, { detail: { libraryId, entries: next } })
    );
  }
  return next;
}

export function clearDragHistory(libraryId = activeLibraryId): void {
  if (!libraryId) return;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(storageKey(libraryId));
    } catch {
      // ignore
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(CHANGE_EVENT, { detail: { libraryId, entries: [] } })
    );
  }
}

export function subscribeDragHistory(
  callback: (entries: DragHistoryEntry[]) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => {
    callback(getDragHistory(activeLibraryId));
  };
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

function readDraggedIdsFromDataTransfer(dt: DataTransfer | null): string[] {
  if (!dt) return [];
  const multi = dt.getData("application/x-bowerbird-item-ids");
  if (multi) {
    try {
      const parsed: unknown = JSON.parse(multi);
      if (Array.isArray(parsed)) {
        const ids = parsed.filter(
          (val): val is string => typeof val === "string" && val.length > 0
        );
        if (ids.length > 0) return ids;
      }
    } catch {
      // fallback
    }
  }
  const single = dt.getData("application/x-bowerbird-item-id");
  return single ? [single] : [];
}

/**
 * Installs document-level drag listeners to automatically record items dragged
 * out of the application (excluding internal folder/trash reorganization drops).
 */
export function installDragHistoryTracker(): void {
  if (listenerInstalled || typeof document === "undefined") return;
  listenerInstalled = true;

  document.addEventListener("dragstart", (e: DragEvent) => {
    const ids = readDraggedIdsFromDataTransfer(e.dataTransfer);
    pendingDragItemIds = ids;
    droppedInApp = false;
  });

  document.addEventListener(
    "drop",
    () => {
      droppedInApp = true;
    },
    true
  );

  document.addEventListener("dragend", () => {
    if (pendingDragItemIds.length > 0 && !droppedInApp) {
      recordDraggedItems(pendingDragItemIds);
    }
    pendingDragItemIds = [];
    droppedInApp = false;
  });
}
