// Package plugin is Bowerbird's native plugin runtime. A plugin is a directory
// with plugin.json plus an optional zero-build index.js; no Vite/Rollup step is
// involved. Preview plugins may be native-only: they declare a host renderer
// (`"native": "markdown"`) and the Go UI paints the view without JavaScript.
//
// The runtime loads manifests, validates IDs, keeps enabled/settings state, and
// executes each exported hook in an embedded moejs runtime. The host exposes
// only explicit globals (settings, spawn, log and fetch). Fetch is filtered to
// the manifest's host allow-list, and modules have no filesystem or child
// process access unless the host grants it.
package plugin

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// Manifest is the plugin.json schema. A plugin either ships JavaScript hooks
// (Main) or declares a renderer implemented natively by the host (Native).
type Manifest struct {
	ID            string              `json:"id"`
	Name          string              `json:"name"`
	Version       string              `json:"version"`
	MinAppVersion string              `json:"minAppVersion,omitempty"`
	Kind          string              `json:"kind,omitempty"`
	Native        string              `json:"native,omitempty"`
	Preview       PreviewContribution `json:"preview,omitempty"`
	Main          string              `json:"main,omitempty"`
	Description   string              `json:"description,omitempty"`
	Author        string              `json:"author,omitempty"`
	Priority      int                 `json:"priority,omitempty"`
	Extensions    []string            `json:"extensions,omitempty"`
	MimePrefixes  []string            `json:"mimePrefixes,omitempty"`
	SupportsZoom  bool                `json:"supportsZoom,omitempty"`
	Capabilities  []string            `json:"capabilities,omitempty"`
	URLPatterns   []string            `json:"urlPatterns,omitempty"`
	URLHosts      []string            `json:"urlHosts,omitempty"`
	Permissions   Permissions         `json:"permissions,omitempty"`
	Settings      []Setting           `json:"settings,omitempty"`
	Hooks         []string            `json:"hooks,omitempty"`
	Homepage      string              `json:"homepage,omitempty"`
	License       string              `json:"license,omitempty"`
	Builtin       bool                `json:"builtin,omitempty"`
	Extra         map[string]any      `json:"-,"`
}

// PreviewContribution is the structured form of a native preview declaration.
type PreviewContribution struct {
	Renderer     string   `json:"renderer,omitempty"`
	Extensions   []string `json:"extensions,omitempty"`
	MimePrefixes []string `json:"mimePrefixes,omitempty"`
	SupportsZoom bool     `json:"supportsZoom,omitempty"`
	Priority     int      `json:"priority,omitempty"`
}

// Permissions declares the capabilities a plugin may use.
type Permissions struct {
	Network      []string `json:"network,omitempty"`
	Process      []string `json:"process,omitempty"`
	OpenExternal bool     `json:"openExternal,omitempty"`
}

// Setting is one row the settings window renders.
type Setting struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Help        string `json:"help,omitempty"`
	Placeholder string `json:"placeholder,omitempty"`
	Default     string `json:"default,omitempty"`
	Secret      bool   `json:"secret,omitempty"`
}

// Plugin is a loaded plugin directory.
type Plugin struct {
	Manifest    Manifest
	Dir         string
	Enabled     bool
	Settings    map[string]string
	urlPatterns []*regexp.Regexp
}

// Host owns every plugin and executes hooks.
type Host struct {
	mu         sync.RWMutex
	baseDir    string
	localDirs  []string
	builtins   map[string]*Plugin
	plugins    map[string]*Plugin
	states     map[string]pluginState
	urlIndex   *urlMatchIndex
	indexPath  string
	timeout    time.Duration
	httpClient *http.Client
	modMu      sync.Mutex
	modules    map[string]cachedModule
	httpMu     sync.RWMutex
}

type pluginState struct {
	Enabled  bool              `json:"enabled"`
	Settings map[string]string `json:"settings"`
}

// urlMatchIndex makes URL drags O(1) for declared hosts and only runs regular
// expressions for plugins that can actually match the hostname.
type urlMatchIndex struct {
	exact    map[string][]*Plugin
	wildcard map[string][]*Plugin // suffix includes the leading dot, e.g. ".pinterest.com"
	hostless []*Plugin            // plugins that declare regex patterns only
	fallback []*Plugin            // legacy resolver plugins with no index metadata
}

