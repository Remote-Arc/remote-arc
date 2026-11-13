//go:build !windows && !darwin

package browserrunner

import (
	"context"
	"os/exec"
	"strings"
	"time"
)

func desktopUserPresent() bool {
	if !hasDisplay() {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	data, err := exec.CommandContext(ctx, "loginctl", "show-session", "self", "-p", "Active", "-p", "LockedHint", "-p", "IdleHint").Output()
	if err != nil {
		return false
	}
	properties := map[string]string{}
	for _, line := range strings.Split(string(data), "\n") {
		key, value, ok := strings.Cut(line, "=")
		if ok {
			properties[key] = strings.TrimSpace(value)
		}
	}
	return properties["Active"] == "yes" && properties["LockedHint"] == "no" && properties["IdleHint"] == "no"
}
