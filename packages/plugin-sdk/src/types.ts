/**
 * Bowerbird native plugin SDK.
 *
 * A plugin is a single JavaScript/TypeScript module loaded by the desktop host.
 * It never renders DOM or React: it returns plain data, and the host paints the
 * result with `mygo/ui` (Go + GPU). This keeps plugins portable, sandboxable and
 * consistent with the rest of the native application.
 */

/** Capability group advertised by a plugin. */
export type PluginKind = "preview" | "metadata" | "resolver" | "action";

/**
 * Identifier of a renderer implemented by the native host.
 *
 * Plugins cannot draw their own UI. Instead they declare which native renderer
 * should handle a file, and the host maps that id to its built-in `mygo/ui`
 * view (markdown, audio, psd, image, video, ...).
 */
export type NativeRenderer =
  | "markdown"
  | "audio"
  | "video"
  | "image"
  | "psd"
  | "prompt"
  | (string & {});

/** Capabilities a plugin may request from the host sandbox. */
export interface PluginPermissions {
  /**
   * Hostname allow-list for `host.fetch`. Exact hosts and `*.example.com`
   * wildcards are supported. Empty means no network access.
   */
  network?: string[];
  /**
   * Executables the plugin may run through `host.spawn`. Every process launch
   * also needs an explicit user grant in the settings window.
   */
  process?: string[];
  /** Whether `host.platformOpen(url)` is available. Defaults to false. */
  openExternal?: boolean;
}

/** One editable row rendered in the plugin settings card. */
export interface PluginSetting {
  key: string;
  label: string;
  help?: string;
  /** Optional placeholder for the native text field. */
  placeholder?: string;
  /** Optional default value. */
  default?: string;
  /** Treat the value as a secret in the settings UI. */
  secret?: boolean;
}

/** Fields contributed by a preview plugin. */
export interface PreviewContribution {
  /** Native renderer used by the host, e.g. "markdown" or "audio". */
  renderer: NativeRenderer;
  /** Lowercase extensions without a leading dot. */
  extensions?: string[];
  /** MIME prefixes/types, e.g. "text/markdown" or "audio/". */
  mimePrefixes?: string[];
  /** Let the host show zoom controls and route pinch/scroll gestures. */
  supportsZoom?: boolean;
  /** Higher priority wins when several plugins match the same item. */
  priority?: number;
}

/**
 * `plugin.json` schema. Only `id`, `name` and `version` are mandatory; native
 * plugins may omit `main` when all of their behaviour is declared through the
 * host renderer.
 */
export interface PluginManifest {
  /** Unique namespaced id, e.g. "official.markdown-preview". */
  id: string;
  name: string;
  version: string;
  minAppVersion?: string;
  description?: string;
  author?: string;
  license?: string;
  homepage?: string;
  repository?: string;

  /** Primary capability group. Defaults to "preview" for preview plugins. */
  kind?: PluginKind;
  /** Native renderer id for preview plugins. */
  native?: NativeRenderer;
  /** Optional declarative preview contribution (alias of `native` + lists). */
  preview?: PreviewContribution;

  /** Lowercase extensions without a leading dot. */
  extensions?: string[];
  /** MIME prefixes or complete types. */
  mimePrefixes?: string[];
  /** Evaluation priority; higher wins. Custom plugins normally use 1–85. */
  priority?: number;
  /** Whether the native preview supports zoom. */
  supportsZoom?: boolean;

  /** Entry module relative to the plugin folder. Optional for native-only plugins. */
  main?: string;
  /** Optional icon name from the host icon set. */
  icon?: string;
  iconName?: string;
  /** Optional i18n keys. */
  nameKey?: string;
  descriptionKey?: string;

  permissions?: PluginPermissions;
  settings?: PluginSetting[];

  /** Hooks implemented by `main`. Purely informational for native plugins. */
  hooks?: PluginHookName[];
  /** Capability labels shown in the marketplace/settings. */
  capabilities?: string[];
  /** Hostnames this resolver owns; supports exact names and `*.example.com`. */
  urlHosts?: string[];
  /**
   * Regular expressions matched against normalized URLs. Hosts are indexed
   * first, so regexes only run for plugins whose host can match.
   */
  urlPatterns?: string[];

  /** Marketplace metadata (optional, ignored by the runtime). */
  category?: string;
  subCategory?: string;
  featured?: boolean;
  downloadsCount?: number;
  rating?: number;
  longDescription?: string;
  changelog?: Array<{ version: string; date: string; notes: string[] }>;
  /** Marks an official plugin bundled with the desktop app. */
  builtin?: boolean;
}

export type PluginHookName =
  | "resolveUrl"
  | "inspect"
  | "actions"
  | "runAction"
  | "thumbnail";

/** Extended media metadata extracted by the core scanner. */
export interface PluginItemMeta {
  colorModel?: string;
  colorSpace?: string;
  hasAlpha?: boolean;
  aspectRatio?: string;
  orientation?: "landscape" | "portrait" | "square" | string;
  bitDepth?: number;
  animated?: boolean;
  exifMake?: string;
  exifModel?: string;
  exifDate?: string;
  megapixels?: string;
  duration?: number;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  [key: string]: unknown;
}

