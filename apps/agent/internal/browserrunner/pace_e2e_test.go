package browserrunner

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// paceForm is an application form with what slows an agent down on real
// sites: many plain fields, native selects, radios, a custom dropdown that
// renders its options after a click, an in-page anchor and a single-page
// "Continue" that changes the route without loading a document.
const paceForm = `<!doctype html><html><head><title>Pace Careers</title></head><body>
<h1>Apply: Frontend Engineer</h1>
<form id="f" action="/done" method="post">
<label>First name <input name="first" required></label>
<label>Last name <input name="last" required></label>
<label>Email <input name="email" type="email" required></label>
<label>Phone <input name="phone" type="tel"></label>
<label>City <input name="city"></label>
<label>LinkedIn <input name="linkedin" type="url"></label>
<label>Portfolio <input name="portfolio" type="url"></label>
<label>Current title <input name="title"></label>
<label>Years of experience <input name="years" type="number"></label>
<label>Why this role <textarea name="why"></textarea></label>
<label>Country <select name="country"><option value="">Choose</option><option value="nz">New Zealand</option><option value="au">Australia</option></select></label>
<label>Notice period <select name="notice"><option value="">Choose</option><option>Immediately</option><option>2 weeks</option><option>4 weeks</option></select></label>
<fieldset><legend>Work rights</legend>
<label><input type="radio" name="rights" value="resident"> Citizen or resident</label>
<label><input type="radio" name="rights" value="visa"> Work visa</label></fieldset>
<label><input type="checkbox" name="consent" value="1"> I agree to the privacy policy</label>
<div><button type="button" id="loc" aria-haspopup="listbox" aria-expanded="false">Preferred office</button>
<ul role="listbox" id="locs" hidden></ul></div>
<a href="#notes">Jump to notes</a>
<p id="notes">Notes</p>
<button type="button" id="cont">Continue</button>
</form>
<script>
const loc = document.getElementById("loc"), list = document.getElementById("locs");
loc.addEventListener("click", () => {
  loc.setAttribute("aria-expanded", "true");
  // Options arrive a moment later, as from a real component library.
  setTimeout(() => {
    list.innerHTML = ["Auckland", "Wellington", "Remote"].map((c) => '<li role="option" tabindex="-1">' + c + "</li>").join("");
    list.hidden = false;
  }, 60);
});
list.addEventListener("click", (e) => {
  const o = e.target.closest("[role=option]");
  if (!o) return;
  loc.textContent = o.textContent;
  loc.setAttribute("aria-expanded", "false");
  list.hidden = true;
});
document.getElementById("cont").addEventListener("click", () => {
  history.pushState({}, "", "/apply/step-2");
  setTimeout(() => { document.body.innerHTML = '<h1>Step 2: Questions</h1><label>Salary expectation <input name="salary"></label><button type="button">Review</button>'; }, 40);
});
</script></body></html>`

func paceServer(t *testing.T) string {
	t.Helper()
	page := func(w http.ResponseWriter, body string) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, "<!doctype html><html><head><title>Pace</title></head><body>"+body+"</body></html>")
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/account", func(w http.ResponseWriter, r *http.Request) {
		page(w, `<h1>Create account</h1><label>Display name <input name="display"></label>
<label>Password <input name="password" type="password"></label><label>Town <input name="town"></label>`)
	})
	// A GET search form whose sort select submits on change.
	mux.HandleFunc("/search", func(w http.ResponseWriter, r *http.Request) {
		page(w, `<h1>Search</h1><form action="/results" method="get">
<label>Sort <select name="sort" onchange="this.form.submit()"><option value="">Relevance</option><option value="new">Newest</option></select></label>
<label>Keywords <input name="q"></label></form>`)
	})
	mux.HandleFunc("/results", func(w http.ResponseWriter, r *http.Request) {
		page(w, `<h1>Results sorted by `+r.URL.Query().Get("sort")+`</h1>`)
	})
	// A menu button that navigates later than any wait would cover.
	mux.HandleFunc("/late", func(w http.ResponseWriter, r *http.Request) {
		page(w, `<h1>Late</h1><button type="button" aria-haspopup="menu" onclick="setTimeout(() => location.assign('/later'), 700)">Menu</button><label>Note <input name="note"></label>`)
	})
	mux.HandleFunc("/later", func(w http.ResponseWriter, r *http.Request) { page(w, `<h1>Later</h1>`) })
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, paceForm)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv.URL
}

