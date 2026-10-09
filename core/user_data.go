package core

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// UserData represents the ultra-thin configuration saved in the user's data directory.
type UserData struct {
	ActiveLibraryPath string   `json:"activeLibraryPath"`
	RecentLibraries   []string `json:"recentLibraries"`
	// Theme is the persisted colour mode: "dark", "light" or "system".
	Theme     string `json:"theme,omitempty"`
	UpdatedAt int64  `json:"updatedAt"`
}

// UserDataStore provides thread-safe, atomic persistence for user configuration.
type UserDataStore struct {
	mu       sync.RWMutex
	filePath string
	data     UserData
}

// NewUserDataStore initializes the user data store in the system user data directory.
func NewUserDataStore() (*UserDataStore, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = os.TempDir()
	}

	appDataDir := filepath.Join(configDir, "bowerbird")
	if err := os.MkdirAll(appDataDir, 0755); err != nil {
		return nil, err
	}

	store := &UserDataStore{
		filePath: filepath.Join(appDataDir, "user_data.json"),
		data: UserData{
			RecentLibraries: []string{},
		},
	}

	// Load existing data if file exists
	if raw, err := os.ReadFile(store.filePath); err == nil {
		var loaded UserData
		if jsonErr := json.Unmarshal(raw, &loaded); jsonErr == nil {
			store.data = loaded
		}
	}

	// Also migrate legacy config.json if present and user_data.json is empty
	legacyPath := filepath.Join(appDataDir, "config.json")
	if store.data.ActiveLibraryPath == "" {
		if raw, err := os.ReadFile(legacyPath); err == nil {
			var legacy struct {
				LastLibraryPath string `json:"lastLibraryPath"`
			}
			if json.Unmarshal(raw, &legacy) == nil && legacy.LastLibraryPath != "" {
				store.data.ActiveLibraryPath = legacy.LastLibraryPath
				store.data.RecentLibraries = append(store.data.RecentLibraries, legacy.LastLibraryPath)
				_ = store.saveLocked()
			}
		}
	}

	return store, nil
}

// GetActiveLibraryPath returns the remembered active library path.
func (s *UserDataStore) GetActiveLibraryPath() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.data.ActiveLibraryPath
}

// SetActiveLibraryPath updates the remembered active library path and saves atomically.
func (s *UserDataStore) SetActiveLibraryPath(libPath string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data.ActiveLibraryPath = libPath
	s.data.UpdatedAt = time.Now().Unix()

	if libPath != "" {
		// Add to recent libraries (deduplicated, newest first, max 10)
		recents := []string{libPath}
		for _, p := range s.data.RecentLibraries {
			if p != libPath && len(recents) < 10 {
				recents = append(recents, p)
			}
		}
		s.data.RecentLibraries = recents
	}

	return s.saveLocked()
}

// ClearActiveLibraryPath clears the active library path and saves.
func (s *UserDataStore) ClearActiveLibraryPath() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data.ActiveLibraryPath = ""
	s.data.UpdatedAt = time.Now().Unix()
	return s.saveLocked()
}

// GetRecentLibraries returns recent library paths that still exist on disk.
func (s *UserDataStore) GetRecentLibraries() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var existing []string
	for _, p := range s.data.RecentLibraries {
		if _, err := os.Stat(p); err == nil {
			existing = append(existing, p)
		}
	}
	return existing
}

// GetTheme returns the persisted colour mode (may be empty on first run).
func (s *UserDataStore) GetTheme() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.data.Theme
}

// SetTheme persists the colour mode and saves atomically.
func (s *UserDataStore) SetTheme(theme string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data.Theme = theme
	s.data.UpdatedAt = time.Now().Unix()
	return s.saveLocked()
}

// GetFilePath returns the file path of user_data.json.
func (s *UserDataStore) GetFilePath() string {
	return s.filePath
}

func (s *UserDataStore) saveLocked() error {
	bytes, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}

	// Atomic write via temp file
	tmpFile := s.filePath + ".tmp"
	if err := os.WriteFile(tmpFile, bytes, 0644); err != nil {
		return err
	}
	return os.Rename(tmpFile, s.filePath)
}
