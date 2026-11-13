package cli

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/control"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/journal"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/release"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/service"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

// handoffDrain bounds how long an older Agent may take to finish in-flight
// operations after it has been asked to stop.
var handoffDrain = 15 * time.Second

// olderRelease reports whether running is a strictly older release than
// current. The rule lives in internal/release so remote updates share it.
func olderRelease(running, current string) bool { return release.Older(running, current) }

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
		return fmt.Errorf("Could not ask the running Agent v%s to stop: %w. It keeps running; run npx remotelink@%s --stop, then start again.", running, err, version)
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

// installUpdatedService finishes a remote update. By now the older Agent has been
// replaced (or was not running) and its service retired. This release installs
// its own background service and returns, so the service worker, not this
// detached process, owns execution: the Agent stays a background Agent and can
// take the next remote update. Another live owner is never replaced here.
func installUpdatedService(ctx context.Context, dir string, bg *service.Controller, log *journal.Journal, version string) error {
	if lease.Active(dir, "execution") {
		return errors.New("Another Agent still owns execution, so the remote update did not take over. Nothing was changed.")
	}
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("Cannot read saved pairing: %w", err)
	}
	on := true
	cfg.BackgroundEnabled = &on
	if err = config.Save(cfg); err != nil {
		return err
	}
	status, err := bg.Enable(ctx)
	if err != nil {
		return err
	}
	log.Log("success", fmt.Sprintf("Remote update installed v%s as the background service (%s); it takes over now.", version, status.Service))
	return nil
}

// activeWork reads the work a running Agent would lose if it stopped:
// managed processes are terminated and browser_runner browsers are closed
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
	processes, sessions := count("managedProcesses"), count("browser_runner_sessions")
	if _, canonical := work["browser_runner_sessions"]; !canonical {
		sessions = count("browserRunnerSessions") // Compatibility with rc.5 Agents.
	}
	parts := []string{}
	if processes > 0 {
		parts = append(parts, plural(processes, "managed process", "managed processes"))
	}
	if sessions > 0 {
		parts = append(parts, plural(sessions, "browser_runner session", "browser_runner sessions"))
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
		risk = fmt.Sprintf("The running Agent v%s has active work (%s). Replacing it stops managed processes and closes browser_runner browsers; their tasks can resume but running commands cannot.", running, summary)
	case !known:
		risk = fmt.Sprintf("The running Agent v%s cannot report whether it has active work. Replacing it stops any managed processes and browser_runner browsers it has.", running)
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
