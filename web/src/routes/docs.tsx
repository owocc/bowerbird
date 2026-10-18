import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import {
  BookOpen,
  Code2,
  Terminal,
  FileJson,
  Layers,
  Cpu,
  Boxes,
  CheckCircle2,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { I18nContext } from "../lib/i18n";

export const Route = createFileRoute("/docs")({
  component: SdkDocsPage,
});

function SdkDocsPage() {
  const { t } = React.useContext(I18nContext);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full space-y-10">
      {/* Header */}
      <div className="space-y-3 border-b border-border/80 pb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
          <BookOpen className="size-3.5" />
          <span>Developer Guide</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
          {t("docsTitle")}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground max-w-3xl leading-relaxed">
          Learn how to author, package, and publish high-performance preview and metadata plugins
          for Bowerbird using the official <code className="text-foreground font-mono font-semibold">@bowerbird/plugin-sdk</code>.
        </p>
      </div>

      {/* Table of Contents & Quick Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <a
          href="#quick-start"
          className="p-4 rounded-xl border border-border/70 bg-card hover:border-primary/50 transition-colors group"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-foreground group-hover:text-primary">
            <Terminal className="size-4" />
            <span>1. Quick Start</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Installation & basic template</p>
        </a>

        <a
          href="#manifest-spec"
          className="p-4 rounded-xl border border-border/70 bg-card hover:border-primary/50 transition-colors group"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-foreground group-hover:text-primary">
            <FileJson className="size-4" />
            <span>2. Manifest Schema</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">manifest.json fields & priority</p>
        </a>

        <a
          href="#host-api"
          className="p-4 rounded-xl border border-border/70 bg-card hover:border-primary/50 transition-colors group"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-foreground group-hover:text-primary">
            <Cpu className="size-4" />
            <span>3. Host API</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">File handles, streams, metadata</p>
        </a>

        <a
          href="#building-publishing"
          className="p-4 rounded-xl border border-border/70 bg-card hover:border-primary/50 transition-colors group"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-foreground group-hover:text-primary">
            <Boxes className="size-4" />
            <span>4. Packaging</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">ESM build & protocol install</p>
        </a>
      </div>

      {/* Section 1: Quick Start */}
      <section id="quick-start" className="space-y-4 pt-6 border-t border-border/60">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Terminal className="size-5 text-primary" />
          <span>1. Quick Start</span>
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Create a new directory for your plugin and install <code className="font-mono text-foreground">@bowerbird/plugin-sdk</code>.
        </p>

        <div className="rounded-xl border border-border/80 bg-muted/40 p-4 font-mono text-xs overflow-x-auto">
          <span className="text-muted-foreground"># Install plugin SDK as a dependency</span>
          <br />
          <span className="text-primary font-bold">pnpm</span> add @bowerbird/plugin-sdk
        </div>

        <p className="text-sm text-muted-foreground">
          Create your entry point <code className="font-mono text-foreground">src/index.tsx</code> and use <code className="font-mono text-foreground">definePlugin</code>:
        </p>

        <div className="rounded-xl border border-border/80 bg-zinc-950 p-4 font-mono text-xs text-zinc-100 overflow-x-auto leading-relaxed">
          <pre>{`import React from "react";
import {
  definePlugin,
  type PreviewPlugin,
  type PreviewViewportProps,
  type PreviewInspectorProps,
} from "@bowerbird/plugin-sdk";

function CustomViewport({ item, api }: PreviewViewportProps) {
  const file = api.getOriginalFile();

  return (
    <div className="flex flex-col items-center justify-center p-6 text-foreground">
      <h3 className="font-bold text-lg">{item.name}</h3>
      <p className="text-xs text-muted-foreground">Path: {file.path}</p>
      <button
        onClick={() => api.openWithDefaultApp()}
        className="mt-4 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
      >
        Open in System App
      </button>
    </div>
  );
}

export default definePlugin({
  id: "com.example.custom-preview",
  name: "Custom Preview",
  version: "1.0.0",
  description: "Custom file format preview plugin for Bowerbird",
  author: "Your Name",
  kind: "preview",
  priority: 50,
  extensions: ["xyz", "custom"],
  mimePrefixes: ["application/x-custom"],
  supportsZoom: false,
  Viewport: CustomViewport,
});`}</pre>
        </div>
      </section>

      {/* Section 2: Manifest Specification */}
      <section id="manifest-spec" className="space-y-4 pt-6 border-t border-border/60">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <FileJson className="size-5 text-primary" />
          <span>2. Plugin Manifest Schema</span>
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Every Bowerbird plugin must provide a valid <code className="font-mono text-foreground">manifest.json</code> in its root directory.
        </p>

        <div className="rounded-xl border border-border/80 bg-zinc-950 p-4 font-mono text-xs text-zinc-100 overflow-x-auto leading-relaxed">
          <pre>{`{
  "id": "official.markdown-preview",
  "name": "Markdown Preview",
  "version": "1.0.0",
  "description": "Rich Markdown preview with syntax highlighting and frontmatter",
  "author": "Bowerbird Team",
  "kind": "preview",
  "priority": 50,
  "extensions": ["md", "markdown", "mdown", "mkd"],
  "mimePrefixes": ["text/markdown", "text/x-markdown"],
  "supportsZoom": true,
  "main": "index.js",
  "license": "MIT"
}`}</pre>
        </div>

        <div className="rounded-xl border border-border/70 overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/60 border-b border-border/70 font-semibold text-foreground">
              <tr>
                <th className="p-3">Field</th>
                <th className="p-3">Type</th>
                <th className="p-3">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-muted-foreground">
              <tr>
                <td className="p-3 font-mono font-medium text-foreground">id</td>
                <td className="p-3 font-mono">string</td>
                <td className="p-3">Unique namespaced reverse-domain identifier (e.g. "official.audio-player")</td>
              </tr>
              <tr>
                <td className="p-3 font-mono font-medium text-foreground">kind</td>
                <td className="p-3 font-mono">"preview" | "metadata"</td>
                <td className="p-3">"preview" replaces the main viewport; "metadata" extends inspector tabs</td>
              </tr>
              <tr>
                <td className="p-3 font-mono font-medium text-foreground">priority</td>
                <td className="p-3 font-mono">number (1 - 85)</td>
                <td className="p-3">Higher priority plugins are evaluated first during file resolution</td>
              </tr>
              <tr>
                <td className="p-3 font-mono font-medium text-foreground">extensions</td>
                <td className="p-3 font-mono">string[]</td>
                <td className="p-3">File extensions handled without dot (e.g. ["mp3", "wav"])</td>
              </tr>
              <tr>
                <td className="p-3 font-mono font-medium text-foreground">main</td>
                <td className="p-3 font-mono">string</td>
                <td className="p-3">Compiled entrypoint JavaScript file (default: "index.js")</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Host API */}
      <section id="host-api" className="space-y-4 pt-6 border-t border-border/60">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Cpu className="size-5 text-primary" />
          <span>3. Host API & Capabilities</span>
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Each plugin component receives a secure <code className="font-mono text-foreground">PreviewPluginHostAPI</code> instance
          allowing direct access to the file system and backend capabilities:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-border/70 bg-card space-y-2">
            <h4 className="text-xs font-bold text-foreground font-mono">api.getOriginalFile()</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Provides absolute file path, file size in bytes, HTTP asset streaming URL, and helpers
              like <code className="font-mono">getText()</code> and <code className="font-mono">getBlob()</code>.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border/70 bg-card space-y-2">
            <h4 className="text-xs font-bold text-foreground font-mono">api.openWithDefaultApp()</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Launches the physical file with the operating system's default registered desktop application.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border/70 bg-card space-y-2">
            <h4 className="text-xs font-bold text-foreground font-mono">api.revealInFinder()</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Reveals and highlights the item in macOS Finder or Windows File Explorer.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border/70 bg-card space-y-2">
            <h4 className="text-xs font-bold text-foreground font-mono">api.updateItemDetails(patch)</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Persists user-editable item metadata including notes, source URLs, star ratings, and prompt data.
            </p>
          </div>
        </div>
      </section>

      {/* Section 4: Building & Publishing */}
      <section id="building-publishing" className="space-y-4 pt-6 border-t border-border/60">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Boxes className="size-5 text-primary" />
          <span>4. Building & Publishing</span>
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Bundle your plugin into an ESM file named <code className="font-mono text-foreground">index.js</code> with
          React externalized, because the Bowerbird host runtime provides React and core UI components:
        </p>

        <div className="rounded-xl border border-border/80 bg-zinc-950 p-4 font-mono text-xs text-zinc-100 overflow-x-auto leading-relaxed">
          <pre>{`// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.tsx",
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "@bowerbird/plugin-sdk"],
    },
  },
});`}</pre>
        </div>

        <h3 className="text-sm font-bold text-foreground pt-2">1-Click Install via Bowerbird Protocol</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Users can install your plugin with a single click using the custom OS protocol handler:
        </p>

        <div className="rounded-xl border border-border/80 bg-muted/40 p-3 font-mono text-xs text-foreground overflow-x-auto select-all">
          bowerbird://plugin/install?manifest=https://your-domain.com/manifest.json&id=your.plugin.id&version=1.0.0
        </div>
      </section>
    </div>
  );
}
