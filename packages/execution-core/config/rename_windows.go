//go:build windows

package config

import (
	"errors"
	"os"
	"syscall"
)

// A process reading the target makes Windows refuse a rename over it. Win32
// ERROR_SHARING_VIOLATION (32) and ERROR_LOCK_VIOLATION (33) have no named
// constants in Go's syscall package.
func renameBlocked(e error) bool {
	return errors.Is(e, os.ErrPermission) || errors.Is(e, syscall.Errno(32)) || errors.Is(e, syscall.Errno(33))
}
