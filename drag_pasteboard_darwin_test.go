//go:build darwin

package main

import (
	"os"
	"path/filepath"
	"testing"

	"bowerbird/core"
)

// Pasteboard augmentation is the macOS drag-out mechanism: the WKWebView drag
// session is rewritten into native file objects. Windows has its own
// implementation and test (core/drag_windows_test.go).
func TestNativeFileDragAugmentation(t *testing.T) {
	tempDir := t.TempDir()
	f1 := filepath.Join(tempDir, "image_one.png")
	f2 := filepath.Join(tempDir, "image two with space.png")

	if err := os.WriteFile(f1, []byte("fake png content 1"), 0644); err != nil {
		t.Fatalf("failed to write f1: %v", err)
	}
	if err := os.WriteFile(f2, []byte("fake png content 2"), 0644); err != nil {
		t.Fatalf("failed to write f2: %v", err)
	}

	filenames, err := core.AugmentPasteboardForTesting([]string{f1, f2})
	if err != nil {
		t.Fatalf("AugmentPasteboardForTesting failed: %v", err)
	}
	if len(filenames) != 2 {
		t.Fatalf("expected 2 filenames on pasteboard, got %d", len(filenames))
	}
	if filenames[0] != f1 || filenames[1] != f2 {
		t.Fatalf("filenames mismatch: got %v, want [%s, %s]", filenames, f1, f2)
	}

	// Test that non-existent paths are rejected
	nonExistent := filepath.Join(tempDir, "non_existent_file.png")
	_, err = core.AugmentPasteboardForTesting([]string{nonExistent})
	if err == nil {
		t.Fatalf("expected error for non-existent file, got nil")
	}
}
