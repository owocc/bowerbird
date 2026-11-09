package core_test

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"testing"

	"bowerbird/core"
)

func TestImportFromURLSkipURL(t *testing.T) {
	var buf bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(buf.Bytes())
	}))
	defer srv.Close()

	t.Setenv("BOWERBIRD_USER_DATA_DIR", t.TempDir())
	mgr := core.NewLibraryManager()
	if _, err := mgr.CreateLibrary(t.TempDir(), "URLTest"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = mgr.CloseLibrary() })

	withURL, err := mgr.ImportFromURLWithOptions(srv.URL+"/with.png", core.ImportItemOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if withURL.URL != srv.URL+"/with.png" {
		t.Fatalf("URL = %q, want source URL", withURL.URL)
	}

	// Content-addressed dedupe means a second identical payload would return the
	// existing item; use a different color so this is a fresh item.
	img.Set(1, 0, color.RGBA{B: 255, A: 255})
	buf.Reset()
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	withoutURL, err := mgr.ImportFromURLWithOptions(srv.URL+"/without.png", core.ImportItemOptions{SkipURL: true})
	if err != nil {
		t.Fatal(err)
	}
	if withoutURL.URL != "" {
		t.Fatalf("URL = %q, want empty when SkipURL is set", withoutURL.URL)
	}
}
