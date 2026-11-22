package agent

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
)

// Jump wall time after the hello frame has reached the socket, before its
// Write returns to the Agent. This forces the suspension window independent
// of how quickly the peer or the client's goroutines are scheduled.
type wakeJumpConn struct {
	net.Conn
	armed atomic.Bool
	jump  func()
}

func (c *wakeJumpConn) Write(data []byte) (int, error) {
	n, err := c.Conn.Write(data)
	if err == nil && c.armed.CompareAndSwap(true, false) {
		c.jump()
	}
	return n, err
}

func TestWakeGapDuringHelloRejectsQueuedCall(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	var jump atomic.Int64
	replies := make(chan map[string]any, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
		conn.WriteJSON(map[string]any{"type": "call", "id": "before-suspension", "tool": "background_agent_status"})
		var reply map[string]any
		if conn.ReadJSON(&reply) == nil {
			replies <- reply
		} else {
			replies <- nil
		}
	}))
	defer server.Close()
	cfg := config.Config{DeviceID: "hello-gap-fixture", DeviceToken: "private-fixture-token", Origin: server.URL, Mode: "safe"}
	if err := config.Save(cfg); err != nil {
		t.Fatal(err)
	}
	a := NewWake(cfg, "test", nil)
	a.Background = fakeBackground{}
	a.wallClock = func() time.Time { return time.Now().Add(time.Duration(jump.Load())) }
	var transport *wakeJumpConn
	dialer := websocket.Dialer{NetDialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		conn, err := (&net.Dialer{}).DialContext(ctx, network, address)
		if err != nil {
			return nil, err
		}
		transport = &wakeJumpConn{Conn: conn, jump: func() { jump.Store(int64(10 * time.Minute)) }}
		return transport, nil
	}}
	conn, _, err := dialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	// The HTTP upgrade is complete; only the next WebSocket hello triggers it.
	transport.armed.Store(true)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	err = a.session(ctx, conn)
	select {
	case reply := <-replies:
		if reply != nil {
			t.Fatalf("old connection executed a call after suspension during hello: %v", reply)
		}
	case <-ctx.Done():
		t.Fatal("old transport did not close")
	}
	if !errors.Is(err, errConnectionSignalGap) {
		t.Fatalf("hello suspension was not detected: %v", err)
	}
	saved, _ := config.Load()
	if saved.DeviceToken != cfg.DeviceToken {
		t.Fatal("wake recovery changed pairing")
	}
}
