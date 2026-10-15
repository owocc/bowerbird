import type React from "react";
import type { Item } from "../../../bindings/bowerbird/core/models";

export interface PreviewZoomController {
  scale: number;
  setScale: (newScale: number) => void;
  actualSize: () => void;
  zoomToFit: () => void;
}

export interface PreviewViewportProps {
  item: Item;
  mode: "inline" | "full-window";
  scale: number;
  onScaleChange: (scale: number) => void;
  controllerRef: React.MutableRefObject<PreviewZoomController | null>;
}

export interface PreviewInspectorProps {
  item: Item;
  onOpenPreview?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
}

export interface PreviewPlugin {
  /** Unique identifier of the built-in or custom preview plugin */
  id: string;
  /** Human-readable name */
  name: string;
  /** Higher priority plugins are evaluated first (fallback = 0) */
  priority: number;
  /** Supported lowercase file extensions without leading dot */
  extensions?: string[];
  /** Supported MIME type prefixes (e.g. "image/", "video/") */
  mimePrefixes?: string[];
  /** Optional custom predicate for matching an item */
  match?: (item: Item) => boolean;
  /** Whether the main header should render ZoomControls for this plugin */
  supportsZoom?: boolean;
  /** Main viewport renderer (used by both inline and full-window QuickLook preview) */
  Viewport: React.ComponentType<PreviewViewportProps>;
  /** Borderless adaptive inspector preview renderer for the right detail panel */
  InspectorPreview: React.ComponentType<PreviewInspectorProps>;
}
