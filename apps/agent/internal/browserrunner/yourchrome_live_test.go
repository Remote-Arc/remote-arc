package browserrunner

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"
)

// Explicit opt-in only: exercises the user's actual Chrome and its native
// Allow dialog using two public example.com tasks. Never runs in normal CI.
func TestLiveYourChrome(t *testing.T) {
	if os.Getenv("REMOTEARC_YOUR_CHROME_LIVE") != "1" {
		t.Skip("set REMOTEARC_YOUR_CHROME_LIVE=1 to verify the native Chrome Allow flow")
	}
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()
	h := &harness{t: t, m: New(), ctx: ctx}
	t.Cleanup(h.m.Close)
	for _, id := range []string{"live-chrome-a", "live-chrome-b"} {
		args := map[string]any{"task_id": id, "browser": browserYourChrome, "allowed_origins": []any{"https://example.com", "https://www.iana.org"}, "start_url": "https://example.com"}
		for {
			_, e := h.m.Call(ctx, "browser_runner_start", args, h.policy)
			if e == nil {
				break
			}
			if !strings.Contains(e.Error(), "YOUR_CHROME_WAITING") && !strings.Contains(e.Error(), "YOUR_CHROME_NOT_ENABLED") {
				t.Fatal(e)
			}
			t.Log(e)
			select {
			case <-ctx.Done():
				t.Fatal(ctx.Err())
			case <-time.After(time.Second):
			}
		}
		// Even if a subsequent assertion fails, close only these task tabs.
		defer func() {
			cleanup, stop := context.WithTimeout(context.Background(), 5*time.Second)
			defer stop()
			_, _ = h.m.Call(cleanup, "browser_runner_close", map[string]any{"session_id": id}, h.policy)
		}()
		snap := h.call("browser_runner_snapshot", map[string]any{"session_id": id})
		if snap["title"] != "Example Domain" {
			t.Fatalf("unexpected task title: %v", snap["title"])
		}
		t.Logf("%s read Example Domain through the real Chrome connection", id)
		if id == "live-chrome-a" {
			link := ref(t, snap, "link", "learn more")
			h.call("browser_runner_act", map[string]any{"session_id": id, "snapshot_id": snap["snapshot_id"], "ref": link, "action": "click", "effect": "navigation"})
		}
	}
	if h.m.yourChrome().dials != 1 {
		t.Fatal("the second task opened another Chrome connection")
	}
	t.Log("both tasks shared one native Allow connection; closing their tabs and disconnecting")
}
