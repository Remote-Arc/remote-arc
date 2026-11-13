package browserrunner

import (
	"context"
	"encoding/json"
	"errors"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// Protocol-level window state tests supplement, rather than replace, the real
// Windows/macOS desktop acceptance tests. Linux's fallback uses CDP bounds.
func TestHandoffStateTracksConfirmedWindowAndRespectsDeliveredEpisode(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("Linux CDP window adapter; native desktop adapters have separate tests")
	}
	var failQuery atomic.Bool
	bounds := windowBounds{Left: 40, Top: 40, Width: 1280, Height: 900, WindowState: "minimized"}
	s, _ := protocolSession(t, func(message cdpMessage) (any, error) {
		switch message.Method {
		case "Browser.getWindowForTarget":
			if failQuery.Load() {
				return nil, protocolFailure
			}
			return map[string]any{"windowId": 1, "bounds": bounds}, nil
		case "Browser.setWindowBounds":
			var params struct {
				Bounds map[string]any `json:"bounds"`
			}
			if err := json.Unmarshal(message.Params, &params); err != nil {
				return nil, err
			}
			if value, ok := params.Bounds["windowState"].(string); ok {
				bounds.WindowState = value
			}
			return map[string]any{}, nil
		case "Runtime.evaluate":
			var params struct {
				Expression string `json:"expression"`
			}
			_ = json.Unmarshal(message.Params, &params)
			if strings.Contains(params.Expression, "screen.availWidth") {
				return evaluated([]int{0, 0, 1360, 980}), nil
			}
			return evaluated(map[string]any{"url": "https://example.test/form", "ready": "complete"}), nil
		default:
			return map[string]any{}, nil
		}
	})
	s.proc = &browserProcess{profileDir: t.TempDir()}
	s.cp.Headless = true
	s.m.userPresent = func() bool { return true }
	out, err := s.m.start(context.Background(), map[string]any{"task_id": s.cp.SessionID, "allowed_origins": s.cp.AllowedOrigins, "headless": false}, protocol.Policy{})
	if err != nil || out.(map[string]any)["window"] != "on screen" || s.cp.Headless {
		t.Fatal("confirmed visible window not reflected in state", out, err)
	}
	s.cp.State = StateNeedsUser
	s.cp.AttentionID = "episode"
	s.cp.Headless = true
	s.showAttention(context.Background())
	if !s.cp.AttentionShown || !s.cp.AttentionPresented || !s.shownForUser {
		t.Fatal("confirmed handoff not recorded")
	}
	out, err = s.m.start(context.Background(), map[string]any{"task_id": s.cp.SessionID, "allowed_origins": s.cp.AllowedOrigins, "headless": false}, protocol.Policy{})
	if err != nil || !strings.Contains(out.(map[string]any)["window"].(string), "waiting for the user") {
		t.Fatal("delivered handoff did not resume in place", out, err)
	}
	if _, err = s.m.start(context.Background(), map[string]any{"task_id": s.cp.SessionID, "allowed_origins": s.cp.AllowedOrigins, "headless": true}, protocol.Policy{}); err == nil {
		t.Fatal("model hid pending user handoff")
	}
	s.cp.AttentionShown = false
	s.cp.AttentionPresented = false
	s.cp.Headless = false
	failQuery.Store(true)
	s.showAttention(context.Background())
	if s.cp.AttentionShown || !strings.Contains(s.cp.NeedsUser, "could not be raised") {
		t.Fatal("failed window raise claimed delivery")
	}
}

func TestPendingLaunchStatusAndCancellationDoNotDispatch(t *testing.T) {
	s, _ := protocolSession(t, func(message cdpMessage) (any, error) { return nil, protocolFailure })
	pending := &browserStartup{done: make(chan struct{}), cancel: func() {}}
	s.pendingLaunch = pending
	out, err := s.m.Call(context.Background(), "browser_runner_status", map[string]any{"session_id": s.cp.SessionID}, protocol.Policy{})
	if err != nil || out.(map[string]any)["state"] != "starting" {
		t.Fatal(out, err)
	}
	pending.err = errors.New("fixture startup failed")
	close(pending.done)
	if _, err = s.m.Call(context.Background(), "browser_runner_status", map[string]any{"session_id": s.cp.SessionID}, protocol.Policy{}); !errors.Is(err, pending.err) {
		t.Fatal("startup failure hidden", err)
	}
	s.pendingLaunch = nil
	s.starting.Store(true)
	items := s.m.list()["sessions"].([]map[string]any)
	if items[0]["state"] != "starting" {
		t.Fatal("list claimed active before startup")
	}
	s.mu.Lock()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	out, err = s.m.start(ctx, map[string]any{"task_id": s.cp.SessionID, "allowed_origins": s.cp.AllowedOrigins}, protocol.Policy{})
	s.mu.Unlock()
	if err != nil || out.(map[string]any)["state"] != "starting" {
		t.Fatal("cancelled retry lost pending startup", out, err)
	}
	s.starting.Store(false)
}
