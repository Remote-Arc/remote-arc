//go:build !windows

package browserrunner

import (
	"os/exec"
	"syscall"
)

// The browser gets its own process group so a terminal interrupt aimed at a
// foreground Agent does not tear down a task the user may want to resume.
func detach(cmd *exec.Cmd) { cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true} }
