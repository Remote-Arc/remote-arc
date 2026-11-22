//go:build windows && (amd64 || arm64)

package desktop

import (
	"os"
	"runtime"
	"sync/atomic"
	"syscall"
	"testing"
	"time"
	"unsafe"
)

var (
	procPeekMessageW  = user32.NewProc("PeekMessageW")
	procDestroyWindow = user32.NewProc("DestroyWindow")
	procSetWindowText = user32.NewProc("SetWindowTextW")
)

// fixtureWindow shows a window with a button and an empty text box on its
// own thread, which pumps messages so UI Automation and input reach it.
func fixtureWindow(t *testing.T) (window, button, edit uintptr) {
	t.Helper()
	type handles struct{ window, button, edit uintptr }
	ready := make(chan handles, 1)
	var stop atomic.Bool
	done := make(chan struct{})
	go func() {
		defer close(done)
		runtime.LockOSThread()
		procSetThreadDpiAwarenessContext.Call(dpiPerMonitorV2)
		module, _, _ := procGetModuleHandleW.Call(0)
		create := func(exStyle uintptr, class, text string, style, x, y, w, h, parent uintptr) uintptr {
			hwnd, _, _ := procCreateWindowExW.Call(exStyle, uintptr(unsafe.Pointer(utf16Ptr(class))), uintptr(unsafe.Pointer(utf16Ptr(text))), style, x, y, w, h, parent, 0, module, 0)
			return hwnd
		}
		const visible, overlapped, child, border = 0x10000000, 0x00CF0000, 0x40000000, 0x00800000
		// Topmost: a process in the background may not bring its window to the
		// front, and the clicks must land on this window, not the person's.
		top := create(wsExTopmost, "STATIC", "Remote Arc desktop test", visible|overlapped, 120, 120, 520, 260, 0)
		b := create(0, "BUTTON", "Remote Arc test button", visible|child, 20, 20, 220, 40, top)
		e := create(0, "EDIT", "", visible|child|border, 20, 90, 300, 32, top)
		procSetForegroundWindow.Call(top)
		ready <- handles{top, b, e}
		var msg winMsg
		for !stop.Load() {
			for {
				got, _, _ := procPeekMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0, 1) // PM_REMOVE
				if got == 0 {
					break
				}
				procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
				procDispatchMessageW.Call(uintptr(unsafe.Pointer(&msg)))
			}
			time.Sleep(5 * time.Millisecond)
		}
		procDestroyWindow.Call(top)
	}()
	h := <-ready
	t.Cleanup(func() { stop.Store(true); <-done })
	if h.window == 0 || h.button == 0 || h.edit == 0 {
		t.Fatal("could not create the fixture window")
	}
	time.Sleep(300 * time.Millisecond)
	return h.window, h.button, h.edit
}

func windowText(hwnd uintptr) string {
	var text [256]uint16
	n, _, _ := procGetWindowTextW.Call(hwnd, uintptr(unsafe.Pointer(&text[0])), uintptr(len(text)))
	return syscall.UTF16ToString(text[:n])
}

