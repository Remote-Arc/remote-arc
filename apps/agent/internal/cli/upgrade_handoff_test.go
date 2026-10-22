package cli

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/control"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/journal"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/service"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

func TestOlderReleaseOrdersPreReleases(t *testing.T) {
	for _, c := range [][2]string{
		{"0.6.1", "0.6.2-rc.3"},
		{"0.6.1-rc.5", "0.6.2-rc.4"},
		{"0.6.2-rc.3", "0.6.2-rc.4"},
		{"0.6.2-rc.9", "0.6.2-rc.10"},
		{"0.6.2-rc.4", "0.6.2"},
		{"0.6.2-alpha", "0.6.2-alpha.1"},
		{"0.6.2-1", "0.6.2-rc"},
		{"v0.5.9", "0.6.0+build.7"},
	} {
		if !olderRelease(c[0], c[1]) {
			t.Fatalf("%s should be older than %s", c[0], c[1])
		}
		if olderRelease(c[1], c[0]) {
			t.Fatalf("%s should not be older than %s", c[1], c[0])
		}
	}
	for _, c := range [][2]string{{"0.6.2", "0.6.2"}, {"0.6.2-rc.4", "0.6.2-rc.4"}, {"", "0.6.2"}, {"test", "0.6.2"}, {"0.6.1", "dev"}, {"01.2.3", "1.2.4"}, {"1.2", "1.2.1"}, {"1.2.3-", "1.2.4"}} {
		if olderRelease(c[0], c[1]) {
			t.Fatalf("%q vs %q must never be treated as an upgrade", c[0], c[1])
		}
	}
}

// oldAgent stands in for an already running, older Go Agent: it owns the
// execution lease and answers the local control endpoint.
type oldAgent struct {
	mu             sync.Mutex
	owned          *lease.Lease
	server         *control.Server
	stops          int
	recoveryAtStop *bool
	obey           bool
}

var idle = map[string]any{"managedProcesses": 0, "browserRunnerSessions": 0}

// startOldAgent runs a fake Agent; work is its reported activeWork, or nil
// for an Agent from before activeWork existed.
func startOldAgent(t *testing.T, version string, obey bool, work ...map[string]any) *oldAgent {
	t.Helper()
	dir := filepath.Join(config.Dir(), "agent")
	owned, e := lease.Acquire(dir, "execution")
	if e != nil || owned == nil {
		t.Fatalf("old agent could not own execution: %v", e)
	}
	a := &oldAgent{owned: owned, obey: obey}
	a.server, e = control.Start(dir, version, func() any {
		status := map[string]any{"engine": "go", "version": version}
		if len(work) > 0 && work[0] != nil {
			status["activeWork"] = work[0]
		}
		return status
	}, func() {
		a.mu.Lock()
		defer a.mu.Unlock()
		a.stops++
		if c, err := config.Load(); err == nil {
			a.recoveryAtStop = c.BackgroundEnabled
		}
		if a.obey {
			go func() {
				time.Sleep(50 * time.Millisecond) // drain
				a.owned.Release()
			}()
		}
	})
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { a.server.Close(); a.owned.Release() })
	return a
}

func handoffFixture(t *testing.T) (string, *service.Controller, *journal.Journal, *[]string) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	on := true
	if e := config.Save(config.Config{DeviceID: "dev", DeviceToken: "private", Origin: "https://mcp.remotearc.app", Mode: "managed", BackgroundEnabled: &on, ExecutionPaused: true}); e != nil {
		t.Fatal(e)
	}
	var calls []string
	bg := &service.Controller{Home: home, Platform: "linux", Version: "0.6.2-rc.5", Wait: func(time.Duration) {}, Run: func(_ context.Context, name string, args ...string) (string, error) {
		calls = append(calls, name+" "+strings.Join(args, " "))
		return "", nil
	}}
	log := &journal.Journal{Dir: filepath.Join(home, "logs"), Output: os.Stderr}
	return filepath.Join(config.Dir(), "agent"), bg, log, &calls
}

