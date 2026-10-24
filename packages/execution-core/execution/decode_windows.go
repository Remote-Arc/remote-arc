//go:build windows

package execution

import (
	"strings"
	"unicode/utf8"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	kernel32                = windows.NewLazySystemDLL("kernel32.dll")
	procGetOEMCP            = kernel32.NewProc("GetOEMCP")
	procMultiByteToWideChar = kernel32.NewProc("MultiByteToWideChar")
)

const (
	mbErrInvalidChars = 0x8
	codePageUTF8      = 65001
)

// decodeOutput returns process output as UTF-8 text. cmd.exe and many console
// programs write in the OEM code page (for example 936 on Chinese Windows), so
// non-UTF-8 output is converted from it instead of becoming mojibake.
func decodeOutput(b []byte) string {
	if trimmed := utf8Prefix(b); utf8.Valid(trimmed) {
		return string(trimmed)
	}
	if text, ok := decodeCodePage(b, oemCodePage()); ok {
		return text
	}
	return strings.ToValidUTF8(string(b), "\uFFFD")
}

func oemCodePage() uint32 {
	cp, _, _ := procGetOEMCP.Call()
	return uint32(cp)
}

func decodeCodePage(b []byte, cp uint32) (string, bool) {
	if len(b) == 0 || cp == 0 || cp == codePageUTF8 || len(b) > 1<<30 {
		return "", false
	}
	n, _, _ := procMultiByteToWideChar.Call(uintptr(cp), mbErrInvalidChars, uintptr(unsafe.Pointer(&b[0])), uintptr(len(b)), 0, 0)
	if n == 0 {
		return "", false
	}
	wide := make([]uint16, n)
	n, _, _ = procMultiByteToWideChar.Call(uintptr(cp), mbErrInvalidChars, uintptr(unsafe.Pointer(&b[0])), uintptr(len(b)), uintptr(unsafe.Pointer(&wide[0])), n)
	if n == 0 {
		return "", false
	}
	return windows.UTF16ToString(wide[:n]), true
}
