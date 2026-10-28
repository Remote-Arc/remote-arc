package browserrunner

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// codeSite asks for an emailed one-time code after the email step, as the
// PageUp identity page did for Jenny's Linfox draft.
func codeSite(t *testing.T) (string, func() string) {
	var mu sync.Mutex
	got := ""
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if r.Method == http.MethodPost {
			_ = r.ParseForm()
			mu.Lock()
			got = r.FormValue("otp")
			mu.Unlock()
			fmt.Fprint(w, `<!doctype html><html><body><h1>Welcome back</h1><p>Your saved application #88743.</p></body></html>`)
			return
		}
		fmt.Fprint(w, `<!doctype html><html><body><h1>Check your email</h1><p>We sent a code to j***@example.test.</p>
<form method="post" action="/login/code"><label>One-time code <input name="otp" autocomplete="one-time-code" inputmode="numeric"></label>
<label>Password <input type="password" name="password"></label><button type="submit">Login</button></form></body></html>`)
	}))
	t.Cleanup(srv.Close)
	return srv.URL, func() string { mu.Lock(); defer mu.Unlock(); return got }
}

// A code the caller found in the user's email is entered without the user,
// redacted in snapshots and never written to the checkpoint. Passwords are
// still never typed from the conversation.
func TestE2EOneTimeCodeIsEnteredAndNeverRecorded(t *testing.T) {
	h, _, _, _ := newHarness(t)
	base, received := codeSite(t)
	h.policy.BrowserAuth = protocol.BrowserAuth{OTP: true, Origins: []string{base}}
	h.call("browser_runner_start", map[string]any{"task_id": "otp", "allowed_origins": []any{base}, "start_url": base + "/login/code"})
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "otp"})
	if !strings.Contains(fmt.Sprint(snap["attention"]), "verification_code") || strings.Contains(fmt.Sprint(snap["blockers"]), "verification_code") {
		t.Fatalf("code request should be a note, not a stop: attention=%v blockers=%v", snap["attention"], snap["blockers"])
	}
	code := ref(t, snap, "textbox", "one-time code")
	if el := field(snap, code); el["secret"] != "code" || el["sensitive"] != true {
		t.Fatalf("code field: %v", el)
	}
	h.call("browser_runner_act", map[string]any{"session_id": "otp", "snapshot_id": snap["snapshot_id"], "ref": code, "action": "fill", "value": "482913"})
	h.fail("browser_runner_act", map[string]any{"session_id": "otp", "snapshot_id": snap["snapshot_id"], "ref": ref(t, snap, "textbox", "password"), "action": "fill", "value": "hunter2"}, "BLOCKED_SENSITIVE")
	after := h.call("browser_runner_snapshot", map[string]any{"session_id": "otp"})
	if v := field(after, code)["value"]; v != "[redacted]" {
		t.Fatalf("code value shown: %v", v)
	}
	h.call("browser_runner_act", map[string]any{"session_id": "otp", "snapshot_id": after["snapshot_id"], "ref": ref(t, after, "button", "login"), "action": "click"})
	if received() != "482913" {
		t.Fatalf("site received code %q", received())
	}
	b, _ := os.ReadFile(checkpointPath("otp"))
	if strings.Contains(string(b), "482913") {
		t.Fatal("checkpoint recorded the code")
	}
}

// A computer can turn code entry off; then the code is the user's to enter.
func TestE2EOneTimeCodesCanBeTurnedOff(t *testing.T) {
	h, _, _, _ := newHarness(t)
	home := os.Getenv("REMOTEARC_HOME")
	cfg := `{"deviceId":"d","deviceToken":"t","origin":"https://remotearc.app","browserRunnerOneTimeCodes":false}`
	if e := os.MkdirAll(config.Dir(), 0700); e != nil {
		t.Fatal(e)
	}
	if e := os.WriteFile(filepath.Join(config.Dir(), "config.json"), []byte(cfg), 0600); e != nil {
		t.Fatal(e, home)
	}
	base, _ := codeSite(t)
	h.policy.BrowserAuth = protocol.BrowserAuth{OTP: true, Origins: []string{base}}
	h.call("browser_runner_start", map[string]any{"task_id": "otp-off", "allowed_origins": []any{base}, "start_url": base + "/login/code"})
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "otp-off"})
	if !strings.Contains(fmt.Sprint(snap["blockers"]), "verification_code") {
		t.Fatalf("with codes off the code is the user's: %v", snap["blockers"])
	}
	h.fail("browser_runner_act", map[string]any{"session_id": "otp-off", "snapshot_id": snap["snapshot_id"], "ref": ref(t, snap, "textbox", "one-time code"), "action": "fill", "value": "482913"}, "turned off")
}
