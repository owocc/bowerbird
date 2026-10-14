import { useCallback } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { SearchSchemaInput } from "@tanstack/react-router";

/**
 * Typed query-parameter model for the `/browse` route.
 *
 * The workspace used to keep all of this in local `useState`; moving it into the
 * URL is what makes the browser/webview Back and Forward buttons able to step
 * through folders, tags, filters and previews (see `useHistoryNavigation`).
 *
 * Deliberately *not* here: the search text, thumbnail row height, sidebar
 * collapse state and multi-selection. Those are transient and would either
 * flood the history or carry no navigational meaning.
 */

export type WorkspaceView = "all" | "trash";
export type WorkspaceCategory = "all" | "image" | "video" | "document" | "archive" | "other";
export type WorkspaceSort = "desc" | "asc";
export type PreviewMode = "inline" | "full";

export interface WorkspaceSearch {
  /** `all` = every asset, `trash` = the recycle bin. */
  view: WorkspaceView;
  /** Folder id, when a virtual folder is selected. */
  folder?: string;
  /** Tag name, when a tag is selected. Folders and tags are mutually exclusive. */
  tag?: string;
  type: WorkspaceCategory;
  sort: WorkspaceSort;
  /** Whether the secondary tags sidebar is open. */
  tags: boolean;
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
} as const satisfies Partial<WorkspaceSearch>;

const CATEGORIES: WorkspaceCategory[] = [
  "all",
  "image",
  "video",
  "document",
  "archive",
  "other",
];

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asBool(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

/**
 * Input type for the validator. The `SearchSchemaInput` brand tells the router
 * that every field here is *input*-optional even though `WorkspaceSearch` has
 * required fields, so `navigate({ to: "/browse" })` needs no `search` argument.
 */
export type WorkspaceSearchInput = Partial<WorkspaceSearch> & SearchSchemaInput;

/**
 * Validates + coerces raw search input. Never throws: unknown/dead values fall
 * back to the defaults so a hand-edited or stale URL can only ever produce a
 * valid workspace state.
 */
export function validateWorkspaceSearch(raw: WorkspaceSearchInput): WorkspaceSearch {
  return {
    view: raw.view === "trash" ? "trash" : "all",
    type: CATEGORIES.includes(raw.type as WorkspaceCategory)
      ? (raw.type as WorkspaceCategory)
      : "all",
    sort: raw.sort === "asc" ? "asc" : "desc",
    tags: asBool(raw.tags),
    folder: asNonEmptyString(raw.folder),
    tag: asNonEmptyString(raw.tag),
    preview: raw.preview === "inline" || raw.preview === "full" ? raw.preview : undefined,
    item: asNonEmptyString(raw.item),
  };
}

/** The `activeFolderId` sentinel the workspace/sidebar still understand for Trash. */
export const TRASH_FOLDER_ID = "__trash__";

export interface WorkspaceSearchApi extends WorkspaceSearch {
  /** `null` (All), a folder id, or `__trash__`. Mirrors the old component state. */
  activeFolderId: string | null;
  /** Active tag name, or `null`. Always `null` when a folder or the trash is active. */
  activeTag: string | null;
  isTrash: boolean;

  selectAll: () => void;
  selectTrash: () => void;
  selectFolder: (folderId: string) => void;
  /** `null` clears the tag (returns to All). */
  selectTag: (tag: string | null) => void;
  setCategory: (type: WorkspaceCategory) => void;
  setSort: (sort: WorkspaceSort) => void;
  setTagsPanel: (open: boolean) => void;
  toggleTagsPanel: () => void;
  /** Closes the tags sidebar and returns to All (clears any active tag). */
  closeTagsPanel: () => void;

  /** Opens a preview. Pushes a history entry unless one is already open. */
  openPreview: (mode: PreviewMode, itemId: string) => void;
  /** Advances the preview target without adding a history entry. */
  setPreviewItem: (itemId: string) => void;
  /** Strips the preview params in place (`replace`). */
  closePreview: () => void;
  /**
   * Returns to a clean `/browse` (every param at its default). Used when the
   * active library changes; `replace` so the switch does not stack history.
   */
  reset: () => void;
}

/**
 * Reads the `/browse` search params and returns navigation helpers.
 *
 * Every write goes through the functional `search` updater: passing a plain
 * object to `navigate({ search })` would *replace* the whole search, silently
 * dropping every other param (router-core resolves `typeof search === "function"
 * ? search(prev) : search`).
 */
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
              value === (WORKSPACE_SEARCH_DEFAULTS as Record<string, unknown>)[key];
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
      patch({ view: "all", tag: tag ?? undefined, folder: undefined, preview: undefined, item: undefined }),
    setCategory: (type) => patch({ type }),
    setSort: (sort) => patch({ sort }),
    setTagsPanel: (open) => patch({ tags: open }),
    toggleTagsPanel: () => patch({ tags: !search.tags }),
    closeTagsPanel: () =>
      patch({ tags: false, tag: undefined, folder: undefined, preview: undefined, item: undefined }),

    openPreview: (mode, itemId) =>
      patch({ preview: mode, item: itemId }, { replace: previewOpen }),
    setPreviewItem: (itemId) => patch({ item: itemId }, { replace: true }),
    closePreview: () => patch({ preview: undefined, item: undefined }, { replace: true }),
    reset: () =>
      patch(
        {
          view: undefined,
          folder: undefined,
          tag: undefined,
          type: undefined,
          sort: undefined,
          tags: false,
          preview: undefined,
          item: undefined,
        },
        { replace: true }
      ),
  };
}
