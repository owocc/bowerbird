package core_test

import (
	"os"
	"path/filepath"
	"testing"

	"bowerbird/core"
)

func TestRecycleBinAndFoldersAndTags(t *testing.T) {
	tempDir := t.TempDir()
	mgr := core.NewLibraryManager()
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
	if len(tags) == 0 || tags[0].Name != "收藏" {
		t.Errorf("Expected first tag to be 收藏, got %v", tags)
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
