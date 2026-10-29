package browserrunner

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// A token the synthetic CAPTCHA "issues" once the user has solved it. The
// Runner must never return it, whatever the page does with it.
const captchaToken = "P1_SYNTHETIC-CAPTCHA-TOKEN-8f2c"

// captchaSite is an employer form protected the way Lever protects its forms:
// an invisible hCaptcha that opens a challenge when Submit is pressed, keeps
// its frames mounted after the user solves it, and submits the form itself
// from its callback.
type captchaSite struct {
	mu      sync.Mutex
	submits int
}

func (c *captchaSite) count() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.submits
}

func (c *captchaSite) handler(vendor string) http.Handler {
	mux := http.NewServeMux()
	frame := func(part string) string {
		return vendor + "/hcaptcha/v1/static/hcaptcha.html#frame=" + part + "&id=0x1&sitekey=10000000-ffff"
	}
	parked := "visibility:hidden;position:absolute;top:-10000px;left:20px;width:400px"
	page := func(w http.ResponseWriter, body string) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, "<!doctype html><html><head><title>Acme Careers</title></head><body>"+body+"</body></html>")
	}
	mux.HandleFunc("/apply", func(w http.ResponseWriter, r *http.Request) {
		page(w, `<h1>Apply: Software Engineer</h1>
<form id="app" method="post" action="/submit">
<label>Full name <input name="name" required></label>
<div class="h-captcha" data-sitekey="10000000-ffff" data-size="invisible"><iframe src="`+frame("checkbox-invisible")+`" style="display:none" tabindex="-1"></iframe><textarea id="hc-response" name="h-captcha-response" style="display:none"></textarea></div>
<button id="send" onclick="event.preventDefault(); document.getElementById('hc-challenge').style.cssText='visibility:visible;position:absolute;top:140px;left:20px;width:400px'">Submit application</button>
</form>
<div id="hc-challenge" style="`+parked+`"><iframe src="`+frame("challenge")+`" style="width:400px;height:600px;border:0"></iframe></div>
<!-- Test stand-in for the human solving the challenge in the visible window:
     the vendor closes its popup, stores the token and submits the form. -->
<button type="button" onclick="document.getElementById('hc-challenge').style.cssText='`+parked+`'; document.getElementById('hc-response').value='`+captchaToken+`'; HTMLFormElement.prototype.submit.call(document.getElementById('app'))">Simulate user completed verification</button>`)
	})
	mux.HandleFunc("/apply-checkbox", func(w http.ResponseWriter, r *http.Request) {
		// Already solved: the checkbox frame shows a tick, carries the token,
		// and the closed challenge frame stays mounted.
		page(w, `<h1>Apply</h1><form method="post" action="/submit"><label>Full name <input name="name"></label>
<div class="h-captcha" data-sitekey="10000000-ffff"><iframe src="`+frame("checkbox")+`" data-hcaptcha-response="`+captchaToken+`" style="width:303px;height:78px;border:0"></iframe><textarea name="h-captcha-response" style="display:none">`+captchaToken+`</textarea></div>
<button>Submit application</button></form><div style="`+parked+`"><iframe src="`+frame("challenge")+`" style="width:400px;height:600px;border:0"></iframe></div>`)
	})
	mux.HandleFunc("/submit", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method", http.StatusMethodNotAllowed)
			return
		}
		_ = r.ParseForm()
		if r.FormValue("h-captcha-response") != captchaToken {
			page(w, `<h1>Please complete the verification</h1>`)
			return
		}
		c.mu.Lock()
		c.submits++
		c.mu.Unlock()
		page(w, `<h1>Application received</h1><p>Reference ACME-7731</p>`)
	})
	return mux
}

func captchaHarness(t *testing.T) (*harness, *captchaSite, string) {
	t.Helper()
	h, _, _, _ := newHarness(t)
	vendor := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "<!doctype html><html><body>vendor frame</body></html>")
	}))
	t.Cleanup(vendor.Close)
	site := &captchaSite{}
	srv := httptest.NewServer(site.handler(vendor.URL))
	t.Cleanup(srv.Close)
	return h, site, srv.URL
}

func captchaKinds(snap map[string]any, key string) []string {
	var kinds []string
	list, _ := snap[key].([]any)
	for _, raw := range list {
		if m, ok := raw.(map[string]any); ok {
			kinds = append(kinds, fmt.Sprint(m["kind"]))
		}
	}
	return kinds
}

func noToken(t *testing.T, what string, v any) {
	t.Helper()
	b, _ := json.Marshal(v)
	if strings.Contains(string(b), captchaToken) {
		t.Fatalf("%s returned the CAPTCHA token", what)
	}
}

