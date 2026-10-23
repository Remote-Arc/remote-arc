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
