# Bowerbird — Local Asset & Design Library Manager

Bowerbird is a cross-platform desktop digital asset manager built with **mygo (Go)** in webview mode and **React 19 + TypeScript + Tailwind CSS v4**. The desktop shell migrated from Wails v3 to [mygo](https://github.com/egoist/mygo) in `v1.0.0-alpha-4` (see `reports/mygo迁移实施报告.md`); an experimental native-rendering build lives in `cmd/bowerbird-native/`. Every imported asset is stored in an isolated content-addressed directory (`items/<SHA-256>/`) indexed by SQLite and backed by per-item `metadata.json` manifests.

---

## Core Features

1. **Content-Addressed Deduplication & Isolated Storage**
   - SHA-256 content hashing ensures zero duplicate imports.
   - Dual-storage model: fast relational queries via `index.db` (SQLite) + portable per-item `metadata.json` and `thumbnail.jpg`.
2. **Automatic Color Palette & Extended Metadata Extraction**
   - On import (and automatically in the background for existing libraries), Bowerbird extracts the **dominant color**, a **6-color perceptual palette**, color model, alpha channel presence, aspect ratio, orientation (`landscape` / `portrait` / `square`), resolution (megapixels), and JPEG EXIF camera/capture metadata.
3. **Pluggable File Preview Architecture (`PreviewPluginRegistry`)**
   - Built-in preview plugins for **Images** (with damped trackpad pinch-to-zoom, 2-finger pan, and >125% minimap) and **Video** (multi-engine HLS/MPEG-TS/DASH/Native player), plus **System Icon Fallback**.
   - Built-in core plugins (`builtin.image` and `builtin.video`) are listed in the plugin store with a built-in marker and can be disabled from Settings (`800×650` sidebar layout). The internal fallback plugin remains always on.
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
├── main_mygo.go                      # mygo application entry (windows, menus, tray, native OS file drop routing)
├── mygo.json                         # mygo build configuration (app name, bundle id, version, dev/build commands)
├── core/                             # Go backend package
│   ├── models.go                     # Domain models (Item, ImageMeta, Folder, Tag, LibraryInfo)
│   ├── library.go                    # SQLite indexing, import pipeline, folder/tag/trash CRUD
│   ├── color_extractor.go            # Perceptual color palette quantizer & EXIF/image metadata parser
│   ├── asset_server.go               # Local HTTP streaming server for originals, thumbnails & system icons
│   ├── service.go                    # Application service exposed to the frontend via mygo.Bind
│   ├── host.go                       # Host abstraction over the desktop runtime (events, dialogs, drag, main thread)
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
            ├── host-runtime.ts       # Desktop runtime adapter (typed events delivered with a {data} envelope)
            ├── workspace-search.ts   # URL search schema for navigation & filter state
```

---

## Preview Plugin Architecture

All file previews—both in the main/fullscreen modal (`UnifiedPreviewModal`) and the right inspector (`ItemDetailPanel`)—are resolved through `previewRegistry` (`frontend/src/plugins/preview/registry.ts`).

### Built-in Plugins

| Plugin ID | Priority | Status | Handled Formats | Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| `builtin.image` | `100` | Built-in (disableable) | `png, jpg, jpeg, webp, gif, bmp, svg, ico, tiff, tif, avif` | Damped trackpad zoom (`25%`–`800%`), 2-finger pan when zoomed in, interactive MiniMap (`>125%`), borderless inspector preview |
| `builtin.video` | `90` | Built-in (disableable) | `mp4, mov, qt, webm, mkv, avi, m4v, flv, f4v, ts, mts, m2ts, m3u8, m3u, mpd, ogv, ogm, 3gp, 3g2, wmv, asf, mpg, mpeg, m2v, vob, rmvb, rm` | Multi-engine player (**hls.js** + **mpegts.js** + **dash.js** + HTML5 Native), standalone shadcn UI bottom control bar (`0.25x`–`8x` speed menu, hover volume slider, ±5s seek, loop, fullscreen), cover/first-frame color palette extraction, and cover-only inspector preview |
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
4. **In-App Data Management**:
   - The Settings panel includes a dedicated **Data & Storage** section with one-click shortcuts to reveal the **Plugins Directory** and **Application Data Directory** in the native OS file manager (Finder / Explorer).

---

## Development & Verification

All dev/build commands live in the root `package.json` `scripts` block — run them with `pnpm run <script>`.

### Development

> **cgo is required.** The native macOS implementations in `core/`
> (`sysicon_darwin.go`, `videothumb_darwin.go`, `drag_darwin.go`) contain
> `import "C"`. With `CGO_ENABLED=0` Go silently drops them, and their
> `!darwin || ios` fallbacks are also excluded on darwin — so symbols like
> `StartDragItems` / `GetSystemFileIconPNG` vanish and the build fails with
> `undefined: ...` errors. The `pnpm dev` / `pnpm build:app*` scripts route
> through `scripts/mygo.mjs`, which forces `CGO_ENABLED=1` on every platform.

```bash
pnpm dev                 # mygo dev mode (Go backend + Vite HMR via mygo devCommand)
pnpm dev:frontend        # Vite dev server only (frontend)
pnpm dev:marketplace     # Marketplace (apps/marketplace) dev server
pnpm dev:docs            # Docs site (apps/docs) dev server
pnpm dev:extension       # Web extension dev (Chrome); :firefox variant available
```

### Build

```bash
pnpm build               # plugins + frontend bundle (what mygo build consumes)
pnpm build:release       # plugins + frontend + mygo build
pnpm build:app           # mygo build (current platform)
pnpm build:app:macos     # macOS universal (arm64 + amd64)
pnpm build:app:windows   # Windows amd64 (portable exe + NSIS installer)
pnpm build:app:linux     # Linux amd64

pnpm build:packages      # workspace packages (@bowerbird/plugin-sdk, @workspace/ui)
pnpm build:plugins       # scripts/build-plugins.mjs -> dist/plugins/*.zip + index.min.json
pnpm build:frontend      # typecheck + production frontend bundle
pnpm build:extension     # web extension (Chrome); :firefox / :edge / :safari variants
pnpm build:marketplace   # marketplace app
pnpm build:docs          # docs site
pnpm build:all           # every JS/TS workspace target
```

### Verify / Utility

```bash
pnpm test                # go test ./...
pnpm test:watch          # go test -count=1 -v ./...
pnpm typecheck           # tsc / astro check across every package that defines one
pnpm clean               # remove build outputs (frontend/dist, dist, build/mygo, ...)
```

Equivalent raw commands, for reference:

```bash
# Run Go backend unit & integration tests
go test ./...

# Typecheck & build frontend bundle
pnpm --filter bowerbird build

# Run in mygo development mode (Vite dev server + Go backend, hot reload)
CGO_ENABLED=1 go tool mygo dev

# Production build (per-platform app bundle / installer / disk image under build/mygo/)
CGO_ENABLED=1 go tool mygo build
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

### Windows Installer (NSIS)

On Windows, `go tool mygo build` (via `pnpm run build:app:windows`) produces both the portable executable and an NSIS installer under `build/mygo/windows-amd64/`.
The installer registers the app under *Apps & features*, installs the WebView2
runtime when it is missing, and asks the user whether to create shortcuts
(Start Menu on by default, Desktop optional) plus whether to launch the app.

The NSIS step runs as part of the mygo Windows packaging pipeline; GitHub's
`windows-latest` runners build it out of the box. For local Windows builds,
keep `makensis` available on `PATH`: install it with `scoop install nsis`
(shim lands on `PATH`), `choco install nsis` (append
`C:\Program Files (x86)\NSIS` to `PATH`), or `winget install NSIS.NSIS`
(manual `PATH` entry required).

```bash
go tool mygo build
# -> build/mygo/windows-amd64/   portable executable + NSIS installer
```

CI (`.github/workflows/release-app.yml`) publishes both as
`bowerbird-windows-x64-portable.exe` and `bowerbird-windows-x64-installer.exe`.
