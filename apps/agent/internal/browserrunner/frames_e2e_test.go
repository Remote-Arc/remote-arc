package browserrunner

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// embeddedATS is a hosted application form on another site, embedded in the
// employer's careers page, with its consent box inside an open shadow root.
type embeddedATS struct {
	mu       sync.Mutex
	submits  int
	received map[string]string
	files    []string
}

func (a *embeddedATS) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/embed/apply", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, `<!doctype html><html><body><h2>Apply with HostedATS</h2>
<form action="/embed/submit" method="post" enctype="multipart/form-data">
<label>Legal name <input name="name"></label>
<label>CV <input type="file" name="cv"></label>
<consent-box></consent-box>
<input type="hidden" name="consent" id="consent" value="">
<button type="submit">Send application</button></form>
<script>
customElements.define("consent-box", class extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({mode: "open"});
    root.innerHTML = '<label><input type="checkbox" id="c"> I consent to data processing</label>';
    root.getElementById("c").addEventListener("change", (e) => {
      document.getElementById("consent").value = e.target.checked ? "yes" : "";
    });
  }
});
</script></body></html>`)
	})
	mux.HandleFunc("/embed/submit", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseMultipartForm(1 << 20)
		a.mu.Lock()
		a.submits++
		n := a.submits
		a.received = map[string]string{"name": r.FormValue("name"), "consent": r.FormValue("consent")}
		if f, h, e := r.FormFile("cv"); e == nil {
			a.files = append(a.files, h.Filename)
			f.Close()
		}
		a.mu.Unlock()
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `<!doctype html><html><body><h2>Thanks for applying</h2><p>Reference GH-%d</p></body></html>`, n)
	})
	return mux
}

func TestE2EEmbeddedCrossSiteFormAndShadowDOM(t *testing.T) {
	for _, browser := range []string{browserRunner, browserYourChrome} {
		t.Run(browser, func(t *testing.T) { testEmbeddedCrossSiteForm(t, browser) })
	}
}

func testEmbeddedCrossSiteForm(t *testing.T, browser string) {
	h, _, _, _ := newHarness(t)
	if browser == browserYourChrome {
		userChromeForTest(t, h, "about:blank")
	}
	ats := &embeddedATS{}
	atsSrv := httptest.NewServer(ats.handler())
	t.Cleanup(atsSrv.Close)
	// localhost and 127.0.0.1 are different sites, so Chromium runs the form
	// in its own process: the out-of-process iframe path.
	atsOrigin := strings.Replace(atsSrv.URL, "127.0.0.1", "localhost", 1)
	tracker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `<!doctype html><html><body><button>Track me</button></body></html>`)
	}))
	t.Cleanup(tracker.Close)
	careers := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `<!doctype html><html><head><title>Careers</title></head><body><h1>Platform Engineer</h1>
