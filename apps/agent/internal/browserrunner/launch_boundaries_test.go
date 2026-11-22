package browserrunner

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/gorilla/websocket"
)

func TestExplicitBrowserDiscoveryAndCorruptActivePortsFailClosed(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("REMOTEARC_BROWSER_PATH", exe)
	m := New()
	if !m.Available() {
		t.Fatal("explicit executable unavailable")
	}
	found, err := FindBrowser()
	if err != nil || found != exe {
		t.Fatal(found, err)
	}
	for _, path := range []string{t.TempDir(), filepath.Join(t.TempDir(), "missing")} {
		t.Setenv("REMOTEARC_BROWSER_PATH", path)
		if m.Available() {
			t.Fatal("invalid browser advertised")
		}
	}
	dir := t.TempDir()
	for _, raw := range []string{"", "123", "abc\n/devtools/browser/a", "0\n/devtools/browser/a", "65536\n/devtools/browser/a"} {
		if err = os.WriteFile(filepath.Join(dir, "DevToolsActivePort"), []byte(raw), 0600); err != nil {
			t.Fatal(err)
		}
		if _, _, err = readActivePort(dir); err == nil {
			t.Fatalf("invalid endpoint accepted: %q", raw)
		}
	}
	t.Setenv("REMOTEARC_BROWSER_HEADLESS", "true")
	if hasDisplay() {
		t.Fatal("explicit headless override ignored")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err = launchBrowser(ctx, exe, dir, true); err != context.Canceled {
		t.Fatal("pre-cancelled launch started", err)
	}
	blocked := filepath.Join(t.TempDir(), "file")
	if err = os.WriteFile(blocked, nil, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = launchBrowser(context.Background(), exe, filepath.Join(blocked, "profile"), true); err == nil {
		t.Fatal("invalid profile accepted")
	}
	if _, err = launchBrowser(context.Background(), filepath.Join(dir, "missing"), filepath.Join(dir, "fresh"), true); err == nil {
		t.Fatal("failed process start accepted")
	}
	if runtime.GOOS != "windows" {
		plain := filepath.Join(dir, "not-executable")
		if err = os.WriteFile(plain, nil, 0600); err != nil {
			t.Fatal(err)
		}
		if isExecutable(plain) {
			t.Fatal("non-executable file accepted")
		}
	}
}

func TestReattachmentRequiresMatchingEndpointAndCanCreateMissingPage(t *testing.T) {
	var created atomic.Bool
	var mode atomic.Int32
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/json/version":
			path := "/devtools/browser/owned"
			if mode.Load() == 1 {
				path = "/devtools/browser/foreign"
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"webSocketDebuggerUrl": "ws" + strings.TrimPrefix(server.URL, "http") + path, "User-Agent": "HeadlessChrome"})
		case "/json/list":
			if mode.Load() == 2 {
				http.Error(w, "unavailable", 503)
				return
			}
			if created.Load() {
				_ = json.NewEncoder(w).Encode([]map[string]any{{"type": "page", "webSocketDebuggerUrl": "ws://127.0.0.1/devtools/page/created"}})
			} else {
				_ = json.NewEncoder(w).Encode([]any{})
			}
		default:
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
				if message.Method != "Target.createTarget" {
					t.Errorf("unexpected browser command %s", message.Method)
					return
				}
				created.Store(true)
				if ws.WriteJSON(map[string]any{"id": message.ID, "result": map[string]any{"targetId": "created"}}) != nil {
					return
				}
			}
		}
	}))
	defer server.Close()
	dir := t.TempDir()
	port := server.Listener.Addr().(*net.TCPAddr).Port
	if err := os.WriteFile(filepath.Join(dir, "DevToolsActivePort"), []byte(fmt.Sprintf("%d\n/devtools/browser/owned\n", port)), 0600); err != nil {
		t.Fatal(err)
	}
	mode.Store(1)
	if _, ok := attachExisting(context.Background(), dir); ok {
		t.Fatal("attached to foreign browser sharing port")
	}
	mode.Store(0)
	proc, ok := attachExisting(context.Background(), dir)
	if !ok || !proc.attached || !proc.headless {
		t.Fatal("matching browser not reattached")
	}
	reattached, err := launchBrowser(context.Background(), "must-not-launch", dir, true)
	if err != nil || !reattached.attached {
		t.Fatal("attempted new process instead of reattachment", err)
	}
	page, err := proc.pageTarget(context.Background())
	if err != nil || !strings.HasSuffix(page, "/created") {
		t.Fatal("missing page not created", page, err)
	}
	mode.Store(2)
	if _, err = proc.pageTarget(context.Background()); err == nil {
		t.Fatal("failed target discovery accepted")
	}
}
