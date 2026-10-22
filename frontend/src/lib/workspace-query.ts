import {
  HISTORY_FOLDER_ID,
  TRASH_FOLDER_ID,
  UNCATEGORIZED_FOLDER_ID,
  UNTAGGED_FOLDER_ID,
  type WorkspaceCategory,
  type WorkspaceOrientation,
  type WorkspacePresenceFilter,
  type WorkspaceSizeFilter,
} from "@/lib/workspace-search";
import { UNCATEGORIZED_FOLDER_FILTER } from "@/components/FilterBar";

export interface WorkspaceQueryInput {
  search: string;
  activeFolderId: string | null;
  includeSubfolders: boolean;
  activeFolderMatchSet: Set<string> | null;
  tagsSidebarOpen: boolean;
  activeTag: string | null;
  category: WorkspaceCategory;
  folderFilter: string | null;
  orientation: WorkspaceOrientation;
  color: string | null;
  size: WorkspaceSizeFilter;
  hasUrl: WorkspacePresenceFilter;
  hasNote: WorkspacePresenceFilter;
  rating: number | null;
}

export interface WorkspaceQuery {
  /** Query string sent to core's shared parser (literal search text is quoted). */
  query: string;
  /** Desktop-only OR filter for "include subfolders". */
  folderScope: string[];
  /** Desktop-only rating=0 predicate the public grammar intentionally omits. */
  onlyUnrated: boolean;
  signature: string;
}

/** Quotes one token for the query grammar, preserving literal text. */
export function quoteQueryToken(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Translates the desktop filter state into the core query engine's grammar.
 * The search box is user text, never syntax, so it is always sent as one quoted
 * free-text token. Filters the grammar cannot express stay additive options.
 */
export function buildWorkspaceQuery(input: WorkspaceQueryInput): WorkspaceQuery {
  const tokens: string[] = [];
  const search = input.search.trim();
  if (search) tokens.push(quoteQueryToken(search));

  if (input.activeFolderId === UNTAGGED_FOLDER_ID) {
    tokens.push("is:untagged");
  } else if (input.activeFolderId === UNCATEGORIZED_FOLDER_ID) {
    tokens.push("is:uncategorized");
  } else if (
    input.activeFolderId &&
    input.activeFolderId !== TRASH_FOLDER_ID &&
    input.activeFolderId !== HISTORY_FOLDER_ID
  ) {
    if (input.includeSubfolders && input.activeFolderMatchSet) {
      // OR over the folder tree is a desktop-only scope, not grammar.
    } else {
      tokens.push(`folder:${quoteQueryToken(input.activeFolderId)}`);
    }
  }

  if (input.tagsSidebarOpen) {
    tokens.push(
      input.activeTag ? `tag:${quoteQueryToken(input.activeTag)}` : "has:tag"
    );
  }

  if (input.category !== "all") {
    tokens.push(`type:${quoteQueryToken(input.category)}`);
  }

  if (input.folderFilter) {
    tokens.push(
      input.folderFilter === UNCATEGORIZED_FOLDER_FILTER
        ? "folder:none"
        : `folder:${quoteQueryToken(input.folderFilter)}`
    );
  }

  if (input.orientation !== "all") {
    tokens.push(`orientation:${input.orientation}`);
  }
  if (input.color) {
    tokens.push(`color:${quoteQueryToken(input.color)}`);
  }
  if (input.size !== "all") {
    tokens.push(`size:${input.size}`);
  }
  if (input.hasUrl !== "all") {
    tokens.push(input.hasUrl === "has" ? "has:url" : "no:url");
  }
  if (input.hasNote !== "all") {
    tokens.push(input.hasNote === "has" ? "has:note" : "no:note");
  }

  let onlyUnrated = false;
  if (input.rating !== null && input.rating !== undefined) {
    if (input.rating === 0) {
      onlyUnrated = true;
    } else {
      tokens.push(`rating:${input.rating}`);
    }
  }

  const folderScope =
    input.includeSubfolders &&
    input.activeFolderMatchSet &&
    input.activeFolderId &&
    input.activeFolderId !== TRASH_FOLDER_ID &&
    input.activeFolderId !== HISTORY_FOLDER_ID &&
    input.activeFolderId !== UNTAGGED_FOLDER_ID &&
    input.activeFolderId !== UNCATEGORIZED_FOLDER_ID
      ? Array.from(input.activeFolderMatchSet)
      : [];

  const query = tokens.join(" ");
  return {
    query,
    folderScope,
    onlyUnrated,
    signature: JSON.stringify({ query, folderScope, onlyUnrated }),
  };
}
