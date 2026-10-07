package main

import (
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLibraryServiceEndToEnd(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "bowerbird_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	svc := NewLibraryService()

	// 1. Create Library
	libInfo, err := svc.CreateLibrary(tempDir, "TestAssets")
	if err != nil {
		t.Fatalf("CreateLibrary failed: %v", err)
	}

	if libInfo.Name != "TestAssets" {
		t.Errorf("Expected name TestAssets, got %s", libInfo.Name)
	}
	expectedLibPath := filepath.Join(tempDir, "TestAssets.library")
	if libInfo.Path != expectedLibPath {
		t.Errorf("Expected path %s, got %s", expectedLibPath, libInfo.Path)
	}

	// Verify files on disk
	if _, err := os.Stat(filepath.Join(expectedLibPath, "library.json")); err != nil {
		t.Errorf("library.json missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(expectedLibPath, "index.db")); err != nil {
		t.Errorf("index.db missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(expectedLibPath, "items")); err != nil {
		t.Errorf("items/ directory missing: %v", err)
	}

	// 2. Create a test image to import
	imgFile := filepath.Join(tempDir, "sample.png")
	img := image.NewRGBA(image.Rect(0, 0, 600, 400))
	for x := range 600 {
		for y := range 400 {
			img.Set(x, y, color.RGBA{R: 200, G: 100, B: 50, A: 255})
		}
	}
	f, err := os.Create(imgFile)
	if err != nil {
		t.Fatalf("Failed to create sample image: %v", err)
	}
	if err := png.Encode(f, img); err != nil {
		t.Fatalf("Failed to encode sample image: %v", err)
	}
	_ = f.Close()

	// 3. Import image file
	imported, err := svc.ImportFiles([]string{imgFile})
	if err != nil {
		t.Fatalf("ImportFiles failed: %v", err)
	}
	if len(imported) != 1 {
		t.Fatalf("Expected 1 imported item, got %d", len(imported))
	}

	item := imported[0]
	if item.Name != "sample" || item.Extension != "png" {
		t.Errorf("Unexpected item name/ext: %s.%s", item.Name, item.Extension)
	}
	if !item.HasThumbnail {
		t.Errorf("Expected HasThumbnail=true for image")
	}
	if item.Width != 600 || item.Height != 400 {
		t.Errorf("Expected 600x400, got %dx%d", item.Width, item.Height)
	}
	itemDir := filepath.Join(expectedLibPath, "items", item.ID)
	if item.FilePath != filepath.Join(itemDir, "sample.png") {
		t.Errorf("Expected FilePath %s, got %s", filepath.Join(itemDir, "sample.png"), item.FilePath)
	}
	if !strings.HasPrefix(item.FileURL, "file://") {
		t.Errorf("Expected FileURL to have file:// scheme, got %s", item.FileURL)
	}

	// Verify physical isolation
	if _, err := os.Stat(filepath.Join(itemDir, "sample.png")); err != nil {
		t.Errorf("Isolated original file missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(itemDir, "metadata.json")); err != nil {
		t.Errorf("metadata.json missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(itemDir, "thumbnail.jpg")); err != nil {
		t.Errorf("thumbnail.jpg missing: %v", err)
	}

	// Delete source file to prove isolation
	_ = os.Remove(imgFile)
	if _, err := os.Stat(filepath.Join(itemDir, "sample.png")); err != nil {
		t.Fatalf("Isolated file was corrupted after source deleted: %v", err)
	}

	// 4. Import a non-image file (document)
	docFile := filepath.Join(tempDir, "notes.txt")
	if err := os.WriteFile(docFile, []byte("Bowerbird test document content"), 0644); err != nil {
		t.Fatalf("Failed to create sample doc: %v", err)
	}
	importedDocs, err := svc.ImportFiles([]string{docFile})
	if err != nil {
		t.Fatalf("ImportFiles doc failed: %v", err)
	}
	if len(importedDocs) != 1 {
		t.Fatalf("Expected 1 imported doc, got %d", len(importedDocs))
	}
	docItem := importedDocs[0]
	if docItem.HasThumbnail {
		t.Errorf("Expected HasThumbnail=false for txt")
	}

	// 5. Query items via libSQL
	allItems, err := svc.GetItems("", "desc")
	if err != nil {
		t.Fatalf("GetItems failed: %v", err)
	}
	if len(allItems) != 2 {
		t.Fatalf("Expected 2 items in libSQL, got %d", len(allItems))
	}

	// Test search query
	searchRes, err := svc.GetItems("sample", "desc")
	if err != nil {
		t.Fatalf("GetItems search failed: %v", err)
	}
	if len(searchRes) != 1 || searchRes[0].ID != item.ID {
		t.Errorf("Search failed, got %d results", len(searchRes))
	}

	// 6. Test HTTP Asset Server endpoints
	port := svc.GetAssetServerPort()
	if port == 0 {
		t.Fatalf("Asset server port is 0")
	}

	// Test thumbnail endpoint
	thumbResp, err := http.Get(item.ThumbnailURL)
	if err != nil {
		t.Fatalf("Failed to GET thumbnail: %v", err)
	}
	defer thumbResp.Body.Close()
	if thumbResp.StatusCode != http.StatusOK {
		t.Errorf("Expected 200 for thumbnail, got %d", thumbResp.StatusCode)
	}
	if thumbResp.Header.Get("Content-Type") != "image/jpeg" {
		t.Errorf("Expected image/jpeg Content-Type, got %s", thumbResp.Header.Get("Content-Type"))
	}

	// Test download endpoint for Finder drag-out
	downResp, err := http.Get(item.DownloadURL)
	if err != nil {
		t.Fatalf("Failed to GET download URL: %v", err)
	}
	defer downResp.Body.Close()
	if downResp.StatusCode != http.StatusOK {
		t.Errorf("Expected 200 for download, got %d", downResp.StatusCode)
	}
	if downResp.Header.Get("Content-Disposition") != `attachment; filename="sample.png"` {
		t.Errorf("Unexpected Content-Disposition: %s", downResp.Header.Get("Content-Disposition"))
	}
	downloadedData, _ := io.ReadAll(downResp.Body)
	if len(downloadedData) == 0 {
		t.Errorf("Downloaded data is empty")
	}

	// 7. Test Delete
	if err := svc.DeleteItem(item.ID); err != nil {
		t.Fatalf("DeleteItem failed: %v", err)
	}
	if _, err := os.Stat(itemDir); !os.IsNotExist(err) {
		t.Errorf("Expected itemDir to be deleted, err: %v", err)
	}
	remaining, err := svc.GetItems("", "desc")
	if err != nil {
		t.Fatalf("GetItems after delete failed: %v", err)
	}
	if len(remaining) != 1 {
		t.Errorf("Expected 1 remaining item after delete, got %d", len(remaining))
	}

	_ = svc.CloseLibrary()
}
