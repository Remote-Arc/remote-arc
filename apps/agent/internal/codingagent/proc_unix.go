//go:build !windows

package codingagent

import (
	"os/exec"
	"syscall"
	"time"
)

// prepare starts the agent in a process group of its own, so stopping it
// stops the commands it started too.
func prepare(cmd *exec.Cmd) { cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true} }

func terminateTree(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	pid := cmd.Process.Pid
	if syscall.Kill(-pid, syscall.SIGTERM) != nil {
		_ = cmd.Process.Signal(syscall.SIGTERM)
	}
	time.Sleep(300 * time.Millisecond)
	_ = syscall.Kill(-pid, syscall.SIGKILL)
}
