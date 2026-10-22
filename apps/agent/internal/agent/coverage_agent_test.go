package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/service"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestErrorClassifierDoesNotExposeRequestArguments(t *testing.T) {
	cases := []struct{ errorText, want string }{
		{"Blocked by Remote Arc Safety Guard: unsafe command", "blocked by command safety guard"},
		{"Blocked by Remote Arc Sensitive Path Policy", "blocked by device policy"},
		{"Tool blocked by local permission mode", "blocked by device policy"},
		{"FILE_CHANGED_DURING_READ: secret", "concurrent change detected"},
		{"File changed again", "concurrent change detected"},
		{"checkpoint changed concurrently", "concurrent change detected"},
		{"private argument /home/samyao/.secret", "operation failed; see tool response"},
	}
	for _, tt := range cases {
		if got := failureClass(errors.New(tt.errorText)); got != tt.want {
			t.Fatalf("classification of %q = %q", tt.errorText, got)
		}
	}
	if got := failureClass(context.Canceled); got != "cancelled" {
		t.Fatal(got)
	}
	if got := failureClass(context.DeadlineExceeded); got != "deadline exceeded" {
		t.Fatal(got)
	}
	if got := CleanMessage("secret\n\ra\tb\u0000"); got != "secreta\tb" {
		t.Fatalf("control characters leaked: %q", got)
	}
}
func TestAgentStatusReportsOwnRuntimeWithoutSecrets(t *testing.T) {
	cfg := config.Config{DeviceID: "fixture-id", DeviceToken: "never-log-this", Mode: "managed", Origin: "https://mcp.remotearc.app"}
	a := New(cfg, "test", false, nil)
	defer a.Core.Close()
	a.mu.Lock()
	a.connected = true
	a.connectedAt = "2026-10-16T01:00:00Z"
	a.connectionSequence = 5
	a.mu.Unlock()
	status := a.Status()
	encoded, _ := json.Marshal(status)
	if status["engine"] != "go" || status["deviceId"] != "fixture-id" || status["connected"] != true || status["connectionSequence"] != uint64(5) || strings.Contains(string(encoded), "never-log-this") {
		t.Fatalf("invalid status: %s", encoded)
	}
	if work, ok := status["activeWork"].(map[string]any); !ok || work["managedProcesses"] != 0 || work["browser_runner_sessions"] != 0 || work["browserRunnerSessions"] != work["browser_runner_sessions"] {
		t.Fatalf("idle Agent must report zero active work for upgrades: %v", status["activeWork"])
	}
	pause := NewWake(cfg, "test", nil)
	status = pause.Status()
	if status["executionPaused"] != true || pause.Core != nil {
		t.Fatalf("wake mode exposed execution core: %v", status)
	}
}

type backgroundForHeartbeat struct{ active bool }

func (b backgroundForHeartbeat) Status(context.Context) service.Status {
	return service.Status{Supported: true, Service: "integration", Enabled: b.active, Active: b.active}
}
func (b backgroundForHeartbeat) Enable(ctx context.Context) (service.Status, error) {
	return b.Status(ctx), nil
}
func (b backgroundForHeartbeat) Disable(context.Context) error { return nil }
func TestHeartbeatPostsOnlyApprovedStatusToAuthenticatedEndpoint(t *testing.T) {
	var hit atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hit.Add(1)
		if r.URL.Path != "/api/device/heartbeat" || r.Method != "POST" || r.Header.Get("Authorization") != "Bearer fixture-token" {
			t.Errorf("wrong heartbeat transport: %s %s %s", r.Method, r.URL, r.Header.Get("Authorization"))
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body["background_enabled"] != true || body["background_service"] != "integration" || body["background_process"] != true {
			t.Errorf("invalid heartbeat: %v", body)
		}
		w.WriteHeader(204)
	}))
	defer server.Close()
	yes := true
	cfg := config.Config{DeviceID: "fixture", DeviceToken: "fixture-token", Origin: server.URL, Mode: "managed", BackgroundEnabled: &yes}
	a := New(cfg, "test", true, nil)
	defer a.Core.Close()
	a.Background = backgroundForHeartbeat{active: true}
	if err := a.heartbeat(context.Background()); err != nil {
		t.Fatal(err)
	}
	if hit.Load() != 1 {
		t.Fatalf("expected exactly one heartbeat, got %d", hit.Load())
	}
}
func TestApprovalPollingStopsWhenCancelled(t *testing.T) {
	var count atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/device/approvals/pending" {
			count.Add(1)
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte("[]"))
			return
		}
		w.WriteHeader(404)
	}))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	client := NewClient()
	cfg := config.Config{Origin: server.URL, DeviceToken: "test"}
	var output bytes.Buffer
	done := make(chan struct{})
	go func() {
		defer close(done)
		client.PollApprovals(ctx, cfg, &output, func(context.Context, string) (string, error) { return "", errors.New("should not ask") })
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("polling ignored cancellation")
	}
	if count.Load() != 1 {
		t.Fatalf("expected one poll before cancellation, got %d", count.Load())
	}
	if output.Len() != 0 {
		t.Fatalf("unexpected approval message: %q", output.String())
	}
}
func TestNewClientAndVersionInformation(t *testing.T) {
	c := NewClient()
	if c == nil || c.HTTP == nil {
		t.Fatal("HTTP client unavailable")
	}
	// Read-only environment observation; must not write outside the fixture.
	if _, err := os.Hostname(); err != nil {
		t.Skipf("hostname unavailable: %v", err)
	}
}
