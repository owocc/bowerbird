package core

import (
	"encoding/json"
	"fmt"
	"sort"
	"testing"
)

// benchmarkWorkspaceSeed builds an in-memory 5,000-item library that mirrors
// the shape of scripts/seed-perf-library.sh.
func benchmarkWorkspaceSeed(b *testing.B, count int) *LibraryManager {
	b.Helper()
	base := b.TempDir()
	b.Setenv("BOWERBIRD_USER_DATA_DIR", base+"/userdata")
	mgr := NewLibraryManager()
	b.Cleanup(func() {
		if mgr.assetServer != nil {
			_ = mgr.assetServer.Stop()
		}
		if mgr.mobileServer != nil {
			_ = mgr.mobileServer.Stop()
		}
	})
	if _, err := mgr.CreateLibrary(base, "PerfLib"); err != nil {
		b.Fatalf("create library: %v", err)
	}
	if err := mgr.ensureCacheLoaded(); err != nil {
		b.Fatalf("load cache: %v", err)
	}

	colors := []string{"#EF4444", "#3B82F6", "#22C55E", "#9CA3AF"}
	items := make([]Item, count)
	for i := 0; i < count; i++ {
		ext := "jpg"
		mime := "image/jpeg"
		switch i % 10 {
		case 0:
			ext, mime = "mp4", "video/mp4"
		case 1:
			ext, mime = "pdf", "application/pdf"
		case 2:
			ext, mime = "mp3", "audio/mpeg"
		}
		size := int64(256*1024 + i)
		if i%10 == 0 {
			size = 20*1024*1024 + int64(i)
		} else if i%4 == 0 {
			size = 2*1024*1024 + int64(i)
		}
		items[i] = Item{
			ID:            fmt.Sprintf("SEED%060d", i),
			Name:          fmt.Sprintf("perf asset %05d", i),
			Extension:     ext,
			Filename:      fmt.Sprintf("perf-%05d.jpg", i),
			Size:          size,
			MimeType:      mime,
			Width:         600 + (i*37)%3000,
			Height:        400 + (i*53)%2000,
			Tags:          []string{fmt.Sprintf("tag-%d", i%20), fmt.Sprintf("even-%t", i%2 == 0)},
			Folders:       []string{fmt.Sprintf("f-%03d", i%20)},
			DominantColor: colors[i%4],
			Palette:       []string{colors[i%4]},
			Note:          map[bool]string{true: fmt.Sprintf("seed note %d", i), false: ""}[i%5 == 0],
			URL:           map[bool]string{true: fmt.Sprintf("https://example.com/%d", i), false: ""}[i%7 == 0],
			Rating:        i % 6,
			ImportedAt:    int64(1_700_000_000_000 + i),
			CreatedAt:     int64(1_700_000_000_000 + i),
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].ImportedAt > items[j].ImportedAt })
	mgr.cacheMu.Lock()
	mgr.itemsDesc = items
	mgr.trashDesc = nil
	mgr.itemsByID = make(map[string]Item, len(items))
	mgr.searchIndex = make(map[string]string, len(items))
	for i := range items {
		mgr.itemsByID[items[i].ID] = items[i]
		mgr.searchIndex[items[i].ID] = buildItemSearchKey(&items[i])
	}
	mgr.cacheLoaded = true
	mgr.cacheMu.Unlock()
	return mgr
}

// BenchmarkWorkspaceDataPath contrasts the old "return every item over IPC"
// path with the paginated engine path at the 5,000-item scale.
func BenchmarkWorkspaceDataPath(b *testing.B) {
	mgr := benchmarkWorkspaceSeed(b, 5000)
	spec, err := ParseQuery("")
	if err != nil {
		b.Fatal(err)
	}
	tagSpec, err := ParseQuery("tag:tag-7")
	if err != nil {
		b.Fatal(err)
	}
	colorSpec, err := ParseQuery("color:#EF4444")
	if err != nil {
		b.Fatal(err)
	}

	b.Run("baseline_GetItems_all_plus_json", func(b *testing.B) {
		b.ReportAllocs()
		var lastBytes int
		for i := 0; i < b.N; i++ {
			items, err := mgr.GetItems("", "desc")
			if err != nil {
				b.Fatal(err)
			}
			payload, err := json.Marshal(items)
			if err != nil {
				b.Fatal(err)
			}
			lastBytes = len(payload)
			b.SetBytes(int64(lastBytes))
		}
		b.Logf("payload_bytes=%d items=5000", lastBytes)
	})

	b.Run("after_QueryPage_200_plus_json", func(b *testing.B) {
		b.ReportAllocs()
		var lastBytes int
		for i := 0; i < b.N; i++ {
			page, err := mgr.QueryPage(spec, "desc", 0, 200, nil, false)
			if err != nil {
				b.Fatal(err)
			}
			payload, err := json.Marshal(page)
			if err != nil {
				b.Fatal(err)
			}
			lastBytes = len(payload)
			b.SetBytes(int64(lastBytes))
		}
		b.Logf("payload_bytes=%d items=200", lastBytes)
	})

	b.Run("after_tag_query_200_plus_json", func(b *testing.B) {
		b.ReportAllocs()
		var lastBytes int
		for i := 0; i < b.N; i++ {
			page, err := mgr.QueryPage(tagSpec, "desc", 0, 200, nil, false)
			if err != nil {
				b.Fatal(err)
			}
			payload, err := json.Marshal(page)
			if err != nil {
				b.Fatal(err)
			}
			lastBytes = len(payload)
			b.SetBytes(int64(lastBytes))
		}
		b.Logf("payload_bytes=%d items=200", lastBytes)
	})

	b.Run("after_color_query_200_plus_json", func(b *testing.B) {
		b.ReportAllocs()
		var lastBytes int
		for i := 0; i < b.N; i++ {
			page, err := mgr.QueryPage(colorSpec, "desc", 0, 200, nil, false)
			if err != nil {
				b.Fatal(err)
			}
			payload, err := json.Marshal(page)
			if err != nil {
				b.Fatal(err)
			}
			lastBytes = len(payload)
			b.SetBytes(int64(lastBytes))
		}
		b.Logf("payload_bytes=%d items=200", lastBytes)
	})

	b.Run("after_stats", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			if _, err := mgr.WorkspaceStats("desc"); err != nil {
				b.Fatal(err)
			}
		}
	})
}
