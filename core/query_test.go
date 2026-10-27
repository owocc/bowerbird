package core

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestParseQuery(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		check   func(t *testing.T, spec QuerySpec)
		wantErr bool
	}{
		{
			name: "free text and quoted phrase",
			raw:  `sunset beach "client work"`,
			check: func(t *testing.T, spec QuerySpec) {
				if spec.Text != "sunset beach client work" {
					t.Fatalf("unexpected text %q", spec.Text)
				}
			},
		},
		{
			name: "absence filters",
			raw:  `no:url no:note`,
			check: func(t *testing.T, spec QuerySpec) {
				if len(spec.No) != 2 || spec.No[0] != "url" || spec.No[1] != "note" {
					t.Fatalf("no = %v", spec.No)
				}
			},
		},
		{
			name: "all filters",
			raw:  `type:image tag:red folder:f1 color:#EF4444 orientation:landscape size:large rating:5 has:url is:untagged`,
			check: func(t *testing.T, spec QuerySpec) {
				if spec.Text != "" {
					t.Fatalf("expected empty text, got %q", spec.Text)
				}
				if len(spec.Types) != 1 || spec.Types[0] != "image" {
					t.Fatalf("types = %v", spec.Types)
				}
				if len(spec.Tags) != 1 || spec.Tags[0] != "red" {
					t.Fatalf("tags = %v", spec.Tags)
				}
				if len(spec.Folders) != 1 || spec.Folders[0] != "f1" {
					t.Fatalf("folders = %v", spec.Folders)
				}
				if len(spec.Colors) != 1 || spec.Colors[0] != "#EF4444" {
					t.Fatalf("colors = %v", spec.Colors)
				}
				if len(spec.Orientations) != 1 || spec.Orientations[0] != "landscape" {
					t.Fatalf("orientations = %v", spec.Orientations)
				}
				if len(spec.Sizes) != 1 || spec.Sizes[0] != "large" {
					t.Fatalf("sizes = %v", spec.Sizes)
				}
				if len(spec.Ratings) != 1 || spec.Ratings[0] != 5 {
					t.Fatalf("ratings = %v", spec.Ratings)
				}
				if len(spec.Has) != 1 || spec.Has[0] != "url" {
					t.Fatalf("has = %v", spec.Has)
				}
				if !spec.Untagged {
					t.Fatal("expected untagged")
				}
			},
		},
		{
			name: "quoted filter value",
			raw:  `tag:"client work" folder:none`,
			check: func(t *testing.T, spec QuerySpec) {
				if len(spec.Tags) != 1 || spec.Tags[0] != "client work" {
					t.Fatalf("tags = %v", spec.Tags)
				}
				if len(spec.Folders) != 1 || spec.Folders[0] != "none" {
					t.Fatalf("folders = %v", spec.Folders)
				}
			},
		},
		{
			name: "unknown key stays text",
			raw:  `camera:leica foo`,
			check: func(t *testing.T, spec QuerySpec) {
				if spec.Text != "camera:leica foo" {
					t.Fatalf("unexpected text %q", spec.Text)
				}
			},
		},
		{name: "bad rating", raw: `rating:9`, wantErr: true},
		{name: "bad orientation", raw: `orientation:diagonal`, wantErr: true},
		{name: "bad color", raw: `color:red`, wantErr: true},
		{name: "unterminated quote", raw: `tag:"red`, wantErr: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			spec, err := ParseQuery(tc.raw)
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			tc.check(t, spec)
		})
	}
}

func TestFileCategory(t *testing.T) {
	cases := []struct{ ext, mime, want string }{
		{"jpg", "", "image"},
		{"svg", "", "image"},
		{"mp4", "", "video"},
		{"ts", "text/plain", "document"},
		{"ts", "video/mp2t", "video"},
		{"mp3", "", "audio"},
		{"pdf", "", "document"},
		{"zip", "", "archive"},
		{"bin", "image/x-custom", "image"},
		{"bin", "application/octet-stream", "other"},
	}
	for _, tc := range cases {
		if got := fileCategory(tc.ext, tc.mime); got != tc.want {
			t.Errorf("fileCategory(%q,%q) = %q, want %q", tc.ext, tc.mime, got, tc.want)
		}
	}
}

