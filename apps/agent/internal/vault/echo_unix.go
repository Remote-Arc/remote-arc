//go:build !windows

package vault

import (
	"os"
	"os/exec"
)

// hideInput turns off terminal echo so a typed password is not shown.
func hideInput(in *os.File) (func(), bool) {
	if fi, e := in.Stat(); e != nil || fi.Mode()&os.ModeCharDevice == 0 {
		return nil, false
	}
	off := exec.Command("stty", "-echo")
	off.Stdin = in
	if off.Run() != nil {
		return nil, false
	}
	return func() {
		on := exec.Command("stty", "echo")
		on.Stdin = in
		_ = on.Run()
	}, true
}
