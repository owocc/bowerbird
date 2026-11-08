package plugin

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestLocalPluginResolvesURL(t *testing.T) {
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node is not installed")
	}
	dir := t.TempDir()
	pluginDir := filepath.Join(dir, "demo")
	if err := os.MkdirAll(pluginDir, 0o755); err != nil {
		t.Fatal(err)
	}
	manifest := `{"id":"test.demo","name":"Demo","version":"1.0.0","main":"index.js","permissions":{"network":[]}}`
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
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node is not installed")
	}
	dir := t.TempDir()
	pluginDir := filepath.Join(dir, "net")
	if err := os.MkdirAll(pluginDir, 0o755); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(pluginDir, "plugin.json"), []byte(`{"id":"test.net","name":"Net","version":"1.0.0"}`), 0o644)
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
	if !strings.Contains(strings.ToLower(res.Name), "permission") {
		t.Fatalf("expected a permission error, got %+v", res)
	}
}
