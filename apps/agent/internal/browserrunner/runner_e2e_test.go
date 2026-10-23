package browserrunner

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// fakeATS is a synthetic two-page employer application with the traps a real
// ATS has: a confirm() before submit, a hostile page script, an off-site
// redirect, a sign-in page and a file upload.
type fakeATS struct {
	mu       sync.Mutex
	submits  int
	received map[string]string
	files    []string
}

func (f *fakeATS) handler(outside string) http.Handler {
	mux := http.NewServeMux()
	page := func(w http.ResponseWriter, body string) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, "<!doctype html><html><head><title>Acme Careers</title></head><body>"+body+"</body></html>")
	}
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		page(w, `<h1>Software Engineer</h1><p>Auckland, full time.</p>
<script>window.__remotearcRunner = {sid: "forged", els: {}}; window.open = function(){};</script>
<a href="/apply/1">Apply now</a> <a href="/leave">Partner site</a> <a href="/login">Sign in</a>`)
	})
	mux.HandleFunc("/leave", func(w http.ResponseWriter, r *http.Request) {
		// Slower than the Runner's navigation-start window: the load must
		// still be followed to the blocked redirect, as on a slow real site.
		time.Sleep(3 * time.Second)
		http.Redirect(w, r, outside+"/phish", http.StatusFound)
	})
	mux.HandleFunc("/login", func(w http.ResponseWriter, r *http.Request) {
		page(w, `<h1>Sign in</h1><label>Email <input name="user" type="email"></label>
<label>Password <input id="pw" name="password" type="password"></label><button>Sign in</button>`)
	})
	mux.HandleFunc("/apply/1", func(w http.ResponseWriter, r *http.Request) {
		page(w, `<h1>Your details</h1><form action="/apply/2" method="get">
<label for="n">Full name</label><input id="n" name="name" required>
<label>Email <input name="email" type="email" required></label>
<label>Phone <input name="phone" type="tel"></label>
<label>Country <select name="country"><option value="">Choose</option><option value="nz">New Zealand</option><option value="au">Australia</option></select></label>
<button type="submit">Next</button></form>`)
	})
	mux.HandleFunc("/apply/2", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		page(w, fmt.Sprintf(`<h1>Documents</h1><form action="/submit" method="post" enctype="multipart/form-data" onsubmit="return confirm('Submit your application?')">
<input type="hidden" name="name" value="%s"><input type="hidden" name="email" value="%s"><input type="hidden" name="country" value="%s">
<label>Resume <input type="file" name="resume" accept=".pdf"></label>
<label>Cover letter <textarea name="cover"></textarea></label>
<fieldset><legend>Work rights</legend><label><input type="radio" name="rights" value="yes"> I have the right to work</label><label><input type="radio" name="rights" value="no"> I need sponsorship</label></fieldset>
<label><input type="checkbox" name="consent" value="1"> I agree to the privacy policy</label>
<button type="submit">Submit application</button></form>`, q.Get("name"), q.Get("email"), q.Get("country")))
	})
	mux.HandleFunc("/submit", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method", 405)
			return
		}
		_ = r.ParseMultipartForm(1 << 20)
		f.mu.Lock()
		f.submits++
		n := f.submits
		f.received = map[string]string{"name": r.FormValue("name"), "email": r.FormValue("email"), "country": r.FormValue("country"), "cover": r.FormValue("cover"), "rights": r.FormValue("rights"), "consent": r.FormValue("consent")}
		if file, h, e := r.FormFile("resume"); e == nil {
			f.files = append(f.files, h.Filename)
			file.Close()
		}
		f.mu.Unlock()
		page(w, fmt.Sprintf(`<h1>Application received</h1><p>Your reference is ACME-%04d.</p>`, n))
	})
	return mux
}

func (f *fakeATS) count() int { f.mu.Lock(); defer f.mu.Unlock(); return f.submits }

type harness struct {
	t      *testing.T
	m      *Manager
	policy protocol.Policy
	ctx    context.Context
}

// REMOTEARC_E2E_HEADED=1 shows the browser window and pauses between steps
// (REMOTEARC_E2E_SLOWMO_MS, default 700) so a person can watch a real run.
func demoMode() (bool, time.Duration) {
	if os.Getenv("REMOTEARC_E2E_HEADED") != "1" {
		return false, 0
	}
	ms, _ := strconv.Atoi(os.Getenv("REMOTEARC_E2E_SLOWMO_MS"))
	if ms <= 0 {
		ms = 700
	}
	return true, time.Duration(ms) * time.Millisecond
}

