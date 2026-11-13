//go:build darwin

package browserrunner

import (
	"context"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var hidIdleTime = regexp.MustCompile(`"HIDIdleTime"\s*=\s*([0-9]+)`)
var consoleRecord = regexp.MustCompile(`\{[^{}]+\}`)
var consoleUID = regexp.MustCompile(`"kCGSSessionUserIDKey"\s*=\s*([0-9]+)`)
var consoleActive = regexp.MustCompile(`"kCGSSessionOnConsoleKey"\s*=\s*Yes`)
var consoleLoggedIn = regexp.MustCompile(`"kCGSessionLoginDoneKey"\s*=\s*Yes`)
var consoleLocked = regexp.MustCompile(`"CGSSessionScreenIsLocked"\s*=\s*Yes`)

func macConsolePresent(data []byte, uid int) bool {
	for _, line := range strings.Split(string(data), "\n") {
		if !strings.Contains(line, `"IOConsoleUsers"`) {
			continue
		}
		for _, record := range consoleRecord.FindAllString(line, -1) {
			match := consoleUID.FindStringSubmatch(record)
			if len(match) != 2 {
				continue
			}
			user, err := strconv.Atoi(match[1])
			if err == nil && user == uid && consoleActive.MatchString(record) && consoleLoggedIn.MatchString(record) && !consoleLocked.MatchString(record) {
				return true
			}
		}
	}
	return false
}

func desktopUserPresent() bool {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	data, err := exec.CommandContext(ctx, "/usr/sbin/ioreg", "-r", "-c", "IOHIDSystem", "-l").Output()
	if err != nil {
		return false
	}
	match := hidIdleTime.FindSubmatch(data)
	if len(match) != 2 {
		return false
	}
	idle, err := strconv.ParseUint(string(match[1]), 10, 64)
	if err != nil || idle >= uint64(2*time.Minute) {
		return false
	}
	// The console registry exposes whether the session is locked. Do not
	// require Accessibility permissions or ask System Events to activate apps.
	console, err := exec.CommandContext(ctx, "/usr/sbin/ioreg", "-n", "Root", "-d", "1", "-l").Output()
	return err == nil && macConsolePresent(console, os.Getuid())
}
