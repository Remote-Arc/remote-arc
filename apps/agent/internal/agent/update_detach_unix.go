//go:build !windows

package agent

import (
	"os/exec"
	"syscall"
)

// detach starts the process in a new session. launchd stops a job's whole
// process group when the job is booted out; a new session is not in it.
func detach(cmd *exec.Cmd) { cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true} }