func TestQueryItemsEngine(t *testing.T) {
	mgr := newQueryTestManager(t)
	seedQueryCache(t, mgr, []Item{
		{
			ID: "a", Hex: "A", Name: "Sunset", Extension: "jpg", MimeType: "image/jpeg",
			Width: 100, Height: 50, Size: 500 * 1024, DominantColor: "#FF0000",
			Tags: []string{"nature"}, Folders: []string{"f1"}, Rating: 5,
			URL: "https://example.com/a", Note: "warm", Prompt: "sun",
			ImportedAt: 500,
		},
		{
			ID: "b", Hex: "B", Name: "Portrait", Extension: "png", MimeType: "image/png",
			Width: 50, Height: 100, Size: 2 * 1024 * 1024, DominantColor: "#0000FF",
			Tags: []string{"Nature"}, Folders: []string{"f2"}, Rating: 3,
			ImportedAt: 400,
		},
		{
			ID: "c", Hex: "C", Name: "Square", Extension: "mp4", MimeType: "video/mp4",
			Width: 80, Height: 80, Size: 20 * 1024 * 1024, DominantColor: "#00FF00",
			Tags: []string{"work"}, Rating: 5, ImportedAt: 300,
		},
		{
			ID: "d", Hex: "D", Name: "Voice", Extension: "mp3", MimeType: "audio/mpeg",
			Size: 1024, ImportedAt: 200,
		},
		{
			ID: "e", Hex: "E", Name: "Client Work", Extension: "pdf", MimeType: "application/pdf",
			Size: 1024 * 1024, Tags: []string{"client work"}, ImportedAt: 100,
		},
	})

	tests := []struct {
		name  string
		query string
		ids   []string
	}{
		{name: "browse all", query: "", ids: []string{"a", "b", "c", "d", "e"}},
		{name: "text", query: "sunset", ids: []string{"a"}},
		{name: "text tag", query: "client", ids: []string{"e"}},
		{name: "type image", query: "type:image", ids: []string{"a", "b"}},
		{name: "type video", query: "type:video", ids: []string{"c"}},
		{name: "type extension", query: "type:mp3", ids: []string{"d"}},
		{name: "tag case insensitive", query: "tag:nature", ids: []string{"a", "b"}},
		{name: "quoted tag", query: `tag:"client work"`, ids: []string{"e"}},
		{name: "folder", query: "folder:f1", ids: []string{"a"}},
		{name: "folder none", query: "folder:none", ids: []string{"c", "d", "e"}},
		{name: "color", query: "color:#FF0000", ids: []string{"a"}},
		{name: "orientation landscape", query: "orientation:landscape", ids: []string{"a"}},
		{name: "orientation portrait", query: "orientation:portrait", ids: []string{"b"}},
		{name: "orientation square", query: "orientation:square", ids: []string{"c"}},
		{name: "size small", query: "size:small", ids: []string{"a", "d"}},
		{name: "size medium", query: "size:medium", ids: []string{"b", "e"}},
		{name: "size large", query: "size:large", ids: []string{"c"}},
		{name: "rating", query: "rating:5", ids: []string{"a", "c"}},
		{name: "has url", query: "has:url", ids: []string{"a"}},
		{name: "has note", query: "has:note", ids: []string{"a"}},
		{name: "has prompt", query: "has:prompt", ids: []string{"a"}},
		{name: "is untagged", query: "is:untagged", ids: []string{"d"}},
		{name: "is uncategorized", query: "is:uncategorized", ids: []string{"c", "d", "e"}},
		{name: "combined", query: "type:image tag:nature orientation:landscape", ids: []string{"a"}},
		{name: "no url", query: "no:url", ids: []string{"b", "c", "d", "e"}},
		{name: "no note", query: "no:note", ids: []string{"b", "c", "d", "e"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			spec, err := ParseQuery(tc.query)
			if err != nil {
				t.Fatalf("parse: %v", err)
			}
			items, total, err := mgr.QueryItems(spec, "desc", 0, 100)
			if err != nil {
				t.Fatalf("query: %v", err)
			}
			if total != len(tc.ids) {
				t.Fatalf("total = %d, want %d (items %v)", total, len(tc.ids), itemIDs(items))
			}
			if got := itemIDs(items); !equalStrings(got, tc.ids) {
				t.Fatalf("ids = %v, want %v", got, tc.ids)
			}
		})
	}

	t.Run("pagination and total", func(t *testing.T) {
		spec, _ := ParseQuery("")
		items, total, err := mgr.QueryItems(spec, "desc", 1, 2)
		if err != nil {
			t.Fatal(err)
		}
		if total != 5 || !equalStrings(itemIDs(items), []string{"b", "c"}) {
			t.Fatalf("page = %v total=%d", itemIDs(items), total)
		}
		items, total, err = mgr.QueryItems(spec, "desc", 10, 2)
		if err != nil {
			t.Fatal(err)
		}
		if total != 5 || len(items) != 0 {
			t.Fatalf("beyond end = %v total=%d", itemIDs(items), total)
		}
	})

	t.Run("ascending sort", func(t *testing.T) {
		spec, _ := ParseQuery("")
		items, _, err := mgr.QueryItems(spec, "asc", 0, 100)
		if err != nil {
			t.Fatal(err)
		}
		if !equalStrings(itemIDs(items), []string{"e", "d", "c", "b", "a"}) {
			t.Fatalf("asc ids = %v", itemIDs(items))
		}
	})
}

