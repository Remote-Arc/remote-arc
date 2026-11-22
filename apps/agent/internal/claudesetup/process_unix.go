//go:build !windows

package claudesetup

import "os/exec"

func hide(*exec.Cmd) {}
