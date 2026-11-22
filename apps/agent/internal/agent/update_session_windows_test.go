//go:build windows

package agent

// sessionReport: Windows has no Unix sessions; detachment is by creation flags.
func sessionReport() string { return "session=n/a" }