func newQueryTestManager(t *testing.T) *LibraryManager {
	t.Helper()
	base := t.TempDir()
	t.Setenv("BOWERBIRD_USER_DATA_DIR", filepath.Join(base, "userdata"))
	mgr := NewLibraryManager()
	t.Cleanup(func() {
		if mgr.assetServer != nil {
			_ = mgr.assetServer.Stop()
		}
		if mgr.mobileServer != nil {
			_ = mgr.mobileServer.Stop()
		}
	})
	if _, err := mgr.CreateLibrary(base, "QueryTestLib"); err != nil {
		t.Fatalf("create library: %v", err)
	}
	return mgr
}

func seedQueryCache(t *testing.T, mgr *LibraryManager, items []Item) {
	t.Helper()
	if err := mgr.ensureCacheLoaded(); err != nil {
		t.Fatalf("load cache: %v", err)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].ImportedAt > items[j].ImportedAt })
	mgr.cacheMu.Lock()
	defer mgr.cacheMu.Unlock()
	mgr.itemsDesc = items
	mgr.trashDesc = nil
	mgr.itemsByID = make(map[string]Item, len(items))
	mgr.searchIndex = make(map[string]string, len(items))
	for i := range items {
		mgr.itemsByID[items[i].ID] = items[i]
		mgr.searchIndex[items[i].ID] = buildItemSearchKey(&items[i])
	}
}

func itemIDs(items []Item) []string {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.ID)
	}
	return ids
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// recordingHost captures desktop events for notification assertions.
type recordingHost struct {
	mu     sync.Mutex
	events []string
	items  map[string]int
}

func (h *recordingHost) record(name string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.events = append(h.events, name)
	if h.items == nil {
		h.items = map[string]int{}
	}
	h.items[name]++
}

func (h *recordingHost) count(name string) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.items[name]
}