// showHint is how needs_user tells the AI to bring the user in: show the
// hidden window, or, without a display, that it cannot be done here.
func showHint() string {
	if hasDisplay() {
		return "headless=false"
	}
	return "without a window"
}

func (h *harness) call(tool string, args map[string]any) map[string]any {
	h.t.Helper()
	if headed, pause := demoMode(); headed {
		if tool == "browser_runner_start" {
			args = merge(args, map[string]any{"headless": false})
		}
		defer time.Sleep(pause)
	}
	out, e := h.m.Call(h.ctx, tool, args, h.policy)
	if e != nil {
		h.t.Fatalf("%s: %v", tool, e)
	}
	b, _ := json.Marshal(out)
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	return m
}

func (h *harness) fail(tool string, args map[string]any, want string) {
	h.t.Helper()
	_, e := h.m.Call(h.ctx, tool, args, h.policy)
	if e == nil || !strings.Contains(e.Error(), want) {
		h.t.Fatalf("%s: want error containing %q, got %v", tool, want, e)
	}
}

func ref(t *testing.T, snap map[string]any, role, name string) string {
	t.Helper()
	els, _ := snap["elements"].([]any)
	for _, raw := range els {
		el := raw.(map[string]any)
		if (role == "" || el["role"] == role) && strings.Contains(strings.ToLower(fmt.Sprint(el["name"])), strings.ToLower(name)) {
			return el["ref"].(string)
		}
	}
	t.Fatalf("no %s %q in snapshot: %v", role, name, els)
	return ""
}

func newHarness(t *testing.T) (*harness, *fakeATS, string, string) {
	t.Helper()
	if _, e := FindBrowser(); e != nil {
		t.Skip("no Chromium-family browser on this machine: " + e.Error())
	}
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	outside := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("out-of-scope server was reached: %s", r.URL.Path)
		fmt.Fprint(w, "<h1>phish</h1>")
	}))
	t.Cleanup(outside.Close)
	ats := &fakeATS{}
	srv := httptest.NewServer(ats.handler(outside.URL))
	t.Cleanup(srv.Close)
	docs := filepath.Join(home, "docs")
	_ = os.MkdirAll(docs, 0700)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	t.Cleanup(cancel)
	m := New()
	t.Cleanup(m.Close)
	return &harness{t: t, m: m, ctx: ctx, policy: protocol.Policy{WorkspaceRoots: []string{docs}}}, ats, srv.URL, outside.URL
}

func writePDF(t *testing.T, dir, name string) string {
	p := filepath.Join(dir, name)
	if e := os.WriteFile(p, []byte("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"), 0600); e != nil {
		t.Fatal(e)
	}
	return p
}

