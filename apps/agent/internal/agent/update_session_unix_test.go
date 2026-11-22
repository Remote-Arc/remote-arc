//go:build !windows

package agent

import (
	"os"
	"syscall"
)

// sessionReport tells the detached-start test whether this process leads its own
// process group, which a new session (setsid) always does.
func sessionReport() string {
	if syscall.Getpgrp() == os.Getpid() {
		return "session=leader"
	}
	return "session=inherited"
}