func (h *recordingHost) Emit(name string, payload any)        { h.record(name) }
func (h *recordingHost) OpenWindow(WindowSpec) error          { return nil }
func (h *recordingHost) FocusWindow(string) bool              { return false }
func (h *recordingHost) CloseWindow(string)                   {}
func (h *recordingHost) FocusMainWindow()                     {}
func (h *recordingHost) ToggleMainWindow()                    {}
func (h *recordingHost) CloseMainWindow()                     {}
func (h *recordingHost) OpenMainWindow()                      {}
func (h *recordingHost) OpenDirectory(string) (string, error) { return "", nil }
func (h *recordingHost) ShowAbout()                           {}
func (h *recordingHost) Quit()                                {}
func (h *recordingHost) RunOnMain(fn func())                  { fn() }
func (h *recordingHost) NativeWindowHandle() uintptr          { return 0 }
func (h *recordingHost) WriteFilesToClipboard([]string) error { return nil }
func (h *recordingHost) WriteTextToClipboard(string) error    { return nil }
func (h *recordingHost) ApplyTheme(string)                    {}
func (h *recordingHost) ApplyVibrancy(bool)                   {}
func (h *recordingHost) EnterLightweightMode()                { h.record("enter-lightweight") }
func (h *recordingHost) CancelLightweightIdle()               { h.record("cancel-lightweight-idle") }

type mobileTestServer struct {
	mgr     *LibraryManager
	baseURL string
	token   string
	host    *recordingHost
}

func setupMobileTestServer(t *testing.T) *mobileTestServer {
	t.Helper()
	mgr := newQueryTestManager(t)
	host := &recordingHost{}
	mgr.SetHost(host)

	server := mgr.GetMobileServer()
	if server == nil {
		t.Fatal("expected mobile server")
	}
	baseURL := fmt.Sprintf("http://127.0.0.1:%d", server.GetPort())

	pairPayload, _ := json.Marshal(map[string]string{
		"code":       server.GetPairingCode(),
		"deviceName": "QueryTester",
	})
	resp, err := http.Post(baseURL+"/api/v1/pair", "application/json", bytes.NewReader(pairPayload))
	if err != nil {
		t.Fatalf("pair: %v", err)
	}
	defer resp.Body.Close()
	var pairResp APIResponse
	if err := json.NewDecoder(resp.Body).Decode(&pairResp); err != nil {
		t.Fatalf("decode pair: %v", err)
	}
	data, _ := pairResp.Data.(map[string]any)
	token, _ := data["token"].(string)
	if token == "" {
		t.Fatalf("missing token: %v", pairResp.Data)
	}
	return &mobileTestServer{mgr: mgr, baseURL: baseURL, token: token, host: host}
}

func (s *mobileTestServer) authRequest(t *testing.T, method, path string, body io.Reader, contentType string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(method, s.baseURL+path, body)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.token)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	return resp
}

func (s *mobileTestServer) query(t *testing.T, queryText, sortOrder string, offset, limit int) MobileItemsResponse {
	t.Helper()
	payload, _ := json.Marshal(map[string]any{
		"query": queryText, "sort": sortOrder, "offset": offset, "limit": limit,
	})
	resp := s.authRequest(t, http.MethodPost, "/api/v1/query", bytes.NewReader(payload), "application/json")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("query status %d: %s", resp.StatusCode, body)
	}
	var out MobileItemsResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode query: %v", err)
	}
	return out
}

func (s *mobileTestServer) importPNG(t *testing.T, name string, w, h int, c color.RGBA, opts ImportItemOptions) Item {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	item, err := s.mgr.ImportFromBase64WithOptions(name+".png", base64.StdEncoding.EncodeToString(buf.Bytes()), opts)
	if err != nil {
		t.Fatalf("import png: %v", err)
	}
	return *item
}

