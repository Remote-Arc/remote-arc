package cli

import (
	"context"
	"errors"
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

func startOldAgent(t *testing.T, version string, obey bool) *oldAgent {
	t.Helper()
	dir := filepath.Join(config.Dir(), "agent")
	owned, e := lease.Acquire(dir, "execution")
	if e != nil || owned == nil {
		t.Fatalf("old agent could not own execution: %v", e)
	}
	a := &oldAgent{owned: owned, obey: obey}
	a.server, e = control.Start(dir, version, func() any { return map[string]any{"engine": "go", "version": version} }, func() {
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
	old := startOldAgent(t, "0.6.2-rc.4", true)
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
