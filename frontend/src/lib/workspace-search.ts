import { useCallback } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { SearchSchemaInput } from "@tanstack/react-router";

/**
 * Typed query-parameter model for the `/browse` route.
 */

export type WorkspaceView = "all" | "trash" | "untagged" | "uncategorized" | "history";
export type WorkspaceCategory =
  | "all"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "archive"
  | "other";
export type WorkspaceSort = "desc" | "asc";
export type PreviewMode = "inline" | "full";
export type GalleryLayoutMode = "justified" | "waterfall" | "grid" | "list";
export type WorkspaceOrientation = "all" | "landscape" | "portrait" | "square";
export type WorkspaceSizeFilter = "all" | "small" | "medium" | "large";
export type WorkspacePresenceFilter = "all" | "has" | "empty";
export interface WorkspaceSearch {
  /** `all` = every asset, `trash` = the recycle bin. */
  view: WorkspaceView;
  /** Folder id, when a virtual folder is selected from the sidebar. */
  folder?: string;
  /** Tag name, when a tag is selected from the tags sidebar. */
  tag?: string;
  type: WorkspaceCategory;
  sort: WorkspaceSort;
  /** Gallery display layout mode (default: justified) */
  layout: GalleryLayoutMode;
  /** Whether the secondary tags sidebar is open. */
  tags: boolean;
  /** Active color filter hex (e.g. "#EF4444") */
  color?: string;
  /** Active folder filter from the top filter bar ("__uncategorized__" or folder ID) */
  filterFolder?: string;
  /** Active tag filter from the top filter bar ("__untagged__" or tag name) */
  filterTag?: string;
  /** Active aspect orientation filter */
  orientation: WorkspaceOrientation;
  /** Active file size range filter */
  size: WorkspaceSizeFilter;
  /** Active URL presence filter */
  hasUrl: WorkspacePresenceFilter;
  /** Active Note presence filter */
  hasNote: WorkspacePresenceFilter;
  /** Active star rating filter (undefined = all, 0 = unrated, 1..5 = exact star rating) */
  rating?: number;
  /** Active preview overlay, if any. */
  preview?: PreviewMode;
  /** Item shown by the preview overlay. */
  item?: string;
}

/** Defaults are stripped from the URL so only meaningful state is persisted. */
export const WORKSPACE_SEARCH_DEFAULTS = {
  view: "all",
  type: "all",
  sort: "desc",
  layout: "justified",
  tags: false,
  orientation: "all",
  size: "all",
  hasUrl: "all",
  hasNote: "all",
} as const satisfies Partial<WorkspaceSearch>;
const CATEGORIES: WorkspaceCategory[] = [
  "all",
  "image",
  "video",
  "audio",
  "document",
  "archive",
  "other",
];

const ORIENTATIONS: WorkspaceOrientation[] = [
  "all",
  "landscape",
  "portrait",
  "square",
];

const SIZE_FILTERS: WorkspaceSizeFilter[] = [
  "all",
  "small",
  "medium",
  "large",
];

const PRESENCE_FILTERS: WorkspacePresenceFilter[] = ["all", "has", "empty"];
const GALLERY_LAYOUTS: GalleryLayoutMode[] = [
  "justified",
  "waterfall",
  "grid",
  "list",
];

const LAYOUT_STORAGE_KEY = "bowerbird.gallery.layout";

function getInitialGalleryLayout(): GalleryLayoutMode {
  try {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (saved && GALLERY_LAYOUTS.includes(saved as GalleryLayoutMode)) {
        return saved as GalleryLayoutMode;
      }
    }
  } catch {
    /* ignore storage errors */
  }
  return "justified";
}