func TestMobileQueryEndpoint(t *testing.T) {
	s := setupMobileTestServer(t)

	folder, err := s.mgr.CreateFolder("Red things", "")
	if err != nil {
		t.Fatalf("create folder: %v", err)
	}
	red := s.importPNG(t, "red", 100, 50, color.RGBA{R: 255, A: 255}, ImportItemOptions{
		Name: "Sunset Red", Tags: []string{"nature", "red"}, FolderIDs: []string{folder.ID},
		Note: "warm", URL: "https://example.com/red", Rating: 5,
	})
	blue := s.importPNG(t, "blue", 50, 100, color.RGBA{B: 255, A: 255}, ImportItemOptions{
		Name: "Blue Portrait", Tags: []string{"nature"}, Rating: 3,
	})

	all := s.query(t, "", "desc", 0, 100)
	if all.Total != 2 || len(all.Items) != 2 {
		t.Fatalf("browse total=%d items=%d", all.Total, len(all.Items))
	}

	reds := s.query(t, "tag:red", "desc", 0, 100)
	if reds.Total != 1 || reds.Items[0].ID != red.ID {
		t.Fatalf("tag query = %+v", reds)
	}

	nature := s.query(t, "tag:nature", "desc", 0, 1)
	if nature.Total != 2 || len(nature.Items) != 1 {
		t.Fatalf("paged query total=%d len=%d", nature.Total, len(nature.Items))
	}
	page2 := s.query(t, "tag:nature", "desc", 1, 1)
	if page2.Total != 2 || len(page2.Items) != 1 || page2.Items[0].ID == nature.Items[0].ID {
		t.Fatalf("page2 = %+v", page2)
	}

	if got := s.query(t, "orientation:portrait", "desc", 0, 10); got.Total != 1 || got.Items[0].ID != blue.ID {
		t.Fatalf("orientation query = %+v", got)
	}
	if got := s.query(t, "has:url rating:5", "desc", 0, 10); got.Total != 1 || got.Items[0].ID != red.ID {
		t.Fatalf("combined query = %+v", got)
	}
	if got := s.query(t, "folder:"+folder.ID, "desc", 0, 10); got.Total != 1 || got.Items[0].ID != red.ID {
		t.Fatalf("folder query = %+v", got)
	}
	if got := s.query(t, "type:image", "desc", 0, 10); got.Total != 2 {
		t.Fatalf("type query total = %d", got.Total)
	}
	if got := s.query(t, "sunset", "desc", 0, 10); got.Total != 1 || got.Items[0].ID != red.ID {
		t.Fatalf("text query = %+v", got)
	}

	// Invalid query values are rejected.
	badPayload, _ := json.Marshal(map[string]any{"query": "rating:9"})
	badResp := s.authRequest(t, http.MethodPost, "/api/v1/query", bytes.NewReader(badPayload), "application/json")
	badBody, _ := io.ReadAll(badResp.Body)
	badResp.Body.Close()
	if badResp.StatusCode != http.StatusBadRequest || !strings.Contains(string(badBody), "INVALID_QUERY") {
		t.Fatalf("expected 400 INVALID_QUERY, got %d %s", badResp.StatusCode, badBody)
	}

	// Legacy endpoint still works and shares the engine.
	legacyResp := s.authRequest(t, http.MethodGet, "/api/v1/items?tag=red&limit=10", nil, "")
	defer legacyResp.Body.Close()
	var legacy MobileItemsResponse
	if err := json.NewDecoder(legacyResp.Body).Decode(&legacy); err != nil {
		t.Fatalf("decode legacy: %v", err)
	}
	if legacy.Total != 1 || legacy.Items[0].ID != red.ID {
		t.Fatalf("legacy = %+v", legacy)
	}

	// Status advertises the query capability.
	statusResp, err := http.Get(s.baseURL + "/api/v1/status")
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	defer statusResp.Body.Close()
	var status MobileStatusResponse
	if err := json.NewDecoder(statusResp.Body).Decode(&status); err != nil {
		t.Fatalf("decode status: %v", err)
	}
	if status.Version != MobileServerVersion || len(status.Capabilities) != 1 || status.Capabilities[0] != "query" {
		t.Fatalf("status = %+v", status)
	}
}

