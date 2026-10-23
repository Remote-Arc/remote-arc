package browserrunner

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/vault"
)

type loginSite struct {
	mu   sync.Mutex
	seen []string
}

func (l *loginSite) last() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.seen) == 0 {
		return ""
	}
	return l.seen[len(l.seen)-1]
}

func (l *loginSite) handler() http.Handler {
	page := func(w http.ResponseWriter, body string) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, "<!doctype html><html><head><title>Acme Identity</title></head><body>"+body+"</body></html>")
	}
	form := `<h1>Sign in</h1><form method="post" action="/session"><label>Email <input name="email" type="email" autocomplete="username"></label>
<label>Password <input name="password" type="password" autocomplete="current-password"></label><label>Notes <input name="notes"></label><button type="submit">Sign in</button></form>
<script>document.title = "Acme Identity binding:" + typeof window.__remotearcLogin;</script>`
	mux := http.NewServeMux()
	mux.HandleFunc("/login", func(w http.ResponseWriter, r *http.Request) { page(w, form) })
	// Stands in for the user typing their own sign-in in the Runner window.
	mux.HandleFunc("/login-typed", func(w http.ResponseWriter, r *http.Request) {
		page(w, form+`<script>document.querySelector("[name=email]").value = "jenny@example.test"; document.querySelector("[name=password]").value = "typed-by-jenny";</script>`)
	})
	mux.HandleFunc("/session", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		l.mu.Lock()
		l.seen = append(l.seen, r.FormValue("email")+":"+r.FormValue("password"))
		l.mu.Unlock()
		page(w, `<h1>Welcome back</h1>`)
	})
	return mux
}

func vaultForTest(t *testing.T) {
	if runtime.GOOS == "darwin" {
		t.Setenv("REMOTEARC_VAULT_STORE", "file") // CI Macs have no unlocked login Keychain
	}
}

// A sign-in saved on this computer is filled by the Agent on its own site:
// the page is no longer a stop for the user, the password reaches only the
// password field and is never returned or recorded.
func TestE2ESavedSignInIsFilledOnlyOnItsSite(t *testing.T) {
	h, _, _, _ := newHarness(t)
	vaultForTest(t)
	site := &loginSite{}
	srv := httptest.NewServer(site.handler())
	t.Cleanup(srv.Close)
	if e := vault.Put("jenny-acme", []string{srv.URL}, "jenny@example.test", "vault-pass-123", "cli", time.Now()); e != nil {
		t.Fatal(e)
	}
	if e := vault.Put("other-site", []string{"https://elsewhere.example"}, "x@example.test", "other-pass", "cli", time.Now()); e != nil {
		t.Fatal(e)
	}
	h.call("browser_runner_start", map[string]any{"task_id": "signin", "allowed_origins": []any{srv.URL}, "start_url": srv.URL + "/login"})
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "signin"})
	if snap["session_state"] == StateNeedsUser || !strings.Contains(fmt.Sprint(snap["attention"]), "jenny-acme") || strings.Contains(fmt.Sprint(snap["attention"]), "other-site") {
		t.Fatalf("saved sign-in not offered: state=%v attention=%v blockers=%v", snap["session_state"], snap["attention"], snap["blockers"])
	}
	// The page's own scripts cannot reach the Runner's sign-in channel.
	if !strings.HasSuffix(fmt.Sprint(snap["title"]), "binding:undefined") {
		t.Fatalf("page sees the login binding: %v", snap["title"])
	}
	sid := snap["snapshot_id"]
	email, pw, notes := ref(t, snap, "textbox", "email"), ref(t, snap, "textbox", "password"), ref(t, snap, "textbox", "notes")
	secret := func(ref, name, part string) map[string]any {
		return map[string]any{"session_id": "signin", "snapshot_id": sid, "action": "fill_secret", "ref": ref, "secret": name, "part": part}
	}
	h.fail("browser_runner_act", secret(notes, "jenny-acme", "password"), "WRONG_FIELD")
	h.fail("browser_runner_act", secret(pw, "other-site", "password"), "SECRET_WRONG_SITE")
	h.fail("browser_runner_act", secret(pw, "nobody", "password"), "SECRET_NOT_FOUND")
	out := h.call("browser_runner_act", secret(email, "jenny-acme", "username"))
	h.call("browser_runner_act", secret(pw, "jenny-acme", "password"))
	if strings.Contains(fmt.Sprint(out), "jenny@example.test") {
		t.Fatalf("username returned: %v", out)
	}
	after := h.call("browser_runner_snapshot", map[string]any{"session_id": "signin"})
	if v := field(after, pw)["value"]; v != "[redacted]" || strings.Contains(fmt.Sprint(after), "vault-pass-123") {
		t.Fatalf("password visible in snapshot: %v", v)
	}
	h.call("browser_runner_act", map[string]any{"session_id": "signin", "snapshot_id": after["snapshot_id"], "ref": ref(t, after, "button", "sign in"), "action": "click"})
	if site.last() != "jenny@example.test:vault-pass-123" {
		t.Fatalf("site received %q", site.last())
	}
	b, _ := os.ReadFile(checkpointPath("signin"))
	if strings.Contains(string(b), "vault-pass-123") {
		t.Fatal("checkpoint recorded the password")
	}
	if !strings.Contains(string(b), "fill_secret") {
		t.Fatal("no receipt for the vault fill")
	}
	status := h.call("browser_runner_status", map[string]any{})
	if !strings.Contains(fmt.Sprint(status["saved_logins"]), "jenny-acme") || strings.Contains(fmt.Sprint(status), "vault-pass-123") {
		t.Fatalf("status saved_logins: %v", status["saved_logins"])
	}
}

// A sign-in the user completes once in the Runner window is saved to the
// vault under the profile and site, and offered next time.
func TestE2ESignInInTheWindowIsSaved(t *testing.T) {
	h, _, _, _ := newHarness(t)
	vaultForTest(t)
	site := &loginSite{}
	srv := httptest.NewServer(site.handler())
	t.Cleanup(srv.Close)
	h.call("browser_runner_start", map[string]any{"task_id": "first", "profile": "jenny", "allowed_origins": []any{srv.URL}, "start_url": srv.URL + "/login-typed"})
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "first"})
	out := h.call("browser_runner_act", map[string]any{"session_id": "first", "snapshot_id": snap["snapshot_id"], "ref": ref(t, snap, "button", "sign in"), "action": "click"})
	if site.last() != "jenny@example.test:typed-by-jenny" {
		t.Fatalf("site received %q", site.last())
	}
	name := loginName("jenny", "127.0.0.1")
	deadline := time.Now().Add(3 * time.Second)
	for {
		if u, p, e := vault.Reveal(name, srv.URL+"/login"); e == nil && u == "jenny@example.test" && p == "typed-by-jenny" {
			break
		}
		if time.Now().After(deadline) {
			list, _ := vault.List()
			t.Fatalf("sign-in not saved as %s: %+v (result %v)", name, list, out)
		}
		time.Sleep(50 * time.Millisecond)
	}
	// Reported to the caller on the next result, without the password.
	next := h.call("browser_runner_snapshot", map[string]any{"session_id": "first"})
	if !strings.Contains(fmt.Sprint(out["saved_login"])+fmt.Sprint(next["saved_login"]), name) || strings.Contains(fmt.Sprint(next), "typed-by-jenny") {
		t.Fatalf("saved sign-in not reported: %v / %v", out["saved_login"], next["saved_login"])
	}
}
