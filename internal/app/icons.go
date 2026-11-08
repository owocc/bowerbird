package app

import "github.com/egoist/mygo/ui"

// Icons are 24pt stroke SVGs (the same visual language as the former frontend's
// lucide set). Parsing happens once at startup; Element values built from them
// are per-frame and never stored.
func strokeIcon(body string) *ui.SVG {
	return ui.MustParseSVG([]byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` + body + `</svg>`))
}

func fillIcon(body string) *ui.SVG {
	return ui.MustParseSVG([]byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">` + body + `</svg>`))
}

var (
	iconSearch        = strokeIcon(`<circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/>`)
	iconBack          = strokeIcon(`<path d="m15 18-6-6 6-6"/>`)
	iconForward       = strokeIcon(`<path d="m9 18 6-6-6-6"/>`)
	iconChevron       = strokeIcon(`<path d="m6 9 6 6 6-6"/>`)
	iconChevronR      = strokeIcon(`<path d="m9 18 6-6-6-6"/>`)
	iconFolder        = strokeIcon(`<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>`)
	iconFolderPlus    = strokeIcon(`<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5m-2.5-2.5h5"/>`)
	iconTag           = strokeIcon(`<path d="M20 12 12 20 3 11V4h7z"/><circle cx="7.5" cy="7.5" r="1"/>`)
	iconTrash         = strokeIcon(`<path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/>`)
	iconAll           = strokeIcon(`<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>`)
	iconInbox         = strokeIcon(`<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5z"/>`)
	iconUncategorized = strokeIcon(`<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v4m0 3v.5"/>`)
	iconStar          = strokeIcon(`<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>`)
	iconStarFill      = fillIcon(`<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>`)
	iconPlus          = strokeIcon(`<path d="M12 5v14M5 12h14"/>`)
	iconMinus         = strokeIcon(`<path d="M5 12h14"/>`)
	iconClose         = strokeIcon(`<path d="m6 6 12 12M18 6 6 18"/>`)
	iconCheck         = strokeIcon(`<path d="m5 12 4 4L19 6"/>`)
	iconMore          = strokeIcon(`<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>`)
	iconLayoutJustified = strokeIcon(`<path d="M4 6h16M4 12h16M4 18h16"/>`)
	iconLayoutWaterfall = strokeIcon(`<rect x="3" y="3" width="7" height="12" rx="1"/><rect x="14" y="3" width="7" height="6" rx="1"/><rect x="14" y="13" width="7" height="8" rx="1"/><rect x="3" y="19" width="7" height="2" rx="1"/>`)
	iconLayoutGrid      = strokeIcon(`<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`)
	iconLayoutList      = strokeIcon(`<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>`)
	iconGrid            = iconLayoutGrid
	iconList            = iconLayoutList
	iconSidebar         = strokeIcon(`<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>`)
	iconFilter        = strokeIcon(`<path d="M3 5h18l-7 8v6l-4 2v-8z"/>`)
	iconRefresh       = strokeIcon(`<path d="M20 11a8 8 0 0 0-14-4L4 9m0-5v5h5M4 13a8 8 0 0 0 14 4l2-2m0 5v-5h-5"/>`)
	iconSettings      = strokeIcon(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.4 7 7.2 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/>`)
	iconLogs          = strokeIcon(`<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/>`)
	iconImage         = strokeIcon(`<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 15-5-5L5 20"/>`)
	iconVideo         = strokeIcon(`<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>`)
	iconAudio         = strokeIcon(`<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>`)
	iconDocument      = strokeIcon(`<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>`)
	iconArchive       = strokeIcon(`<path d="M4 7h16v13H4zM3 4h18v3H3zM10 11h4"/>`)
	iconExternal      = strokeIcon(`<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>`)
	iconCopy          = strokeIcon(`<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>`)
	iconEye           = strokeIcon(`<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`)
	iconPlay          = fillIcon(`<path d="M8 5v14l11-7z"/>`)
	iconPause         = fillIcon(`<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>`)
	iconInfo          = strokeIcon(`<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>`)
	iconUndo          = strokeIcon(`<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>`)
	iconRedo          = strokeIcon(`<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>`)
	iconZoomIn        = strokeIcon(`<circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4M11 8v6M8 11h6"/>`)
	iconZoomOut       = strokeIcon(`<circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4M8 11h6"/>`)
	iconLibrary       = strokeIcon(`<path d="M4 4h5v16H4zM10 4h5v16h-5zM16 5l4-1 3 15-4 1z"/>`)
	iconDrag          = strokeIcon(`<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>`)
	iconPalette       = strokeIcon(`<path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h4a5 5 0 0 0 5-5c0-3-4-5-9-5z"/><circle cx="7.5" cy="10" r="1"/><circle cx="9.5" cy="6.5" r="1"/><circle cx="14" cy="6.5" r="1"/>`)
	iconPrompt        = strokeIcon(`<path d="M4 5h16v14H4z"/><path d="m8 9 3 3-3 3M13 15h3"/>`)
	iconMove          = strokeIcon(`<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>`)
	iconRestore       = strokeIcon(`<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>`)
)