func TestMobileMutationNotifications(t *testing.T) {
	s := setupMobileTestServer(t)

	wsURL := fmt.Sprintf("ws://127.0.0.1:%d/api/v1/ws?token=%s", s.mgr.GetMobileServer().GetPort(), s.token)
	conn, _, err := websocket.Dial(context.Background(), wsURL, nil)
	if err != nil {
		t.Fatalf("ws dial: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "done")

	readEvent := func(want string) {
		t.Helper()
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		for {
			_, msg, rErr := conn.Read(ctx)
			if rErr != nil {
				t.Fatalf("read %s event: %v", want, rErr)
			}
			var ev map[string]any
			if json.Unmarshal(msg, &ev) == nil && ev["event"] == want {
				return
			}
		}
	}

	// Upload one PNG through the mobile multipart endpoint.
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "uploaded.png")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	img := image.NewRGBA(image.Rect(0, 0, 4, 4))
	png.Encode(part, img)
	writer.Close()

	resp := s.authRequest(t, http.MethodPost, "/api/v1/upload", &body, writer.FormDataContentType())
	uploadBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("upload status %d: %s", resp.StatusCode, uploadBody)
	}
	readEvent("items_updated")
	if s.host.count("library-items-upserted") != 1 {
		t.Fatalf("expected one desktop upserted event, got %v", s.host.events)
	}

	var uploaded struct {
		Items []Item `json:"items"`
	}
	if err := json.Unmarshal(uploadBody, &uploaded); err != nil || len(uploaded.Items) != 1 {
		t.Fatalf("decode upload: %v %s", err, uploadBody)
	}

	// Delete through the mobile endpoint.
	delResp := s.authRequest(t, http.MethodDelete, "/api/v1/items/"+uploaded.Items[0].ID, nil, "")
	delResp.Body.Close()
	if delResp.StatusCode != http.StatusOK {
		t.Fatalf("delete status %d", delResp.StatusCode)
	}
	readEvent("items_updated")
	if s.host.count("library-items-trashed") != 1 {
		t.Fatalf("expected one desktop trashed event, got %v", s.host.events)
	}

	// The mobile query endpoint reflects the trash move.
	if got := s.query(t, "", "desc", 0, 10); got.Total != 0 {
		t.Fatalf("expected empty library after trash, total=%d", got.Total)
	}
}