func paceStart(t *testing.T, path string) (*harness, map[string]any) {
	t.Helper()
	h, _, _, _ := newHarness(t)
	base := paceServer(t)
	h.call("browser_runner_start", map[string]any{"task_id": "pace", "allowed_origins": []any{base}, "start_url": base + path})
	return h, h.call("browser_runner_snapshot", map[string]any{"session_id": "pace"})
}

func field(snap map[string]any, ref string) map[string]any {
	for _, raw := range snap["elements"].([]any) {
		if el := raw.(map[string]any); el["ref"] == ref {
			return el
		}
	}
	return nil
}

// One call enters a whole form, with each field checked as a single act
// would be and recorded for restart recovery.
func TestE2EFillFormEntersAFormInOneCall(t *testing.T) {
	h, snap := paceStart(t, "/apply")
	r := func(role, name string) string { return ref(t, snap, role, name) }
	text := [][2]string{{"first name", "Sam"}, {"last name", "Example"}, {"email", "sam@example.test"}, {"phone", "+64 21 000 0000"}, {"city", "Auckland"},
		{"linkedin", "https://www.linkedin.com/in/sam"}, {"portfolio", "https://sam.example.test"}, {"current title", "Full-stack engineer"}, {"years", "5"}, {"why this role", "I build fast, careful frontends."}}
	fields := []any{}
	for _, f := range text {
		fields = append(fields, map[string]any{"ref": r("textbox", f[0]), "action": "fill", "value": f[1]})
	}
	fields = append(fields,
		map[string]any{"ref": r("combobox", "country"), "action": "select", "value": "New Zealand"},
		map[string]any{"ref": r("combobox", "notice"), "action": "select", "value": "4 weeks"},
		map[string]any{"ref": r("radio", "citizen"), "action": "check"},
		map[string]any{"ref": r("checkbox", "privacy"), "action": "check"})
	out, took := h.timed("browser_runner_act", map[string]any{"session_id": "pace", "snapshot_id": snap["snapshot_id"], "action": "fill_form", "fields": fields})
	t.Logf("fill_form with %d fields: %d ms", len(fields), took.Milliseconds())
	if out["entered"] != float64(len(fields)) || out["failed"] != float64(0) || out["navigated"] != false {
		t.Fatalf("fill_form: %v", out)
	}
	if took > 8*time.Second {
		t.Fatalf("fill_form took %s", took)
	}
	after := h.call("browser_runner_snapshot", map[string]any{"session_id": "pace"})
	for _, f := range text {
		if v := field(after, ref(t, after, "textbox", f[0]))["value"]; v != f[1] {
			t.Fatalf("%s holds %q", f[0], v)
		}
	}
	if v := field(after, ref(t, after, "combobox", "notice"))["value"]; v != "4 weeks" {
		t.Fatalf("notice: %v", v)
	}
	if field(after, ref(t, after, "radio", "citizen"))["checked"] != true || field(after, ref(t, after, "checkbox", "privacy"))["checked"] != true {
		t.Fatal("radio or checkbox not checked")
	}
	status := h.call("browser_runner_status", map[string]any{"session_id": "pace"})
	if !strings.Contains(fmt.Sprint(status), "Why this role") || !strings.Contains(fmt.Sprint(status), "Notice period") {
		t.Fatalf("receipts lack the fields: %v", status["recent_receipts"])
	}
}

