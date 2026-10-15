package core_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"strings"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"net/http"

	"bowerbird/core"
)

func TestRecycleBinAndFoldersAndTags(t *testing.T) {
	tempDir := t.TempDir()
	// Keep the manager's user data store out of the real user profile, and
	// release the index database before the temp dir is removed (Windows cannot
	// delete a file that still has an open handle).
	t.Setenv("BOWERBIRD_USER_DATA_DIR", t.TempDir())
	mgr := core.NewLibraryManager()
	t.Cleanup(func() { _ = mgr.CloseLibrary() })
	libInfo, err := mgr.CreateLibrary(tempDir, "TestLib")
	if err != nil {
		t.Fatalf("CreateLibrary failed: %v", err)
	}

	// 1. Create dummy files
	f1 := filepath.Join(tempDir, "sample1.txt")
	f2 := filepath.Join(tempDir, "sample2.txt")
	_ = os.WriteFile(f1, []byte("content 1"), 0644)
	_ = os.WriteFile(f2, []byte("content 2"), 0644)

	items, err := mgr.ImportFiles([]string{f1, f2})
	if err != nil || len(items) != 2 {
		t.Fatalf("ImportFiles failed: %v, items: %v", err, items)
	}
	item1 := items[0]
	item2 := items[1]

	// 2. Folders
	folderA, err := mgr.CreateFolder("Folder A", "")
	if err != nil {
		t.Fatalf("CreateFolder A failed: %v", err)
	}
	folderB, err := mgr.CreateFolder("Folder B", "")
	if err != nil {
		t.Fatalf("CreateFolder B failed: %v", err)
	}

	// Add item1 to Folder A and Folder B (multi-folder)
	_ = mgr.AddItemToFolder(item1.ID, folderA.ID)
	_ = mgr.AddItemToFolder(item1.ID, folderB.ID)
	// Add item2 to Folder A
	_ = mgr.AddItemToFolder(item2.ID, folderA.ID)

	folders, err := mgr.GetFolders()
	if err != nil {
		t.Fatalf("GetFolders failed: %v", err)
	}
	for _, f := range folders {
		if f.ID == folderA.ID && f.ItemCount != 2 {
			t.Errorf("Folder A expected 2 items, got %d", f.ItemCount)
		}
		if f.ID == folderB.ID && f.ItemCount != 1 {
			t.Errorf("Folder B expected 1 item, got %d", f.ItemCount)
		}
	}

	// 3. MoveToTrash
	err = mgr.MoveToTrash(item1.ID)
	if err != nil {
		t.Fatalf("MoveToTrash failed: %v", err)
	}

	// Verify item1 is not in GetItems
	activeItems, _ := mgr.GetItems("", "desc")
	if len(activeItems) != 1 || activeItems[0].ID != item2.ID {
		t.Fatalf("Expected only item2 in active items, got %d items", len(activeItems))
	}

	// Verify folder counts exclude trashed item1
	folders, _ = mgr.GetFolders()
	for _, f := range folders {
		if f.ID == folderA.ID && f.ItemCount != 1 {
			t.Errorf("Folder A expected 1 item after trash, got %d", f.ItemCount)
		}
		if f.ID == folderB.ID && f.ItemCount != 0 {
			t.Errorf("Folder B expected 0 items after trash, got %d", f.ItemCount)
		}
	}

	// Verify trash count and items
	trashCount, _ := mgr.GetTrashCount()
	if trashCount != 1 {
		t.Errorf("Expected 1 item in trash, got %d", trashCount)
	}
	trashItems, _ := mgr.GetTrashItems("", "desc")
	if len(trashItems) != 1 || trashItems[0].ID != item1.ID {
		t.Fatalf("Expected item1 in trash items, got %v", trashItems)
	}
	// Verify trash item records all original folders
	if len(trashItems[0].Folders) != 2 {
		t.Errorf("Expected item1 in trash to record 2 folders, got %d (%v)", len(trashItems[0].Folders), trashItems[0].Folders)
	}

	// 4. RestoreFromTrash
	err = mgr.RestoreFromTrash(item1.ID)
	if err != nil {
		t.Fatalf("RestoreFromTrash failed: %v", err)
	}

	trashCount, _ = mgr.GetTrashCount()
	if trashCount != 0 {
		t.Errorf("Expected 0 items in trash after restore, got %d", trashCount)
	}

	// Verify item1 is back in active items and folders are restored
	activeItems, _ = mgr.GetItems("", "desc")
	if len(activeItems) != 2 {
		t.Fatalf("Expected 2 active items after restore, got %d", len(activeItems))
	}
	folders, _ = mgr.GetFolders()
	for _, f := range folders {
		if f.ID == folderA.ID && f.ItemCount != 2 {
			t.Errorf("Folder A expected 2 items after restore, got %d", f.ItemCount)
		}
		if f.ID == folderB.ID && f.ItemCount != 1 {
			t.Errorf("Folder B expected 1 item after restore, got %d", f.ItemCount)
		}
	}

	// 5. Test MoveItemToFolder (sidebar drag = move)
	err = mgr.MoveItemToFolder(item2.ID, folderA.ID, folderB.ID)
	if err != nil {
		t.Fatalf("MoveItemToFolder failed: %v", err)
	}
	item2Updated, _ := mgr.GetItem(item2.ID)
	if len(item2Updated.Folders) != 1 || item2Updated.Folders[0] != folderB.ID {
		t.Errorf("Expected item2 to be only in Folder B, got %v", item2Updated.Folders)
	}

	// 6. Test Tags
	tags, err := mgr.GetTags()
	if err != nil {
		t.Fatalf("GetTags failed: %v", err)
	}
	if len(tags) == 0 || tags[0].Name != core.FavoriteTagName {
		t.Errorf("Expected first tag to be the built-in Favorites tag, got %v", tags)
	}

	// Add tag to item
	err = mgr.AddTagToItem(item1.ID, "Landscape")
	if err != nil {
		t.Fatalf("AddTagToItem failed: %v", err)
	}
	// Toggle favorite
	fav, err := mgr.ToggleFavorite(item1.ID)
	if err != nil || !fav {
		t.Fatalf("ToggleFavorite failed: fav=%v, err=%v", fav, err)
	}
	item1WithTags, _ := mgr.GetItem(item1.ID)
	if len(item1WithTags.Tags) != 2 {
		t.Errorf("Expected 2 tags on item1, got %v", item1WithTags.Tags)
	}

	// 7. Test RenameItem
	renamed, err := mgr.RenameItem(item1.ID, "NewSampleName")
	if err != nil {
		t.Fatalf("RenameItem failed: %v", err)
	}
	if renamed.Name != "NewSampleName" || renamed.Filename != "NewSampleName.txt" {
		t.Errorf("Unexpected renamed name %s or filename %s", renamed.Name, renamed.Filename)
	}
	// Verify physical file was renamed
	if _, statErr := os.Stat(renamed.FilePath); statErr != nil {
		t.Errorf("Physical file was not renamed properly: %v", statErr)
	}

	// 8. Test Recursive Folder Import
	subDirParent := filepath.Join(tempDir, "ImportTreeRoot")
	_ = os.MkdirAll(filepath.Join(subDirParent, "SubA", "SubB"), 0755)
	_ = os.WriteFile(filepath.Join(subDirParent, "root.txt"), []byte("root file"), 0644)
	_ = os.WriteFile(filepath.Join(subDirParent, "SubA", "sub_a.txt"), []byte("sub a file"), 0644)
	_ = os.WriteFile(filepath.Join(subDirParent, "SubA", "SubB", "sub_b.txt"), []byte("sub b file"), 0644)

	createdTreeRoot, err := mgr.ImportFolderRecursively(subDirParent, "")
	if err != nil {
		t.Fatalf("ImportFolderRecursively failed: %v", err)
	}
	if createdTreeRoot == nil || createdTreeRoot.Name != "ImportTreeRoot" {
		t.Fatalf("Unexpected root folder: %v", createdTreeRoot)
	}
	allFoldersTree, _ := mgr.GetFolders()
	foundRoot := false
	for _, f := range allFoldersTree {
		if f.Name == "ImportTreeRoot" {
			foundRoot = true
			if len(f.Children) != 1 || f.Children[0].Name != "SubA" {
				t.Errorf("Expected SubA under ImportTreeRoot, got %v", f.Children)
			}
		}
	}
	if !foundRoot {
		t.Errorf("ImportTreeRoot not found in folders")
	}

	// Verify ImportFoldersRecursively skips plain files
	plainFile := filepath.Join(tempDir, "not_a_dir.txt")
	_ = os.WriteFile(plainFile, []byte("plain"), 0644)
	importedFolders, err := mgr.ImportFoldersRecursively([]string{plainFile}, "")
	if err != nil {
		t.Fatalf("ImportFoldersRecursively error: %v", err)
	}
	if len(importedFolders) != 0 {
		t.Errorf("Expected 0 folders imported from plain file, got %d", len(importedFolders))
	}
	// 9. Test PermanentDeleteItem
	_ = mgr.MoveToTrash(item2.ID)
	err = mgr.PermanentDeleteItem(item2.ID)
	if err != nil {
		t.Fatalf("PermanentDeleteItem failed: %v", err)
	}
	deletedItem, _ := mgr.GetItem(item2.ID)
	if deletedItem != nil {
		t.Errorf("Expected item2 to be completely deleted")
	}

	_ = libInfo
}

