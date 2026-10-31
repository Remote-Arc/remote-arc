package browserrunner

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync/atomic"
	"testing"
	"time"
)

func requireHandoffWindow(t *testing.T) {
	t.Helper()
	_, browserErr := FindBrowser()
	if hasDisplay() && browserErr == nil {
		return
	}
	if os.Getenv("REMOTEARC_E2E_REQUIRE_WINDOW") == "1" {
		t.Fatalf("visible browser acceptance requires a display and browser: display=%v browser=%v", hasDisplay(), browserErr)
	}
	t.Skip("native window handoff needs a display and installed browser")
}

// Check the work area from the isolated world, not a site's replacement of
// window.screen. These tests run against actual native browser windows.
func handoffWorkArea(t *testing.T, s *session, ctx context.Context) [4]int {
	t.Helper()
	id, err := s.world(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var out evalResult
	err = s.conn.Call(ctx, "Runtime.evaluate", map[string]any{"expression": "[screen.availLeft||0,screen.availTop||0,screen.availWidth,screen.availHeight]", "contextId": id, "returnByValue": true}, &out)
	var area [4]int
	if err != nil || json.Unmarshal(out.Result.Value, &area) != nil || area[2] <= 0 || area[3] <= 0 {
		t.Fatalf("cannot inspect display: %s %v", out.Result.Value, err)
	}
	return area
}

func assertHandoffVisible(t *testing.T, s *session, ctx context.Context) {
	t.Helper()
	area := handoffWorkArea(t, s, ctx)
	var bounds windowBounds
	deadline := time.Now().Add(3 * time.Second)
	for {
		_, b, err := s.window(ctx)
		bounds = b
		if err == nil && b.WindowState == "normal" && b.Width > 0 && b.Height > 0 && b.Left >= area[0]-8 && b.Top >= area[1]-8 && b.Left+b.Width <= area[0]+area[2]+8 && b.Top+b.Height <= area[1]+area[3]+8 && s.taskWindowUncovered() {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("user cannot reach task window: bounds=%+v work area=%v error=%v", bounds, area, err)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func TestE2ECompactPasswordHandsOffToVisibleWindow(t *testing.T) {
	requireHandoffWindow(t)
	h, _, _, _ := newHarness(t)
	site := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `<html><body><h1>Sign in</h1><form><label>Password <input type="password" autocomplete="current-password" style="height:16px;padding:0;border:0"></label></form></body></html>`)
	}))
	t.Cleanup(site.Close)
	h.call("browser_runner_start", map[string]any{"task_id": "compact-login", "allowed_origins": []string{site.URL}, "start_url": site.URL})
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "compact-login"})
	if snap["session_state"] != StateNeedsUser {
		t.Fatalf("visible compact password was not handed to the user: state=%v blockers=%v", snap["session_state"], snap["blockers"])
	}
	s, _ := h.m.get("compact-login")
	assertHandoffVisible(t, s, h.ctx)
}

func TestE2ERepeatedShowRestoresMinimizedWindow(t *testing.T) {
	requireHandoffWindow(t)
	h, _, base, _ := newHarness(t)
	args := map[string]any{"task_id": "show-again", "allowed_origins": []string{base}, "start_url": base + "/apply/1", "headless": false}
	h.call("browser_runner_start", args)
	s, _ := h.m.get("show-again")
	proc := s.proc
	id, _, err := s.window(h.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.setBounds(h.ctx, id, map[string]any{"windowState": "minimized"}); err != nil || !s.awaitState(h.ctx, "minimized", 3*time.Second) {
		t.Fatalf("cannot minimize fixture window: %v", err)
	}
	delete(args, "start_url")
	h.call("browser_runner_start", args)
	assertHandoffVisible(t, s, h.ctx)
	if proc != s.proc {
		t.Fatal("restoring a task restarted its browser")
	}
}

func TestE2EPageCannotParkHandoffOutsideDisplay(t *testing.T) {
	requireHandoffWindow(t)
	h, _, _, _ := newHarness(t)
	site := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `<html><body><script>Object.defineProperty(window,'screen',{value:{availLeft:-25000,availTop:0,availWidth:1400,availHeight:1000}})</script><h1>Fixture</h1><input aria-label="Name"></body></html>`)
	}))
	t.Cleanup(site.Close)
	h.call("browser_runner_start", map[string]any{"task_id": "screen-spoof", "allowed_origins": []string{site.URL}, "start_url": site.URL})
	h.call("browser_runner_start", map[string]any{"task_id": "screen-spoof", "allowed_origins": []string{site.URL}, "headless": false})
	s, _ := h.m.get("screen-spoof")
	assertHandoffVisible(t, s, h.ctx)
}

