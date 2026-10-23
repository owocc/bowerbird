package core

// WindowSpec describes a secondary window the core asks the host to open.
// The host owns the concrete window toolkit; core only names the window and
// the route it shows.
type WindowSpec struct {
	Name            string
	Title           string
	URL             string
	Width           int
	Height          int
	MinWidth        int
	MinHeight       int
	BackgroundColor string
	TitleBarHidden  bool
}

// Host is everything core needs from the desktop shell. The mygo entry point
// implements it with mygo windows, events, dialogs and clipboard; the legacy
// Wails entry point can implement it with Wails types. Keeping this interface
// framework free is what lets core compile and be tested without either.
type Host interface {
	// Emit broadcasts an event to every open window.
	Emit(name string, payload any)

	// OpenWindow opens spec.Name, or focuses it when it already exists.
	OpenWindow(spec WindowSpec) error
	// FocusWindow shows and focuses a window by name, if it exists.
	FocusWindow(name string) bool
	// CloseWindow closes a window by name, if it exists.
	CloseWindow(name string)
	// FocusMainWindow shows and focuses the main window.
	FocusMainWindow()
	// ToggleMainWindow shows the main window when it is hidden or unfocused,
	// and hides it when it is already the front window.
	ToggleMainWindow()
	// CloseMainWindow closes the main window for real (it is not hidden the way
	// a user close is) and forgets it, so a later OpenMainWindow starts fresh.
	CloseMainWindow()
	// OpenMainWindow creates the main window when it is gone, or shows and
	// focuses it when it is still open.
	OpenMainWindow()

	// OpenDirectory asks the user for a directory.
	OpenDirectory(title string) (string, error)

	// ShowAbout shows the platform about panel.
	ShowAbout()
	// Quit asks the application to quit.
	Quit()

	// RunOnMain runs fn on the UI thread and waits for it to return.
	RunOnMain(fn func())
	// NativeWindowHandle returns the main window's native handle (0 when the
	// host has no main window yet).
	NativeWindowHandle() uintptr

	// WriteFilesToClipboard puts local file paths on the system clipboard.
	WriteFilesToClipboard(paths []string) error
	// WriteTextToClipboard puts text on the system clipboard.
	WriteTextToClipboard(text string) error

	// ApplyTheme syncs the native window / system appearance with the app
	// colour mode ("dark", "light", or "system").
	ApplyTheme(theme string)
}

// AttachHost wires a host into a service before it is bound. It is a package
// function, not a method, so the generated TypeScript client does not expose
// the host itself to pages.
func AttachHost(s *Service, h Host) {
	if s != nil {
		s.host = h
	}
}

// AttachManager wires a library manager into a service created before the
// manager exists (the mygo generate path binds the service first).
func AttachManager(s *Service, m *LibraryManager) {
	if s != nil {
		s.mgr = m
	}
}
