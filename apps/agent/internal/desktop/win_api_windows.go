//go:build windows && (amd64 || arm64)

package desktop

import (
	"syscall"
	"unsafe"
)

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	gdi32    = syscall.NewLazyDLL("gdi32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	ole32    = syscall.NewLazyDLL("ole32.dll")
	oleaut32 = syscall.NewLazyDLL("oleaut32.dll")
	dwmapi   = syscall.NewLazyDLL("dwmapi.dll")

	procSetThreadDpiAwarenessContext = user32.NewProc("SetThreadDpiAwarenessContext")
	procGetDpiForWindow              = user32.NewProc("GetDpiForWindow")
	procGetSystemMetrics             = user32.NewProc("GetSystemMetrics")
	procEnumDisplayMonitors          = user32.NewProc("EnumDisplayMonitors")
	procGetMonitorInfoW              = user32.NewProc("GetMonitorInfoW")
	procEnumWindows                  = user32.NewProc("EnumWindows")
	procGetWindowTextW               = user32.NewProc("GetWindowTextW")
	procGetWindowThreadProcessId     = user32.NewProc("GetWindowThreadProcessId")
	procGetWindowRect                = user32.NewProc("GetWindowRect")
	procIsWindowVisible              = user32.NewProc("IsWindowVisible")
	procIsIconic                     = user32.NewProc("IsIconic")
	procGetWindowLongPtrW            = user32.NewProc("GetWindowLongPtrW")
	procGetForegroundWindow          = user32.NewProc("GetForegroundWindow")
	procSetForegroundWindow          = user32.NewProc("SetForegroundWindow")
	procShowWindow                   = user32.NewProc("ShowWindow")
	procGetAncestor                  = user32.NewProc("GetAncestor")
	procWindowFromPoint              = user32.NewProc("WindowFromPoint")
	procGetCursorPos                 = user32.NewProc("GetCursorPos")
	procSendInput                    = user32.NewProc("SendInput")
	procOpenInputDesktop             = user32.NewProc("OpenInputDesktop")
	procGetUserObjectInformationW    = user32.NewProc("GetUserObjectInformationW")
	procCloseDesktop                 = user32.NewProc("CloseDesktop")
	procSetWindowsHookExW            = user32.NewProc("SetWindowsHookExW")
	procCallNextHookEx               = user32.NewProc("CallNextHookEx")
	procGetMessageW                  = user32.NewProc("GetMessageW")
	procTranslateMessage             = user32.NewProc("TranslateMessage")
	procDispatchMessageW             = user32.NewProc("DispatchMessageW")
	procPostMessageW                 = user32.NewProc("PostMessageW")
	procDefWindowProcW               = user32.NewProc("DefWindowProcW")
	procRegisterClassExW             = user32.NewProc("RegisterClassExW")
	procCreateWindowExW              = user32.NewProc("CreateWindowExW")
	procSetLayeredWindowAttributes   = user32.NewProc("SetLayeredWindowAttributes")
	procSetWindowDisplayAffinity     = user32.NewProc("SetWindowDisplayAffinity")
	procSetWindowPos                 = user32.NewProc("SetWindowPos")
	procBeginPaint                   = user32.NewProc("BeginPaint")
	procEndPaint                     = user32.NewProc("EndPaint")
	procGetClientRect                = user32.NewProc("GetClientRect")
	procFillRect                     = user32.NewProc("FillRect")
	procDrawTextW                    = user32.NewProc("DrawTextW")
	procGetDC                        = user32.NewProc("GetDC")
	procReleaseDC                    = user32.NewProc("ReleaseDC")

	procCreateCompatibleDC     = gdi32.NewProc("CreateCompatibleDC")
	procCreateCompatibleBitmap = gdi32.NewProc("CreateCompatibleBitmap")
	procSelectObject           = gdi32.NewProc("SelectObject")
	procBitBlt                 = gdi32.NewProc("BitBlt")
	procGetDIBits              = gdi32.NewProc("GetDIBits")
	procDeleteObject           = gdi32.NewProc("DeleteObject")
	procDeleteDC               = gdi32.NewProc("DeleteDC")
	procCreateSolidBrush       = gdi32.NewProc("CreateSolidBrush")
	procCreateFontW            = gdi32.NewProc("CreateFontW")
	procSetBkMode              = gdi32.NewProc("SetBkMode")
	procSetTextColor           = gdi32.NewProc("SetTextColor")
	procEllipse                = gdi32.NewProc("Ellipse")
	procGetStockObject         = gdi32.NewProc("GetStockObject")

	procGetModuleHandleW           = kernel32.NewProc("GetModuleHandleW")
	procOpenProcess                = kernel32.NewProc("OpenProcess")
	procQueryFullProcessImageNameW = kernel32.NewProc("QueryFullProcessImageNameW")
	procCloseHandle                = kernel32.NewProc("CloseHandle")
	procGetCurrentThreadId         = kernel32.NewProc("GetCurrentThreadId")

	procCoInitializeEx   = ole32.NewProc("CoInitializeEx")
	procCoCreateInstance = ole32.NewProc("CoCreateInstance")
	procSysStringLen     = oleaut32.NewProc("SysStringLen")
	procSysFreeString    = oleaut32.NewProc("SysFreeString")
	procVariantClear     = oleaut32.NewProc("VariantClear")

	procDwmGetWindowAttribute = dwmapi.NewProc("DwmGetWindowAttribute")
)

