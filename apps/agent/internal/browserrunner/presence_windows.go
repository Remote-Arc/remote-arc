//go:build windows

package browserrunner

import (
	"syscall"
	"time"
	"unsafe"
)

var (
	winLastInput    = winUser32.NewProc("GetLastInputInfo")
	winTicks        = syscall.NewLazyDLL("kernel32.dll").NewProc("GetTickCount64")
	winInputDesktop = winUser32.NewProc("OpenInputDesktop")
	winDesktopInfo  = winUser32.NewProc("GetUserObjectInformationW")
	winCloseDesktop = winUser32.NewProc("CloseDesktop")
)

// Recent input is a conservative presence signal, not permission to read any
// input. A locked/secure desktop or failed probe always means notification only.
func desktopUserPresent() bool {
	desktop, _, _ := winInputDesktop.Call(0, 0, 1) // DESKTOP_READOBJECTS
	if desktop == 0 {
		return false
	}
	defer winCloseDesktop.Call(desktop)
	var name [128]uint16
	var needed uint32
	ok, _, _ := winDesktopInfo.Call(desktop, 2, uintptr(unsafe.Pointer(&name[0])), unsafe.Sizeof(name), uintptr(unsafe.Pointer(&needed)))
	if ok == 0 || syscall.UTF16ToString(name[:]) != "Default" {
		return false
	}
	input := struct{ size, tick uint32 }{size: 8}
	ok, _, _ = winLastInput.Call(uintptr(unsafe.Pointer(&input)))
	if ok == 0 {
		return false
	}
	now, _, _ := winTicks.Call()
	// LASTINPUTINFO uses 32-bit ticks. Unsigned subtraction handles wraparound.
	idle := uint32(now) - input.tick
	return time.Duration(idle)*time.Millisecond < 2*time.Minute
}
