//go:build windows && (amd64 || arm64)

package desktop

import (
	"errors"
	"fmt"
	"image"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

type windowsPlatform struct {
	w   worker
	uia uiAutomation
}

func newPlatform() platform { return &windowsPlatform{} }

func (p *windowsPlatform) Ready() error {
	if procSetThreadDpiAwarenessContext.Find() != nil || procSendInput.Find() != nil {
		return errors.New("desktop control needs Windows 10 version 1607 or later")
	}
	return nil
}

func (p *windowsPlatform) Start() error { return theWatcher.start() }

var (
	enumQueries sync.Map
	enumQueryID atomic.Uintptr
	// One callback each: Go has a finite table of Windows callbacks.
	monitorCallback = syscall.NewCallback(func(monitor, hdc, rect, key uintptr) uintptr {
		if value, ok := enumQueries.Load(key); ok {
			list := value.(*[]uintptr)
			*list = append(*list, monitor)
		}
		return 1
	})
	windowCallback = syscall.NewCallback(func(hwnd, key uintptr) uintptr {
		if value, ok := enumQueries.Load(key); ok {
			list := value.(*[]uintptr)
			*list = append(*list, hwnd)
		}
		return 1
	})
)

func enumerate(proc *syscall.LazyProc, callback uintptr, first uintptr, withFirst bool) []uintptr {
	var list []uintptr
	key := enumQueryID.Add(1)
	enumQueries.Store(key, &list)
	defer enumQueries.Delete(key)
	if withFirst {
		proc.Call(first, 0, callback, key)
	} else {
		proc.Call(callback, key)
	}
	return list
}

func (p *windowsPlatform) Displays() ([]Display, error) {
	var displays []Display
	err := p.w.do(func() error {
		for _, monitor := range enumerate(procEnumDisplayMonitors, monitorCallback, 0, true) {
			info := monitorInfo{}
			info.Size = uint32(unsafe.Sizeof(info))
			if ok, _, _ := procGetMonitorInfoW.Call(monitor, uintptr(unsafe.Pointer(&info))); ok != 0 {
				displays = append(displays, Display{Bounds: info.Monitor.rect(), Primary: info.Flags&1 != 0})
			}
		}
		if len(displays) == 0 {
			return errors.New("no display is attached")
		}
		return nil
	})
	return displays, err
}

func (p *windowsPlatform) Capture(r Rect) (*image.RGBA, error) {
	var img *image.RGBA
	err := p.w.do(func() error {
		return theWatcher.aroundCapture(func() error {
			var err error
			img, err = captureRect(r)
			return err
		})
	})
	return img, err
}

func captureRect(r Rect) (*image.RGBA, error) {
	screen, _, _ := procGetDC.Call(0)
	if screen == 0 {
		return nil, errors.New("the screen is not available")
	}
	defer procReleaseDC.Call(0, screen)
	memory, _, _ := procCreateCompatibleDC.Call(screen)
	if memory == 0 {
		return nil, errors.New("could not create a drawing surface")
	}
	defer procDeleteDC.Call(memory)
	bitmap, _, _ := procCreateCompatibleBitmap.Call(screen, uintptr(r.W), uintptr(r.H))
	if bitmap == 0 {
		return nil, errors.New("could not create a bitmap")
	}
	defer procDeleteObject.Call(bitmap)
	old, _, _ := procSelectObject.Call(memory, bitmap)
	ok, _, _ := procBitBlt.Call(memory, 0, 0, uintptr(r.W), uintptr(r.H), screen, uintptr(int32(r.X)), uintptr(int32(r.Y)), srcCopy|captureBlt)
	// GetDIBits needs the bitmap out of the device context.
	procSelectObject.Call(memory, old)
	if ok == 0 {
		return nil, errors.New("Windows refused to copy the screen")
	}
	info := bitmapInfo{Header: bitmapInfoHeader{Width: int32(r.W), Height: -int32(r.H), Planes: 1, BitCount: 32}}
	info.Header.Size = uint32(unsafe.Sizeof(info.Header))
	img := image.NewRGBA(image.Rect(0, 0, r.W, r.H))
	lines, _, _ := procGetDIBits.Call(memory, bitmap, 0, uintptr(r.H), uintptr(unsafe.Pointer(&img.Pix[0])), uintptr(unsafe.Pointer(&info)), 0)
	if int(lines) != r.H {
		return nil, errors.New("could not read the screen pixels")
	}
	for i := 0; i < len(img.Pix); i += 4 { // BGRA to RGBA
		img.Pix[i], img.Pix[i+2], img.Pix[i+3] = img.Pix[i+2], img.Pix[i], 255
	}
	return img, nil
}

func (p *windowsPlatform) Windows() ([]Window, error) {
	var windows []Window
	err := p.w.do(func() error {
		notice := theWatcher.notice.Load()
		foreground := rootOf(foregroundWindow())
		names := map[uint32]string{}
		for _, hwnd := range enumerate(procEnumWindows, windowCallback, 0, false) {
			if hwnd == notice {
				continue
			}
			if visible, _, _ := procIsWindowVisible.Call(hwnd); visible == 0 {
				continue
			}
			style, _, _ := procGetWindowLongPtrW.Call(hwnd, gwlExStyle)
			var cloaked uint32
			procDwmGetWindowAttribute.Call(hwnd, dwmaCloaked, uintptr(unsafe.Pointer(&cloaked)), unsafe.Sizeof(cloaked))
			w := describe(hwnd, foreground, names)
			if hwnd != foreground && (style&wsExToolWindow != 0 || cloaked != 0 || w.Title == "" || w.Bounds.empty()) {
				continue
			}
			windows = append(windows, w)
		}
		return nil
	})
	return windows, err
}

func foregroundWindow() uintptr {
	hwnd, _, _ := procGetForegroundWindow.Call()
	return hwnd
}

func rootOf(hwnd uintptr) uintptr {
	if hwnd == 0 {
		return 0
	}
	if root, _, _ := procGetAncestor.Call(hwnd, gaRoot); root != 0 {
		return root
	}
	return hwnd
}

func describe(hwnd, foreground uintptr, names map[uint32]string) Window {
	var title [256]uint16
	n, _, _ := procGetWindowTextW.Call(hwnd, uintptr(unsafe.Pointer(&title[0])), uintptr(len(title)))
	var pid uint32
	procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
	var r winRect
	if hr, _, _ := procDwmGetWindowAttribute.Call(hwnd, dwmaFrameBounds, uintptr(unsafe.Pointer(&r)), unsafe.Sizeof(r)); hr != 0 {
		procGetWindowRect.Call(hwnd, uintptr(unsafe.Pointer(&r)))
	}
	iconic, _, _ := procIsIconic.Call(hwnd)
	app, ok := names[pid]
	if !ok {
		app = processName(pid)
		names[pid] = app
	}
	return Window{Handle: hwnd, Title: syscall.UTF16ToString(title[:n]), App: app, PID: pid, Bounds: r.rect(), Minimized: iconic != 0, Foreground: hwnd == foreground}
}

// processName is the lower-case executable name, or "unknown" when the
// process cannot be inspected. Unknown processes are never treated as safe
// to type into silently: they are simply named so.
func processName(pid uint32) string {
	if pid == uint32(os.Getpid()) {
		return "remotelink.exe"
	}
	handle, _, _ := procOpenProcess.Call(processQueryLimited, 0, uintptr(pid))
	if handle == 0 {
		return "unknown"
	}
	defer procCloseHandle.Call(handle)
	var path [520]uint16
	size := uint32(len(path))
	if ok, _, _ := procQueryFullProcessImageNameW.Call(handle, 0, uintptr(unsafe.Pointer(&path[0])), uintptr(unsafe.Pointer(&size))); ok == 0 {
		return "unknown"
	}
	return strings.ToLower(filepath.Base(syscall.UTF16ToString(path[:size])))
}

func (p *windowsPlatform) Elements(w Window, limit int) ([]Element, bool, error) {
	var elements []Element
	var truncated bool
	err := p.w.do(func() error {
		var err error
		elements, truncated, err = p.uia.elements(w.Handle, limit)
		return err
	})
	return elements, truncated, err
}

func (p *windowsPlatform) WindowAt(x, y int) (Window, error) {
	var w Window
	err := p.w.do(func() error {
		hwnd, _, _ := procWindowFromPoint.Call(packPoint(x, y))
		if hwnd == 0 {
			return errors.New("no window is at that point")
		}
		w = describe(rootOf(hwnd), rootOf(foregroundWindow()), map[uint32]string{})
		return nil
	})
	return w, err
}

func (p *windowsPlatform) Cursor() (int, int, error) {
	var pt winPoint
	err := p.w.do(func() error {
		if ok, _, _ := procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt))); ok == 0 {
			return errors.New("could not read the cursor position")
		}
		return nil
	})
	return int(pt.X), int(pt.Y), err
}

