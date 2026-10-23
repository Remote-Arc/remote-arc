//go:build windows

package vault

import (
	"encoding/base64"
	"errors"
	"strings"
	"syscall"
	"unsafe"
)

// Windows protects passwords with DPAPI for the current user: only this
// user on this computer can unprotect them.

var (
	crypt32              = syscall.NewLazyDLL("crypt32.dll")
	kernel32             = syscall.NewLazyDLL("kernel32.dll")
	procProtect          = crypt32.NewProc("CryptProtectData")
	procUnprotect        = crypt32.NewProc("CryptUnprotectData")
	procLocalFree        = kernel32.NewProc("LocalFree")
	entropy              = []byte("Remote Arc vault v1")
	cryptprotectUIForbid = uintptr(0x1)
)

type dataBlob struct {
	n    uint32
	data *byte
}

func blob(b []byte) *dataBlob {
	if len(b) == 0 {
		return &dataBlob{}
	}
	return &dataBlob{n: uint32(len(b)), data: &b[0]}
}

func (d *dataBlob) bytes() []byte {
	out := make([]byte, d.n)
	copy(out, unsafe.Slice(d.data, d.n))
	return out
}

func seal(_ string, secret []byte) (string, error) {
	var out dataBlob
	r, _, e := procProtect.Call(uintptr(unsafe.Pointer(blob(secret))), 0, uintptr(unsafe.Pointer(blob(entropy))), 0, 0, cryptprotectUIForbid, uintptr(unsafe.Pointer(&out)))
	if r == 0 {
		return "", e
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(out.data)))
	return "dpapi:" + base64.StdEncoding.EncodeToString(out.bytes()), nil
}

func open(_ string, sealed string) ([]byte, error) {
	raw, ok := strings.CutPrefix(sealed, "dpapi:")
	if !ok {
		return nil, errors.New("not protected with DPAPI on this computer")
	}
	in, e := base64.StdEncoding.DecodeString(raw)
	if e != nil {
		return nil, e
	}
	var out dataBlob
	r, _, err := procUnprotect.Call(uintptr(unsafe.Pointer(blob(in))), 0, uintptr(unsafe.Pointer(blob(entropy))), 0, 0, cryptprotectUIForbid, uintptr(unsafe.Pointer(&out)))
	if r == 0 {
		return nil, err
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(out.data)))
	return out.bytes(), nil
}

func forget(string, string) {}

// Protection names how passwords are kept on this computer.
const Protection = "Windows DPAPI (this user on this computer)"
