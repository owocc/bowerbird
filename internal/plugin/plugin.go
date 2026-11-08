// Package plugin is the zero-build JavaScript extension runtime. A plugin is a
// directory with plugin.json and index.js (or .ts when a TypeScript runtime is
// installed); no Vite/Rollup step is involved.
//
// The runtime is deliberately small: it loads manifests, validates IDs, keeps
// enable/settings state, and executes one exported hook per invocation in a
// fresh constrained Node process. Node's permission model removes filesystem,
// child-process and network access unless the manifest asks for it; the worker
// additionally filters fetch to the declared hostnames.
package plugin

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Manifest is the plugin.json schema.
type Manifest struct {
	ID            string         `json:"id"`
	Name          string         `json:"name"`
	Version       string         `json:"version"`
	MinAppVersion string         `json:"minAppVersion,omitempty"`
	Main          string         `json:"main,omitempty"`
	Description   string         `json:"description,omitempty"`
	Author        string         `json:"author,omitempty"`
	Permissions   Permissions    `json:"permissions,omitempty"`
	Settings      []Setting      `json:"settings,omitempty"`
	Hooks         []string       `json:"hooks,omitempty"`
	Homepage      string         `json:"homepage,omitempty"`
	License       string         `json:"license,omitempty"`
	Extra         map[string]any `json:"-,"`
}

// Permissions declares the capabilities a plugin may use.
type Permissions struct {
	Network []string `json:"network,omitempty"`
	Process []string `json:"process,omitempty"`
}

// Setting is one row the settings window renders.
type Setting struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Help  string `json:"help,omitempty"`
}

// Plugin is a loaded plugin directory.
type Plugin struct {
	Manifest Manifest
	Dir      string
	Enabled  bool
	Settings map[string]string
}

// Host owns every plugin and executes hooks.
type Host struct {
	mu        sync.RWMutex
	baseDir   string
	localDirs []string
	plugins   map[string]*Plugin
	indexPath string
	worker    string
	timeout   time.Duration
}

// NewHost creates a host rooted at baseDir (usually <UserData>/plugins).
func NewHost(baseDir string) *Host {
	h := &Host{
		baseDir:   baseDir,
		plugins:   map[string]*Plugin{},
		indexPath: filepath.Join(baseDir, "native-plugins.json"),
		timeout:   30 * time.Second,
	}
	_ = os.MkdirAll(baseDir, 0o755)
	h.loadIndex()
	h.Scan()
	return h
}

// SetLocalDirs adds directories scanned in development, such as the repository
// plugins/ folder. Installed plugins win when IDs collide.
func (h *Host) SetLocalDirs(dirs ...string) {
	h.mu.Lock()
	h.localDirs = append([]string(nil), dirs...)
	h.mu.Unlock()
	h.Scan()
}

// BaseDir returns the installed plugin directory.
func (h *Host) BaseDir() string { return h.baseDir }

// Scan discovers plugin directories in the install dir and local dirs.
func (h *Host) Scan() {
	h.mu.RLock()
	base := h.baseDir
	local := append([]string(nil), h.localDirs...)
	h.mu.RUnlock()
	found := map[string]*Plugin{}
	for _, root := range local {
		scanRoot(root, found, false)
	}
	scanRoot(base, found, true)
	h.mu.Lock()
	defer h.mu.Unlock()
	for id, p := range h.plugins {
		if _, ok := found[id]; !ok {
			delete(h.plugins, id)
		} else {
			// Keep the live enabled/settings state.
			found[id].Enabled = p.Enabled
			found[id].Settings = p.Settings
		}
	}
	for id, p := range found {
		if old, ok := h.plugins[id]; ok {
			p.Enabled = old.Enabled
			p.Settings = old.Settings
		}
		h.plugins[id] = p
	}
	h.saveIndexLocked()
}

func scanRoot(root string, out map[string]*Plugin, installed bool) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		dir := filepath.Join(root, e.Name())
		p, err := loadPlugin(dir)
		if err != nil {
			continue
		}
		if !installed {
			// Local development plugins are visible but cannot override an
			// installed copy with the same ID.
			if _, exists := out[p.Manifest.ID]; exists {
				continue
			}
		}
		out[p.Manifest.ID] = p
	}
}

// loadPlugin reads plugin.json and index.js.
func loadPlugin(dir string) (*Plugin, error) {
	data, err := os.ReadFile(filepath.Join(dir, "plugin.json"))
	if err != nil {
		// Be forgiving of the older manifest.json name while plugins migrate.
		data, err = os.ReadFile(filepath.Join(dir, "manifest.json"))
		if err != nil {
			return nil, err
		}
	}
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	if err := validateManifest(&m); err != nil {
		return nil, err
	}
	if m.Main == "" {
		m.Main = "index.js"
	}
	if _, err := os.Stat(filepath.Join(dir, m.Main)); err != nil {
		return nil, err
	}
	return &Plugin{Manifest: m, Dir: dir, Enabled: true, Settings: map[string]string{}}, nil
}

