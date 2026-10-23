package browserrunner

import (
	"context"
	"strings"
	"testing"
	"time"
)

// The task browser works out of sight: its window opens off screen, comes on
// screen only when asked (for the user), keeps the page and what was typed
// when shown or hidden, and goes back out of sight once the user is done.
// Needs a display (on Linux, run under xvfb-run).
func TestE2EHiddenWindowShowsAndHidesInPlace(t *testing.T) {
	if !hasDisplay() {
		t.Skip("no display: the task browser runs without a window here")
	}
	h, _, base, _ := newHarness(t)
	start := h.call("browser_runner_start", map[string]any{"task_id": "quiet", "allowed_origins": []any{base}, "start_url": base + "/apply/1"})
	if !strings.HasPrefix(start["window"].(string), "hidden") || start["headless"] != true {
		t.Fatalf("a new task is not hidden: %v", start)
	}
	s, _ := h.m.get("quiet")
	bounds := func() windowBounds {
		t.Helper()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		s.mu.Lock()
		defer s.mu.Unlock()
		_, b, e := s.window(ctx)
		if e != nil {
			t.Fatal(e)
		}
		return b
	}
	offScreen := func(b windowBounds) bool {
		return b.WindowState != "minimized" && b.Left <= offscreen/2
	}
	typed := func() string {
		t.Helper()
		s.mu.Lock()
		defer s.mu.Unlock()
		raw, e := s.evaluateMain(h.ctx, `document.getElementById("n").value`)
		if e != nil {
			t.Fatal(e)
		}
		return strings.Trim(string(raw), `"`)
	}
	if b := bounds(); !offScreen(b) {
		t.Fatalf("hidden task window is on screen: %+v", b)
	}
	proc := s.proc

	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "quiet"})
	h.call("browser_runner_act", map[string]any{"session_id": "quiet", "snapshot_id": snap["snapshot_id"], "ref": ref(t, snap, "textbox", "full name"), "action": "fill", "value": "Sam Example"})

	// Shown where it is: same browser, same page, same input.
	shown := h.call("browser_runner_start", map[string]any{"task_id": "quiet", "allowed_origins": []any{base}, "headless": false})
	if shown["window"] != "on screen" || shown["headless"] != false {
		t.Fatalf("show: %v", shown)
	}
	if b := bounds(); offScreen(b) || b.Width < 400 {
		t.Fatalf("shown window is not on screen: %+v", b)
	}
	if s.proc != proc || typed() != "Sam Example" {
		t.Fatalf("showing reopened the page: same browser=%v typed=%q", s.proc == proc, typed())
	}
	h.call("browser_runner_start", map[string]any{"task_id": "quiet", "allowed_origins": []any{base}, "headless": true})
	if b := bounds(); !offScreen(b) || s.proc != proc || typed() != "Sam Example" {
		t.Fatalf("hiding moved or reloaded the page: %+v typed=%q", b, typed())
	}

	// Shown for the user (a sign-in), it goes back out of sight once the page
	// no longer needs them and the AI continues.
	h.call("browser_runner_act", map[string]any{"session_id": "quiet", "action": "navigate", "url": base + "/login"})
	if snap = h.call("browser_runner_snapshot", map[string]any{"session_id": "quiet"}); snap["session_state"] != StateNeedsUser || !strings.Contains(snap["needs_user"].(string), "headless=false") {
		t.Fatalf("sign-in not handed to the user: %v", snap["needs_user"])
	}
	h.call("browser_runner_start", map[string]any{"task_id": "quiet", "allowed_origins": []any{base}, "headless": false})
	if offScreen(bounds()) {
		t.Fatal("window not shown for the user")
	}
	// The user signs in; the page moves on.
	h.call("browser_runner_act", map[string]any{"session_id": "quiet", "action": "navigate", "url": base + "/apply/1"})
	if offScreen(bounds()) {
		t.Fatal("window hidden while the page still needed the user")
	}
	snap = h.call("browser_runner_snapshot", map[string]any{"session_id": "quiet"})
	if snap["session_state"] != StateActive {
		t.Fatalf("state after sign-in: %v", snap["session_state"])
	}
	out := h.call("browser_runner_act", map[string]any{"session_id": "quiet", "snapshot_id": snap["snapshot_id"], "ref": ref(t, snap, "textbox", "full name"), "action": "fill", "value": "Jenny"})
	if !strings.HasPrefix(out["window"].(string), "hidden again") || !offScreen(bounds()) {
		t.Fatalf("window not hidden after the user finished: %v %+v", out["window"], bounds())
	}
	if st := h.call("browser_runner_start", map[string]any{"task_id": "quiet", "allowed_origins": []any{base}}); st["headless"] != true {
		t.Fatalf("resume after auto-hide: %v", st)
	}
}