func TestHandOffOlderGoAgentKeepsPairingPauseAndRecovery(t *testing.T) {
	dir, bg, log, _ := handoffFixture(t)
	old := startOldAgent(t, "0.6.2-rc.4", true)
	if e := handOffOlderGoAgent(context.Background(), dir, bg, log, "0.6.2-rc.4", "0.6.2-rc.5"); e != nil {
		t.Fatal(e)
	}
	if lease.Active(dir, "execution") {
		t.Fatal("older Agent still owns execution after handoff")
	}
	old.mu.Lock()
	stops, atStop := old.stops, old.recoveryAtStop
	old.mu.Unlock()
	if stops != 1 {
		t.Fatalf("older Agent asked to stop %d times", stops)
	}
	// While the old Agent drains, its supervisor must see recovery off so it
	// cannot restart the old worker in the gap.
	if atStop == nil || *atStop {
		t.Fatal("recovery was not paused before the older Agent stopped")
	}
	c, e := config.Load()
	if e != nil || c.DeviceToken != "private" || c.Mode != "managed" || !c.ExecutionPaused || c.BackgroundEnabled == nil || !*c.BackgroundEnabled {
		t.Fatalf("handoff changed the saved device state: %+v", c)
	}
}

func TestHandOffOlderGoAgentThatKeepsWorkingIsLeftRunning(t *testing.T) {
	dir, bg, log, calls := handoffFixture(t)
	startOldAgent(t, "0.6.2-rc.4", false)
	prev := handoffDrain
	handoffDrain = 300 * time.Millisecond
	t.Cleanup(func() { handoffDrain = prev })
	e := handOffOlderGoAgent(context.Background(), dir, bg, log, "0.6.2-rc.4", "0.6.2-rc.5")
	if e == nil || !strings.Contains(e.Error(), "keeps running") {
		t.Fatalf("expected a clear refusal, got %v", e)
	}
	if !lease.Active(dir, "execution") {
		t.Fatal("busy older Agent lost execution")
	}
	if len(*calls) != 0 {
		t.Fatalf("recovery service touched while the older Agent still runs: %v", *calls)
	}
	c, _ := config.Load()
	if c.BackgroundEnabled == nil || !*c.BackgroundEnabled || !c.ExecutionPaused {
		t.Fatalf("recovery choice not restored: %+v", c)
	}
}

func TestPlainLaunchNeverReplacesSameOrNewerGoAgent(t *testing.T) {
	handoffFixture(t)
	previousHook := startClientIntegrations
	startClientIntegrations = func(context.Context, string, func(string, string)) context.CancelFunc { return func() {} }
	t.Cleanup(func() { startClientIntegrations = previousHook })
	relay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	defer relay.Close()
	c, _ := config.Load()
	c.Origin = relay.URL
	if e := config.Save(c); e != nil {
		t.Fatal(e)
	}
	for _, running := range []string{"0.6.2-rc.5", "0.6.3"} {
		old := startOldAgent(t, running, true)
		ctx, cancel := context.WithTimeout(context.Background(), 700*time.Millisecond)
		var out syncBuffer
		_ = Main(ctx, nil, "0.6.2-rc.5", os.Stdin, &out, &out)
		cancel()
		old.mu.Lock()
		stops := old.stops
		old.mu.Unlock()
		if stops != 0 {
			t.Fatalf("a launch of 0.6.2-rc.5 stopped a running %s Agent", running)
		}
		old.server.Close()
		old.owned.Release()
	}
}

