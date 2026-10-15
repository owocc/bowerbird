//go:build windows

package core

// Windows native drag-out for library assets.
//
// Why this exists: a drag started inside WebView2 only publishes text formats
// (text/plain, text/uri-list, plus the app's custom MIME types). The OS drag
// payload therefore never carries CF_HDROP, so Explorer, terminals, Photoshop
// and browsers treat the gesture as a text/URL drop - a browser navigates to
// the file:// URI and reports about:blank#blocked. WebView2 exposes no
// host-side outbound drag API (its composition controller only has
// DragEnter/DragOver/Drop for incoming drags), so the drag has to be started by
// us on the app's own window:
//
//  1. drag-out.ts cancels the webview's HTML5 drag and calls
//     Service.StartDragItems with the dragged item ids.
//  2. We build a shell data object from the item file paths
//     (SHCreateDataObject -> CF_HDROP, FileGroupDescriptorW and FileContents,
//     i.e. exactly the payload Explorer publishes for its own file drags) and
//     hand it to OLE together with a minimal IDropSource.
//  3. DoDragDrop runs the OS drag loop; the target application reads CF_HDROP.
//
// Only DROPEFFECT_COPY is offered, so no drop target can ever move or delete a
// library file. The effect DoDragDrop reports back is the authoritative
// "did anything accept this drop" signal and is written to the drag trace.

import (
	"errors"
	"fmt"
	"os"
	"runtime"
	"syscall"
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/w32"
)

// HRESULT / DROPEFFECT / DRAGDROP_* values returned by or passed to OLE.
const (
	hresultOK                  = 0
	hresultNoInterface         = 0x80004002
	hresultPointer             = 0x80004003
	dropeffectCopy             = 1
	dragdropSDrop              = 0x00040100
	dragdropSCancel            = 0x00040101
	dragdropSUseDefaultCursors = 0x00040102
	mkLButton                  = 0x0001
	vkLButton                  = 0x01
	dvaspectContent            = 1
)

var (
	modOle32   = syscall.NewLazyDLL("ole32.dll")
	modShell32 = syscall.NewLazyDLL("shell32.dll")
	modUser32  = syscall.NewLazyDLL("user32.dll")

	procOleInitialize               = modOle32.NewProc("OleInitialize")
	procDoDragDrop                  = modOle32.NewProc("DoDragDrop")
	procCoCreateInstance            = modOle32.NewProc("CoCreateInstance")
	procSHCreateDataObject          = modShell32.NewProc("SHCreateDataObject")
	procSHCreateItemFromParsingName = modShell32.NewProc("SHCreateItemFromParsingName")
	procILCreateFromPathW           = modShell32.NewProc("ILCreateFromPathW")
	procILClone                     = modShell32.NewProc("ILClone")
	procILRemoveLastID              = modShell32.NewProc("ILRemoveLastID")
	procILFindLastID                = modShell32.NewProc("ILFindLastID")
	procILFree                      = modShell32.NewProc("ILFree")
	procGetAsyncKeyState            = modUser32.NewProc("GetAsyncKeyState")
)

