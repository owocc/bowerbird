package core

import (
	"errors"
	"testing"
)

// setInjected replaces the linker-injected store URL for the duration of a test.
func setInjected(t *testing.T, store string) {
	t.Helper()
	previous := storeURL
	storeURL = store
	t.Cleanup(func() { storeURL = previous })
}

func TestPluginStoreURLPrecedence(t *testing.T) {
	setInjected(t, "https://injected.example.com/")

	t.Run("injected value used when environment is unset", func(t *testing.T) {
		t.Setenv(EnvPluginStoreURL, "")
		if got := PluginStoreURL(); got != "https://injected.example.com" {
			t.Errorf("PluginStoreURL() = %q, want trailing-slash-trimmed injected value", got)
		}
	})

	t.Run("environment overrides the injected value", func(t *testing.T) {
		t.Setenv(EnvPluginStoreURL, " https://local.example.com/store/ ")
		if got := PluginStoreURL(); got != "https://local.example.com/store" {
			t.Errorf("PluginStoreURL() = %q, want the trimmed environment override", got)
		}
	})

	t.Run("blank environment falls back to injected value", func(t *testing.T) {
		t.Setenv(EnvPluginStoreURL, "   ")
		if got := PluginStoreURL(); got != "https://injected.example.com" {
			t.Errorf("PluginStoreURL() = %q", got)
		}
	})

	t.Run("unset everywhere yields no store", func(t *testing.T) {
		setInjected(t, "")
		t.Setenv(EnvPluginStoreURL, "")
		if got := PluginStoreURL(); got != "" {
			t.Errorf("PluginStoreURL() = %q, want empty", got)
		}
	})
}

func TestStoreRoutesAreDerivedFromTheStoreURL(t *testing.T) {
	setInjected(t, "https://store.example.com")
	t.Setenv(EnvPluginStoreURL, "")

	if got, want := PluginManifestURL("official.demo"), "https://store.example.com/api/plugins/official.demo/manifest.json"; got != want {
		t.Errorf("PluginManifestURL() = %q, want %q", got, want)
	}
	if got, want := PluginDownloadURL("official.demo"), "https://store.example.com/api/plugins/official.demo/download"; got != want {
		t.Errorf("PluginDownloadURL() = %q, want %q", got, want)
	}
	if got, want := pluginAssetURL("official.demo", "style.css"), "https://store.example.com/api/plugins/official.demo/style.css"; got != want {
		t.Errorf("pluginAssetURL() = %q, want %q", got, want)
	}

	t.Run("no store means no route", func(t *testing.T) {
		setInjected(t, "")
		if got := PluginManifestURL("official.demo"); got != "" {
			t.Errorf("PluginManifestURL() = %q, want empty", got)
		}
		if got := PluginDownloadURL("official.demo"); got != "" {
			t.Errorf("PluginDownloadURL() = %q, want empty", got)
		}
		if got := pluginAssetURL("official.demo", "index.js"); got != "" {
			t.Errorf("pluginAssetURL() = %q, want empty", got)
		}
	})
}

func TestPluginFallbackCandidatesFollowTheStore(t *testing.T) {
	t.Run("archive first, then manifest", func(t *testing.T) {
		setInjected(t, "https://store.example.com")
		t.Setenv(EnvPluginStoreURL, "")
		got := pluginFallbackCandidates("official.demo")
		want := []string{
			"https://store.example.com/api/plugins/official.demo/download",
			"https://store.example.com/api/plugins/official.demo/manifest.json",
		}
		if len(got) != len(want) {
			t.Fatalf("got %v, want %v", got, want)
		}
		for i := range want {
			if got[i] != want[i] {
				t.Errorf("candidate %d = %q, want %q", i, got[i], want[i])
			}
		}
	})

	t.Run("no store configured means no external fallback host", func(t *testing.T) {
		setInjected(t, "")
		t.Setenv(EnvPluginStoreURL, "")
		if got := pluginFallbackCandidates("official.demo"); len(got) != 0 {
			t.Errorf("got %v, want no candidates", got)
		}
	})
}

func TestOpenMarketplaceRequiresConfiguredStore(t *testing.T) {
	setInjected(t, "")
	t.Setenv(EnvPluginStoreURL, "")

	opened := ""
	previousOpener := openStoreURL
	openStoreURL = func(rawURL string) error { opened = rawURL; return nil }
	t.Cleanup(func() { openStoreURL = previousOpener })

	if err := (&Service{}).OpenMarketplace(); !errors.Is(err, ErrStoreNotConfigured) {
		t.Fatalf("OpenMarketplace() error = %v, want ErrStoreNotConfigured", err)
	}
	if opened != "" {
		t.Errorf("opened %q, want nothing opened", opened)
	}

	t.Setenv(EnvPluginStoreURL, "https://store.example.com/")
	if err := (&Service{}).OpenMarketplace(); err != nil {
		t.Fatalf("OpenMarketplace() error = %v", err)
	}
	if opened != "https://store.example.com" {
		t.Errorf("opened %q, want the configured store URL", opened)
	}
}
