package core

import "testing"

type themeHost struct {
	recordingHost
	applied []string
}

func (h *themeHost) ApplyTheme(theme string) {
	h.applied = append(h.applied, theme)
	h.record("apply-theme")
}

func TestSetThemeAppliesNativeAppearance(t *testing.T) {
	host := &themeHost{}
	svc := NewService(nil)
	AttachHost(svc, host)

	if err := svc.SetTheme("dark"); err != nil {
		t.Fatalf("SetTheme(dark): %v", err)
	}
	if len(host.applied) != 1 || host.applied[0] != ThemeDark {
		t.Fatalf("ApplyTheme got %v, want [dark]", host.applied)
	}
	if host.count(ThemeChangedEvent) != 1 {
		t.Fatalf("theme-changed events = %d, want 1", host.count(ThemeChangedEvent))
	}

	if err := svc.SetTheme("not-a-theme"); err == nil {
		t.Fatal("SetTheme(invalid) succeeded")
	}
	if len(host.applied) != 1 {
		t.Fatalf("invalid theme still applied: %v", host.applied)
	}
}

var _ Host = (*recordingHost)(nil)
