package core_test

import (
	"strings"
	"testing"

	"bowerbird/core"
)

// Actions every platform must offer through the app's own menu.
var expectedMenuActions = []string{
	core.AppMenuSettings,
	core.AppMenuAbout,
	core.AppMenuReload,
	core.AppMenuFullscreen,
	core.AppMenuDevTools,
	core.AppMenuQuit,
}

// Commands that exist as keyboard affordances only and must stay out of the menu.
var keyboardOnlyActions = []string{
	core.AppMenuCloseWindow,
	core.AppMenuZoomIn,
	core.AppMenuZoomOut,
	core.AppMenuZoomReset,
}

func TestAppMenuModelShape(t *testing.T) {
	items := core.AppMenuModel()
	if len(items) == 0 {
		t.Fatal("AppMenuModel returned no rows")
	}

	seen := make(map[string]bool)
	for i, item := range items {
		if item.Separator {
			continue
		}
		if item.Action == "" {
			t.Errorf("row %d has no action", i)
			continue
		}
		if seen[item.Action] {
			t.Errorf("action %q appears more than once", item.Action)
		}
		seen[item.Action] = true

		// The frontend renders these three fields for every row.
		if item.Title == "" || item.LabelKey == "" || item.Icon == "" {
			t.Errorf("row %q is incomplete: %+v", item.Action, item)
		}
		if !strings.HasPrefix(item.LabelKey, "appMenu.") {
			t.Errorf("row %q has an unexpected i18n key %q", item.Action, item.LabelKey)
		}
	}

	for _, action := range expectedMenuActions {
		if !seen[action] {
			t.Errorf("menu is missing the %q row", action)
		}
	}
	for _, action := range keyboardOnlyActions {
		if seen[action] {
			t.Errorf("keyboard-only action %q must not have a menu row", action)
		}
	}
}

func TestGetAppMenuMatchesModel(t *testing.T) {
	svc := core.NewService(nil)

	got := svc.GetAppMenu()
	want := core.AppMenuModel()
	if len(got) != len(want) {
		t.Fatalf("GetAppMenu returned %d rows, AppMenuModel returned %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("row %d: GetAppMenu = %+v, AppMenuModel = %+v", i, got[i], want[i])
		}
	}
}

func TestInvokeAppMenuRejectsUnknownAction(t *testing.T) {
	svc := core.NewService(nil)

	err := svc.InvokeAppMenu("definitely-not-an-action")
	if err == nil {
		t.Fatal("expected an error for an unknown action")
	}
	if !strings.Contains(err.Error(), "unknown application menu action") {
		t.Fatalf("unexpected error: %v", err)
	}
}

// Window-scoped commands belong to the webview that owns the window; the bridge
// must refuse them so the two halves cannot drift apart.
func TestInvokeAppMenuRejectsWindowScopedAction(t *testing.T) {
	svc := core.NewService(nil)

	for _, action := range []string{core.AppMenuReload, core.AppMenuFullscreen, core.AppMenuDevTools} {
		if err := svc.InvokeAppMenu(action); err == nil {
			t.Errorf("%q is window-scoped and must not be handled by the bridge", action)
		}
	}
}
