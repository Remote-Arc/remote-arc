package cli

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/control"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/journal"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/service"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

// handoffDrain bounds how long an older Agent may take to finish in-flight
// operations after it has been asked to stop.
var handoffDrain = 15 * time.Second

// olderRelease reports whether running is a strictly older release than
// current, using semantic-version precedence including pre-releases
// (0.6.1 < 0.6.2-rc.3 < 0.6.2-rc.4 < 0.6.2). Anything it cannot parse is
// never treated as older, so an unknown owner is never replaced.
func olderRelease(running, current string) bool {
	a, okA := parseRelease(running)
	b, okB := parseRelease(current)
	if !okA || !okB {
		return false
	}
	return compareRelease(a, b) < 0
}

type release struct {
	core [3]int
	pre  []string
}

func parseRelease(v string) (release, bool) {
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	if i := strings.IndexByte(v, '+'); i >= 0 {
		v = v[:i]
	}
	var r release
	core, pre, hasPre := strings.Cut(v, "-")
	parts := strings.Split(core, ".")
	if len(parts) != 3 {
		return r, false
	}
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 || (len(p) > 1 && p[0] == '0') {
			return r, false
		}
		r.core[i] = n
	}
	if hasPre {
		if pre == "" {
			return r, false
		}
		r.pre = strings.Split(pre, ".")
		for _, id := range r.pre {
			if id == "" {
				return r, false
			}
		}
	}
	return r, true
}

func compareRelease(a, b release) int {
	for i := range a.core {
		if a.core[i] != b.core[i] {
			if a.core[i] < b.core[i] {
				return -1
			}
			return 1
		}
	}
	switch {
	case len(a.pre) == 0 && len(b.pre) == 0:
		return 0
	case len(a.pre) == 0:
		return 1 // a release ranks above its pre-releases
	case len(b.pre) == 0:
		return -1
	}
	for i := 0; i < len(a.pre) && i < len(b.pre); i++ {
		x, y := a.pre[i], b.pre[i]
		nx, ex := strconv.Atoi(x)
		ny, ey := strconv.Atoi(y)
		switch {
		case ex == nil && ey == nil:
			if nx != ny {
				if nx < ny {
					return -1
				}
				return 1
			}
		case ex == nil:
			return -1 // numeric identifiers rank below alphanumeric ones
		case ey == nil:
			return 1
		default:
			if c := strings.Compare(x, y); c != 0 {
				return c
			}
		}
	}
	switch {
	case len(a.pre) < len(b.pre):
		return -1
	case len(a.pre) > len(b.pre):
		return 1
	}
	return 0
}

// handOffOlderGoAgent replaces a running, strictly older Go Agent with this
// release. It keeps pairing, permissions, pause state and the user's
// recovery choice. Recovery is paused only in config first, so the old
// supervisor cannot restart the old worker; the OS service is touched only
// after the old Agent has released execution. If the old Agent does not
// stop in time, everything is restored and it keeps running.
func handOffOlderGoAgent(ctx context.Context, dir string, bg *service.Controller, log *journal.Journal, running, version string) error {
	verb := "Upgrading"
	if !olderRelease(running, version) {
		verb = "Replacing"
	}
	log.Log("info", fmt.Sprintf("%s the running Agent v%s with v%s · pairing, permissions and recovery settings are kept.", verb, running, version))
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	previous := cfg.BackgroundEnabled
	restore := func() error {
		latest, e := config.Load()
		if e != nil {
			return e
		}
		latest.BackgroundEnabled = previous
		return config.Save(latest)
	}
	off := false
	cfg.BackgroundEnabled = &off
	if err = config.Save(cfg); err != nil {
		return err
	}
	if _, err = control.Request(ctx, dir, "POST", "/stop"); err != nil {
		if e := restore(); e != nil {
			return e
		}
		return fmt.Errorf("Could not ask the running Agent v%s to stop: %v. It keeps running; run npx remotelink@%s --stop, then start again.", running, err, version)
	}
	deadline := time.Now().Add(handoffDrain)
	for lease.Active(dir, "execution") {
		if time.Now().After(deadline) {
			if e := restore(); e != nil {
				return e
			}
			return fmt.Errorf("The running Agent v%s is still finishing operations, so it was not replaced and keeps running. Try again when it is idle, or run npx remotelink@%s --stop first.", running, version)
		}
		if err = wait(ctx, 100*time.Millisecond); err != nil {
			_ = restore()
			return err
		}
	}
	// The old worker has released execution. Retire its service definition
	// and supervisor; the normal start below installs this release instead.
	_ = bg.Disable(ctx)
	bg.StopSupervision(ctx)
	if err = restore(); err != nil {
		return err
	}
	log.Log("info", "The older Agent stopped and released execution · starting v"+version+".")
	return nil
}

