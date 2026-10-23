package browserrunner

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// stepsATS is a PageUp-style application: every page posts to the same URL,
// a sign-in on an identity host comes first, a page can come back with an
// error, and the last page has the one final submit.
type stepsATS struct {
	mu    sync.Mutex
	posts map[string]int
}

func (a *stepsATS) count(k string) int { a.mu.Lock(); defer a.mu.Unlock(); return a.posts[k] }

func (a *stepsATS) handler() http.Handler {
	page := func(w http.ResponseWriter, body string) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, "<!doctype html><html><head><title>Acme Careers</title></head><body><h1>Acme Logistics</h1>"+body+"</body></html>")
	}
	step := func(w http.ResponseWriter, n int, errText string) {
		switch n {
		case 1:
			page(w, `<h2>Personal details</h2><form method="post" action="/apply/form"><input type="hidden" name="step" value="1">
<label>Full name <input name="fullname"></label><label>Phone <input name="phone"></label><button type="submit">Continue</button></form>`)
		case 2:
			page(w, `<h2>Eligibility</h2>`+errText+`<form method="post" action="/apply/form"><input type="hidden" name="step" value="2">
<fieldset><legend>Work rights</legend><label><input type="radio" name="rights" value="yes"> Resident</label><label><input type="radio" name="rights" value="no"> Visa</label></fieldset>
<button type="submit">Save and continue</button></form>`)
		case 3:
			page(w, `<h2>Review</h2><form method="post" action="/apply/form"><input type="hidden" name="step" value="3">
<label><input type="checkbox" name="declare" value="1"> I declare this is true</label><button type="submit">Submit application</button></form>`)
		default:
			page(w, `<h2>Thank you</h2><p>Application reference ACME-77.</p>`)
		}
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/login", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			a.mu.Lock()
			a.posts["login"]++
			a.mu.Unlock()
			http.Redirect(w, r, "/apply/form", http.StatusSeeOther)
			return
		}
		page(w, `<h2>Sign in to continue your application</h2><form method="post" action="/login"><label>Email address <input name="email" type="email"></label><button type="submit">Continue</button></form>`)
	})
	mux.HandleFunc("/apply/form", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			step(w, 1, "")
			return
		}
		_ = r.ParseForm()
		s := r.FormValue("step")
		a.mu.Lock()
		a.posts["step"+s]++
		a.mu.Unlock()
		switch s {
		case "1":
			step(w, 2, "")
		case "2":
			if r.FormValue("rights") == "" {
				step(w, 2, `<p role="alert">Please answer Work rights.</p>`)
				return
			}
			step(w, 3, "")
		case "3":
			step(w, 4, "")
		}
	})
	// A final submit that the page itself stops: nothing is sent until the
	// declaration is ticked.
	mux.HandleFunc("/guarded", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			a.mu.Lock()
			a.posts["guarded"]++
			a.mu.Unlock()
			page(w, `<h2>Sent</h2><p>Reference G-1.</p>`)
			return
		}
		page(w, `<h2>Declaration</h2><form method="post" action="/guarded" onsubmit="if (!this.declare.checked) { document.getElementById('err').hidden = false; return false; }">
<p id="err" hidden>Tick the declaration first.</p><label><input type="checkbox" name="declare" value="1"> I declare this is true</label><button type="submit">Submit application</button></form>`)
	})
	return mux
}

func stepsStart(t *testing.T, path string) (*harness, *stepsATS, func(map[string]any) map[string]any, func() (any, map[string]any), string) {
	t.Helper()
	h, _, _, _ := newHarness(t)
	ats := &stepsATS{posts: map[string]int{}}
	srv := httptest.NewServer(ats.handler())
	t.Cleanup(srv.Close)
	h.call("browser_runner_start", map[string]any{"task_id": "steps", "allowed_origins": []any{srv.URL}, "start_url": srv.URL + path})
	act := func(args map[string]any) map[string]any {
		return h.call("browser_runner_act", merge(map[string]any{"session_id": "steps"}, args))
	}
	fresh := func() (any, map[string]any) {
		s := h.call("browser_runner_snapshot", map[string]any{"session_id": "steps"})
		return s["snapshot_id"], s
	}
	return h, ats, act, fresh, srv.URL
}

