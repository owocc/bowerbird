# Official Bowerbird plugins

Bowerbird's desktop UI is native (`mygo/ui` + Go). Official plugins therefore
do **not** ship React components or a Vite bundle. Each folder contains:

```text
<plugin-id>/
└── plugin.json   # manifest: capabilities, permissions, native renderer
```

Official native plugins no longer ship JavaScript. Only resolver plugins that
need site-specific parsing keep an `index.js` hook module. The desktop app can
load a native plugin from `plugin.json` alone.

Hook modules run inside the Go process with **moejs**, not Node. Every hook
invocation, result, error and host API call is recorded in the native plugin
log. Plugins can write to the same stream with `host.log(level, message,
detail?)` or `console.*`.

Security is declarative: a JavaScript plugin must list every exported hook in
`hooks`, and the host never calls an undeclared hook. Network, process and
external-link capabilities stay hidden unless `permissions.network`,
`permissions.process` or `permissions.openExternal` grant them. Bare `*`
network/process permissions are rejected, dynamic `eval` is disabled, and each
call has a memory limit and timeout.

## Native preview plugins

`plugin.json` declares the host renderer; Go paints the actual view:

| Plugin | Renderer | Responsibility |
| --- | --- | --- |
| `official.markdown-preview` | `markdown` | GFM rendering via `ui/markdown` |
| `official.audio-player` | `audio` | Playback, spectrum bars, scrubber, audio metadata |
| `official.psd-preview` | `psd` | PSD/PSB composite decode, zoom, layer tree |
| `official.prompt-metadata` | `prompt` | AI prompt field, copy action and full-text editor |
| `builtin.video` | `video` | Native frame playback through `ui.Video` + ffmpeg, mygo audio output |
| `official.pinterest` | — | URL resolver: pin/short link → original image |

Native preview plugins need no entry module and no JavaScript at all: the host
paints them directly with `mygo/ui`. Resolver plugins keep a zero-build
`index.js` because URL parsing is their entire job; they still cannot render UI.

The video renderer uses `ffmpeg`/`ffprobe` for frame extraction. If they are not
installed, the preview shows a readable error and the "Open with default app"
action; audio/video decoding never falls back to a WebView.

```json
{
  "id": "official.markdown-preview",
  "name": "Markdown Preview",
  "version": "2.0.0",
  "kind": "preview",
  "native": "markdown",
  "extensions": ["md", "markdown"],
  "mimePrefixes": ["text/markdown"],
  "priority": 50
}
```

## Thumbnail lifecycle

When a page loads, the app queues items without a cover and generates them in
the background with at most two workers. Video covers come from AVFoundation
when available and ffmpeg otherwise; PSD/PSB covers use the native composite
decoder. Sandboxed plugins can contribute by exporting the `thumbnail` hook.
Each item is deduplicated, retried once, and failures stay cached until the
user runs **Generate thumbnails** from the gallery context menu, which forces a
fresh cover even for an existing thumbnail.

## Resolver plugins

Resolver plugins declare `urlHosts` and/or `urlPatterns`. The host builds an
exact/wildcard hostname index, filters matching plugins by regex, then sorts by
`priority`. Only the first non-empty `resolveUrl` result wins, so fallbacks do
not start unnecessarily. Dragging a URL onto the workspace feeds this same
path; if no plugin claims it, the URL is imported directly as media.

`official.pinterest` uses the embedded moejs hook runtime:

```js
export async function resolveUrl({ url }) {
  return {
    url: "https://i.pinimg.com/originals/…/image.jpg",
    candidates: ["…"],
    sourceUrl: url,
    tags: ["pinterest"]
  };
}
```

Network access is limited to the hosts listed in `permissions.network`. Every
hook runs in a fresh in-process moejs runtime with no filesystem or child-process access
unless declared. See `internal/plugin` for the Go runtime and
`packages/plugin-sdk` for TypeScript types.

## Development

The desktop app scans this folder in development automatically. Packaged builds
register the same manifests as compiled-in built-ins (`internal/plugin/official.go`),
so a local folder can override the bundled copy with richer marketplace
metadata. Disabling a built-in preview plugin in Settings removes that native
preview surface at runtime.
