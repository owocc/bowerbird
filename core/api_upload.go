package core

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// handleAPIItemUpload imports files streamed from the desktop webview.
//
// Why this exists: WebView2 claims OS drags over the page as its own HTML5 drag,
// so the native IDropTarget never fires and the page only gets `File` objects
// with no disk path. Feeding those through the base64 bridge
// (`handleAPIItemAddFromBase64`) means materialising the whole file as a data
// URL in the renderer and posting a string that is ~1.37x the file size over
// the IPC bridge — a few hundred MB recording froze the window and finished
// never.
//
// This endpoint takes a `multipart/form-data` POST instead: `multipart.Reader`
// streams each part straight to a temp file with bounded memory, then the
// regular by-path import (`LibraryManager.ImportFiles`) runs on those temp
// paths — the same code path a native drop uses, so naming, dedupe and
// thumbnailing all behave identically.
func (s *AssetServer) handleAPIItemUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, ErrCodeMethodNotAllowed, "method not allowed")
		return
	}

	if s.manager == nil || s.manager.GetActiveLibrary() == nil {
		writeError(w, http.StatusServiceUnavailable, ErrCodeNoActiveLibrary, "no active library")
		return
	}

	reader, err := r.MultipartReader()
	if err != nil {
		writeError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "expected multipart/form-data")
		return
	}

	stagingDir, err := os.MkdirTemp("", "bowerbird-drop-")
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrCodeInvalidRequest, err.Error())
		return
	}
	// ImportFiles copies the bytes into the library, so the staging copy is
	// disposable as soon as the import returns.
	defer func() { _ = os.RemoveAll(stagingDir) }()

	var stagedPaths []string
	for {
		part, partErr := reader.NextPart()
		if errors.Is(partErr, io.EOF) {
			break
		}
		if partErr != nil {
			writeError(w, http.StatusBadRequest, ErrCodeInvalidRequest, partErr.Error())
			return
		}
		// Only the "files" field carries payloads; ignore anything else.
		if part.FormName() != "files" {
			_ = part.Close()
			continue
		}

		target := filepath.Join(stagingDir, uniqueDropName(stagingDir, part.FileName()))
		out, createErr := os.Create(target)
		if createErr != nil {
			_ = part.Close()
			writeError(w, http.StatusInternalServerError, ErrCodeInvalidRequest, createErr.Error())
			return
		}
		written, copyErr := io.Copy(out, part)
		closeErr := out.Close()
		_ = part.Close()
		if copyErr != nil {
			writeError(w, http.StatusBadRequest, ErrCodeInvalidRequest, copyErr.Error())
			return
		}
		if closeErr != nil {
			writeError(w, http.StatusInternalServerError, ErrCodeInvalidRequest, closeErr.Error())
			return
		}
		// An empty part is not a file the user meant to drop.
		if written == 0 {
			_ = os.Remove(target)
			continue
		}
		stagedPaths = append(stagedPaths, target)
	}

	if len(stagedPaths) == 0 {
		writeError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "no files in request")
		return
	}

	items, importErr := s.manager.ImportFiles(stagedPaths)
	if importErr != nil {
		writeAppError(w, http.StatusInternalServerError, importErr)
		return
	}

	writeSuccessWithCode(w, SuccessCodeItemsImported, items)
}

// uniqueDropName turns a multipart filename into a safe, unique name inside dir.
//
// The renderer sends whatever the OS gave it, which can contain path separators
// or reserved characters — `filepath.Base` plus an explicit separator strip
// keeps the write inside dir no matter what arrives.
func uniqueDropName(dir string, rawName string) string {
	name := strings.ReplaceAll(rawName, "\\", "/")
	name = filepath.Base(name)
	name = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	// "." / ".." / empty would escape or be rejected by the filesystem.
	if name == "" || name == "." || name == ".." {
		name = "dropped-file"
	}

	candidate := name
	ext := filepath.Ext(name)
	stem := strings.TrimSuffix(name, ext)
	for i := 1; ; i++ {
		if _, err := os.Stat(filepath.Join(dir, candidate)); errors.Is(err, os.ErrNotExist) {
			return candidate
		}
		candidate = fmt.Sprintf("%s-%d%s", stem, i, ext)
	}
}