// Locked is true unless the normal desktop receives input from a signed-in
// person. UAC prompts and Ctrl+Alt+Del run on other desktops; the Windows 10
// and 11 lock screen (LockApp) runs on the normal one, in front of everything.
func (p *windowsPlatform) Locked() bool {
	desktop, _, _ := procOpenInputDesktop.Call(0, 0, desktopReadObjects)
	if desktop == 0 {
		return true
	}
	defer procCloseDesktop.Call(desktop)
	var name [128]uint16
	var needed uint32
	ok, _, _ := procGetUserObjectInformationW.Call(desktop, uoiName, uintptr(unsafe.Pointer(&name[0])), unsafe.Sizeof(name), uintptr(unsafe.Pointer(&needed)))
	if ok == 0 || syscall.UTF16ToString(name[:]) != "Default" {
		return true
	}
	return lockScreenApps[processName(windowPID(rootOf(foregroundWindow())))]
}

var lockScreenApps = map[string]bool{"lockapp.exe": true, "logonui.exe": true}

func windowPID(hwnd uintptr) uint32 {
	var pid uint32
	if hwnd != 0 {
		procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
	}
	return pid
}

func (p *windowsPlatform) LastUserInput() time.Time {
	if nanos := theWatcher.lastUser.Load(); nanos != 0 {
		return time.Unix(0, nanos)
	}
	return time.Time{}
}