// NewHost creates a host rooted at baseDir (usually <UserData>/plugins).
func NewHost(baseDir string) *Host {
	h := &Host{
		baseDir:    baseDir,
		builtins:   map[string]*Plugin{},
		plugins:    map[string]*Plugin{},
		states:     map[string]pluginState{},
		indexPath:  filepath.Join(baseDir, "native-plugins.json"),
		timeout:    30 * time.Second,
		httpClient: &http.Client{Timeout: 30 * time.Second},
		modules:    map[string]cachedModule{},
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

// SetHTTPClient updates the client used by webapi fetch. The app calls it with
// the same proxy transport as imports, so a plugin resolver honors the user's
// network settings instead of hanging on a blocked direct connection.
func (h *Host) SetHTTPClient(client *http.Client) {
	h.httpMu.Lock()
	h.httpClient = client
	h.httpMu.Unlock()
}

func (h *Host) currentHTTPClient() *http.Client {
	h.httpMu.RLock()
	client := h.httpClient
	h.httpMu.RUnlock()
	if client == nil {
		client = http.DefaultClient
	}
	return client
}

// Scan discovers plugin directories in the install dir and local dirs.
func (h *Host) Scan() {
	h.mu.RLock()
	base := h.baseDir
	local := append([]string(nil), h.localDirs...)
	builtins := make(map[string]*Plugin, len(h.builtins))
	for id, p := range h.builtins {
		builtins[id] = p
	}
	h.mu.RUnlock()
	found := map[string]*Plugin{}
	for _, root := range local {
		scanRoot(root, found, false)
	}
	scanRoot(base, found, true)
	// Official native plugins are compiled into the app. A directory with the
	// same id always wins, so local development can override the bundled copy.
	for id, p := range builtins {
		if _, exists := found[id]; !exists {
			found[id] = p
		}
	}
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
		} else if state, ok := h.states[id]; ok {
			// NewHost may have pruned the placeholder for a missing directory
			// before RegisterBuiltin runs. Keep persisted state until the
			// built-in plugin is registered.
			p.Enabled = state.Enabled
			p.Settings = state.Settings
		}
		h.plugins[id] = p
		h.logPlugin("info", p, "manifest.loaded", fmt.Sprintf("version=%s hooks=%v network=%v process=%v openExternal=%t", p.Manifest.Version, p.Manifest.Hooks, p.Manifest.Permissions.Network, p.Manifest.Permissions.Process, p.Manifest.Permissions.OpenExternal), 0)
	}
	h.rebuildURLIndexLocked()
	h.saveIndexLocked()
}

func (h *Host) rebuildURLIndexLocked() {
	idx := &urlMatchIndex{
		exact:    map[string][]*Plugin{},
		wildcard: map[string][]*Plugin{},
	}
	for _, p := range h.plugins {
		if !hasHook(p.Manifest, "resolveUrl") && p.Manifest.Kind != "resolver" {
			continue
		}
		if len(p.Manifest.URLHosts) == 0 && len(p.Manifest.URLPatterns) == 0 {
			idx.fallback = append(idx.fallback, p)
			continue
		}
		if len(p.Manifest.URLHosts) == 0 {
			idx.hostless = append(idx.hostless, p)
			continue
		}
		complexHost := false
		for _, raw := range p.Manifest.URLHosts {
			host := strings.ToLower(strings.TrimSpace(raw))
			if host == "" {
				continue
			}
			switch {
			case !strings.Contains(host, "*"):
				idx.exact[host] = append(idx.exact[host], p)
			case strings.HasPrefix(host, "*.") && strings.Count(host, "*") == 1:
				idx.wildcard[host[1:]] = append(idx.wildcard[host[1:]], p)
			default:
				complexHost = true
			}
		}
		if complexHost {
			idx.hostless = append(idx.hostless, p)
		}
	}
	sortPlugins := func(list []*Plugin) {
		sort.SliceStable(list, func(i, j int) bool {
			if list[i].Manifest.Priority != list[j].Manifest.Priority {
				return list[i].Manifest.Priority > list[j].Manifest.Priority
			}
			return list[i].Manifest.ID < list[j].Manifest.ID
		})
	}
	for _, list := range idx.exact {
		sortPlugins(list)
	}
	for _, list := range idx.wildcard {
		sortPlugins(list)
	}
	sortPlugins(idx.hostless)
	sortPlugins(idx.fallback)
	h.urlIndex = idx
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
	if m.Main == "" && m.Native == "" {
		m.Main = "index.js"
	}
	if m.Main != "" {
		if _, err := os.Stat(filepath.Join(dir, m.Main)); err != nil {
			return nil, err
		}
	}
	p := &Plugin{Manifest: m, Dir: dir, Enabled: true, Settings: map[string]string{}}
	if err := p.prepareURLRules(); err != nil {
		return nil, err
	}
	return p, nil
}

