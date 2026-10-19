package core

import (
	"encoding/json"
	"fmt"
)

// Standard Error Codes agreed between Go backend and frontend
const (
	ErrCodeCoreNotInitialized         = "ERR_CORE_NOT_INITIALIZED"
	ErrCodeAppNotInitialized          = "ERR_APP_NOT_INITIALIZED"
	ErrCodeNoActiveLibrary            = "ERR_NO_ACTIVE_LIBRARY"
	ErrCodeUnknown                    = "ERR_UNKNOWN"
	ErrCodeInvalidRequest             = "ERR_INVALID_REQUEST"
	ErrCodeMethodNotAllowed           = "ERR_METHOD_NOT_ALLOWED"

	ErrCodeParentDirRequired          = "ERR_PARENT_DIR_REQUIRED"
	ErrCodeLibNameRequired            = "ERR_LIB_NAME_REQUIRED"
	ErrCodeCreateLibDirFailed         = "ERR_CREATE_LIB_DIR_FAILED"
	ErrCodeInitDBFailed               = "ERR_INIT_DB_FAILED"
	ErrCodeWriteMetadataFailed        = "ERR_WRITE_METADATA_FAILED"
	ErrCodeInvalidLibDir              = "ERR_INVALID_LIB_DIR"
	ErrCodeCorruptedMetadata          = "ERR_CORRUPTED_METADATA"
	ErrCodeOpenDBFailed               = "ERR_OPEN_DB_FAILED"
	ErrCodeMigrationFailed            = "ERR_MIGRATION_FAILED"
	ErrCodeCloseLibraryFailed         = "ERR_CLOSE_LIBRARY_FAILED"

	ErrCodeItemNotFound               = "ERR_ITEM_NOT_FOUND"
	ErrCodeDeleteItemFailed           = "ERR_DELETE_ITEM_FAILED"
	ErrCodeRevealFailed               = "ERR_REVEAL_FAILED"
	ErrCodeQueryItemsFailed           = "ERR_QUERY_ITEMS_FAILED"

	ErrCodeFolderNotFound             = "ERR_FOLDER_NOT_FOUND"
	ErrCodeFolderNameEmpty            = "ERR_FOLDER_NAME_EMPTY"
	ErrCodeCreateFolderFailed         = "ERR_CREATE_FOLDER_FAILED"
	ErrCodeRenameFolderFailed         = "ERR_RENAME_FOLDER_FAILED"
	ErrCodeDeleteFolderFailed         = "ERR_DELETE_FOLDER_FAILED"
	ErrCodeAddItemToFolderFailed      = "ERR_ADD_ITEM_TO_FOLDER_FAILED"
	ErrCodeRemoveItemFromFolderFailed = "ERR_REMOVE_ITEM_FROM_FOLDER_FAILED"
	ErrCodeSetItemFoldersFailed       = "ERR_SET_ITEM_FOLDERS_FAILED"

	ErrCodeInvalidURL                 = "ERR_INVALID_URL"
	ErrCodeFetchRemoteFailed          = "ERR_FETCH_REMOTE_FAILED"
	ErrCodeInvalidBase64              = "ERR_INVALID_BASE64"
	ErrCodeCopyFileFailed             = "ERR_COPY_FILE_FAILED"
	ErrCodeImportFailed               = "ERR_IMPORT_FAILED"
	ErrCodeNoValidFiles               = "ERR_NO_VALID_FILES"

	ErrCodeNoItems                    = "ERR_NO_ITEMS"
	ErrCodeNativeDragFailed           = "ERR_NATIVE_DRAG_FAILED"
	ErrCodeCopyToClipboardFailed      = "ERR_COPY_TO_CLIPBOARD_FAILED"

	ErrCodeInvalidTheme               = "ERR_INVALID_THEME"
	ErrCodeInvalidLanguage            = "ERR_INVALID_LANGUAGE"

	ErrCodePluginNotFound             = "ERR_PLUGIN_NOT_FOUND"
	ErrCodeInvalidManifest            = "ERR_INVALID_MANIFEST"
	ErrCodePluginInstallFailed        = "ERR_PLUGIN_INSTALL_FAILED"
	ErrCodeStoreNotConfigured         = "ERR_STORE_NOT_CONFIGURED"
)

