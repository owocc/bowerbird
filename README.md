# Bowerbird — Local Asset & Design Library Manager

Bowerbird is a cross-platform desktop digital asset manager built with **Wails v3 (Go)** and **React 19 + TypeScript + Tailwind CSS v4**. Every imported asset is stored in an isolated content-addressed directory (`items/<SHA-256>/`) indexed by SQLite and backed by per-item `metadata.json` manifests.

---

## Core Features

1. **Content-Addressed Deduplication & Isolated Storage**
   - SHA-256 content hashing ensures zero duplicate imports.
   - Dual-storage model: fast relational queries via `index.db` (SQLite) + portable per-item `metadata.json` and `thumbnail.jpg`.
2. **Automatic Color Palette & Extended Metadata Extraction**
   - On import (and automatically in the background for existing libraries), Bowerbird extracts the **dominant color**, a **6-color perceptual palette**, color model, alpha channel presence, aspect ratio, orientation (`landscape` / `portrait` / `square`), resolution (megapixels), and JPEG EXIF camera/capture metadata.
3. **Pluggable File Preview Architecture (`PreviewPluginRegistry`)**
   - Built-in preview plugins for **Images** (with damped trackpad pinch-to-zoom, 2-finger pan, and >125% minimap) and **Video** (multi-engine HLS/MPEG-TS/DASH/Native player), plus **System Icon Fallback**.
   - Built-in core plugins (`builtin.image` and `builtin.video`) are always enabled and cannot be disabled; all installed plugins can be inspected in the Settings panel (`800×650` sidebar layout).
   - Supports both inline workspace preview (`Double-click`) and full-window QuickLook (`Space`).
4. **Multi-Dimensional Filtering Bar**
   - Unified dropdown filters for **File Type**, **Color Swatches** (perceptual ΔE matching against preset and library palette colors), **Tags**, **Virtual Folders**, and **Orientation**.
5. **Precision Trackpad & Canvas Ergonomics**
   - Two-finger trackpad pinch-to-zoom directly resizes the main justified gallery layout.
   - Full-canvas rubber-band marquee selection works across any whitespace (padding, row gaps, trailing space) with automatic edge scrolling.
   - Selection order is preserved as a strict FIFO queue; multi-selection preview stacks the **last 6 selected items** in exact selection order.
   - Streamlined right inspector using collapsible **Accordion** sections and borderless adaptive previews.

---

## Project Structure

```text
├── main.go                           # Wails v3 application entry & native OS file drop routing
├── core/                             # Go backend package
│   ├── models.go                     # Domain models (Item, ImageMeta, Folder, Tag, LibraryInfo)
│   ├── library.go                    # SQLite indexing, import pipeline, folder/tag/trash CRUD
│   ├── color_extractor.go            # Perceptual color palette quantizer & EXIF/image metadata parser
│   ├── asset_server.go               # Local HTTP streaming server for originals, thumbnails & system icons
│   ├── service.go                    # Wails RPC service bindings
│   └── drag_*.go                     # Platform-specific native OS drag-out & debug tracing
└── frontend/                         # React 19 + Vite + Tailwind v4 frontend
    └── src/
        ├── plugins/preview/          # Pluggable file preview system
        │   ├── types.ts              # PreviewPlugin, PreviewViewportProps, PreviewInspectorProps
        │   ├── registry.ts           # PreviewPluginRegistry singleton & plugin resolution
        │   └── builtin/              # Built-in plugins (image, video, fallback)
        ├── components/
        │   ├── LibraryWorkspace.tsx  # Main 3-column resizable workspace
        │   ├── FilterBar.tsx         # Multi-dimensional filter dropdowns (Type, Color, Tag, Folder, Orientation)
        │   ├── JustifiedGallery.tsx  # Pixel-perfect justified layout & full-canvas marquee selection
        │   ├── ItemDetailPanel.tsx   # Borderless adaptive preview, color swatches & Accordion metadata
        │   ├── MultiItemInspector.tsx# Last-6 FIFO stacked preview & batch organization
        │   ├── UnifiedPreviewModal.tsx # Plugin-driven inline & full-window preview host
        │   └── ui/accordion.tsx      # Collapsible inspector accordion primitive
        ├── hooks/
        │   ├── useTrackpadZoom.ts    # Trackpad pinch-to-zoom hook for the main gallery
        │   ├── useFileDrop.ts        # Drag-and-drop import state & progress events
        │   └── useHistoryNavigation.ts # Router-backed Back/Forward navigation
        └── lib/
            └── workspace-search.ts   # URL search schema for navigation & filter state
```