func TestImagePaletteAndMetadataExtraction(t *testing.T) {
	tempDir := t.TempDir()
	t.Setenv("BOWERBIRD_USER_DATA_DIR", t.TempDir())
	mgr := core.NewLibraryManager()
	t.Cleanup(func() { _ = mgr.CloseLibrary() })

	if _, err := mgr.CreateLibrary(tempDir, "ColorTestLib"); err != nil {
		t.Fatalf("CreateLibrary failed: %v", err)
	}

	// Generate a 160x90 (16:9 landscape) PNG with a dominant red region and secondary blue region
	img := image.NewRGBA(image.Rect(0, 0, 160, 90))
	for y := range 90 {
		for x := range 160 {
			if x < 120 {
				img.SetRGBA(x, y, color.RGBA{R: 239, G: 68, B: 68, A: 255})
			} else {
				img.SetRGBA(x, y, color.RGBA{R: 59, G: 130, B: 246, A: 255})
			}
		}
	}
	imgPath := filepath.Join(tempDir, "palette_test.png")
	f, err := os.Create(imgPath)
	if err != nil {
		t.Fatalf("failed to create test PNG: %v", err)
	}
	if err := png.Encode(f, img); err != nil {
		_ = f.Close()
		t.Fatalf("failed to encode test PNG: %v", err)
	}
	_ = f.Close()

	items, err := mgr.ImportFiles([]string{imgPath})
	if err != nil || len(items) != 1 {
		t.Fatalf("ImportFiles failed: %v, len=%d", err, len(items))
	}

	imported := items[0]
	if imported.DominantColor == "" {
		t.Errorf("Expected non-empty DominantColor")
	}
	if len(imported.Palette) < 2 {
		t.Errorf("Expected at least 2 colors in Palette, got %v", imported.Palette)
	}
	if imported.Meta == nil {
		t.Fatalf("Expected non-nil ImageMeta")
	}
	if imported.Meta.Orientation != "landscape" {
		t.Errorf("Expected orientation=landscape, got %s", imported.Meta.Orientation)
	}
	if imported.Meta.AspectRatio != "16:9" {
		t.Errorf("Expected aspectRatio=16:9, got %s", imported.Meta.AspectRatio)
	}

	// Verify persistence through GetItems and GetItem
	fetched, err := mgr.GetItem(imported.ID)
	if err != nil || fetched == nil {
		t.Fatalf("GetItem failed: %v", err)
	}
	if fetched.DominantColor != imported.DominantColor {
		t.Errorf("GetItem DominantColor mismatch: got %s, want %s", fetched.DominantColor, imported.DominantColor)
	}
	if fetched.Meta == nil || fetched.Meta.AspectRatio != "16:9" {
		t.Errorf("GetItem Meta was not persisted properly: %+v", fetched.Meta)
	}
}

