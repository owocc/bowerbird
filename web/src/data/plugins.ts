import type { PluginManifest } from "@bowerbird/plugin-sdk";

export interface PluginVersionHistory {
  version: string;
  date: string;
  notes: string[];
}

export interface MarketplacePlugin extends PluginManifest {
  manifestUrl: string;
  downloadUrl: string;
  iconName: "file-text" | "music" | "table" | "camera" | "box";
  longDescription: string;
  category: "preview" | "metadata";
  changelog: PluginVersionHistory[];
  featured?: boolean;
  downloadsCount: number;
  rating: number;
}

export const OFFICIAL_PLUGINS: MarketplacePlugin[] = [
  {
    id: "official.markdown-preview",
    name: "Markdown Preview",
    version: "1.0.0",
    description: "Rich Markdown preview with syntax highlighting, task lists, frontmatter inspection, and table of contents outline.",
    author: "Bowerbird Team",
    kind: "preview",
    category: "preview",
    priority: 50,
    extensions: ["md", "markdown", "mdown", "mkd", "mdwn", "mdt"],
    mimePrefixes: ["text/markdown", "text/x-markdown"],
    supportsZoom: true,
    main: "index.js",
    license: "MIT",
    iconName: "file-text",
    featured: true,
    downloadsCount: 1420,
    rating: 4.9,
    manifestUrl: "/plugins-dist/official.markdown-preview/manifest.json",
    downloadUrl: "/plugins-dist/official.markdown-preview/index.js",
    longDescription: `### Key Features
- **GitHub Flavored Markdown (GFM)**: Render tables, task lists, strikethrough, blockquotes, and code blocks with syntax highlighting.
- **YAML Frontmatter Extraction**: Automatically parses header frontmatter (title, date, author, tags) and displays structured badge attributes.
- **Document Outline**: Dynamic table of contents parsed from H1-H6 headings with instant click-to-scroll navigation.
- **Full Zoom & Pan**: Interactive viewport zoom controls with mouse wheel or keyboard shortcuts.
- **Copy Formatted Text & Markdown**: Quick action to copy raw markdown or rendered rich text.`,
    changelog: [
      {
        version: "1.0.0",
        date: "2026-10-18",
        notes: [
          "Initial official release built with @bowerbird/plugin-sdk",
          "Interactive Viewport with Zoom & Outline support",
          "Inspector Preview with YAML frontmatter badges",
        ],
      },
    ],
  },
  {
    id: "official.audio-player",
    name: "Audio Player",
    version: "1.0.0",
    description: "Interactive audio player with waveform scrubber, playback rate, volume control, and ID3 metadata display.",
    author: "Bowerbird Team",
    kind: "preview",
    category: "preview",
    priority: 60,
    extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac", "webm"],
    mimePrefixes: ["audio/"],
    supportsZoom: false,
    main: "index.js",
    license: "MIT",
    iconName: "music",
    featured: true,
    downloadsCount: 980,
    rating: 4.8,
    manifestUrl: "/plugins-dist/official.audio-player/manifest.json",
    downloadUrl: "/plugins-dist/official.audio-player/index.js",
    longDescription: `### Key Features
- **Multi-Format Playback**: Native audio playback for MP3, WAV, FLAC, OGG, M4A, AAC, and WebM streams.
- **Interactive Scrubber**: Seamless scrubbing with live timestamp, duration formatting, and keyboard shortcuts (Space to play/pause, Left/Right arrows for seek).
- **Speed & Volume Controls**: Variable playback speed (0.5x, 1x, 1.25x, 1.5x, 2x) with pitch preservation, mute toggle, and smooth volume slider.
- **Metadata Cards**: Displays bitrate, sample rate, channels, duration, and file size in the sidebar inspector.`,
    changelog: [
      {
        version: "1.0.0",
        date: "2026-10-18",
        notes: [
          "Initial official release built with @bowerbird/plugin-sdk",
          "Smooth audio waveform scrubber and time display",
          "Variable playback speed and volume memory",
        ],
      },
    ],
  },
];
