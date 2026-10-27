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

func TestSetVibrancyAppliesToNativeWindows(t *testing.T) {
	host := &vibrancyHost{}
	svc := NewService(nil)
	AttachHost(svc, host)

	if err := svc.SetVibrancyEnabled(true); err != nil {
		t.Fatalf("enable: %v", err)
	}
	if len(host.applied) != 1 || !host.applied[0] {
		t.Fatalf("ApplyVibrancy got %v, want [true]", host.applied)
	}
	if host.count(VibrancyChangedEvent) != 1 {
		t.Fatalf("vibrancy-changed events = %d, want 1", host.count(VibrancyChangedEvent))
	}

	if err := svc.SetVibrancyEnabled(false); err != nil {
		t.Fatalf("disable: %v", err)
	}
	if len(host.applied) != 2 || host.applied[1] {
		t.Fatalf("ApplyVibrancy got %v, want [true false]", host.applied)
	}
}

type vibrancyHost struct {
	recordingHost
	applied []bool
}

func (h *vibrancyHost) ApplyVibrancy(enabled bool) {
	h.applied = append(h.applied, enabled)
}

func TestSetLightweightModeCancelsIdleWhenDisabled(t *testing.T) {
	host := &recordingHost{}
	svc := NewService(nil)
	AttachHost(svc, host)

	if err := svc.SetLightweightModeEnabled(true); err != nil {
		t.Fatalf("enable: %v", err)
	}
	if host.count("cancel-lightweight-idle") != 0 {
		t.Fatal("enabling should not cancel idle")
	}
	if err := svc.SetLightweightModeEnabled(false); err != nil {
		t.Fatalf("disable: %v", err)
	}
	if host.count("cancel-lightweight-idle") != 1 {
		t.Fatalf("cancel count = %d, want 1", host.count("cancel-lightweight-idle"))
	}
	svc.EnterLightweightMode()
	if host.count("enter-lightweight") != 1 {
		t.Fatalf("enter count = %d, want 1", host.count("enter-lightweight"))
	}
}

var _ Host = (*recordingHost)(nil)
