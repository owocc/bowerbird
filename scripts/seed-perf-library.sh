#!/usr/bin/env bash
# Creates a deterministic Bowerbird library for desktop performance checks.
# Usage: scripts/seed-perf-library.sh [output-dir] [count] [thumbnail.jpg]
# The generated library has no real originals; thumbnails are hard-linked from
# the supplied image so the gallery renders the same code path as a real library.
set -euo pipefail

OUT="${1:-/tmp/bowerbird-perf-5000.library}"
COUNT="${2:-5000}"
THUMB_SRC="${3:-}"

rm -rf "$OUT"
mkdir -p "$OUT/items"
NOW="$(date +%s)"

cat > "$OUT/library.json" <<JSON
{
  "id": "${NOW}_perfseed",
  "name": "$(basename "$OUT" .library)",
  "version": "1.0.0",
  "createdAt": ${NOW}
}
JSON

if [[ -z "$THUMB_SRC" ]]; then
  THUMB_SRC="$(find "$HOME/Library" /Volumes/Data/Library -path '*/items/*/thumbnail.jpg' -size -20k 2>/dev/null | head -1 || true)"
fi
if [[ -z "$THUMB_SRC" && -f assets/branding/app-icon.png ]] && command -v sips >/dev/null 2>&1; then
  THUMB_SRC="$OUT/.seed-thumb.jpg"
  sips -s format jpeg -Z 320 assets/branding/app-icon.png --out "$THUMB_SRC" >/dev/null
fi

# Schema mirrors core.initSchema plus the migrations applied by openLibraryDB.
sqlite3 "$OUT/index.db" <<'SQL'
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  hex TEXT DEFAULT '',
  name TEXT NOT NULL,
  extension TEXT NOT NULL,
  filename TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER DEFAULT 0,
  height INTEGER DEFAULT 0,
  has_thumbnail INTEGER DEFAULT 0,
  tags TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  imported_at INTEGER NOT NULL,
  in_trash INTEGER DEFAULT 0,
  trashed_at INTEGER DEFAULT 0,
  trashed_folders TEXT DEFAULT '',
  dominant_color TEXT DEFAULT '',
  palette TEXT DEFAULT '',
  meta_json TEXT DEFAULT '',
  note TEXT DEFAULT '',
  url TEXT DEFAULT '',
  rating INTEGER DEFAULT 0,
  prompt TEXT DEFAULT '',
  updated_at INTEGER DEFAULT 0
);
CREATE INDEX idx_items_imported_at ON items(imported_at DESC);
CREATE INDEX idx_items_extension ON items(extension);
CREATE INDEX idx_items_name ON items(name);
CREATE INDEX idx_items_hex ON items(hex);
CREATE INDEX idx_items_in_trash ON items(in_trash);
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  sort_order INTEGER DEFAULT 0
);
CREATE INDEX idx_folders_parent ON folders(parent_id);
CREATE TABLE item_folders (
  item_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, folder_id)
);
CREATE INDEX idx_item_folders_folder ON item_folders(folder_id);
CREATE INDEX idx_item_folders_item ON item_folders(item_id);
SQL

sqlite3 "$OUT/index.db" <<SQL
WITH RECURSIVE seq(i) AS (
  SELECT 0 UNION ALL SELECT i + 1 FROM seq WHERE i + 1 < ${COUNT}
)
INSERT INTO items (
  id, hex, name, extension, filename, size, mime_type, width, height,
  has_thumbnail, tags, created_at, imported_at, dominant_color, palette,
  note, url, rating, prompt, updated_at
)
SELECT
  printf('SEED%060d', i),
  printf('SEEDHEX%056d', i),
  printf('perf asset %05d', i),
  CASE i % 10 WHEN 0 THEN 'mp4' WHEN 1 THEN 'pdf' WHEN 2 THEN 'mp3' ELSE 'jpg' END,
  printf('perf-%05d.jpg', i),
  CASE
    WHEN i % 10 = 0 THEN 20 * 1024 * 1024 + i
    WHEN i % 4 = 0 THEN 2 * 1024 * 1024 + i
    ELSE 256 * 1024 + i
  END,
  CASE i % 10 WHEN 0 THEN 'video/mp4' WHEN 1 THEN 'application/pdf' WHEN 2 THEN 'audio/mpeg' ELSE 'image/jpeg' END,
  600 + (i * 37) % 3000,
  400 + (i * 53) % 2000,
  1,
  CASE i % 4
    WHEN 0 THEN 'even,tag-' || (i % 20) || ',color-red'
    WHEN 1 THEN 'odd,tag-' || (i % 20) || ',color-blue'
    WHEN 2 THEN 'even,tag-' || (i % 20) || ',color-green'
    ELSE 'odd,tag-' || (i % 20) || ',color-gray'
  END,
  ${NOW}000 + i,
  ${NOW}000 + i,
  CASE i % 4 WHEN 0 THEN '#EF4444' WHEN 1 THEN '#3B82F6' WHEN 2 THEN '#22C55E' ELSE '#9CA3AF' END,
  CASE i % 4 WHEN 0 THEN '#EF4444,#FCA5A5' WHEN 1 THEN '#3B82F6,#93C5FD' WHEN 2 THEN '#22C55E,#86EFAC' ELSE '#9CA3AF,#D1D5DB' END,
  CASE WHEN i % 5 = 0 THEN 'seed note ' || i ELSE '' END,
  CASE WHEN i % 7 = 0 THEN 'https://example.com/' || i ELSE '' END,
  CASE i % 6 WHEN 0 THEN 5 WHEN 1 THEN 4 WHEN 2 THEN 3 ELSE i % 3 END,
  CASE WHEN i % 11 = 0 THEN 'prompt ' || i ELSE '' END,
  ${NOW}000 + i
FROM seq;

INSERT INTO folders (id, name, parent_id, created_at, sort_order)
SELECT 'f-' || printf('%03d', i), 'Folder ' || printf('%03d', i), '', ${NOW}, i
FROM (WITH RECURSIVE s(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM s WHERE i+1 < 20) SELECT i FROM s);

WITH RECURSIVE s(i) AS (
  SELECT 0 UNION ALL SELECT i + 1 FROM s WHERE i + 1 < ${COUNT}
)
INSERT INTO item_folders (item_id, folder_id, added_at)
SELECT printf('SEED%060d', i), 'f-' || printf('%03d', i % 20), ${NOW} FROM s;
SQL

if [[ -n "$THUMB_SRC" && -f "$THUMB_SRC" ]]; then
  for ((i = 0; i < COUNT; i++)); do
    id="$(printf 'SEED%060d' "$i")"
    mkdir -p "$OUT/items/$id"
    ln "$THUMB_SRC" "$OUT/items/$id/thumbnail.jpg" 2>/dev/null || cp "$THUMB_SRC" "$OUT/items/$id/thumbnail.jpg"
  done
else
  sqlite3 "$OUT/index.db" "UPDATE items SET has_thumbnail = 0"
fi
if [[ -f "$OUT/.seed-thumb.jpg" ]]; then
  rm -f "$OUT/.seed-thumb.jpg"
fi

echo "seeded $COUNT items -> $OUT"
