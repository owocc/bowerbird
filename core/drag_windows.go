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

	procOleInitialize       = modOle32.NewProc("OleInitialize")
	procDoDragDrop          = modOle32.NewProc("DoDragDrop")
	procSHCreateDataObject  = modShell32.NewProc("SHCreateDataObject")
	procILCreateFromPathW   = modShell32.NewProc("ILCreateFromPathW")
	procILClone             = modShell32.NewProc("ILClone")
	procILRemoveLastID      = modShell32.NewProc("ILRemoveLastID")
	procILFindLastID        = modShell32.NewProc("ILFindLastID")
	procILFree              = modShell32.NewProc("ILFree")
	procGetAsyncKeyState    = modUser32.NewProc("GetAsyncKeyState")
)

var (
	iidIUnknown   = syscall.GUID{Data4: [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	iidIDataObject = syscall.GUID{Data1: 0x0000010e, Data4: [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	iidIDropSource = syscall.GUID{Data1: 0x00000121, Data4: [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
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
func runWindowsFileDrag(hwnd unsafe.Pointer, paths []string) (uint32, error) {
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
func (m *LibraryManager) StartDragItems(ids []string) error {
	if len(ids) == 0 {
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

	paths := make([]string, 0, len(ids))
	for _, id := range ids {
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

	LogDragTrace("start-drag", fmt.Sprintf("platform=windows items=%d paths=%v", len(paths), paths))

	var (
		effect uint32
		err    error
	)
	application.InvokeSync(func() {
		effect, err = runWindowsFileDrag(hwnd, paths)
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