// #276: hidden and retained CAPTCHA frames must not hold the task at
// needs_user; an open challenge must, and the task continues by itself once
// the user has solved it.
func TestE2ECaptchaOnlyAnOpenChallengeNeedsTheUser(t *testing.T) {
	h, site, base := captchaHarness(t)
	headed, _ := demoMode()
	h.call("browser_runner_start", map[string]any{"task_id": "lever", "allowed_origins": []any{base}, "start_url": base + "/apply"})

	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "lever"})
	if snap["session_state"] != StateActive || len(captchaKinds(snap, "blockers")) != 0 {
		t.Fatalf("idle invisible hCaptcha held the task: state=%v blockers=%v", snap["session_state"], snap["blockers"])
	}
	if parts, _ := snap["captcha"].([]any); len(parts) == 0 {
		t.Fatalf("CAPTCHA parts not reported: %v", snap)
	}
	// Only a windowless browser warns early: a hidden window is shown in
	// place later, keeping what was entered.
	if !headed && !hasDisplay() && !strings.Contains(strings.Join(captchaKinds(snap, "attention"), ","), "captcha_headless") {
		t.Fatalf("hidden browser on a CAPTCHA page gave no early warning: %v", snap["attention"])
	}
	sid := snap["snapshot_id"]
	h.call("browser_runner_act", map[string]any{"session_id": "lever", "snapshot_id": sid, "ref": ref(t, snap, "textbox", "full name"), "action": "fill", "value": "Sam Example"})

	// Submit opens the challenge instead of sending the form.
	sent := h.call("browser_runner_act", map[string]any{"session_id": "lever", "snapshot_id": sid, "ref": ref(t, snap, "button", "submit application"), "action": "click", "effect": "submit", "idempotency_key": "lever-apply"})
	if sent["effect"].(map[string]any)["status"] != EffectUnverified || site.count() != 0 {
		t.Fatalf("submit: %v count=%d", sent["effect"], site.count())
	}
	snap = h.call("browser_runner_snapshot", map[string]any{"session_id": "lever"})
	needs := fmt.Sprint(snap["needs_user"])
	if snap["session_state"] != StateNeedsUser || strings.Join(captchaKinds(snap, "blockers"), ",") != "captcha" || !strings.Contains(needs, "never reads") {
		t.Fatalf("open challenge not handed to the user: state=%v blockers=%v needs=%q", snap["session_state"], snap["blockers"], needs)
	}
	if !strings.Contains(needs, "browser_runner_wait") {
		t.Fatalf("handoff must guide the caller to wait: %q", needs)
	}
	// The submit is still unverified, so next_action is about settling it;
	// the checkpoint must still say the user is needed.
	if st := h.call("browser_runner_status", map[string]any{"session_id": "lever"}); st["state"] != StateNeedsUser || st["needs_user"] == nil {
		t.Fatalf("status during the challenge: %v / %v", st["state"], st["needs_user"])
	}

	// The user solves it; the site's own callback submits the form.
	h.call("browser_runner_act", map[string]any{"session_id": "lever", "snapshot_id": snap["snapshot_id"], "ref": ref(t, snap, "button", "simulate user"), "action": "click", "effect": "navigation"})
	snap = h.call("browser_runner_snapshot", map[string]any{"session_id": "lever"})
	if snap["session_state"] != StateActive || len(captchaKinds(snap, "blockers")) != 0 || !strings.Contains(fmt.Sprint(snap["text"]), "ACME-7731") {
		t.Fatalf("task did not continue after the challenge closed: state=%v blockers=%v text=%v", snap["session_state"], snap["blockers"], snap["text"])
	}
	// The click sent nothing itself, but the challenge it opened did: the
	// same key is now answered from the checkpoint, never sent again.
	again := h.call("browser_runner_act", map[string]any{"session_id": "lever", "snapshot_id": sid, "ref": "e1", "action": "click", "effect": "submit", "idempotency_key": "lever-apply"})
	if again["replayed"] != true || site.count() != 1 {
		t.Fatalf("retry after the challenge sent the form: %v count=%d", again, site.count())
	}
	done := h.call("browser_runner_confirm", map[string]any{"session_id": "lever", "idempotency_key": "lever-apply", "outcome": "confirmed", "evidence": "ACME-7731"})
	if done["effect"].(map[string]any)["status"] != EffectConfirmed || site.count() != 1 {
		t.Fatalf("confirm: %v count=%d", done["effect"], site.count())
	}
	noToken(t, "snapshot", snap)
	noToken(t, "status", h.call("browser_runner_status", map[string]any{"session_id": "lever"}))
}

// A solved checkbox keeps its frame, its tick and its token on the page. That
// is worth a note before submitting, not a stop, and the token stays private.
func TestE2ECaptchaRetainedAfterCompletionDoesNotBlock(t *testing.T) {
	h, _, base := captchaHarness(t)
	h.call("browser_runner_start", map[string]any{"task_id": "solved", "allowed_origins": []any{base}, "start_url": base + "/apply-checkbox"})
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "solved"})
	if snap["session_state"] != StateActive || len(captchaKinds(snap, "blockers")) != 0 {
		t.Fatalf("retained checkbox held the task: %v %v", snap["session_state"], snap["blockers"])
	}
	if !strings.Contains(strings.Join(captchaKinds(snap, "attention"), ","), "captcha_widget") {
		t.Fatalf("shown checkbox not noted: %v", snap["attention"])
	}
	noToken(t, "snapshot", snap)
}

