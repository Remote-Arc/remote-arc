package browserrunner

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
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

func TestE2EWaitConditionsAndLiveView(t *testing.T) {
	h, _, _, _ := newHarness(t)
	site := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		if r.URL.Path == "/ping" {
			time.Sleep(200 * time.Millisecond)
			fmt.Fprint(w, "ok")
			return
		}
		fmt.Fprint(w, `<h1>Application</h1><input type="file" id="file" aria-label="Resume"><div id="progress" role="progressbar" style="width:100px;height:8px">Processing</div><p id="result"></p>`)
	}))
	defer site.Close()
	h.call("browser_runner_start", map[string]any{"task_id": "conditions", "allowed_origins": []any{site.URL}, "start_url": site.URL})
	s, _ := h.m.get("conditions")
	evaluate := func(js string) {
		t.Helper()
		if _, e := s.evaluateMain(h.ctx, js); e != nil {
			t.Fatal(e)
		}
	}
	waiting := func(until string, args map[string]any) map[string]any {
		return h.call("browser_runner_wait", merge(map[string]any{"session_id": "conditions", "until": until, "timeout_ms": 3000}, args))
	}
	evaluate(`setTimeout(()=>document.getElementById('result').textContent='Application ready',200)`)
	if r := waiting("text", map[string]any{"text": "Application ready"}); r["state"] != "met" {
		t.Fatal(r)
	}
	if r := waiting("text", map[string]any{"text": "Application ready", "timeout_ms": 60000}); r["state"] != "met" || r["note"] == nil {
		t.Fatal("large wait must be capped with a note", r)
	}
	evaluate(`setTimeout(()=>history.pushState({},'',location.pathname+'?stage=ready'),200)`)
	if r := waiting("url_contains", map[string]any{"url_contains": "stage=ready"}); r["state"] != "met" {
		t.Fatal(r)
	}
	evaluate(`setTimeout(()=>document.getElementById('result').textContent='Changed',200)`)
	if r := waiting("page_change", nil); r["state"] != "met" {
		t.Fatal(r)
	}
	if r := waiting("upload_done", map[string]any{"timeout_ms": 1000}); r["state"] != "timeout" {
		t.Fatal("empty file cannot be done", r)
	}
	file := filepath.Join(h.policy.WorkspaceRoots[0], "resume.txt")
	if e := os.WriteFile(file, []byte("synthetic resume"), 0600); e != nil {
		t.Fatal(e)
	}
	var doc struct {
		Root struct {
			NodeID int `json:"nodeId"`
		} `json:"root"`
	}
	if e := s.conn.Call(h.ctx, "DOM.getDocument", nil, &doc); e != nil {
		t.Fatal(e)
	}
	var node struct {
		NodeID int `json:"nodeId"`
	}
	if e := s.conn.Call(h.ctx, "DOM.querySelector", map[string]any{"nodeId": doc.Root.NodeID, "selector": "#file"}, &node); e != nil {
		t.Fatal(e)
	}
	if e := s.conn.Call(h.ctx, "DOM.setFileInputFiles", map[string]any{"nodeId": node.NodeID, "files": []string{file}}, nil); e != nil {
		t.Fatal(e)
	}
	evaluate(`setTimeout(()=>document.getElementById('progress').remove(),700)`)
	if r := waiting("upload_done", nil); r["state"] != "met" || r["waited_ms"].(float64) < 500 {
		t.Fatal("processing was not awaited", r)
	}
	evaluate(`fetch('/ping')`)
	if r := waiting("idle", nil); r["state"] != "met" || r["waited_ms"].(float64) < 1000 {
		t.Fatal(r)
	}
	h.fail("browser_runner_wait", map[string]any{"session_id": "conditions", "until": "text"}, "required")
	h.fail("browser_runner_wait", map[string]any{"session_id": "conditions", "until": "invalid"}, "until must")
	if r := waiting("text", map[string]any{"text": "missing", "timeout_ms": 1000}); r["state"] != "timeout" {
		t.Fatal(r)
	}
	// Screen capture starts only after a Dashboard viewer heartbeat, without
	// reading a snapshot or exposing an AI tool. A stale heartbeat stops it.
	var beforeView windowBounds
	if s.hasWindow() {
		_, beforeView, _ = s.window(h.ctx)
	}
	near := func(actual uint32, want int) bool {
		return int(actual>>8) >= want-10 && int(actual>>8) <= want+10
	}
	updatedFrame := func(red, green, blue int) {
		t.Helper()
		// A nonempty JPEG alone could be a stale/blank surface. Require an updated
		// fixture pixel as well, proving a minimized window continues to render.
		deadline := time.NewTimer(10 * time.Second)
		defer deadline.Stop()
	frameLoop:
		for {
			select {
			case frame := <-h.m.Frames():
				if frame.SessionID != "conditions" || frame.Type != "runner_frame" || len(frame.Data) == 0 || len(frame.Data) > maxFrameBytes*4/3 {
					t.Fatal("bad frame", frame.Type, len(frame.Data))
				}
				raw, err := base64.StdEncoding.DecodeString(frame.Data)
				if err != nil {
					t.Fatal("invalid frame encoding")
				}
				img, err := jpeg.Decode(bytes.NewReader(raw))
				if err != nil {
					t.Fatal("invalid frame JPEG")
				}
				bounds := img.Bounds()
				r, g, b, _ := img.At(bounds.Max.X-10, bounds.Max.Y-10).RGBA()
				if near(r, red) && near(g, green) && near(b, blue) {
					break frameLoop
				}
			case <-deadline.C:
				s.ev.Lock()
				active, viewError, pending := s.viewActive, s.viewError, s.viewCaptureCancel != nil
				s.ev.Unlock()
				visibility, _ := s.evaluateMain(h.ctx, `JSON.stringify({visibility:document.visibilityState,focus:document.hasFocus(),width:innerWidth,height:innerHeight,dpr:devicePixelRatio})`)
				var version struct {
					Product string `json:"product"`
				}
				_ = s.conn.Call(h.ctx, "Browser.getVersion", nil, &version)
				t.Fatalf("live view produced no updated frame (active=%v, pending_capture=%v, error=%q, browser=%s, window=%+v, renderer=%s)", active, pending, viewError, version.Product, beforeView, visibility)
			}
		}
	}
	for pass, rgb := range [][3]int{{42, 55, 88}, {88, 55, 42}} {
		if pass > 0 {
			// Reopening the viewer must also recover fresh rendering while the
			// same native window remains minimized, without reloading the page.
			h.m.ViewHeartbeat("conditions", false)
			s.mu.Lock()
			s.serviceView(h.ctx)
			s.mu.Unlock()
		}
		h.m.ViewHeartbeat("conditions", true)
		h.m.serviceViews()
		evaluate(fmt.Sprintf("document.body.style.background='rgb(%d,%d,%d)'", rgb[0], rgb[1], rgb[2]))
		updatedFrame(rgb[0], rgb[1], rgb[2])
	}

	if s.hasWindow() {
		_, afterView, err := s.window(h.ctx)
		if err != nil || afterView != beforeView {
			t.Fatalf("view capture changed native window: before=%+v after=%+v error=%v", beforeView, afterView, err)
		}
	}
	s.ev.Lock()
	s.viewUntil = time.Now().Add(-time.Second)
	s.ev.Unlock()
	// The frame can arrive while the background reaper still owns s.mu. Wait
	// for that service pass before checking expiry; serviceViews uses TryLock.
	s.mu.Lock()
	s.serviceView(h.ctx)
	s.mu.Unlock()
	s.ev.Lock()
	active := s.viewActive
	s.ev.Unlock()
	if active {
		t.Fatal("stale watcher retained capture")
	}
	// On a real restart this page is reopened; field/upload loss must be reported.
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cp.receipt(h.m.now(), Receipt{Tool: "browser_runner_act", Action: "fill", Label: "Full name", URL: safeURL(s.currentHref()), Outcome: "ok"})
	s.cp.receipt(h.m.now(), Receipt{Tool: "browser_runner_act", Action: "upload", Label: "Resume", URL: safeURL(s.currentHref()), Outcome: "ok"})
	s.cp.Uploads = append(s.cp.Uploads, Upload{Field: "Resume", File: "resume.txt", Status: "attached", At: stamp(h.m.now())})
	s.cp.State = StateNeedsUser
	s.cp.NeedsUser = "synthetic sign-in"
	s.shutdownBrowser(true)
	if e := s.flush(); e != nil {
		t.Fatal(e)
	}
	if e := s.ensureLive(h.ctx); e != nil {
		t.Fatal(e)
	}
	if s.cp.Reentry == nil || len(s.cp.Reentry.Fields) < 2 {
		t.Fatal("lost fields/uploads not reported after restart", s.cp.Reentry)
	}
}

func TestWaitDeadlineIncludesQueuedSession(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	m := New()
	defer m.Close()
	s := &session{m: m, cp: &Checkpoint{SessionID: "busy", State: StateActive}}
	m.sessions["busy"] = s
	s.mu.Lock()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	started := time.Now()
	result, e := m.Call(ctx, "browser_runner_wait", map[string]any{"session_id": "busy", "until": "user_done"}, protocol.Policy{})
	s.mu.Unlock()
	if e != nil || result.(map[string]any)["state"] != "timeout" || time.Since(started) > 500*time.Millisecond {
		t.Fatal("queued wait ignored deadline", result, e)
	}
}