var (
	iidIUnknown               = syscall.GUID{Data4: [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	iidIDataObject            = syscall.GUID{Data1: 0x0000010e, Data4: [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	iidIDropSource            = syscall.GUID{Data1: 0x00000121, Data4: [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	iidIShellItemImageFactory = syscall.GUID{Data1: 0xbcc18b79, Data2: 0xba16, Data3: 0x442f, Data4: [8]byte{0x80, 0xc4, 0x8a, 0x59, 0xc3, 0x0c, 0x46, 0x3b}}
	iidIDragSourceHelper      = syscall.GUID{Data1: 0xde5bf786, Data2: 0x477a, Data3: 0x11d2, Data4: [8]byte{0x83, 0x9d, 0x00, 0xc0, 0x4f, 0xd9, 0x18, 0xd0}}
	clsidDragDropHelper       = syscall.GUID{Data1: 0x4657278a, Data2: 0x411b, Data3: 0x11d2, Data4: [8]byte{0x83, 0x9a, 0x00, 0xc0, 0x4f, 0xd9, 0x18, 0xd0}}
)

// dropSourceVtbl is the IDropSource vtable. The field order is the COM contract
// and must not be rearranged: OLE invokes these slots by index.
type dropSourceVtbl struct {
	queryInterface    w32.ComProc
	addRef            w32.ComProc
	release           w32.ComProc
	queryContinueDrag w32.ComProc
	giveFeedback      w32.ComProc
}

// dropSource mirrors the memory layout of a COM object: the first word is the
// vtable pointer, which makes *dropSource itself the interface pointer handed
// to DoDragDrop. It lives for the lifetime of the process - OLE may call
// Release at any point during the drag loop - so the ref count is nominal.
type dropSource struct {
	vtbl *dropSourceVtbl
}

var theDropSource = &dropSource{
	vtbl: &dropSourceVtbl{
		queryInterface:    w32.NewComProc(dropSourceQueryInterface),
		addRef:            w32.NewComProc(dropSourceAddRef),
		release:           w32.NewComProc(dropSourceRelease),
		queryContinueDrag: w32.NewComProc(dropSourceQueryContinueDrag),
		giveFeedback:      w32.NewComProc(dropSourceGiveFeedback),
	},
}

// The riid/ppv parameters arrive as uintptr because COM callbacks must take
// uintptr-sized arguments; they are live pointers owned by the caller for the
// duration of the call (the round-trip is what vet's unsafeptr check flags).
func dropSourceQueryInterface(this, riid, ppv uintptr) uintptr {
	if ppv == 0 {
		return hresultPointer
	}
	out := (*uintptr)(unsafe.Pointer(ppv))
	*out = 0
	if riid == 0 {
		return hresultNoInterface
	}
	requested := *(*syscall.GUID)(unsafe.Pointer(riid))
	if requested != iidIDropSource && requested != iidIUnknown {
		return hresultNoInterface
	}
	*out = this
	return hresultOK
}

func dropSourceAddRef(this uintptr) uintptr { return 1 }

func dropSourceRelease(this uintptr) uintptr { return 1 }

// OLE asks between input events whether the drag should continue: ESC cancels,
// releasing the left button finishes the drag, anything else keeps it alive.
func dropSourceQueryContinueDrag(this, escapePressed, keyState uintptr) uintptr {
	if escapePressed != 0 {
		return dragdropSCancel
	}
	if keyState&mkLButton == 0 {
		return dragdropSDrop
	}
	return hresultOK
}

// Let OLE draw its own copy/link cursor rather than a custom one.
func dropSourceGiveFeedback(this, effect uintptr) uintptr { return dragdropSUseDefaultCursors }

// Drag image.
//
// The webview's own drag draws a ghost of the dragged element, which is exactly
// what the HTML5 drag we cancel would have shown. To keep that feedback we ask
// the shell for the image it would draw (thumbnail for images, file-type icon
// otherwise) and hand it to IDragSourceHelper, so the bitmap follows the cursor.
//
// The bitmap is requested inside a square cap: the shell then fits the content
// into it at the content's own aspect ratio (a large image is scaled down, a
// small one keeps its natural size, an icon stays square) instead of stretching
// it to the element's box.
const (
	siigbfResizeToFit = 0x0
	// maxDragImageWidth/Height bound the ghost on both axes, so a wide screenshot
	// or a tall poster can never cover the screen.
	maxDragImageWidth  = 256
	maxDragImageHeight = 256
)

// IShellItemImageFactory: three IUnknown slots, then GetImage.
type shellItemImageFactoryVtbl struct {
	queryInterface w32.ComProc
	addRef         w32.ComProc
	release        w32.ComProc
	getImage       w32.ComProc
}

type shellItemImageFactory struct {
	vtbl *shellItemImageFactoryVtbl
}

// IDragSourceHelper: three IUnknown slots, then InitializeFromBitmap and
// InitializeFromWindow.
type dragSourceHelperVtbl struct {
	queryInterface       w32.ComProc
	addRef               w32.ComProc
	release              w32.ComProc
	initializeFromBitmap w32.ComProc
	initializeFromWindow w32.ComProc
}

type dragSourceHelper struct {
	vtbl *dragSourceHelperVtbl
}

// shDragImage mirrors SHDRAGIMAGE: the bitmap OLE shows under the cursor, its
// size, and where inside it the pointer sits.
type shDragImage struct {
	SizeDragImage w32.SIZE
	PtOffset      w32.POINT
	HBmp          w32.HBITMAP
	CrColorKey    uint32
}

func releaseComPointer(object unsafe.Pointer) {
	if object == nil {
		return
	}
	(*w32.IUnknown)(object).Vtbl.CallRelease(object)
}

// dragImageBitmap asks the shell for the bitmap it would draw for path, bounded
// by maxDragImageWidth x maxDragImageHeight and keeping the content's own aspect
// ratio, and returns a drag image whose pointer offset matches the bitmap it
// actually got.
//
// The shell does not promise the size it hands back: a large image is scaled down
// to fit the box, a small one comes back at its natural size, and a file-type icon
// comes back as a square of the box' longest side. The offset is therefore derived
// from the measured bitmap rather than from the request, so the ghost stays under
// the pointer whatever the shell decided to return.
func dragImageBitmap(path string, request DragRequest) (shDragImage, error) {
	var image shDragImage

	pathPtr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return image, err
	}

	var factory unsafe.Pointer
	hr, _, _ := procSHCreateItemFromParsingName.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		0,
		uintptr(unsafe.Pointer(&iidIShellItemImageFactory)),
		uintptr(unsafe.Pointer(&factory)),
	)
	if int32(hr) < 0 || factory == nil {
		return image, fmt.Errorf("SHCreateItemFromParsingName failed: 0x%08x", uint32(hr))
	}
	defer releaseComPointer(factory)

	// SIZE is eight bytes, so the x64 ABI passes it in a single register rather
	// than through a pointer.
	box := w32.SIZE{CX: maxDragImageWidth, CY: maxDragImageHeight}
	packedSize := uintptr(uint32(box.CX)) | uintptr(uint32(box.CY))<<32

	var bitmap uintptr
	hr, _, _ = (*shellItemImageFactory)(factory).vtbl.getImage.Call(
		uintptr(factory),
		packedSize,
		siigbfResizeToFit,
		uintptr(unsafe.Pointer(&bitmap)),
	)
	if int32(hr) < 0 || bitmap == 0 {
		return image, fmt.Errorf("IShellItemImageFactory.GetImage failed: 0x%08x", uint32(hr))
	}

	var info w32.BITMAP
	if w32.GetObject(w32.HGDIOBJ(bitmap), unsafe.Sizeof(info), unsafe.Pointer(&info)) == 0 || info.BmWidth <= 0 || info.BmHeight <= 0 {
		w32.DeleteObject(w32.HGDIOBJ(bitmap))
		return image, errors.New("shell returned a bitmap without size information")
	}

	image.SizeDragImage = w32.SIZE{CX: info.BmWidth, CY: info.BmHeight}

	// Where the pointer sits inside the grabbed element, expressed as a fraction
	// of it, then applied to the bitmap - which has a different size and aspect, so
	// a grabbed centre stays a centre. Unknown element geometry means "centre".
	ratioX, ratioY := 0.5, 0.5
	if request.Width > 0 && request.Height > 0 {
		ratioX = float64(request.GrabX) / float64(request.Width)
		ratioY = float64(request.GrabY) / float64(request.Height)
	}
	image.PtOffset = w32.POINT{
		X: int32(ratioX * float64(image.SizeDragImage.CX)),
		Y: int32(ratioY * float64(image.SizeDragImage.CY)),
	}
	image.PtOffset.X = min(max(image.PtOffset.X, 0), image.SizeDragImage.CX-1)
	image.PtOffset.Y = min(max(image.PtOffset.Y, 0), image.SizeDragImage.CY-1)

	image.HBmp = w32.HBITMAP(bitmap)
	return image, nil
}

// attachDragImage stores the bitmap in the data object so OLE draws it during the
// drag loop.
func attachDragImage(dataObject unsafe.Pointer, image shDragImage) error {
	var helper unsafe.Pointer
	hr, _, _ := procCoCreateInstance.Call(
		uintptr(unsafe.Pointer(&clsidDragDropHelper)),
		0,
		w32.CLSCTX_INPROC_SERVER,
		uintptr(unsafe.Pointer(&iidIDragSourceHelper)),
		uintptr(unsafe.Pointer(&helper)),
	)
	if int32(hr) < 0 || helper == nil {
		return fmt.Errorf("CoCreateInstance(CLSID_DragDropHelper) failed: 0x%08x", uint32(hr))
	}
	defer releaseComPointer(helper)

	hr, _, _ = (*dragSourceHelper)(helper).vtbl.initializeFromBitmap.Call(
		uintptr(helper),
		uintptr(unsafe.Pointer(&image)),
		uintptr(dataObject),
	)
	if int32(hr) < 0 {
		return fmt.Errorf("IDragSourceHelper.InitializeFromBitmap failed: 0x%08x", uint32(hr))
	}
	return nil
}

// shellDropPayload owns the shell item IDs (PIDLs) of the dragged files. They
// have to stay alive until the drag loop returns, because the data object the
// shell creates from them reads through them.
type shellDropPayload struct {
	folder uintptr
	items  []uintptr
}

func (p *shellDropPayload) free() {
	for _, pidl := range p.items {
		procILFree.Call(pidl)
	}
	if p.folder != 0 {
		procILFree.Call(p.folder)
	}
	p.items = nil
	p.folder = 0
}

// newShellDropPayload converts the paths into the (parent folder, child item)
// form SHCreateDataObject expects. Library assets all live in
// <library>/items/<hash>/<file>, so they share one parent folder; paths from
// different parents are not draggable in one session.
func newShellDropPayload(paths []string) (*shellDropPayload, error) {
	payload := &shellDropPayload{}
	for _, path := range paths {
		wide, err := syscall.UTF16PtrFromString(path)
		if err != nil {
			continue
		}
		pidl, _, _ := procILCreateFromPathW.Call(uintptr(unsafe.Pointer(wide)))
		if pidl == 0 {
			continue
		}
		if payload.folder == 0 {
			parent, _, _ := procILClone.Call(pidl)
			removed, _, _ := procILRemoveLastID.Call(parent)
			if parent != 0 && removed != 0 {
				payload.folder = parent
			} else if parent != 0 {
				procILFree.Call(parent)
			}
		}
		payload.items = append(payload.items, pidl)
	}
	if payload.folder == 0 || len(payload.items) == 0 {
		payload.free()
		return nil, errors.New("no shell items for the given paths")
	}
	return payload, nil
}

// childArray returns the item IDs relative to the folder ID, which is the array
// SHCreateDataObject takes.
func (p *shellDropPayload) childArray() []uintptr {
	children := make([]uintptr, 0, len(p.items))
	for _, pidl := range p.items {
		child, _, _ := procILFindLastID.Call(pidl)
		if child != 0 {
			children = append(children, child)
		}
	}
	return children
}

// runWindowsFileDrag publishes the paths as CF_HDROP and runs the OLE drag loop
// until the user releases the button or cancels. It blocks, so it must run on
// the thread that owns the window.
func runWindowsFileDrag(hwnd unsafe.Pointer, paths []string, request DragRequest) (uint32, error) {
	// OLE has to be initialized on the thread running the drag loop. 0 = S_OK,
	// 1 = S_FALSE (already initialized), anything else (notably 0x80010106
	// RPC_E_CHANGED_MODE, i.e. the thread is MTA) is recorded and the drag is
	// still attempted so the failure shows up in the trace.
	if hr, _, _ := procOleInitialize.Call(0); hr != hresultOK && hr != 1 {
		LogDragTrace("start-drag", fmt.Sprintf("OleInitialize=0x%08x (thread is not an STA)", uint32(hr)))
	}

	payload, err := newShellDropPayload(paths)
	if err != nil {
		return 0, err
	}
	defer payload.free()

	children := payload.childArray()
	if len(children) == 0 {
		return 0, errors.New("no drag item ids resolved")
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
	runtime.KeepAlive(children)
	if int32(hr) < 0 || dataObject == nil {
		return 0, fmt.Errorf("SHCreateDataObject failed: 0x%08x", uint32(hr))
	}
	object := (*w32.IDataObject)(dataObject)
	defer object.Vtbl.CallRelease(dataObject)

	// Without a drag image OLE only moves the cursor, which reads as "nothing is
	// being dragged"; the bitmap has to stay alive until the loop returns.
	if image, err := dragImageBitmap(paths[0], request); err == nil {
		if attachErr := attachDragImage(dataObject, image); attachErr != nil {
			LogDragTrace("start-drag", fmt.Sprintf("drag image rejected: %v", attachErr))
			w32.DeleteObject(w32.HGDIOBJ(image.HBmp))
		} else {
			defer w32.DeleteObject(w32.HGDIOBJ(image.HBmp))
		}
	} else {
		LogDragTrace("start-drag", fmt.Sprintf("no drag image for %s: %v", paths[0], err))
	}

	var effect uint32
	hr, _, _ = procDoDragDrop.Call(
		uintptr(dataObject),
		uintptr(unsafe.Pointer(theDropSource)),
		dropeffectCopy,
		uintptr(unsafe.Pointer(&effect)),
	)
	if int32(hr) < 0 {
		return effect, fmt.Errorf("DoDragDrop failed: 0x%08x", uint32(hr))
	}
	return effect, nil
}

// StartDragItems starts a native OS drag for the given library items. It returns
// once the drag has ended, since the OLE loop owns the mouse until then; callers
// in the webview fire it without awaiting the result.
func (m *LibraryManager) StartDragItems(request DragRequest) error {
	if len(request.IDs) == 0 {
		return errors.New("no items to drag")
	}

	window := m.getWindow()
	if window == nil {
		return errors.New("no window available")
	}
	hwnd := window.NativeWindow()
	if hwnd == nil {
		return errors.New("native window is nil")
	}

	paths := make([]string, 0, len(request.IDs))
	for _, id := range request.IDs {
		item, err := m.GetItem(id)
		if err != nil || item == nil {
			LogDragTrace("start-drag", fmt.Sprintf("item %s not found, skipped", id))
			continue
		}
		if info, statErr := os.Stat(item.FilePath); statErr != nil || info.IsDir() {
			LogDragTrace("start-drag", fmt.Sprintf("path %s is not a readable file, skipped", item.FilePath))
			continue
		}
		paths = append(paths, item.FilePath)
	}
	if len(paths) == 0 {
		return errors.New("no draggable files resolved")
	}

	// The gesture is live only while the button is down. Starting the drag after
	// the release would drop whatever is under the cursor immediately.
	if state, _, _ := procGetAsyncKeyState.Call(vkLButton); state&0x8000 == 0 {
		LogDragTrace("start-drag", "aborted: left mouse button already released")
		return errors.New("drag gesture already ended")
	}

	LogDragTrace("start-drag", fmt.Sprintf(
		"platform=windows items=%d paths=%v grab=%dx%d at %d,%d",
		len(paths), paths, request.Width, request.Height, request.GrabX, request.GrabY,
	))

	var (
		effect uint32
		err    error
	)
	application.InvokeSync(func() {
		effect, err = runWindowsFileDrag(hwnd, paths, request)
	})
	if err != nil {
		LogDragTrace("drag-out-finished", fmt.Sprintf("error=%v", err))
		return err
	}

	// effect 0x1 = copy, 0x2 = move, 0x4 = link; 0 means no target accepted the
	// drop, which is the signal to compare against the target's own behaviour.
	LogDragTrace("drag-out-finished", fmt.Sprintf("effect=0x%x accepted=%t items=%d", effect, effect != 0, len(paths)))
	return nil
}
