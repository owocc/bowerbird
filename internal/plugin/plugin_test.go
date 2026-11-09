package plugin

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"bowerbird/core"
)

func TestLocalPluginResolvesURL(t *testing.T) {
	dir := t.TempDir()
	pluginDir := filepath.Join(dir, "demo")
	if err := os.MkdirAll(pluginDir, 0o755); err != nil {
		t.Fatal(err)
	}
	manifest := `{"id":"test.demo","name":"Demo","version":"1.0.0","main":"index.js","hooks":["resolveUrl"],"permissions":{"network":[]}}`
	if err := os.WriteFile(filepath.Join(pluginDir, "plugin.json"), []byte(manifest), 0o644); err != nil {
		t.Fatal(err)
	}
	code := `export function resolveUrl({ url }) {
  if (!url.startsWith("demo:")) return null;
  return { url: "https://example.com/a.png", candidates: ["https://example.com/a.png"], sourceUrl: url, name: "demo", tags: ["demo"] };
}`
	if err := os.WriteFile(filepath.Join(pluginDir, "index.js"), []byte(code), 0o644); err != nil {
		t.Fatal(err)
	}
	h := NewHost(filepath.Join(dir, "installed"))
	h.SetLocalDirs(dir)
	res, id, err := h.Resolve("demo:42")
	if err != nil {
		t.Fatal(err)
	}
	if id != "test.demo" || res.Name != "demo" || len(res.Candidates) != 1 {
		t.Fatalf("result = %+v id=%s", res, id)
	}
}

func TestNetworkIsDeniedWithoutPermission(t *testing.T) {
	dir := t.TempDir()
	pluginDir := filepath.Join(dir, "net")
	if err := os.MkdirAll(pluginDir, 0o755); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(pluginDir, "plugin.json"), []byte(`{"id":"test.net","name":"Net","version":"1.0.0","main":"index.js","hooks":["resolveUrl"]}`), 0o644)
	os.WriteFile(filepath.Join(pluginDir, "index.js"), []byte(`export async function resolveUrl(){ try { await fetch("https://example.com"); return {url:"https://example.com"}; } catch (e) { return {name: String(e)}; } }`), 0o644)
	h := NewHost(filepath.Join(dir, "installed"))
	h.SetLocalDirs(dir)
	p, ok := h.Get("test.net")
	if !ok {
		t.Fatal("plugin not discovered")
	}
	var res ResolveResult
	if err := h.call(p, "resolveUrl", map[string]any{}, &res); err != nil {
		t.Fatal(err)
	}
	// moejs/webapi surfaces a denied fetch as a rejected promise (TypeError:
	// fetch failed); the important part is that it never returned a URL.
	if res.URL != "" || res.Name == "" {
		t.Fatalf("expected a denied fetch, got %+v", res)
	}
}

func TestNativePluginWithoutEntryModule(t *testing.T) {
	dir := t.TempDir()
	pluginDir := filepath.Join(dir, "native")
	if err := os.MkdirAll(pluginDir, 0o755); err != nil {
		t.Fatal(err)
	}
	manifest := `{"id":"test.native","name":"Native","version":"2.0.0","kind":"preview","native":"markdown","extensions":[".MD"],"priority":50}`
	if err := os.WriteFile(filepath.Join(pluginDir, "plugin.json"), []byte(manifest), 0o644); err != nil {
		t.Fatal(err)
	}
	h := NewHost(filepath.Join(dir, "installed"))
	h.SetLocalDirs(dir)
	p, ok := h.Get("test.native")
	if !ok {
		t.Fatal("native plugin not discovered")
	}
	if p.Manifest.Native != "markdown" || p.Manifest.Main != "" {
		t.Fatalf("unexpected manifest: %+v", p.Manifest)
	}
	if got := p.Manifest.Extensions; len(got) != 1 || got[0] != "md" {
		t.Fatalf("extensions = %v", got)
	}
	match := h.MatchPreview("md", "text/markdown")
	if match == nil || match.Manifest.ID != "test.native" {
		t.Fatalf("MatchPreview = %+v", match)
	}
	if h.MatchPreview("png", "image/png") != nil {
		t.Fatal("unexpected match for png")
	}
}

