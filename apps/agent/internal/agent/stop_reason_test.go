package agent

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/journal"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/stopreason"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

// macOS logout stops every LaunchAgent of the user with SIGTERM. The log must
// say so instead of a bare "Go agent stopped.".
func TestSignalStopIsRecordedAsTheStopReason(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	hello := make(chan struct{}, 1)
	upgrader := websocket.Upgrader{}
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, e := upgrader.Upgrade(w, r, nil)
		if e != nil {
			return
		}
		defer conn.Close()
		var first map[string]any
		if conn.ReadJSON(&first) != nil {
			return
		}
		select {
		case hello <- struct{}{}:
		default:
		}
		for {
			if _, _, e := conn.ReadMessage(); e != nil {
				return
			}
		}
	}))
	defer s.Close()
	cfg := config.Config{DeviceID: "test-device", DeviceToken: "test-token", DeviceName: "fixture", Origin: s.URL, Mode: "managed"}
	if e := config.Save(cfg); e != nil {
		t.Fatal(e)
	}
	logs := filepath.Join(home, "logs")
	a := New(cfg, "test", false, &journal.Journal{Dir: logs})
	a.Background = fakeBackground{}
	ctx, cancel := context.WithCancelCause(context.Background())
	defer cancel(nil)
	done := make(chan error, 1)
	go func() { done <- a.Run(ctx) }()
	select {
	case <-hello:
	case <-time.After(10 * time.Second):
		t.Fatal("Agent did not connect")
	}
	cancel(stopreason.Signal(syscall.SIGTERM))
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("Agent did not stop")
	}
	events, e := os.ReadFile(filepath.Join(logs, "events.log"))
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(string(events), "Go agent stopped: received SIGTERM from the operating system or a service manager (for example logout") {
		t.Fatalf("stop reason missing from the log:\n%s", events)
	}
}
