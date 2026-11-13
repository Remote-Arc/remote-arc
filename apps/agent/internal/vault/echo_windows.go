//go:build windows

package vault

import (
	"os"
	"unsafe"
)

var (
	procGetConsoleMode = kernel32.NewProc("GetConsoleMode")
	procSetConsoleMode = kernel32.NewProc("SetConsoleMode")
)

const enableEchoInput = 0x0004

// hideInput turns off echo on a console so a typed password is not shown.
func hideInput(in *os.File) (func(), bool) {
	var mode uint32
	h := in.Fd()
	if r, _, _ := procGetConsoleMode.Call(h, uintptr(unsafe.Pointer(&mode))); r == 0 {
		return nil, false
	}
	if r, _, _ := procSetConsoleMode.Call(h, uintptr(mode&^enableEchoInput)); r == 0 {
		return nil, false
	}
	return func() { procSetConsoleMode.Call(h, uintptr(mode)) }, true
}
