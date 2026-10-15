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

// testDragData is the shell data object a drag would publish, kept alive for the
// duration of a test.
type testDragData struct {
	drag *windowsDrag
}

// procRegisterClipboardFormatW resolves the clipboard format ID a named drag
// format travels in.
var procRegisterClipboardFormatW = syscall.NewLazyDLL("user32.dll").NewProc("RegisterClipboardFormatW")

func (d *testDragData) release() { d.drag.release() }

// newTestDragData builds the payload a real drag would publish, through the same
// constructor the drag loop uses, so the assertions below describe what a drop
// target actually receives.
func newTestDragData(t *testing.T, paths []string) *testDragData {
	t.Helper()

	drag, err := newWindowsDrag(paths)
	if err != nil {
		t.Fatalf("newWindowsDrag failed: %v", err)
	}
	if got := len(drag.payload.items); got != len(paths) {
		drag.release()
		t.Fatalf("payload resolved %d items, want %d", got, len(paths))
	}
	return &testDragData{drag: drag}
}

// initTestCom puts the calling thread in an STA, which the shell data object and
// the thumbnail extraction both need.
func initTestCom(t *testing.T) {
	t.Helper()
	runtime.LockOSThread()
	if hr, _, _ := procOleInitialize.Call(0); hr != hresultOK && hr != 1 {
		t.Skipf("OleInitialize unavailable on this thread: 0x%08x", uint32(hr))
	}
}

func writeTestFiles(t *testing.T, dir string, names ...string) []string {
	t.Helper()

	paths := make([]string, 0, len(names))
	for _, name := range names {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte("fake content"), 0o644); err != nil {
			t.Fatalf("failed to write %s: %v", path, err)
		}
		paths = append(paths, path)
	}
	return paths
}

// A drop target only treats a drag as a file drag when the payload carries
// CF_HDROP - the absence of it is what makes Windows targets navigate to the
// file:// URI instead of copying the file. This asserts the exact payload OLE
// hands over, without needing a real drag gesture.
func TestShellDropPayloadExposesHDrop(t *testing.T) {
	initTestCom(t)
	defer runtime.UnlockOSThread()

	paths := writeTestFiles(t, t.TempDir(), "image one.png", "second image.png")
	data := newTestDragData(t, paths)
	defer data.release()

	object := (*w32.IDataObject)(data.drag.object)
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
	hr, _, _ := object.Vtbl.GetData.Call(
		uintptr(data.drag.object),
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

// The drag must not publish a drag image. OLE renders a supplied bitmap with
// SHDRAGIMAGE.crColorKey as its background colour - black when the key is left at
// zero - so an image came out with the asset's own colours cut out of it. This
// asserts the payload carries CF_HDROP and nothing for OLE to draw, which is the
// whole reason the drag preview cannot damage an asset.
func TestDragPayloadCarriesNoDragImage(t *testing.T) {
	initTestCom(t)
	defer runtime.UnlockOSThread()

	// The format ID the drag image travels in, so a helper could only be found by
	// the shell looking for this name.
	name, err := syscall.UTF16PtrFromString("DragImageBits")
	if err != nil {
		t.Fatalf("UTF16PtrFromString: %v", err)
	}
	dragImageFormat, _, _ := procRegisterClipboardFormatW.Call(uintptr(unsafe.Pointer(name)))
	if dragImageFormat == 0 {
		t.Fatal("RegisterClipboardFormatW(DragImageBits) returned 0")
	}

	paths := writeTestFiles(t, t.TempDir(), "image one.png")
	data := newTestDragData(t, paths)
	defer data.release()

	object := (*w32.IDataObject)(data.drag.object)
	// QueryGetData answers S_OK when the format is on offer and a failure HRESULT
	// (S_FALSE, DV_E_FORMATETC) otherwise. Called through the vtable because the
	// w32 wrapper reports the syscall's success errno as an error.
	offered := func(format uint16) uint32 {
		etc := w32.FORMATETC{
			CfFormat: format,
			DwAspect: dvaspectContent,
			Lindex:   -1,
			Tymed:    w32.TYMED_HGLOBAL,
		}
		hr, _, _ := object.Vtbl.QueryGetData.Call(uintptr(data.drag.object), uintptr(unsafe.Pointer(&etc)))
		return uint32(hr)
	}

	// Control: the same call succeeds for the format we do publish, so the
	// assertion below cannot pass just because QueryGetData never works here.
	if hr := offered(w32.CF_HDROP); hr != hresultOK {
		t.Fatalf("QueryGetData(CF_HDROP) = 0x%08x, so this test cannot tell a missing drag image from a broken query", hr)
	}
	if hr := offered(uint16(dragImageFormat)); hr == hresultOK {
		t.Error("the drag offers DragImageBits, so OLE draws a ghost of a bitmap we hand it")
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