const (
	smXVirtualScreen  = 76
	smYVirtualScreen  = 77
	smCXVirtualScreen = 78
	smCYVirtualScreen = 79

	gaRoot            = 2
	gwlExStyle        = ^uintptr(19) // -20
	wsExToolWindow    = 0x80
	wsExTopmost       = 0x8
	wsExLayered       = 0x80000
	wsExTransparent   = 0x20
	wsExNoActivate    = 0x08000000
	wsPopup           = 0x80000000
	swHide            = 0
	swShowNoActivate  = 4
	swRestore         = 9
	swpNoActivate     = 0x10
	lwaAlpha          = 2
	wdaExcludeCapture = 0x11
	dwmaCloaked       = 14
	dwmaFrameBounds   = 9

	whKeyboardLL       = 13
	whMouseLL          = 14
	llkhfInjected      = 0x10
	llkhfLowerInjected = 0x02
	llmhfInjected      = 0x01
	llmhfLowerInjected = 0x02

	wmPaint      = 0x000F
	wmNCHitTest  = 0x0084
	wmApp        = 0x8000
	wmShowNotice = wmApp + 1

	inputMouse    = 0
	inputKeyboard = 1

	mouseMove        = 0x0001
	mouseLeftDown    = 0x0002
	mouseLeftUp      = 0x0004
	mouseRightDown   = 0x0008
	mouseRightUp     = 0x0010
	mouseMiddleDown  = 0x0020
	mouseMiddleUp    = 0x0040
	mouseWheel       = 0x0800
	mouseHWheel      = 0x1000
	mouseVirtualDesk = 0x4000
	mouseAbsolute    = 0x8000
	wheelDelta       = 120

	keyExtended = 0x0001
	keyUp       = 0x0002
	keyUnicode  = 0x0004

	srcCopy    = 0x00CC0020
	captureBlt = 0x40000000

	processQueryLimited = 0x1000
	desktopReadObjects  = 0x0001
	uoiName             = 2
)

// dpiPerMonitorV2 is DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 (-4). A thread
// in this mode sees physical pixels, so screenshots, window rectangles and
// input coordinates agree on every display.
var dpiPerMonitorV2 = ^uintptr(3)

type winRect struct{ Left, Top, Right, Bottom int32 }

func (r winRect) rect() Rect {
	return Rect{int(r.Left), int(r.Top), int(r.Right - r.Left), int(r.Bottom - r.Top)}
}

type winPoint struct{ X, Y int32 }

type monitorInfo struct {
	Size    uint32
	Monitor winRect
	Work    winRect
	Flags   uint32
}

type mouseInput struct {
	DX, DY    int32
	MouseData uint32
	Flags     uint32
	Time      uint32
	ExtraInfo uintptr
}

type keyboardInput struct {
	VK, Scan  uint16
	Flags     uint32
	Time      uint32
	ExtraInfo uintptr
}

// winInput is INPUT. Its union is as large as MOUSEINPUT, the largest member,
// so a keyboard event is written over the same bytes.
type winInput struct {
	Type  uint32
	Mouse mouseInput
}

func (in *winInput) keyboard() *keyboardInput { return (*keyboardInput)(unsafe.Pointer(&in.Mouse)) }

type mouseHookInfo struct {
	Point     winPoint
	MouseData uint32
	Flags     uint32
	Time      uint32
	ExtraInfo uintptr
}

type keyboardHookInfo struct {
	VK, Scan, Flags, Time uint32
	ExtraInfo             uintptr
}

type winMsg struct {
	Hwnd    uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Point   winPoint
	Private uint32
}

type wndClassEx struct {
	Size       uint32
	Style      uint32
	WndProc    uintptr
	ClsExtra   int32
	WndExtra   int32
	Instance   uintptr
	Icon       uintptr
	Cursor     uintptr
	Background uintptr
	MenuName   *uint16
	ClassName  *uint16
	IconSm     uintptr
}

type paintStruct struct {
	HDC       uintptr
	Erase     int32
	Paint     winRect
	Restore   int32
	IncUpdate int32
	Reserved  [32]byte
}

type bitmapInfoHeader struct {
	Size          uint32
	Width         int32
	Height        int32
	Planes        uint16
	BitCount      uint16
	Compression   uint32
	SizeImage     uint32
	XPelsPerMeter int32
	YPelsPerMeter int32
	ClrUsed       uint32
	ClrImportant  uint32
}

type bitmapInfo struct {
	Header bitmapInfoHeader
	Colors [1]uint32
}

// at turns an address the operating system returned into a pointer. The
// memory is never Go-managed, so the garbage collector does not track it.
func at(address uintptr) unsafe.Pointer { return *(*unsafe.Pointer)(unsafe.Pointer(&address)) }

func utf16Ptr(s string) *uint16 {
	p, _ := syscall.UTF16PtrFromString(s)
	return p
}

// packPoint passes a POINT by value: one 64-bit register on amd64 and arm64.
func packPoint(x, y int) uintptr { return uintptr(uint32(int32(x))) | uintptr(uint32(int32(y)))<<32 }
