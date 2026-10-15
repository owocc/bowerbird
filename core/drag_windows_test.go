//go:build windows

package core

import (
	"image"
	"image/color"
	"image/png"
	"math"
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
	payload *shellDropPayload
	object  unsafe.Pointer
}

func newTestDragData(t *testing.T, paths []string) *testDragData {
	t.Helper()

	payload, err := newShellDropPayload(paths)
	if err != nil {
		t.Fatalf("newShellDropPayload failed: %v", err)
	}
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
		payload.free()
		t.Fatalf("SHCreateDataObject failed: 0x%08x", uint32(hr))
	}
	return &testDragData{payload: payload, object: dataObject}
}

func (d *testDragData) release() {
	(*w32.IDataObject)(d.object).Vtbl.CallRelease(d.object)
	d.payload.free()
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

	object := (*w32.IDataObject)(data.object)
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
		uintptr(data.object),
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

// The bitmap under the cursor is the shell's own thumbnail (file-type icon when
// there is no thumbnail); this asserts we obtain it, keep the ghost under the
// pointer, and hand OLE a SHDRAGIMAGE it accepts.
func TestDragImageIsAttachedToDataObject(t *testing.T) {
	initTestCom(t)
	defer runtime.UnlockOSThread()

	paths := writeTestFiles(t, t.TempDir(), "asset.txt")
	// Pointer at the centre of a 200x120 card.
	request := DragRequest{IDs: []string{"unused"}, GrabX: 100, GrabY: 60, Width: 200, Height: 120}

	image, err := dragImageBitmap(paths[0], request)
	if err != nil {
		t.Fatalf("dragImageBitmap failed: %v", err)
	}
	defer w32.DeleteObject(w32.HGDIOBJ(image.HBmp))

	var info w32.BITMAP
	if n := w32.GetObject(w32.HGDIOBJ(image.HBmp), unsafe.Sizeof(info), unsafe.Pointer(&info)); n == 0 {
		t.Fatal("GetObject returned no bitmap information")
	}
	if info.BmWidth != image.SizeDragImage.CX || info.BmHeight != image.SizeDragImage.CY {
		t.Errorf("drag image reports %dx%d but the bitmap is %dx%d",
			image.SizeDragImage.CX, image.SizeDragImage.CY, info.BmWidth, info.BmHeight)
	}
	if info.BmWidth <= 0 || info.BmHeight <= 0 || info.BmWidth > maxDragImageSide || info.BmHeight > maxDragImageSide {
		t.Errorf("drag image is %dx%d, want a positive bitmap inside the %dpx cap",
			info.BmWidth, info.BmHeight, maxDragImageSide)
	}
	// The pointer was at the middle of the element, so it has to be at the middle
	// of whatever bitmap the shell returned.
	if want := int32(info.BmWidth) / 2; image.PtOffset.X < want-1 || image.PtOffset.X > want+1 {
		t.Errorf("drag image offset x = %d, want ~%d for a centred grab", image.PtOffset.X, want)
	}
	if want := int32(info.BmHeight) / 2; image.PtOffset.Y < want-1 || image.PtOffset.Y > want+1 {
		t.Errorf("drag image offset y = %d, want ~%d for a centred grab", image.PtOffset.Y, want)
	}

	data := newTestDragData(t, paths)
	defer data.release()
	if err := attachDragImage(data.object, image); err != nil {
		t.Fatalf("attachDragImage failed: %v", err)
	}
}

// An oversized element must not turn into a screen-covering ghost.
func TestDragImageScalesDownWithTheElement(t *testing.T) {
	initTestCom(t)
	defer runtime.UnlockOSThread()

	paths := writeTestFiles(t, t.TempDir(), "big.txt")
	request := DragRequest{IDs: []string{"unused"}, GrabX: 500, GrabY: 250, Width: 1000, Height: 500}

	image, err := dragImageBitmap(paths[0], request)
	if err != nil {
		t.Fatalf("dragImageBitmap failed: %v", err)
	}
	defer w32.DeleteObject(w32.HGDIOBJ(image.HBmp))

	if image.SizeDragImage.CX > maxDragImageSide || image.SizeDragImage.CY > maxDragImageSide {
		t.Errorf("drag image is %dx%d, want it capped at %d",
			image.SizeDragImage.CX, image.SizeDragImage.CY, maxDragImageSide)
	}
	// Grabbed at the centre of a 2:1 element, so still centred in the ghost.
	expectedX := int32(image.SizeDragImage.CX) / 2
	expectedY := int32(image.SizeDragImage.CY) / 2
	if image.PtOffset.X < expectedX-1 || image.PtOffset.X > expectedX+1 {
		t.Errorf("drag image offset x = %d, want ~%d", image.PtOffset.X, expectedX)
	}
	if image.PtOffset.Y < expectedY-1 || image.PtOffset.Y > expectedY+1 {
		t.Errorf("drag image offset y = %d, want ~%d", image.PtOffset.Y, expectedY)
	}
}

// A real asset image comes back scaled into the element's box, which is the case
// that matters for library screenshots.
func TestDragImageFitsARealImageIntoTheElement(t *testing.T) {
	initTestCom(t)
	defer runtime.UnlockOSThread()

	path := filepath.Join(t.TempDir(), "wide.png")
	source := image.NewRGBA(image.Rect(0, 0, 1000, 600))
	for x := range 1000 {
		for y := range 600 {
			source.Set(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y % 256), B: 0x40, A: 0xFF})
		}
	}
	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("failed to create %s: %v", path, err)
	}
	if err := png.Encode(file, source); err != nil {
		file.Close()
		t.Fatalf("failed to encode %s: %v", path, err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("failed to close %s: %v", path, err)
	}

	request := DragRequest{IDs: []string{"unused"}, GrabX: 50, GrabY: 30, Width: 200, Height: 120}
	image, err := dragImageBitmap(path, request)
	if err != nil {
		t.Fatalf("dragImageBitmap failed: %v", err)
	}
	defer w32.DeleteObject(w32.HGDIOBJ(image.HBmp))

	var info w32.BITMAP
	if n := w32.GetObject(w32.HGDIOBJ(image.HBmp), unsafe.Sizeof(info), unsafe.Pointer(&info)); n == 0 {
		t.Fatal("GetObject returned no bitmap information")
	}
	if info.BmWidth <= 0 || info.BmHeight <= 0 {
		t.Fatalf("drag image bitmap is %dx%d", info.BmWidth, info.BmHeight)
	}
	// The shell serves a cached thumbnail at its own standard size (256px here)
	// even for a smaller box, so the bound that has to hold is the drag image cap.
	if info.BmWidth > maxDragImageSide || info.BmHeight > maxDragImageSide {
		t.Errorf("drag image is %dx%d, want it inside the %dpx cap",
			info.BmWidth, info.BmHeight, maxDragImageSide)
	}
	// A 1000x600 source must not come back distorted.
	if ratio := float64(info.BmWidth) / float64(info.BmHeight); math.Abs(ratio-1000.0/600.0) > 0.02 {
		t.Errorf("drag image is %dx%d, want the source's 1000x600 aspect", info.BmWidth, info.BmHeight)
	}
	// Grab offset 50,30 of 200,120 is a quarter/quarter into the element.
	wantX := int32(float64(info.BmWidth) * 0.25)
	wantY := int32(float64(info.BmHeight) * 0.25)
	if image.PtOffset.X < wantX-1 || image.PtOffset.X > wantX+1 || image.PtOffset.Y < wantY-1 || image.PtOffset.Y > wantY+1 {
		t.Errorf("drag image offset is %d,%d, want ~%d,%d",
			image.PtOffset.X, image.PtOffset.Y, wantX, wantY)
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
