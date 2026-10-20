package core

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestMobileAPIEndpoints(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "mobile_api_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)
	t.Setenv("BOWERBIRD_USER_DATA_DIR", filepath.Join(tempDir, "userdata"))

	mgr := NewLibraryManager()
	defer func() {
		if mgr.assetServer != nil {
			_ = mgr.assetServer.Stop()
		}
		if mgr.mobileServer != nil {
			_ = mgr.mobileServer.Stop()
		}
	}()

	info, err := mgr.CreateLibrary(tempDir, "MobileTestLib")
	if err != nil {
		t.Fatalf("failed to create library: %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil library info")
	}

	mobileSrv := mgr.GetMobileServer()
	if mobileSrv == nil {
		t.Fatal("expected non-nil mobile server")
	}

	port := mobileSrv.GetPort()
	if port <= 0 {
		t.Fatalf("expected positive server port, got %d", port)
	}
	baseURL := fmt.Sprintf("http://127.0.0.1:%d", port)

	// 1. Test GET /api/v1/status (unauthenticated)
	resp, err := http.Get(baseURL + "/api/v1/status")
	if err != nil {
		t.Fatalf("GET /api/v1/status failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for status, got %d", resp.StatusCode)
	}
	var status MobileStatusResponse
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		t.Fatalf("failed to decode status response: %v", err)
	}
	if status.Name != "MobileTestLib" {
		t.Errorf("expected library name MobileTestLib, got %s", status.Name)
	}
	if status.Version != MobileServerVersion {
		t.Errorf("expected version %s, got %s", MobileServerVersion, status.Version)
	}
	if !status.PairingRequired {
		t.Errorf("expected pairingRequired to be true by default")
	}

	// 2. Test accessing protected endpoint without token (should fail 401)
	resp, err = http.Get(baseURL + "/api/v1/items")
	if err != nil {
		t.Fatalf("GET /api/v1/items without auth failed: %v", err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 unauthorized, got %d", resp.StatusCode)
	}

	// 3. Test POST /api/v1/pair with wrong code (should fail 401 and return {"error":"invalid_code"})
	pairPayload := map[string]string{
		"code":       "000000_wrong",
		"deviceName": "TestPhone",
	}
	pairBody, _ := json.Marshal(pairPayload)
	resp, err = http.Post(baseURL+"/api/v1/pair", "application/json", bytes.NewReader(pairBody))
	if err != nil {
		t.Fatalf("POST /api/v1/pair failed: %v", err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for wrong pairing code, got %d", resp.StatusCode)
	}
	var errResp map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&errResp)
	resp.Body.Close()
	if errResp["error"] != "invalid_code" {
		t.Errorf("expected error field to be 'invalid_code', got %v", errResp["error"])
	}
	// 4. Test POST /api/v1/pair with correct pairing code
	activeCode := mobileSrv.GetPairingCode()
	if len(activeCode) != 6 {
		t.Fatalf("expected 6-digit pairing code, got %s", activeCode)
	}

	pairPayload["code"] = activeCode
	pairBody, _ = json.Marshal(pairPayload)
	resp, err = http.Post(baseURL+"/api/v1/pair", "application/json", bytes.NewReader(pairBody))
	if err != nil {
		t.Fatalf("POST /api/v1/pair failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for correct pairing code, got %d", resp.StatusCode)
	}

	var pairResp APIResponse
	if err := json.NewDecoder(resp.Body).Decode(&pairResp); err != nil {
		t.Fatalf("failed to decode pair response: %v", err)
	}
	pairData, ok := pairResp.Data.(map[string]any)
	if !ok || pairData["token"] == nil {
		t.Fatalf("expected token in response, got %v", pairResp.Data)
	}
	token := pairData["token"].(string)
	if len(token) != 64 {
		t.Fatalf("expected 64-char hex token, got %s", token)
	}

	// Verify token is in store
	if !mgr.GetUserDataStore().HasMobileToken(token) {
		t.Fatal("expected token to be persisted in UserDataStore")
	}

	// 5. Import sample assets for testing list, detail, thumb, original
	samplePNG := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	imported1, err := mgr.ImportFromBase64WithOptions("test_image.png", samplePNG, ImportItemOptions{
		Name: "Test Image",
		Tags: []string{"nature", "mobile"},
	})
	if err != nil {
		t.Fatalf("failed to import test image: %v", err)
	}

	sampleJPG := "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QzwAEjDAGFgYA2y8DCVpS2+QAAAAASUVORK5CYII="
	imported2, err := mgr.ImportFromBase64WithOptions("other.jpg", sampleJPG, ImportItemOptions{
		Name: "Landscape Photo",
		Tags: []string{"travel"},
	})
	if err != nil {
		t.Fatalf("failed to import second image: %v", err)
	}

	// 6. Test GET /api/v1/items with Bearer token
	client := &http.Client{}
	req, _ := http.NewRequest(http.MethodGet, baseURL+"/api/v1/items?limit=10&offset=0", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("GET /api/v1/items failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var itemsResp MobileItemsResponse
	if err := json.NewDecoder(resp.Body).Decode(&itemsResp); err != nil {
		t.Fatalf("failed to decode items response: %v", err)
	}
	if itemsResp.Total != 2 {
		t.Fatalf("expected 2 items, got %d", itemsResp.Total)
	}
	if len(itemsResp.Items) != 2 {
		t.Fatalf("expected 2 items in list, got %d", len(itemsResp.Items))
	}
	firstItem := itemsResp.Items[0]
	if firstItem.ThumbnailURL == "" || firstItem.OriginalURL == "" {
		t.Fatalf("expected non-empty thumbnail and original URLs: %+v", firstItem)
	}

	// 7. Test query filtering (?q=landscape)
	req, _ = http.NewRequest(http.MethodGet, baseURL+"/api/v1/items?q=landscape", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("GET /api/v1/items?q=landscape failed: %v", err)
	}
	defer resp.Body.Close()
	var qResp MobileItemsResponse
	_ = json.NewDecoder(resp.Body).Decode(&qResp)
	if qResp.Total != 1 || qResp.Items[0].ID != imported2.ID {
		t.Fatalf("expected 1 item matching landscape (%s), got %d", imported2.ID, qResp.Total)
	}

	// 8. Test tag filtering (?tag=nature)
	req, _ = http.NewRequest(http.MethodGet, baseURL+"/api/v1/items?tag=nature", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("GET /api/v1/items?tag=nature failed: %v", err)
	}
	defer resp.Body.Close()
	var tagResp MobileItemsResponse
	_ = json.NewDecoder(resp.Body).Decode(&tagResp)
	if tagResp.Total != 1 || tagResp.Items[0].ID != imported1.ID {
		t.Fatalf("expected 1 item matching tag nature (%s), got %d", imported1.ID, tagResp.Total)
	}

	// 9. Test type filtering (?type=image)
	req, _ = http.NewRequest(http.MethodGet, baseURL+"/api/v1/items?type=image", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("GET /api/v1/items?type=image failed: %v", err)
	}
	defer resp.Body.Close()
	var typeResp MobileItemsResponse
	_ = json.NewDecoder(resp.Body).Decode(&typeResp)
	if typeResp.Total != 2 {
		t.Fatalf("expected 2 image items, got %d", typeResp.Total)
	}

	// 10. Test GET /api/v1/items/{id}
	req, _ = http.NewRequest(http.MethodGet, baseURL+"/api/v1/items/"+imported1.ID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("GET /api/v1/items/{id} failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var detailItem Item
	if err := json.NewDecoder(resp.Body).Decode(&detailItem); err != nil {
		t.Fatalf("failed to decode detail item: %v", err)
	}
	if detailItem.ID != imported1.ID || detailItem.Name != "Test Image" {
		t.Fatalf("expected detail item for %s, got %+v", imported1.ID, detailItem)
	}

	// 11. Test GET /api/v1/thumbs/{id}
	req, _ = http.NewRequest(http.MethodGet, baseURL+"/api/v1/thumbs/"+imported1.ID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("GET /api/v1/thumbs/{id} failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for thumbnail, got %d", resp.StatusCode)
	}
	thumbData, err := io.ReadAll(resp.Body)
	if err != nil || len(thumbData) == 0 {
		t.Fatalf("expected non-empty thumbnail data")
	}

	// 12. Test GET /api/v1/originals/{id} with Range request
	req, _ = http.NewRequest(http.MethodGet, baseURL+"/api/v1/originals/"+imported1.ID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Range", "bytes=0-10")
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("GET /api/v1/originals/{id} with Range failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusPartialContent && resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 206 Partial Content or 200, got %d", resp.StatusCode)
	}
	if resp.StatusCode == http.StatusPartialContent {
		if resp.Header.Get("Content-Range") == "" {
			t.Errorf("expected Content-Range header for Range request")
		}
	}


	// 12a. Test GET /api/v1/tags
	req, _ = http.NewRequest(http.MethodGet, baseURL+"/api/v1/tags", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("GET /api/v1/tags failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for tags, got %d", resp.StatusCode)
	}
	var tagsList []Tag
	if err := json.NewDecoder(resp.Body).Decode(&tagsList); err != nil {
		t.Fatalf("failed to decode tags response: %v", err)
	}
	if len(tagsList) == 0 {
		t.Errorf("expected tags list to contain at least the default tag or item tags")
	}

	// 12b. Test GET /api/v1/folders
	req, _ = http.NewRequest(http.MethodGet, baseURL+"/api/v1/folders", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("GET /api/v1/folders failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for folders, got %d", resp.StatusCode)
	}
	var foldersList []Folder
	if err := json.NewDecoder(resp.Body).Decode(&foldersList); err != nil {
		t.Fatalf("failed to decode folders response: %v", err)
	}

	// 12c. Test GET /api/v1/colors
	req, _ = http.NewRequest(http.MethodGet, baseURL+"/api/v1/colors", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("GET /api/v1/colors failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for colors, got %d", resp.StatusCode)
	}
	var colorsList []string
	if err := json.NewDecoder(resp.Body).Decode(&colorsList); err != nil {
		t.Fatalf("failed to decode colors response: %v", err)
	}

	// 12d. Test GET /api/v1/items with tag, folder, and color filters
	req, _ = http.NewRequest(http.MethodGet, baseURL+"/api/v1/items?tag=nature", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err = client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/v1/items?tag=sample-tag failed: %v, status %d", err, resp.StatusCode)
	}
	var tagFilteredResp MobileItemsResponse
	_ = json.NewDecoder(resp.Body).Decode(&tagFilteredResp)
	resp.Body.Close()
	if tagFilteredResp.Total != 1 {
		t.Errorf("expected 1 item with tag nature, got %d", tagFilteredResp.Total)
	}
	// 13. Test Service RPC methods for desktop integration
	svc := NewService(mgr)
	srvStatus, err := svc.GetMobileServerStatus()
	if err != nil {
		t.Fatalf("GetMobileServerStatus failed: %v", err)
	}
	if !srvStatus.Running || !srvStatus.Enabled {
		t.Errorf("expected mobile server to be running and enabled: %+v", srvStatus)
	}
	if srvStatus.PairedDevices != 1 {
		t.Errorf("expected 1 paired device, got %d", srvStatus.PairedDevices)
	}

	// Test code regeneration
	oldCode := srvStatus.PairingCode
	newCode, err := svc.RegenerateMobilePairingCode()
	if err != nil {
		t.Fatalf("RegenerateMobilePairingCode failed: %v", err)
	}
	if len(newCode) != 6 {
		t.Fatalf("expected 6-digit code, got %s", newCode)
	}
	_ = oldCode

	// Test disabling and enabling mobile server
	if err := svc.SetMobileServerEnabled(false); err != nil {
		t.Fatalf("SetMobileServerEnabled(false) failed: %v", err)
	}
	if mobileSrv.IsRunning() {
		t.Errorf("expected mobile server to be stopped")
	}
	if err := svc.SetMobileServerEnabled(true); err != nil {
		t.Fatalf("SetMobileServerEnabled(true) failed: %v", err)
	}
	if !mobileSrv.IsRunning() {
		t.Errorf("expected mobile server to be running again")
	}
	port = mobileSrv.GetPort()
	baseURL = fmt.Sprintf("http://127.0.0.1:%d", port)
	// Test GetMobilePairingURL
	pairingURL, err := svc.GetMobilePairingURL()
	if err != nil {
		t.Fatalf("GetMobilePairingURL failed: %v", err)
	}
	if !strings.HasPrefix(pairingURL, "bowerbird://pair?data=") {
		t.Fatalf("expected bowerbird://pair?data= prefix, got %s", pairingURL)
	}
	// 14. Test WebSocket connection and events
	wsCtx, wsCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer wsCancel()
	wsURL := fmt.Sprintf("ws://127.0.0.1:%d/api/v1/ws?token=%s", port, token)
	wsConn, _, wsErr := websocket.Dial(wsCtx, wsURL, nil)
	if wsErr != nil {
		t.Fatalf("WebSocket connection failed: %v", wsErr)
	}
	defer wsConn.Close(websocket.StatusNormalClosure, "test done")

	// Trigger library switch to test library_changed ws event
	secondLib, err := mgr.CreateLibrary(tempDir, "SecondLib")
	if err != nil {
		t.Fatalf("failed to create second library: %v", err)
	}
	_ = secondLib

	// Read ws event
	_, msg, err := wsConn.Read(wsCtx)
	if err != nil {
		t.Fatalf("failed to read ws event: %v", err)
	}
	var wsEv map[string]any
	if err := json.Unmarshal(msg, &wsEv); err != nil {
		t.Fatalf("failed to parse ws event: %v", err)
	}
	if wsEv["event"] != "library_changed" {
		t.Errorf("expected library_changed event, got %v", wsEv["event"])
	}

	// 15. Test GET /api/v1/libraries
	req, _ = http.NewRequest(http.MethodGet, baseURL+"/api/v1/libraries", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err = client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/v1/libraries failed: %v, status %d", err, resp.StatusCode)
	}
	var libsResp struct {
		Libraries []MobileLibraryEntry `json:"libraries"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&libsResp)
	resp.Body.Close()
	if len(libsResp.Libraries) < 2 {
		t.Errorf("expected at least 2 libraries, got %d", len(libsResp.Libraries))
	}

	// 16. Test POST /api/v1/libraries/switch (switch back to first library)
	switchPayload, _ := json.Marshal(map[string]string{
		"path": info.Path,
	})
	req, _ = http.NewRequest(http.MethodPost, baseURL+"/api/v1/libraries/switch", bytes.NewReader(switchPayload))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err = client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/v1/libraries/switch failed: %v, status %d", err, resp.StatusCode)
	}
	resp.Body.Close()

	if mgr.GetActiveLibraryPath() != info.Path {
		t.Errorf("expected active library to switch back to %s, got %s", info.Path, mgr.GetActiveLibraryPath())
	}
	// Read ws event for switch
	_, msg, err = wsConn.Read(wsCtx)
	if err != nil {
		t.Fatalf("failed to read switch ws event: %v", err)
	}
	var switchEv map[string]any
	_ = json.Unmarshal(msg, &switchEv)
	if switchEv["event"] != "library_changed" {
		t.Errorf("expected library_changed event after switch, got %v", switchEv["event"])
	}

	// 17. Test POST /api/v1/upload multipart upload
	var uploadBuf bytes.Buffer
	mw := multipart.NewWriter(&uploadBuf)
	filePart, err := mw.CreateFormFile("file", "uploaded_photo.png")
	if err != nil {
		t.Fatalf("failed to create multipart file part: %v", err)
	}
	pngBytes, _ := hex.DecodeString("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360606060000000050001a7e48b520000000049454e44ae426082")
	_, _ = filePart.Write(pngBytes)
	mw.Close()

	req, _ = http.NewRequest(http.MethodPost, baseURL+"/api/v1/upload", &uploadBuf)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	resp, err = client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/v1/upload failed: %v, status %d", err, resp.StatusCode)
	}
	var uploadResp struct {
		Status string `json:"status"`
		Count  int    `json:"count"`
		Items  []Item `json:"items"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&uploadResp)
	resp.Body.Close()
	if uploadResp.Status != "success" || uploadResp.Count != 1 {
		t.Errorf("expected upload success with 1 item, got status %s count %d", uploadResp.Status, uploadResp.Count)
	}

	// Read ws event for items_updated
	_, msg, err = wsConn.Read(wsCtx)
	if err != nil {
		t.Fatalf("failed to read items_updated ws event: %v", err)
	}
	var itemsEv map[string]any
	_ = json.Unmarshal(msg, &itemsEv)
	if itemsEv["event"] != "items_updated" {
		t.Errorf("expected items_updated event, got %v", itemsEv["event"])
	}

	// 18. Test SetMobileAllowedNetworks and discovery filtering
	if err := svc.SetMobileAllowedNetworks([]string{"en0"}); err != nil {
		t.Fatalf("SetMobileAllowedNetworks failed: %v", err)
	}
	updatedStatus, err := svc.GetMobileServerStatus()
	if err != nil {
		t.Fatalf("GetMobileServerStatus failed: %v", err)
	}
	if len(updatedStatus.AllowedNetworks) != 1 || updatedStatus.AllowedNetworks[0] != "en0" {
		t.Errorf("expected allowedNetworks [en0], got %v", updatedStatus.AllowedNetworks)
	}
}

func TestMobileWebSocketItemsUpdatedCoverage(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "mobile_ws_cov_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)
	t.Setenv("BOWERBIRD_USER_DATA_DIR", filepath.Join(tempDir, "userdata"))

	mgr := NewLibraryManager()
	defer func() {
		if mgr.assetServer != nil {
			_ = mgr.assetServer.Stop()
		}
		if mgr.mobileServer != nil {
			_ = mgr.mobileServer.Stop()
		}
	}()

	info, err := mgr.CreateLibrary(tempDir, "WSCovLib")
	if err != nil || info == nil {
		t.Fatalf("failed to create library: %v", err)
	}

	mobileSrv := mgr.GetMobileServer()
	if mobileSrv == nil {
		t.Fatal("expected non-nil mobile server")
	}

	port := mobileSrv.GetPort()
	baseURL := fmt.Sprintf("http://127.0.0.1:%d", port)

	// Pair to obtain valid token
	pairPayload, _ := json.Marshal(map[string]string{
		"code":       mobileSrv.GetPairingCode(),
		"deviceName": "WSTester",
	})
	resp, err := http.Post(baseURL+"/api/v1/pair", "application/json", bytes.NewReader(pairPayload))
	if err != nil {
		t.Fatalf("pair request failed: %v", err)
	}
	var pairResp APIResponse
	if err := json.NewDecoder(resp.Body).Decode(&pairResp); err != nil {
		t.Fatalf("failed to decode pair response: %v", err)
	}
	resp.Body.Close()
	pairData, ok := pairResp.Data.(map[string]any)
	if !ok || pairData["token"] == nil {
		t.Fatalf("expected token in response, got %v", pairResp.Data)
	}
	token := pairData["token"].(string)

	// Connect websocket
	wsURL := fmt.Sprintf("ws://127.0.0.1:%d/api/v1/ws?token=%s", port, token)
	wsConn, _, err := websocket.Dial(context.Background(), wsURL, nil)
	if err != nil {
		t.Fatalf("failed to connect ws: %v", err)
	}
	defer wsConn.Close(websocket.StatusNormalClosure, "done")

	readNextItemsUpdated := func(actionName string) {
		t.Helper()
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		for {
			_, msg, rErr := wsConn.Read(ctx)
			if rErr != nil {
				t.Fatalf("[%s] failed to read ws event: %v", actionName, rErr)
			}
			var ev map[string]any
			if err := json.Unmarshal(msg, &ev); err != nil {
				t.Fatalf("[%s] failed to parse ws event: %v", actionName, err)
			}
			if ev["event"] == "items_updated" {
				return
			}
			// Skip any other unexpected broadcast events (e.g. initial library events)
		}
	}

	// 1. Create a test image item directly
	testImgPath := filepath.Join(tempDir, "sample.png")
	pngBytes, _ := hex.DecodeString("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360606060000000050001a7e48b520000000049454e44ae426082")
	if err := os.WriteFile(testImgPath, pngBytes, 0644); err != nil {
		t.Fatalf("failed to write test img: %v", err)
	}

	imported, err := mgr.ImportFiles([]string{testImgPath})
	if err != nil || len(imported) == 0 {
		t.Fatalf("failed to import test file: %v", err)
	}
	item := imported[0]
	readNextItemsUpdated("ImportFiles")

	// 2. Test UpdateItemDetails
	_, err = mgr.UpdateItemDetails(item.ID, "updated note test", "https://example.com", 5, "updated prompt")
	if err != nil {
		t.Fatalf("UpdateItemDetails failed: %v", err)
	}
	readNextItemsUpdated("UpdateItemDetails")

	// 3. Test MoveToTrash
	if err := mgr.MoveToTrash(item.ID); err != nil {
		t.Fatalf("MoveToTrash failed: %v", err)
	}
	readNextItemsUpdated("MoveToTrash")

	// 4. Test RestoreFromTrash
	if err := mgr.RestoreFromTrash(item.ID); err != nil {
		t.Fatalf("RestoreFromTrash failed: %v", err)
	}
	readNextItemsUpdated("RestoreFromTrash")
}
