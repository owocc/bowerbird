# Bowerbird Web Clipper (Browser Extension)

A multi-browser web clipping extension built with [WXT](https://wxt.dev/) (Manifest V3 & V2) and React 19 for the Bowerbird digital asset manager desktop application.

---

## Features

1. **Floating Media Drag-and-Drop Drop Zone**:
   - When dragging any image, link, SVG, video, or background image on a webpage, a floating drop zone slides in from the right edge.
   - **Direct Folder Listing**: Displays a "Quick Save" target (library root) plus direct drop slots for all virtual folders in the active library.
   - Dropping media directly onto a specific folder card imports it into that folder instantly.
   - **Running Detection**: If the desktop application is not running, the drop zone displays a warning ("⚠️ Bowerbird is not running") advising the user to launch the desktop app.

2. **Context Menu Quick Capture**:
   - Right-click any image on the web: **"Save Image to Bowerbird"** (downloads full-resolution asset with page source URL and Referer headers).
   - Right-click any hyperlink: **"Save Link to Bowerbird"** (saves page bookmark with card snapshot).
   - Right-click webpage background: **"Capture Visible Screen"** or **"Batch Save Page Images..."**.

3. **Interactive Area Selection Tool**:
   - Crosshair overlay allows dragging a rectangle across any webpage to capture and crop a precision region.
   - Automatically handles screen high-DPI scaling (`devicePixelRatio`) and sends cropped image directly to Bowerbird desktop library.

4. **Batch Page Image Collector**:
   - Eagle-style in-page gallery overlay.
   - Deep-scans page for `<img>` tags, `<picture>` responsive sources, CSS `background-image` elements, and video posters.
   - Filters out tiny tracking pixels (< 32×32) and offers interactive dimension filtering (> 150px, > 300px, > 600px, etc.).
   - Multi-select with checkboxes, target folder selector, and batch import with concurrency limiting.

5. **Web Bookmark Preservation**:
   - Saves current webpage URL, title, and visual snapshot card into the desktop library.
---

## Desktop REST Open API Interface

The Bowerbird desktop application exposes an HTTP REST API on `http://127.0.0.1:41595` (with fallback to ephemeral port or `BOWERBIRD_API_PORT`):

| Endpoint | Method | Description | Request Payload / Params |
| :--- | :--- | :--- | :--- |
| `/api/ping` | `GET` | Universal lightweight check if desktop app is running | N/A |
| `/api/health` | `GET` | Health check reporting running status & library status | N/A |
| `/api/info` | `GET` | Full app info, version & active library status | N/A |
| `/api/folders` | `GET` | Hierarchical list of library virtual folders | N/A |
| `/api/folder/create` | `POST` | Create a new virtual folder | `{"name": "...", "parentId": "..."}` |
| `/api/tags` | `GET` | List of tag taxonomies | N/A |
| `/api/item/addFromURL` | `POST` | Import asset via remote HTTP URL | `{"url": "...", "name": "...", "website": "...", "tags": [...], "folderId": "..."}` |
| `/api/item/addFromBase64` | `POST` | Import asset from Base64 binary payload | `{"base64": "...", "name": "...", "website": "...", "tags": [...]}` |
| `/api/item/addBookmark` | `POST` | Import web bookmark with snapshot card | `{"url": "...", "title": "...", "base64": "..."}` |
| `/api/item/addFromURLs` | `POST` | Batch import multiple assets concurrently | `{"items": [...], "folderId": "...", "tags": [...]}` |
| `/api/items` | `GET` | Query library items | `?q=<search>&sortOrder=<order>` |
All endpoints support CORS preflight (`OPTIONS`) with `Access-Control-Allow-Origin: *`.

---

## Build & Multi-Browser Installation

### Requirements
- Node.js ≥ 18
- pnpm

### Build Commands

```bash
cd extension

# Build for Google Chrome & Chromium browsers (Manifest V3) -> .output/chrome-mv3
pnpm run build

# Build for Mozilla Firefox (Manifest V2/V3) -> .output/firefox-mv2
pnpm run build:firefox

# Build for Microsoft Edge (Manifest V3) -> .output/edge-mv3
pnpm run build:edge

# Build for Apple Safari -> .output/safari-mv2
pnpm run build:safari

# Package zip archives for store distribution
pnpm run zip
pnpm run zip:firefox
```

### Installation Steps

#### 1. Google Chrome / Microsoft Edge / Brave
1. Open `chrome://extensions` or `edge://extensions`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** (加载已解压的扩展程序).
4. Select the `extension/.output/chrome-mv3` (or `edge-mv3`) folder.

#### 2. Mozilla Firefox
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...** (临时载入附加组件).
3. Select `extension/.output/firefox-mv2/manifest.json`.

#### 3. Apple Safari
1. Enable the **Develop** menu in Safari Settings -> Advanced -> "Show features for web developers".
2. Allow unsigned extensions via Develop -> Allow Unsigned Extensions.
3. Run `xcrun safari-web-extension-converter extension/.output/safari-mv2` to generate Xcode project or load directly.
