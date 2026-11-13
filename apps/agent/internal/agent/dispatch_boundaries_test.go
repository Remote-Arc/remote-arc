package agent

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
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
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/power"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/service"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

func TestDispatchValidationAndFailedSaveCannotChangeRuntime(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	on := true
	cfg := config.Config{DeviceID: "fixture", DeviceToken: "private-token", Mode: "safe", Origin: "https://example.test", BackgroundEnabled: &on}
	if err := config.Save(cfg); err != nil {
		t.Fatal(err)
	}
	a := New(cfg, "test", false, nil)
	defer a.Core.Close()
	defer a.Browser.Close()
	a.Background = activeBackground{}
	awake := power.New()
	defer awake.Close()
	for _, call := range []protocol.Call{
		{Tool: "set_device_runtime", Arguments: map[string]any{"paused": "yes"}},
		{Tool: "set_device_runtime", Arguments: map[string]any{"paused": true}},
		{Tool: "set_background_agent", Arguments: map[string]any{"enabled": "yes"}},
		{Tool: "agent_execution_log"},
		{Tool: "set_task_keep_awake", Arguments: map[string]any{"task_id": ""}},
		{Tool: "set_task_keep_awake", Arguments: map[string]any{"task_id": "fixture", "seconds": 181}},
		{Tool: "goal_workspace"},
	} {
		if _, err := a.dispatch(context.Background(), call, awake); err == nil {
			t.Fatalf("invalid or unavailable operation accepted: %+v", call)
		}
	}
	a.Stop = func() { t.Error("failed save triggered handoff") }
	a.Save = func(config.Config) error { return errors.New("fixture disk full") }
	for _, call := range []protocol.Call{{Tool: "set_device_runtime", Arguments: map[string]any{"paused": true}}, {Tool: "set_background_agent", Arguments: map[string]any{"enabled": false}}} {
		if _, err := a.dispatch(context.Background(), call, awake); err == nil {
			t.Fatal("failed save accepted")
		}
	}
	if a.cfg().ExecutionPaused || !*a.cfg().BackgroundEnabled {
		t.Fatal("failed save changed in-memory authorization")
	}
	a.Save = config.Save
	status, err := a.dispatch(context.Background(), protocol.Call{Tool: "background_agent_status"}, awake)
	if err != nil || status.(map[string]any)["active"] != true {
		t.Fatal(status, err)
	}
	if _, err = a.dispatch(context.Background(), protocol.Call{Tool: "set_task_keep_awake", Arguments: map[string]any{"task_id": "fixture", "seconds": 0}}, awake); err != nil {
		t.Fatal(err)
	}
	a.Journal = &journal.Journal{Dir: filepath.Join(config.Dir(), "logs"), Output: io.Discard}
	a.Journal.Log("info", "fixture event")
	if _, err = a.dispatch(context.Background(), protocol.Call{Tool: "agent_execution_log"}, awake); err != nil {
		t.Fatal(err)
	}
	if _, err = a.dispatch(context.Background(), protocol.Call{Tool: AgentSessionsTool, Arguments: map[string]any{"source": "invalid"}}, awake); err == nil {
		t.Fatal("invalid session source accepted")
	}
	a.Load = func() (config.Config, error) { return config.Config{}, os.ErrNotExist }
	if _, err = a.dispatch(context.Background(), protocol.Call{Tool: "background_agent_status"}, awake); !errors.Is(err, ErrRevoked) {
		t.Fatal("revoked identity could dispatch", err)
	}
	if err = a.Run(context.Background()); !errors.Is(err, ErrRevoked) {
		t.Fatal("revoked identity attempted reconnect", err)
	}
}

type blockedBackground struct {
	calls   atomic.Int32
	release chan struct{}
}

func (b *blockedBackground) Status(context.Context) service.Status {
	return service.Status{Supported: true, Enabled: true, Active: true}
}
func (b *blockedBackground) Enable(ctx context.Context) (service.Status, error) {
	b.calls.Add(1)
	select {
	case <-b.release:
	case <-ctx.Done():
	}
	return b.Status(ctx), errors.New("fixture provider refused private payload")
}
func (b *blockedBackground) Disable(context.Context) error { return nil }