func (p *Plugin) prepareURLRules() error {
	p.urlPatterns = nil
	for _, raw := range p.Manifest.URLPatterns {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		re, err := regexp.Compile(raw)
		if err != nil {
			return fmt.Errorf("invalid url pattern %q: %w", raw, err)
		}
		p.urlPatterns = append(p.urlPatterns, re)
	}
	return nil
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
	if m.Preview.Renderer != "" {
		if m.Native == "" {
			m.Native = strings.TrimSpace(m.Preview.Renderer)
		}
		if len(m.Extensions) == 0 {
			m.Extensions = m.Preview.Extensions
		}
		if len(m.MimePrefixes) == 0 {
			m.MimePrefixes = m.Preview.MimePrefixes
		}
		if !m.SupportsZoom {
			m.SupportsZoom = m.Preview.SupportsZoom
		}
		if m.Priority == 0 {
			m.Priority = m.Preview.Priority
		}
	}
	if m.Native != "" && strings.ContainsAny(m.Native, " /\\") {
		return errors.New("invalid native renderer id")
	}
	if m.Kind == "" {
		if m.Native != "" {
			m.Kind = "preview"
		} else {
			m.Kind = "metadata"
		}
	}
	m.Extensions = normalizeExtensions(m.Extensions)
	allowedHooks := map[string]bool{"resolveUrl": true, "inspect": true, "actions": true, "runAction": true, "thumbnail": true}
	seenHooks := map[string]bool{}
	normalizedHooks := make([]string, 0, len(m.Hooks))
	for _, raw := range m.Hooks {
		hook := strings.TrimSpace(raw)
		if hook == "" {
			continue
		}
		if !allowedHooks[hook] {
			return fmt.Errorf("unknown plugin hook %q", hook)
		}
		if seenHooks[hook] {
			continue
		}
		seenHooks[hook] = true
		normalizedHooks = append(normalizedHooks, hook)
	}
	m.Hooks = normalizedHooks
	if m.Main != "" && len(m.Hooks) == 0 {
		return errors.New("JavaScript plugins must declare hooks in plugin.json")
	}
	if m.Main == "" && len(m.Hooks) > 0 {
		return errors.New("native plugins cannot declare JavaScript hooks")
	}
	for _, host := range m.Permissions.Network {
		host = strings.TrimSpace(host)
		if host == "" {
			return errors.New("empty network permission")
		}
		if host == "*" || strings.Contains(host, "://") || strings.ContainsAny(host, "/\\") {
			return fmt.Errorf("network permission must be a hostname pattern: %q", host)
		}
	}
	for _, process := range m.Permissions.Process {
		process = strings.TrimSpace(process)
		if process == "" {
			return errors.New("empty process permission")
		}
		if process == "*" {
			return errors.New("process permission cannot be a bare wildcard")
		}
	}
	return nil
}

func normalizeExtensions(list []string) []string {
	out := make([]string, 0, len(list))
	seen := map[string]bool{}
	for _, ext := range list {
		cleaned := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(ext), "."))
		if cleaned == "" || seen[cleaned] {
			continue
		}
		seen[cleaned] = true
		out = append(out, cleaned)
	}
	return out
}

