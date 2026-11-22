package takeover

import (
	"os/exec"
	"syscall"
)

func hideInspection(c *exec.Cmd) { c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true} }
