package core

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// Service is the RPC surface exposed to the frontend.
type Service struct {
	mgr  *LibraryManager
	host Host

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
	if mgr != nil && s.host == nil {
		s.host = mgr.Host()
	}
}

// getHost returns the desktop shell attached to the service.
func (s *Service) getHost() Host {
	if s.host != nil {
		return s.host
	}
	if s.mgr != nil {
		return s.mgr.Host()
	}
	return nil
}

// emit forwards an event to the host when one is attached.
func (s *Service) emit(name string, payload any) {
	if h := s.getHost(); h != nil {
		h.Emit(name, payload)
	}
}

// Exported RPC methods

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
	s.emit(LibraryOpenedEvent, info)
	_ = s.CloseSetupWindow()
	s.openMainWindow()
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
	s.emit(LibraryOpenedEvent, info)
	_ = s.CloseSetupWindow()
	s.openMainWindow()
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
	s.emit(LibraryClosedEvent, "")
	// The main window goes away with the library. Only the setup window stays,
	// and picking a library there creates a fresh main window.
	if h := s.getHost(); h != nil {
		h.CloseMainWindow()
	}
	_ = s.OpenSetupWindow()
	return nil
}

// openMainWindow brings the main window back after a library is chosen.
func (s *Service) openMainWindow() {
	if h := s.getHost(); h != nil {
		h.OpenMainWindow()
	}
}

func (s *Service) GetItems(query string, sortOrder string) ([]Item, error) {
	if s.mgr == nil {
		return []Item{}, nil
	}
	return s.mgr.GetItems(query, sortOrder)
}

// QueryWorkspace runs one paginated desktop query through the shared engine.
// folderScope/onlyUnrated are desktop-only additive filters; the query grammar
// itself is unchanged.
func (s *Service) QueryWorkspace(query string, sortOrder string, offset int, limit int, folderScope []string, onlyUnrated bool) (*QueryPage, error) {
	if s.mgr == nil {
		return &QueryPage{Items: []Item{}}, nil
	}
	spec, err := ParseQuery(query)
	if err != nil {
		return nil, err
	}
	page, err := s.mgr.QueryPage(spec, sortOrder, offset, limit, folderScope, onlyUnrated)
	if err != nil {
		return nil, err
	}
	return &page, nil
}

func (s *Service) GetWorkspaceStats(sortOrder string) (*WorkspaceStats, error) {
	if s.mgr == nil {
		return &WorkspaceStats{TopColors: []string{}}, nil
	}
	stats, err := s.mgr.WorkspaceStats(sortOrder)
	if err != nil {
		return nil, err
	}
	return &stats, nil
}

