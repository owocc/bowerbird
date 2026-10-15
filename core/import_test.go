package core_test

import (
	"crypto/rand"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"bowerbird/core"
)

// newRaceLibrary returns a manager with an empty library and its own user data
// directory, so the test never touches the real user profile.
func newRaceLibrary(t *testing.T, name string) *core.LibraryManager {
	t.Helper()

	t.Setenv("BOWERBIRD_USER_DATA_DIR", t.TempDir())
	mgr := core.NewLibraryManager()
	if _, err := mgr.CreateLibrary(t.TempDir(), name); err != nil {
		t.Fatalf("CreateLibrary: %v", err)
	}
	t.Cleanup(func() { _ = mgr.CloseLibrary() })
	return mgr
}

// An OS file drop reaches the app twice - once through the webview drop handler
// (ImportFromBase64) and once through the native drop handler (ImportFiles) - and
// they race for the same content-addressed item. The loser used to delete the
// shared item directory, leaving a row whose payload was gone: a card that could
// not be previewed and a file that could never be re-imported.
func TestConcurrentImportOfSameContentKeepsPayload(t *testing.T) {
	mgr := newRaceLibrary(t, "Race")

	// Large enough that both imports pass the deduplication check before either
	// finishes writing.
	payload := make([]byte, 16<<20)
	if _, err := rand.Read(payload); err != nil {
		t.Fatalf("rand: %v", err)
	}
	src := filepath.Join(t.TempDir(), "big.bin")
	if err := os.WriteFile(src, payload, 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	start := make(chan struct{})
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if _, err := mgr.ImportFiles([]string{src}); err != nil {
				t.Errorf("ImportFiles: %v", err)
			}
		}()
	}
	close(start)
	wg.Wait()

	items, err := mgr.GetItems("", "desc")
	if err != nil {
		t.Fatalf("GetItems: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("got %d items, want 1 (content addressed, so the second import must reuse it)", len(items))
	}
	if _, err := os.Stat(items[0].FilePath); err != nil {
		t.Fatalf("item %s has a row but no payload: %v", items[0].ID, err)
	}
}

// Re-importing the same bytes repairs an item whose payload is missing, which is
// the state a row is left in when its directory was lost.
func TestReimportRestoresMissingPayload(t *testing.T) {
	mgr := newRaceLibrary(t, "Repair")

	src := filepath.Join(t.TempDir(), "asset.txt")
	if err := os.WriteFile(src, []byte("payload"), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	if _, err := mgr.ImportFiles([]string{src}); err != nil {
		t.Fatalf("ImportFiles: %v", err)
	}
	items, err := mgr.GetItems("", "desc")
	if err != nil || len(items) != 1 {
		t.Fatalf("GetItems = %d items, err=%v", len(items), err)
	}

	// Simulate the damaged state: row present, payload gone.
	if err := os.RemoveAll(items[0].ItemPath); err != nil {
		t.Fatalf("remove item dir: %v", err)
	}
	if _, err := os.Stat(items[0].FilePath); err == nil {
		t.Fatal("payload still present after removal, the fixture is not testing anything")
	}

	if _, err := mgr.ImportFiles([]string{src}); err != nil {
		t.Fatalf("re-import: %v", err)
	}
	items, err = mgr.GetItems("", "desc")
	if err != nil {
		t.Fatalf("GetItems after re-import: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("got %d items after re-import, want 1", len(items))
	}
	if _, err := os.Stat(items[0].FilePath); err != nil {
		t.Fatalf("re-import did not restore the payload: %v", err)
	}
}
