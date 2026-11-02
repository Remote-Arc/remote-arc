package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/power"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// A command can remain buffered while macOS suspends the process. Its Relay
// caller has already timed out when the Mac next reads from the socket.
func TestExpiredRelayCallNeverExecutesBufferedWrite(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	target := filepath.Join(home, "must-not-be-written.txt")
	answer := make(chan map[string]any, 1)
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
		conn.WriteJSON(map[string]any{"type": "call", "id": "expired-write", "tool": "write_file", "expires_at": time.Now().Add(-time.Minute).UTC().Format(time.RFC3339Nano), "arguments": map[string]any{"path": target, "content": "private-buffered-value"}})
		var reply map[string]any
		if conn.ReadJSON(&reply) == nil {
			answer <- reply
		}
		for {
			if _, _, err = conn.ReadMessage(); err != nil {
				return
			}
		}
	}))
	defer server.Close()
	cfg := config.Config{DeviceID: "wake-fixture", DeviceToken: "private-token", Origin: server.URL, Mode: "managed"}
	if err := config.Save(cfg); err != nil {
		t.Fatal(err)
	}
	a := New(cfg, "test", false, nil)
	a.Background = fakeBackground{}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- a.Run(ctx) }()
	select {
	case reply := <-answer:
		if reply["error"] == nil || !strings.Contains(fmt.Sprint(reply["error"]), "DEVICE_CALL_EXPIRED") {
			t.Errorf("expired dispatch was not refused: %v", reply)
		}
	case <-ctx.Done():
		t.Fatal("no expired-call result")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("agent did not stop")
	}
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatal("expired request wrote a file")
	}
}

func TestRelayExpiryBoundaryAndLegacyCompatibility(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	cfg := config.Config{DeviceID: "fixture", DeviceToken: "private-token", Origin: "https://example.invalid", Mode: "managed"}
	if err := config.Save(cfg); err != nil {
		t.Fatal(err)
	}
	a := New(cfg, "test", false, nil)
	defer a.Core.Close()
	defer a.Browser.Close()
	a.Background = fakeBackground{}
	now := time.Now()
	a.wallClock = func() time.Time { return now }
	awake := power.New()
	defer awake.Close()
	for _, deadline := range []string{now.Format(time.RFC3339Nano), now.Add(-time.Millisecond).Format(time.RFC3339Nano), "invalid"} {
		target := filepath.Join(home, "must-not-exist")
		_, err := a.dispatch(context.Background(), protocol.Call{Tool: "write_file", ExpiresAt: deadline, Arguments: map[string]any{"path": target, "content": "private"}}, awake)
		if err == nil || !strings.Contains(err.Error(), "DEVICE_CALL_EXPIRED") {
			t.Fatalf("invalid deadline accepted: %v", err)
		}
		if _, err := os.Stat(target); !os.IsNotExist(err) {
			t.Fatal("expired command ran")
		}
	}
	for i, deadline := range []string{"", now.Add(time.Millisecond).Format(time.RFC3339Nano)} {
		target := filepath.Join(home, fmt.Sprintf("valid-%d", i))
		_, err := a.dispatch(context.Background(), protocol.Call{Tool: "write_file", ExpiresAt: deadline, Arguments: map[string]any{"path": target, "content": "accepted"}}, awake)
		if err != nil {
			t.Fatal("legacy/fresh deadline refused", err)
		}
		if b, _ := os.ReadFile(target); string(b) != "accepted" {
			t.Fatal("valid operation did not execute")
		}
	}
}

func TestWakeGapReconnectsBeforeQueuedCallAndKeepsPairing(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	var clockJump atomic.Int64
	var a *Agent
	connections := atomic.Int32{}
	result := make(chan error, 1)
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
		conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		var hello map[string]any
		if conn.ReadJSON(&hello) != nil {
			return
		}
		n := connections.Add(1)
		if n == 1 {
			clockJump.Store(int64(10 * time.Minute))
			conn.WriteJSON(map[string]any{"type": "call", "id": "from-before-suspend", "tool": "background_agent_status"})
			var reply map[string]any
			if err := conn.ReadJSON(&reply); err == nil {
				result <- fmt.Errorf("old connection executed a queued call: %v", reply)
			}
			return
		}
		device := hello["device"].(map[string]any)
		if device["id"] != "wake-fixture" || device["connectionSequence"] != float64(2) {
			result <- fmt.Errorf("reconnect changed pairing or sequence: %v", device)
			return
		}
		conn.WriteJSON(map[string]any{"type": "call", "id": "after-wake", "tool": "background_agent_status"})
		var reply map[string]any
		if err = conn.ReadJSON(&reply); err != nil {
			result <- err
			return
		}
		if reply["id"] != "after-wake" || reply["error"] != nil {
			result <- fmt.Errorf("new connection unavailable: %v", reply)
			return
		}
		result <- nil
		for {
			if _, _, err = conn.ReadMessage(); err != nil {
				return
			}
		}
	}))
	defer server.Close()
	cfg := config.Config{DeviceID: "wake-fixture", DeviceToken: "private-token", Origin: server.URL, Mode: "safe"}
	if err := config.Save(cfg); err != nil {
		t.Fatal(err)
	}
	a = New(cfg, "test", false, nil)
	a.Background = fakeBackground{}
	a.wallClock = func() time.Time { return time.Now().Add(time.Duration(clockJump.Load())) }
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- a.Run(ctx) }()
	select {
	case err := <-result:
		if err != nil {
			t.Fatal(err)
		}
	case <-ctx.Done():
		t.Fatal("wake reconnect timed out")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("agent did not stop")
	}
	saved, _ := config.Load()
	encoded, _ := json.Marshal(a.Status())
	if saved.DeviceToken != "private-token" || strings.Contains(string(encoded), "private-token") {
		t.Fatal("pairing changed or exposed")
	}
}