func (s *Service) GetFolderPreviews(folderGroups [][]string, sortOrder string) ([]FolderPreview, error) {
	if s.mgr == nil {
		return []FolderPreview{}, nil
	}
	return s.mgr.FolderPreviews(folderGroups, sortOrder)
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
	if len(sourcePaths) > 0 {
		s.emit("import-started", map[string]any{"total": len(sourcePaths)})
	}
	items, err := s.mgr.ImportFilesWithProgress(sourcePaths, func(current, total int, filename string) {
		s.emit("import-progress", map[string]any{
			"current":  current,
			"total":    total,
			"filename": filename,
		})
	})
	if err != nil {
		s.emit("import-error", err.Error())
	} else {
		s.emit("import-completed", map[string]any{"count": len(items), "items": items})
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
	host := s.getHost()
	if host == nil {
		return "", ErrAppNotInitialized
	}
	return host.OpenDirectory("Choose a directory for the Library")
}

func (s *Service) SelectLibraryDialog() (string, error) {
	host := s.getHost()
	if host == nil {
		return "", ErrAppNotInitialized
	}
	return host.OpenDirectory("Choose an existing .library folder")
}

func (s *Service) GetRecentLibraries() []string {
	if s.mgr == nil || s.mgr.GetUserDataStore() == nil {
		return []string{}
	}
	return s.mgr.GetUserDataStore().GetRecentLibraries()
}

// LibraryRef identifies a library on disk without opening it.
//
// ID comes from that library's own library.json, so it stays stable even if the
// folder is moved or renamed; Path is only how the app addresses it right now.
// The sidebar keeps its ordering against ID so moving a library can never make
// the order (or, worse, the data) belong to a different library.
type LibraryRef struct {
	ID   string `json:"id"`
	Path string `json:"path"`
}

// GetRecentLibraryRefs returns the recent libraries with their stable IDs.
// Entries whose library.json is missing or unreadable are skipped.
func (s *Service) GetRecentLibraryRefs() []LibraryRef {
	if s.mgr == nil || s.mgr.GetUserDataStore() == nil {
		return []LibraryRef{}
	}

	paths := s.mgr.GetUserDataStore().GetRecentLibraries()
	refs := make([]LibraryRef, 0, len(paths))
	for _, p := range paths {
		data, err := os.ReadFile(filepath.Join(p, "library.json"))
		if err != nil {
			continue
		}
		var meta struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(data, &meta); err != nil || meta.ID == "" {
			continue
		}
		refs = append(refs, LibraryRef{ID: meta.ID, Path: p})
	}
	return refs
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
	s.emit("import-started", map[string]any{"total": 1})
	folder, err := s.mgr.ImportFolderRecursivelyWithProgress(dirPath, parentFolderID, func(current, total int, filename string) {
		s.emit("import-progress", map[string]any{
			"current":  current,
			"total":    total,
			"filename": filename,
		})
	})
	if err != nil {
		s.emit("import-error", err.Error())
	} else {
		s.emit("import-completed", map[string]any{"count": 1})
	}
	return folder, err
}

func (s *Service) ImportFoldersRecursively(dirPaths []string, parentFolderID string) ([]Folder, error) {
	if s.mgr == nil {
		return []Folder{}, ErrCoreNotInitialized
	}
	if len(dirPaths) > 0 {
		s.emit("import-started", map[string]any{"total": len(dirPaths)})
	}
	folders, err := s.mgr.ImportFoldersRecursivelyWithProgress(dirPaths, parentFolderID, func(current, total int, filename string) {
		s.emit("import-progress", map[string]any{
			"current":  current,
			"total":    total,
			"filename": filename,
		})
	})
	if err != nil {
		s.emit("import-error", err.Error())
	} else {
		s.emit("import-completed", map[string]any{"count": len(folders)})
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

// ScanLocalPlugins scans the plugins directory for manually placed plugin folders,
// validates manifests, registers newly discovered plugins as disabled by default,
// and updates installed.json.
func (s *Service) ScanLocalPlugins() ([]InstalledPlugin, error) {
	if s.mgr == nil || s.mgr.GetPluginManager() == nil {
		return []InstalledPlugin{}, nil
	}
	return s.mgr.GetPluginManager().ScanLocalPlugins()
}

// GetPendingPluginInstall returns any pending plugin installation request.
func (s *Service) GetPendingPluginInstall() *PluginInstallRequest {
	if s.mgr == nil || s.mgr.GetPluginManager() == nil {
		return nil
	}
	return s.mgr.GetPluginManager().GetPendingInstall()
}

// ClearPendingPluginInstall clears the current pending installation request.
func (s *Service) ClearPendingPluginInstall() error {
	if s.mgr == nil || s.mgr.GetPluginManager() == nil {
		return nil
	}
	s.mgr.GetPluginManager().ClearPendingInstall()
	return nil
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

// CheckPluginUpdates groups installed plugins by marketplace origin, queries in batch, and returns available updates.
func (s *Service) CheckPluginUpdates() ([]PluginUpdateInfo, error) {
	if s.mgr == nil || s.mgr.GetPluginManager() == nil {
		return []PluginUpdateInfo{}, nil
	}
	return s.mgr.GetPluginManager().CheckPluginUpdates()
}

// UpgradePlugin upgrades the specified plugin from its remembered update/source URL.
func (s *Service) UpgradePlugin(id string) (*InstalledPlugin, error) {
	if s.mgr == nil || s.mgr.GetPluginManager() == nil {
		return nil, ErrCoreNotInitialized
	}
	return s.mgr.GetPluginManager().UpgradePlugin(id)
}

// OpenMarketplace opens the Bowerbird Plugin Marketplace in the default browser.
func (s *Service) OpenMarketplace() error {
	targetURL := os.Getenv("BOWERBIRD_MARKETPLACE_URL")
	if targetURL == "" {
		targetURL = "http://localhost:3000"
	}
	return OpenExternalURL(targetURL)
}

// GetUserDataDir returns the absolute path of the Bowerbird user data directory.
func (s *Service) GetUserDataDir() string {
	return UserDataDir()
}

// GetPluginsDir returns the absolute path of the installed plugins directory.
func (s *Service) GetPluginsDir() string {
	if s.mgr != nil && s.mgr.GetPluginManager() != nil {
		return s.mgr.GetPluginManager().GetBaseDir()
	}
	return filepath.Join(UserDataDir(), "plugins")
}

// OpenFolder opens a directory in macOS Finder, Windows Explorer, or Linux file manager.
func (s *Service) OpenFolder(targetPath string) error {
	trimmed := strings.TrimSpace(targetPath)
	if trimmed == "" {
		return errors.New("path cannot be empty")
	}
	_ = os.MkdirAll(trimmed, 0755)
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", trimmed).Start()
	case "windows":
		return exec.Command("explorer.exe", trimmed).Start()
	default:
		return exec.Command("xdg-open", trimmed).Start()
	}
}

// OpenUserDataFolder opens the application data directory in the native file manager.
func (s *Service) OpenUserDataFolder() error {
	return s.OpenFolder(s.GetUserDataDir())
}

// OpenPluginsFolder opens the plugins directory in the native file manager.
func (s *Service) OpenPluginsFolder() error {
	return s.OpenFolder(s.GetPluginsDir())
}

// GetNetworkSettings returns the persisted network/proxy configuration.
func (s *Service) GetNetworkSettings() NetworkSettings {
	if s.mgr == nil {
		return NetworkSettings{ProxyMode: ProxyModeSystem}
	}
	return s.mgr.GetNetworkSettings()
}

// SetNetworkSettings validates, persists, and applies network/proxy configuration.
func (s *Service) SetNetworkSettings(settings NetworkSettings) error {
	mode := strings.ToLower(strings.TrimSpace(settings.ProxyMode))
	if mode == "" {
		mode = ProxyModeSystem
	}
	if !IsValidProxyMode(mode) {
		return fmt.Errorf("invalid proxy mode: %s", settings.ProxyMode)
	}
	settings.ProxyMode = mode

	if mode == ProxyModeCustom {
		norm, err := NormalizeProxyURL(settings.CustomProxy)
		if err != nil {
			return err
		}
		settings.CustomProxy = norm
	}

	if s.mgr != nil {
		if err := s.mgr.SetNetworkSettings(settings); err != nil {
			return err
		}
	}

	RecordLog("info", "network", fmt.Sprintf("Network settings updated: mode=%s, customProxy=%s", settings.ProxyMode, settings.CustomProxy), "", 0)

	s.emit(NetworkSettingsChangedEvent, settings)
	return nil
}

func (s *Service) GetShortcutSettings() ShortcutSettings {
	if s.mgr == nil {
		return DefaultShortcutSettings()
	}
	return s.mgr.GetShortcutSettings()
}

func (s *Service) SetShortcutSettings(settings ShortcutSettings) error {
	norm := NormalizeShortcutSettings(settings)
	if err := ValidateShortcutSettings(norm); err != nil {
		return err
	}
	if s.mgr != nil {
		if err := s.mgr.SetShortcutSettings(norm); err != nil {
			return err
		}
	}
	s.emit(ShortcutsChangedEvent, norm)
	return nil
}

func (s *Service) GetScreenshotSettings() ScreenshotSettings {
	if s.mgr == nil {
		return DefaultScreenshotSettings()
	}
	return s.mgr.GetScreenshotSettings()
}

func (s *Service) SetScreenshotSettings(settings ScreenshotSettings) error {
	norm := NormalizeScreenshotSettings(settings)
	if s.mgr != nil {
		if err := s.mgr.SetScreenshotSettings(norm); err != nil {
			return err
		}
	}
	s.emit(ScreenshotSettingsChangedEvent, norm)
	return nil
}

// TestNetworkConnection tests HTTP connectivity to targetURL through current or provided proxy settings.
func (s *Service) TestNetworkConnection(targetURL string) (*NetworkTestResult, error) {
	settings := s.GetNetworkSettings()
	result := TestNetworkConnectivity(settings, targetURL, 10*time.Second)
	return &result, nil
}

// GetMobileServerStatus returns the operational status and pairing code of the mobile LAN server.
func (s *Service) GetMobileServerStatus() (*MobileServerStatus, error) {
	if s.mgr == nil || s.mgr.GetMobileServer() == nil {
		return &MobileServerStatus{Enabled: false, Running: false}, nil
	}
	status := s.mgr.GetMobileServer().GetStatus()
	return &status, nil
}

// SetMobileServerEnabled enables or disables the LAN mobile server and updates user data.
func (s *Service) SetMobileServerEnabled(enabled bool) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	ms := s.mgr.userData.GetMobileSettings()
	ms.Enabled = enabled
	if err := s.mgr.userData.SetMobileSettings(ms); err != nil {
		return err
	}

	server := s.mgr.GetMobileServer()
	if server != nil {
		if enabled && !server.IsRunning() {
			return server.Start()
		} else if !enabled && server.IsRunning() {
			return server.Stop()
		}
	}
	return nil
}

// RegenerateMobilePairingCode generates and returns a new 6-digit pairing code.
func (s *Service) RegenerateMobilePairingCode() (string, error) {
	if s.mgr == nil || s.mgr.GetMobileServer() == nil {
		return "", ErrCoreNotInitialized
	}
	return s.mgr.GetMobileServer().RegeneratePairingCode(), nil
}

// GetMobilePairingCode returns the active pairing code.
func (s *Service) GetMobilePairingCode() (string, error) {
	if s.mgr == nil || s.mgr.GetMobileServer() == nil {
		return "", ErrCoreNotInitialized
	}
	return s.mgr.GetMobileServer().GetPairingCode(), nil
}

// GetMobilePairingURL returns the bowerbird://pair?data= URL for mobile QR code connection.
func (s *Service) GetMobilePairingURL() (string, error) {
	if s.mgr == nil || s.mgr.GetMobileServer() == nil {
		return "", ErrCoreNotInitialized
	}
	return s.mgr.GetMobileServer().GetPairingURL(), nil
}

// SetMobileAllowedNetworks updates the network interfaces allowed for mobile discovery.
func (s *Service) SetMobileAllowedNetworks(networks []string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}
	ms := s.mgr.userData.GetMobileSettings()
	ms.AllowedNetworks = networks
	if err := s.mgr.userData.SetMobileSettings(ms); err != nil {
		return err
	}
	if server := s.mgr.GetMobileServer(); server != nil && server.IsRunning() {
		server.RestartMDNS()
	}
	return nil
}

// ListMobileDevices returns persisted pairing/API tokens and live connection state.
func (s *Service) ListMobileDevices() ([]MobileDeviceInfo, error) {
	if s.mgr == nil || s.mgr.GetMobileServer() == nil {
		return []MobileDeviceInfo{}, nil
	}
	return s.mgr.GetMobileServer().listDevices(), nil
}

// CreateMobileAPIToken creates a long-lived API token (same auth as pairing).
func (s *Service) CreateMobileAPIToken(name string) (*CreatedMobileToken, error) {
	if s.mgr == nil || s.mgr.userData == nil {
		return nil, ErrCoreNotInitialized
	}
	name = strings.TrimSpace(name)
	if name == "" {
		name = "API Token"
	}
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, err
	}
	token := hex.EncodeToString(tokenBytes)
	now := time.Now().Unix()
	entry := MobileTokenEntry{
		DeviceName: name,
		Token:      token,
		Source:     MobileTokenSourceAPI,
		CreatedAt:  now,
		LastUsedAt: now,
	}
	if err := s.mgr.userData.AddMobileToken(entry); err != nil {
		return nil, err
	}
	stored := s.mgr.userData.ListMobileTokens()
	id := ""
	for _, t := range stored {
		if t.Token == token {
			id = t.ID
			break
		}
	}
	RecordLog("info", "mobile", fmt.Sprintf("Created API token %s", name), "", 0)
	return &CreatedMobileToken{
		ID:        id,
		Name:      name,
		Source:    MobileTokenSourceAPI,
		Token:     token,
		CreatedAt: now,
	}, nil
}

// RevokeMobileDevice removes a pairing or API token and disconnects matching sockets.
func (s *Service) RevokeMobileDevice(id string) error {
	if s.mgr == nil || s.mgr.userData == nil {
		return ErrCoreNotInitialized
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("device id is required")
	}
	entry, ok := s.mgr.userData.GetMobileTokenByID(id)
	if !ok {
		for _, t := range s.mgr.userData.ListMobileTokens() {
			if t.Token == id {
				entry = t
				ok = true
				break
			}
		}
	}
	if !ok {
		return fmt.Errorf("device not found")
	}
	if err := s.mgr.userData.RemoveMobileToken(entry.Token); err != nil {
		return err
	}
	if server := s.mgr.GetMobileServer(); server != nil {
		server.closeClientsWithToken(entry.Token)
	}
	RecordLog("info", "mobile", fmt.Sprintf("Revoked token %s", entry.DeviceName), "", 0)
	return nil
}