func TestRegisterBuiltinPersistsEnabledState(t *testing.T) {
	dir := t.TempDir()
	h := NewHost(dir)
	h.RegisterBuiltin(OfficialManifests()...)
	if !h.IsEnabled("official.markdown-preview") {
		t.Fatal("builtin should start enabled")
	}
	h.SetEnabled("official.markdown-preview", false)

	for i := 0; i < 2; i++ {
		reloaded := NewHost(dir)
		reloaded.RegisterBuiltin(OfficialManifests()...)
		if reloaded.IsEnabled("official.markdown-preview") {
			t.Fatalf("disabled state was not persisted on restart %d", i+1)
		}
		if got := reloaded.MatchPreview("md", "text/markdown"); got != nil {
			t.Fatalf("disabled builtin still matched: %+v", got)
		}
	}
}

func TestURLHostIndexAndPatterns(t *testing.T) {
	dir := t.TempDir()
	pluginDir := filepath.Join(dir, "resolver")
	if err := os.MkdirAll(pluginDir, 0o755); err != nil {
		t.Fatal(err)
	}
	manifest := `{
		"id":"test.resolver","name":"Resolver","version":"2.0.0","kind":"resolver",
		"main":"index.js","priority":55,"hooks":["resolveUrl"],
		"urlHosts":["example.com","*.example.com"],
		"urlPatterns":["^https?://(?:[a-z0-9-]+\\.)*example\\.com/item/\\d+"]
	}`
	if err := os.WriteFile(filepath.Join(pluginDir, "plugin.json"), []byte(manifest), 0o644); err != nil {
		t.Fatal(err)
	}
	code := `export function resolveUrl({ url }) { return { url: "https://cdn.example.com/a.jpg", candidates: ["https://cdn.example.com/a.jpg"], sourceUrl: url } }`
	if err := os.WriteFile(filepath.Join(pluginDir, "index.js"), []byte(code), 0o644); err != nil {
		t.Fatal(err)
	}
	h := NewHost(filepath.Join(dir, "installed"))
	h.SetLocalDirs(dir)

	res, id, err := h.Resolve("https://www.example.com/item/42")
	if err != nil || id != "test.resolver" || res.URL != "https://cdn.example.com/a.jpg" {
		t.Fatalf("resolve: id=%s res=%+v err=%v", id, res, err)
	}
	if _, _, err := h.Resolve("https://www.example.com/other/42"); !errors.Is(err, ErrNoURLResolver) {
		t.Fatalf("pattern miss err = %v, want ErrNoURLResolver", err)
	}
	if _, _, err := h.Resolve("https://unrelated.test/item/42"); !errors.Is(err, ErrNoURLResolver) {
		t.Fatalf("host miss err = %v, want ErrNoURLResolver", err)
	}
}

func TestMatchURLHostWildcards(t *testing.T) {
	cases := []struct {
		host, pattern string
		want          bool
	}{
		{"pinterest.com", "pinterest.com", true},
		{"www.pinterest.com", "*.pinterest.com", true},
		{"pinterest.com", "*.pinterest.com", false},
		{"pinterest.co.uk", "pinterest.*", true},
		{"www.pinterest.co.uk", "*.pinterest.*", true},
		{"i-123.pinimg.com", "i-*.pinimg.com", true},
		{"evilpinterest.com", "*.pinterest.*", false},
	}
	for _, tc := range cases {
		if got := matchURLHost(tc.host, tc.pattern); got != tc.want {
			t.Errorf("matchURLHost(%q, %q) = %v, want %v", tc.host, tc.pattern, got, tc.want)
		}
	}
}

