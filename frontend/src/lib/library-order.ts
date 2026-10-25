/**
 * Remembers the order the user arranged their libraries in.
 *
 * Ordering is *app data*, never library data: it is a list of IDs (each one
 * read from that library's own `library.json`) kept in localStorage. Using the
 * ID rather than the path means moving or renaming a library folder cannot make
 * an entry point at a different library — which is what previously let the
 * ordering (and therefore the visible list) refer to the wrong library.
 *
 * Paths are only ever used to *open* a library, never to identify it.
 */
const STORAGE_KEY = "bowerbird.sidebar.libraryOrder.v2";
/** Pre-v2 key that stored paths; read once to migrate. */
const LEGACY_STORAGE_KEY = "bowerbird.sidebar.libraryOrder";

export interface LibraryRefLike {
  id: string;
  path: string;
}

function readStringArray(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((p): p is string => typeof p === "string")
      : [];
  } catch {
    return [];
  }
}

function writeStringArray(key: string, value: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

/** Reads the persisted ID order, migrating a legacy path order if needed. */
export function readLibraryOrder(refs: LibraryRefLike[]): string[] {
  const ids = readStringArray(STORAGE_KEY);
  if (ids.length > 0) return ids;

  const legacyPaths = readStringArray(LEGACY_STORAGE_KEY);
  if (legacyPaths.length === 0) return [];

  // Map the old path order onto IDs once, then drop the legacy key so a moved
  // folder can never resurrect a stale entry.
  const pathToId = new Map(refs.map((ref) => [ref.path, ref.id]));
  const migrated = legacyPaths
    .map((path) => pathToId.get(path))
    .filter((id): id is string => Boolean(id));

  if (migrated.length > 0) {
    writeStringArray(STORAGE_KEY, migrated);
  }
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return migrated;
}

export function writeLibraryOrder(order: string[]): void {
  writeStringArray(STORAGE_KEY, order);
}

/**
 * Guarantees an explicit order exists for the current set of libraries.
 *
 * The backend's recency list moves the active library to the front every time
 * the user switches, so it is not a stable ordering to render. On first run (or
 * when new libraries appear) we snapshot the incoming order once and persist it;
 * from then on the stored order is the single source of truth and switching the
 * active library never reshuffles the list.
 */
export function ensureLibraryOrder<T extends LibraryRefLike>(refs: T[]): string[] {
  const stored = readStringArray(STORAGE_KEY);
  const known = new Set(refs.map((ref) => ref.id));

  // Keep the remembered tail order, then append anything new in arrival order.
  const kept = stored.filter((id) => known.has(id));
  const keptSet = new Set(kept);
  const next = [...kept, ...refs.map((ref) => ref.id).filter((id) => !keptSet.has(id))];

  const changed =
    next.length !== stored.length || next.some((id, i) => id !== stored[i]);
  if (changed) writeStringArray(STORAGE_KEY, next);

  return next;
}

/**
 * Applies a remembered ID order to `refs`: remembered entries keep their
 * relative position, unknown entries (e.g. a newly added library) are appended
 * in the order they arrived.
 */
export function applyLibraryOrder<T extends LibraryRefLike>(
  refs: T[],
  order: string[]
): T[] {
  if (order.length === 0) return refs;
  const byId = new Map(refs.map((ref) => [ref.id, ref]));
  const ordered: T[] = [];
  const seen = new Set<string>();

  for (const id of order) {
    const ref = byId.get(id);
    if (!ref || seen.has(id)) continue;
    ordered.push(ref);
    seen.add(id);
  }
  for (const ref of refs) {
    if (!seen.has(ref.id)) ordered.push(ref);
  }
  return ordered;
}
