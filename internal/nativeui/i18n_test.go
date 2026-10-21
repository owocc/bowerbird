package nativeui

import (
	"bytes"
	"os"
	"testing"
)

// The native catalogs are copies of the shared frontend messages. They must
// not drift: this fails until both copies are refreshed.
func TestMessageCatalogsMatchFrontend(t *testing.T) {
	for _, lang := range []string{"en", "zh"} {
		want, err := os.ReadFile("../../frontend/src/messages/" + lang + ".json")
		if err != nil {
			t.Fatalf("read frontend %s: %v", lang, err)
		}
		got, err := messageFS.ReadFile("messages/" + lang + ".json")
		if err != nil {
			t.Fatalf("read embedded %s: %v", lang, err)
		}
		if !bytes.Equal(bytes.TrimSpace(want), bytes.TrimSpace(got)) {
			t.Fatalf("%s.json differs from frontend/src/messages/%s.json; copy it again", lang, lang)
		}
	}
}

func TestMessageCatalogParity(t *testing.T) {
	en := messageKeys("en")
	zh := messageKeys("zh")
	inZh := map[string]bool{}
	for _, k := range zh {
		inZh[k] = true
	}
	for _, k := range en {
		if !inZh[k] {
			t.Errorf("key %q is in en but not zh", k)
		}
	}
	if len(en) < 500 {
		t.Fatalf("only %d English keys loaded", len(en))
	}
	nativeEn := loadCatalog().langs["en"]
	nativeZh := loadCatalog().langs["zh"]
	for k := range nativeEn {
		if _, ok := nativeZh[k]; !ok {
			t.Errorf("native key %q has no Chinese text", k)
		}
	}
}

func TestMessageLookupAndInterpolation(t *testing.T) {
	app := &App{language: "zh"}
	if got := app.t("sidebar.trash"); got != "废纸篓" {
		t.Errorf("zh sidebar.trash = %q", got)
	}
	app.language = "en"
	if got := app.t("sidebar.trash"); got != "Trash" {
		t.Errorf("en sidebar.trash = %q", got)
	}
	if got := app.tf("native.running.on.port.d", map[string]string{"0": "1"}); got == "" {
		t.Error("interpolation returned empty")
	}
	if got := app.t("does.not.exist"); got != "does.not.exist" {
		t.Errorf("missing key fallback = %q", got)
	}
}