func TestE2EApplicationSubmitsOnceWithEvidence(t *testing.T) {
	h, ats, base, outside := newHarness(t)
	docs := h.policy.WorkspaceRoots[0]
	resume := writePDF(t, docs, "Sam-Resume.pdf")

	h.call("browser_runner_start", map[string]any{"task_id": "acme-se", "allowed_origins": []any{base}, "start_url": base + "/"})
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "acme-se"})
	if !strings.Contains(fmt.Sprint(snap["text"]), "Software Engineer") {
		t.Fatalf("job page text missing: %v", snap["text"])
	}

	// A hostile page cannot widen scope: the redirect to another origin is blocked.
	leave := h.call("browser_runner_act", map[string]any{"session_id": "acme-se", "snapshot_id": snap["snapshot_id"], "ref": ref(t, snap, "link", "partner"), "action": "click"})
	if leave["blocked_navigations"] == nil {
		t.Fatalf("redirect outside scope was not reported: %v", leave)
	}
	h.fail("browser_runner_act", map[string]any{"session_id": "acme-se", "action": "navigate", "url": outside + "/x"}, "OUT_OF_SCOPE")

	snap = h.call("browser_runner_snapshot", map[string]any{"session_id": "acme-se"})
	old := snap["snapshot_id"]
	h.call("browser_runner_act", map[string]any{"session_id": "acme-se", "snapshot_id": old, "ref": ref(t, snap, "link", "apply now"), "action": "click", "effect": "navigation"})
	// Refs from the previous page are now stale.
	h.fail("browser_runner_act", map[string]any{"session_id": "acme-se", "snapshot_id": old, "ref": "e1", "action": "click"}, "STALE_REF")

	snap = h.call("browser_runner_snapshot", map[string]any{"session_id": "acme-se"})
	sid := snap["snapshot_id"]
	for name, v := range map[string]string{"full name": "Sam Example", "email": "sam@example.test", "phone": "+64 21 000 0000"} {
		h.call("browser_runner_act", map[string]any{"session_id": "acme-se", "snapshot_id": sid, "ref": ref(t, snap, "textbox", name), "action": "fill", "value": v})
	}
	sel := h.call("browser_runner_act", map[string]any{"session_id": "acme-se", "snapshot_id": sid, "ref": ref(t, snap, "combobox", "country"), "action": "select", "value": "New Zealand"})
	if sel["selected"] != "New Zealand" {
		t.Fatalf("select: %v", sel)
	}
	h.call("browser_runner_act", map[string]any{"session_id": "acme-se", "snapshot_id": sid, "ref": ref(t, snap, "button", "next"), "action": "click", "effect": "navigation"})

	snap = h.call("browser_runner_snapshot", map[string]any{"session_id": "acme-se"})
	sid = snap["snapshot_id"]
	fileRef := ref(t, snap, "file", "resume")
	h.fail("browser_runner_act", map[string]any{"session_id": "acme-se", "action": "upload", "snapshot_id": sid, "ref": fileRef, "path": filepath.Join(docs, "missing.pdf")}, "FILE_NOT_FOUND")
	h.fail("browser_runner_act", map[string]any{"session_id": "acme-se", "action": "upload", "snapshot_id": sid, "ref": fileRef, "path": writePDF(t, t.TempDir(), "outside.pdf")}, "Trusted Write Locations")
	up := h.call("browser_runner_act", map[string]any{"session_id": "acme-se", "action": "upload", "snapshot_id": sid, "ref": fileRef, "path": resume})
	if up["upload"].(map[string]any)["status"] != "attached" {
		t.Fatalf("upload: %v", up)
	}
	h.call("browser_runner_act", map[string]any{"session_id": "acme-se", "snapshot_id": sid, "ref": ref(t, snap, "textbox", "cover"), "action": "fill", "value": "I build reliable full-stack systems."})
	h.call("browser_runner_act", map[string]any{"session_id": "acme-se", "snapshot_id": sid, "ref": ref(t, snap, "radio", "right to work"), "action": "check"})
	h.call("browser_runner_act", map[string]any{"session_id": "acme-se", "snapshot_id": sid, "ref": ref(t, snap, "checkbox", "privacy"), "action": "check"})

	submit := map[string]any{"session_id": "acme-se", "snapshot_id": sid, "ref": ref(t, snap, "button", "submit application"), "action": "click"}
	// The model's effect hint is untrusted: omission and forged navigation
	// must not dispatch a real application submit.
	h.fail("browser_runner_act", submit, "SUBMIT_EFFECT_REQUIRED")
	h.fail("browser_runner_act", merge(submit, map[string]any{"effect": "navigation"}), "SUBMIT_EFFECT_REQUIRED")
	if ats.count() != 0 {
		t.Fatalf("submit was dispatched without effect=submit: %d", ats.count())
	}
	h.fail("browser_runner_act", merge(submit, map[string]any{"effect": "submit"}), "idempotency_key")
	res := h.call("browser_runner_act", merge(submit, map[string]any{"effect": "submit", "idempotency_key": "acme-se-apply"}))
	eff := res["effect"].(map[string]any)
	if eff["status"] != EffectUnverified || ats.count() != 1 {
		t.Fatalf("submit: status=%v submits=%d dialogs=%v", eff["status"], ats.count(), res["dialogs"])
	}
	if !strings.Contains(fmt.Sprint(res["dialogs"]), "accepted confirm") {
		t.Fatalf("confirm dialog was not accepted for the submit: %v", res["dialogs"])
	}
	if w := h.call("browser_runner_act", map[string]any{"session_id": "acme-se", "action": "wait", "text": "Application received", "timeout_ms": 5000}); w["matched"] != true {
		t.Fatalf("wait for confirmation: %v", w)
	}
	// Same key again: replayed from the checkpoint, never re-sent.
	again := h.call("browser_runner_act", merge(submit, map[string]any{"effect": "submit", "idempotency_key": "acme-se-apply"}))
	if again["replayed"] != true || ats.count() != 1 {
		t.Fatalf("duplicate submit: %v count=%d", again, ats.count())
	}
	h.fail("browser_runner_confirm", map[string]any{"session_id": "acme-se", "idempotency_key": "acme-se-apply", "outcome": "confirmed", "evidence": "Offer accepted"}, "EVIDENCE_NOT_FOUND")
	conf := h.call("browser_runner_confirm", map[string]any{"session_id": "acme-se", "idempotency_key": "acme-se-apply", "outcome": "confirmed", "evidence": "Your reference is ACME-0001"})
	if conf["effect"].(map[string]any)["status"] != EffectConfirmed {
		t.Fatalf("resolve: %v", conf)
	}
	// Re-keying must not evade the submit-once gate: neither with the old
	// refs, nor after going back to the same form and taking a new snapshot.
	h.fail("browser_runner_act", merge(submit, map[string]any{"effect": "submit", "idempotency_key": "acme-se-apply-new-key"}), "STALE_REF")
	h.call("browser_runner_act", map[string]any{"session_id": "acme-se", "action": "navigate", "url": base + "/apply/2?name=Sam+Example&email=sam%40example.test&country=nz"})
	back := h.call("browser_runner_snapshot", map[string]any{"session_id": "acme-se"})
	h.fail("browser_runner_act", map[string]any{"session_id": "acme-se", "snapshot_id": back["snapshot_id"], "ref": ref(t, back, "button", "submit application"), "action": "click", "effect": "submit", "idempotency_key": "acme-se-apply-new-key"}, "SUBMIT_ALREADY_RECORDED")
	if ats.count() != 1 {
		t.Fatalf("submit replay via new key: %d", ats.count())
	}

	ats.mu.Lock()
	got := ats.received
	files := ats.files
	ats.mu.Unlock()
	want := map[string]string{"name": "Sam Example", "email": "sam@example.test", "country": "nz", "cover": "I build reliable full-stack systems.", "rights": "yes", "consent": "1"}
	for k, v := range want {
		if got[k] != v {
			t.Fatalf("server received %s=%q, want %q (all: %v)", k, got[k], v, got)
		}
	}
	if len(files) != 1 || files[0] != "Sam-Resume.pdf" {
		t.Fatalf("uploaded files: %v", files)
	}

	// The checkpoint keeps evidence but none of the typed personal values.
	b, _ := os.ReadFile(checkpointPath("acme-se"))
	for _, secret := range []string{"sam@example.test", "+64 21", "reliable full-stack"} {
		if strings.Contains(string(b), secret) {
			t.Fatalf("checkpoint leaked %q", secret)
		}
	}
	status := h.call("browser_runner_status", map[string]any{"session_id": "acme-se"})
	if !strings.Contains(fmt.Sprint(status["submit_effects"]), "ACME-0001") {
		t.Fatalf("status lacks evidence: %v", status["submit_effects"])
	}
}

