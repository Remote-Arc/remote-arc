//go:build !windows

package codexsetup

import "os/exec"

func hideWindow(c *exec.Cmd) {}
