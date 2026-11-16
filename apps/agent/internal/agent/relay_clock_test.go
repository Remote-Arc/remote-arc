package agent

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

// A Windows computer whose clock is hours fast (a wrong time zone with
// automatic time turned off) refused every call as DEVICE_CALL_EXPIRED,
// because the Relay's deadline was read against the local clock. With the
// Relay's clock message, deadlines are read against the Relay's time: a fresh
// call runs, and a call past its deadline in Relay time is still refused.
func TestRelayClockOverridesASkewedComputerClock(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	fresh := filepath.Join(home, "fresh.txt")
	stale := filepath.Join(home, "stale.txt")
	replies := make(chan map[string]any, 2)
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
		relayNow := time.Now()
		conn.WriteJSON(map[string]any{"type": "clock", "now": relayNow.UnixMilli()})
		deadline := func(d time.Duration) string { return relayNow.Add(d).UTC().Format(time.RFC3339Nano) }
		conn.WriteJSON(map[string]any{"type": "call", "id": "fresh", "tool": "write_file", "expires_at": deadline(45 * time.Second), "arguments": map[string]any{"path": fresh, "content": "ran"}})
		conn.WriteJSON(map[string]any{"type": "call", "id": "stale", "tool": "write_file", "expires_at": deadline(-time.Second), "arguments": map[string]any{"path": stale, "content": "late"}})
		for {
			var reply map[string]any
			if conn.ReadJSON(&reply) != nil {
				return
			}
			if reply["type"] == "result" {
				replies <- reply
			}
		}
	}))
	defer server.Close()
	cfg := config.Config{DeviceID: "skewed", DeviceToken: "private-token", Origin: server.URL, Mode: "managed"}
	if err := config.Save(cfg); err != nil {
		t.Fatal(err)
	}
	a := New(cfg, "test", false, nil)
	a.Background = fakeBackground{}
	a.wallClock = func() time.Time { return time.Now().Add(2 * time.Hour) }
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- a.Run(ctx) }()
	got := map[string]map[string]any{}
	for len(got) < 2 {
		select {
		case reply := <-replies:
			got[fmt.Sprint(reply["id"])] = reply
		case <-ctx.Done():
			t.Fatalf("missing results: %v", got)
		}
	}
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("agent did not stop")
	}
	if err := got["fresh"]["error"]; err != nil {
		t.Fatalf("a fresh call was refused on a skewed clock: %v", err)
	}
	if b, _ := os.ReadFile(fresh); string(b) != "ran" {
		t.Fatal("the fresh call did not run")
	}
	if !strings.Contains(fmt.Sprint(got["stale"]["error"]), "DEVICE_CALL_EXPIRED") {
		t.Fatalf("a call past its Relay deadline was not refused: %v", got["stale"])
	}
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Fatal("the expired call wrote a file")
	}
}

func TestLocalDeadlineKeepsLegacyAndInvalidValues(t *testing.T) {
	if got := localDeadline("", 5000); got != "" {
		t.Fatalf("no deadline became %q", got)
	}
	if got := localDeadline("invalid", 5000); got != "invalid" {
		t.Fatalf("an invalid deadline must stay invalid so dispatch refuses it, got %q", got)
	}
	if got := localDeadline("2026-11-16T10:00:00Z", 7_200_000); got != "2026-11-16T12:00:00Z" {
		t.Fatalf("a two-hour offset moved the deadline to %q", got)
	}
}