type blockedWindowClient struct {
	cdpClient
	blocked atomic.Bool
}

func (c *blockedWindowClient) Call(ctx context.Context, method string, params any, out any) error {
	if method == "Browser.setWindowBounds" && c.blocked.Load() {
		return errors.New("synthetic temporarily unavailable window manager")
	}
	return c.cdpClient.Call(ctx, method, params, out)
}

func TestE2EHandoffRetriesAfterWindowManagerRecovers(t *testing.T) {
	requireHandoffWindow(t)
	h, _, base, _ := newHarness(t)
	h.call("browser_runner_start", map[string]any{"task_id": "retry-handoff", "allowed_origins": []string{base}, "start_url": base + "/apply/1"})
	s, _ := h.m.get("retry-handoff")
	client := &blockedWindowClient{cdpClient: s.conn}
	client.blocked.Store(true)
	s.mu.Lock()
	s.conn = client
	s.mu.Unlock()
	h.call("browser_runner_act", map[string]any{"session_id": "retry-handoff", "action": "navigate", "url": base + "/login"})
	first := h.call("browser_runner_snapshot", map[string]any{"session_id": "retry-handoff"})
	if first["session_state"] != StateNeedsUser {
		t.Fatal("fixture did not require the user")
	}
	episode := s.cp.AttentionID
	client.blocked.Store(false)
	h.call("browser_runner_snapshot", map[string]any{"session_id": "retry-handoff"})
	assertHandoffVisible(t, s, h.ctx)
	if s.cp.AttentionID != episode || len(h.m.PendingAttention()) != 1 {
		t.Fatal("retry created a duplicate attention episode")
	}
}

func TestE2EResumedUserHandoffDoesNotPopupAgain(t *testing.T) {
	requireHandoffWindow(t)
	h, _, base, _ := newHarness(t)
	h.call("browser_runner_start", map[string]any{"task_id": "resume-handoff", "allowed_origins": []string{base}, "start_url": base + "/login", "headless": false})
	h.call("browser_runner_snapshot", map[string]any{"session_id": "resume-handoff"})
	s, _ := h.m.get("resume-handoff")
	if s.cp.State != StateNeedsUser {
		t.Fatal("fixture did not begin as a task needing the user")
	}
	episode := s.cp.AttentionID
	if !s.cp.AttentionShown {
		t.Fatal("first handoff was not delivered")
	}
	h.m.Close()
	h.m = New()
	h.m.userPresent = func() bool { return true }
	t.Cleanup(h.m.Close)
	resumed := h.call("browser_runner_start", map[string]any{"task_id": "resume-handoff", "allowed_origins": []string{base}})
	s, _ = h.m.get("resume-handoff")
	if s.windowIsVisible(h.ctx) || s.cp.AttentionID != episode || !s.cp.AttentionShown {
		t.Fatalf("reconnect repeated the automatic handoff: %v", resumed)
	}
}

