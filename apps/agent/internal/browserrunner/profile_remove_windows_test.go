//go:build windows

package browserrunner

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

func lockedForgetFixture(t *testing.T) (*Manager, *session, *os.File) {
	t.Helper()
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	m := New()
	t.Cleanup(m.Close)
	s := &session{m: m, cp: &Checkpoint{Version: checkpointVersion, SessionID: "locked-profile", Profile: "locked-profile", State: StateActive, AllowedOrigins: []string{"https://example.com"}}}
	m.sessions[s.cp.SessionID] = s
	if err := s.flush(); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(profilePath(s.cp.Profile), 0700); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(profilePath(s.cp.Profile), "held-by-browser")
	locked, err := os.OpenFile(file, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = locked.Close() })
	if err := os.Remove(file); err == nil {
		t.Fatal("fixture did not hold a Windows deletion lock")
	}
	return m, s, locked
}

func TestForgetProfileWaitsForWindowsHandleRelease(t *testing.T) {
	m, s, locked := lockedForgetFixture(t)
	released := make(chan struct{})
	go func() {
		time.Sleep(150 * time.Millisecond)
		_ = locked.Close()
		close(released)
	}()
	defer func() { <-released }()
	out, err := m.Call(context.Background(), "browser_runner_close", map[string]any{"session_id": s.cp.SessionID, "forget": true}, protocol.Policy{})
	if err != nil {
		t.Fatal(err)
	}
	if result := out.(map[string]any); result["forgotten"] != true || result["profile_removed"] != true {
		t.Fatalf("forget result: %v", result)
	}
	for _, path := range []string{profilePath(s.cp.Profile), checkpointPath(s.cp.SessionID)} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("forget returned before removal: %s: %v", path, err)
		}
	}
}

func TestForgetProfileFailureKeepsSessionForRetry(t *testing.T) {
	m, s, locked := lockedForgetFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	args := map[string]any{"session_id": s.cp.SessionID, "forget": true}
	out, err := m.Call(ctx, "browser_runner_close", args, protocol.Policy{})
	if out != nil || !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("locked profile reported success: out=%v err=%v", out, err)
	}
	if m.sessions[s.cp.SessionID] != s || s.cp.State != StateClosed {
		t.Fatal("failed forget discarded its owning closed session")
	}
	if _, err := os.Stat(checkpointPath(s.cp.SessionID)); err != nil {
		t.Fatalf("failed forget discarded its checkpoint: %v", err)
	}
	if err := locked.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Call(context.Background(), "browser_runner_close", args, protocol.Policy{}); err != nil {
		t.Fatalf("cannot retry forget after handle release: %v", err)
	}
	if m.sessions[s.cp.SessionID] != nil {
		t.Fatal("successful forget kept the session")
	}
	for _, path := range []string{profilePath(s.cp.Profile), checkpointPath(s.cp.SessionID)} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("retry did not remove %s: %v", path, err)
		}
	}
}