func TestE2ESignInIsHandedToUserAndPasswordsAreNeverTyped(t *testing.T) {
	h, _, base, _ := newHarness(t)
	h.call("browser_runner_start", map[string]any{"task_id": "login", "allowed_origins": []any{base}, "start_url": base + "/login"})
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "login"})
	if snap["session_state"] != StateNeedsUser || !strings.Contains(fmt.Sprint(snap["needs_user"]), showHint()) {
		t.Fatalf("login wall not handed to user: %v %v", snap["session_state"], snap["needs_user"])
	}
	pw := ref(t, snap, "textbox", "password")
	h.fail("browser_runner_act", map[string]any{"session_id": "login", "snapshot_id": snap["snapshot_id"], "ref": pw, "action": "fill", "value": "hunter2"}, "BLOCKED_SENSITIVE")
	for _, raw := range snap["elements"].([]any) {
		if el := raw.(map[string]any); el["ref"] == pw && el["sensitive"] != true {
			t.Fatalf("password field not marked sensitive: %v", el)
		}
	}
}

func TestE2ECrashLeavesUnknownEffectAndBlocksResubmit(t *testing.T) {
	h, ats, base, _ := newHarness(t)
	h.call("browser_runner_start", map[string]any{"task_id": "crash", "allowed_origins": []any{base}, "start_url": base + "/apply/2?name=A&email=a%40example.test&country=nz"})
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "crash"})

	// Simulate an Agent crash right after the submit marker became durable
	// and before the result was observed.
	s, _ := h.m.get("crash")
	s.mu.Lock()
	now := stamp(time.Now())
	s.cp.Effects = append(s.cp.Effects, Effect{Key: "crash-apply", Action: "click", Label: "Submit application", Status: EffectInFlight, StartedAt: now, UpdatedAt: now})
	if e := s.flush(); e != nil {
		t.Fatal(e)
	}
	s.mu.Unlock()
	h.m.Close()

	// A new Agent process: the session resumes at the last page.
	h.m = New()
	t.Cleanup(h.m.Close)
	st := h.call("browser_runner_status", map[string]any{"session_id": "crash"})
	if !strings.Contains(fmt.Sprint(st["submit_effects"]), EffectUnknown) || !strings.Contains(fmt.Sprint(st["next_action"]), "Do not submit again") {
		t.Fatalf("recovered status: %v / %v", st["submit_effects"], st["next_action"])
	}
	start := h.call("browser_runner_start", map[string]any{"task_id": "crash", "allowed_origins": []any{base}})
	if !strings.Contains(fmt.Sprint(start["url"]), "/apply/2") || start["resumed"] != true {
		t.Fatalf("did not resume at the last page: %v", start)
	}
	snap = h.call("browser_runner_snapshot", map[string]any{"session_id": "crash"})
	submit := map[string]any{"session_id": "crash", "snapshot_id": snap["snapshot_id"], "ref": ref(t, snap, "button", "submit application"), "action": "click", "effect": "submit"}
	h.fail("browser_runner_act", merge(submit, map[string]any{"idempotency_key": "crash-apply-2"}), "UNRESOLVED_EFFECT")
	replay := h.call("browser_runner_act", merge(submit, map[string]any{"idempotency_key": "crash-apply"}))
	if replay["replayed"] != true || ats.count() != 0 {
		t.Fatalf("unknown effect was retried: %v count=%d", replay, ats.count())
	}
	// Only the user may rule out an unknown submit.
	resolve := map[string]any{"session_id": "crash", "idempotency_key": "crash-apply", "outcome": "not_submitted", "evidence": "Submit application"}
	h.fail("browser_runner_confirm", resolve, "user_confirmed")
	h.call("browser_runner_confirm", merge(resolve, map[string]any{"user_confirmed": true}))
	res := h.call("browser_runner_act", merge(submit, map[string]any{"idempotency_key": "crash-apply"}))
	if res["effect"].(map[string]any)["status"] != EffectUnverified || ats.count() != 1 {
		t.Fatalf("submit after user check: %v count=%d", res["effect"], ats.count())
	}
}

