/**
 * Built-in "Favorites" tag.
 *
 * The stored value is a historical sentinel shared with the Go backend
 * (`core.FavoriteTagName`). It is *data*, never UI copy, and is kept unchanged
 * for backward compatibility with existing libraries.
 *
 * Always render `t("common.favorites")` for display; only use this constant for
 * comparisons, filtering and tag mutations.
 */
export const FAVORITE_TAG = "收藏";