func effectOf(t *testing.T, out map[string]any) map[string]any {
	t.Helper()
	e, ok := out["effect"].(map[string]any)
	if !ok {
		t.Fatalf("no effect in result: %v", out)
	}
	return e
}

// Signing in is repeated whenever a session expires (Jenny's Linfox draft
// hit SUBMIT_ALREADY_RECORDED on the identity page). It needs no submit key
// and is never recorded as a one-time submit.
func TestE2ESignInStepsCanBeRepeated(t *testing.T) {
	h, ats, act, fresh, base := stepsStart(t, "/login")
	sid, snap := fresh()
	act(map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "textbox", "email"), "action": "fill", "value": "jenny@example.test"})
	out := act(map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "button", "continue"), "action": "click"})
	if out["sign_in_step"] == nil || out["effect"] != nil || !strings.Contains(fmt.Sprint(out["url"]), "/apply/form") {
		t.Fatalf("sign-in click: %v", out)
	}
	// The session expired: sign in again, even when the caller marks it as a
	// submit with a key.
	act(map[string]any{"action": "navigate", "url": base + "/login"})
	sid, snap = fresh()
	act(map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "textbox", "email"), "action": "fill", "value": "jenny@example.test"})
	again := act(map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "button", "continue"), "action": "click", "effect": "submit", "idempotency_key": "jenny-login-2"})
	if again["sign_in_step"] == nil || again["effect"] != nil {
		t.Fatalf("second sign-in: %v", again)
	}
	if ats.count("login") != 2 {
		t.Fatalf("server saw %d sign-ins", ats.count("login"))
	}
	if st := h.call("browser_runner_status", map[string]any{"session_id": "steps"}); fmt.Sprint(st["submit_effects"]) != "[]" && st["submit_effects"] != nil {
		t.Fatalf("sign-in recorded as a submit: %v", st["submit_effects"])
	}
}