func TestE2EScopeChangeNeedsReasonAndCloseForgets(t *testing.T) {
	h, _, base, outside := newHarness(t)
	h.call("browser_runner_start", map[string]any{"task_id": "scope", "allowed_origins": []any{base}})
	h.fail("browser_runner_start", map[string]any{"task_id": "scope", "allowed_origins": []any{base, outside}}, "SCOPE_CHANGE")
	h.fail("browser_runner_start", map[string]any{"task_id": "scope", "allowed_origins": []any{outside}, "scope_change_reason": "the AI claims it is safe"}, "SCOPE_CHANGE_REQUIRED")
	out := h.call("browser_runner_start", map[string]any{"task_id": "scope", "allowed_origins": []any{outside}, "scope_change_reason": "user asked to include the partner site", "scope_change_approved": true})
	if origins := fmt.Sprint(out["status"].(map[string]any)["allowed_origins"]); !strings.Contains(origins, strings.TrimPrefix(outside, "http://")) {
		t.Fatalf("scope not widened: %v", origins)
	}
	h.call("browser_runner_close", map[string]any{"session_id": "scope", "forget": true})
	if _, e := os.Stat(checkpointPath("scope")); !os.IsNotExist(e) {
		t.Fatalf("checkpoint not removed: %v", e)
	}
	if _, e := os.Stat(profilePath("scope")); !os.IsNotExist(e) {
		t.Fatalf("profile not removed: %v", e)
	}
}

func merge(a, b map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range a {
		out[k] = v
	}
	for k, v := range b {
		out[k] = v
	}
	return out
}
