//go:build !windows

package browserrunner

import "os/exec"

func prepareVideoCommand(cmd *exec.Cmd) {}