func TestPluginLogAPIAndHookLogging(t *testing.T) {
	dir := t.TempDir()
	pluginDir := filepath.Join(dir, "logger")
	if err := os.MkdirAll(pluginDir, 0o755); err != nil {
		t.Fatal(err)
	}
	manifest := `{"id":"test.logger","name":"Logger","version":"1.0.0","main":"index.js","hooks":["inspect"]}`
	if err := os.WriteFile(filepath.Join(pluginDir, "plugin.json"), []byte(manifest), 0o644); err != nil {
		t.Fatal(err)
	}
	code := `export function inspect() {
	host.log("info", "hello-from-plugin", "detail-line");
	host.log("warn", "two-arg-level");
	console.warn("console-line");
	return { sections: [] };
}`
	if err := os.WriteFile(filepath.Join(pluginDir, "index.js"), []byte(code), 0o644); err != nil {
		t.Fatal(err)
	}
	h := NewHost(filepath.Join(dir, "installed"))
	h.SetLocalDirs(dir)
	p, ok := h.Get("test.logger")
	if !ok {
		t.Fatal("plugin not discovered")
	}
	var out InspectResult
	if err := h.call(p, "inspect", map[string]any{"item": map[string]any{"id": "x"}}, &out); err != nil {
		t.Fatal(err)
	}
	logs := core.GetLogsSnapshot()
	joined := ""
	for _, entry := range logs {
		if entry.Category == "plugin" {
			joined += entry.Message + " " + entry.Detail + "\n"
		}
	}
	for _, want := range []string{"hello-from-plugin", "two-arg-level", "console-line", "hook inspect start", "hook inspect done"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("plugin log missing %q\n%s", want, joined)
		}
	}
}

func TestOfficialManifestsDeclareCapabilitiesAndDenyJS(t *testing.T) {
	seen := map[string]bool{}
	for _, manifest := range OfficialManifests() {
		m := manifest
		if err := validateManifest(&m); err != nil {
			t.Fatalf("%s: %v", m.ID, err)
		}
		if seen[m.ID] {
			t.Fatalf("duplicate official plugin id %s", m.ID)
		}
		seen[m.ID] = true
		if m.Native == "" {
			t.Fatalf("%s: native renderer is required", m.ID)
		}
		if m.Main != "" || len(m.Hooks) != 0 {
			t.Fatalf("%s: native built-in must not ship JavaScript hooks", m.ID)
		}
		if len(m.Permissions.Network) != 0 || len(m.Permissions.Process) != 0 || m.Permissions.OpenExternal {
			t.Fatalf("%s: native built-in must not request permissions", m.ID)
		}
		if len(m.Extensions) == 0 && len(m.MimePrefixes) == 0 && m.Native != "prompt" {
			t.Fatalf("%s: no file selectors declared", m.ID)
		}
	}
}

func TestRepositoryPluginsDeclareHooksAndPermissions(t *testing.T) {
	root, err := filepath.Abs("../../plugins")
	if err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	found := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		dir := filepath.Join(root, entry.Name())
		if _, err := os.Stat(filepath.Join(dir, "plugin.json")); err != nil {
			continue
		}
		p, err := loadPlugin(dir)
		if err != nil {
			t.Fatalf("%s: %v", entry.Name(), err)
		}
		found++
		if p.Manifest.Main != "" {
			if len(p.Manifest.Hooks) == 0 {
				t.Fatalf("%s: JavaScript plugin has no declared hooks", p.Manifest.ID)
			}
			for _, hook := range p.Manifest.Hooks {
				if !hasHook(p.Manifest, hook) {
					t.Fatalf("%s: hook %s not normalized", p.Manifest.ID, hook)
				}
			}
		}
	}
	if found < 5 {
		t.Fatalf("only %d repository plugins validated", found)
	}
	pinterest, err := loadPlugin(filepath.Join(root, "pinterest"))
	if err != nil {
		t.Fatal(err)
	}
	wantHooks := []string{"resolveUrl", "inspect", "actions", "runAction"}
	for _, hook := range wantHooks {
		if !hasHook(pinterest.Manifest, hook) {
			t.Fatalf("pinterest missing declared hook %s", hook)
		}
	}
	if len(pinterest.Manifest.Permissions.Network) == 0 || len(pinterest.Manifest.Permissions.Process) != 0 {
		t.Fatalf("pinterest permissions = %+v", pinterest.Manifest.Permissions)
	}
}

