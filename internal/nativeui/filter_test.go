package nativeui

import (
	"testing"

	"bowerbird/core"
)

func testItems() []core.Item {
	return []core.Item{
		{ID: "a", Name: "Sunset.png", Extension: "png", MimeType: "image/png", Width: 1600, Height: 900, Size: 500 << 10, Tags: []string{"warm"}, Folders: []string{"f1"}, DominantColor: "#EF4444", Rating: 5, URL: "https://example.com"},
		{ID: "b", Name: "Portrait.jpg", Extension: "jpg", MimeType: "image/jpeg", Width: 800, Height: 1200, Size: 2 << 20, Tags: nil, Rating: 0},
		{ID: "c", Name: "Clip.mp4", Extension: "mp4", MimeType: "video/mp4", Width: 1920, Height: 1080, Size: 30 << 20, Tags: []string{"demo"}, Rating: 3, Note: "hello"},
	}
}

func TestComputeVisibleFilters(t *testing.T) {
	base := func() *App {
		return &App{items: testItems(), trash: nil, view: viewAll, category: "all", orientation: "all", sizeFilter: "all", hasURL: "all", hasNote: "all", ratingFilter: -1}
	}
	if got := len(base().computeVisible()); got != 3 {
		t.Fatalf("all: got %d", got)
	}
	a := base()
	a.category = "image"
	if got := len(a.computeVisible()); got != 2 {
		t.Fatalf("image: got %d", got)
	}
	a = base()
	a.query = "clip"
	if got := a.computeVisible(); len(got) != 1 || got[0].ID != "c" {
		t.Fatalf("query: %#v", got)
	}
	a = base()
	a.folderID = "f1"
	if got := a.computeVisible(); len(got) != 1 || got[0].ID != "a" {
		t.Fatalf("folder: %#v", got)
	}
	a = base()
	a.tagFilter = "demo"
	if got := a.computeVisible(); len(got) != 1 || got[0].ID != "c" {
		t.Fatalf("tag: %#v", got)
	}
	a = base()
	a.orientation = "portrait"
	if got := a.computeVisible(); len(got) != 1 || got[0].ID != "b" {
		t.Fatalf("orientation: %#v", got)
	}
	a = base()
	a.sizeFilter = "large"
	if got := a.computeVisible(); len(got) != 1 || got[0].ID != "c" {
		t.Fatalf("size: %#v", got)
	}
	a = base()
	a.hasURL = "has"
	if got := a.computeVisible(); len(got) != 1 || got[0].ID != "a" {
		t.Fatalf("url: %#v", got)
	}
	a = base()
	a.ratingFilter = 0
	if got := a.computeVisible(); len(got) != 1 || got[0].ID != "b" {
		t.Fatalf("rating: %#v", got)
	}
	a = base()
	a.colorFilter = "#EF4444"
	if got := a.computeVisible(); len(got) != 1 || got[0].ID != "a" {
		t.Fatalf("color: %#v", got)
	}
	a = base()
	a.view = viewUntagged
	if got := a.computeVisible(); len(got) != 1 || got[0].ID != "b" {
		t.Fatalf("untagged: %#v", got)
	}
	a = base()
	a.view = viewUncategorized
	if got := a.computeVisible(); len(got) != 2 {
		t.Fatalf("uncategorized: %#v", got)
	}
}

func TestThumbBucket(t *testing.T) {
	cases := []struct {
		h float32
		w int
	}{{40, 128}, {70, 192}, {100, 256}, {160, 384}, {240, 512}, {300, 768}}
	for _, c := range cases {
		if got := thumbBucket(c.h); got != c.w {
			t.Errorf("thumbBucket(%v)=%d want %d", c.h, got, c.w)
		}
	}
}
