package core_test

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"bowerbird/core"
)

func TestExtractMediaFromHTMLPrefersOpenGraphThenImages(t *testing.T) {
	page := `<html><head>
		<meta property="og:image" content="/media/hero.jpg">
		<meta name="twitter:image" content="https://cdn.example.com/twitter.jpg">
	</head><body>
		<a href="/pin/42"><img data-src="//cdn.example.com/lazy.webp" src="data:image/gif;base64,AA"></a>
	</body></html>`

	media, referer := core.ExtractMediaFromHTML("https://www.example.com/pin/42", []byte(page))
	if len(media) < 3 {
		t.Fatalf("media = %v, want og/twitter/img candidates", media)
	}
	if media[0] != "https://www.example.com/media/hero.jpg" {
		t.Fatalf("media[0] = %q, want resolved og:image", media[0])
	}
	if media[1] != "https://cdn.example.com/twitter.jpg" {
		t.Fatalf("media[1] = %q, want twitter:image", media[1])
	}
	foundLazy := false
	for _, u := range media {
		if u == "https://cdn.example.com/lazy.webp" {
			foundLazy = true
		}
	}
	if !foundLazy {
		t.Fatalf("media = %v, want protocol-relative data-src resolved", media)
	}
	if referer != "https://www.example.com/pin/42" {
		t.Fatalf("referer = %q, want page URL", referer)
	}
}

func TestLooksLikeHTML(t *testing.T) {
	if !core.LooksLikeHTML("text/html; charset=utf-8", []byte("x")) {
		t.Fatal("text/html should be a page")
	}
	if core.LooksLikeHTML("image/png", []byte("<html>")) {
		t.Fatal("image content type must not be a page")
	}
	if !core.LooksLikeHTML("application/octet-stream", []byte("\n<!DOCTYPE html><html>")) {
		t.Fatal("html doctype should be a page")
	}
}

func TestImportFromURLDoesNotStoreWebPage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><meta property="og:image" content="/a.png"></head></html>`))
	}))
	defer srv.Close()

	t.Setenv("BOWERBIRD_USER_DATA_DIR", t.TempDir())
	mgr := core.NewLibraryManager()
	if _, err := mgr.CreateLibrary(t.TempDir(), "PageTest"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = mgr.CloseLibrary() })

	if _, err := mgr.ImportFromURLWithOptions(srv.URL+"/pin/1", core.ImportItemOptions{}); err == nil {
		t.Fatal("expected a web page URL to be rejected, not imported")
	} else if !strings.Contains(err.Error(), "web page") {
		t.Fatalf("err = %v, want web page error", err)
	}
}

func TestImportFromURLDirectImage(t *testing.T) {
	var buf bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 3, 2))
	img.Set(1, 1, color.RGBA{G: 255, A: 255})
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
	if _, err := mgr.CreateLibrary(t.TempDir(), "DirectTest"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = mgr.CloseLibrary() })

	item, err := mgr.ImportFromURLWithOptions(srv.URL+"/image.png", core.ImportItemOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if item.Extension != "png" {
		t.Fatalf("extension = %q, want png", item.Extension)
	}
}
