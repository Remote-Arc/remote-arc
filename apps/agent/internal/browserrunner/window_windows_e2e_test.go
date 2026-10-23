//go:build windows

package browserrunner

import (
	"os"
	"syscall"
	"testing"
	"time"
)

var getForegroundWindow = syscall.NewLazyDLL("user32.dll").NewProc("GetForegroundWindow")

func foreground() uintptr {
	h, _, _ := getForegroundWindow.Call()
	return h
}

// On a real Windows desktop, starting a task leaves the user where they are:
// the window the user is in keeps the focus and the task window stays off
// screen. Run with REMOTEARC_E2E_QUIET_CHECK=1 while using the computer.
func TestE2EWindowsTaskDoesNotTakeFocus(t *testing.T) {
	if os.Getenv("REMOTEARC_E2E_QUIET_CHECK") != "1" {
		t.Skip("set REMOTEARC_E2E_QUIET_CHECK=1 on an interactive Windows desktop")
	}
	h, _, base, _ := newHarness(t)
	before := foreground()
	h.call("browser_runner_start", map[string]any{"task_id": "quiet-win", "allowed_origins": []any{base}, "start_url": base + "/apply/1"})
	snap := h.call("browser_runner_snapshot", map[string]any{"session_id": "quiet-win"})
	h.call("browser_runner_act", map[string]any{"session_id": "quiet-win", "snapshot_id": snap["snapshot_id"], "ref": ref(t, snap, "textbox", "full name"), "action": "fill", "value": "Sam Example"})
	time.Sleep(time.Second)
	if after := foreground(); after != before {
		t.Fatalf("starting a task moved the focus: foreground window %#x -> %#x", before, after)
	}
	s, _ := h.m.get("quiet-win")
	s.mu.Lock()
	_, b, e := s.window(h.ctx)
	s.mu.Unlock()
	if e != nil {
		t.Fatal(e)
	}
	if b.WindowState != "minimized" && b.Left > offscreen/2 && b.Top > offscreen/2 {
		t.Fatalf("the task window is on screen: %+v", b)
	}
	t.Logf("task window %+v; focus stayed on %#x", b, before)
	h.call("browser_runner_close", map[string]any{"session_id": "quiet-win", "forget": true})
}