---

## Preview Plugin Architecture

All file previews—both in the main/fullscreen modal (`UnifiedPreviewModal`) and the right inspector (`ItemDetailPanel`)—are resolved through `previewRegistry` (`frontend/src/plugins/preview/registry.ts`).

### Built-in Plugins

| Plugin ID | Priority | Status | Handled Formats | Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| `builtin.image` | `100` | Built-in (Always Enabled) | `png, jpg, jpeg, webp, gif, bmp, svg, ico, tiff, tif, avif` | Damped trackpad zoom (`25%`–`800%`), 2-finger pan when zoomed in, interactive MiniMap (`>125%`), borderless inspector preview |
| `builtin.video` | `90` | Built-in (Always Enabled) | `mp4, mov, qt, webm, mkv, avi, m4v, flv, f4v, ts, mts, m2ts, m3u8, m3u, mpd, ogv, ogm, 3gp, 3g2, wmv, asf, mpg, mpeg, m2v, vob, rmvb, rm` | Multi-engine player (**hls.js** + **mpegts.js** + **dash.js** + HTML5 Native), standalone shadcn UI bottom control bar (`0.25x`–`8x` speed menu, hover volume slider, ±5s seek, loop, fullscreen), cover/first-frame color palette extraction, and cover-only inspector preview |
| `builtin.fallback` | `0` | Internal Fallback | `*` (catch-all fallback) | Native OS file icon rendering via `/asset/icon/<ext>` |
### Registering a Custom Preview Plugin

```tsx
import { previewRegistry } from "@/plugins/preview/registry";

previewRegistry.register({
  id: "custom.model3d",
  name: "3D Model Viewer",
  priority: 95,
  extensions: ["glb", "gltf", "obj"],
  supportsZoom: false,
  Viewport: ({ item }) => <My3DCanvas src={item.originalUrl} />,
  InspectorPreview: ({ item, onOpenPreview }) => (
    <div onDoubleClick={onOpenPreview}>3D Preview: {item.filename}</div>
  ),
});
```

---

## Native Drag & Drop Out of the Window

Dragging an asset to another application is platform-specific because an HTML5 drag from the webview only publishes text formats (`text/plain`, `text/uri-list`):

- **Windows** (`core/drag_windows.go`): `frontend/src/lib/drag-out.ts` cancels the webview drag and calls `Service.StartDragItems` with the dragged item IDs. The Go side builds a shell data object (`SHCreateDataObject` → `CF_HDROP`) and runs `DoDragDrop` with `DROPEFFECT_COPY`.
- **macOS** (`core/drag_darwin.go`): The webview drag session is preserved and its pasteboard is rewritten into `public.file-url` / `NSFilenamesPboardType`.
- **In-App Drop Visuals**: Both the sidebar and main workspace use a non-intrusive `10%` opacity mask with a dashed border (`bg-foreground/10 border-dashed`) without obscuring folder names or shifting layout.

### Drag & Drop Tracing

Every step of the drag-and-drop pipeline is logged to `drag-debug.log` in the user data directory (`%APPDATA%\bowerbird\drag-debug.log` on Windows, `~/Library/Application Support/bowerbird/drag-debug.log` on macOS). Set `BOWERBIRD_USER_DATA_DIR` to override the directory during tests.

---

## Data & Storage Architecture Specification

Bowerbird enforces a strict physical separation between **User Libraries** and **Application State Data**:

```text
┌────────────────────────────────────────────────────────┐
│ 1. User Asset Library (Portable Container Package)     │
│    e.g. ~/Pictures/Designs.library/                    │
│    ├── items/<hash>/original.<ext>                     │
│    ├── items/<hash>/thumbnail.jpg                      │
│    ├── items/<hash>/metadata.json                      │
│    └── index.db (SQLite relational cache)              │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ 2. Application User Data Directory (<UserDataDir>)     │
│    macOS:   ~/Library/Application Support/bowerbird/   │
│    Windows: %APPDATA%\bowerbird\                       │
│    Linux:   ~/.config/bowerbird/                       │
│    ├── user_data.json      # Global UI settings        │
│    ├── app.log             # Diagnostics runtime logs  │
│    ├── drag-debug.log      # Drag & Drop trace logs    │
│    └── plugins/            # Installed remote plugins  │
│        ├── installed.json  # Installed plugin registry │
│        └── <plugin-id>/    # Extracted plugin bundle   │
│            ├── manifest.json                           │
│            └── index.js                                │
└────────────────────────────────────────────────────────┘
```

### Plugin Ecosystem & Distribution Specification

1. **Source Isolation**:
   - Source code for official plugins resides in `plugins/<plugin-id>/` (`src/index.tsx`, `manifest.json`, `package.json`).
   - Built assets are strictly output to `dist/plugins/` (git-ignored). Committing pre-built JavaScript into `plugins/` is forbidden.
2. **Dual-Channel Distribution Repository**:
   - Distribution metadata is published to the dedicated repository (`owocc/bowerbird-plugins`).
   - **`main` Branch**: Contains compact index metadata (`index.min.json`, `registry.json`, `repo/<id>/manifest.json`, `repo/<id>/index.js`).
   - **GitHub Releases**: Contains pre-packaged release zip bundles (`<plugin-id>-v<version>.zip`).
3. **Marketplace & Edge Resolution**:
   - The plugin store (`apps/marketplace/`) reads metadata from `PLUGIN_REPO_INDEX_URL`.
   - Release downloads directly route to `PLUGIN_RELEASE_BASE_URL` without intermediate proxying.
4. **Desktop Store Address (build-time injection)**:
   - The desktop app hardcodes no store or distribution host: `PLUGIN_STORE_URL` is
     its single store address, linking the store front end, the plugin API and the
     plugin files together. It is injected at build time by the platform Taskfiles
     (`-X bowerbird/core.storeURL`, see `core/store.go`), including the Docker
     cross-compile and server images.
   - Everything the app needs is derived from that origin: the *Visit Marketplace*
     link, `{store}/api/plugins/<id>/download` (archive fallback) and
     `{store}/api/plugins/<id>/<file>` (asset fallback). The store resolves the
     distribution repository server-side via `PLUGIN_REPO_INDEX_URL` /
     `PLUGIN_RELEASE_BASE_URL`.
   - Export it before building (`PLUGIN_STORE_URL=https://… wails3 task
     windows:package ARCH=amd64`), or set the `PLUGIN_STORE_URL` repository variable
     for the release workflow.
   - The variable wins over the injected value at runtime, so `wails3 dev` can
     target a local store without rebuilding. A build with no store injected reports
     `ERR_STORE_NOT_CONFIGURED` instead of opening a placeholder host, and skips
     store fallbacks when installing plugins.
5. **In-App Data Management**:
   - The Settings panel includes a dedicated **Data & Storage** section with one-click shortcuts to reveal the **Plugins Directory** and **Application Data Directory** in the native OS file manager (Finder / Explorer).

---

## Development & Verification

```bash
# Run Go backend unit & integration tests
go test ./...

# Typecheck & build frontend bundle
cd frontend && npm run build

# Run in Wails3 development mode
wails3 dev
```

### Workspace Package Resolution

`@bowerbird/plugin-sdk` and `@workspace/ui` are consumed straight from TypeScript
sources — `@bowerbird/plugin-sdk` publishes `dist/` output that only
`pnpm --filter @bowerbird/plugin-sdk build` produces, and only npm publishing needs.

- **Type checking** — map the package in the consumer's `tsconfig.json` `paths`
  (substitutions resolve relative to `baseUrl`):
  `"@bowerbird/plugin-sdk": ["../packages/plugin-sdk/src/index.ts"]`.
- **Vite** — set `resolve.tsconfigPaths: true` so dev resolution matches `tsc`
  (`frontend/vite.config.ts`); production builds inline the sources either way.

Without the Vite option, dev fails with
`Failed to resolve import "@bowerbird/plugin-sdk" from ... Does the file exist?`.
