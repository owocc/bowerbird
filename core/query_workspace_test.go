package core

import "testing"

func TestQueryPageDesktopScopes(t *testing.T) {
	mgr := newQueryTestManager(t)
	seedQueryCache(t, mgr, []Item{
		{ID: "a", Name: "A", Extension: "jpg", MimeType: "image/jpeg", Size: 100, Tags: []string{"red"}, Folders: []string{"f1"}, Rating: 5, ImportedAt: 500},
		{ID: "b", Name: "B", Extension: "png", MimeType: "image/png", Size: 200, Tags: []string{"blue"}, Folders: []string{"f2"}, Rating: 0, ImportedAt: 400},
		{ID: "c", Name: "C", Extension: "mp4", MimeType: "video/mp4", Size: 300, Folders: []string{"f3"}, Rating: 3, ImportedAt: 300},
		{ID: "d", Name: "D", Extension: "mp3", MimeType: "audio/mpeg", Size: 400, Rating: 0, ImportedAt: 200},
	})

	spec, err := ParseQuery("")
	if err != nil {
		t.Fatal(err)
	}
	page, err := mgr.QueryPage(spec, "desc", 0, 10, []string{"f1", "f2"}, false)
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 2 || !equalStrings(itemIDs(page.Items), []string{"a", "b"}) {
		t.Fatalf("folder scope = %v total=%d", itemIDs(page.Items), page.Total)
	}
	if page.TotalSize != 300 {
		t.Fatalf("scope total size = %d, want 300", page.TotalSize)
	}

	page, err = mgr.QueryPage(spec, "desc", 0, 10, nil, true)
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 2 || !equalStrings(itemIDs(page.Items), []string{"b", "d"}) {
		t.Fatalf("unrated = %v total=%d", itemIDs(page.Items), page.Total)
	}

	// Grammar filters and the desktop-only predicates still AND together.
	spec, _ = ParseQuery("tag:red")
	page, err = mgr.QueryPage(spec, "desc", 0, 10, []string{"f2"}, false)
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 0 || len(page.Items) != 0 {
		t.Fatalf("combined filters should be empty, got %v", itemIDs(page.Items))
	}

	// Paging sees the full filtered space, not just the first page.
	page, err = mgr.QueryPage(QuerySpec{}, "asc", 1, 2, nil, false)
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 4 || !equalStrings(itemIDs(page.Items), []string{"c", "b"}) {
		t.Fatalf("asc page = %v total=%d", itemIDs(page.Items), page.Total)
	}
}

func TestWorkspaceStatsAndFolderPreviews(t *testing.T) {
	mgr := newQueryTestManager(t)
	seedQueryCache(t, mgr, []Item{
		{ID: "a", Extension: "jpg", Size: 100, Tags: []string{"red"}, Folders: []string{"f1"}, DominantColor: "#FF0000", ImportedAt: 500},
		{ID: "b", Extension: "png", Size: 200, Folders: []string{"f2"}, DominantColor: "#FF0000", ImportedAt: 400},
		{ID: "c", Extension: "mp4", Size: 300, Tags: []string{"blue"}, Folders: []string{"f1"}, DominantColor: "#0000FF", ImportedAt: 300},
		{ID: "d", Extension: "mp3", Size: 400, Folders: []string{"f1"}, ImportedAt: 200},
	})

	stats, err := mgr.WorkspaceStats("desc")
	if err != nil {
		t.Fatal(err)
	}
	if stats.Total != 4 || stats.UntaggedCount != 2 || stats.UncategorizedCount != 0 || stats.TotalSize != 1000 {
		t.Fatalf("stats = %+v", stats)
	}
	if len(stats.TopColors) != 2 || stats.TopColors[0] != "#FF0000" || stats.TopColors[1] != "#0000FF" {
		t.Fatalf("top colors = %v", stats.TopColors)
	}

	previews, err := mgr.FolderPreviews([][]string{{"f1"}, {"f2"}, {"f1", "f2"}}, "desc")
	if err != nil {
		t.Fatal(err)
	}
	if len(previews) != 3 {
		t.Fatalf("previews len = %d", len(previews))
	}
	if previews[0].Total != 3 || !equalStrings(itemIDs(previews[0].Items), []string{"a", "c", "d"}) {
		t.Fatalf("f1 preview = %+v", previews[0])
	}
	if previews[1].Total != 1 || !equalStrings(itemIDs(previews[1].Items), []string{"b"}) {
		t.Fatalf("f2 preview = %+v", previews[1])
	}
	if previews[2].Total != 4 {
		t.Fatalf("union preview total = %d", previews[2].Total)
	}

	previews, err = mgr.FolderPreviews([][]string{{"f1"}}, "asc")
	if err != nil {
		t.Fatal(err)
	}
	if !equalStrings(itemIDs(previews[0].Items), []string{"d", "c", "a"}) {
		t.Fatalf("asc preview = %v", itemIDs(previews[0].Items))
	}
}
