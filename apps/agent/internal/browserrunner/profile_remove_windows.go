//go:build windows

package browserrunner

import (
	"context"
	"errors"
	"os"
	"syscall"
	"time"
)

// Chrome's main process can exit before its children release their profile
// handles. Retry only Windows file-in-use errors; never report removal before
// it actually succeeds, and keep the caller's deadline shorter than our cap.
func removeBrowserProfile(ctx context.Context, path string) error {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	var last error
	for {
		if err := ctx.Err(); err != nil {
			return errors.Join(err, last)
		}
		last = os.RemoveAll(path)
		if last == nil {
			return nil
		}
		// Win32 ERROR_SHARING_VIOLATION (32) and ERROR_LOCK_VIOLATION (33)
		// have no named constants in Go's syscall package.
		if !errors.Is(last, os.ErrPermission) && !errors.Is(last, syscall.Errno(32)) && !errors.Is(last, syscall.Errno(33)) && !errors.Is(last, syscall.ERROR_DIR_NOT_EMPTY) {
			return last
		}
		timer := time.NewTimer(50 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return errors.Join(ctx.Err(), last)
		case <-timer.C:
		}
	}
}