// A field that fails is reported with its reason and the others still go in;
// a password is refused inside a batch as it is alone.
func TestE2EFillFormReportsFailuresAndContinues(t *testing.T) {
	h, snap := paceStart(t, "/apply")
	out := h.call("browser_runner_act", map[string]any{"session_id": "pace", "snapshot_id": snap["snapshot_id"], "action": "fill_form", "fields": []any{
		map[string]any{"ref": ref(t, snap, "combobox", "country"), "action": "select", "value": "Narnia"},
		map[string]any{"ref": ref(t, snap, "radio", "citizen"), "action": "fill", "value": "yes"},
		map[string]any{"ref": ref(t, snap, "textbox", "city"), "action": "fill", "value": "Auckland"},
	}})
	res := out["fields"].([]any)
	if out["entered"] != float64(1) || out["failed"] != float64(2) || len(res) != 3 {
		t.Fatalf("fill_form: %v", out)
	}
	if !strings.HasPrefix(fmt.Sprint(res[0].(map[string]any)["error"]), "NO_OPTION") || !strings.HasPrefix(fmt.Sprint(res[1].(map[string]any)["error"]), "WRONG_ACTION") || res[2].(map[string]any)["ok"] != true {
		t.Fatalf("per-field results: %v", res)
	}
	// Clicks and submits are never part of a batch.
	h.fail("browser_runner_act", map[string]any{"session_id": "pace", "snapshot_id": snap["snapshot_id"], "action": "fill_form", "fields": []any{map[string]any{"ref": ref(t, snap, "button", "continue"), "action": "click"}}}, "separate browser_runner_act")
	h.fail("browser_runner_act", map[string]any{"session_id": "pace", "snapshot_id": snap["snapshot_id"], "action": "fill_form", "effect": "submit", "fields": []any{map[string]any{"ref": ref(t, snap, "textbox", "city"), "action": "fill", "value": "x"}}}, "never submits")

	h.call("browser_runner_act", map[string]any{"session_id": "pace", "action": "navigate", "url": strings.TrimSuffix(fmt.Sprint(out["url"]), "/apply") + "/account"})
	acc := h.call("browser_runner_snapshot", map[string]any{"session_id": "pace"})
	out = h.call("browser_runner_act", map[string]any{"session_id": "pace", "snapshot_id": acc["snapshot_id"], "action": "fill_form", "fields": []any{
		map[string]any{"ref": ref(t, acc, "textbox", "display"), "action": "fill", "value": "Sam"},
		map[string]any{"ref": ref(t, acc, "textbox", "password"), "action": "fill", "value": "hunter2"},
		map[string]any{"ref": ref(t, acc, "textbox", "town"), "action": "fill", "value": "Auckland"},
	}})
	res = out["fields"].([]any)
	if out["entered"] != float64(2) || !strings.HasPrefix(fmt.Sprint(res[1].(map[string]any)["error"]), "BLOCKED_SENSITIVE") {
		t.Fatalf("password in a batch: %v", out)
	}
	if v := field(h.call("browser_runner_snapshot", map[string]any{"session_id": "pace"}), ref(t, acc, "textbox", "password"))["value"]; v != "" {
		t.Fatalf("password field holds %v", v)
	}
}

// A change handler that submits a GET form ends the batch: nothing is typed
// into the page that replaced the form.
func TestE2EFillFormStopsWhenThePageNavigates(t *testing.T) {
	h, snap := paceStart(t, "/search")
	keywords := ref(t, snap, "textbox", "keywords")
	out := h.call("browser_runner_act", map[string]any{"session_id": "pace", "snapshot_id": snap["snapshot_id"], "action": "fill_form", "fields": []any{
		map[string]any{"ref": ref(t, snap, "combobox", "sort"), "action": "select", "value": "Newest"},
		map[string]any{"ref": keywords, "action": "fill", "value": "frontend"},
	}})
	if out["navigated"] != true || fmt.Sprint(out["not_entered"]) != "["+keywords+"]" || out["stopped"] == nil {
		t.Fatalf("fill_form across a navigation: %v", out)
	}
	if !strings.Contains(fmt.Sprint(out["title"])+fmt.Sprint(out["url"]), "results") {
		t.Fatalf("not on the results page: %v", out)
	}
}

// snapshot=true returns what a click opened, so the option can be chosen in
// the next call without a separate snapshot.
func TestE2ESnapshotWithActShowsWhatTheClickOpened(t *testing.T) {
	h, snap := paceStart(t, "/apply")
	opened := h.call("browser_runner_act", map[string]any{"session_id": "pace", "snapshot_id": snap["snapshot_id"], "ref": ref(t, snap, "button", "preferred office"), "action": "click", "snapshot": true})
	next, ok := opened["snapshot"].(map[string]any)
	if !ok {
		t.Fatalf("no snapshot in the result: %v", opened)
	}
	chosen := h.call("browser_runner_act", map[string]any{"session_id": "pace", "snapshot_id": next["snapshot_id"], "ref": ref(t, next, "option", "wellington"), "action": "click", "snapshot": true})
	if ref(t, chosen["snapshot"].(map[string]any), "button", "wellington") == "" {
		t.Fatalf("option not chosen: %v", chosen)
	}
	// The snapshot from before the click is no longer the latest.
	h.fail("browser_runner_act", map[string]any{"session_id": "pace", "snapshot_id": snap["snapshot_id"], "ref": ref(t, snap, "textbox", "city"), "action": "fill", "value": "x"}, "STALE_REF")
}

