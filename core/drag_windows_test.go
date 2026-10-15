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

// writeTestPNG writes a real width x height PNG, i.e. something the shell has an
// actual thumbnail for.
func writeTestPNG(t *testing.T, dir, name string, width, height int) string {
	t.Helper()

	source := image.NewRGBA(image.Rect(0, 0, width, height))
	for x := range width {
		for y := range height {
			source.Set(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y % 256), B: 0x40, A: 0xFF})
		}
	}
	path := filepath.Join(dir, name)
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
	return path
}

// bitmapSize reads back the dimensions of a drag image bitmap.
func bitmapSize(t *testing.T, image shDragImage) w32.BITMAP {
	t.Helper()

	var info w32.BITMAP
	if n := w32.GetObject(w32.HGDIOBJ(image.HBmp), unsafe.Sizeof(info), unsafe.Pointer(&info)); n == 0 {
		t.Fatal("GetObject returned no bitmap information")
	}
	return info
}

func assertWithinCap(t *testing.T, image shDragImage) {
	t.Helper()

	if image.SizeDragImage.CX <= 0 || image.SizeDragImage.CY <= 0 {
		t.Fatalf("drag image is %dx%d, want a positive bitmap", image.SizeDragImage.CX, image.SizeDragImage.CY)
	}
	if image.SizeDragImage.CX > maxDragImageWidth || image.SizeDragImage.CY > maxDragImageHeight {
		t.Errorf("drag image is %dx%d, want it inside the %dx%d cap",
			image.SizeDragImage.CX, image.SizeDragImage.CY, maxDragImageWidth, maxDragImageHeight)
	}
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
// there is no thumbnail); this asserts we obtain it, keep it inside the cap, keep
// the ghost under the pointer, and hand OLE a SHDRAGIMAGE it accepts.
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

	assertWithinCap(t, image)
	info := bitmapSize(t, image)
	if info.BmWidth != image.SizeDragImage.CX || info.BmHeight != image.SizeDragImage.CY {
		t.Errorf("drag image reports %dx%d but the bitmap is %dx%d",
			image.SizeDragImage.CX, image.SizeDragImage.CY, info.BmWidth, info.BmHeight)
	}
	// The pointer was at the middle of the element, so it has to be at the middle
	// of whatever bitmap the shell returned.
	if want := info.BmWidth / 2; image.PtOffset.X < want-1 || image.PtOffset.X > want+1 {
		t.Errorf("drag image offset x = %d, want ~%d for a centred grab", image.PtOffset.X, want)
	}
	if want := info.BmHeight / 2; image.PtOffset.Y < want-1 || image.PtOffset.Y > want+1 {
		t.Errorf("drag image offset y = %d, want ~%d for a centred grab", image.PtOffset.Y, want)
	}

	data := newTestDragData(t, paths)
	defer data.release()
	if err := attachDragImage(data.object, image); err != nil {
		t.Fatalf("attachDragImage failed: %v", err)
	}
}

// The ghost must show the asset as it is: a wide screenshot stays wide, a poster
// stays tall, and neither grows past the cap.
func TestDragImageKeepsTheSourceAspectRatio(t *testing.T) {
	initTestCom(t)
	defer runtime.UnlockOSThread()

	dir := t.TempDir()
	cases := []struct {
		name           string
		width, height  int
		sourceAspect   float64
		landscapeCheck bool
	}{
		{name: "wide.png", width: 1000, height: 600, sourceAspect: 1000.0 / 600.0, landscapeCheck: true},
		{name: "tall.png", width: 600, height: 1000, sourceAspect: 600.0 / 1000.0},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			path := writeTestPNG(t, dir, testCase.name, testCase.width, testCase.height)
			// Grabbed a quarter into a 200x120 card.
			request := DragRequest{IDs: []string{"unused"}, GrabX: 50, GrabY: 30, Width: 200, Height: 120}

			image, err := dragImageBitmap(path, request)
			if err != nil {
				t.Fatalf("dragImageBitmap failed: %v", err)
			}
			defer w32.DeleteObject(w32.HGDIOBJ(image.HBmp))

			assertWithinCap(t, image)

			aspect := float64(image.SizeDragImage.CX) / float64(image.SizeDragImage.CY)
			if math.Abs(aspect-testCase.sourceAspect) > 0.02 {
				t.Errorf("drag image is %dx%d (aspect %.3f), want the source's %.3f",
					image.SizeDragImage.CX, image.SizeDragImage.CY, aspect, testCase.sourceAspect)
			}
			if testCase.landscapeCheck && image.SizeDragImage.CX <= image.SizeDragImage.CY {
				t.Errorf("drag image is %dx%d, want it wider than tall",
					image.SizeDragImage.CX, image.SizeDragImage.CY)
			}
			if !testCase.landscapeCheck && image.SizeDragImage.CY <= image.SizeDragImage.CX {
				t.Errorf("drag image is %dx%d, want it taller than wide",
					image.SizeDragImage.CX, image.SizeDragImage.CY)
			}

			// A grab a quarter into the element stays a quarter into the ghost.
			wantX := int32(float64(image.SizeDragImage.CX) * 0.25)
			wantY := int32(float64(image.SizeDragImage.CY) * 0.25)
			if image.PtOffset.X < wantX-1 || image.PtOffset.X > wantX+1 || image.PtOffset.Y < wantY-1 || image.PtOffset.Y > wantY+1 {
				t.Errorf("drag image offset is %d,%d, want ~%d,%d",
					image.PtOffset.X, image.PtOffset.Y, wantX, wantY)
			}
		})
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
