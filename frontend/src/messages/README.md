# Messages

One JSON file per language: `<code>.json` (currently only `en.json`).
`src/i18n.ts` auto-loads every file in this directory, so registering a new
language is just adding a file here.

## Rules

- **English only, one language per string.** Never write bilingual strings such
  as `适应窗口 (Fit)` or `Fit (适应窗口)`. A parenthetical is acceptable only when
  it is not a language: counts (`Delete permanently ({{count}})`) or keyboard
  hints (`Back (Esc / Double-click)`).
- Keys are dotted and live in the single `translation` namespace:
  `t("sidebar.searchPlaceholder")`.
- Group keys by the area that owns them: `common`, `app`, `setup`, `workspace`,
  `sidebar`, `tags`, `inspector`, `multiInspector`, `contextMenu`, `preview`,
  `zoom`, `dropzone`, `importing`.
- Reuse `common.*` for generic words (`close`, `cancel`, `save`, `delete`, …)
  instead of duplicating them per area.
- Plurals use i18next suffixes `<key>_one` / `<key>_other` together with
  `{{count}}`.
- Interpolation uses `{{name}}`; never assemble a sentence by concatenating
  translated fragments.
- Module-level constants store i18n keys, not `t()` calls, so nothing is
  translated before i18next is ready.

## Not translated

Code identifiers, CSS classes, `data-*`, event names, storage keys, keyboard
chords (`Esc`, `⌘B`), and the built-in Favorites tag sentinel `收藏` — the last
one is *data* kept for backward compatibility with existing libraries, see
`src/lib/favoriteTag.ts` and `core.FavoriteTagName`. Always render
`t("common.favorites")` instead.

## Adding a language

Drop `<code>.json` here with the same key structure. `frontend/src/i18n.ts`
picks it up automatically and exposes it through the `bowerbird-language`
localStorage key.
