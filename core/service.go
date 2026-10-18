package core

import (
	"os"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// Service is the Wails RPC service exposed to the frontend.
type Service struct {
	mgr *LibraryManager
	app *application.App

	// settingsMu guards settings-window creation so rapid calls cannot spawn
	// duplicate windows.
	settingsMu sync.Mutex
}

func NewService(mgr *LibraryManager) *Service {
	return &Service{mgr: mgr}
}

// Internal wiring methods (unexported from RPC)

func (s *Service) SetManager(mgr *LibraryManager) {
	s.mgr = mgr
}

func (s *Service) getApp() *application.App {
	if s.app != nil {
		return s.app
	}
	if s.mgr != nil {
		return s.mgr.GetApp()
	}
	return nil
}

// Exported Wails Service RPC methods

func (s *Service) GetActiveLibrary() (*LibraryInfo, error) {
	if s.mgr == nil {
		return nil, nil
	}
	return s.mgr.GetActiveLibrary(), nil
}

func (s *Service) CreateLibrary(parentDir string, libName string) (*LibraryInfo, error) {
	if s.mgr == nil {
		return nil, ErrCoreNotInitialized
	}
	info, err := s.mgr.CreateLibrary(parentDir, libName)
	if err != nil {
		return nil, WrapAppError(ErrCodeCreateLibDirFailed, err)
	}
	if app := s.getApp(); app != nil {
		app.Event.Emit(LibraryOpenedEvent, info)
	}
	_ = s.CloseSetupWindow()
	return info, nil
}

func (s *Service) OpenLibrary(libraryPath string) (*LibraryInfo, error) {
	if s.mgr == nil {
		return nil, ErrCoreNotInitialized
	}
	info, err := s.mgr.OpenLibrary(libraryPath)
	if err != nil {
		return nil, WrapAppError(ErrCodeInvalidLibDir, err)
	}
	if app := s.getApp(); app != nil {
		app.Event.Emit(LibraryOpenedEvent, info)
	}
	_ = s.CloseSetupWindow()
	return info, nil
}

func (s *Service) CloseLibrary() error {
	if s.mgr == nil {
		return nil
	}
	err := s.mgr.CloseLibrary()
	if err != nil {
		return WrapAppError(ErrCodeCloseLibraryFailed, err)
	}
	if app := s.getApp(); app != nil {
		app.Event.Emit(LibraryClosedEvent, "")
	}
	return nil
}

func (s *Service) GetItems(query string, sortOrder string) ([]Item, error) {
	if s.mgr == nil {
		return []Item{}, nil
	}
	return s.mgr.GetItems(query, sortOrder)
}

func (s *Service) GetItem(id string) (*Item, error) {
	if s.mgr == nil {
		return nil, ErrCoreNotInitialized
	}
	return s.mgr.GetItem(id)
}

func (s *Service) ImportFiles(sourcePaths []string) ([]Item, error) {
	if s.mgr == nil {
		return nil, ErrCoreNotInitialized
	}
	app := s.getApp()
	if app != nil && len(sourcePaths) > 0 {
		app.Event.Emit("import-started", map[string]any{"total": len(sourcePaths)})
	}
	items, err := s.mgr.ImportFilesWithProgress(sourcePaths, func(current, total int, filename string) {
		if app != nil {
			app.Event.Emit("import-progress", map[string]any{
				"current":  current,
				"total":    total,
				"filename": filename,
			})
		}
	})
	if app != nil {
		if err != nil {
			app.Event.Emit("import-error", err.Error())
		} else {
			app.Event.Emit("import-completed", map[string]any{"count": len(items), "items": items})
		}
	}
	return items, err
}

func (s *Service) ImportFromBase64(filename string, base64Data string) (*Item, error) {
	if s.mgr == nil {
		return nil, ErrCoreNotInitialized
	}
	return s.mgr.ImportFromBase64(filename, base64Data)
}

func (s *Service) ImportFromURL(rawURL string) (*Item, error) {
	if s.mgr == nil {
		return nil, ErrCoreNotInitialized
	}
	return s.mgr.ImportFromURL(rawURL)
}

func (s *Service) ImportFromBase64WithOptions(filename string, base64Data string, opts ImportItemOptions) (*Item, error) {
	if s.mgr == nil {
		return nil, ErrCoreNotInitialized
	}
	return s.mgr.ImportFromBase64WithOptions(filename, base64Data, opts)
}

func (s *Service) ImportFromURLWithOptions(rawURL string, opts ImportItemOptions) (*Item, error) {
	if s.mgr == nil {
		return nil, ErrCoreNotInitialized
	}
	return s.mgr.ImportFromURLWithOptions(rawURL, opts)
}

func (s *Service) DeleteItem(id string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.DeleteItem(id)
}

func (s *Service) RevealInFinder(id string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.RevealInFinder(id)
}

func (s *Service) StartDragItems(ids []string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.StartDragItems(ids)
}

// CopyItemsToClipboard writes the selected library items to the native OS
// clipboard as file objects (and image bitmap when a single image is selected)
// so they can be pasted directly into Finder, Explorer, chat apps, or editors.
func (s *Service) CopyItemsToClipboard(ids []string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.CopyItemsToClipboard(ids)
}

// LogDragTrace forwards a frontend drag/drop trace event into the native drag
// trace file. It is deliberately free of side effects so the frontend can fire
// it on every dragstart/dragend/drop without branching.
func (s *Service) LogDragTrace(phase string, detail string) error {
	LogDragTrace(phase, detail)
	return nil
}

func (s *Service) GetAssetServerPort() int {
	if s.mgr == nil {
		return 0
	}
	return s.mgr.GetAssetServerPort()
}

func (s *Service) GetAPIServerPort() int {
	if s.mgr == nil {
		return 0
	}
	return s.mgr.GetAssetServerPort()
}

func (s *Service) SelectDirectory() (string, error) {
	app := s.getApp()
	if app == nil {
		return "", ErrAppNotInitialized
	}
	dialog := app.Dialog.OpenFile().
		CanChooseDirectories(true).
		CanChooseFiles(false).
		CanCreateDirectories(true).
		SetTitle("Choose a directory for the Library")
	return dialog.PromptForSingleSelection()
}

func (s *Service) SelectLibraryDialog() (string, error) {
	app := s.getApp()
	if app == nil {
		return "", ErrAppNotInitialized
	}
	dialog := app.Dialog.OpenFile().
		CanChooseDirectories(true).
		CanChooseFiles(false).
		CanCreateDirectories(false).
		SetTitle("Choose an existing .library folder")
	return dialog.PromptForSingleSelection()
}

func (s *Service) GetRecentLibraries() []string {
	if s.mgr == nil || s.mgr.GetUserDataStore() == nil {
		return []string{}
	}
	return s.mgr.GetUserDataStore().GetRecentLibraries()
}

func (s *Service) GetFolders() ([]Folder, error) {
	if s.mgr == nil {
		return []Folder{}, nil
	}
	return s.mgr.GetFolders()
}

func (s *Service) CreateFolder(name string, parentID string) (*Folder, error) {
	if s.mgr == nil {
		return nil, ErrCoreNotInitialized
	}
	return s.mgr.CreateFolder(name, parentID)
}

func (s *Service) RenameFolder(id string, name string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.RenameFolder(id, name)
}

func (s *Service) DeleteFolder(id string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.DeleteFolder(id)
}

func (s *Service) AddItemToFolder(itemID string, folderID string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.AddItemToFolder(itemID, folderID)
}

func (s *Service) RemoveItemFromFolder(itemID string, folderID string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.RemoveItemFromFolder(itemID, folderID)
}

func (s *Service) SetItemFolders(itemID string, folderIDs []string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.SetItemFolders(itemID, folderIDs)
}

func (s *Service) PermanentDeleteItem(id string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.PermanentDeleteItem(id)
}

func (s *Service) MoveToTrash(id string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.MoveToTrash(id)
}

func (s *Service) BatchMoveToTrash(ids []string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.BatchMoveToTrash(ids)
}

func (s *Service) RestoreFromTrash(id string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.RestoreFromTrash(id)
}

func (s *Service) BatchRestoreFromTrash(ids []string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.BatchRestoreFromTrash(ids)
}

func (s *Service) EmptyTrash() error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.EmptyTrash()
}

