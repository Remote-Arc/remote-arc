package browserrunner

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestE2EDelayedChallengeHandoffAndWait(t *testing.T) {
	h, _, _, _ := newHarness(t)
	site := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		if r.URL.Path == "/captcha" {
			fmt.Fprint(w, "Synthetic human verification")
			return
		}
		fmt.Fprint(w, `<form><input name="name"><button type="button" onclick="setTimeout(()=>document.getElementById('challenge').style.display='block',1500)">Submit application</button></form><iframe id="challenge" src="/captcha#frame=challenge" style="display:none;width:400px;height:400px"></iframe>`)
	}))
	defer site.Close()
	h.call("browser_runner_start", map[string]any{"task_id": "delayed", "allowed_origins": []any{site.URL}, "start_url": site.URL})
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "delayed"})
	if snap["session_state"] != StateActive {
		t.Fatal("hidden challenge blocked", snap)
	}
	sent := h.call("browser_runner_act", map[string]any{"session_id": "delayed", "snapshot_id": snap["snapshot_id"], "ref": ref(t, snap, "button", "submit application"), "action": "click", "effect": "submit", "idempotency_key": "once"})
	if sent["session_state"] != StateNeedsUser || sent["effect"].(map[string]any)["status"] != EffectUnverified || sent["next_action"] != "browser_runner_wait until=user_done" {
		t.Fatalf("handoff missing: %v", sent)
	}
	s, _ := h.m.get("delayed")
	if s.hasWindow() {
		_, bounds, e := s.window(h.ctx)
		if e != nil || bounds.WindowState == "minimized" || bounds.Left < offscreen/2 {
			t.Fatalf("window did not come forward: %+v %v", bounds, e)
		}
	}
	events := h.m.PendingAttention()
	if len(events) != 1 || events[0].Kind != "captcha" {
		t.Fatalf("attention: %+v", events)
	}
	h.call("browser_runner_snapshot", map[string]any{"session_id": "delayed"})
	if len(h.m.PendingAttention()) != 1 {
		t.Fatal("duplicate attention")
	}
	h.fail("browser_runner_close", map[string]any{"session_id": "delayed"}, "RUNNER_USER_ACTION_PENDING")
	h.fail("browser_runner_close", map[string]any{"session_id": "delayed", "force": true}, "reason")
	waiting := h.call("browser_runner_wait", map[string]any{"session_id": "delayed", "until": "user_done", "timeout_ms": 1000})
	if waiting["state"] != "timeout" {
		t.Fatal(waiting)
	}
	// Only the fixture simulates the human. No Runner action touches a CAPTCHA.
	_, e := s.evaluateMain(h.ctx, `document.getElementById('challenge').style.display='none'`)
	if e != nil {
		t.Fatal(e)
	}
	done := h.call("browser_runner_wait", map[string]any{"session_id": "delayed", "until": "user_done", "timeout_ms": 2000})
	if done["state"] != "met" || done["waited_ms"].(float64) < 450 {
		t.Fatal(done)
	}
	h.fail("browser_runner_close", map[string]any{"session_id": "delayed"}, "RUNNER_USER_ACTION_PENDING") // unresolved submit remains
	replay := h.call("browser_runner_act", map[string]any{"session_id": "delayed", "action": "click", "effect": "submit", "idempotency_key": "once"})
	if replay["replayed"] != true {
		t.Fatal("waiting authorized a retry", replay)
	}
	h.call("browser_runner_close", map[string]any{"session_id": "delayed", "force": true, "reason": "Abandon synthetic test after verifying handoff"})
	if !strings.Contains(fmt.Sprint(s.cp.Receipts), "Abandon synthetic") {
		t.Fatal("missing forced-close receipt")
	}
}

func TestE2ENeedsUserReaperRemindsBeforeCollection(t *testing.T) {
	h, _, base, _ := newHarness(t)
	h.m.SetAttentionMode("notify_only")
	h.call("browser_runner_start", map[string]any{"task_id": "reaper", "allowed_origins": []any{base}, "start_url": base + "/login"})
	h.call("browser_runner_snapshot", map[string]any{"session_id": "reaper"})
	s, _ := h.m.get("reaper")
	if s.hasWindow() {
		_, b, _ := s.window(h.ctx)
		if b.WindowState != "minimized" && b.Left > offscreen/2 {
			t.Fatal("notify_only raised the window")
		}
	}
	start := h.m.now()
	h.m.now = func() time.Time { return start.Add(21 * time.Minute) }
	h.m.reapIdle()
	if !s.live() {
		t.Fatal("user handoff reaped at normal idle timeout")
	}
	h.m.now = func() time.Time { return start.Add(121 * time.Minute) }
	h.m.reapIdle()
	if !s.live() || !s.cp.AttentionReminded {
		t.Fatal("must remind before collecting")
	}
	h.m.reapIdle()
	if s.live() {
		t.Fatal("expired handoff not collected")
	}
	cp, e := loadCheckpoint("reaper")
	if e != nil || cp.State != StateNeedsUser {
		t.Fatal("handoff checkpoint lost", e)
	}
	reminders := 0
	for _, event := range h.m.PendingAttention() {
		if event.Kind == "reminder" {
			reminders++
		}
	}
	if reminders != 1 {
		t.Fatal("expected one reminder", reminders)
	}
}

func TestWaitLimitCapsWithoutRejecting(t *testing.T) {
	for _, n := range []int{40001, 600000} {
		ms, capped, e := waitLimit(map[string]any{"timeout_ms": n})
		if e != nil || ms != 40000 || !capped {
			t.Fatal(ms, capped, e)
		}
	}
	if _, _, e := waitLimit(map[string]any{"timeout_ms": 999}); e == nil {
		t.Fatal("invalid lower bound")
	}
}
