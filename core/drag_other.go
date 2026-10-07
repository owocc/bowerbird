//go:build !darwin || ios

package core

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
// [Windows (Future Adaptation Guide)]
//   When adapting Wails v3 on Windows with Microsoft Edge WebView2:
//   1. Problem:
//      In WebView2, standard HTML5 dataTransfer only sets text/plain (CF_UNICODETEXT)
//      and text/uri-list. When dropped into Windows File Explorer, Windows creates
//      a scrap file or refuses drop; in Figma/Photoshop, it creates a text layer.
//   2. Solution:
//      Windows shell and OLE drag targets require CF_HDROP format in the IDataObject:
//      - Structure: DROPFILES followed by a double-null-terminated list of UTF-16 wchar paths.
//      - Drop effect: DROPEFFECT_COPY | DROPEFFECT_LINK.
//      - Mechanism: Hook IDropSource / IDataObject or intercept the window drag via
//        OleSetClipboard / DoDragDrop, or use WebView2's CoreWebView2CompositionController /
//        ICoreWebView2_17 drag-and-drop APIs to inject CF_HDROP payloads.
//
// [Linux (Future Adaptation Guide)]
//   When adapting WebKitGTK on Linux:
//   1. Targets: XDND (X11) / Wayland wl_data_device.
//   2. Format: "text/uri-list" with CRLF-separated "file:///path/to/file" URIs.
//      Set GtkSelectionData with gdk_atom_intern_static_string("text/uri-list").

// StartDrag starts a native drag session for the given asset item.
func (m *LibraryManager) StartDrag(id string) error {
	return nil
}

// AugmentPasteboardForTesting exercises pasteboard file extraction logic for test harnesses.
func AugmentPasteboardForTesting(paths []string) ([]string, error) {
	return paths, nil
}