func TestUndeclaredHookIsDenied(t *testing.T) {
	dir := t.TempDir()
	pluginDir := filepath.Join(dir, "undeclared")
	if err := os.MkdirAll(pluginDir, 0o755); err != nil {
		t.Fatal(err)
	}
	manifest := `{"id":"test.undeclared","name":"Undeclared","version":"1.0.0","main":"index.js","hooks":["inspect"]}`
	if err := os.WriteFile(filepath.Join(pluginDir, "plugin.json"), []byte(manifest), 0o644); err != nil {
		t.Fatal(err)
	}
	code := `export function resolveUrl() { return { url: "https://evil.example/x" } }`
	if err := os.WriteFile(filepath.Join(pluginDir, "index.js"), []byte(code), 0o644); err != nil {
		t.Fatal(err)
	}
	h := NewHost(filepath.Join(dir, "installed"))
	h.SetLocalDirs(dir)
	p, ok := h.Get("test.undeclared")
	if !ok {
		t.Fatal("plugin not discovered")
	}
	var out ResolveResult
	if err := h.call(p, "resolveUrl", map[string]any{"url": "x"}, &out); !errors.Is(err, ErrHookNotDeclared) {
		t.Fatalf("undeclared hook err = %v, want ErrHookNotDeclared", err)
	}
}

func TestPermissionGatedHostAPIs(t *testing.T) {
	dir := t.TempDir()
	add := func(name, manifest, code string) {
		t.Helper()
		pluginDir := filepath.Join(dir, name)
		if err := os.MkdirAll(pluginDir, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(pluginDir, "plugin.json"), []byte(manifest), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(pluginDir, "index.js"), []byte(code), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	code := `export function inspect() {
	return { sections: [{ title: "caps", rows: [
		{ label: "spawn", value: typeof host.spawn },
		{ label: "platformOpen", value: typeof host.platformOpen },
		{ label: "fetch", value: typeof host.fetch }
	] }] };
}`
	add("denied", `{"id":"test.caps.denied","name":"Denied","version":"1.0.0","main":"index.js","hooks":["inspect"],"permissions":{}}`, code)
	add("granted", `{"id":"test.caps.granted","name":"Granted","version":"1.0.0","main":"index.js","hooks":["inspect"],"permissions":{"network":["example.com"],"process":["echo"],"openExternal":true}}`, strings.Replace(code, `title: "caps"`, `title: "granted"`, 1))

	h := NewHost(filepath.Join(dir, "installed"))
	h.SetLocalDirs(dir)
	sections := h.Inspect(map[string]any{"id": "x"})
	values := map[string]string{}
	for _, section := range sections {
		for _, row := range section.Rows {
			values[section.Title+"."+row.Label] = row.Value
		}
	}
	if values["caps.spawn"] != "undefined" || values["caps.platformOpen"] != "undefined" || values["caps.fetch"] != "undefined" {
		t.Fatalf("denied plugin sees capabilities: %+v", values)
	}
	if values["granted.spawn"] != "function" || values["granted.platformOpen"] != "function" || values["granted.fetch"] != "function" {
		t.Fatalf("granted plugin capabilities: %+v", values)
	}
}

func TestOfficialBuiltinsMatchTheirSelectors(t *testing.T) {
	h := NewHost(t.TempDir())
	h.RegisterBuiltin(OfficialManifests()...)
	for _, manifest := range OfficialManifests() {
		if manifest.Native == "" || manifest.Kind != "preview" || len(manifest.Extensions) == 0 {
			continue
		}
		ext := manifest.Extensions[0]
		mime := ""
		if len(manifest.MimePrefixes) > 0 {
			mime = manifest.MimePrefixes[0]
			if strings.HasSuffix(mime, "/") {
				mime += "test"
			}
		}
		got := h.MatchPreview(ext, mime)
		if got == nil || got.Manifest.ID != manifest.ID {
			t.Fatalf("%s selector %q matched %+v", manifest.ID, ext, got)
		}
	}
}

func TestPinterestBuiltinResolvesDirectImage(t *testing.T) {
	root, err := filepath.Abs("../../plugins")
	if err != nil {
		t.Fatal(err)
	}
	h := NewHost(t.TempDir())
	h.SetLocalDirs(root)
	h.RegisterBuiltin(OfficialManifests()...)
	res, id, err := h.Resolve("https://i.pinimg.com/originals/a/b/c.jpg")
	if err != nil {
		t.Fatal(err)
	}
	if id != "official.pinterest" || res.URL != "https://i.pinimg.com/originals/a/b/c.jpg" {
		t.Fatalf("id=%s res=%+v", id, res)
	}
}
