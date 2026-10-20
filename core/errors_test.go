package core

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAppErrorSerialization(t *testing.T) {
	err := NewAppError(ErrCodeNoActiveLibrary, "no active library")
	errStr := err.Error()

	var parsed map[string]string
	if unmarshalErr := json.Unmarshal([]byte(errStr), &parsed); unmarshalErr != nil {
		t.Fatalf("AppError.Error() should produce valid JSON, got: %s", errStr)
	}

	if parsed["code"] != ErrCodeNoActiveLibrary {
		t.Errorf("expected code %s, got %s", ErrCodeNoActiveLibrary, parsed["code"])
	}
	if parsed["message"] != "no active library" {
		t.Errorf("expected message 'no active library', got %s", parsed["message"])
	}
}

func TestWrapAppError(t *testing.T) {
	orig := errors.New("underlying io failure")
	wrapped := WrapAppError(ErrCodeCreateLibDirFailed, orig)

	if wrapped.Code != ErrCodeCreateLibDirFailed {
		t.Errorf("expected code %s, got %s", ErrCodeCreateLibDirFailed, wrapped.Code)
	}
	if wrapped.Message != "underlying io failure" {
		t.Errorf("expected message 'underlying io failure', got %s", wrapped.Message)
	}

	// Wrapping an already AppError preserves the original AppError
	nested := WrapAppError(ErrCodeUnknown, wrapped)
	if nested.Code != ErrCodeCreateLibDirFailed {
		t.Errorf("expected preserved code %s, got %s", ErrCodeCreateLibDirFailed, nested.Code)
	}
}

func TestAPIResponseErrorCode(t *testing.T) {
	rec := httptest.NewRecorder()
	writeError(rec, http.StatusServiceUnavailable, ErrCodeNoActiveLibrary, "no active library")

	var resp APIResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode APIResponse: %v", err)
	}

	if resp.Status != "error" {
		t.Errorf("expected status 'error', got %s", resp.Status)
	}
	if resp.Code != ErrCodeNoActiveLibrary {
		t.Errorf("expected code %s, got %s", ErrCodeNoActiveLibrary, resp.Code)
	}
	if resp.Message != "no active library" {
		t.Errorf("expected message 'no active library', got %s", resp.Message)
	}
}

func TestLanguageSettingsValidation(t *testing.T) {
	if !isValidLanguage("system") {
		t.Errorf("expected 'system' to be valid language")
	}
	if !isValidLanguage("zh") {
		t.Errorf("expected 'zh' to be valid language")
	}
	if !isValidLanguage("zh-CN") {
		t.Errorf("expected 'zh-CN' to be valid language")
	}
	if !isValidLanguage("en") {
		t.Errorf("expected 'en' to be valid language")
	}
	if isValidLanguage("invalid-lang") {
		t.Errorf("expected 'invalid-lang' to be invalid")
	}
}

func TestUserDataLanguagePersistence(t *testing.T) {
	t.Setenv("BOWERBIRD_USER_DATA_DIR", t.TempDir())
	store, err := NewUserDataStore()
	if err != nil {
		t.Fatalf("failed to create UserDataStore: %v", err)
	}

	if err := store.SetLanguage("zh-CN"); err != nil {
		t.Fatalf("failed to set language: %v", err)
	}

	if got := store.GetLanguage(); got != "zh-CN" {
		t.Errorf("expected language 'zh-CN', got '%s'", got)
	}

	if err := store.SetLanguage("system"); err != nil {
		t.Fatalf("failed to set language to system: %v", err)
	}

	if got := store.GetLanguage(); got != "system" {
		t.Errorf("expected language 'system', got '%s'", got)
	}
}