func validateManifest(m *Manifest) error {
	m.ID = strings.TrimSpace(m.ID)
	m.Name = strings.TrimSpace(m.Name)
	m.Version = strings.TrimSpace(m.Version)
	if m.ID == "" || strings.Contains(m.ID, "..") || strings.ContainsAny(m.ID, `/\`) {
		return errors.New("invalid plugin id")
	}
	if m.Name == "" || m.Version == "" {
		return errors.New("plugin name and version are required")
	}
	if m.Main != "" && (strings.Contains(m.Main, "..") || filepath.IsAbs(m.Main)) {
		return errors.New("plugin main must stay inside its directory")
	}
	for _, host := range m.Permissions.Network {
		if strings.TrimSpace(host) == "" {
			return errors.New("empty network permission")
		}
	}
	return nil
}

// Plugins returns a sorted snapshot.
func (h *Host) Plugins() []*Plugin {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]*Plugin, 0, len(h.plugins))
	for _, p := range h.plugins {
		cp := *p
		out = append(out, &cp)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Manifest.ID < out[j].Manifest.ID })
	return out
}

// Get returns one plugin.
func (h *Host) Get(id string) (*Plugin, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	p, ok := h.plugins[id]
	return p, ok
}

// SetEnabled persists a plugin's enabled state.
func (h *Host) SetEnabled(id string, enabled bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if p, ok := h.plugins[id]; ok {
		p.Enabled = enabled
		h.saveIndexLocked()
	}
}

// SetSetting stores one setting value.
func (h *Host) SetSetting(id, key, value string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if p, ok := h.plugins[id]; ok {
		if p.Settings == nil {
			p.Settings = map[string]string{}
		}
		p.Settings[key] = value
		h.saveIndexLocked()
	}
}

// InstallZip extracts a plugin archive into the install directory.
func (h *Host) InstallZip(path string) (*Plugin, error) {
	r, err := zip.OpenReader(path)
	if err != nil {
		return nil, err
	}
	defer r.Close()
	stage, err := os.MkdirTemp(h.baseDir, ".install-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(stage)
	for _, f := range r.File {
		name := filepath.Clean(f.Name)
		if name == "." || strings.HasPrefix(name, "..") || filepath.IsAbs(name) {
			continue
		}
		target := filepath.Join(stage, name)
		if !strings.HasPrefix(target, filepath.Clean(stage)+string(os.PathSeparator)) {
			return nil, errors.New("plugin archive contains an unsafe path")
		}
		if f.FileInfo().IsDir() {
			_ = os.MkdirAll(target, 0o755)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return nil, err
		}
		in, err := f.Open()
		if err != nil {
			return nil, err
		}
		out, err := os.Create(target)
		if err != nil {
			in.Close()
			return nil, err
		}
		_, copyErr := io.Copy(out, in)
		in.Close()
		out.Close()
		if copyErr != nil {
			return nil, copyErr
		}
	}
	// Archives may wrap the plugin in one top directory.
	dir := stage
	if _, err := os.Stat(filepath.Join(dir, "plugin.json")); err != nil {
		entries, _ := os.ReadDir(stage)
		var subs []os.DirEntry
		for _, e := range entries {
			if e.IsDir() {
				subs = append(subs, e)
			}
		}
		if len(subs) == 1 {
			dir = filepath.Join(stage, subs[0].Name())
		}
	}
	p, err := loadPlugin(dir)
	if err != nil {
		return nil, err
	}
	dst := filepath.Join(h.baseDir, p.Manifest.ID)
	_ = os.RemoveAll(dst)
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return nil, err
	}
	if err := copyDir(dir, dst); err != nil {
		return nil, err
	}
	h.Scan()
	installed, _ := h.Get(p.Manifest.ID)
	return installed, nil
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		in, err := os.Open(path)
		if err != nil {
			return err
		}
		defer in.Close()
		out, err := os.Create(target)
		if err != nil {
			return err
		}
		defer out.Close()
		_, err = io.Copy(out, in)
		return err
	})
}

// Uninstall removes an installed plugin directory.
func (h *Host) Uninstall(id string) error {
	h.mu.RLock()
	p, ok := h.plugins[id]
	base := h.baseDir
	h.mu.RUnlock()
	if !ok {
		return fmt.Errorf("plugin %s is not installed", id)
	}
	if !strings.HasPrefix(filepath.Clean(p.Dir), filepath.Clean(base)+string(os.PathSeparator)) {
		return errors.New("refusing to remove a local plugin")
	}
	if err := os.RemoveAll(p.Dir); err != nil {
		return err
	}
	h.Scan()
	return nil
}

// Hook results -------------------------------------------------------------

// ResolveResult is what resolveUrl returns.
type ResolveResult struct {
	URL        string   `json:"url"`
	Candidates []string `json:"candidates"`
	SourceURL  string   `json:"sourceUrl"`
	Name       string   `json:"name"`
	Tags       []string `json:"tags"`
}

// InspectRow is one label/value row in an inspector section.
type InspectRow struct {
	Label    string `json:"label"`
	Value    string `json:"value"`
	Copyable bool   `json:"copyable"`
}

// InspectText is a text block in an inspector section.
type InspectText struct {
	Title string `json:"title"`
	Text  string `json:"text"`
}

// InspectSection is a block the inspector renders natively.
type InspectSection struct {
	Title      string        `json:"title"`
	Rows       []InspectRow  `json:"rows"`
	TextBlocks []InspectText `json:"textBlocks"`
}

// InspectResult is what inspect returns.
type InspectResult struct {
	Sections []InspectSection `json:"sections"`
}

// Action is one context-menu action a plugin contributes.
type Action struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Icon  string `json:"icon"`
}

// ItemContext is passed to inspect/actions hooks.
type ItemContext struct {
	Item   map[string]any   `json:"item"`
	Folder string           `json:"folder,omitempty"`
	Items  []map[string]any `json:"items,omitempty"`
}

// Resolve asks every enabled plugin until one resolves the URL.
func (h *Host) Resolve(rawURL string) (*ResolveResult, string, error) {
	for _, p := range h.Plugins() {
		if !p.Enabled {
			continue
		}
		var out ResolveResult
		err := h.call(p, "resolveUrl", map[string]any{"url": rawURL}, &out)
		if err != nil {
			continue
		}
		if out.URL != "" || len(out.Candidates) > 0 {
			return &out, p.Manifest.ID, nil
		}
	}
	return nil, "", errors.New("no plugin resolved this URL")
}

// Inspect gathers extension metadata for an item.
func (h *Host) Inspect(item map[string]any) []InspectSection {
	var out []InspectSection
	for _, p := range h.Plugins() {
		if !p.Enabled {
			continue
		}
		var result InspectResult
		if err := h.call(p, "inspect", ItemContext{Item: item}, &result); err == nil {
			out = append(out, result.Sections...)
		}
	}
	return out
}

// Actions gathers context menu actions.
func (h *Host) Actions(ctx ItemContext) []Action {
	var out []Action
	for _, p := range h.Plugins() {
		if !p.Enabled {
			continue
		}
		var actions []Action
		if err := h.call(p, "actions", ctx, &actions); err == nil {
			for i := range actions {
				actions[i].ID = p.Manifest.ID + ":" + actions[i].ID
			}
			out = append(out, actions...)
		}
	}
	return out
}

// RunAction executes a previously advertised action.
func (h *Host) RunAction(id string, ctx ItemContext) error {
	pluginID, actionID, ok := strings.Cut(id, ":")
	if !ok {
		return errors.New("invalid action id")
	}
	p, found := h.Get(pluginID)
	if !found || !p.Enabled {
		return errors.New("plugin is not available")
	}
	payload := map[string]any{"id": actionID, "items": ctx.Items, "item": ctx.Item, "folder": ctx.Folder}
	var out any
	return h.call(p, "runAction", payload, &out)
}

// Thumbnail asks a plugin to render a thumbnail for an unsupported file.
func (h *Host) Thumbnail(filePath, mimeType string) (map[string]any, error) {
	for _, p := range h.Plugins() {
		if !p.Enabled {
			continue
		}
		var out map[string]any
		if err := h.call(p, "thumbnail", map[string]any{"filePath": filePath, "mimeType": mimeType}, &out); err == nil && out != nil {
			return out, nil
		}
	}
	return nil, errors.New("no plugin produced a thumbnail")
}

func (h *Host) loadIndex() {
	h.mu.Lock()
	defer h.mu.Unlock()
	data, err := os.ReadFile(h.indexPath)
	if err != nil {
		return
	}
	var state map[string]struct {
		Enabled  bool              `json:"enabled"`
		Settings map[string]string `json:"settings"`
	}
	if json.Unmarshal(data, &state) != nil {
		return
	}
	for id, s := range state {
		h.plugins[id] = &Plugin{Manifest: Manifest{ID: id}, Enabled: s.Enabled, Settings: s.Settings}
	}
}

func (h *Host) saveIndexLocked() {
	state := map[string]any{}
	for id, p := range h.plugins {
		if p.Manifest.Name == "" {
			continue
		}
		state[id] = map[string]any{"enabled": p.Enabled, "settings": p.Settings}
	}
	data, _ := json.MarshalIndent(state, "", "  ")
	_ = os.WriteFile(h.indexPath, data, 0o644)
}