func TestE2EHandoffHonorsMinimizeAndNewEpisode(t *testing.T) {
	requireHandoffWindow(t)
	h, _, base, _ := newHarness(t)
	h.call("browser_runner_start", map[string]any{"task_id": "dismissed", "allowed_origins": []string{base}, "start_url": base + "/login"})
	h.call("browser_runner_snapshot", map[string]any{"session_id": "dismissed"})
	s, _ := h.m.get("dismissed")
	assertHandoffVisible(t, s, h.ctx)
	episode := s.cp.AttentionID
	id, _, err := s.window(h.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.setBounds(h.ctx, id, map[string]any{"windowState": "minimized"}); err != nil || !s.awaitState(h.ctx, "minimized", 3*time.Second) {
		t.Fatal("fixture did not minimize", err)
	}
	for i := 0; i < 2; i++ {
		h.call("browser_runner_snapshot", map[string]any{"session_id": "dismissed"})
	}
	h.call("browser_runner_start", map[string]any{"task_id": "dismissed", "allowed_origins": []string{base}, "headless": false})
	if b, ok := s.quickWindow(h.ctx); !ok || b.WindowState != "minimized" || !s.cp.AttentionDismissed {
		t.Fatal("polling undid the user's minimization", b)
	}
	// Clearing a real blocker closes the episode. A later sign-in may prompt once.
	if _, err = s.evaluateMain(h.ctx, `document.getElementById('pw').remove()`); err != nil {
		t.Fatal(err)
	}
	h.call("browser_runner_snapshot", map[string]any{"session_id": "dismissed"})
	if s.cp.AttentionID != "" {
		t.Fatal("completed episode was retained")
	}
	h.call("browser_runner_act", map[string]any{"session_id": "dismissed", "action": "navigate", "url": base + "/login"})
	assertHandoffVisible(t, s, h.ctx)
	if s.cp.AttentionID == episode || !s.cp.AttentionShown {
		t.Fatal("new episode did not show once")
	}
}

func TestE2EHandoffWaitsForPresenceAndKeepsSessionPolicy(t *testing.T) {
	requireHandoffWindow(t)
	h, _, base, _ := newHarness(t)
	h.m.userPresent = func() bool { return false }
	h.call("browser_runner_start", map[string]any{"task_id": "absent", "allowed_origins": []string{base}, "start_url": base + "/login", "headless": false})
	h.call("browser_runner_snapshot", map[string]any{"session_id": "absent"})
	s, _ := h.m.get("absent")
	if s.windowIsVisible(h.ctx) || s.cp.AttentionShown || len(h.m.PendingAttention()) != 1 {
		t.Fatal("absence must notify without showing")
	}
	h.m.userPresent = func() bool { return true }
	h.call("browser_runner_snapshot", map[string]any{"session_id": "absent"})
	assertHandoffVisible(t, s, h.ctx)
	// A different background session keeps its policy despite an interactive call.
	h.policy.RunnerAttentionMode = "notify_only"
	h.call("browser_runner_start", map[string]any{"task_id": "background", "allowed_origins": []string{base}, "start_url": base + "/login", "headless": false})
	h.call("browser_runner_snapshot", map[string]any{"session_id": "background"})
	background, _ := h.m.get("background")
	h.policy.RunnerAttentionMode = "show_and_notify"
	h.call("browser_runner_snapshot", map[string]any{"session_id": "absent"})
	h.policy.RunnerAttentionMode = "" // Simulate a reconnect with no policy override.
	h.call("browser_runner_snapshot", map[string]any{"session_id": "background"})
	if background.windowIsVisible(h.ctx) || background.cp.AttentionShown {
		t.Fatal("background task inherited another session's attention policy")
	}
}

func TestE2ECompactPasswordExcludesOnePixelBait(t *testing.T) {
	h, _, _, _ := newHarness(t)
	site := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `<h1>Contact us</h1><input type="password" style="width:1px;height:1px;padding:0;border:0">`)
	}))
	t.Cleanup(site.Close)
	h.call("browser_runner_start", map[string]any{"task_id": "bait", "allowed_origins": []string{site.URL}, "start_url": site.URL})
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "bait"})
	if snap["session_state"] == StateNeedsUser || len(h.m.PendingAttention()) != 0 {
		t.Fatal("one-pixel bait triggered a handoff")
	}
}