var virtualKeys = func() map[string]uint16 {
	keys := map[string]uint16{
		"ctrl": 0x11, "alt": 0x12, "shift": 0x10, "win": 0x5B, "menu": 0x5D,
		"enter": 0x0D, "tab": 0x09, "escape": 0x1B, "backspace": 0x08, "space": 0x20,
		"pageup": 0x21, "pagedown": 0x22, "end": 0x23, "home": 0x24,
		"left": 0x25, "up": 0x26, "right": 0x27, "down": 0x28, "insert": 0x2D, "delete": 0x2E,
	}
	for c := 'a'; c <= 'z'; c++ {
		keys[string(c)] = uint16('A' + c - 'a')
	}
	for c := '0'; c <= '9'; c++ {
		keys[string(c)] = uint16(c)
	}
	for i := 1; i <= 12; i++ {
		keys[fmt.Sprintf("f%d", i)] = uint16(0x6F + i)
	}
	return keys
}()

var extendedKeys = map[string]bool{"pageup": true, "pagedown": true, "end": true, "home": true, "left": true, "up": true, "right": true, "down": true, "insert": true, "delete": true, "win": true, "menu": true}

func (p *windowsPlatform) Send(steps []Step, abort func() bool) (int, error) {
	sent := 0
	err := p.w.do(func() error {
		for _, step := range steps {
			if abort() {
				return nil
			}
			if step.Kind == StepPause {
				time.Sleep(step.Pause)
				sent++
				continue
			}
			inputs, err := toInputs(step)
			if err != nil {
				return err
			}
			n, _, callErr := procSendInput.Call(uintptr(len(inputs)), uintptr(unsafe.Pointer(&inputs[0])), unsafe.Sizeof(inputs[0]))
			if int(n) != len(inputs) {
				return fmt.Errorf("Windows blocked the input (%v). An app running as administrator does not accept input from the Agent", callErr)
			}
			sent++
		}
		return nil
	})
	return sent, err
}

