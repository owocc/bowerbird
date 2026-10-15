import { useCallback } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { SearchSchemaInput } from "@tanstack/react-router";

/**
 * Typed query-parameter model for the `/browse` route.
 */

export type WorkspaceView = "all" | "trash";
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
export type WorkspaceOrientation = "all" | "landscape" | "portrait" | "square";

export interface WorkspaceSearch {
  /** `all` = every asset, `trash` = the recycle bin. */
  view: WorkspaceView;
  /** Folder id, when a virtual folder is selected from the sidebar. */
  folder?: string;
  /** Tag name, when a tag is selected from the tags sidebar. */
  tag?: string;
  type: WorkspaceCategory;
  sort: WorkspaceSort;
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
  tags: false,
  orientation: "all",
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

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asBool(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

export type WorkspaceSearchInput = Partial<WorkspaceSearch> & SearchSchemaInput;

export function validateWorkspaceSearch(
  raw: WorkspaceSearchInput
): WorkspaceSearch {
  return {
    view: raw.view === "trash" ? "trash" : "all",
    type: CATEGORIES.includes(raw.type as WorkspaceCategory)
      ? (raw.type as WorkspaceCategory)
      : "all",
    sort: raw.sort === "asc" ? "asc" : "desc",
    tags: asBool(raw.tags),
    folder: asNonEmptyString(raw.folder),
    tag: asNonEmptyString(raw.tag),
    color: asNonEmptyString(raw.color),
    filterFolder: asNonEmptyString(raw.filterFolder),
    filterTag: asNonEmptyString(raw.filterTag),
    orientation: ORIENTATIONS.includes(raw.orientation as WorkspaceOrientation)
      ? (raw.orientation as WorkspaceOrientation)
      : "all",
    preview:
      raw.preview === "inline" || raw.preview === "full"
        ? raw.preview
        : undefined,
    item: asNonEmptyString(raw.item),
  };
}

export const TRASH_FOLDER_ID = "__trash__";

export interface WorkspaceSearchApi extends WorkspaceSearch {
  activeFolderId: string | null;
  activeTag: string | null;
  isTrash: boolean;

  selectAll: () => void;
  selectTrash: () => void;
  selectFolder: (folderId: string) => void;
  selectTag: (tag: string | null) => void;
  setCategory: (type: WorkspaceCategory) => void;
  setSort: (sort: WorkspaceSort) => void;
  setColorFilter: (color: string | null) => void;
  setFolderFilter: (folderId: string | null) => void;
  setTagFilter: (tag: string | null) => void;
  setOrientationFilter: (orientation: WorkspaceOrientation) => void;
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
  const activeFolderId = isTrash ? TRASH_FOLDER_ID : search.folder ?? null;
  const activeTag = isTrash || search.folder ? null : search.tag ?? null;
  const previewOpen = Boolean(search.preview);

  return {
    ...search,
    activeFolderId,
    activeTag,
    isTrash,

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
        tag: tag ?? undefined,
        folder: undefined,
        preview: undefined,
        item: undefined,
      }),
    setCategory: (type) => patch({ type }),
    setSort: (sort) => patch({ sort }),
    setColorFilter: (color) => patch({ color: color ?? undefined }),
    setFolderFilter: (folderId) => patch({ filterFolder: folderId ?? undefined }),
    setTagFilter: (tag) => patch({ filterTag: tag ?? undefined }),
    setOrientationFilter: (orientation) => patch({ orientation }),
    clearAllFilters: () =>
      patch({
        type: "all",
        color: undefined,
        filterFolder: undefined,
        filterTag: undefined,
        orientation: "all",
      }),
    setTagsPanel: (open) => patch({ tags: open }),
    toggleTagsPanel: () => patch({ tags: !search.tags }),
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
          preview: undefined,
          item: undefined,
        },
        { replace: true }
      ),
  };
}
