package browserrunner

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

// wizardATS is a classic multi-page application: an "Apply" button that only
// reveals the form, a POST "Next" step, then the final POST submit. Every step
// that may send data needs effect=submit, and each must remain possible.
type wizardATS struct {
	mu    sync.Mutex
	hits  map[string]int
	email string
}

func (w *wizardATS) count(path string) int {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.hits[path]
}

func (w *wizardATS) handler() http.Handler {
	mux := http.NewServeMux()
	hit := func(r *http.Request) {
		w.mu.Lock()
		w.hits[r.URL.Path]++
		w.mu.Unlock()
	}
	page := func(rw http.ResponseWriter, body string) {
		rw.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(rw, "<!doctype html><html><body>"+body+"</body></html>")
	}
	mux.HandleFunc("/job", func(rw http.ResponseWriter, r *http.Request) {
		page(rw, `<h1>Site Reliability Engineer</h1>
<button id="open" type="button">Apply</button>
<section id="apply" hidden><h2>Your details</h2>
<form action="/step2" method="post"><label>Legal name <input name="name"></label>
<button type="submit">Next</button></form></section>
<script>document.getElementById("open").onclick = () => { document.getElementById("apply").hidden = false; };</script>`)
	})
	mux.HandleFunc("/step2", func(rw http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(rw, "method", 405)
			return
		}
		hit(r)
		page(rw, `<h2>Contact details</h2><form action="/submit" method="post">
<label>Email <input name="email" type="email"></label>
<button type="submit">Submit application</button></form>`)
	})
	mux.HandleFunc("/submit", func(rw http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(rw, "method", 405)
			return
		}
		hit(r)
		_ = r.ParseForm()
		w.mu.Lock()
		w.email = r.FormValue("email")
		n := w.hits["/submit"]
		w.mu.Unlock()
		page(rw, fmt.Sprintf(`<h2>Application received</h2><p>Reference W-%d</p>`, n))
	})
	return mux
}

func TestE2EMultiStepPostWizardSubmitsEachStepOnce(t *testing.T) {
	h, _, _, _ := newHarness(t)
	ats := &wizardATS{hits: map[string]int{}}
	srv := httptest.NewServer(ats.handler())
	t.Cleanup(srv.Close)
	act := func(args map[string]any) map[string]any {
		return h.call("browser_runner_act", merge(map[string]any{"session_id": "wizard"}, args))
	}
	fresh := func() (any, map[string]any) {
		s := h.call("browser_runner_snapshot", map[string]any{"session_id": "wizard"})
		return s["snapshot_id"], s
	}
	confirm := func(key, evidence string) {
		c := h.call("browser_runner_confirm", map[string]any{"session_id": "wizard", "idempotency_key": key, "outcome": "confirmed", "evidence": evidence})
		if c["effect"].(map[string]any)["status"] != EffectConfirmed {
			t.Fatalf("confirm %s: %v", key, c)
		}
	}

	h.call("browser_runner_start", map[string]any{"task_id": "wizard", "allowed_origins": []any{srv.URL}, "start_url": srv.URL + "/job"})

	// 1. "Apply" is a submit-like label on a plain button: it needs a submit
	// key of its own, and must not use up the final submit.
	sid, snap := fresh()
	open := map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "button", "apply"), "action": "click"}
	h.fail("browser_runner_act", merge(map[string]any{"session_id": "wizard"}, open), "SUBMIT_EFFECT_REQUIRED")
	act(merge(open, map[string]any{"effect": "submit", "idempotency_key": "wizard-open"}))
	confirm("wizard-open", "Legal name")

	// 2. A POST "Next" sends data: effect=submit with its own key.
	sid, snap = fresh()
	act(map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "textbox", "legal name"), "action": "fill", "value": "Sam Example"})
	next := map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "button", "next"), "action": "click"}
	h.fail("browser_runner_act", merge(map[string]any{"session_id": "wizard"}, merge(next, map[string]any{"effect": "navigation"})), "SUBMIT_EFFECT_REQUIRED")
	act(merge(next, map[string]any{"effect": "submit", "idempotency_key": "wizard-step1"}))
	// The next step waits until this one is settled.
	sid, snap = fresh()
	final := map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "button", "submit application"), "action": "click", "effect": "submit", "idempotency_key": "wizard-final"}
	act(map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "textbox", "email"), "action": "fill", "value": "sam@example.test"})
	h.fail("browser_runner_act", merge(map[string]any{"session_id": "wizard"}, final), "UNRESOLVED_EFFECT")
	confirm("wizard-step1", "Contact details")

	// 3. The final submit is still allowed after the earlier steps.
	res := act(final)
	if res["effect"].(map[string]any)["status"] != EffectUnverified {
		t.Fatalf("final submit: %v", res)
	}
	confirm("wizard-final", "Reference W-1")
	if ats.count("/step2") != 1 || ats.count("/submit") != 1 || ats.email != "sam@example.test" {
		t.Fatalf("server saw step2=%d submit=%d email=%q", ats.count("/step2"), ats.count("/submit"), ats.email)
	}

	// 4. The same final submit under a new key is refused, even from a fresh
	// copy of the same form.
	act(map[string]any{"action": "navigate", "url": srv.URL + "/job"})
	sid, snap = fresh()
	h.fail("browser_runner_act", map[string]any{"session_id": "wizard", "snapshot_id": sid, "ref": ref(t, snap, "button", "apply"), "action": "click", "effect": "submit", "idempotency_key": "wizard-open-again"}, "SUBMIT_ALREADY_RECORDED")
	st := h.call("browser_runner_status", map[string]any{"session_id": "wizard"})
	if fmt.Sprint(st["effects"]) == "" {
		t.Fatalf("status lost effects: %v", st)
	}
	if ats.count("/step2") != 1 || ats.count("/submit") != 1 {
		t.Fatalf("a step was sent twice: step2=%d submit=%d", ats.count("/step2"), ats.count("/submit"))
	}
}