func toInputs(step Step) ([]winInput, error) {
	in := winInput{}
	switch step.Kind {
	case StepMove:
		vx, _, _ := procGetSystemMetrics.Call(smXVirtualScreen)
		vy, _, _ := procGetSystemMetrics.Call(smYVirtualScreen)
		vw, _, _ := procGetSystemMetrics.Call(smCXVirtualScreen)
		vh, _, _ := procGetSystemMetrics.Call(smCYVirtualScreen)
		in.Type = inputMouse
		in.Mouse.DX = int32(normalize(step.X, int(int32(vx)), int(int32(vw))))
		in.Mouse.DY = int32(normalize(step.Y, int(int32(vy)), int(int32(vh))))
		in.Mouse.Flags = mouseMove | mouseAbsolute | mouseVirtualDesk
	case StepButtonDown, StepButtonUp:
		flags := map[string][2]uint32{"left": {mouseLeftDown, mouseLeftUp}, "right": {mouseRightDown, mouseRightUp}, "middle": {mouseMiddleDown, mouseMiddleUp}}[step.Button]
		if flags[0] == 0 {
			return nil, fmt.Errorf("unknown mouse button %q", step.Button)
		}
		in.Type = inputMouse
		in.Mouse.Flags = flags[map[bool]int{true: 0, false: 1}[step.Kind == StepButtonDown]]
	case StepWheel:
		in.Type = inputMouse
		if step.DY != 0 {
			in.Mouse.Flags = mouseWheel
			in.Mouse.MouseData = uint32(int32(step.DY * wheelDelta))
		} else {
			in.Mouse.Flags = mouseHWheel
			in.Mouse.MouseData = uint32(int32(step.DX * wheelDelta))
		}
	case StepKeyDown, StepKeyUp:
		vk, ok := virtualKeys[step.Key]
		if !ok {
			return nil, fmt.Errorf("unknown key %q", step.Key)
		}
		in.Type = inputKeyboard
		k := in.keyboard()
		k.VK = vk
		if extendedKeys[step.Key] {
			k.Flags |= keyExtended
		}
		if step.Kind == StepKeyUp {
			k.Flags |= keyUp
		}
	case StepChar:
		down, up := winInput{Type: inputKeyboard}, winInput{Type: inputKeyboard}
		down.keyboard().Scan, down.keyboard().Flags = step.Char, keyUnicode
		up.keyboard().Scan, up.keyboard().Flags = step.Char, keyUnicode|keyUp
		return []winInput{down, up}, nil
	default:
		return nil, fmt.Errorf("unknown input step %d", step.Kind)
	}
	return []winInput{in}, nil
}

// normalize maps a physical coordinate to SendInput's 0..65535 range across
// the virtual desktop.
func normalize(value, origin, size int) int {
	if size <= 1 {
		return 0
	}
	return ((value-origin)*65535 + (size-1)/2) / (size - 1)
}

func (p *windowsPlatform) Focus(w Window) error {
	return p.w.do(func() error {
		if iconic, _, _ := procIsIconic.Call(w.Handle); iconic != 0 {
			procShowWindow.Call(w.Handle, swRestore)
		}
		procSetForegroundWindow.Call(w.Handle)
		time.Sleep(150 * time.Millisecond)
		if rootOf(foregroundWindow()) != w.Handle {
			return errors.New("Windows kept another window in front. Click the window's title bar instead")
		}
		return nil
	})
}

func (p *windowsPlatform) Indicate(active bool) { theWatcher.indicate(active) }
