/**
 * Agreed Error and Success Codes between Go Backend and Browser Extension.
 */

export const ErrorCodes = {
  CORE_NOT_INITIALIZED: "ERR_CORE_NOT_INITIALIZED",
  APP_NOT_INITIALIZED: "ERR_APP_NOT_INITIALIZED",
  NO_ACTIVE_LIBRARY: "ERR_NO_ACTIVE_LIBRARY",
  UNKNOWN: "ERR_UNKNOWN",
  INVALID_REQUEST: "ERR_INVALID_REQUEST",
  METHOD_NOT_ALLOWED: "ERR_METHOD_NOT_ALLOWED",

  PARENT_DIR_REQUIRED: "ERR_PARENT_DIR_REQUIRED",
  LIB_NAME_REQUIRED: "ERR_LIB_NAME_REQUIRED",
  CREATE_LIB_DIR_FAILED: "ERR_CREATE_LIB_DIR_FAILED",
  INIT_DB_FAILED: "ERR_INIT_DB_FAILED",
  WRITE_METADATA_FAILED: "ERR_WRITE_METADATA_FAILED",
  INVALID_LIB_DIR: "ERR_INVALID_LIB_DIR",
  CORRUPTED_METADATA: "ERR_CORRUPTED_METADATA",
  OPEN_DB_FAILED: "ERR_OPEN_DB_FAILED",
  MIGRATION_FAILED: "ERR_MIGRATION_FAILED",
  CLOSE_LIBRARY_FAILED: "ERR_CLOSE_LIBRARY_FAILED",

  ITEM_NOT_FOUND: "ERR_ITEM_NOT_FOUND",
  DELETE_ITEM_FAILED: "ERR_DELETE_ITEM_FAILED",
  REVEAL_FAILED: "ERR_REVEAL_FAILED",
  QUERY_ITEMS_FAILED: "ERR_QUERY_ITEMS_FAILED",

  FOLDER_NOT_FOUND: "ERR_FOLDER_NOT_FOUND",
  FOLDER_NAME_EMPTY: "ERR_FOLDER_NAME_EMPTY",
  CREATE_FOLDER_FAILED: "ERR_CREATE_FOLDER_FAILED",
  RENAME_FOLDER_FAILED: "ERR_RENAME_FOLDER_FAILED",
  DELETE_FOLDER_FAILED: "ERR_DELETE_FOLDER_FAILED",
  ADD_ITEM_TO_FOLDER_FAILED: "ERR_ADD_ITEM_TO_FOLDER_FAILED",
  REMOVE_ITEM_FROM_FOLDER_FAILED: "ERR_REMOVE_ITEM_FROM_FOLDER_FAILED",
  SET_ITEM_FOLDERS_FAILED: "ERR_SET_ITEM_FOLDERS_FAILED",

  INVALID_URL: "ERR_INVALID_URL",
  FETCH_REMOTE_FAILED: "ERR_FETCH_REMOTE_FAILED",
  INVALID_BASE64: "ERR_INVALID_BASE64",
  COPY_FILE_FAILED: "ERR_COPY_FILE_FAILED",
  IMPORT_FAILED: "ERR_IMPORT_FAILED",
  NO_VALID_FILES: "ERR_NO_VALID_FILES",

  NO_ITEMS: "ERR_NO_ITEMS",
  NATIVE_DRAG_FAILED: "ERR_NATIVE_DRAG_FAILED",
  COPY_TO_CLIPBOARD_FAILED: "ERR_COPY_TO_CLIPBOARD_FAILED",

  INVALID_THEME: "ERR_INVALID_THEME",
  INVALID_LANGUAGE: "ERR_INVALID_LANGUAGE",
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes] | string;

export const SuccessCodes = {
  OK: "SUCCESS_OK",
  COPIED_TO_CLIPBOARD: "SUCCESS_COPIED_TO_CLIPBOARD",
  PATH_COPIED: "SUCCESS_PATH_COPIED",
  PATHS_COPIED: "SUCCESS_PATHS_COPIED",
  COLOR_COPIED: "SUCCESS_COLOR_COPIED",
  PROMPT_COPIED: "SUCCESS_PROMPT_COPIED",
  COPIED_LOGS: "SUCCESS_COPIED_LOGS",
  EXTENSION_URL_COPIED: "SUCCESS_EXTENSION_URL_COPIED",
  EMPTY_TRASH: "SUCCESS_EMPTY_TRASH",
  MOVED_TO_TRASH: "SUCCESS_MOVED_TO_TRASH",
  RESTORED_FROM_TRASH: "SUCCESS_RESTORED_FROM_TRASH",
  FAVORITE_ADDED: "SUCCESS_FAVORITE_ADDED",
  FAVORITE_REMOVED: "SUCCESS_FAVORITE_REMOVED",
  FOLDER_CREATED: "SUCCESS_FOLDER_CREATED",
  FOLDER_DELETED: "SUCCESS_FOLDER_DELETED",
  FOLDER_RENAMED: "SUCCESS_FOLDER_RENAMED",
  ITEM_MOVED: "SUCCESS_ITEM_MOVED",
  ITEMS_IMPORTED: "SUCCESS_ITEMS_IMPORTED",
  BOOKMARK_SAVED: "SUCCESS_BOOKMARK_SAVED",
  SCREENSHOT_SAVED: "SUCCESS_SCREENSHOT_SAVED",
  SETTINGS_SAVED: "SUCCESS_SETTINGS_SAVED",
  LIBRARY_CREATED: "SUCCESS_LIBRARY_CREATED",
  LIBRARY_OPENED: "SUCCESS_LIBRARY_OPENED",
} as const;

export type SuccessCode = typeof SuccessCodes[keyof typeof SuccessCodes] | string;

export interface ParsedError {
  code: string;
  message?: string;
}

export function parseApiError(err: unknown): ParsedError {
  if (!err) {
    return { code: ErrorCodes.UNKNOWN };
  }
  if (typeof err === "object" && err !== null && "code" in err && typeof (err as any).code === "string") {
    return { code: (err as any).code, message: (err as any).message || (err as any).error };
  }
  const raw = typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.code === "string") {
      return { code: parsed.code, message: parsed.message || parsed.error };
    }
  } catch {}

  const match = raw.match(/\[?([A-Z0-9_]{3,})\]?(?::|\s)(.*)/);
  if (match) {
    return { code: match[1], message: match[2]?.trim() };
  }

  if (/^[A-Z0-9_]+$/.test(raw.trim())) {
    return { code: raw.trim() };
  }

  if (raw.includes("no active library")) return { code: ErrorCodes.NO_ACTIVE_LIBRARY, message: raw };
  if (raw.includes("item not found")) return { code: ErrorCodes.ITEM_NOT_FOUND, message: raw };
  if (raw.includes("Failed to fetch") || raw.includes("NetworkError")) return { code: ErrorCodes.FETCH_REMOTE_FAILED, message: raw };

  return { code: ErrorCodes.UNKNOWN, message: raw };
}