// The real-window test takes the foreground and sends input, so it must not
// share the screen with other tests that need focus (the browser runner's
// window tests run in parallel in `go test ./...`). CI runs it alone in its own
// step; locally:
//
//	REMOTEARC_DESKTOP_WINDOW_TEST=1 go test ./internal/desktop -run TestWindowsDesktopAgainstARealWindow
func TestWindowsDesktopAgainstARealWindow(t *testing.T) {
	if os.Getenv("REMOTEARC_DESKTOP_WINDOW_TEST") != "1" {
		t.Skip("takes the foreground; runs alone with REMOTEARC_DESKTOP_WINDOW_TEST=1")
	}
	p := &windowsPlatform{}
	if err := p.Ready(); err != nil {
		t.Fatal(err)
	}
	if p.Locked() {
		t.Skip("this session has no interactive desktop (locked, or a service session)")
	}
	if err := p.Start(); err != nil {
		t.Fatal(err)
	}
	displays, err := p.Displays()
	if err != nil || len(displays) == 0 {
		t.Fatalf("displays: %v %v", displays, err)
	}
	img, err := p.Capture(displays[0].Bounds)
	if err != nil || img.Bounds().Dx() != displays[0].Bounds.W || img.Bounds().Dy() != displays[0].Bounds.H {
		t.Fatalf("capture %v: %v", displays[0].Bounds, err)
	}

	window, button, edit := fixtureWindow(t)
	windows, err := p.Windows()
	if err != nil {
		t.Fatal(err)
	}
	listed := false
	for _, w := range windows {
		listed = listed || (w.Handle == window && w.Title == "Remote Arc desktop test")
	}
	if !listed {
		t.Fatalf("the fixture window is listed: %+v", windows)
	}

	elements, _, err := p.Elements(Window{Handle: window}, 50)
	if err != nil {
		t.Fatal(err)
	}
	var found *Element
	for i := range elements {
		if elements[i].Role == "button" && elements[i].Name == "Remote Arc test button" {
			found = &elements[i]
		}
	}
	if found == nil {
		t.Fatalf("UI Automation finds the button: %+v", elements)
	}
	var want winRect
	p.w.do(func() error { procGetWindowRect.Call(button, uintptr(unsafe.Pointer(&want))); return nil })
	if r := want.rect(); abs(r.X-found.Bounds.X) > 2 || abs(r.Y-found.Bounds.Y) > 2 || abs(r.W-found.Bounds.W) > 2 {
		t.Fatalf("button bounds: UI Automation %+v, window %+v", found.Bounds, r)
	}
	if !found.Enabled {
		t.Fatal("the button is enabled")
	}

	injectedBefore := theWatcher.injected.Load()
	var editRect winRect
	p.w.do(func() error { procGetWindowRect.Call(edit, uintptr(unsafe.Pointer(&editRect))); return nil })
	r := editRect.rect()
	x, y := r.X+r.W/2, r.Y+r.H/2
	if at, err := p.WindowAt(x, y); err != nil || at.Handle != window {
		t.Fatalf("the text box is covered by another window (%+v, %v)", at, err)
	}
	click := clickSteps(x, y, "left", 1)
	if sent, err := p.Send(click, func() bool { return false }); err != nil || sent != len(click) {
		t.Fatalf("click: %d of %d, %v", sent, len(click), err)
	}
	cx, cy, err := p.Cursor()
	if err != nil || abs(cx-x) > 1 || abs(cy-y) > 1 {
		t.Fatalf("cursor at %d,%d, want %d,%d (%v)", cx, cy, x, y, err)
	}
	time.Sleep(200 * time.Millisecond)
	// Type only once the click gave the fixture keyboard focus.
	if front := rootOf(foregroundWindow()); front != window {
		t.Fatalf("the click did not bring the fixture to the front (front window %x)", front)
	}
	text := textSteps("héllo 😀")
	if sent, err := p.Send(text, func() bool { return false }); err != nil || sent != len(text) {
		t.Fatalf("type: %d of %d, %v", sent, len(text), err)
	}
	time.Sleep(200 * time.Millisecond)
	if got := windowText(edit); got != "héllo 😀" {
		t.Fatalf("typed text: %q", got)
	}
	// Every button and key event the Agent sent reached the hooks marked as
	// injected, so none of it can count as the person's. (Whether the person's
	// time stayed still depends on who else is at the computer: a person, or a
	// CI virtual machine's own pointer device.)
	sentEvents := 0
	for _, step := range append(click, text...) {
		switch step.Kind {
		case StepButtonDown, StepButtonUp:
			sentEvents++
		case StepChar:
			sentEvents += 2 // down and up
		}
	}
	time.Sleep(100 * time.Millisecond)
	if seen := theWatcher.injected.Load() - injectedBefore; seen < int64(sentEvents) {
		t.Fatalf("the hooks saw %d injected events of the %d the Agent sent", seen, sentEvents)
	}
	procSetWindowText.Call(edit, uintptr(unsafe.Pointer(utf16Ptr(""))))
}

func TestWindowsHookSortsInjectedInputFromThePersons(t *testing.T) {
	w := &watcher{}
	for _, flags := range []uint32{llmhfInjected, llmhfLowerInjected, llmhfInjected | llmhfLowerInjected} {
		w.record(flags, llmhfInjected|llmhfLowerInjected)
	}
	w.record(llkhfInjected, llkhfInjected|llkhfLowerInjected)
	if w.injected.Load() != 4 || w.lastUser.Load() != 0 {
		t.Fatalf("injected input is the Agent's: %d injected, last user %d", w.injected.Load(), w.lastUser.Load())
	}
	// Other flags (for example LLKHF_EXTENDED or LLKHF_UP) are still the person's.
	w.record(0x01|0x80, llkhfInjected|llkhfLowerInjected)
	if w.lastUser.Load() == 0 || w.injected.Load() != 4 {
		t.Fatal("physical input is the person's")
	}
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}
