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
   - Built-in preview plugins for **Images** (with damped trackpad pinch-to-zoom, 2-finger pan, and >125% minimap), **Video**, **Audio**, **Documents/Code** (PDF & syntax text preview), and **System Icon Fallback**.
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
        │   └── builtin/              # Built-in plugins (image, video, audio, document, fallback)
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

| Plugin ID | Priority | Handled Formats | Capabilities |
| :--- | :--- | :--- | :--- |
| `builtin.image` | `100` | `png, jpg, jpeg, webp, gif, bmp, svg, ico, tiff, avif` | Damped trackpad zoom (`25%`–`800%`), 2-finger pan when zoomed in, interactive MiniMap (`>125%`), borderless inspector preview |
| `builtin.video` | `90` | `mp4, mov, webm, mkv, avi, m4v` | Streaming HTML5 video player in modal & compact player in inspector |
| `builtin.audio` | `85` | `mp3, wav, flac, aac, ogg, m4a, opus` | Audio player with artwork/icon header and native playback controls |
| `builtin.document` | `70` | `pdf, txt, md, json, yaml, xml, csv, js, ts, go, py, rs, css, html, sql` | Embedded PDF viewer and live text/code preview |
| `builtin.fallback` | `0` | `*` (catch-all fallback) | Native OS file icon rendering via `/asset/icon/<ext>` |

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

## Development & Verification

```bash
# Run Go backend unit & integration tests
go test ./...

# Typecheck & build frontend bundle
cd frontend && npm run build

# Run in Wails3 development mode
wails3 dev
```
