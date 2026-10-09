package core

import (
	"errors"
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
		return nil, errors.New("core manager not initialized")
	}
	return s.mgr.CreateLibrary(parentDir, libName)
}

func (s *Service) OpenLibrary(libraryPath string) (*LibraryInfo, error) {
	if s.mgr == nil {
		return nil, errors.New("core manager not initialized")
	}
	return s.mgr.OpenLibrary(libraryPath)
}

func (s *Service) CloseLibrary() error {
	if s.mgr == nil {
		return nil
	}
	return s.mgr.CloseLibrary()
}

func (s *Service) GetItems(query string, sortOrder string) ([]Item, error) {
	if s.mgr == nil {
		return []Item{}, nil
	}
	return s.mgr.GetItems(query, sortOrder)
}

func (s *Service) GetItem(id string) (*Item, error) {
	if s.mgr == nil {
		return nil, errors.New("core manager not initialized")
	}
	return s.mgr.GetItem(id)
}

func (s *Service) ImportFiles(sourcePaths []string) ([]Item, error) {
	if s.mgr == nil {
		return nil, errors.New("core manager not initialized")
	}
	return s.mgr.ImportFiles(sourcePaths)
}

func (s *Service) ImportFromBase64(filename string, base64Data string) (*Item, error) {
	if s.mgr == nil {
		return nil, errors.New("core manager not initialized")
	}
	return s.mgr.ImportFromBase64(filename, base64Data)
}

func (s *Service) ImportFromURL(rawURL string) (*Item, error) {
	if s.mgr == nil {
		return nil, errors.New("core manager not initialized")
	}
	return s.mgr.ImportFromURL(rawURL)
}

func (s *Service) DeleteItem(id string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.DeleteItem(id)
}

func (s *Service) RevealInFinder(id string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.RevealInFinder(id)
}

func (s *Service) StartDrag(id string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.StartDrag(id)
}

func (s *Service) GetAssetServerPort() int {
	if s.mgr == nil {
		return 0
	}
	return s.mgr.GetAssetServerPort()
}

func (s *Service) SelectDirectory() (string, error) {
	app := s.getApp()
	if app == nil {
		return "", errors.New("application not initialized")
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
		return "", errors.New("application not initialized")
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
		return nil, errors.New("core manager not initialized")
	}
	return s.mgr.CreateFolder(name, parentID)
}

func (s *Service) RenameFolder(id string, name string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.RenameFolder(id, name)
}

func (s *Service) DeleteFolder(id string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.DeleteFolder(id)
}

func (s *Service) AddItemToFolder(itemID string, folderID string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.AddItemToFolder(itemID, folderID)
}

func (s *Service) RemoveItemFromFolder(itemID string, folderID string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.RemoveItemFromFolder(itemID, folderID)
}

func (s *Service) SetItemFolders(itemID string, folderIDs []string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.SetItemFolders(itemID, folderIDs)
}

func (s *Service) PermanentDeleteItem(id string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.PermanentDeleteItem(id)
}

func (s *Service) MoveToTrash(id string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.MoveToTrash(id)
}

func (s *Service) BatchMoveToTrash(ids []string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.BatchMoveToTrash(ids)
}

func (s *Service) RestoreFromTrash(id string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.RestoreFromTrash(id)
}

func (s *Service) BatchRestoreFromTrash(ids []string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.BatchRestoreFromTrash(ids)
}

func (s *Service) EmptyTrash() error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.EmptyTrash()
}

func (s *Service) GetTrashItems(query string, sortOrder string) ([]Item, error) {
	if s.mgr == nil {
		return []Item{}, errors.New("core manager not initialized")
	}
	return s.mgr.GetTrashItems(query, sortOrder)
}

func (s *Service) GetTrashCount() (int, error) {
	if s.mgr == nil {
		return 0, errors.New("core manager not initialized")
	}
	return s.mgr.GetTrashCount()
}

func (s *Service) MoveItemToFolder(itemID string, fromFolderID string, toFolderID string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.MoveItemToFolder(itemID, fromFolderID, toFolderID)
}

func (s *Service) ImportFolderRecursively(dirPath string, parentFolderID string) (*Folder, error) {
	if s.mgr == nil {
		return nil, errors.New("core manager not initialized")
	}
	return s.mgr.ImportFolderRecursively(dirPath, parentFolderID)
}

func (s *Service) ImportFoldersRecursively(dirPaths []string, parentFolderID string) ([]Folder, error) {
	if s.mgr == nil {
		return []Folder{}, errors.New("core manager not initialized")
	}
	return s.mgr.ImportFoldersRecursively(dirPaths, parentFolderID)
}

func (s *Service) GetTags() ([]Tag, error) {
	if s.mgr == nil {
		return []Tag{}, errors.New("core manager not initialized")
	}
	return s.mgr.GetTags()
}

func (s *Service) CreateTag(name string) (*Tag, error) {
	if s.mgr == nil {
		return nil, errors.New("core manager not initialized")
	}
	return s.mgr.CreateTag(name)
}

func (s *Service) DeleteTag(name string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.DeleteTag(name)
}

func (s *Service) AddTagToItem(itemID string, tag string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.AddTagToItem(itemID, tag)
}

func (s *Service) RemoveTagFromItem(itemID string, tag string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.RemoveTagFromItem(itemID, tag)
}

func (s *Service) SetItemTags(itemID string, tags []string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.SetItemTags(itemID, tags)
}

func (s *Service) ToggleFavorite(itemID string) (bool, error) {
	if s.mgr == nil {
		return false, errors.New("core manager not initialized")
	}
	return s.mgr.ToggleFavorite(itemID)
}

func (s *Service) RenameItem(id string, newName string) (*Item, error) {
	if s.mgr == nil {
		return nil, errors.New("core manager not initialized")
	}
	return s.mgr.RenameItem(id, newName)
}

func (s *Service) OpenWithDefaultApp(id string) error {
	if s.mgr == nil {
		return errors.New("core manager not initialized")
	}
	return s.mgr.OpenWithDefaultApp(id)
}
