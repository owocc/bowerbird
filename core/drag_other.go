//go:build (!darwin && !windows) || ios || (darwin && !cgo)

package core

import (
	"errors"
	"fmt"
	"os"
	"runtime"
)

// Cross-platform Native File Drag & Drop Architecture Reference:
//
// [macOS (Darwin)]
//   Implemented in drag_darwin.go:
//   Hooks AppKit & WKWebView drag sessions, intercepts the dragging pasteboard,
//   clears plain text (public.utf8-plain-text to avoid .textClipping in Finder and
//   text layers in Figma), and injects native file objects:
//   - public.file-url (NSPasteboardTypeFileURL)
//   - NSFilenamesPboardType (NSArray of absolute filesystem paths)
//
// [Windows]
//   Implemented in drag_windows.go:
//   The webview drag is cancelled and replaced by a real OLE drag
//   (SHCreateDataObject + DoDragDrop) so the payload carries CF_HDROP.
//
// [Linux (Future Adaptation Guide)]
//   When adapting WebKitGTK on Linux:
//   1. Targets: XDND (X11) / Wayland wl_data_device.
//   2. Format: "text/uri-list" with CRLF-separated "file:///path/to/file" URIs.
//      Set GtkSelectionData with gdk_atom_intern_static_string("text/uri-list").

// StartDragItems starts a native drag session for the given asset items.
//
// Only Windows needs a host-side drag (see drag_windows.go) and macOS gets its
// files injected into the webview's own drag session (see drag_darwin.go), so on
// the remaining platforms there is nothing to start: the frontend never calls
// this there, and the trace records the call if it ever does.
func (m *LibraryManager) StartDragItems(ids []string) error {
	LogDragTrace("start-drag", fmt.Sprintf("platform=%s items=%d action=unsupported", runtime.GOOS, len(ids)))
	return errors.New("native drag-out is not implemented on this platform")
}

// AugmentPasteboardForTesting exercises pasteboard file extraction logic for test harnesses.
// Without cgo there is no AppKit pasteboard, so it validates the same file
// list and returns it unchanged.
func AugmentPasteboardForTesting(paths []string) ([]string, error) {
	out := make([]string, 0, len(paths))
	for _, path := range paths {
		info, err := os.Stat(path)
		if err != nil {
			return nil, err
		}
		if info.IsDir() {
			return nil, fmt.Errorf("%s is a directory", path)
		}
		out = append(out, path)
	}
	return out, nil
}

// CopyItemsToClipboard writes the given library items to the system clipboard.
func (m *LibraryManager) CopyItemsToClipboard(ids []string) error {
	if len(ids) == 0 {
		return errors.New("no items to copy")
	}
	var paths []string
	for _, id := range ids {
		if item, err := m.GetItem(id); err == nil && item != nil && item.FilePath != "" {
			paths = append(paths, item.FilePath)
		}
	}
	if len(paths) == 0 {
		return errors.New("no valid files to copy")
	}
	if host := m.Host(); host != nil {
		return host.WriteFilesToClipboard(paths)
	}
	return nil
}
