//go:build windows

// Package win32 holds the small slice of the Win32 / OLE COM API that core's
// native Windows drag and clipboard code needs.
//
// It exists so core does not have to pull the whole Wails runtime in just for
// its w32 helpers: the desktop shell is the mygo host, and nothing else in this
// repository depends on Wails. The declarations below mirror the COM contracts
// (vtable order and struct layout) exactly; keep them in sync with the Win32
// headers rather than rearranging fields.
package win32

import (
	"syscall"
	"unsafe"
)

// ComProc stores a COM procedure (a syscall callback address).
type ComProc uintptr

// NewComProc creates a COM proc from a Go function.
func NewComProc(fn interface{}) ComProc {
	return ComProc(syscall.NewCallback(fn))
}

// Call calls a COM procedure.
//
//go:uintptrescapes
func (p ComProc) Call(a ...uintptr) (r1, r2 uintptr, lastErr error) {
	return syscall.SyscallN(uintptr(p), a...)
}

// IUnknownVtbl is the IUnknown vtable, the first three slots of every COM
// interface.
type IUnknownVtbl struct {
	QueryInterface ComProc
	AddRef         ComProc
	Release        ComProc
}

// CallRelease invokes IUnknown::Release through the vtable.
func (i *IUnknownVtbl) CallRelease(this unsafe.Pointer) error {
	_, _, err := i.Release.Call(uintptr(this))
	if err != syscall.Errno(0) {
		return err
	}
	return nil
}

// IDataObjectVtbl is the IDataObject vtable. Slot order is the COM contract.
type IDataObjectVtbl struct {
	IUnknownVtbl
	GetData               ComProc
	GetDataHere           ComProc
	QueryGetData          ComProc
	GetCanonicalFormatEtc ComProc
	SetData               ComProc
	EnumFormatEtc         ComProc
	DAdvise               ComProc
}

// IDataObject is a COM data object interface pointer (first word = vtable).
type IDataObject struct {
	Vtbl *IDataObjectVtbl
}

// Tymed is the TYMED transfer medium type.
type Tymed uint32

// TYMED_HGLOBAL is the transfer medium used by CF_HDROP.
const TYMED_HGLOBAL Tymed = 1

// Clipboard / drag format identifiers.
const (
	CF_HDROP = 15
)

// DVTargetDevice is the DVASPECTINFO target-device structure (unused by this
// code, but part of the FORMATETC layout).
type DVTargetDevice struct {
	TdSize             uint32
	TdDriverNameOffset uint16
	TdDeviceNameOffset uint16
	TdPortNameOffset   uint16
	TdExtDevmodeOffset uint16
	TdData             [1]byte
}

// FORMATETC describes a clipboard / drag format.
type FORMATETC struct {
	CfFormat uint16
	Ptd      *DVTargetDevice
	DwAspect uint32
	Lindex   int32
	Tymed    Tymed
}

// STGMEDIUM is the storage medium a data object hands back.
type STGMEDIUM struct {
	Tymed          Tymed
	Union          uintptr
	PUnkForRelease uintptr
}

// HGLOBAL is a Win32 global memory handle.
type HGLOBAL uintptr

// HDROP is the handle behind CF_HDROP, a list of dropped file paths.
type HDROP uintptr

var (
	modkernel32 = syscall.NewLazyDLL("kernel32.dll")
	modshell32  = syscall.NewLazyDLL("shell32.dll")

	procGlobalFree    = modkernel32.NewProc("GlobalFree")
	procDragQueryFile = modshell32.NewProc("DragQueryFileW")
)

// GlobalFree releases a global memory block.
func GlobalFree(hMem HGLOBAL) {
	ret, _, _ := procGlobalFree.Call(uintptr(hMem))
	if ret != 0 {
		panic("GlobalFree failed")
	}
}

// DragQueryFile returns the file path at iFile, or the number of files in the
// drop list when iFile is 0xFFFFFFFF.
func DragQueryFile(hDrop HDROP, iFile uint) (fileName string, fileCount uint) {
	ret, _, _ := procDragQueryFile.Call(
		uintptr(hDrop),
		uintptr(iFile),
		0,
		0)

	fileCount = uint(ret)

	if iFile != 0xFFFFFFFF {
		buf := make([]uint16, fileCount+1)

		ret, _, _ := procDragQueryFile.Call(
			uintptr(hDrop),
			uintptr(iFile),
			uintptr(unsafe.Pointer(&buf[0])),
			uintptr(fileCount+1))

		if ret == 0 {
			panic("Invoke DragQueryFile error.")
		}

		fileName = syscall.UTF16ToString(buf)
	}

	return
}
