//go:build !windows

package takeover

import "os/exec"

func hideInspection(*exec.Cmd) {}