// A restart reopens the page empty. The task must say which fields to enter
// again instead of trusting its receipts, and stop saying so once they are.
func TestE2ERestartListsInputToEnterAgain(t *testing.T) {
	h, _, base, _ := newHarness(t)
	docs := h.policy.WorkspaceRoots[0]
	resume := writePDF(t, docs, "Sam-Resume.pdf")
	h.call("browser_runner_start", map[string]any{"task_id": "reentry", "allowed_origins": []any{base}, "start_url": base + "/apply/1"})
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "reentry"})
	sid := snap["snapshot_id"]
	h.call("browser_runner_act", map[string]any{"session_id": "reentry", "snapshot_id": sid, "ref": ref(t, snap, "textbox", "full name"), "action": "fill", "value": "Sam Example"})
	h.call("browser_runner_act", map[string]any{"session_id": "reentry", "snapshot_id": sid, "ref": ref(t, snap, "textbox", "email"), "action": "fill", "value": "sam@example.test"})
	h.call("browser_runner_act", map[string]any{"session_id": "reentry", "snapshot_id": sid, "ref": ref(t, snap, "combobox", "country"), "action": "select", "value": "New Zealand"})
	h.call("browser_runner_act", map[string]any{"session_id": "reentry", "snapshot_id": sid, "ref": ref(t, snap, "button", "next"), "action": "click", "effect": "navigation"})

	snap = h.call("browser_runner_snapshot", map[string]any{"session_id": "reentry"})
	sid = snap["snapshot_id"]
	h.call("browser_runner_act", map[string]any{"session_id": "reentry", "action": "upload", "snapshot_id": sid, "ref": ref(t, snap, "file", "resume"), "path": resume})
	h.call("browser_runner_act", map[string]any{"session_id": "reentry", "snapshot_id": sid, "ref": ref(t, snap, "textbox", "cover"), "action": "fill", "value": "I build reliable systems."})
	h.call("browser_runner_act", map[string]any{"session_id": "reentry", "snapshot_id": sid, "ref": ref(t, snap, "checkbox", "privacy"), "action": "check"})

	// The Agent restarts (as on Windows at 23:42 in #276).
	h.m.Close()
	h.m = New()
	t.Cleanup(h.m.Close)
	h.call("browser_runner_start", map[string]any{"task_id": "reentry", "allowed_origins": []any{base}})
	st := h.call("browser_runner_status", map[string]any{"session_id": "reentry"})
	if !strings.Contains(fmt.Sprint(st["next_action"]), "restarted") || st["reentry_needed"] == nil {
		t.Fatalf("status after restart: next=%v reentry=%v", st["next_action"], st["reentry_needed"])
	}

	fields := func(snap map[string]any) string {
		r, _ := snap["reentry_needed"].(map[string]any)
		if r == nil {
			return ""
		}
		return fmt.Sprint(r["fields"])
	}
	snap = h.call("browser_runner_snapshot", map[string]any{"session_id": "reentry"})
	got := fields(snap)
	for _, want := range []string{"Cover letter", "privacy policy", "Resume (Sam-Resume.pdf)"} {
		if !strings.Contains(got, want) {
			t.Fatalf("reentry_needed misses %q: %s", want, got)
		}
	}
	// Input from the previous page was not lost by this restart.
	if strings.Contains(got, "Full name") || strings.Contains(got, "Country") {
		t.Fatalf("reentry_needed lists fields from an earlier page: %s", got)
	}

	sid = snap["snapshot_id"]
	h.call("browser_runner_act", map[string]any{"session_id": "reentry", "snapshot_id": sid, "ref": ref(t, snap, "textbox", "cover"), "action": "fill", "value": "I build reliable systems."})
	snap = h.call("browser_runner_snapshot", map[string]any{"session_id": "reentry"})
	if got := fields(snap); strings.Contains(got, "Cover letter") || !strings.Contains(got, "privacy policy") {
		t.Fatalf("reentry_needed after re-filling the cover letter: %s", got)
	}
	sid = snap["snapshot_id"]
	h.call("browser_runner_act", map[string]any{"session_id": "reentry", "action": "upload", "snapshot_id": sid, "ref": ref(t, snap, "file", "resume"), "path": resume})
	h.call("browser_runner_act", map[string]any{"session_id": "reentry", "snapshot_id": sid, "ref": ref(t, snap, "checkbox", "privacy"), "action": "check"})
	snap = h.call("browser_runner_snapshot", map[string]any{"session_id": "reentry"})
	if snap["reentry_needed"] != nil {
		t.Fatalf("reentry_needed kept after everything was entered again: %v", snap["reentry_needed"])
	}
	if st := h.call("browser_runner_status", map[string]any{"session_id": "reentry"}); st["reentry_needed"] != nil || strings.Contains(fmt.Sprint(st["next_action"]), "restarted") {
		t.Fatalf("status still asks for re-entry: %v", st)
	}
}
