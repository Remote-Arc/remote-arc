package browserrunner

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// userChromeForTest starts a browser that stands in for the user's own
// Chrome after they allowed remote debugging: its own profile directory with
// a DevToolsActivePort file, and a tab the user has open. It returns a
// connection for observing the browser's tabs, and the user's tab id.
func userChromeForTest(t *testing.T, h *harness, userPage string) (*cdpConn, string) {
	t.Helper()
	exe, e := FindBrowser()
	if e != nil {
		t.Skip(e)
	}
	dir := filepath.Join(t.TempDir(), "users-chrome")
	proc, e := launchBrowser(h.ctx, exe, dir, true)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(proc.stop)
	t.Setenv("REMOTEARC_YOUR_CHROME_DIR", dir)
	obs, e := dialCDP(h.ctx, proc.browserWS, nil)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(obs.Close)
	var created struct {
		TargetID string `json:"targetId"`
	}
	if e := obs.Call(h.ctx, "Target.createTarget", map[string]any{"url": userPage}, &created); e != nil {
		t.Fatal(e)
	}
	return obs, created.TargetID
}

func pageTargets(t *testing.T, ctx context.Context, obs *cdpConn) map[string]string {
	t.Helper()
	var list struct {
		TargetInfos []struct {
			TargetID string `json:"targetId"`
			Type     string `json:"type"`
			URL      string `json:"url"`
		} `json:"targetInfos"`
	}
	if e := obs.Call(ctx, "Target.getTargets", nil, &list); e != nil {
		t.Fatal(e)
	}
	out := map[string]string{}
	for _, ti := range list.TargetInfos {
		if ti.Type == "page" {
			out[ti.TargetID] = ti.URL
		}
	}
	return out
}

// Tasks run in the user's own Chrome over one connection (Chrome asks the
// user to Allow each new one), each in its own window; a finished task closes
// only its own tab, and the user's tabs are never touched.
func TestE2EYourChromeTasksShareOneConnection(t *testing.T) {
	h, _, base, _ := newHarness(t)
	obs, mine := userChromeForTest(t, h, base+"/login")
	if e := obs.Call(h.ctx, "Storage.setCookies", map[string]any{"cookies": []any{map[string]any{"name": "signed_in", "value": "existing-user", "url": base}}}, nil); e != nil {
		t.Fatal(e)
	}

	a := h.call("browser_runner_start", map[string]any{"task_id": "apply-a", "browser": "your_chrome", "allowed_origins": []any{base}, "start_url": base + "/apply/1"})
	if a["browser"] != "your_chrome" || a["headless"] != false || a["profile"] != yourChromeProfile {
		t.Fatalf("start in the user's Chrome: %v", a)
	}
	var cookies evalResult
	if e := h.m.sessions["apply-a"].conn.Call(h.ctx, "Runtime.evaluate", map[string]any{"expression": "document.cookie", "returnByValue": true}, &cookies); e != nil || !strings.Contains(string(cookies.Result.Value), "signed_in=existing-user") {
		t.Fatalf("existing Chrome sign-in was not reused: %s (%v)", cookies.Result.Value, e)
	}
	h.fail("browser_runner_start", map[string]any{"task_id": "apply-a", "allowed_origins": []any{base}, "headless": true}, "always visible")
	resumed := h.call("browser_runner_start", map[string]any{"task_id": "apply-a", "allowed_origins": []any{base}})
	if resumed["browser"] != browserYourChrome || resumed["resumed"] != true {
		t.Fatalf("resume lost the browser mode: %v", resumed)
	}
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "apply-a"})
	out := h.call("browser_runner_act", map[string]any{"session_id": "apply-a", "snapshot_id": snap["snapshot_id"], "action": "fill_form", "fields": []any{
		map[string]any{"ref": ref(t, snap, "textbox", "full name"), "action": "fill", "value": "Sam Yao"},
		map[string]any{"ref": ref(t, snap, "textbox", "email"), "action": "fill", "value": "sam@example.test"},
		map[string]any{"ref": ref(t, snap, "combobox", "country"), "action": "select", "value": "New Zealand"},
	}})
	if out["failed"] != float64(0) || out["entered"] != float64(3) {
		t.Fatalf("fill_form in the user's Chrome: %v", out)
	}
	out = h.call("browser_runner_act", map[string]any{"session_id": "apply-a", "snapshot_id": snap["snapshot_id"], "ref": ref(t, snap, "button", "next"), "action": "click", "effect": "navigation", "snapshot": true})
	if !strings.Contains(strings.ToLower(asString(out)), "documents") {
		t.Fatalf("next page not reached: %v", out)
	}

	h.call("browser_runner_start", map[string]any{"task_id": "apply-b", "browser": "your_chrome", "allowed_origins": []any{base}, "start_url": base + "/"})
	if n := h.m.yourChrome().dials; n != 1 {
		t.Fatalf("tasks opened %d connections to the user's Chrome; one is shared", n)
	}
	tabs := pageTargets(t, h.ctx, obs)
	taskA, taskB := h.m.sessions["apply-a"].cp.YourTab, h.m.sessions["apply-b"].cp.YourTab
	if taskA == "" || taskB == "" || taskA == taskB || taskA == mine || tabs[taskA] == "" || tabs[taskB] == "" || tabs[mine] == "" {
		t.Fatalf("each task needs its own tab next to the user's: a=%s b=%s mine=%s tabs=%v", taskA, taskB, mine, tabs)
	}

	// Its scope still holds in the user's Chrome.
	h.fail("browser_runner_act", map[string]any{"session_id": "apply-b", "action": "navigate", "url": "https://example.invalid/"}, "OUT_OF_SCOPE")

	h.call("browser_runner_close", map[string]any{"session_id": "apply-a"})
	tabs = pageTargets(t, h.ctx, obs)
	if _, open := tabs[taskA]; open {
		t.Fatalf("closed task left its tab open: %v", tabs)
	}
	if tabs[mine] == "" || tabs[taskB] == "" {
		t.Fatalf("closing one task touched other tabs: %v", tabs)
	}

	// The user closes the other task's tab: the task comes back in a new one.
	if e := obs.Call(h.ctx, "Target.closeTarget", map[string]any{"targetId": taskB}, nil); e != nil {
		t.Fatal(e)
	}
	deadline := time.Now().Add(5 * time.Second)
	for h.m.sessions["apply-b"].live() && time.Now().Before(deadline) {
		time.Sleep(50 * time.Millisecond)
	}
	snap = h.call("browser_runner_snapshot", map[string]any{"session_id": "apply-b"})
	if !strings.Contains(asString(snap["text"]), "Software Engineer") {
		t.Fatalf("task did not come back after its tab was closed: %v", snap["text"])
	}
	if nb := h.m.sessions["apply-b"].cp.YourTab; nb == taskB || nb == "" {
		t.Fatalf("expected a new tab, got %q", nb)
	}
	if n := h.m.yourChrome().dials; n != 1 {
		t.Fatalf("reopening a tab opened a new connection (%d)", n)
	}

	status := h.call("browser_runner_status", map[string]any{})
	yc, _ := status["your_chrome"].(map[string]any)
	if yc["ready"] != true || yc["connected"] != true {
		t.Fatalf("status your_chrome: %v", status["your_chrome"])
	}
	h.call("browser_runner_close", map[string]any{"session_id": "apply-b"})
	if tabs = pageTargets(t, h.ctx, obs); tabs[mine] == "" {
		t.Fatalf("the user's own tab was closed: %v", tabs)
	}
}

