//go:build windows

package agent

import (
	"os/exec"
	"syscall"
)

const (
	detachedProcess       = 0x00000008
	createNewProcessGroup = 0x00000200
)

// detach starts the process without a console and in its own process group, so
// no console close or Ctrl event of this Agent reaches it. The old supervisor's
// tree is stopped only after this Agent has exited, so the new process is not
// in it.
func detach(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: detachedProcess | createNewProcessGroup}
}
