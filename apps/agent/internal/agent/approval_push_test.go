package agent

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/journal"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

func pendingApprovalServer(t *testing.T, polls *atomic.Int32) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/device/approvals/pending" {
			w.WriteHeader(404)
			return
		}
		polls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("[]"))
	}))
	t.Cleanup(server.Close)
	return server
}

func waitForPolls(t *testing.T, polls *atomic.Int32, want int32) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for polls.Load() < want && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if got := polls.Load(); got != want {
		t.Fatalf("expected %d approval checks, got %d", want, got)
	}
}

// An open terminal checks once, then only when the Relay signals a waiting
// approval. It must not keep requesting an empty list.
func TestApprovalChecksFollowSignalsNotATimer(t *testing.T) {
	var polls atomic.Int32
	server := pendingApprovalServer(t, &polls)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	signals := make(chan struct{}, 1)
	done := make(chan struct{})
	go func() {
		defer close(done)
		NewClient().PollApprovals(ctx, config.Config{Origin: server.URL, DeviceToken: "test"}, &bytes.Buffer{}, func(context.Context, string) (string, error) { return "", errors.New("should not ask") }, signals)
	}()
	waitForPolls(t, &polls, 1)
	time.Sleep(200 * time.Millisecond)
	if got := polls.Load(); got != 1 {
		t.Fatalf("checked %d times without a signal; the old loop polled every few seconds", got)
	}
	signals <- struct{}{}
	waitForPolls(t, &polls, 2)
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("approval checks ignored cancellation")
	}
}

// A signal can be lost while the connection is down, so a slow fallback check
// still runs without one.
func TestApprovalFallbackCheckRunsWithoutSignal(t *testing.T) {
	previous := approvalFallback
	approvalFallback = 50 * time.Millisecond
	t.Cleanup(func() { approvalFallback = previous })
	var polls atomic.Int32
	server := pendingApprovalServer(t, &polls)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	// Cleanups run last-in first-out: stop the loop before the interval is restored.
	t.Cleanup(func() { cancel(); <-done })
	go func() {
		defer close(done)
		NewClient().PollApprovals(ctx, config.Config{Origin: server.URL, DeviceToken: "test"}, &bytes.Buffer{}, func(context.Context, string) (string, error) { return "", errors.New("should not ask") }, nil)
	}()
	deadline := time.Now().Add(2 * time.Second)
	for polls.Load() < 3 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if got := polls.Load(); got < 3 {
		t.Fatalf("fallback checks did not run: %d", got)
	}
}

// The Relay's approval signal reaches the terminal hook and the operation log
// that a viewer terminal follows. It never dispatches anything.
func TestRelayApprovalSignalNotifiesTerminalAndLog(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/agent" {
			w.WriteHeader(204)
			return
		}
		conn, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		var hello map[string]any
		if conn.ReadJSON(&hello) != nil {
			return
		}
		conn.WriteJSON(map[string]any{"type": "approval_pending"})
		for {
			if _, _, err = conn.ReadMessage(); err != nil {
				return
			}
		}
	}))
	defer server.Close()
	cfg := config.Config{DeviceID: "approval-fixture", DeviceToken: "private-token", Origin: server.URL, Mode: "managed"}
	if err := config.Save(cfg); err != nil {
		t.Fatal(err)
	}
	logDir := filepath.Join(home, "logs")
	a := New(cfg, "test", false, &journal.Journal{Dir: logDir})
	a.Background = fakeBackground{}
	signalled := make(chan struct{}, 1)
	a.ApprovalPending = func() { signalled <- struct{}{} }
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- a.Run(ctx) }()
	select {
	case <-signalled:
	case <-ctx.Done():
		t.Fatal("approval signal did not reach the terminal hook")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("agent did not stop")
	}
	logged, err := os.ReadFile(filepath.Join(logDir, "events.log"))
	if err != nil || !strings.Contains(string(logged), ApprovalPendingLog) {
		t.Fatalf("operation log is missing the approval line: %v %q", err, logged)
	}
}