<job-search></job-search><p id="result"></p>
<iframe src="%s/embed/apply" width="900" height="650"></iframe>
<iframe src="%s/pixel" width="200" height="80"></iframe>
<script>
customElements.define("job-search", class extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({mode: "open"});
    root.innerHTML = '<input aria-label="Keyword"><button>Search roles</button>';
    root.querySelector("button").addEventListener("click", () => {
      document.getElementById("result").textContent = "Searched for " + root.querySelector("input").value;
    });
  }
});
</script></body></html>`, atsOrigin, tracker.URL)
	}))
	t.Cleanup(careers.Close)
	resume := writePDF(t, h.policy.WorkspaceRoots[0], "Resume-Embedded.pdf")

	h.call("browser_runner_start", map[string]any{"task_id": "embedded", "browser": browser, "allowed_origins": []any{careers.URL, atsOrigin}, "start_url": careers.URL + "/"})
	h.call("browser_runner_act", map[string]any{"session_id": "embedded", "action": "wait", "text": "Legal name", "timeout_ms": 8000})
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "embedded"})
	sid := snap["snapshot_id"]

	frames := fmt.Sprint(snap["frames"])
	if !strings.Contains(frames, "in_scope:true") || !strings.Contains(frames, "in_scope:false") {
		t.Fatalf("frames not reported with scope: %v", snap["frames"])
	}
	for _, raw := range snap["elements"].([]any) {
		if el := raw.(map[string]any); strings.Contains(fmt.Sprint(el["name"]), "Track me") {
			t.Fatalf("out-of-scope frame was read: %v", el)
		}
	}

	// The out-of-scope frame has no refs; a forged one is refused.
	for _, raw := range snap["frames"].([]any) {
		if f := raw.(map[string]any); f["in_scope"] == false {
			h.fail("browser_runner_act", map[string]any{"session_id": "embedded", "snapshot_id": sid, "ref": fmt.Sprint(f["frame"]) + "e1", "action": "click"}, "STALE_REF")
		}
	}

	// Shadow DOM on the page itself: fill and click inside an open root.
	h.call("browser_runner_act", map[string]any{"session_id": "embedded", "snapshot_id": sid, "ref": ref(t, snap, "textbox", "keyword"), "action": "fill", "value": "golang"})
	click := h.call("browser_runner_act", map[string]any{"session_id": "embedded", "snapshot_id": sid, "ref": ref(t, snap, "button", "search roles"), "action": "click"})
	if click["note"] != nil {
		t.Fatalf("trusted click into shadow DOM did not land: %v", click["note"])
	}
	if w := h.call("browser_runner_act", map[string]any{"session_id": "embedded", "action": "wait", "text": "Searched for golang", "timeout_ms": 3000}); w["matched"] != true {
		t.Fatalf("shadow DOM click had no effect: %v", w)
	}

	// The embedded cross-site form.
	snap = h.call("browser_runner_snapshot", map[string]any{"session_id": "embedded"})
	sid = snap["snapshot_id"]
	name := ref(t, snap, "textbox", "legal name")
	if !strings.HasPrefix(name, "f") {
		t.Fatalf("frame element ref lacks frame prefix: %s", name)
	}
	h.call("browser_runner_act", map[string]any{"session_id": "embedded", "snapshot_id": sid, "ref": name, "action": "fill", "value": "Sam Example"})
	h.call("browser_runner_act", map[string]any{"session_id": "embedded", "action": "upload", "snapshot_id": sid, "ref": ref(t, snap, "file", "cv"), "path": resume})
	h.call("browser_runner_act", map[string]any{"session_id": "embedded", "snapshot_id": sid, "ref": ref(t, snap, "checkbox", "consent"), "action": "check"})
	res := h.call("browser_runner_act", map[string]any{"session_id": "embedded", "snapshot_id": sid, "ref": ref(t, snap, "button", "send application"), "action": "click", "effect": "submit", "idempotency_key": "embedded-apply"})
	if res["effect"].(map[string]any)["status"] != EffectUnverified {
		t.Fatalf("submit: %v", res)
	}
	h.call("browser_runner_confirm", map[string]any{"session_id": "embedded", "idempotency_key": "embedded-apply", "outcome": "confirmed", "evidence": "Reference GH-1"})

	ats.mu.Lock()
	defer ats.mu.Unlock()
	if ats.submits != 1 || ats.received["name"] != "Sam Example" || ats.received["consent"] != "yes" || len(ats.files) != 1 || ats.files[0] != "Resume-Embedded.pdf" {
		t.Fatalf("embedded form received submits=%d %v files=%v", ats.submits, ats.received, ats.files)
	}

	s, _ := h.m.get("embedded")
	s.ev.Lock()
	oopif := false
	for _, f := range s.frames {
		if f.session != "" && strings.Contains(f.url, "localhost") {
			oopif = true
		}
	}
	s.ev.Unlock()
	if !oopif {
		t.Fatal("the embedded cross-site form did not run as an out-of-process frame")
	}
}