// RegisterBuiltin adds official plugins that are compiled into the desktop
// application. Manifests registered here have no directory on disk; a local or
// installed directory with the same id overrides them on the next Scan.
func (h *Host) RegisterBuiltin(manifests ...Manifest) {
	h.mu.Lock()
	for _, m := range manifests {
		if err := validateManifest(&m); err != nil {
			continue
		}
		m.Builtin = true
		p := &Plugin{Manifest: m, Enabled: true, Settings: map[string]string{}}
		if err := p.prepareURLRules(); err != nil {
			continue
		}
		if old, ok := h.plugins[m.ID]; ok {
			p.Enabled = old.Enabled
			if old.Settings != nil {
				p.Settings = old.Settings
			}
		}
		h.builtins[m.ID] = p
	}
	h.mu.Unlock()
	h.Scan()
}

// IsEnabled reports whether a plugin exists and is enabled.
func (h *Host) IsEnabled(id string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	p, ok := h.plugins[id]
	return ok && p.Enabled
}

func manifestMatchesItem(m Manifest, extension, mimeType string) bool {
	ext := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(extension), "."))
	mime := strings.ToLower(strings.TrimSpace(mimeType))
	for _, candidate := range m.Extensions {
		if strings.ToLower(strings.TrimPrefix(candidate, ".")) == ext {
			return true
		}
	}
	for _, prefix := range m.MimePrefixes {
		prefix = strings.ToLower(strings.TrimSpace(prefix))
		if prefix == "" {
			continue
		}
		if strings.HasSuffix(prefix, "/") && strings.HasPrefix(mime, prefix) {
			return true
		}
		if mime == prefix || strings.HasPrefix(mime, prefix+";") {
			return true
		}
	}
	return false
}

// MatchPreview returns the highest-priority enabled native preview plugin that
// supports the given extension or MIME type.
func (h *Host) MatchPreview(extension, mimeType string) *Plugin {
	var best *Plugin
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, p := range h.plugins {
		if !p.Enabled || p.Manifest.Native == "" || p.Manifest.Kind != "preview" {
			continue
		}
		if !manifestMatchesItem(p.Manifest, extension, mimeType) {
			continue
		}
		if best == nil || p.Manifest.Priority > best.Manifest.Priority {
			best = p
		}
	}
	if best == nil {
		return nil
	}
	cp := *best
	return &cp
}
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
		h.logPlugin("info", p, "api.setEnabled", fmt.Sprintf("enabled=%t", enabled), 0)
	}
}

// CanUninstall reports whether a plugin lives in the managed install directory
// and may therefore be removed. Built-ins and repository development folders
// are not removable from the app.
func (h *Host) CanUninstall(id string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	p, ok := h.plugins[id]
	if !ok || p.Manifest.Builtin || p.Dir == "" {
		return false
	}
	base := filepath.Clean(h.baseDir)
	dir := filepath.Clean(p.Dir)
	return strings.HasPrefix(dir, base+string(os.PathSeparator))
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
		detail := fmt.Sprintf("key=%s", key)
		secret := false
		for _, setting := range p.Manifest.Settings {
			if setting.Key == key && setting.Secret {
				secret = true
				break
			}
		}
		if !secret {
			detail += " value=" + value
		}
		h.logPlugin("info", p, "api.setSetting", detail, 0)
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
		h.logPlugin("error", p, "api.uninstall", err.Error(), 0)
		return err
	}
	h.mu.Lock()
	delete(h.states, id)
	h.mu.Unlock()
	h.logPlugin("info", p, "api.uninstall", "removed "+p.Dir, 0)
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

// ErrHookNotDeclared means a hook was invoked that the plugin manifest did not
// register. Undeclared hooks are never executed, even if the module exports
// them.
var ErrHookNotDeclared = errors.New("plugin did not declare this hook")

// ErrNoURLResolver means no plugin declared a host/regex match for a URL. The
// caller can fall back to importing a direct media URL.
var ErrNoURLResolver = errors.New("no plugin matched this URL")

// ErrURLNotResolved means a plugin claimed the URL but returned no media
// candidates. The caller must not import the page itself as if it were media.
var ErrURLNotResolved = errors.New("matched plugin did not resolve this URL")