// Each page of a long form still needs effect=submit, but settles itself when
// the next page opens; a page that comes back with an error does not block
// and can be sent again; the final submit is still sent once and confirmed
// by the caller.
func TestE2EFormStepsSettleThemselvesAndFinalStaysOnce(t *testing.T) {
	h, ats, act, fresh, base := stepsStart(t, "/apply/form")

	sid, snap := fresh()
	act(map[string]any{"snapshot_id": sid, "action": "fill_form", "fields": []any{
		map[string]any{"ref": ref(t, snap, "textbox", "full name"), "action": "fill", "value": "Jenny Example"},
		map[string]any{"ref": ref(t, snap, "textbox", "phone"), "action": "fill", "value": "021 000 000"},
	}})
	cont := map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "button", "continue"), "action": "click"}
	h.fail("browser_runner_act", merge(map[string]any{"session_id": "steps"}, cont), "SUBMIT_EFFECT_REQUIRED")
	e := effectOf(t, act(merge(cont, map[string]any{"effect": "submit", "idempotency_key": "jenny-step-1"})))
	if e["status"] != EffectConfirmed || e["settled_by"] != "runner" || e["kind"] != "step" || e["evidence"] != "Eligibility" {
		t.Fatalf("step 1 did not settle itself: %v", e)
	}

	// Sent without an answer: the page comes back with an error. The step
	// stays unverified but does not hold up fixing and sending it again.
	sid, snap = fresh()
	e = effectOf(t, act(map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "button", "save and continue"), "action": "click", "effect": "submit", "idempotency_key": "jenny-step-2"}))
	if e["status"] != EffectUnverified || e["kind"] != "step" {
		t.Fatalf("step returned with an error: %v", e)
	}
	sid, snap = fresh()
	act(map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "radio", "resident"), "action": "check"})
	e = effectOf(t, act(map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "button", "save and continue"), "action": "click", "effect": "submit", "idempotency_key": "jenny-step-2b"}))
	if e["status"] != EffectConfirmed || e["evidence"] != "Review" {
		t.Fatalf("fixed step: %v", e)
	}

	// The final submit: once, confirmed by the caller.
	sid, snap = fresh()
	act(map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "checkbox", "declare"), "action": "check"})
	final := map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "button", "submit application"), "action": "click", "effect": "submit", "idempotency_key": "jenny-final"}
	e = effectOf(t, act(final))
	if e["status"] != EffectUnverified || e["kind"] != nil || e["settled_by"] != nil {
		t.Fatalf("final submit settled itself: %v", e)
	}
	h.call("browser_runner_confirm", map[string]any{"session_id": "steps", "idempotency_key": "jenny-final", "outcome": "confirmed", "evidence": "Application reference ACME-77"})
	if ats.count("step3") != 1 {
		t.Fatalf("final submit sent %d times", ats.count("step3"))
	}

	// A step can be saved again (a resumed draft), at most three times; the
	// final submit never under a new key.
	for i := 0; i < 2; i++ {
		act(map[string]any{"action": "navigate", "url": base + "/apply/form"})
		sid, snap = fresh()
		act(map[string]any{"snapshot_id": sid, "action": "fill_form", "fields": []any{map[string]any{"ref": ref(t, snap, "textbox", "full name"), "action": "fill", "value": "Jenny Example"}}})
		e = effectOf(t, act(map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "button", "continue"), "action": "click", "effect": "submit", "idempotency_key": fmt.Sprintf("jenny-step-1-again-%d", i)}))
		if e["status"] != EffectConfirmed {
			t.Fatalf("re-saving step 1 (%d): %v", i, e)
		}
	}
	act(map[string]any{"action": "navigate", "url": base + "/apply/form"})
	sid, snap = fresh()
	h.fail("browser_runner_act", map[string]any{"session_id": "steps", "snapshot_id": sid, "ref": ref(t, snap, "button", "continue"), "action": "click", "effect": "submit", "idempotency_key": "jenny-step-1-fourth"}, "already sent 3 times")
	if ats.count("step1") != 3 || ats.count("step3") != 1 {
		t.Fatalf("server saw step1=%d step3=%d", ats.count("step1"), ats.count("step3"))
	}
}

// A submit click the page stops before anything leaves it (client-side
// validation) sent nothing; the same key is clicked again once the page
// allows it, and it is sent once.
func TestE2ESubmitThatSendsNothingCanBeClickedAgain(t *testing.T) {
	_, ats, act, fresh, _ := stepsStart(t, "/guarded")
	sid, snap := fresh()
	submit := map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "button", "submit application"), "action": "click", "effect": "submit", "idempotency_key": "guarded-1"}
	out := act(submit)
	e := effectOf(t, out)
	if e["status"] != EffectUnverified || e["nothing_sent"] != true || !strings.Contains(fmt.Sprint(out["next_action"]), "Nothing has left the page") {
		t.Fatalf("blocked submit: %v", out)
	}
	sid, snap = fresh()
	act(map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "checkbox", "declare"), "action": "check"})
	out = act(merge(submit, map[string]any{"snapshot_id": sid, "ref": ref(t, snap, "button", "submit application")}))
	e = effectOf(t, out)
	if out["replayed"] != nil || e["status"] != EffectUnverified || e["nothing_sent"] != nil || ats.count("guarded") != 1 {
		t.Fatalf("submit after fixing: %v (server saw %d)", out, ats.count("guarded"))
	}
	// Now it was sent: the same key is never sent again.
	if again := act(submit); again["replayed"] != true || ats.count("guarded") != 1 {
		t.Fatalf("resend after it was sent: %v (server saw %d)", again, ats.count("guarded"))
	}
}
