# @bowerbird/plugin-sdk

TypeScript SDK for **native-rendered, zero-build** Bowerbird plugins.

Bowerbird no longer embeds a WebView or React runtime. A plugin is a plain ES
module plus a `plugin.json`; the Go host runs it in an embedded moejs runtime and
paints the returned data with `mygo/ui`. Plugins therefore never import React,
never touch the DOM and never ship a bundler config.

## Install

```bash
pnpm add -D @bowerbird/plugin-sdk
```

The SDK is types-only for most plugins. Runtime helpers such as `formatBytes`
are tiny and can be imported directly; there is no framework runtime to bundle.

## Plugin layout

```text
my-plugin/
├── plugin.json
├── index.js          # optional for native-only plugins
└── locales/          # optional translations
```

`main` may also point to a `.ts` file: the moejs kernel strips TypeScript type
syntax directly, so no bundler or `tsc` output is required.

```json
{
  "id": "example.ai-inspector",
  "name": "AI Inspector",
  "version": "2.0.0",
  "minAppVersion": "1.0.0",
  "kind": "metadata",
  "main": "index.js",
  "hooks": ["inspect"],
  "permissions": { "network": [], "process": [] },
  "settings": [
    { "key": "endpoint", "label": "API endpoint", "placeholder": "https://…" }
  ]
}
```

## Hooks

```ts
// index.js — no imports and no build step required
export async function inspect({ item }) {
  if (!item.prompt) return null;
  return {
    sections: [{
      title: "AI Prompt",
      rows: [
        { label: "Characters", value: String(item.prompt.length) },
        { label: "Words", value: String(item.prompt.trim().split(/\s+/).length) },
      ],
      textBlocks: [{ title: "Prompt", text: item.prompt }],
    }],
  };
}
```

All hooks receive plain JSON data and return plain JSON data:

| Hook | Purpose |
| --- | --- |
| `resolveUrl({ url })` | Resolve a page/short link to direct media. |
| `inspect({ item })` | Add declarative sections to the native inspector. |
| `actions(ctx)` | Contribute native context-menu actions. |
| `runAction({ id, item, items, folder })` | Execute one advertised action. |
| `thumbnail({ filePath, mimeType })` | Ask the host to import a generated cover image. |

## URL resolver plugins

Declare hosts and/or regular expressions so the host can index a dropped URL
and start only the first matching resolver:

```json
{
  "kind": "resolver",
  "urlHosts": ["pinterest.com", "*.pinterest.com", "pin.it"],
  "urlPatterns": ["^https?://pin\\.it/[A-Za-z0-9]+"],
  "permissions": { "network": ["pinterest.com", "*.pinterest.com", "pin.it"] }
}
```

Hosts are matched through an exact/wildcard index; regexes then filter the
candidate set. Resolvers are ordered by `priority` (highest first), and the
first non-empty `resolveUrl` result wins, so slower fallbacks never run.

## Native preview plugins

Preview plugins do not draw pixels. They declare which renderer the host should
use, and the native host supplies the `mygo/ui` view:

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

The optional `preview` object is an equivalent structured form:

```json
{
  "kind": "preview",
  "preview": {
    "renderer": "audio",
    "extensions": ["mp3", "flac", "wav"],
    "mimePrefixes": ["audio/"],
    "supportsZoom": false,
    "priority": 60
  }
}
```

Built-in renderer ids currently include `image`, `video`, `markdown`, `audio`,
`psd` and `prompt`. A native plugin with no `main` is fully hosted by Go and
runs entirely inside the Go process.

## Sandbox

The host exposes only `globalThis.host`:

```ts
host.fetch(url, init);          // hostname allow-list from permissions.network
host.settings.get("key");       // plugin-scoped settings
host.spawn("magick", ["-help"]); // allow-list + explicit user grant
host.log("info", "resolved", url); // unified plugin log
console.log("also captured");    // console.* is forwarded too
```

From TypeScript, the SDK helper reads the same store:

```ts
import { log } from "@bowerbird/plugin-sdk";
log("info", "resolved", url);
```

Every hook start/end, result, error and host API call is written to the native
plugin log with the plugin id and hook name. `host.log(level, message, detail)`
accepts `trace`, `debug`, `info`, `warn` and `error`.

Network, filesystem and child processes are denied by default. A plugin call is
limited to 30 seconds and a 256 MB heap; the host creates a fresh runtime for
each hook, so a crash cannot take the app down.

## Validation

```ts
import { validatePluginManifest, normalizePluginManifest } from "@bowerbird/plugin-sdk";

const result = validatePluginManifest(JSON.parse(raw));
if (!result.valid) console.error(result.errors);
```

## License

MIT
