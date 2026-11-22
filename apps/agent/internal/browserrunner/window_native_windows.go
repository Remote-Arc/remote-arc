//go:build windows

package browserrunner

import (
	"context"
	"encoding/binary"
	"errors"
	"sync"
	"sync/atomic"
	"syscall"
	"unsafe"
)

var (
	winUser32      = syscall.NewLazyDLL("user32.dll")
	winEnumWindows = winUser32.NewProc("EnumWindows")
	winWindowPID   = winUser32.NewProc("GetWindowThreadProcessId")
	winClassName   = winUser32.NewProc("GetClassNameW")
	winRect        = winUser32.NewProc("GetWindowRect")
	winVisible     = winUser32.NewProc("IsWindowVisible")
	winIconic      = winUser32.NewProc("IsIconic")
	winWindowLong  = winUser32.NewProc("GetWindowLongPtrW")
	winPosition    = winUser32.NewProc("SetWindowPos")
	winShow        = winUser32.NewProc("ShowWindowAsync")
	winDWM         = syscall.NewLazyDLL("dwmapi.dll").NewProc("DwmGetWindowAttribute")
	winTCPTable    = syscall.NewLazyDLL("iphlpapi.dll").NewProc("GetExtendedTcpTable")
	windowQueries  sync.Map
	windowQueryID  atomic.Uintptr
	// Reusing one callback avoids exhausting Go's finite Windows callback table.
	windowEnumCallback = syscall.NewCallback(func(hwnd, key uintptr) uintptr {
		value, ok := windowQueries.Load(key)
		if !ok {
			return 0
		}
		query := value.(*[]nativeWindow)
		var pid uint32
		winWindowPID.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
		var name [256]uint16
		n, _, _ := winClassName.Call(hwnd, uintptr(unsafe.Pointer(&name[0])), uintptr(len(name)))
		var r nativeRect
		winRect.Call(hwnd, uintptr(unsafe.Pointer(&r)))
		var cloaked uint32
		if winDWM.Find() == nil {
			winDWM.Call(hwnd, 14, uintptr(unsafe.Pointer(&cloaked)), unsafe.Sizeof(cloaked))
			// Extended frame bounds exclude invisible resize borders.
			winDWM.Call(hwnd, 9, uintptr(unsafe.Pointer(&r)), unsafe.Sizeof(r))
		}
		visible, _, _ := winVisible.Call(hwnd)
		iconic, _, _ := winIconic.Call(hwnd)
		extendedStyle, _, _ := winWindowLong.Call(hwnd, ^uintptr(19)) // GWL_EXSTYLE=-20
		*query = append(*query, nativeWindow{hwnd, pid, syscall.UTF16ToString(name[:n]), r, visible != 0 && iconic == 0 && cloaked == 0 && extendedStyle&0x20 == 0})
		return 1
	})
)

type nativeRect struct{ left, top, right, bottom int32 }
type nativeWindow struct {
	hwnd    uintptr
	pid     uint32
	class   string
	rect    nativeRect
	visible bool
}

// EnumWindows gives a stable snapshot in Z order, instead of following HWNDs
// that can be destroyed or reordered while we walk GetWindow.
func nativeWindows() []nativeWindow {
	var result []nativeWindow
	key := windowQueryID.Add(1)
	windowQueries.Store(key, &result)
	defer windowQueries.Delete(key)
	winEnumWindows.Call(windowEnumCallback, key)
	return result
}

func (s *session) nativePID() uint32 {
	if s.proc == nil {
		return 0
	}
	if s.proc.cmd != nil && s.proc.cmd.Process != nil {
		return uint32(s.proc.cmd.Process.Pid)
	}
	// Reattached browsers have no exec.Cmd. Resolve only the verified local
	// DevTools listener; never select another browser by its title or class alone.
	var size uint32
	winTCPTable.Call(0, uintptr(unsafe.Pointer(&size)), 0, 2, 3, 0)
	if size < 4 || size > 16<<20 {
		return 0
	}
	data := make([]byte, size)
	result, _, _ := winTCPTable.Call(uintptr(unsafe.Pointer(&data[0])), uintptr(unsafe.Pointer(&size)), 0, 2, 3, 0)
	if result != 0 {
		return 0
	}
	count := int(binary.LittleEndian.Uint32(data[:4]))
	for i := 0; i < count && 4+(i+1)*24 <= len(data); i++ {
		row := data[4+i*24 : 4+(i+1)*24]
		if binary.LittleEndian.Uint32(row[4:8]) == 0x0100007f && int(binary.BigEndian.Uint16(row[8:10])) == s.proc.port {
			return binary.LittleEndian.Uint32(row[20:24])
		}
	}
	return 0
}

func (s *session) nativeTaskWindow() (nativeWindow, []nativeWindow, bool) {
	pid := s.nativePID()
	windows := nativeWindows()
	var target nativeWindow
	for _, window := range windows {
		if pid != 0 && window.pid == pid && window.class == "Chrome_WidgetWin_1" {
			area := (int64(window.rect.right) - int64(window.rect.left)) * (int64(window.rect.bottom) - int64(window.rect.top))
			previous := (int64(target.rect.right) - int64(target.rect.left)) * (int64(target.rect.bottom) - int64(target.rect.top))
			if target.hwnd == 0 || area > previous {
				target = window
			}
		}
	}
	return target, windows, target.hwnd != 0
}

func (s *session) raiseTaskWindow(_ context.Context) error {
	window, _, ok := s.nativeTaskWindow()
	if !ok {
		return errors.New("could not identify the task's native window")
	}
	const flags = 0x0001 | 0x0002 | 0x0010 // NOSIZE | NOMOVE | NOACTIVATE
	raised, _, raiseErr := winPosition.Call(window.hwnd, ^uintptr(0), 0, 0, 0, 0, flags)
	// Always undo TOPMOST, including when the first call reports an error.
	reset, _, resetErr := winPosition.Call(window.hwnd, ^uintptr(1), 0, 0, 0, 0, flags)
	if raised == 0 {
		return raiseErr
	}
	if reset == 0 {
		return resetErr
	}
	return nil
}

func (s *session) restoreTaskWindow(ctx context.Context, id int) error {
	window, _, ok := s.nativeTaskWindow()
	if !ok {
		return errors.New("could not identify the minimized task window")
	}
	// Restore an already minimized window without activating it. Restoration
	// is never used as a substitute for raising an occluded normal window.
	result, _, err := winShow.Call(window.hwnd, 4) // SW_SHOWNOACTIVATE
	if result == 0 {
		return err
	}
	if !s.awaitState(ctx, "normal", windowStep*2) {
		return errors.New("native task window did not restore")
	}
	return nil
}

func nativeOverlap(a, b nativeRect) bool {
	return min(a.right, b.right)-max(a.left, b.left) > 4 && min(a.bottom, b.bottom)-max(a.top, b.top) > 4
}

func (s *session) taskWindowUncovered() bool {
	target, windows, ok := s.nativeTaskWindow()
	if !ok || !target.visible {
		return false
	}
	for _, window := range windows {
		if window.hwnd == target.hwnd {
			return true
		}
		if window.visible && window.pid != target.pid && nativeOverlap(window.rect, target.rect) {
			return false
		}
	}
	return false
}
