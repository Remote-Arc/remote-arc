//go:build windows

package browserrunner

import (
	"os/exec"
	"syscall"
)

func prepareVideoCommand(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}