/** Normalized asset item passed to every hook. */
export interface PluginItem {
  id: string;
  name: string;
  filename: string;
  extension: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  hasThumbnail?: boolean;
  dominantColor?: string;
  palette?: string[] | null;
  meta?: PluginItemMeta | null;
  note?: string;
  url?: string;
  rating?: number;
  prompt?: string;
  tags?: string[] | null;
  folders?: string[] | null;
  filePath: string;
  itemPath?: string;
  fileUrl?: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  downloadUrl?: string;
  createdAt?: number;
  importedAt?: number;
  updatedAt?: number;
  /**
   * UTF-8 content for small text files, supplied by the host when it asks for
   * inspection metadata. Binary previews should use their native renderer.
   */
  content?: string;
  [key: string]: unknown;
}

/** A folder exposed to context-menu hooks. */
export interface PluginFolder {
  id: string;
  name: string;
  parentId?: string;
  itemCount?: number;
}

export type PluginActionTarget = "file" | "folder" | "general";

/** Context shared by action hooks. */
export interface PluginActionContext {
  target?: PluginActionTarget;
  item?: PluginItem;
  items?: PluginItem[];
  folder?: PluginFolder | null;
}

/** One context-menu action contributed by a plugin. */
export interface PluginAction {
  /** Stable id local to the plugin. The host prefixes it with the plugin id. */
  id: string;
  title: string;
  /** Optional host icon name. */
  icon?: string;
  /** Optional extension filter. */
  extensions?: string[];
  /** Optional disabled flag. */
  disabled?: boolean;
}

/* -------------------------------------------------------------------------- */
/* resolveUrl                                                                 */
/* -------------------------------------------------------------------------- */

export interface ResolveUrlInput {
  url: string;
}

/** Result of resolving a page/short link to direct media. */
export interface PluginUrlResolution {
  /** Preferred direct media URL. */
  url?: string;
  /** More media URLs to try in order when `url` is unavailable. */
  candidates?: string[];
  /** Page/source URL stored on the imported item. */
  sourceUrl?: string;
  /** Suggested item name. */
  name?: string;
  /** Tags applied on import. */
  tags?: string[];
}

/* -------------------------------------------------------------------------- */
/* inspect                                                                    */
/* -------------------------------------------------------------------------- */

export interface InspectRow {
  label: string;
  value: string;
  copyable?: boolean;
}

export interface InspectTextBlock {
  title?: string;
  text: string;
}

export interface InspectSection {
  title: string;
  rows?: InspectRow[];
  textBlocks?: InspectTextBlock[];
}

export interface InspectResult {
  sections: InspectSection[];
}

export interface InspectInput {
  item: PluginItem;
}

/* -------------------------------------------------------------------------- */
/* thumbnail                                                                  */
/* -------------------------------------------------------------------------- */

export interface ThumbnailInput {
  filePath: string;
  mimeType: string;
  /** Optional source item, when the host has one. */
  item?: PluginItem;
}

export interface ThumbnailResult {
  /** Absolute path to a generated image readable by the host. */
  imagePath: string;
  width?: number;
  height?: number;
}

/* -------------------------------------------------------------------------- */
/* Host sandbox                                                               */
/* -------------------------------------------------------------------------- */

export interface HostFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  redirect?: "follow" | "error" | "manual";
  signal?: AbortSignal;
}

export interface HostSettings {
  /** Reads a value saved in the plugin settings card. */
  get(key: string): string;
  /** Convenience default. */
  get(key: string, fallback: string): string;
}

/**
 * Capabilities injected as `globalThis.host`. Nothing else from Node is
 * exposed: no filesystem, no unrestricted network and no unrestricted process
 * execution.
 */
export interface PluginHost {
  /** `fetch` restricted to `permissions.network`. */
  fetch(input: string | URL, init?: HostFetchInit): Promise<Response>;
  /** Plugin-scoped settings store. */
  settings: HostSettings;
  /** Runs an allow-listed executable and returns its stdout. */
  spawn(command: string, args?: string[]): string;
  /** Opens an HTTP(S) URL in the user's browser, when granted by the host. */
  platformOpen?(url: string): void;
  /**
   * Writes a line to the unified Bowerbird plugin log. The host records the
   * plugin id and hook alongside the message, so plugin logs appear in the
   * native Logs window with every other diagnostic entry.
   */
  log(message: string, detail?: string): void;
  log(level: PluginLogLevel, message: string, detail?: string): void;
}

export type PluginLogLevel = "trace" | "debug" | "info" | "warn" | "error";

/** Hook request/response shapes implemented by plugin modules. */
export interface PluginHooks {
  resolveUrl?(input: ResolveUrlInput): Promise<PluginUrlResolution | null> | PluginUrlResolution | null;
  inspect?(input: InspectInput): Promise<InspectResult | null> | InspectResult | null;
  actions?(input: PluginActionContext): Promise<PluginAction[]> | PluginAction[];
  runAction?(input: PluginActionContext & { id: string }): Promise<unknown> | unknown;
  thumbnail?(input: ThumbnailInput): Promise<ThumbnailResult | null> | ThumbnailResult | null;
}

/**
 * Optional authoring wrapper. It is purely a type helper: plugin files remain
 * plain ES modules and can be loaded by the host without a bundler.
 */
export interface PluginDefinition extends PluginHooks {
  manifest?: PluginManifest;
}

declare global {
  // eslint-disable-next-line no-var
  var host: PluginHost;
}