func normalizePluginURL(raw string) (*url.URL, string) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return nil, ""
	}
	if strings.HasPrefix(s, "//") {
		s = "https:" + s
	}
	if !strings.Contains(s, "://") && strings.Contains(s, ".") {
		s = "https://" + s
	}
	u, err := url.Parse(s)
	if err != nil || u.Scheme == "" {
		return nil, s
	}
	return u, s
}

func matchURLHost(host, pattern string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	pattern = strings.ToLower(strings.TrimSpace(pattern))
	if host == "" || pattern == "" {
		return false
	}
	if !strings.Contains(pattern, "*") {
		return host == pattern
	}
	parts := strings.Split(pattern, "*")
	if !strings.HasPrefix(host, parts[0]) {
		return false
	}
	trailingStar := strings.HasSuffix(pattern, "*")
	pos := len(parts[0])
	for i := 1; i < len(parts); i++ {
		part := parts[i]
		if part == "" {
			continue
		}
		idx := strings.Index(host[pos:], part)
		if idx < 0 {
			return false
		}
		pos += idx + len(part)
		if i == len(parts)-1 && !trailingStar && pos != len(host) {
			return false
		}
	}
	return trailingStar || pos == len(host)
}

func (p *Plugin) matchesURL(u *url.URL, normalized string) bool {
	if len(p.Manifest.URLHosts) > 0 {
		host := ""
		if u != nil {
			host = u.Hostname()
		}
		matched := false
		for _, pattern := range p.Manifest.URLHosts {
			if matchURLHost(host, pattern) {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	if len(p.urlPatterns) > 0 {
		matched := false
		candidates := []string{normalized}
		if u != nil && u.String() != normalized {
			candidates = append(candidates, u.String())
		}
		for _, re := range p.urlPatterns {
			for _, candidate := range candidates {
				if re.MatchString(candidate) {
					matched = true
					break
				}
			}
			if matched {
				break
			}
		}
		if !matched {
			return false
		}
	}
	return true
}

func (h *Host) urlCandidates(rawURL string) ([]*Plugin, bool) {
	u, normalized := normalizePluginURL(rawURL)
	if u == nil {
		return nil, false
	}
	h.mu.RLock()
	idx := h.urlIndex
	if idx == nil {
		idx = &urlMatchIndex{}
	}
	h.mu.RUnlock()

	seen := map[*Plugin]bool{}
	var candidates []*Plugin
	add := func(list []*Plugin) {
		for _, p := range list {
			if p == nil || seen[p] || !p.Enabled || p.Manifest.Main == "" || !hasHook(p.Manifest, "resolveUrl") {
				continue
			}
			seen[p] = true
			if p.matchesURL(u, normalized) {
				candidates = append(candidates, p)
			}
		}
	}
	host := strings.ToLower(u.Hostname())
	add(idx.exact[host])
	for suffix, list := range idx.wildcard {
		if host == strings.TrimPrefix(suffix, ".") || strings.HasSuffix(host, suffix) {
			add(list)
		}
	}
	add(idx.hostless)
	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].Manifest.Priority != candidates[j].Manifest.Priority {
			return candidates[i].Manifest.Priority > candidates[j].Manifest.Priority
		}
		return candidates[i].Manifest.ID < candidates[j].Manifest.ID
	})
	if len(candidates) > 0 {
		return candidates, true
	}
	// Legacy plugins without URL hosts/patterns are only tried when no indexed
	// plugin claimed the URL. This keeps matching deterministic and fast.
	var fallback []*Plugin
	for _, p := range idx.fallback {
		if p != nil && p.Enabled && p.Manifest.Main != "" && hasHook(p.Manifest, "resolveUrl") && p.matchesURL(u, normalized) {
			fallback = append(fallback, p)
		}
	}
	sort.SliceStable(fallback, func(i, j int) bool {
		return fallback[i].Manifest.Priority > fallback[j].Manifest.Priority
	})
	return fallback, len(fallback) > 0
}

