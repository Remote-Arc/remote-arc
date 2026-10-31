package browserrunner

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

func slowStartupManager(t *testing.T) (*Manager, *atomic.Int32, chan struct{}, error) {
	t.Helper()
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	// No native process is created by this fixture; display/presence are test
	// inputs so headless=false retries exercise the same path on every OS.
	t.Setenv("REMOTEARC_BROWSER_HEADLESS", "")
	t.Setenv("DISPLAY", ":synthetic")
	m := New()
	m.userPresent = func() bool { return true }
	m.launchWait = 10 * time.Millisecond
	m.findBrowser = func() (string, error) { return "synthetic-browser", nil }
	var calls atomic.Int32
	release := make(chan struct{})
	want := errors.New("synthetic startup failure")
	m.launchBrowser = func(ctx context.Context, _ string, _ string, _ bool) (*browserProcess, error) {
		calls.Add(1)
		select {
		case <-release:
			return nil, want
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	t.Cleanup(m.Close)
	return m, &calls, release, want
}

func awaitLaunchCalls(t *testing.T, calls *atomic.Int32, want int32) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for calls.Load() != want && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if calls.Load() != want {
		t.Fatalf("launch workers=%d, want %d", calls.Load(), want)
	}
}

func TestStartupPollsAndActionsDoNotRelaunchOrExecute(t *testing.T) {
	m, calls, release, want := slowStartupManager(t)
	ctx := context.Background()
	args := map[string]any{"task_id": "slow", "allowed_origins": []string{"https://example.test"}, "headless": false}
	for i := 0; i < 2; i++ {
		out, err := m.Call(ctx, "browser_runner_start", args, protocol.Policy{})
		if err != nil || out.(map[string]any)["state"] != "starting" {
			t.Fatalf("start must return pending: %v %v", out, err)
		}
	}
	awaitLaunchCalls(t, calls, 1)
	out, err := m.Call(ctx, "browser_runner_act", map[string]any{"session_id": "slow", "action": "navigate", "url": "https://example.test"}, protocol.Policy{})
	if err != nil || out.(map[string]any)["state"] != "starting" || calls.Load() != 1 || m.ActiveSessions() != 1 {
		t.Fatalf("pending action/launch: out=%v err=%v calls=%d active=%d", out, err, calls.Load(), m.ActiveSessions())
	}
	close(release)
	_, err = m.Call(ctx, "browser_runner_start", args, protocol.Policy{})
	if !errors.Is(err, want) || calls.Load() != 1 {
		t.Fatalf("failure was hidden or launch duplicated: %v %d", err, calls.Load())
	}
}

func TestStartupCallerDeadlineDoesNotCancelSessionLaunch(t *testing.T) {
	m, calls, release, want := slowStartupManager(t)
	launchContexts := make(chan context.Context, 2)
	launch := m.launchBrowser
	m.launchBrowser = func(ctx context.Context, exe, profile string, hidden bool) (*browserProcess, error) {
		launchContexts <- ctx
		return launch(ctx, exe, profile, hidden)
	}
	m.launchWait = time.Second
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	args := map[string]any{"task_id": "caller-deadline", "allowed_origins": []string{"https://example.test"}}
	out, err := m.Call(ctx, "browser_runner_start", args, protocol.Policy{})
	if err != nil || out.(map[string]any)["state"] != "starting" {
		t.Fatalf("caller deadline killed startup: %v %v", out, err)
	}
	select {
	case launchCtx := <-launchContexts:
		if launchCtx.Err() != nil {
			t.Fatal("session launch inherited caller deadline")
		}
	case <-time.After(time.Second):
		t.Fatal("launch worker did not start")
	}
	close(release)
	_, err = m.Call(context.Background(), "browser_runner_start", args, protocol.Policy{})
	if !errors.Is(err, want) || calls.Load() != 1 {
		t.Fatalf("did not rejoin original launch: %v calls=%d", err, calls.Load())
	}
}

func TestStartupCloseCancelsPendingAndReleasesAdmission(t *testing.T) {
	m, calls, _, _ := slowStartupManager(t)
	ctx := context.Background()
	for _, id := range []string{"one", "two", "three", "four"} {
		if _, err := m.Call(ctx, "browser_runner_start", map[string]any{"task_id": id, "allowed_origins": []string{"https://example.test"}}, protocol.Policy{}); err != nil {
			t.Fatal(err)
		}
	}
	awaitLaunchCalls(t, calls, 4)
	_, err := m.Call(ctx, "browser_runner_start", map[string]any{"task_id": "five", "allowed_origins": []string{"https://example.test"}}, protocol.Policy{})
	if err == nil || calls.Load() != 4 {
		t.Fatalf("pending launches bypassed session limit: err=%v calls=%d", err, calls.Load())
	}
	s, _ := m.get("one")
	done := s.pendingLaunch.done
	if _, err = m.Call(ctx, "browser_runner_close", map[string]any{"session_id": "one", "forget": true}, protocol.Policy{}); err != nil {
		t.Fatal(err)
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("close left a startup worker alive")
	}
	m.Close()
	if m.ActiveSessions() != 0 {
		t.Fatal("closed manager retained pending launches")
	}
	_, err = m.Call(ctx, "browser_runner_start", map[string]any{"task_id": "after-close"}, protocol.Policy{})
	if err == nil || !strings.Contains(err.Error(), "stopped") {
		t.Fatal("closed manager restarted", err)
	}
}

func TestStartupPendingReservesItsProfile(t *testing.T) {
	m, calls, _, _ := slowStartupManager(t)
	args := map[string]any{"task_id": "owner", "profile": "shared", "allowed_origins": []string{"https://example.test"}}
	if _, err := m.Call(context.Background(), "browser_runner_start", args, protocol.Policy{}); err != nil {
		t.Fatal(err)
	}
	awaitLaunchCalls(t, calls, 1)
	args["task_id"] = "second-owner"
	if _, err := m.Call(context.Background(), "browser_runner_start", args, protocol.Policy{}); err == nil {
		t.Fatal("two pending tasks acquired the same profile")
	}
	if calls.Load() != 1 {
		t.Fatal("profile conflict launched another browser")
	}
}

func TestStartupConcurrentAdmissionReservesBeforeLaunch(t *testing.T) {
	for _, shared := range []bool{false, true} {
		t.Run(fmt.Sprint("shared=", shared), func(t *testing.T) {
			m, calls, _, _ := slowStartupManager(t)
			barrier := make(chan struct{})
			results := make(chan error, 12)
			for i := 0; i < 12; i++ {
				go func(i int) {
					<-barrier
					args := map[string]any{"task_id": fmt.Sprintf("parallel-%d", i), "allowed_origins": []string{"https://example.test"}}
					if shared {
						args["profile"] = "shared"
					}
					_, err := m.Call(context.Background(), "browser_runner_start", args, protocol.Policy{})
					results <- err
				}(i)
			}
			close(barrier)
			accepted := 0
			for i := 0; i < 12; i++ {
				if err := <-results; err == nil {
					accepted++
				}
			}
			want := 4
			if shared {
				want = 1
			}
			if accepted != want {
				t.Fatalf("accepted %d simultaneous starts, want %d", accepted, want)
			}
			awaitLaunchCalls(t, calls, int32(want))
		})
	}
}

func TestStartupShutdownInterruptsAnAwaitingCall(t *testing.T) {
	m, calls, _, _ := slowStartupManager(t)
	m.launchWait = 8 * time.Second
	result := make(chan error, 1)
	go func() {
		_, err := m.Call(context.Background(), "browser_runner_start", map[string]any{"task_id": "shutdown", "allowed_origins": []string{"https://example.test"}}, protocol.Policy{})
		result <- err
	}()
	awaitLaunchCalls(t, calls, 1)
	m.Close()
	select {
	case err := <-result:
		if err == nil || !strings.Contains(err.Error(), "stopped") {
			t.Fatal("shutdown did not stop waiting call", err)
		}
	case <-time.After(time.Second):
		t.Fatal("shutdown was blocked by the startup response wait")
	}
}

func TestE2EStartupRejoinsOneDelayedBrowser(t *testing.T) {
	h, _, base, _ := newHarness(t)
	var calls atomic.Int32
	release := make(chan struct{})
	h.m.launchWait = 20 * time.Millisecond
	h.m.launchBrowser = func(ctx context.Context, exe, profile string, hidden bool) (*browserProcess, error) {
		calls.Add(1)
		select {
		case <-release:
			return launchBrowser(ctx, exe, profile, hidden)
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	args := map[string]any{"task_id": "cold-once", "allowed_origins": []string{base}, "start_url": base + "/apply/1"}
	out, err := h.m.Call(h.ctx, "browser_runner_start", args, h.policy)
	if err != nil || out.(map[string]any)["state"] != "starting" {
		t.Fatal("missing pending response", out, err)
	}
	close(release)
	ready := h.call("browser_runner_start", args)
	if ready["session_id"] != "cold-once" || calls.Load() != 1 {
		t.Fatal("cold start relaunched", ready, calls.Load())
	}
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "cold-once"})
	if !strings.HasSuffix(snap["url"].(string), "/apply/1") {
		t.Fatal("original start_url was not reached", snap["url"])
	}
}
