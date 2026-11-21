//go:build windows && (amd64 || arm64)

package desktop

import (
	"errors"
	"runtime"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

// worker runs every capture, accessibility and input call on one OS thread
// that is per-monitor DPI aware and in the COM multithreaded apartment, so
// coordinates are physical pixels everywhere.
type worker struct {
	once sync.Once
	jobs chan func()
	dpi  bool
}

func (w *worker) do(job func() error) error {
	w.once.Do(func() {
		w.jobs = make(chan func())
		ready := make(chan struct{})
		go func() {
			runtime.LockOSThread()
			if procSetThreadDpiAwarenessContext.Find() == nil {
				previous, _, _ := procSetThreadDpiAwarenessContext.Call(dpiPerMonitorV2)
				w.dpi = previous != 0
			}
			procCoInitializeEx.Call(0, 0) // COINIT_MULTITHREADED
			close(ready)
			for job := range w.jobs {
				job()
			}
		}()
		<-ready
	})
	done := make(chan error, 1)
	w.jobs <- func() { done <- job() }
	return <-done
}

// watcher owns the low-level input hooks and the on-screen notice. Hooks
// must be answered fast, so this thread does nothing else.
type watcher struct {
	once     sync.Once
	err      error
	lastUser atomic.Int64 // unix nanoseconds of the last physical input
	// injected counts hook events that carried an injected flag, which is
	// how the Agent's own SendInput arrives.
	injected   atomic.Int64
	notice     atomic.Uintptr
	hidden     atomic.Bool // the notice could not be excluded from capture
	showNotice atomic.Bool
}

var theWatcher watcher

var noticeText = "Remote Arc · AI is using this computer — move the mouse or press any key to take over"

var (
	mouseHookCallback = syscall.NewCallback(func(code, wparam, lparam uintptr) uintptr {
		if int32(code) >= 0 {
			info := (*mouseHookInfo)(at(lparam))
			theWatcher.record(info.Flags, llmhfInjected|llmhfLowerInjected)
		}
		r, _, _ := procCallNextHookEx.Call(0, code, wparam, lparam)
		return r
	})
	keyboardHookCallback = syscall.NewCallback(func(code, wparam, lparam uintptr) uintptr {
		if int32(code) >= 0 {
			info := (*keyboardHookInfo)(at(lparam))
			theWatcher.record(info.Flags, llkhfInjected|llkhfLowerInjected)
		}
		r, _, _ := procCallNextHookEx.Call(0, code, wparam, lparam)
		return r
	})
	noticeProcCallback = syscall.NewCallback(noticeProc)
)

// record sorts one hook event: input with an injected flag is a program's,
// the Agent's included; anything else is the person's.
func (w *watcher) record(flags, injectedMask uint32) {
	if flags&injectedMask != 0 {
		w.injected.Add(1)
		return
	}
	w.lastUser.Store(time.Now().UnixNano())
}

// start installs the hooks and creates the hidden notice window. Desktop
// control stays off if the hooks cannot be installed: without them the
// Agent could not tell when the person takes over.
func (w *watcher) start() error {
	w.once.Do(func() {
		result := make(chan error, 1)
		go func() {
			runtime.LockOSThread()
			if procSetThreadDpiAwarenessContext.Find() == nil {
				procSetThreadDpiAwarenessContext.Call(dpiPerMonitorV2)
			}
			module, _, _ := procGetModuleHandleW.Call(0)
			mouse, _, _ := procSetWindowsHookExW.Call(whMouseLL, mouseHookCallback, module, 0)
			keyboard, _, _ := procSetWindowsHookExW.Call(whKeyboardLL, keyboardHookCallback, module, 0)
			if mouse == 0 || keyboard == 0 {
				result <- errors.New("Windows did not allow the Agent to watch for the user's mouse and keyboard, so desktop control stays off")
				return
			}
			w.createNotice(module)
			result <- nil
			var msg winMsg
			for {
				r, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
				if int32(r) <= 0 {
					return
				}
				procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
				procDispatchMessageW.Call(uintptr(unsafe.Pointer(&msg)))
			}
		}()
		w.err = <-result
	})
	return w.err
}

func (w *watcher) createNotice(module uintptr) {
	class := utf16Ptr("RemoteArcDesktopNotice")
	wc := wndClassEx{WndProc: noticeProcCallback, Instance: module, ClassName: class}
	wc.Size = uint32(unsafe.Sizeof(wc))
	procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
	hwnd, _, _ := procCreateWindowExW.Call(
		wsExTopmost|wsExLayered|wsExTransparent|wsExToolWindow|wsExNoActivate,
		uintptr(unsafe.Pointer(class)), uintptr(unsafe.Pointer(utf16Ptr("Remote Arc"))),
		wsPopup, 0, 0, 1, 1, 0, 0, module, 0)
	if hwnd == 0 {
		return
	}
	procSetLayeredWindowAttributes.Call(hwnd, 0, 235, lwaAlpha)
	// Windows 10 2004 and later leave this window out of every screenshot.
	// Older versions cannot, so the notice is hidden while a screenshot is taken.
	if ok, _, _ := procSetWindowDisplayAffinity.Call(hwnd, wdaExcludeCapture); ok == 0 {
		w.hidden.Store(true)
	}
	w.notice.Store(hwnd)
}

func (w *watcher) indicate(active bool) {
	w.showNotice.Store(active)
	if hwnd := w.notice.Load(); hwnd != 0 {
		procPostMessageW.Call(hwnd, wmShowNotice, boolArg(active), 0)
	}
}

// aroundCapture hides the notice during a screenshot only where Windows
// cannot exclude it from capture.
func (w *watcher) aroundCapture(capture func() error) error {
	hwnd := w.notice.Load()
	if hwnd == 0 || !w.hidden.Load() || !w.showNotice.Load() {
		return capture()
	}
	procShowWindow.Call(hwnd, swHide)
	defer procShowWindow.Call(hwnd, swShowNoActivate)
	time.Sleep(60 * time.Millisecond) // let the compositor drop the window
	return capture()
}

func boolArg(b bool) uintptr {
	if b {
		return 1
	}
	return 0
}

func noticeProc(hwnd, msg, wparam, lparam uintptr) uintptr {
	switch msg {
	case wmNCHitTest:
		return ^uintptr(0) // HTTRANSPARENT: clicks go to the window below
	case wmShowNotice:
		if wparam == 0 {
			procShowWindow.Call(hwnd, swHide)
			return 0
		}
		dpi := uintptr(96)
		if procGetDpiForWindow.Find() == nil {
			if d, _, _ := procGetDpiForWindow.Call(hwnd); d != 0 {
				dpi = d
			}
		}
		// Wide enough to notice at a glance: at least 40% of the primary display.
		screen, _, _ := procGetSystemMetrics.Call(0) // SM_CXSCREEN, the primary display
		width, height := max(820*dpi/96, screen*2/5), 50*dpi/96
		x := (int(screen) - int(width)) / 2
		procSetWindowPos.Call(hwnd, ^uintptr(0), uintptr(x), 8*dpi/96, width, height, swpNoActivate) // HWND_TOPMOST
		procShowWindow.Call(hwnd, swShowNoActivate)
		return 0
	case wmPaint:
		paintNotice(hwnd)
		return 0
	}
	r, _, _ := procDefWindowProcW.Call(hwnd, msg, wparam, lparam)
	return r
}

func paintNotice(hwnd uintptr) {
	var ps paintStruct
	hdc, _, _ := procBeginPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
	if hdc == 0 {
		return
	}
	defer procEndPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
	dpi := uintptr(96)
	if procGetDpiForWindow.Find() == nil {
		if d, _, _ := procGetDpiForWindow.Call(hwnd); d != 0 {
			dpi = d
		}
	}
	scale := func(v int32) int32 { return v * int32(dpi) / 96 }
	var rc winRect
	procGetClientRect.Call(hwnd, uintptr(unsafe.Pointer(&rc)))
	// An amber frame around a violet bar, both COLORREF 0x00BBGGRR.
	fill := func(r winRect, color uintptr) {
		brush, _, _ := procCreateSolidBrush.Call(color)
		procFillRect.Call(hdc, uintptr(unsafe.Pointer(&r)), brush)
		procDeleteObject.Call(brush)
	}
	fill(rc, 0x0000C4FF)
	border := scale(3)
	inner := winRect{rc.Left + border, rc.Top + border, rc.Right - border, rc.Bottom - border}
	fill(inner, 0x00D9286D)
	// A red dot, like a recording light.
	dot := scale(14)
	cy := (rc.Top + rc.Bottom) / 2
	red, _, _ := procCreateSolidBrush.Call(0x003B3BFF)
	oldBrush, _, _ := procSelectObject.Call(hdc, red)
	nullPen, _, _ := procGetStockObject.Call(8) // NULL_PEN
	oldPen, _, _ := procSelectObject.Call(hdc, nullPen)
	left := inner.Left + scale(16)
	procEllipse.Call(hdc, uintptr(left), uintptr(cy-dot/2), uintptr(left+dot), uintptr(cy+dot/2))
	procSelectObject.Call(hdc, oldPen)
	procSelectObject.Call(hdc, oldBrush)
	procDeleteObject.Call(red)
	font, _, _ := procCreateFontW.Call(uintptr(-int32(13*dpi/72)), 0, 0, 0, 700, 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(utf16Ptr("Segoe UI")))) // 13 pt bold
	if font != 0 {
		old, _, _ := procSelectObject.Call(hdc, font)
		defer procDeleteObject.Call(font)
		defer procSelectObject.Call(hdc, old)
	}
	procSetBkMode.Call(hdc, 1) // TRANSPARENT
	procSetTextColor.Call(hdc, 0x00FFFFFF)
	text, _ := syscall.UTF16FromString(noticeText)
	textRect := winRect{left + dot + scale(10), inner.Top, inner.Right - scale(16), inner.Bottom}
	procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&text[0])), ^uintptr(0), uintptr(unsafe.Pointer(&textRect)), 0x1|0x4|0x20|0x800|0x8000) // center, vcenter, single line, no prefix, end ellipsis
}
