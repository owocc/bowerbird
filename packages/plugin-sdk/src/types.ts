import type React from "react";

export interface PluginItemMeta {
  colorModel?: string;
  colorSpace?: string;
  hasAlpha?: boolean;
  aspectRatio?: string;
  shape?: "landscape" | "portrait" | "square" | string;
  exifDate?: string;
  megapixels?: string;
  duration?: number;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  [key: string]: unknown;
}

/**
 * Normalized asset item representation provided to Bowerbird plugins.
 */
export interface PluginItem {
  id: string;
  /** Content hash (SHA-256) */
  hex: string;
  /** Display name of the item */
  name: string;
  /** Lowercase file extension without dot */
  extension: string;
  /** Stored filename on disk */
  filename: string;
  /** File size in bytes */
  size: number;
  /** Detected MIME type */
  mimeType: string;
  /** Intrinsic media width in pixels, if known */
  width: number;
  /** Intrinsic media height in pixels, if known */
  height: number;
  /** Whether a cached thumbnail is available */
  hasThumbnail: boolean;
  /** Hex dominant color code (e.g. #3b82f6) */
  dominantColor: string;
  /** Extracted color palette */
  palette: string[] | null;
  /** Extended media metadata */
  meta?: PluginItemMeta | null;
  /** User-provided note / remarks */
  note: string;
  /** Source or origin URL */
  url: string;
  /** Rating score (0-5) */
  rating: number;
  /** Generative AI prompt or descriptive text */
  prompt: string;
  /** Assigned tag labels */
  tags: string[] | null;
  /** Associated folder IDs */
  folders: string[] | null;
  /** Whether the item is in the trash bin */
  inTrash: boolean;
  /** Trashed timestamp in milliseconds */
  trashedAt: number;
  /** Created timestamp in milliseconds */
  createdAt: number;
  /** Imported timestamp in milliseconds */
  importedAt: number;
  /** Updated timestamp in milliseconds */
  updatedAt: number;
  /** Relative or local disk path of item directory */
  itemPath: string;
  /** Absolute local filesystem path to the original asset */
  filePath: string;
  /** Shell-escaped path for CLI usage */
  shellPath: string;
  /** RFC file:// URI */
  fileUrl: string;
  /** HTTP stream URL */
  originalUrl: string;
  /** HTTP thumbnail URL */
  thumbnailUrl: string;
  /** HTTP download URL for OS drag-out or save */
  downloadUrl: string;
  [key: string]: unknown;
}

export interface ItemDetailsPatch {
  note?: string;
  url?: string;
  rating?: number;
  prompt?: string;
}

export interface PreviewZoomController {
  scale: number;
  setScale: (newScale: number) => void;
  actualSize: () => void;
  zoomToFit: () => void;
}

export interface OriginalFileHandle {
  /** HTTP streaming URL for Range/MSE/fetch requests */
  url: string;
  /** Physical local filesystem path */
  filePath: string;
  /** RFC file:// URI */
  fileUrl: string;
  /** HTTP attachment download URL */
  downloadUrl: string;
  /** Detected MIME type */
  mimeType: string;
  /** Lowercase file extension without dot */
  extension: string;
  /** File size in bytes */
  size: number;
  /** Fetches the original file (or byte range) as a Blob */
  fetchBlob: (rangeHeader?: string) => Promise<Blob>;
  /** Fetches the original file (or byte range) as an ArrayBuffer */
  fetchArrayBuffer: (rangeHeader?: string) => Promise<ArrayBuffer>;
  /** Fetches the original file as text */
  fetchText?: (rangeHeader?: string) => Promise<string>;
}

export type ThemeMode = "dark" | "light";

/**
 * Host capabilities exposed to every PreviewPlugin in Viewport, InspectorPreview, and InspectorExtension.
 */
export interface PreviewPluginHostAPI<TItem = PluginItem> {
  /** Returns structured access to the original physical file and HTTP stream */
  getOriginalFile: () => OriginalFileHandle;
  /** Returns the current cover/thumbnail URL if available */
  getCoverUrl: () => string | undefined;
  /**
   * Saves a base64-encoded image as the item's cover thumbnail
   * and triggers backend dominant color and palette extraction.
   */
  saveCoverThumbnail: (
    base64Image: string,
    options?: { width?: number; height?: number; force?: boolean }
  ) => Promise<TItem | null>;
  /** Opens the original file with the OS default application */
  openWithDefaultApp: () => Promise<void>;
  /** Reveals the original file in macOS Finder / Windows Explorer */
  revealInFinder: () => Promise<void>;
  /** Opens an external HTTP/HTTPS URL in the OS default browser */
  openExternalURL: (url: string) => Promise<void>;
  /** Persists user-editable metadata fields (note, url, rating, prompt) */
  updateItemDetails: (patch: ItemDetailsPatch) => Promise<TItem | null>;
  /** Notifies the host workspace to refresh item state */
  onItemUpdated?: (updated: TItem) => void;
  /** Returns current resolved theme mode ("dark" or "light") */
  getTheme?: () => ThemeMode;
  /** Subscribes to theme changes, returning an unsubscribe callback */
  subscribeTheme?: (callback: (theme: ThemeMode) => void) => () => void;
}