func TestPlainLaunchOfNewerReleaseReplacesOlderGoAgent(t *testing.T) {
	handoffFixture(t)
	previousHook := startClientIntegrations
	startClientIntegrations = func(context.Context, string, func(string, string)) context.CancelFunc { return func() {} }
	t.Cleanup(func() { startClientIntegrations = previousHook })
	relay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	defer relay.Close()
	c, _ := config.Load()
	c.Origin = relay.URL
	c.BackgroundEnabled = nil // keep the host's real service manager out of this test
	if e := config.Save(c); e != nil {
		t.Fatal(e)
	}
	old := startOldAgent(t, "0.6.2-rc.4", true, idle)
	dir := filepath.Join(config.Dir(), "agent")
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	done := make(chan error, 1)
	var out syncBuffer
	go func() { done <- Main(ctx, nil, "0.6.2-rc.5", os.Stdin, &out, &out) }()
	replaced := false
	for !replaced && ctx.Err() == nil {
		if b, e := os.ReadFile(filepath.Join(dir, "control.json")); e == nil && strings.Contains(string(b), `"0.6.2-rc.5"`) && lease.Active(dir, "execution") {
			replaced = true
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	cancel()
	if e := <-done; e != nil && !errors.Is(e, context.Canceled) && !errors.Is(e, context.DeadlineExceeded) {
		t.Fatal(e)
	}
	if !replaced {
		t.Fatalf("newer release did not take over execution:\n%s", out.String())
	}
	if strings.Contains(out.String(), "Following its operation log") {
		t.Fatal("newer release fell back to the log viewer")
	}
	old.mu.Lock()
	stops := old.stops
	old.mu.Unlock()
	saved, e := config.Load()
	if stops != 1 || e != nil || saved.DeviceToken != "private" || !saved.ExecutionPaused || saved.BackgroundEnabled != nil {
		t.Fatalf("stops=%d saved=%+v err=%v", stops, saved, e)
	}
}

type syncBuffer struct {
	mu sync.Mutex
	b  strings.Builder
}

func (s *syncBuffer) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.Write(p)
}

func (s *syncBuffer) String() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.String()
}

func launchFixture(t *testing.T) {
	t.Helper()
	handoffFixture(t)
	previousHook := startClientIntegrations
	startClientIntegrations = func(context.Context, string, func(string, string)) context.CancelFunc { return func() {} }
	previousConfirm := confirmReplace
	confirmReplace = func(*os.File, io.Writer, string) bool { return false }
	t.Cleanup(func() { startClientIntegrations = previousHook; confirmReplace = previousConfirm })
	relay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	t.Cleanup(relay.Close)
	c, _ := config.Load()
	c.Origin = relay.URL
	c.BackgroundEnabled = nil // keep the host's real service manager out of this test
	if e := config.Save(c); e != nil {
		t.Fatal(e)
	}
}

// launch runs the CLI briefly and reports whether the old Agent was stopped
// and whether a new control endpoint then owned execution.
func launch(t *testing.T, old *oldAgent, args []string, version string) (stopped, replaced bool, out string, err error) {
	t.Helper()
	control := filepath.Join(config.Dir(), "agent", "control.json")
	before, _ := os.ReadFile(control)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	done := make(chan error, 1)
	var buf syncBuffer
	go func() { done <- Main(ctx, args, version, os.Stdin, &buf, &buf) }()
	exited := false
	for !exited && !replaced && ctx.Err() == nil {
		select {
		case err = <-done:
			exited = true
		case <-time.After(50 * time.Millisecond):
			now, e := os.ReadFile(control)
			replaced = e == nil && string(now) != string(before) && lease.Active(filepath.Dir(control), "execution")
		}
	}
	if !exited {
		// Let the viewer print its first lines before stopping it.
		time.Sleep(300 * time.Millisecond)
		cancel()
		err = <-done
	}
	old.mu.Lock()
	stopped = old.stops > 0
	old.mu.Unlock()
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		err = nil
	}
	return stopped, replaced, buf.String(), err
}

