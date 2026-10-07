package core

import (
	"errors"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// Service is the Wails RPC service exposed to the frontend.
type Service struct {
	mgr *LibraryManager
	app *application.App
}

func NewService(mgr *LibraryManager) *Service {
	return &Service{mgr: mgr}
}

// Internal wiring methods (unexported from RPC)

func (s *Service) SetManager(mgr *LibraryManager) {
	s.mgr = mgr
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
	if s.app == nil {
		return "", errors.New("application not initialized")
	}
	dialog := s.app.Dialog.OpenFile().
		CanChooseDirectories(true).
		CanChooseFiles(false).
		CanCreateDirectories(true).
		SetTitle("选择 Library 存储目录")
	return dialog.PromptForSingleSelection()
}

func (s *Service) SelectLibraryDialog() (string, error) {
	if s.app == nil {
		return "", errors.New("application not initialized")
	}
	dialog := s.app.Dialog.OpenFile().
		CanChooseDirectories(true).
		CanChooseFiles(false).
		CanCreateDirectories(false).
		SetTitle("选择现有的 .library 文件夹")
	return dialog.PromptForSingleSelection()
}

func (s *Service) GetRecentLibraries() []string {
	if s.mgr == nil || s.mgr.GetUserDataStore() == nil {
		return []string{}
	}
	return s.mgr.GetUserDataStore().GetRecentLibraries()
}