// activeWork reads the work a running Agent would lose if it stopped:
// managed processes are terminated and Browser Runner browsers are closed
// (their checkpoints survive). Agents before 0.6.2-rc.5 do not report it.
func activeWork(status map[string]any) (summary string, busy, known bool) {
	work, ok := status["activeWork"].(map[string]any)
	if !ok {
		return "", false, false
	}
	count := func(key string) int {
		n, _ := work[key].(float64)
		return int(n)
	}
	processes, sessions := count("managedProcesses"), count("browserRunnerSessions")
	parts := []string{}
	if processes > 0 {
		parts = append(parts, plural(processes, "managed process", "managed processes"))
	}
	if sessions > 0 {
		parts = append(parts, plural(sessions, "Browser Runner session", "Browser Runner sessions"))
	}
	return strings.Join(parts, ", "), len(parts) > 0, true
}

func plural(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return strconv.Itoa(n) + " " + many
}

// confirmReplace asks in an attached terminal; it returns false without a
// terminal so scripts never replace a busy Agent implicitly.
var confirmReplace = func(input *os.File, out io.Writer, question string) bool {
	if input == nil || !isTerminal(input) || !isOutputTerminal() {
		return false
	}
	fmt.Fprint(out, question+" [y/N] ")
	line, _ := bufio.NewReader(input).ReadString('\n')
	answer := strings.ToLower(strings.TrimSpace(line))
	return answer == "y" || answer == "yes"
}

// replaceRunningAgent decides whether this launch may stop the running Go
// Agent. An older, idle Agent is upgraded automatically. If it is busy, or
// too old to say, or not older at all, the user must confirm in the terminal
// or pass --force-update; otherwise nothing changes.
func replaceRunningAgent(ctx context.Context, o Options, dir string, bg *service.Controller, log *journal.Journal, status map[string]any, running, version string, input *os.File, out io.Writer) error {
	summary, busy, known := activeWork(status)
	if !o.ForceUpdate && known && !busy {
		return handOffOlderGoAgent(ctx, dir, bg, log, running, version)
	}
	var risk string
	switch {
	case busy:
		risk = fmt.Sprintf("The running Agent v%s has active work (%s). Replacing it stops managed processes and closes Browser Runner browsers; their tasks can resume but running commands cannot.", running, summary)
	case !known:
		risk = fmt.Sprintf("The running Agent v%s cannot report whether it has active work. Replacing it stops any managed processes and Browser Runner browsers it has.", running)
	}
	if o.ForceUpdate {
		if risk != "" {
			log.Log("warn", risk+" Continuing because --force-update was given.")
		}
		return handOffOlderGoAgent(ctx, dir, bg, log, running, version)
	}
	log.Log("warn", risk)
	if confirmReplace(input, out, fmt.Sprintf("Replace the running Agent v%s with v%s now?", running, version)) {
		return handOffOlderGoAgent(ctx, dir, bg, log, running, version)
	}
	return fmt.Errorf("The running Agent v%s was kept and nothing was changed. Run again when its work has finished, or run npx remotelink@%s --force-update to replace it now.", running, version)
}
