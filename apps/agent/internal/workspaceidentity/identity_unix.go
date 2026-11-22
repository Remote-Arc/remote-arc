//go:build !windows

package workspaceidentity

import (
	"fmt"
	"os"
	"syscall"
)

func readID(_ string, info os.FileInfo) (string, error) {
	s, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return "", fmt.Errorf("workspace identity unavailable")
	}
	return fmt.Sprintf("%x:%x", s.Dev, s.Ino), nil
}
