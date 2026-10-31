//go:build windows

package browserrunner

import (
	"os"
	"runtime"
	"syscall"
	"testing"
	"time"
	"unsafe"
)

var getForegroundWindow = syscall.NewLazyDLL("user32.dll").NewProc("GetForegroundWindow")

func foreground() uintptr {
	h, _, _ := getForegroundWindow.Call()
	return h
}

func TestE2EWindowsCoveredHandoffDoesNotTakeFocus(t *testing.T) {
	requireHandoffWindow(t)
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	h, _, base, _ := newHarness(t)
	h.call("browser_runner_start", map[string]any{"task_id": "covered", "allowed_origins": []string{base}, "start_url": base + "/login"})
	h.call("browser_runner_snapshot", map[string]any{"session_id": "covered"})
	s, _ := h.m.get("covered")
	if !s.cp.AttentionShown {
		t.Fatal("initial automatic handoff was not shown")
	}
	assertHandoffVisible(t, s, h.ctx)
	_, bounds, err := s.window(h.ctx)
	if err != nil {
		t.Fatal(err)
	}
	class, _ := syscall.UTF16PtrFromString("STATIC")
	title, _ := syscall.UTF16PtrFromString("Remote Arc occlusion test")
	// An actual native window covers the Runner. It never activates, and is
	// destroyed before this test's OS thread is released.
	cover, _, err := winUser32.NewProc("CreateWindowExW").Call(0x08000080, uintptr(unsafe.Pointer(class)), uintptr(unsafe.Pointer(title)), 0x90000000, uintptr(bounds.Left), uintptr(bounds.Top), uintptr(bounds.Width), uintptr(bounds.Height), 0, 0, 0, 0)
	if cover == 0 {
		t.Fatal("create covering window", err)
	}
	defer winUser32.NewProc("DestroyWindow").Call(cover)
	if result, _, err := winPosition.Call(cover, ^uintptr(0), 0, 0, 0, 0, 0x0013); result == 0 {
		t.Fatal(err)
	}
	winPosition.Call(cover, ^uintptr(1), 0, 0, 0, 0, 0x0013)
	if s.windowIsVisible(h.ctx) {
		t.Fatal("on-screen but covered window reported visible")
	}
	h.call("browser_runner_snapshot", map[string]any{"session_id": "covered"})
	if s.windowIsVisible(h.ctx) {
		t.Fatal("polling raised an already delivered handoff again")
	}
	before := foreground()
	target, _, ok := s.nativeTaskWindow()
	if !ok {
		t.Fatal("missing native task window")
	}
	if before == 0 || before == target.hwnd {
		// A hosted desktop may have no foreground app besides the test browser.
		// Give our own cover window focus, never a real user's application, so
		// the no-focus-steal assertion still has an independent reference HWND.
		style, _, _ := winWindowLong.Call(cover, ^uintptr(19))
		winUser32.NewProc("SetWindowLongPtrW").Call(cover, ^uintptr(19), style&^0x08000000)
		winUser32.NewProc("SetForegroundWindow").Call(cover)
		deadline := time.Now().Add(time.Second)
		for foreground() != cover && time.Now().Before(deadline) {
			time.Sleep(10 * time.Millisecond)
		}
		if fg := foreground(); fg == cover {
			before = fg
		} else if before == target.hwnd {
			t.Fatal("fixture could not focus its independent native cover window")
		}
	}
	for i := 0; i < 2; i++ {
		if err := s.setVisible(h.ctx, true); err != nil {
			t.Fatal(err)
		}
		assertHandoffVisible(t, s, h.ctx)
		if after := foreground(); after != before {
			t.Fatalf("raising stole keyboard focus: %#x -> %#x", before, after)
		}
		if i == 0 {
			winPosition.Call(cover, ^uintptr(0), 0, 0, 0, 0, 0x0013)
			winPosition.Call(cover, ^uintptr(1), 0, 0, 0, 0, 0x0013)
			if s.windowIsVisible(h.ctx) {
				t.Fatal("fixture failed to re-cover the task")
			}
		}
	}
	target, _, ok = s.nativeTaskWindow()
	if !ok {
		t.Fatal("missing native task window")
	}
	style, _, _ := winWindowLong.Call(target.hwnd, ^uintptr(19))
	if style&0x8 != 0 {
		t.Fatal("task was left permanently TOPMOST")
	}
	// Also identify a browser that survived the Agent: it has no exec.Cmd.
	proc := s.proc.cmd
	s.proc.cmd = nil
	reattachedPID := s.nativePID()
	s.proc.cmd = proc
	if reattachedPID != target.pid {
		t.Fatalf("reattached task resolves to PID %d, want %d", reattachedPID, target.pid)
	}
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
	if b.WindowState == "minimized" || b.Left > offscreen/2 {
		t.Fatalf("the task window is on screen: %+v", b)
	}
	t.Logf("task window %+v; focus stayed on %#x", b, before)
	h.call("browser_runner_close", map[string]any{"session_id": "quiet-win", "forget": true})
}
