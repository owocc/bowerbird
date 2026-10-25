/**
 * localStorage keys for the appearance preferences.
 *
 * Kept in their own module so the small preference helpers (lib/backdrop.ts) and
 * the hook that owns them (lib/appearance.ts) can all import the names without
 * importing each other.
 */

/** Mirrors the persisted window-vibrancy flag. */
export const VIBRANCY_STORAGE_KEY = "bowerbird-ui-vibrancy";

/** Mirrors the persisted background layer preference. */
export const BACKDROP_STORAGE_KEY = "bowerbird-ui-backdrop";