function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asBool(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function asRating(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const num = Number(value);
  if (Number.isInteger(num) && num >= 0 && num <= 5) return num;
  return undefined;
}

export type WorkspaceSearchInput = Partial<WorkspaceSearch> & SearchSchemaInput;

export function validateWorkspaceSearch(
  raw: WorkspaceSearchInput
): WorkspaceSearch {
  return {
    view:
      raw.view === "trash" ||
      raw.view === "untagged" ||
      raw.view === "uncategorized" ||
      raw.view === "history"
        ? raw.view
        : "all",
    type: CATEGORIES.includes(raw.type as WorkspaceCategory)
      ? (raw.type as WorkspaceCategory)
      : "all",
    sort: raw.sort === "asc" ? "asc" : "desc",
    layout: GALLERY_LAYOUTS.includes(raw.layout as GalleryLayoutMode)
      ? (raw.layout as GalleryLayoutMode)
      : getInitialGalleryLayout(),
    tags: asBool(raw.tags),
    folder: asNonEmptyString(raw.folder),
    tag: asNonEmptyString(raw.tag),
    color: asNonEmptyString(raw.color),
    filterFolder: asNonEmptyString(raw.filterFolder),
    filterTag: asNonEmptyString(raw.filterTag),
    orientation: ORIENTATIONS.includes(raw.orientation as WorkspaceOrientation)
      ? (raw.orientation as WorkspaceOrientation)
      : "all",
    size: SIZE_FILTERS.includes(raw.size as WorkspaceSizeFilter)
      ? (raw.size as WorkspaceSizeFilter)
      : "all",
    hasUrl: PRESENCE_FILTERS.includes(raw.hasUrl as WorkspacePresenceFilter)
      ? (raw.hasUrl as WorkspacePresenceFilter)
      : "all",
    hasNote: PRESENCE_FILTERS.includes(raw.hasNote as WorkspacePresenceFilter)
      ? (raw.hasNote as WorkspacePresenceFilter)
      : "all",
    rating: asRating(raw.rating),
    preview:
      raw.preview === "inline" || raw.preview === "full"
        ? raw.preview
        : undefined,
    item: asNonEmptyString(raw.item),
  };
}

export const TRASH_FOLDER_ID = "__trash__";
export const UNTAGGED_FOLDER_ID = "__untagged__";
export const UNCATEGORIZED_FOLDER_ID = "__uncategorized__";
export const HISTORY_FOLDER_ID = "__history__";

export interface WorkspaceSearchApi extends WorkspaceSearch {
  activeFolderId: string | null;
  activeTag: string | null;
  isTrash: boolean;
  isUntagged: boolean;
  isUncategorized: boolean;
  isHistory: boolean;
  selectAll: () => void;
  selectTrash: () => void;
  selectUntagged: () => void;
  selectUncategorized: () => void;
  selectHistory: () => void;
  selectFolder: (folderId: string) => void;
  selectTag: (tag: string | null) => void;
  setCategory: (type: WorkspaceCategory) => void;
  setSort: (sort: WorkspaceSort) => void;
  setLayout: (layout: GalleryLayoutMode) => void;
  setColorFilter: (color: string | null) => void;
  setFolderFilter: (folderId: string | null) => void;
  setOrientationFilter: (orientation: WorkspaceOrientation) => void;
  setSizeFilter: (size: WorkspaceSizeFilter) => void;
  setHasUrlFilter: (hasUrl: WorkspacePresenceFilter) => void;
  setHasNoteFilter: (hasNote: WorkspacePresenceFilter) => void;
  setRatingFilter: (rating: number | null) => void;
  clearAllFilters: () => void;
  setTagsPanel: (open: boolean) => void;
  toggleTagsPanel: () => void;
  closeTagsPanel: () => void;

  openPreview: (mode: PreviewMode, itemId: string) => void;
  setPreviewItem: (itemId: string) => void;
  closePreview: () => void;
  reset: () => void;
}

export function useWorkspaceSearch(): WorkspaceSearchApi {
  const search = useSearch({ from: "/browse" });
  const navigate = useNavigate();

  const patch = useCallback(
    (next: Partial<WorkspaceSearch>, opts?: { replace?: boolean }) => {
      navigate({
        to: "/browse",
        replace: opts?.replace,
        search: (prev) => {
          const merged: Record<string, unknown> = { ...prev, ...next };
          for (const key of Object.keys(merged)) {
            const value = merged[key];
            const isDefault =
              value ===
              (WORKSPACE_SEARCH_DEFAULTS as Record<string, unknown>)[key];
            if (value === undefined || value === null || isDefault) {
              delete merged[key];
            }
          }
          return merged as unknown as WorkspaceSearch;
        },
      });
    },
    [navigate]
  );

  const isTrash = search.view === "trash";
  const isUntagged = search.view === "untagged";
  const isUncategorized = search.view === "uncategorized";
  const isHistory = search.view === "history";
  const activeFolderId = isTrash
    ? TRASH_FOLDER_ID
    : isUntagged
    ? UNTAGGED_FOLDER_ID
    : isUncategorized
    ? UNCATEGORIZED_FOLDER_ID
    : isHistory
    ? HISTORY_FOLDER_ID
    : search.folder ?? null;
  const activeTag =
    isTrash || isUntagged || isUncategorized || isHistory || search.folder
      ? null
      : search.tag ?? null;
  const previewOpen = Boolean(search.preview);

  return {
    ...search,
    activeFolderId,
    activeTag,
    isTrash,
    isUntagged,
    isUncategorized,
    isHistory,

    selectAll: () =>
      patch({
        view: "all",
        folder: undefined,
        tag: undefined,
        tags: false,
        preview: undefined,
        item: undefined,
      }),
    selectTrash: () =>
      patch({
        view: "trash",
        folder: undefined,
        tag: undefined,
        tags: false,
        preview: undefined,
        item: undefined,
      }),
    selectUntagged: () =>
      patch({
        view: "untagged",
        folder: undefined,
        tag: undefined,
        tags: false,
        preview: undefined,
        item: undefined,
      }),
    selectUncategorized: () =>
      patch({
        view: "uncategorized",
        folder: undefined,
        tag: undefined,
        tags: false,
        preview: undefined,
        item: undefined,
      }),
    selectHistory: () =>
      patch({
        view: "history",
        folder: undefined,
        tag: undefined,
        tags: false,
        preview: undefined,
        item: undefined,
      }),
    selectFolder: (folderId) =>
      patch({
        view: "all",
        folder: folderId,
        tag: undefined,
        tags: false,
        preview: undefined,
        item: undefined,
      }),
    selectTag: (tag) =>
      patch({
        view: "all",
        tags: true,
        tag: tag ?? undefined,
        folder: undefined,
        preview: undefined,
        item: undefined,
      }),
    setCategory: (type) => patch({ type }),
    setSort: (sort) => patch({ sort }),
    setLayout: (layout) => {
      try {
        window.localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
      } catch {
        /* ignore storage errors */
      }
      patch({ layout });
    },
    setColorFilter: (color) => patch({ color: color ?? undefined }),
    setFolderFilter: (folderId) => patch({ filterFolder: folderId ?? undefined }),
    setOrientationFilter: (orientation) => patch({ orientation }),
    setSizeFilter: (size) => patch({ size }),
    setHasUrlFilter: (hasUrl) => patch({ hasUrl }),
    setHasNoteFilter: (hasNote) => patch({ hasNote }),
    setRatingFilter: (rating) => patch({ rating: rating ?? undefined }),
    clearAllFilters: () =>
      patch({
        type: "all",
        color: undefined,
        filterFolder: undefined,
        filterTag: undefined,
        orientation: "all",
        size: "all",
        hasUrl: "all",
        hasNote: "all",
        rating: undefined,
      }),
    setTagsPanel: (open) =>
      patch({
        view: "all",
        tags: open,
        folder: undefined,
        tag: open ? search.tag : undefined,
        preview: undefined,
        item: undefined,
      }),
    toggleTagsPanel: () =>
      patch({
        view: "all",
        tags: !search.tags,
        folder: undefined,
        tag: !search.tags ? search.tag : undefined,
        preview: undefined,
        item: undefined,
      }),
    closeTagsPanel: () =>
      patch({
        tags: false,
        tag: undefined,
        folder: undefined,
        preview: undefined,
        item: undefined,
      }),
    openPreview: (mode, itemId) =>
      patch({ preview: mode, item: itemId }, { replace: previewOpen }),
    setPreviewItem: (itemId) => patch({ item: itemId }, { replace: true }),
    closePreview: () =>
      patch({ preview: undefined, item: undefined }, { replace: true }),
    reset: () =>
      patch(
        {
          view: undefined,
          folder: undefined,
          tag: undefined,
          type: undefined,
          sort: undefined,
          tags: false,
          color: undefined,
          filterFolder: undefined,
          filterTag: undefined,
          orientation: "all",
          size: "all",
          hasUrl: "all",
          hasNote: "all",
          rating: undefined,
          preview: undefined,
          item: undefined,
        },
        { replace: true }
      ),
  };
}