func TestVideoMimeTypesAndAssetStreamingCORS(t *testing.T) {
	tempDir := t.TempDir()
	t.Setenv("BOWERBIRD_USER_DATA_DIR", t.TempDir())
	mgr := core.NewLibraryManager()
	t.Cleanup(func() { _ = mgr.CloseLibrary() })

	if _, err := mgr.CreateLibrary(tempDir, "VideoTestLib"); err != nil {
		t.Fatalf("CreateLibrary failed: %v", err)
	}

	// 1. Verify comprehensive video MIME detection and .ts disambiguation
	cases := []struct {
		name     string
		payload  []byte
		wantMime string
	}{
		{"clip.mp4", []byte{0x00, 0x00, 0x00, 0x18, 'f', 't', 'y', 'p'}, "video/mp4"},
		{"movie.mkv", []byte{0x1a, 0x45, 0xdf, 0xa3}, "video/x-matroska"},
		{"stream.flv", []byte{'F', 'L', 'V', 0x01}, "video/x-flv"},
		{"playlist.m3u8", []byte("#EXTM3U\n"), "application/vnd.apple.mpegurl"},
		{"manifest.mpd", []byte("<MPD></MPD>"), "application/dash+xml"},
		{"camera.mts", []byte{0x47, 0x40, 0x00, 0x10}, "video/mp2t"},
		// MPEG-TS packet starts with 0x47 sync byte every 188 bytes
		{"broadcast.ts", append(append([]byte{0x47}, make([]byte, 187)...), 0x47, 0x00), "video/mp2t"},
		// TypeScript source file with .ts extension
		{"component.ts", []byte("export const x: number = 42;\n"), "text/typescript"},
	}

	for _, tc := range cases {
		p := filepath.Join(tempDir, tc.name)
		if err := os.WriteFile(p, tc.payload, 0o644); err != nil {
			t.Fatalf("write %s: %v", tc.name, err)
		}
		items, err := mgr.ImportFiles([]string{p})
		if err != nil || len(items) != 1 {
			t.Fatalf("ImportFiles(%s) failed: %v", tc.name, err)
		}
		if items[0].MimeType != tc.wantMime {
			t.Errorf("%s: got mimeType=%q, want %q", tc.name, items[0].MimeType, tc.wantMime)
		}
	}

	// 2. Verify AssetServer Range & CORS headers for MSE players (hls.js / mpegts.js / dash.js)
	allItems, err := mgr.GetItems("", "imported_desc")
	if err != nil || len(allItems) == 0 {
		t.Fatalf("GetItems failed: %v", err)
	}
	req, err := http.NewRequest("GET", allItems[0].OriginalURL, nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req.Header.Set("Range", "bytes=0-3")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET OriginalURL failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusPartialContent {
		t.Errorf("Expected 206 Partial Content for Range request, got %d", resp.StatusCode)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("Expected Access-Control-Allow-Origin=*, got %q", got)
	}

	// 3. Verify SaveItemThumbnail API (via POST /asset/item/<id>/thumbnail) saves cover,
	// extracts dominantColor + 6-color palette, and updates SQLite + metadata.json for video color search
	var targetVideo core.Item
	for _, it := range allItems {
		if it.Extension == "mp4" {
			targetVideo = it
			break
		}
	}

	coverImg := image.NewRGBA(image.Rect(0, 0, 320, 180))
	for y := range 180 {
		for x := range 320 {
			if x < 220 {
				coverImg.SetRGBA(x, y, color.RGBA{R: 34, G: 197, B: 94, A: 255}) // Green (#22C55E)
			} else {
				coverImg.SetRGBA(x, y, color.RGBA{R: 239, G: 68, B: 68, A: 255}) // Red (#EF4444)
			}
		}
	}
	var pngBuf bytes.Buffer
	if err := png.Encode(&pngBuf, coverImg); err != nil {
		t.Fatalf("png.Encode cover: %v", err)
	}
	b64DataUrl := "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBuf.Bytes())

	postBody, _ := json.Marshal(map[string]any{
		"base64Data": b64DataUrl,
		"width":      1920,
		"height":     1080,
	})
	postResp, err := http.Post(targetVideo.ThumbnailURL, "application/json", bytes.NewReader(postBody))
	if err != nil {
		t.Fatalf("POST ThumbnailURL failed: %v", err)
	}
	defer postResp.Body.Close()
	if postResp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK from POST ThumbnailURL, got %d", postResp.StatusCode)
	}

	updatedVideo, err := mgr.GetItem(targetVideo.ID)
	if err != nil || updatedVideo == nil {
		t.Fatalf("GetItem after SaveItemThumbnail failed: %v", err)
	}
	if !updatedVideo.HasThumbnail {
		t.Errorf("Expected HasThumbnail=true on video after SaveItemThumbnail")
	}
	if updatedVideo.Width != 1920 || updatedVideo.Height != 1080 {
		t.Errorf("Expected video dimensions 1920x1080, got %dx%d", updatedVideo.Width, updatedVideo.Height)
	}
	if !strings.HasPrefix(updatedVideo.DominantColor, "#") {
		t.Errorf("Expected extracted DominantColor hex for video, got %q", updatedVideo.DominantColor)
	}
	if len(updatedVideo.Palette) < 2 {
		t.Errorf("Expected extracted Palette for video color search, got %v", updatedVideo.Palette)
	}
	if updatedVideo.Meta == nil || updatedVideo.Meta.AspectRatio != "16:9" || updatedVideo.Meta.Orientation != "landscape" {
		t.Errorf("Expected video ImageMeta 16:9 landscape, got %+v", updatedVideo.Meta)
	}
}