export interface PreviewViewportProps<TItem = PluginItem> {
  item: TItem;
  mode: "inline" | "full-window";
  scale: number;
  onScaleChange: (scale: number) => void;
  controllerRef: { current: PreviewZoomController | null };
  api: PreviewPluginHostAPI<TItem>;
  theme?: ThemeMode;
}

export interface PreviewInspectorProps<TItem = PluginItem> {
  item: TItem;
  onOpenPreview?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  api: PreviewPluginHostAPI<TItem>;
  theme?: ThemeMode;
}

export interface InspectorExtensionProps<TItem = PluginItem> {
  item: TItem;
  isTrashView?: boolean;
  api: PreviewPluginHostAPI<TItem>;
  theme?: ThemeMode;
}
export type ContextMenuTarget = "file" | "folder" | "general";

export interface PluginContextMenuFolder {
  id: string;
  name: string;
  itemCount?: number;
  parentId?: string;
}

export interface PluginContextMenuContext<TItem = PluginItem> {
  target: ContextMenuTarget;
  items?: TItem[];
  folder?: PluginContextMenuFolder | null;
  position?: { x: number; y: number };
  api: PreviewPluginHostAPI<TItem>;
}

export interface PluginContextMenuItem<TItem = PluginItem> {
  id: string;
  label: string;
  labelKey?: string;
  icon?: string;
  target: ContextMenuTarget;
  extensions?: string[];
  disabled?: boolean | ((ctx: PluginContextMenuContext<TItem>) => boolean);
  hidden?: boolean | ((ctx: PluginContextMenuContext<TItem>) => boolean);
  onClick: (ctx: PluginContextMenuContext<TItem>) => void | Promise<void>;
}

export type PluginKind = "preview" | "metadata";
export interface PreviewPlugin<TItem = PluginItem> {
  /** Unique identifier of the plugin (e.g. "official.markdown-preview") */
  id: string;
  /** Plugin capability kind: "preview" (default) or "metadata" (inspector extension) */
  kind?: PluginKind;
  /** Human-readable name */
  name: string;
  /** Optional i18n translation key for the plugin name */
  nameKey?: string;
  /** Human-readable description of the plugin's capabilities */
  description?: string;
  /** Optional i18n translation key for the plugin description */
  descriptionKey?: string;
  /** Semantic version of the plugin (semver) */
  version?: string;
  /** Plugin author or organization */
  author?: string;
  /** Whether this is a built-in core plugin */
  builtin?: boolean;
  /**
   * Whether this plugin can be disabled by the user.
   * Defaults to true. Internal fallback plugins remain non-disableable.
   */
  canDisable?: boolean;
  /** Whether this plugin should be hidden from the user-facing plugin list */
  internal?: boolean;
  /** Higher priority plugins are evaluated first (1-85 for custom plugins, fallback = 0) */
  priority: number;
  /** Supported lowercase file extensions without leading dot */
  extensions?: string[];
  /** Supported MIME type prefixes (e.g. "image/", "audio/", "text/markdown") */
  mimePrefixes?: string[];
  /** Optional custom predicate for matching an item */
  match?: (item: TItem) => boolean;
  /** Whether the main header should render ZoomControls for this plugin */
  supportsZoom?: boolean;
  /** Main viewport renderer (used by both inline and full-window QuickLook preview) */
  Viewport?: React.ComponentType<PreviewViewportProps<TItem>>;
  /** Borderless adaptive inspector preview renderer for the right detail panel */
  InspectorPreview?: React.ComponentType<PreviewInspectorProps<TItem>>;
  /** Optional inspector metadata extension panel rendered inside ItemDetailPanel when enabled */
  InspectorExtension?: React.ComponentType<InspectorExtensionProps<TItem>>;
  /** Registered context menu items for file, folder, and general canvas */
  contextMenus?: PluginContextMenuItem<TItem>[];
  /** Dynamic context menu item contributor */
  getContextMenuItems?: (
    target: ContextMenuTarget,
    context: PluginContextMenuContext<TItem>
  ) => PluginContextMenuItem<TItem>[];
}
