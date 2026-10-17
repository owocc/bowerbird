package core_test

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"bowerbird/core"
)

func TestAppLogsRecordingAndClearing(t *testing.T) {
	tmpDir := t.TempDir()
	t.Setenv("BOWERBIRD_USER_DATA_DIR", tmpDir)

	core.ClearLogsBuffer()

	logPath := core.StartAppLogSession("test-session")
	if !filepath.IsAbs(logPath) {
		t.Fatalf("expected absolute log file path, got %q", logPath)
	}

	entry := core.RecordLog("perf", "core", "Folder switch test", "folder=root items=120", 14)
	if entry.ID <= 0 {
		t.Fatalf("expected positive log entry ID, got %d", entry.ID)
	}
	if entry.Level != "perf" || entry.Category != "core" || entry.DurationMs != 14 {
		t.Fatalf("unexpected log entry fields: %+v", entry)
	}

	svc := core.NewService(nil)
	logs := svc.GetLogs()
	if len(logs) < 2 {
		t.Fatalf("expected at least 2 logs (session start + perf entry), got %d", len(logs))
	}

	rawBytes, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("expected log file on disk at %s: %v", logPath, err)
	}
	if len(rawBytes) == 0 {
		t.Fatal("expected non-empty log file on disk")
	}

	if err := svc.ClearLogs(); err != nil {
		t.Fatalf("ClearLogs failed: %v", err)
	}
	afterClear := svc.GetLogs()
	if len(afterClear) != 1 || afterClear[0].Message != "Logs cleared by user" {
		t.Fatalf("unexpected logs after ClearLogs: %+v", afterClear)
	}
}

func TestComplexFolderHierarchyAndInPlaceCacheUpdates(t *testing.T) {
	tmpDir := t.TempDir()
	t.Setenv("BOWERBIRD_USER_DATA_DIR", tmpDir)

	mgr := core.NewLibraryManager()
	_, err := mgr.CreateLibrary(tmpDir, "PerfTest")
	if err != nil {
		t.Fatalf("CreateLibrary failed: %v", err)
	}

	// Build a multi-level folder tree (50 folders)
	var folderIDs []string
	parentID := ""
	for i := range 50 {
		f, cErr := mgr.CreateFolder(fmt.Sprintf("Folder_%02d", i), parentID)
		if cErr != nil {
			t.Fatalf("CreateFolder %d failed: %v", i, cErr)
		}
		folderIDs = append(folderIDs, f.ID)
		if i%5 == 0 {
			parentID = f.ID
		} else if i%5 == 4 {
			parentID = ""
		}
	}

	// Import test asset via base64 (1x1 transparent PNG)
	b64PNG := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	item, err := mgr.ImportFromBase64("sample.png", b64PNG)
	if err != nil || item == nil {
		t.Fatalf("ImportFromBase64 failed: %v", err)
	}

	// Ensure cache is loaded
	items, err := mgr.GetItems("", "desc")
	if err != nil || len(items) != 1 {
		t.Fatalf("GetItems failed: len=%d err=%v", len(items), err)
	}

	// Mutate folders in-place without invalidating cache
	targetFolder := folderIDs[len(folderIDs)-1]
	if err := mgr.AddItemToFolder(item.ID, targetFolder); err != nil {
		t.Fatalf("AddItemToFolder failed: %v", err)
	}

	itemsAfterAdd, err := mgr.GetItems("", "desc")
	if err != nil || len(itemsAfterAdd) != 1 {
		t.Fatalf("GetItems after AddItemToFolder failed: %v", err)
	}
	if len(itemsAfterAdd[0].Folders) != 1 || itemsAfterAdd[0].Folders[0] != targetFolder {
		t.Fatalf("expected item folders [%s], got %v", targetFolder, itemsAfterAdd[0].Folders)
	}

	// Verify GetFolders tree assembly and item counts
	tree, err := mgr.GetFolders()
	if err != nil || len(tree) == 0 {
		t.Fatalf("GetFolders failed: len=%d err=%v", len(tree), err)
	}

	// Move item to another folder and verify in-place cache update
	secondFolder := folderIDs[0]
	if err := mgr.MoveItemToFolder(item.ID, targetFolder, secondFolder); err != nil {
		t.Fatalf("MoveItemToFolder failed: %v", err)
	}
	itemsAfterMove, _ := mgr.GetItems("", "desc")
	if len(itemsAfterMove[0].Folders) != 1 || itemsAfterMove[0].Folders[0] != secondFolder {
		t.Fatalf("expected item moved to %s, got %v", secondFolder, itemsAfterMove[0].Folders)
	}

	// Move to trash and restore, checking in-place cache transitions
	if err := mgr.MoveToTrash(item.ID); err != nil {
		t.Fatalf("MoveToTrash failed: %v", err)
	}
	activeInTrash, _ := mgr.GetItems("", "desc")
	if len(activeInTrash) != 0 {
		t.Fatalf("expected 0 active items after MoveToTrash, got %d", len(activeInTrash))
	}
	trashedItems, _ := mgr.GetTrashItems("", "desc")
	if len(trashedItems) != 1 {
		t.Fatalf("expected 1 trashed item, got %d", len(trashedItems))
	}

	if err := mgr.RestoreFromTrash(item.ID); err != nil {
		t.Fatalf("RestoreFromTrash failed: %v", err)
	}
	restoredActive, _ := mgr.GetItems("", "desc")
	if len(restoredActive) != 1 || len(restoredActive[0].Folders) != 1 || restoredActive[0].Folders[0] != secondFolder {
		t.Fatalf("expected restored item with folder %s, got %+v", secondFolder, restoredActive)
	}
}