// Resolve asks the first matching plugin to resolve the URL. Host and regex
// indexes pick candidates before any worker starts; the first non-empty result
// wins and later plugins are not invoked.
func (h *Host) Resolve(rawURL string) (*ResolveResult, string, error) {
	plugins, matched := h.urlCandidates(rawURL)
	if !matched {
		return nil, "", ErrNoURLResolver
	}
	var lastErr error
	for _, p := range plugins {
		var out ResolveResult
		err := h.call(p, "resolveUrl", map[string]any{"url": rawURL}, &out)
		if err != nil {
			lastErr = err
			continue
		}
		if out.URL != "" || len(out.Candidates) > 0 {
			return &out, p.Manifest.ID, nil
		}
	}
	if lastErr != nil {
		return nil, "", lastErr
	}
	return nil, "", ErrURLNotResolved
}

// Inspect gathers extension metadata for an item. Plugins with extension/MIME
// declarations are only launched when the item matches, so selecting a photo
// does not spawn a markdown or audio worker.
func (h *Host) Inspect(item map[string]any) []InspectSection {
	ext, _ := item["extension"].(string)
	mime, _ := item["mimeType"].(string)
	var out []InspectSection
	for _, p := range h.Plugins() {
		if !p.Enabled || p.Manifest.Main == "" || !hasHook(p.Manifest, "inspect") {
			continue
		}
		if (len(p.Manifest.Extensions) > 0 || len(p.Manifest.MimePrefixes) > 0) &&
			!manifestMatchesItem(p.Manifest, ext, mime) {
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
		if !p.Enabled || p.Manifest.Main == "" || !hasHook(p.Manifest, "actions") {
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
	if !found || !p.Enabled || p.Manifest.Main == "" || !hasHook(p.Manifest, "runAction") {
		return errors.New("plugin action is not declared")
	}
	payload := map[string]any{"id": actionID, "items": ctx.Items, "item": ctx.Item, "folder": ctx.Folder}
	var out any
	return h.call(p, "runAction", payload, &out)
}

// CanGenerateThumbnail reports whether an enabled JS plugin advertises the
// thumbnail hook for this extension or MIME type. Native renderers are woken
// separately by the app.
func (h *Host) CanGenerateThumbnail(extension, mimeType string) bool {
	for _, p := range h.Plugins() {
		if !p.Enabled || p.Manifest.Main == "" || !hasHook(p.Manifest, "thumbnail") {
			continue
		}
		if (len(p.Manifest.Extensions) > 0 || len(p.Manifest.MimePrefixes) > 0) &&
			!manifestMatchesItem(p.Manifest, extension, mimeType) {
			continue
		}
		return true
	}
	return false
}

func hasHook(m Manifest, hook string) bool {
	for _, candidate := range m.Hooks {
		if candidate == hook {
			return true
		}
	}
	return false
}

// Thumbnail asks a plugin to render a thumbnail for an unsupported file.
func (h *Host) Thumbnail(filePath, extension, mimeType string) (map[string]any, error) {
	for _, p := range h.Plugins() {
		if !p.Enabled || p.Manifest.Main == "" || !hasHook(p.Manifest, "thumbnail") {
			continue
		}
		if (len(p.Manifest.Extensions) > 0 || len(p.Manifest.MimePrefixes) > 0) &&
			!manifestMatchesItem(p.Manifest, extension, mimeType) {
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
	var state map[string]pluginState
	if json.Unmarshal(data, &state) != nil {
		return
	}
	for id, s := range state {
		h.states[id] = s
		h.plugins[id] = &Plugin{Manifest: Manifest{ID: id}, Enabled: s.Enabled, Settings: s.Settings}
	}
}

func (h *Host) saveIndexLocked() {
	state := map[string]any{}
	for id, p := range h.plugins {
		if p.Manifest.Name == "" {
			continue
		}
		entry := pluginState{Enabled: p.Enabled, Settings: p.Settings}
		h.states[id] = entry
		state[id] = entry
	}
	// Keep persisted state for built-ins that have not been registered yet
	// (NewHost scans before App calls RegisterBuiltin). Explicit uninstall
	// removes the entry through Uninstall below.
	for id, entry := range h.states {
		if _, exists := state[id]; !exists {
			state[id] = entry
		}
	}
	data, _ := json.MarshalIndent(state, "", "  ")
	_ = os.WriteFile(h.indexPath, data, 0o644)
}
