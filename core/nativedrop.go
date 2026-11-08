package core

import (
	"fmt"
	"net/url"
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

// NativeDropResult summarizes the routing decision for one native drop.
type NativeDropResult struct {
	// Internal is the number of paths recognized as items of a library.
	Internal int
	// External is the number of paths accepted for import.
	External int
	// Skipped is the number of paths rejected because they already belong to
	// the active library or are empty.
	Skipped int
	// Importing reports whether an external import was started in the
	// background.
	Importing bool
}

// normalizeDropPath turns a shell drop path into a filesystem path. Some
// platforms hand over file:// URLs (percent-encoded), while native UI drops
// usually hand over plain paths.
func normalizeDropPath(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(raw), "file:") {
		if u, err := url.Parse(raw); err == nil && strings.EqualFold(u.Scheme, "file") {
			p := u.Path
			if p == "" {
				p = u.Opaque
			}
			if p != "" {
				raw = p
			}
		}
	}
	return filepath.Clean(raw)
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
	_, err := s.HandleNativeDropWithResult(paths, targetType, targetFolderID)
	return err
}

// HandleNativeDropWithResult is HandleNativeDrop with the routing counts the
// caller uses to avoid showing an import toast for an ignored self-drop.
func (s *Service) HandleNativeDropWithResult(paths []string, targetType string, targetFolderID string) (NativeDropResult, error) {
	var result NativeDropResult
	if s.mgr == nil {
		return result, ErrCoreNotInitialized
	}

	activeLib := s.mgr.GetActiveLibrary()
	activePath := ""
	if activeLib != nil {
		activePath = filepath.Clean(activeLib.Path)
	}

	var internalItemIDs, externalFiles []string
	for _, raw := range paths {
		f := normalizeDropPath(raw)
		if f == "" {
			result.Skipped++
			continue
		}
		// Content-addressed item paths are the library's own payload: a
		// drop inside the app must be routed as a move, never as a new
		// import.
		if id := extractInternalItemID(f); id != "" {
			internalItemIDs = append(internalItemIDs, id)
			result.Internal++
			continue
		}
		// Any other path inside the active library is also its own data
		// (manifest, database, cache, loose files). Never import it again.
		if pathIsWithin(activePath, f) {
			result.Skipped++
			continue
		}
		externalFiles = append(externalFiles, f)
		result.External++
	}

	LogDragTrace("native-drop-routing", fmt.Sprintf("target=%s folderID=%s internal=%d external=%d skipped=%d", targetType, targetFolderID, result.Internal, result.External, result.Skipped))

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
		return result, nil
	}

	if len(externalFiles) == 0 {
		return result, nil
	}

	result.Importing = true
	go s.importDroppedFiles(externalFiles, targetType, targetFolderID)
	return result, nil
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
