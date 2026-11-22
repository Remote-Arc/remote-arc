package browserrunner

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func chromeEndpointForTest(t *testing.T, handler http.HandlerFunc) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	dir := t.TempDir()
	t.Setenv("REMOTEARC_YOUR_CHROME_DIR", dir)
	port := srv.Listener.Addr().(*net.TCPAddr).Port
	if e := os.WriteFile(filepath.Join(dir, "DevToolsActivePort"), []byte(fmt.Sprintf("%d\n/devtools/browser/test\n", port)), 0600); e != nil {
		t.Fatal(e)
	}
}

func TestYourChromeAllowWaitReusesPendingConnection(t *testing.T) {
	allow := make(chan struct{})
	chromeEndpointForTest(t, func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-allow:
		case <-r.Context().Done():
			return
		}
		ws, e := (&websocket.Upgrader{}).Upgrade(w, r, nil)
		if e != nil {
			return
		}
		defer ws.Close()
		for {
			if _, _, e := ws.ReadMessage(); e != nil {
				return
			}
		}
	})
	old := yourChromeCallWait
	yourChromeCallWait = 30 * time.Millisecond
	t.Cleanup(func() { yourChromeCallWait = old })
	m := New()
	t.Cleanup(m.Close)
	u := m.yourChrome()
	for range 2 {
		if _, e := u.connect(context.Background()); !errors.Is(e, errYourChromeWaiting) {
			t.Fatalf("expected pending Allow, got %v", e)
		}
	}
	close(allow)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	// The same upgrade finishes when Allow arrives; retry never redials.
	u.mu.Lock()
	done := u.dialing
	u.mu.Unlock()
	if done != nil {
		select {
		case <-done:
		case <-ctx.Done():
			t.Fatal("Allow did not finish the pending connection")
		}
	}
	a, e := u.connect(ctx)
	if e != nil {
		t.Fatal(e)
	}
	b, e := u.connect(ctx)
	if e != nil || a != b || u.dials != 1 {
		t.Fatalf("Allow was not shared: dials=%d same=%v err=%v", u.dials, a == b, e)
	}
}

func TestYourChromeShutdownCancelsPendingAllow(t *testing.T) {
	chromeEndpointForTest(t, func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() })
	old := yourChromeCallWait
	yourChromeCallWait = 30 * time.Millisecond
	t.Cleanup(func() { yourChromeCallWait = old })
	m := New()
	t.Cleanup(m.Close)
	u := m.yourChrome()
	if _, e := u.connect(context.Background()); !errors.Is(e, errYourChromeWaiting) {
		t.Fatal(e)
	}
	u.mu.Lock()
	done := u.dialing
	u.mu.Unlock()
	m.Close()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Agent shutdown left an Allow request open")
	}
	if u.connected() {
		t.Fatal("Agent connected after stopping")
	}
}

func TestYourChromeDeniedIsRetryable(t *testing.T) {
	chromeEndpointForTest(t, func(w http.ResponseWriter, r *http.Request) { http.Error(w, "denied", http.StatusForbidden) })
	m := New()
	t.Cleanup(m.Close)
	u := m.yourChrome()
	for range 2 {
		if _, e := u.connect(context.Background()); e == nil || !strings.Contains(e.Error(), "YOUR_CHROME_DENIED") {
			t.Fatalf("expected retryable denial, got %v", e)
		}
	}
	if u.dials != 2 {
		t.Fatalf("retry did not open a new request: %d", u.dials)
	}
}

func TestYourChromeCloseKeepsConnectionUntilTargetConfirmedGone(t *testing.T) {
	old := yourChromeLinger
	t.Cleanup(func() { yourChromeLinger = old })
	for _, paused := range []bool{false, true} {
		t.Run(fmt.Sprintf("paused=%v", paused), func(t *testing.T) {
			yourChromeLinger = time.Minute
			chromeEndpointForTest(t, func(w http.ResponseWriter, r *http.Request) {
				ws, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
				if err != nil {
					return
				}
				defer ws.Close()
				for {
					var message cdpMessage
					if ws.ReadJSON(&message) != nil {
						return
					}
					switch message.Method {
					case "Target.closeTarget":
						// Chrome detaches the tab before acknowledging its closure.
						_ = ws.WriteJSON(map[string]any{"method": "Target.detachedFromTarget", "params": map[string]any{"sessionId": "owned-session"}})
						time.Sleep(80 * time.Millisecond)
						_ = ws.WriteJSON(map[string]any{"id": message.ID, "result": map[string]any{"success": true}})
					case "Target.getTargetInfo":
						_ = ws.WriteJSON(map[string]any{"id": message.ID, "error": map[string]any{"code": -32602, "message": "No target with given id found"}})
					}
				}
			})
			m := New()
			t.Cleanup(m.Close)
			u := m.yourChrome()
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			conn, err := u.connect(ctx)
			if err != nil {
				t.Fatal(err)
			}
			page := &yourPage{u: u, base: conn, root: "owned-session", target: "owned-tab", closed: make(chan struct{})}
			if !paused {
				u.mu.Lock()
				u.pages[page] = true
				u.routes[page.root] = yourRoute{page: page}
				u.mu.Unlock()
			}
			yourChromeLinger = 5 * time.Millisecond
			if paused {
				if closed, err := u.closeTabIfConnected(ctx, page.target); err != nil || !closed {
					t.Fatalf("paused close: closed=%v err=%v", closed, err)
				}
			} else if err := page.closeTab(ctx); err != nil {
				t.Fatal(err)
			}
			deadline := time.Now().Add(time.Second)
			for u.connected() && time.Now().Before(deadline) {
				time.Sleep(time.Millisecond)
			}
			if u.connected() {
				t.Fatal("idle connection was not released after confirmed closure")
			}
		})
	}
}