func TestImportFromBase64NotifiesMobile(t *testing.T) {
	s := setupMobileTestServer(t)
	wsURL := fmt.Sprintf("ws://127.0.0.1:%d/api/v1/ws?token=%s", s.mgr.GetMobileServer().GetPort(), s.token)
	conn, _, err := websocket.Dial(context.Background(), wsURL, nil)
	if err != nil {
		t.Fatalf("ws dial: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "done")

	s.importPNG(t, "base64", 2, 2, color.RGBA{G: 255, A: 255}, ImportItemOptions{Name: "Base64 Import"})

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	for {
		_, msg, rErr := conn.Read(ctx)
		if rErr != nil {
			t.Fatalf("waiting for items_updated: %v", rErr)
		}
		var ev map[string]any
		if json.Unmarshal(msg, &ev) == nil && ev["event"] == "items_updated" {
			return
		}
	}
}

// The mobile drawer renders its counts from /api/v1/stats and its trash list
// from the collection endpoint, so both must agree with the query engine.
func TestMobileStatsAndCollectionEndpoints(t *testing.T) {
	s := setupMobileTestServer(t)

	folder, err := s.mgr.CreateFolder("Work", "")
	if err != nil {
		t.Fatalf("create folder: %v", err)
	}
	s.importPNG(t, "tagged", 10, 10, color.RGBA{R: 255, A: 255}, ImportItemOptions{
		Tags: []string{"red"}, FolderIDs: []string{folder.ID},
	})
	// Untagged and uncategorized.
	s.importPNG(t, "loose", 10, 10, color.RGBA{B: 255, A: 255}, ImportItemOptions{})
	// Trashed item.
	trashed := s.importPNG(t, "gone", 10, 10, color.RGBA{G: 255, A: 255}, ImportItemOptions{})

	resp := s.authRequest(t, http.MethodGet, "/api/v1/stats", nil, "")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("stats status %d: %s", resp.StatusCode, body)
	}
	var stats MobileStatsResponse
	if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
		t.Fatalf("decode stats: %v", err)
	}
	if stats.Total != 3 || stats.UntaggedCount != 2 || stats.UncategorizedCount != 2 {
		t.Fatalf("unexpected stats: %+v", stats)
	}
	if stats.TrashCount != 0 {
		t.Fatalf("expected empty trash, got %d", stats.TrashCount)
	}

	if err := s.mgr.MoveToTrash(trashed.ID); err != nil {
		t.Fatalf("move to trash: %v", err)
	}

	statsResp := s.authRequest(t, http.MethodGet, "/api/v1/stats", nil, "")
	defer statsResp.Body.Close()
	if err := json.NewDecoder(statsResp.Body).Decode(&stats); err != nil {
		t.Fatalf("decode stats after trash: %v", err)
	}
	if stats.Total != 2 || stats.TrashCount != 1 {
		t.Fatalf("unexpected stats after trash: %+v", stats)
	}

	cases := []struct {
		name  string
		path  string
		total int
	}{
		{"trash", "/api/v1/items/collection?name=trash&limit=10", 1},
		{"untagged", "/api/v1/items/collection?name=untagged&limit=10", 1},
		{"uncategorized", "/api/v1/items/collection?name=uncategorized&limit=10", 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			itemResp := s.authRequest(t, http.MethodGet, tc.path, nil, "")
			defer itemResp.Body.Close()
			if itemResp.StatusCode != http.StatusOK {
				body, _ := io.ReadAll(itemResp.Body)
				t.Fatalf("status %d: %s", itemResp.StatusCode, body)
			}
			var page MobileItemsResponse
			if err := json.NewDecoder(itemResp.Body).Decode(&page); err != nil {
				t.Fatalf("decode collection: %v", err)
			}
			if page.Total != tc.total || len(page.Items) != tc.total {
				t.Fatalf("expected %d items, got total=%d len=%d", tc.total, page.Total, len(page.Items))
			}
		})
	}

	badResp := s.authRequest(t, http.MethodGet, "/api/v1/items/collection?name=bogus", nil, "")
	defer badResp.Body.Close()
	if badResp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for unknown collection, got %d", badResp.StatusCode)
	}

	// Restoring a single item brings it back out of the trash.
	restoreResp := s.authRequest(t, http.MethodPost, "/api/v1/items/"+trashed.ID+"/restore", nil, "")
	restoreResp.Body.Close()
	if restoreResp.StatusCode != http.StatusOK {
		t.Fatalf("restore status %d", restoreResp.StatusCode)
	}
	afterRestore := s.authRequest(t, http.MethodGet, "/api/v1/stats", nil, "")
	defer afterRestore.Body.Close()
	stats = MobileStatsResponse{}
	if err := json.NewDecoder(afterRestore.Body).Decode(&stats); err != nil {
		t.Fatalf("decode stats after restore: %v", err)
	}
	if stats.TrashCount != 0 || stats.Total != 3 {
		t.Fatalf("unexpected stats after restore: %+v", stats)
	}

	// Emptying the trash clears every trashed item.
	if err := s.mgr.MoveToTrash(trashed.ID); err != nil {
		t.Fatalf("move to trash again: %v", err)
	}
	emptyResp := s.authRequest(t, http.MethodDelete, "/api/v1/items/collection?name=trash", nil, "")
	emptyResp.Body.Close()
	if emptyResp.StatusCode != http.StatusOK {
		t.Fatalf("empty trash status %d", emptyResp.StatusCode)
	}
	finalResp := s.authRequest(t, http.MethodGet, "/api/v1/stats", nil, "")
	defer finalResp.Body.Close()
	stats = MobileStatsResponse{}
	if err := json.NewDecoder(finalResp.Body).Decode(&stats); err != nil {
		t.Fatalf("decode final stats: %v", err)
	}
	if stats.TrashCount != 0 {
		t.Fatalf("expected empty trash, got %d", stats.TrashCount)
	}

	// Non-trash collections cannot be emptied.
	guardResp := s.authRequest(t, http.MethodDelete, "/api/v1/items/collection?name=untagged", nil, "")
	defer guardResp.Body.Close()
	if guardResp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 when emptying a non-trash collection, got %d", guardResp.StatusCode)
	}
}
