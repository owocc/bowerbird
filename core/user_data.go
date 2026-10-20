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
	Theme     string          `json:"theme,omitempty"`
	Language  string          `json:"language,omitempty"`
	Network   NetworkSettings `json:"network,omitempty"`
	Mobile    *MobileSettings `json:"mobile,omitempty"`
	UpdatedAt int64           `json:"updatedAt"`
}

// UserDataStore provides thread-safe, atomic persistence for user configuration.
type UserDataStore struct {
	mu       sync.RWMutex
	filePath string
	data     UserData
}

// UserDataDir returns the directory holding this app's state (user_data.json,
// drag-debug.log). BOWERBIRD_USER_DATA_DIR overrides it, which keeps test runs
// and portable installs out of the real user profile.
func UserDataDir() string {
	if dir := os.Getenv("BOWERBIRD_USER_DATA_DIR"); dir != "" {
		return dir
	}
	configDir, err := os.UserConfigDir()
	if err != nil || configDir == "" {
		configDir = os.TempDir()
	}
	return filepath.Join(configDir, "bowerbird")
}

// NewUserDataStore initializes the user data store in the system user data directory.
func NewUserDataStore() (*UserDataStore, error) {
	appDataDir := UserDataDir()
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

// GetLanguage returns the persisted language code (may be empty on first run).
func (s *UserDataStore) GetLanguage() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.data.Language
}

// SetLanguage persists the language code and saves atomically.
func (s *UserDataStore) SetLanguage(language string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data.Language = language
	s.data.UpdatedAt = time.Now().Unix()
	return s.saveLocked()
}

// GetNetworkSettings returns the persisted network/proxy configuration.
func (s *UserDataStore) GetNetworkSettings() NetworkSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	settings := s.data.Network
	if settings.ProxyMode == "" {
		settings.ProxyMode = ProxyModeSystem
	}
	return settings
}

// SetNetworkSettings updates and persists the network/proxy configuration atomically.
func (s *UserDataStore) SetNetworkSettings(settings NetworkSettings) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data.Network = settings
	s.data.UpdatedAt = time.Now().Unix()
	return s.saveLocked()
}

// MobileSettings holds LAN server configuration and authorized tokens.
type MobileSettings struct {
	Enabled         bool               `json:"enabled"`
	Port            int                `json:"port,omitempty"`
	PairingRequired bool               `json:"pairingRequired"`
	Tokens          []MobileTokenEntry `json:"tokens,omitempty"`
	AllowedNetworks []string           `json:"allowedNetworks,omitempty"`
}

// MobileTokenEntry represents an authorized mobile client token.
type MobileTokenEntry struct {
	Token      string `json:"token"`
	DeviceName string `json:"deviceName,omitempty"`
	CreatedAt  int64  `json:"createdAt"`
	LastUsedAt int64  `json:"lastUsedAt,omitempty"`
}

// GetMobileSettings returns persisted mobile LAN settings or safe defaults.
func (s *UserDataStore) GetMobileSettings() MobileSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.data.Mobile == nil {
		return MobileSettings{
			Enabled:         true,
			Port:            17878,
			PairingRequired: true,
			Tokens:          []MobileTokenEntry{},
		}
	}
	ms := *s.data.Mobile
	if ms.Port <= 0 {
		ms.Port = 17878
	}
	if ms.Tokens == nil {
		ms.Tokens = []MobileTokenEntry{}
	}
	return ms
}

// SetMobileSettings persists mobile server settings.
func (s *UserDataStore) SetMobileSettings(settings MobileSettings) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if settings.Port <= 0 {
		settings.Port = 17878
	}
	if settings.Tokens == nil {
		settings.Tokens = []MobileTokenEntry{}
	}
	s.data.Mobile = &settings
	s.data.UpdatedAt = time.Now().Unix()
	return s.saveLocked()
}

// AddMobileToken stores a new authorized token.
func (s *UserDataStore) AddMobileToken(entry MobileTokenEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.data.Mobile == nil {
		s.data.Mobile = &MobileSettings{
			Enabled:         true,
			Port:            17878,
			PairingRequired: true,
			Tokens:          []MobileTokenEntry{},
		}
	}
	// Avoid duplicates
	found := false
	for i, t := range s.data.Mobile.Tokens {
		if t.Token == entry.Token {
			s.data.Mobile.Tokens[i] = entry
			found = true
			break
		}
	}
	if !found {
		s.data.Mobile.Tokens = append(s.data.Mobile.Tokens, entry)
	}
	s.data.UpdatedAt = time.Now().Unix()
	return s.saveLocked()
}

// HasMobileToken checks if the given token is recognized.
func (s *UserDataStore) HasMobileToken(token string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.data.Mobile == nil {
		return false
	}
	for _, t := range s.data.Mobile.Tokens {
		if t.Token == token {
			return true
		}
	}
	return false
}

// TouchMobileToken updates the lastUsedAt timestamp of a token.
func (s *UserDataStore) TouchMobileToken(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.data.Mobile == nil {
		return
	}
	for i, t := range s.data.Mobile.Tokens {
		if t.Token == token {
			s.data.Mobile.Tokens[i].LastUsedAt = time.Now().Unix()
			_ = s.saveLocked()
			return
		}
	}
}

// RemoveMobileToken deletes a token.
func (s *UserDataStore) RemoveMobileToken(token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.data.Mobile == nil {
		return nil
	}
	newTokens := make([]MobileTokenEntry, 0, len(s.data.Mobile.Tokens))
	for _, t := range s.data.Mobile.Tokens {
		if t.Token != token {
			newTokens = append(newTokens, t)
		}
	}
	s.data.Mobile.Tokens = newTokens
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