func (s *Service) GetTrashItems(query string, sortOrder string) ([]Item, error) {
	if s.mgr == nil {
		return []Item{}, ErrCoreNotInitialized
	}
	return s.mgr.GetTrashItems(query, sortOrder)
}

func (s *Service) GetTrashCount() (int, error) {
	if s.mgr == nil {
		return 0, ErrCoreNotInitialized
	}
	return s.mgr.GetTrashCount()
}

func (s *Service) MoveItemToFolder(itemID string, fromFolderID string, toFolderID string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.MoveItemToFolder(itemID, fromFolderID, toFolderID)
}

func (s *Service) ImportFolderRecursively(dirPath string, parentFolderID string) (*Folder, error) {
	if s.mgr == nil {
		return nil, ErrCoreNotInitialized
	}
	app := s.getApp()
	if app != nil {
		app.Event.Emit("import-started", map[string]any{"total": 1})
	}
	folder, err := s.mgr.ImportFolderRecursivelyWithProgress(dirPath, parentFolderID, func(current, total int, filename string) {
		if app != nil {
			app.Event.Emit("import-progress", map[string]any{
				"current":  current,
				"total":    total,
				"filename": filename,
			})
		}
	})
	if app != nil {
		if err != nil {
			app.Event.Emit("import-error", err.Error())
		} else {
			app.Event.Emit("import-completed", map[string]any{"count": 1})
		}
	}
	return folder, err
}