func TestE2EYourChromeResumesAfterAgentRestart(t *testing.T) {
	h, _, base, _ := newHarness(t)
	obs, mine := userChromeForTest(t, h, base+"/login")
	h.call("browser_runner_start", map[string]any{"task_id": "restart", "browser": browserYourChrome, "allowed_origins": []any{base}, "start_url": base + "/apply/1"})
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "restart"})
	h.call("browser_runner_act", map[string]any{"session_id": "restart", "snapshot_id": snap["snapshot_id"], "ref": ref(t, snap, "textbox", "full name"), "action": "fill", "value": "Keep this draft"})
	target := h.m.sessions["restart"].cp.YourTab
	h.m.Close()
	if tabs := pageTargets(t, h.ctx, obs); tabs[mine] == "" || tabs[target] == "" {
		t.Fatalf("stopping Agent closed Chrome tabs: %v", tabs)
	}
	h.m = New()
	t.Cleanup(h.m.Close)
	h.call("browser_runner_start", map[string]any{"task_id": "restart", "allowed_origins": []any{base}})
	snap = h.call("browser_runner_snapshot", map[string]any{"session_id": "restart"})
	if h.m.sessions["restart"].cp.YourTab != target || !strings.Contains(asString(snap["elements"]), "Keep this draft") {
		t.Fatalf("restart did not recover the original tab and form: %v", snap)
	}
	// Idle pause detaches without erasing the form. Close still closes its
	// own tab using the shared connection, without opening another one.
	s := h.m.sessions["restart"]
	s.mu.Lock()
	s.shutdownBrowser(true)
	s.mu.Unlock()
	out := h.call("browser_runner_close", map[string]any{"session_id": "restart", "forget": true})
	if out["profile_removed"] != false || out["tab_left_open"] != false {
		t.Fatalf("closing a paused Chrome task: %v", out)
	}
	if tabs := pageTargets(t, h.ctx, obs); tabs[target] != "" || tabs[mine] == "" {
		t.Fatalf("close affected the wrong tabs: %v", tabs)
	}
}

