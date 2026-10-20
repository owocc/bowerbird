package core

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// extractInternalItemID reports the content id of a path inside a library's
// items/<hex> directory, or "" for an external path.
func extractInternalItemID(filePath string) string {
	clean := filepath.Clean(filePath)
	parts := strings.Split(clean, string(filepath.Separator))
	for i, part := range parts {
		if part == "items" && i+1 < len(parts) && len(parts[i+1]) == 64 {
			return parts[i+1]
		}
	}
	return ""
}

// HandleNativeDrop routes files dropped on a window by the desktop shell.
// targetType and targetFolderID come from the DOM element under the drop,
// resolved by the host (data-file-drop-target / data-folder-id); empty values
// mean a drop on the main workspace.
//
// It returns once routing starts: imports run in the background and report
// through the import-* events, as they did when the Wails entry point handled
// the drop.
func (s *Service) HandleNativeDrop(paths []string, targetType string, targetFolderID string) error {
	if s.mgr == nil {
		return ErrCoreNotInitialized
	}

	activeLib := s.mgr.GetActiveLibrary()
	var internalItemIDs, externalFiles []string
	for _, f := range paths {
		f = strings.TrimSpace(f)
		if f == "" {
			continue
		}
		if id := extractInternalItemID(f); id != "" {
			internalItemIDs = append(internalItemIDs, id)
			continue
		}
		if activeLib != nil && activeLib.Path != "" {
			cleanFile := filepath.Clean(f)
			cleanLibPath := filepath.Clean(activeLib.Path)
			if strings.HasPrefix(strings.ToLower(cleanFile), strings.ToLower(cleanLibPath)) {
				continue
			}
		}
		externalFiles = append(externalFiles, f)
	}

	LogDragTrace("native-drop-routing", fmt.Sprintf("target=%s folderID=%s internal=%d external=%d", targetType, targetFolderID, len(internalItemIDs), len(externalFiles)))

	// 1. Internal items: move to a folder, the trash, or the root.
	if len(internalItemIDs) > 0 {
		switch {
		case (targetType == "folder" || targetType == "subfolder") && targetFolderID != "":
			var updated []Item
			for _, id := range internalItemIDs {
				_ = s.mgr.MoveItemToFolder(id, "", targetFolderID)
				if item, err := s.mgr.GetItem(id); err == nil && item != nil {
					updated = append(updated, *item)
				}
			}
			if len(updated) > 0 {
				s.emit("library-items-upserted", updated)
			} else {
				s.emit("library-items-updated", len(internalItemIDs))
			}
		case targetType == "trash":
			_ = s.mgr.BatchMoveToTrash(internalItemIDs)
			s.emit("library-items-trashed", internalItemIDs)
		case targetType == "all":
			var updated []Item
			for _, id := range internalItemIDs {
				_ = s.mgr.MoveItemToFolder(id, "", "")
				if item, err := s.mgr.GetItem(id); err == nil && item != nil {
					updated = append(updated, *item)
				}
			}
			if len(updated) > 0 {
				s.emit("library-items-upserted", updated)
			} else {
				s.emit("library-items-updated", len(internalItemIDs))
			}
		default:
			LogDragTrace("native-drop", fmt.Sprintf("internal items dropped on non-folder target (%s), ignored", targetType))
		}
		return nil
	}

	if len(externalFiles) == 0 {
		return nil
	}

	go s.importDroppedFiles(externalFiles, targetType, targetFolderID)
	return nil
}

func (s *Service) importDroppedFiles(files []string, targetType, targetFolderID string) {
	progress := func(current, total int, filename string) {
		s.emit("import-progress", map[string]any{
			"current":  current,
			"total":    total,
			"filename": filename,
		})
	}

	// 2. Sidebar / folder drop accepts folders only.
	if targetType == "sidebar" || targetType == "folder" {
		var folders []string
		for _, f := range files {
			if fi, err := os.Stat(f); err == nil && fi.IsDir() {
				folders = append(folders, f)
			}
		}
		if len(folders) == 0 {
			LogDragTrace("native-drop", "sidebar drop rejected: no folders in dropped files")
			s.emit("import-error", "The sidebar only accepts dropped folders")
			return
		}
		s.emit("import-started", map[string]any{"total": len(folders)})
		created, err := s.mgr.ImportFoldersRecursivelyWithProgress(folders, targetFolderID, progress)
		if err != nil {
			s.emit("import-error", err.Error())
			return
		}
		s.emit("import-completed", map[string]any{"count": len(created)})
		s.emit("library-items-updated", len(created))
		return
	}

	// 3. Subfolder card: folders recurse, files import flat into the folder.
	if targetType == "subfolder" && targetFolderID != "" {
		var folders, plain []string
		for _, f := range files {
			if fi, err := os.Stat(f); err == nil && fi.IsDir() {
				folders = append(folders, f)
			} else {
				plain = append(plain, f)
			}
		}
		s.emit("import-started", map[string]any{"total": len(files)})
		totalImported := 0
		if len(folders) > 0 {
			created, err := s.mgr.ImportFoldersRecursivelyWithProgress(folders, targetFolderID, progress)
			if err != nil {
				s.emit("import-error", err.Error())
				return
			}
			totalImported += len(created)
		}
		if len(plain) > 0 {
			imported, err := s.mgr.ImportFilesWithProgress(plain, progress)
			if err != nil {
				s.emit("import-error", err.Error())
				return
			}
			var updated []Item
			for _, it := range imported {
				_ = s.mgr.AddItemToFolder(it.ID, targetFolderID)
				if full, err := s.mgr.GetItem(it.ID); err == nil && full != nil {
					updated = append(updated, *full)
				} else {
					updated = append(updated, it)
				}
			}
			totalImported += len(imported)
			if len(folders) == 0 {
				s.emit("import-completed", map[string]any{"count": totalImported, "items": updated})
				return
			}
		}
		if totalImported > 0 {
			s.emit("import-completed", map[string]any{"count": totalImported})
		}
		return
	}

	// 4. Main workspace: flat import of files, recursive import of folders is
	// handled by the frontend's folder-card drop; files go to the root.
	s.emit("import-started", map[string]any{"total": len(files)})
	imported, err := s.mgr.ImportFilesWithProgress(files, progress)
	if err != nil {
		LogDragTrace("native-drop", fmt.Sprintf("error importing files: %v", err))
		s.emit("import-error", err.Error())
		return
	}
	ids := make([]string, 0, len(imported))
	for _, it := range imported {
		ids = append(ids, it.ID)
	}
	s.emit("import-completed", map[string]any{"count": len(imported), "ids": ids, "items": imported})
}

// WriteClipboardText puts text on the system clipboard through the host.
func (s *Service) WriteClipboardText(text string) error {
	host := s.getHost()
	if host == nil {
		return ErrAppNotInitialized
	}
	return host.WriteTextToClipboard(text)
}