func (s *Service) ImportFoldersRecursively(dirPaths []string, parentFolderID string) ([]Folder, error) {
	if s.mgr == nil {
		return []Folder{}, ErrCoreNotInitialized
	}
	app := s.getApp()
	if app != nil && len(dirPaths) > 0 {
		app.Event.Emit("import-started", map[string]any{"total": len(dirPaths)})
	}
	folders, err := s.mgr.ImportFoldersRecursivelyWithProgress(dirPaths, parentFolderID, func(current, total int, filename string) {
		if app != nil {
			app.Event.Emit("import-progress", map[string]any{
				"current":  current,
				"total":    total,
				"filename": filename,
			})
		}
	})
	if app != nil {
		if err != nil {
			app.Event.Emit("import-error", err.Error())
		} else {
			app.Event.Emit("import-completed", map[string]any{"count": len(folders)})
		}
	}
	return folders, err
}

func (s *Service) GetTags() ([]Tag, error) {
	if s.mgr == nil {
		return []Tag{}, ErrCoreNotInitialized
	}
	return s.mgr.GetTags()
}

func (s *Service) CreateTag(name string) (*Tag, error) {
	if s.mgr == nil {
		return nil, ErrCoreNotInitialized
	}
	return s.mgr.CreateTag(name)
}

func (s *Service) DeleteTag(name string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.DeleteTag(name)
}

func (s *Service) AddTagToItem(itemID string, tag string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.AddTagToItem(itemID, tag)
}

func (s *Service) RemoveTagFromItem(itemID string, tag string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.RemoveTagFromItem(itemID, tag)
}

func (s *Service) SetItemTags(itemID string, tags []string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.SetItemTags(itemID, tags)
}

func (s *Service) ToggleFavorite(itemID string) (bool, error) {
	if s.mgr == nil {
		return false, ErrCoreNotInitialized
	}
	return s.mgr.ToggleFavorite(itemID)
}

func (s *Service) RenameItem(id string, newName string) (*Item, error) {
	if s.mgr == nil {
		return nil, ErrCoreNotInitialized
	}
	return s.mgr.RenameItem(id, newName)
}

func (s *Service) OpenWithDefaultApp(id string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.OpenWithDefaultApp(id)
}

func (s *Service) SaveItemThumbnail(itemID string, base64Data string, videoWidth int, videoHeight int) (*Item, error) {
	if s.mgr == nil {
		return nil, ErrCoreNotInitialized
	}
	return s.mgr.SaveItemThumbnail(itemID, base64Data, videoWidth, videoHeight)
}

func (s *Service) UpdateItemDetails(id string, note string, rawURL string, rating int, prompt string) (*Item, error) {
	if s.mgr == nil {
		return nil, ErrCoreNotInitialized
	}
	return s.mgr.UpdateItemDetails(id, note, rawURL, rating, prompt)
}

func (s *Service) OpenExternalURL(rawURL string) error {
	return OpenExternalURL(rawURL)
}

// Plugin Management RPC Methods

// ListInstalledPlugins returns all plugins installed in the user data directory.
func (s *Service) ListInstalledPlugins() ([]InstalledPlugin, error) {
	if s.mgr == nil || s.mgr.GetPluginManager() == nil {
		return []InstalledPlugin{}, nil
	}
	return s.mgr.GetPluginManager().ListInstalledPlugins()
}

// InstallPluginFromURL downloads, extracts, and installs a plugin from a manifest or zip bundle URL.
func (s *Service) InstallPluginFromURL(pluginURL string) (*InstalledPlugin, error) {
	if s.mgr == nil || s.mgr.GetPluginManager() == nil {
		return nil, ErrCoreNotInitialized
	}
	return s.mgr.GetPluginManager().InstallPluginFromURL(pluginURL)
}

// InstallPlugin is an alias for InstallPluginFromURL.
func (s *Service) InstallPlugin(manifestURL string) (*InstalledPlugin, error) {
	return s.InstallPluginFromURL(manifestURL)
}

// UninstallPlugin removes the specified plugin directory and unregisters it.
func (s *Service) UninstallPlugin(id string) error {
	if s.mgr == nil || s.mgr.GetPluginManager() == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.GetPluginManager().UninstallPlugin(id)
}

// SetPluginEnabled enables or disables the specified plugin.
func (s *Service) SetPluginEnabled(id string, enabled bool) error {
	if s.mgr == nil || s.mgr.GetPluginManager() == nil {
		return ErrCoreNotInitialized
	}
	return s.mgr.GetPluginManager().SetPluginEnabled(id, enabled)
}

// OpenMarketplace opens the Bowerbird Plugin Marketplace in the default browser.
func (s *Service) OpenMarketplace() error {
	targetURL := os.Getenv("BOWERBIRD_MARKETPLACE_URL")
	if targetURL == "" {
		targetURL = "http://localhost:3000"
	}
	return OpenExternalURL(targetURL)
}
