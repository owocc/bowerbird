//go:build windows

package core

import (
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"testing"
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/w32"
)

// A drop target only treats a drag as a file drag when the payload carries
// CF_HDROP - the absence of it is what makes Windows targets navigate to the
// file:// URI instead of copying the file. This asserts the exact payload OLE
// hands over, without needing a real drag gesture.
func TestShellDropPayloadExposesHDrop(t *testing.T) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	// The shell data object is a COM object and needs COM on the calling thread.
	if hr, _, _ := procOleInitialize.Call(0); hr != hresultOK && hr != 1 {
		t.Skipf("OleInitialize unavailable on this thread: 0x%08x", uint32(hr))
	}

	dir := t.TempDir()
	paths := []string{
		filepath.Join(dir, "image one.png"),
		filepath.Join(dir, "second image.png"),
	}
	for _, path := range paths {
		if err := os.WriteFile(path, []byte("fake png content"), 0o644); err != nil {
			t.Fatalf("failed to write %s: %v", path, err)
		}
	}

	payload, err := newShellDropPayload(paths)
	if err != nil {
		t.Fatalf("newShellDropPayload failed: %v", err)
	}
	defer payload.free()

	children := payload.childArray()
	if len(children) != len(paths) {
		t.Fatalf("childArray returned %d items, want %d", len(children), len(paths))
	}

	var dataObject unsafe.Pointer
	hr, _, _ := procSHCreateDataObject.Call(
		payload.folder,
		uintptr(len(children)),
		uintptr(unsafe.Pointer(&children[0])),
		0,
		uintptr(unsafe.Pointer(&iidIDataObject)),
		uintptr(unsafe.Pointer(&dataObject)),
	)
	if int32(hr) < 0 || dataObject == nil {
		t.Fatalf("SHCreateDataObject failed: 0x%08x", uint32(hr))
	}
	object := (*w32.IDataObject)(dataObject)
	defer object.Vtbl.CallRelease(dataObject)

	format := w32.FORMATETC{
		CfFormat: w32.CF_HDROP,
		DwAspect: dvaspectContent,
		Lindex:   -1,
		Tymed:    w32.TYMED_HGLOBAL,
	}
	var medium w32.STGMEDIUM
	// Called through the vtable rather than the w32 wrapper so the HRESULT is
	// checked directly (the wrapper reports the syscall's success errno as an
	// error).
	hr, _, _ = object.Vtbl.GetData.Call(
		uintptr(dataObject),
		uintptr(unsafe.Pointer(&format)),
		uintptr(unsafe.Pointer(&medium)),
	)
	if int32(hr) < 0 {
		t.Fatalf("GetData(CF_HDROP) failed: 0x%08x", uint32(hr))
	}
	if medium.Tymed != w32.TYMED_HGLOBAL {
		t.Fatalf("CF_HDROP delivered as tymed %d, want TYMED_HGLOBAL", medium.Tymed)
	}
	defer w32.GlobalFree(w32.HGLOBAL(medium.Union))

	drop := w32.HDROP(medium.Union)
	if _, count := w32.DragQueryFile(drop, 0xFFFFFFFF); count != uint(len(paths)) {
		t.Fatalf("CF_HDROP carries %d paths, want %d", count, len(paths))
	}
	reported := make(map[string]bool, len(paths))
	for i := range paths {
		name, _ := w32.DragQueryFile(drop, uint(i))
		reported[name] = true
	}
	for _, path := range paths {
		if !reported[path] {
			t.Errorf("CF_HDROP is missing %s (got %v)", path, reported)
		}
	}
}

// OLE calls these slots by index, so the vtable order is the contract: a
// swapped slot would be invoked as the wrong method mid-drag.
func TestDropSourceVtableContract(t *testing.T) {
	vtbl := theDropSource.vtbl
	this := uintptr(unsafe.Pointer(theDropSource))

	var out uintptr
	requested := iidIDropSource
	if hr, _, _ := vtbl.queryInterface.Call(this, uintptr(unsafe.Pointer(&requested)), uintptr(unsafe.Pointer(&out))); hr != hresultOK || out != this {
		t.Fatalf("QueryInterface(IID_IDropSource) = (0x%x, %x), want (0, %x)", hr, out, this)
	}
	runtime.KeepAlive(requested)

	unknown := syscall.GUID{Data4: [8]byte{0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF}}
	if hr, _, _ := vtbl.queryInterface.Call(this, uintptr(unsafe.Pointer(&unknown)), uintptr(unsafe.Pointer(&out))); hr != hresultNoInterface || out != 0 {
		t.Fatalf("QueryInterface(unknown) = (0x%x, %x), want (0x%x, 0)", hr, out, hresultNoInterface)
	}

	if hr, _, _ := vtbl.queryContinueDrag.Call(this, 0, mkLButton); hr != hresultOK {
		t.Errorf("QueryContinueDrag(held) = 0x%x, want 0x0", hr)
	}
	if hr, _, _ := vtbl.queryContinueDrag.Call(this, 1, mkLButton); hr != dragdropSCancel {
		t.Errorf("QueryContinueDrag(escape) = 0x%x, want 0x%x", hr, dragdropSCancel)
	}
	if hr, _, _ := vtbl.queryContinueDrag.Call(this, 0, 0); hr != dragdropSDrop {
		t.Errorf("QueryContinueDrag(released) = 0x%x, want 0x%x", hr, dragdropSDrop)
	}
	if hr, _, _ := vtbl.giveFeedback.Call(this, dropeffectCopy); hr != dragdropSUseDefaultCursors {
		t.Errorf("GiveFeedback = 0x%x, want 0x%x", hr, dragdropSUseDefaultCursors)
	}
}
