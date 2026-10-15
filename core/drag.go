package core

// DragRequest describes a native drag-out gesture started from the webview.
//
// Only Windows needs to start the drag itself (see drag_windows.go); the geometry
// is what lets it draw a drag image that lines up with the element the user
// grabbed. GrabX/GrabY are the pointer position inside the dragged element,
// Width/Height that element's rendered size - all in physical pixels, so the
// webview has to apply the device pixel ratio before calling.
type DragRequest struct {
	IDs    []string `json:"ids"`
	GrabX  int      `json:"grabX"`
	GrabY  int      `json:"grabY"`
	Width  int      `json:"width"`
	Height int      `json:"height"`
}
