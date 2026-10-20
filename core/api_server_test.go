package core

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestAPIServerEndpoints(t *testing.T) {
	t.Setenv("BOWERBIRD_USER_DATA_DIR", t.TempDir())
	tempDir, err := os.MkdirTemp("", "api_server_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	mgr := NewLibraryManager()
	defer func() {
		if mgr.assetServer != nil {
			_ = mgr.assetServer.Stop()
		}
	}()

	info, err := mgr.CreateLibrary(tempDir, "APITestLib")
	if err != nil {
		t.Fatalf("failed to create library: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil library info")
	}

	port := mgr.GetAssetServerPort()
	if port <= 0 {
		t.Fatalf("expected positive server port, got %d", port)
	}
	baseURL := fmt.Sprintf("http://127.0.0.1:%d", port)

	// 1. Test CORS OPTIONS preflight
	req, _ := http.NewRequest(http.MethodOptions, baseURL+"/api/info", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("OPTIONS /api/info failed: %v", err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 204 or 200 for OPTIONS, got %d", resp.StatusCode)
	}
	if resp.Header.Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("expected Access-Control-Allow-Origin: *, got %s", resp.Header.Get("Access-Control-Allow-Origin"))
	}

	// 1b. Test GET /api/ping
	resp, err = http.Get(baseURL + "/api/ping")
	if err != nil {
		t.Fatalf("GET /api/ping failed: %v", err)
	}
	defer resp.Body.Close()
	var pingRes struct {
		Status string `json:"status"`
		Data   struct {
			Running bool `json:"running"`
			Pong    bool `json:"pong"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&pingRes); err != nil {
		t.Fatalf("failed to decode ping: %v", err)
	}
	if pingRes.Status != "success" || !pingRes.Data.Running || !pingRes.Data.Pong {
		t.Fatalf("unexpected ping response: %+v", pingRes)
	}

	// 1c. Test GET /api/health
	resp, err = http.Get(baseURL + "/api/health")
	if err != nil {
		t.Fatalf("GET /api/health failed: %v", err)
	}
	defer resp.Body.Close()
	var healthRes struct {
		Status string `json:"status"`
		Data   struct {
			Running          bool `json:"running"`
			HasActiveLibrary bool `json:"hasActiveLibrary"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&healthRes); err != nil {
		t.Fatalf("failed to decode health: %v", err)
	}
	if healthRes.Status != "success" || !healthRes.Data.Running || !healthRes.Data.HasActiveLibrary {
		t.Fatalf("unexpected health response: %+v", healthRes)
	}

	// 2. Test GET /api/info
	resp, err = http.Get(baseURL + "/api/info")
	if err != nil {
		t.Fatalf("GET /api/info failed: %v", err)
	}
	defer resp.Body.Close()
	var infoRes struct {
		Status string `json:"status"`
		Data   struct {
			Name          string       `json:"name"`
			Port          int          `json:"port"`
			ActiveLibrary *LibraryInfo `json:"activeLibrary"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&infoRes); err != nil {
		t.Fatalf("failed to parse /api/info response: %v", err)
	}
	if infoRes.Status != "success" || infoRes.Data.Name != "Bowerbird" || infoRes.Data.ActiveLibrary == nil {
		t.Fatalf("unexpected info response: %+v", infoRes)
	}

	// 3. Test POST /api/folder/create
	folderPayload := map[string]string{
		"name": "Design Assets",
	}
	payloadBytes, _ := json.Marshal(folderPayload)
	resp, err = http.Post(baseURL+"/api/folder/create", "application/json", bytes.NewReader(payloadBytes))
	if err != nil {
		t.Fatalf("POST /api/folder/create failed: %v", err)
	}
	defer resp.Body.Close()
	var folderRes struct {
		Status string `json:"status"`
		Data   Folder `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&folderRes); err != nil {
		t.Fatalf("failed to decode folder creation: %v", err)
	}
	if folderRes.Status != "success" || folderRes.Data.Name != "Design Assets" {
		t.Fatalf("unexpected folder creation: %+v", folderRes)
	}
	createdFolderID := folderRes.Data.ID

	// 4. Test GET /api/folders
	resp, err = http.Get(baseURL + "/api/folders")
	if err != nil {
		t.Fatalf("GET /api/folders failed: %v", err)
	}
	defer resp.Body.Close()
	var foldersRes struct {
		Status string   `json:"status"`
		Data   []Folder `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&foldersRes); err != nil {
		t.Fatalf("failed to decode folders: %v", err)
	}
	if len(foldersRes.Data) != 1 || foldersRes.Data[0].ID != createdFolderID {
		t.Fatalf("expected 1 folder with id %s, got %+v", createdFolderID, foldersRes.Data)
	}

	// 5. Test POST /api/item/addFromBase64
	tiny1x1PNG := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
	importPayload := map[string]any{
		"base64":     "data:image/png;base64," + tiny1x1PNG,
		"name":       "My Red Pixel",
		"website":    "https://example.com/gallery",
		"annotation": "A test pixel note",
		"tags":       []string{"pixel", "art"},
		"folderId":   createdFolderID,
		"rating":     4,
	}
	payloadBytes, _ = json.Marshal(importPayload)
	resp, err = http.Post(baseURL+"/api/item/addFromBase64", "application/json", bytes.NewReader(payloadBytes))
	if err != nil {
		t.Fatalf("POST /api/item/addFromBase64 failed: %v", err)
	}
	defer resp.Body.Close()
	var itemRes struct {
		Status string `json:"status"`
		Data   Item   `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&itemRes); err != nil {
		t.Fatalf("failed to decode import item: %v", err)
	}
	if itemRes.Status != "success" || itemRes.Data.Name != "My Red Pixel" {
		t.Fatalf("unexpected import result: %+v", itemRes)
	}
	if itemRes.Data.URL != "https://example.com/gallery" {
		t.Fatalf("expected item URL to be preserved, got: %s", itemRes.Data.URL)
	}
	if len(itemRes.Data.Tags) != 2 || itemRes.Data.Rating != 4 {
		t.Fatalf("expected tags and rating to be preserved, got tags=%v rating=%d", itemRes.Data.Tags, itemRes.Data.Rating)
	}

	// 6. Test GET /api/tags
	resp, err = http.Get(baseURL + "/api/tags")
	if err != nil {
		t.Fatalf("GET /api/tags failed: %v", err)
	}
	defer resp.Body.Close()
	var tagsRes struct {
		Status string `json:"status"`
		Data   []Tag  `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tagsRes); err != nil {
		t.Fatalf("failed to decode tags: %v", err)
	}
	if len(tagsRes.Data) < 2 {
		t.Fatalf("expected at least 2 tags, got %d", len(tagsRes.Data))
	}

	// 7. Test POST /api/item/addBookmark
	bookmarkPayload := map[string]any{
		"url":        "https://wxt.dev",
		"title":      "WXT Extension Framework",
		"annotation": "Awesome extension toolkit",
		"tags":       []string{"devtools"},
		"folderId":   createdFolderID,
	}
	payloadBytes, _ = json.Marshal(bookmarkPayload)
	resp, err = http.Post(baseURL+"/api/item/addBookmark", "application/json", bytes.NewReader(payloadBytes))
	if err != nil {
		t.Fatalf("POST /api/item/addBookmark failed: %v", err)
	}
	defer resp.Body.Close()
	var bookmarkRes struct {
		Status string `json:"status"`
		Data   Item   `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&bookmarkRes); err != nil {
		t.Fatalf("failed to decode bookmark item: %v", err)
	}
	if bookmarkRes.Status != "success" || bookmarkRes.Data.Name != "WXT Extension Framework" {
		t.Fatalf("unexpected bookmark item result: %+v", bookmarkRes)
	}
	if bookmarkRes.Data.URL != "https://wxt.dev" {
		t.Fatalf("expected bookmark url https://wxt.dev, got %s", bookmarkRes.Data.URL)
	}

	// 8. Test POST /api/item/addFromURL using an httptest local server with distinct content
	tinyDistinctPNG := "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M/AwNDMwMAAAA30BDHZZ7n0AAAAAElFTkSuQmCC"
	testHTTPServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rawBytes, _ := base64.StdEncoding.DecodeString(tinyDistinctPNG)
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(rawBytes)
	}))
	defer testHTTPServer.Close()

	urlPayload := map[string]any{
		"url":        testHTTPServer.URL + "/image.png",
		"name":       "Remote Image",
		"website":    testHTTPServer.URL + "/page",
		"tags":       []string{"web"},
		"folderId":   createdFolderID,
		"annotation": "Downloaded remotely",
	}
	payloadBytes, _ = json.Marshal(urlPayload)
	resp, err = http.Post(baseURL+"/api/item/addFromURL", "application/json", bytes.NewReader(payloadBytes))
	if err != nil {
		t.Fatalf("POST /api/item/addFromURL failed: %v", err)
	}
	defer resp.Body.Close()
	var urlRes struct {
		Status string `json:"status"`
		Data   Item   `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&urlRes); err != nil {
		t.Fatalf("failed to decode url item: %v", err)
	}
	if urlRes.Status != "success" || urlRes.Data.Name != "Remote Image" {
		t.Fatalf("unexpected url item result: %+v", urlRes)
	}

	// 9. Test POST /api/item/addFromURLs (batch)
	batchPayload := map[string]any{
		"items": []map[string]any{
			{
				"url":     testHTTPServer.URL + "/batch1.png",
				"name":    "Batch 1",
				"website": testHTTPServer.URL,
			},
			{
				"base64":  "data:image/png;base64," + tiny1x1PNG,
				"name":    "Batch 2",
				"website": testHTTPServer.URL,
			},
		},
		"folderId": createdFolderID,
		"tags":     []string{"batch-import"},
	}
	payloadBytes, _ = json.Marshal(batchPayload)
	resp, err = http.Post(baseURL+"/api/item/addFromURLs", "application/json", bytes.NewReader(payloadBytes))
	if err != nil {
		t.Fatalf("POST /api/item/addFromURLs failed: %v", err)
	}
	defer resp.Body.Close()
	var batchRes struct {
		Status string `json:"status"`
		Data   struct {
			Total   int    `json:"total"`
			Success int    `json:"success"`
			Failed  int    `json:"failed"`
			Items   []Item `json:"items"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&batchRes); err != nil {
		t.Fatalf("failed to decode batch response: %v", err)
	}
	if batchRes.Status != "success" || batchRes.Data.Success < 1 {
		t.Fatalf("unexpected batch result: %+v", batchRes)
	}

	// 10. Test GET /api/items
	resp, err = http.Get(baseURL + "/api/items")
	if err != nil {
		t.Fatalf("GET /api/items failed: %v", err)
	}
	defer resp.Body.Close()
	var itemsRes struct {
		Status string `json:"status"`
		Data   []Item `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&itemsRes); err != nil {
		t.Fatalf("failed to decode items: %v", err)
	}
	if len(itemsRes.Data) < 3 {
		t.Fatalf("expected at least 3 items, got %d", len(itemsRes.Data))
	}
}