// A click that is not expected to navigate returns quickly; if the page
// navigates afterwards anyway, the next act on the old refs is refused rather
// than typed into the new page.
func TestE2ELateNavigationIsNeverActedThrough(t *testing.T) {
	h, snap := paceStart(t, "/late")
	_, took := h.timed("browser_runner_act", map[string]any{"session_id": "pace", "snapshot_id": snap["snapshot_id"], "ref": ref(t, snap, "button", "menu"), "action": "click"})
	if took >= 700*time.Millisecond {
		t.Logf("menu click waited %s (the page navigates at 700 ms)", took)
	}
	time.Sleep(1500 * time.Millisecond)
	h.fail("browser_runner_act", map[string]any{"session_id": "pace", "snapshot_id": snap["snapshot_id"], "ref": ref(t, snap, "textbox", "note"), "action": "fill", "value": "x"}, "STALE_REF")
}

func (h *harness) timed(tool string, args map[string]any) (map[string]any, time.Duration) {
	h.t.Helper()
	start := time.Now()
	out := h.call(tool, args)
	return out, time.Since(start)
}

// TestE2EActTimings records how long single actions take, one call each.
func TestE2EActTimings(t *testing.T) {
	h, snap := paceStart(t, "/apply")
	sid := snap["snapshot_id"]
	act := func(label string, a map[string]any) time.Duration {
		_, d := h.timed("browser_runner_act", merge(map[string]any{"session_id": "pace", "snapshot_id": sid}, a))
		t.Logf("%-28s %6d ms", label, d.Milliseconds())
		return d
	}
	var fills time.Duration
	for _, f := range [][2]string{{"first name", "Sam"}, {"last name", "Example"}, {"email", "sam@example.test"}, {"phone", "+64 21 000 0000"}, {"city", "Auckland"}} {
		fills += act("fill "+f[0], map[string]any{"ref": ref(t, snap, "textbox", f[0]), "action": "fill", "value": f[1]})
	}
	act("select country", map[string]any{"ref": ref(t, snap, "combobox", "country"), "action": "select", "value": "New Zealand"})
	act("check radio", map[string]any{"ref": ref(t, snap, "radio", "citizen"), "action": "check"})
	act("check consent", map[string]any{"ref": ref(t, snap, "checkbox", "privacy"), "action": "check"})
	toggle := act("click custom dropdown", map[string]any{"ref": ref(t, snap, "button", "preferred office"), "action": "click"})
	anchor := act("click in-page anchor", map[string]any{"ref": ref(t, snap, "link", "jump to notes"), "action": "click"})
	snap = h.call("browser_runner_snapshot", map[string]any{"session_id": "pace"})
	sid = snap["snapshot_id"]
	option := act("click dropdown option", map[string]any{"ref": ref(t, snap, "option", "wellington"), "action": "click"})
	spa := act("click SPA continue", map[string]any{"ref": ref(t, snap, "button", "continue"), "action": "click"})
	t.Logf("5 fills %d ms; toggle %d, anchor %d, option %d, spa %d ms", fills.Milliseconds(), toggle.Milliseconds(), anchor.Milliseconds(), option.Milliseconds(), spa.Milliseconds())
	after := h.call("browser_runner_snapshot", map[string]any{"session_id": "pace"})
	if !strings.Contains(fmt.Sprint(after["text"]), "Step 2") {
		t.Fatalf("SPA step did not render: %v", after["text"])
	}
	// Clicks that change only the current view used to wait 2.5 s for a
	// navigation that never came. Bounds are loose for slow CI machines.
	for name, d := range map[string]time.Duration{"dropdown toggle": toggle, "in-page anchor": anchor, "option": option} {
		if d > 1500*time.Millisecond {
			t.Errorf("%s click took %s", name, d)
		}
	}
	if spa > 2*time.Second {
		t.Errorf("single-page Continue took %s", spa)
	}
	if fills > 2*time.Second {
		t.Errorf("5 fills took %s", fills)
	}
}
