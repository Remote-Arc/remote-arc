package browserrunner

import (
	"strings"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

var policyNone = protocol.Policy{}

func TestScopeRules(t *testing.T) {
	s, e := newScope([]string{"jobs.example.com", "https://*.greenhouse.io", "http://127.0.0.1:8080"})
	if e != nil {
		t.Fatal(e)
	}
	cases := map[string]bool{
		"https://jobs.example.com/apply":         true,
		"https://jobs.example.com:443/x":         true,
		"http://jobs.example.com/apply":          false, // https only
		"https://evil.jobs.example.com/":         false, // exact host
		"https://boards.greenhouse.io/acme":      true,
		"https://greenhouse.io/":                 false, // wildcard is subdomains only
		"https://boards.greenhouse.io.evil.com/": false,
		"http://127.0.0.1:8080/form":             true,
		"http://127.0.0.1:9090/form":             false, // port is part of the origin
		"https://user:pw@jobs.example.com/":      false,
		"file:///etc/passwd":                     false,
		"javascript:alert(1)":                    false,
		"https://JOBS.EXAMPLE.COM/upper-case-ok": true,
	}
	for u, want := range cases {
		if got := s.Allows(u); got != want {
			t.Errorf("Allows(%q) = %v, want %v", u, got, want)
		}
	}
	for _, bad := range []string{"http://example.com", "https://*.com", "ftp://x.y", "https://a.com/path", "", "https://u@a.com"} {
		if _, e := parseRule(bad); e == nil {
			t.Errorf("parseRule(%q) accepted", bad)
		}
	}
	if _, e := newScope(nil); e == nil {
		t.Error("empty scope accepted")
	}
	wide, _ := newScope([]string{"jobs.example.com", "a.example.org"})
	narrow, _ := newScope([]string{"https://jobs.example.com/"})
	if !wide.covers(narrow) || narrow.covers(wide) {
		t.Error("covers is wrong")
	}
}

func TestSafeURLDropsTokens(t *testing.T) {
	got := safeURL("https://u:p@site.test/verify?token=secret#frag")
	if strings.Contains(got, "secret") || strings.Contains(got, "frag") || strings.Contains(got, "u:p") {
		t.Fatalf("safeURL kept sensitive parts: %s", got)
	}
}

func TestRecoverMarksInFlightUnknown(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	now := time.Unix(1_800_000_000, 0)
	c := &Checkpoint{Version: checkpointVersion, SessionID: "r1", Profile: "r1", State: StateActive,
		Effects: []Effect{{Key: "a", Status: EffectInFlight}, {Key: "b", Status: EffectConfirmed}}}
	if !c.recover(now) || c.Effects[0].Status != EffectUnknown || c.Effects[1].Status != EffectConfirmed {
		t.Fatalf("recover: %+v", c.Effects)
	}
	if u := c.unresolved(); u == nil || u.Key != "a" {
		t.Fatal("unknown effect must block new submits")
	}
	if !strings.Contains(c.nextAction(), "Do not submit again") {
		t.Fatal(c.nextAction())
	}
	if e := c.save(now); e != nil {
		t.Fatal(e)
	}
	back, e := loadCheckpoint("r1")
	if e != nil || back.Effects[0].Status != EffectUnknown {
		t.Fatalf("round trip: %v %+v", e, back)
	}
	for i := 0; i < 130; i++ {
		c.receipt(now, Receipt{Tool: "browser_act", Outcome: "ok"})
	}
	_ = c.save(now)
	if len(c.Receipts) != 100 || c.Receipts[99].Seq != 130 {
		t.Fatalf("receipts not bounded: %d", len(c.Receipts))
	}
}

func TestCallValidation(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	m := New()
	m.findBrowser = func() (string, error) { return "", nil }
	defer m.Close()
	for _, tc := range []struct {
		tool string
		args map[string]any
		want string
	}{
		{"browser_start", map[string]any{"task_id": "../x", "allowed_origins": []any{"a.com"}}, "task_id"},
		{"browser_start", map[string]any{"task_id": "ok"}, "allowed_origins"},
		{"browser_start", map[string]any{"task_id": "ok", "allowed_origins": []any{"a.com"}, "start_url": "https://b.com/"}, "OUT_OF_SCOPE"},
		{"browser_snapshot", map[string]any{"session_id": "nope"}, "No Browser Runner session"},
		{"browser_act", map[string]any{}, "session_id"},
	} {
		_, e := m.Call(t.Context(), tc.tool, tc.args, policyNone)
		if e == nil || !strings.Contains(e.Error(), tc.want) {
			t.Errorf("%s %v: want %q, got %v", tc.tool, tc.args, tc.want, e)
		}
	}
	if !IsTool("browser_resolve_effect") || IsTool("browser_read_page") {
		t.Error("tool set is wrong")
	}
}