func TestBusyOlderAgentIsKeptWithoutForceUpdate(t *testing.T) {
	launchFixture(t)
	old := startOldAgent(t, "0.6.2-rc.4", true, map[string]any{"managedProcesses": 2, "browserRunnerSessions": 1})
	stopped, replaced, out, err := launch(t, old, nil, "0.6.2-rc.5")
	if stopped || replaced {
		t.Fatal("a busy Agent was replaced without --force-update")
	}
	if err == nil || !strings.Contains(err.Error(), "--force-update") || !strings.Contains(err.Error(), "nothing was changed") {
		t.Fatalf("expected a clear refusal, got %v", err)
	}
	if !strings.Contains(out, "2 managed processes, 1 Browser Runner session") {
		t.Fatalf("active work not explained:\n%s", out)
	}
	if !lease.Active(filepath.Join(config.Dir(), "agent"), "execution") {
		t.Fatal("busy Agent lost execution")
	}
}

func TestLegacyAgentNeedsConfirmationOrForceUpdate(t *testing.T) {
	launchFixture(t)
	// rc.4 and earlier cannot report active work.
	old := startOldAgent(t, "0.6.2-rc.4", true)
	stopped, replaced, out, err := launch(t, old, nil, "0.6.2-rc.5")
	if stopped || replaced || err == nil || !strings.Contains(out, "cannot report whether it has active work") {
		t.Fatalf("legacy Agent replaced without consent: stopped=%v err=%v\n%s", stopped, err, out)
	}
	old.server.Close()
	old.owned.Release()

	old = startOldAgent(t, "0.6.2-rc.4", true)
	stopped, replaced, out, err = launch(t, old, []string{"--force-update"}, "0.6.2-rc.5")
	if err != nil || !stopped || !replaced || !strings.Contains(out, "Continuing because --force-update was given") {
		t.Fatalf("--force-update did not replace the legacy Agent: stopped=%v replaced=%v err=%v\n%s", stopped, replaced, err, out)
	}
}

func TestTerminalConfirmationReplacesBusyAgent(t *testing.T) {
	launchFixture(t)
	var asked string
	confirmReplace = func(_ *os.File, _ io.Writer, question string) bool { asked = question; return true }
	old := startOldAgent(t, "0.6.2-rc.4", true, map[string]any{"managedProcesses": 1, "browserRunnerSessions": 0})
	stopped, replaced, _, err := launch(t, old, nil, "0.6.2-rc.5")
	if err != nil || !stopped || !replaced || !strings.Contains(asked, "v0.6.2-rc.4 with v0.6.2-rc.5") {
		t.Fatalf("confirmed replacement failed: stopped=%v replaced=%v err=%v asked=%q", stopped, replaced, err, asked)
	}
}

func TestForceUpdateReplacesSameOrNewerAgent(t *testing.T) {
	launchFixture(t)
	// Rollback: an explicit --force-update may replace a newer Agent.
	old := startOldAgent(t, "0.6.3", true, idle)
	stopped, replaced, out, err := launch(t, old, []string{"--force-update"}, "0.6.2-rc.5")
	if err != nil || !stopped || !replaced || !strings.Contains(out, "Replacing the running Agent v0.6.3") {
		t.Fatalf("--force-update rollback failed: stopped=%v replaced=%v err=%v\n%s", stopped, replaced, err, out)
	}
}

func TestSameVersionViewerExplainsForceUpdate(t *testing.T) {
	launchFixture(t)
	old := startOldAgent(t, "0.6.2-rc.5", true, idle)
	stopped, _, out, _ := launch(t, old, nil, "0.6.2-rc.5")
	if stopped || !strings.Contains(out, "npx remotelink@0.6.2-rc.5 --force-update") {
		t.Fatalf("viewer did not explain how to replace the Agent: stopped=%v\n%s", stopped, out)
	}
}

func TestForceUpdateOptionCombinations(t *testing.T) {
	if o, e := Parse([]string{"--force-update", "--background"}); e != nil || !o.ForceUpdate || !o.Background {
		t.Fatalf("--force-update --background rejected: %v", e)
	}
	for _, bad := range []string{"--stop", "--reset", "--foreground", "--safe", "--no-background", "--status"} {
		if _, e := Parse([]string{"--force-update", bad}); e == nil {
			t.Fatalf("--force-update %s accepted", bad)
		}
	}
}