// With no task left, Remote Arc lets go of the user's Chrome, so its
// "controlled by automated software" banner goes away.
func TestE2EYourChromeDisconnectsWhenIdle(t *testing.T) {
	h, _, base, _ := newHarness(t)
	userChromeForTest(t, h, base+"/")
	old := yourChromeLinger
	yourChromeLinger = 300 * time.Millisecond
	t.Cleanup(func() { yourChromeLinger = old })

	h.call("browser_runner_start", map[string]any{"task_id": "quick", "browser": "your_chrome", "allowed_origins": []any{base}, "start_url": base + "/"})
	if !h.m.yourChrome().connected() {
		t.Fatal("not connected while a task runs")
	}
	h.call("browser_runner_close", map[string]any{"session_id": "quick"})
	deadline := time.Now().Add(3 * time.Second)
	for h.m.yourChrome().connected() && time.Now().Before(deadline) {
		time.Sleep(50 * time.Millisecond)
	}
	if h.m.yourChrome().connected() {
		t.Fatal("still attached to the user's Chrome after the last task closed")
	}
	// A later task connects again.
	h.call("browser_runner_start", map[string]any{"task_id": "later", "browser": "your_chrome", "allowed_origins": []any{base}, "start_url": base + "/"})
	if n := h.m.yourChrome().dials; n != 2 {
		t.Fatalf("dials %d", n)
	}
}

func TestE2EYourChromeCloseAfterUserClosedPausedTab(t *testing.T) {
	h, _, base, _ := newHarness(t)
	obs, mine := userChromeForTest(t, h, base+"/")
	h.call("browser_runner_start", map[string]any{"task_id": "paused", "browser": browserYourChrome, "allowed_origins": []any{base}, "start_url": base})
	s := h.m.sessions["paused"]
	target := s.cp.YourTab
	s.mu.Lock()
	s.shutdownBrowser(true)
	s.mu.Unlock()
	if e := obs.Call(h.ctx, "Target.closeTarget", map[string]any{"targetId": target}, nil); e != nil {
		t.Fatal(e)
	}
	h.call("browser_runner_close", map[string]any{"session_id": "paused", "forget": true})
	if tabs := pageTargets(t, h.ctx, obs); tabs[mine] == "" || tabs[target] != "" {
		t.Fatalf("forget affected the wrong tabs: %v", tabs)
	}
}

// Before the user allowed remote debugging, starting a task opens the switch
// page in their Chrome and says what the user has to do.
func TestYourChromeNotEnabledOpensTheSwitch(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("uses a shell script as the browser")
	}
	h := &harness{t: t, m: New(), ctx: context.Background()}
	t.Cleanup(h.m.Close)
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	t.Setenv("REMOTEARC_YOUR_CHROME_DIR", t.TempDir())
	opened := filepath.Join(t.TempDir(), "opened")
	fake := filepath.Join(t.TempDir(), "chrome")
	if e := os.WriteFile(fake, []byte("#!/bin/sh\necho \"$@\" > "+opened+"\n"), 0700); e != nil {
		t.Fatal(e)
	}
	t.Setenv("REMOTEARC_YOUR_CHROME_PATH", fake)
	old := enableWait
	enableWait = 500 * time.Millisecond
	t.Cleanup(func() { enableWait = old })

	h.fail("browser_runner_start", map[string]any{"task_id": "t1", "browser": "your_chrome", "allowed_origins": []any{"https://jobs.example.test"}}, "YOUR_CHROME_NOT_ENABLED")
	deadline := time.Now().Add(2 * time.Second)
	var b []byte
	for time.Now().Before(deadline) {
		if b, _ = os.ReadFile(opened); len(b) > 0 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if strings.TrimSpace(string(b)) != inspectURL {
		t.Fatalf("switch page not opened: %q", b)
	}
}

func TestYourChromeInputValidation(t *testing.T) {
	h := &harness{t: t, m: New(), ctx: context.Background()}
	t.Cleanup(h.m.Close)
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	h.fail("browser_runner_start", map[string]any{"task_id": "t2", "browser": "your_chrome", "profile": "jenny", "allowed_origins": []any{"https://jobs.example.test"}}, "leave profile out")
	h.fail("browser_runner_start", map[string]any{"task_id": "t3", "browser": "your_chrome", "headless": true, "allowed_origins": []any{"https://jobs.example.test"}}, "always visible")
	h.fail("browser_runner_start", map[string]any{"task_id": "t4", "browser": "firefox", "allowed_origins": []any{"https://jobs.example.test"}}, `browser must be`)
}

func asString(v any) string { return fmt.Sprint(v) }