// Standard Success Codes agreed between Go backend and frontend
const (
	SuccessCodeOK                     = "SUCCESS_OK"
	SuccessCodeCopiedToClipboard      = "SUCCESS_COPIED_TO_CLIPBOARD"
	SuccessCodePathCopied             = "SUCCESS_PATH_COPIED"
	SuccessCodePathsCopied            = "SUCCESS_PATHS_COPIED"
	SuccessCodeColorCopied            = "SUCCESS_COLOR_COPIED"
	SuccessCodePromptCopied           = "SUCCESS_PROMPT_COPIED"
	SuccessCodeCopiedLogs             = "SUCCESS_COPIED_LOGS"
	SuccessCodeExtensionURLCopied     = "SUCCESS_EXTENSION_URL_COPIED"
	SuccessCodeEmptyTrash             = "SUCCESS_EMPTY_TRASH"
	SuccessCodeMovedToTrash           = "SUCCESS_MOVED_TO_TRASH"
	SuccessCodeRestoredFromTrash      = "SUCCESS_RESTORED_FROM_TRASH"
	SuccessCodeFavoriteAdded          = "SUCCESS_FAVORITE_ADDED"
	SuccessCodeFavoriteRemoved        = "SUCCESS_FAVORITE_REMOVED"
	SuccessCodeFolderCreated          = "SUCCESS_FOLDER_CREATED"
	SuccessCodeFolderDeleted          = "SUCCESS_FOLDER_DELETED"
	SuccessCodeFolderRenamed          = "SUCCESS_FOLDER_RENAMED"
	SuccessCodeItemMoved              = "SUCCESS_ITEM_MOVED"
	SuccessCodeItemsImported          = "SUCCESS_ITEMS_IMPORTED"
	SuccessCodeBookmarkSaved          = "SUCCESS_BOOKMARK_SAVED"
	SuccessCodeScreenshotSaved        = "SUCCESS_SCREENSHOT_SAVED"
	SuccessCodeSettingsSaved          = "SUCCESS_SETTINGS_SAVED"
	SuccessCodeLibraryCreated         = "SUCCESS_LIBRARY_CREATED"
	SuccessCodeLibraryOpened          = "SUCCESS_LIBRARY_OPENED"
)

// Predefined AppError sentinels
var (
	ErrCoreNotInitialized  = NewAppError(ErrCodeCoreNotInitialized, "core manager not initialized")
	ErrAppNotInitialized   = NewAppError(ErrCodeAppNotInitialized, "application not initialized")
	ErrNoActiveLibrary     = NewAppError(ErrCodeNoActiveLibrary, "no active library")
	ErrUnknown             = NewAppError(ErrCodeUnknown, "unknown error")
	ErrInvalidRequest      = NewAppError(ErrCodeInvalidRequest, "invalid request body")
	ErrMethodNotAllowed    = NewAppError(ErrCodeMethodNotAllowed, "method not allowed")
	ErrParentDirRequired   = NewAppError(ErrCodeParentDirRequired, "parent directory is required")
	ErrLibNameRequired     = NewAppError(ErrCodeLibNameRequired, "library name is required")
	ErrItemNotFound        = NewAppError(ErrCodeItemNotFound, "item not found")
	ErrFolderNameEmpty     = NewAppError(ErrCodeFolderNameEmpty, "folder name cannot be empty")
	ErrFolderNotFound      = NewAppError(ErrCodeFolderNotFound, "folder not found")
	ErrNoItems             = NewAppError(ErrCodeNoItems, "no items")
	ErrNoValidFiles        = NewAppError(ErrCodeNoValidFiles, "no valid files")
	ErrInvalidURL          = NewAppError(ErrCodeInvalidURL, "invalid or unsupported URL")
	ErrInvalidBase64       = NewAppError(ErrCodeInvalidBase64, "invalid base64 payload")
	ErrStoreNotConfigured  = NewAppError(ErrCodeStoreNotConfigured, "plugin store is not configured for this build")
)

// AppError is the structured error type containing an agreed Code and detailed Message.
type AppError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *AppError) Error() string {
	b, err := json.Marshal(e)
	if err != nil {
		return fmt.Sprintf(`{"code":"%s","message":"%s"}`, e.Code, e.Message)
	}
	return string(b)
}

func NewAppError(code string, message string) *AppError {
	return &AppError{Code: code, Message: message}
}

func WrapAppError(code string, err error) *AppError {
	if err == nil {
		return nil
	}
	if appErr, ok := err.(*AppError); ok {
		return appErr
	}
	return &AppError{Code: code, Message: err.Error()}
}
