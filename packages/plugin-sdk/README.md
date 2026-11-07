# @bowerbird/plugin-sdk

Official Software Development Kit for authoring custom preview and metadata plugins for [Bowerbird](https://github.com/owocc/bowerbird).

## Features

- **TypeScript Definitions**: Complete types for `PluginManifest`, `PreviewPluginDefinition`, `MetadataPluginDefinition`, and host APIs.
- **Preview Plugins**: Create custom rich viewports and sidebar inspectors for specialized file types (Markdown, 3D models, Audio, Video, etc.).
- **Metadata Plugins**: Extend asset metadata panels with custom fields, prompt collectors, or tag generators.
- **Manifest Validation**: Built-in runtime manifest validator (`validatePluginManifest`).

## Installation

```bash
pnpm add -D @bowerbird/plugin-sdk
# or
npm install -D @bowerbird/plugin-sdk
```

## Quick Start: Preview Plugin

1. Create a `manifest.json`:

```json
{
  "id": "myorg.custom-preview",
  "name": "Custom Preview",
  "version": "1.0.0",
  "description": "Preview support for my custom format",
  "author": "My Team",
  "kind": "preview",
  "priority": 50,
  "extensions": ["xyz"],
  "main": "index.js"
}
```

2. Author your plugin entrypoint (`src/index.tsx`):

```tsx
import type { PreviewPluginDefinition } from "@bowerbird/plugin-sdk";

const plugin: PreviewPluginDefinition = {
  id: "myorg.custom-preview",
  name: "Custom Preview",
  kind: "preview",
  extensions: ["xyz"],
  Viewport: ({ item, mode }) => {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <span>Previewing {item.name}</span>
      </div>
    );
  },
};

export default plugin;
```

3. Bundle into `index.js` using Vite or your favorite bundler, leaving `react` and `react-dom` as external dependencies.

## License

MIT

## URL Resolver Plugins

Plugins can take ownership of site-specific URL parsing. The host exposes a
generic HTTP bridge (`/api/url/fetch`) so plugins can read remote pages without
worrying about WebView CORS rules, then return direct media candidates through
the `resolveUrl` hook.

```ts
import { definePlugin, type PluginUrlResolution, type UrlResolveContext } from "@bowerbird/plugin-sdk";

async function resolve(url: string, ctx: UrlResolveContext): Promise<PluginUrlResolution | null> {
  if (!url.includes("example.com/item/")) return null;

  const page = await ctx.fetchText(url);
  const match = page.body.match(/https:\/\/cdn\.example\.com\/original\/[^"']+/);
  if (!match) return null;

  return {
    url: match[0],
    candidates: [match[0]],
    sourceUrl: url,
    tags: ["example"],
  };
}

export default definePlugin({
  id: "myorg.example-resolver",
  name: "Example URL Resolver",
  kind: "metadata",
  priority: 55,
  extensions: [],
  resolveUrl: resolve,
});
```

The host asks enabled plugins in priority order. The first non-null resolution is
used; each candidate is imported in order until one succeeds. This keeps the
desktop core completely site-agnostic — adding support for another service only
requires a plugin update.