func TestRelayControlMessagesAndConcurrencyLimitDoNotBypassDispatch(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	result := make(chan error, 1)
	release := make(chan struct{})
	defer close(release)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/agent" {
			w.WriteHeader(204)
			return
		}
		if r.Header.Get("Authorization") != "Bearer fixture-token" {
			http.Error(w, "unauthorized", 401)
			return
		}
		conn, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		check := func() error {
			var hello map[string]any
			if err := conn.ReadJSON(&hello); err != nil {
				return err
			}
			for _, message := range []any{
				map[string]any{"type": "runner_attention_ack", "event_id": "missing", "kind": "otp"},
				map[string]any{"type": "runner_view", "session_id": "missing", "action": "watch", "jpeg": false},
				map[string]any{"type": "runner_view", "session_id": "missing", "action": "stop"},
				map[string]any{"type": "runner_video", "session_id": "missing", "stream_id": "stream", "action": "stop"},
				map[string]any{"type": "call", "id": strings.Repeat("x", 257), "tool": "unknown"},
				map[string]any{"type": "call", "id": "missing-tool"},
				map[string]any{"type": "call", "id": "invalid", "tool": "unknown", "arguments": map[string]any{"secret": "private payload"}},
			} {
				if err := conn.WriteJSON(message); err != nil {
					return err
				}
			}
			var answer map[string]any
			if err := conn.ReadJSON(&answer); err != nil {
				return err
			}
			if answer["id"] != "invalid" || answer["error"] == nil {
				return fmt.Errorf("malformed messages dispatched or invalid tool accepted: %v", answer)
			}
			for i := 0; i < 33; i++ {
				if err := conn.WriteJSON(map[string]any{"type": "call", "id": fmt.Sprint(i), "tool": "set_background_agent", "arguments": map[string]any{"enabled": true}}); err != nil {
					return err
				}
			}
			if err := conn.ReadJSON(&answer); err != nil {
				return err
			}
			if answer["id"] != "32" || answer["error"] != "Too many concurrent device calls." {
				return fmt.Errorf("concurrency gate failed: %v", answer)
			}
			return nil
		}
		result <- check()
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}))
	defer server.Close()
	cfg := config.Config{DeviceID: "fixture", DeviceToken: "fixture-token", Origin: server.URL, Mode: "managed"}
	if err := config.Save(cfg); err != nil {
		t.Fatal(err)
	}
	log := &journal.Journal{Dir: filepath.Join(config.Dir(), "logs"), Output: io.Discard}
	a := New(cfg, "test", false, log)
	background := &blockedBackground{release: release}
	a.Background = background
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- a.Run(ctx) }()
	select {
	case err := <-result:
		if err != nil {
			t.Error(err)
		}
	case <-ctx.Done():
		t.Error("relay fixture timed out", ctx.Err())
	}
	cancel()
	select {
	case <-done:
	case <-time.After(15 * time.Second):
		t.Fatal("disconnect did not drain workers")
	}
	if background.calls.Load() != 32 {
		t.Fatalf("accepted calls were lost or rejected call executed: %d", background.calls.Load())
	}
	data, err := os.ReadFile(filepath.Join(log.Dir, "events.log"))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(data, []byte("fixture-token")) || bytes.Contains(data, []byte("private payload")) {
		t.Fatal("credential/argument/provider detail leaked to audit log")
	}
}

func TestHTTPClientFailuresAreBoundedAndDoNotEchoResponseSecrets(t *testing.T) {
	c := NewClient()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(503)
		_, _ = w.Write([]byte("private upstream secret"))
	}))
	defer server.Close()
	for _, request := range []struct {
		origin, method string
		body           any
	}{{server.URL, "GET", make(chan int)}, {server.URL, "bad\nmethod", nil}, {"file:///private", "GET", nil}, {server.URL, "GET", nil}} {
		_, err := c.Request(context.Background(), request.origin, "fixture-token", request.method, "/", request.body, nil)
		if err == nil || strings.Contains(err.Error(), "private upstream secret") {
			t.Fatalf("unsafe client failure: %v", err)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := c.Request(ctx, server.URL, "fixture-token", "GET", "/", nil, nil); err == nil {
		t.Fatal("cancelled request succeeded")
	}
	var output map[string]any
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("not JSON")) }))
	defer bad.Close()
	if _, err := c.Request(context.Background(), bad.URL, "", "GET", "/", nil, &output); err == nil {
		t.Fatal("malformed JSON accepted")
	}
}

func TestSuccessfulControlRefreshesHelloAndRevokedHeartbeatStopsConnection(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("REMOTEARC_BROWSER_PATH", exe)
	t.Setenv("REMOTEARC_RUNNER_VIDEO", "1")
	var hellos atomic.Int32
	refreshed := make(chan struct{})
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/agent" {
			// Revoke only after the capability refresh was actually received.
			select {
			case <-refreshed:
			case <-ctx.Done():
			}
			w.WriteHeader(403)
			return
		}
		conn, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		var message map[string]any
		if conn.ReadJSON(&message) != nil {
			return
		}
		hellos.Add(1)
		if conn.WriteJSON(map[string]any{"type": "call", "id": "enable", "tool": "set_background_agent", "arguments": map[string]any{"enabled": true}}) != nil {
			return
		}
		for {
			if conn.ReadJSON(&message) != nil {
				return
			}
			if message["type"] == "hello" {
				if hellos.Add(1) == 2 {
					close(refreshed)
				}
			}
		}
	}))
	defer server.Close()
	cfg := config.Config{DeviceID: "fixture", DeviceToken: "private", Origin: server.URL, Mode: "managed"}
	if err := config.Save(cfg); err != nil {
		t.Fatal(err)
	}
	a := New(cfg, "test", false, nil)
	a.Background = activeBackground{}
	if err := a.Run(ctx); !errors.Is(err, ErrRevoked) {
		t.Fatalf("revoked heartbeat did not terminate authenticated socket: %v", err)
	}
	if hellos.Load() != 2 {
		t.Fatalf("control change did not refresh capabilities: %d hellos", hellos.Load())
	}
	if saved, err := config.Load(); err != nil || saved.DeviceToken != "private" {
		t.Fatal("Agent lost pairing before CLI could reconcile it", err)
	}
}
