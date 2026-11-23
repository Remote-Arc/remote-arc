//go:build darwin

package desktop

import (
	"encoding/json"
	"os"
	"testing"
	"time"
)

// macSession skips unless this test runs in a signed-in Mac session, as the
// macOS CI runners and a developer's Mac do.
func macSession(t *testing.T) *macPlatform {
	t.Helper()
	p := &macPlatform{}
	if err := p.Ready(); err != nil {
		t.Skip(err)
	}
	return p
}

// These scripts need no privacy permission, so they run on CI.
func TestMacReadOnlyScriptsRun(t *testing.T) {
	p := macSession(t)
	displays, err := p.Displays()
	if err != nil || len(displays) == 0 || !displays[0].Primary || displays[0].Bounds.X != 0 || displays[0].Bounds.Y != 0 || displays[0].Bounds.empty() {
		t.Fatalf("displays %+v %v", displays, err)
	}
	if _, err := p.Windows(); err != nil {
		t.Fatal(err)
	}
	if _, _, err := p.Cursor(); err != nil {
		t.Fatal(err)
	}
	out, err := jxa("probe.js", 10*time.Second)
	var granted struct{ Screen, Input bool }
	if err != nil || json.Unmarshal(out, &granted) != nil {
		t.Fatalf("probe %s %v", out, err)
	}
	t.Logf("screen recording %v, accessibility %v", granted.Screen, granted.Input)
	_ = p.Locked()
	_ = p.LastUserInput()
	if _, err := jxa("missing.js", time.Second); err == nil {
		t.Fatal("a missing script is an error")
	}
}

// The full check sees the screen and moves the pointer, so it needs both
// permissions and a person who expects it:
//
//	REMOTE_ARC_DESKTOP_MAC_TEST=1 go test ./internal/desktop -run TestMacRealSession -v
func TestMacRealSession(t *testing.T) {
	if os.Getenv("REMOTE_ARC_DESKTOP_MAC_TEST") != "1" {
		t.Skip("set REMOTE_ARC_DESKTOP_MAC_TEST=1 on a Mac to run")
	}
	p := macSession(t)
	if err := p.Start(); err != nil {
		t.Fatal(err)
	}
	displays, _ := p.Displays()
	main := displays[0].Bounds
	shot, err := p.Capture(main)
	if err != nil || shot.Bounds().Dx() != main.W || shot.Bounds().Dy() != main.H {
		t.Fatalf("capture %v %v", shot.Bounds(), err)
	}
	p.Indicate(true)
	defer p.Indicate(false)
	time.Sleep(time.Second)
	if !noticeOnScreen(t, p) {
		t.Fatal("the notice is not on screen a second after Indicate(true)")
	}
	x, y := main.X+main.W/2, main.Y+main.H/2
	sent, err := p.Send([]Step{{Kind: StepMove, X: x, Y: y}, {Kind: StepPause, Pause: 50 * time.Millisecond}}, func() bool { return false })
	if err != nil || sent != 2 {
		t.Fatalf("sent %d %v", sent, err)
	}
	if atX, atY, err := p.Cursor(); err != nil || atX != x || atY != y {
		t.Fatalf("pointer at %d,%d, want %d,%d (%v)", atX, atY, x, y, err)
	}
	if last := p.LastUserInput(); !last.IsZero() && time.Since(last) < time.Second {
		t.Fatalf("the Agent's own input looked like the person's: %v", last)
	}
	windows, err := p.Windows()
	if err != nil || len(windows) == 0 {
		t.Fatalf("windows %v", err)
	}
	t.Logf("%d windows, front %+v; the notice is at the top of the screen", len(windows), windows[0])
	p.Indicate(false)
	time.Sleep(time.Second)
	if noticeOnScreen(t, p) {
		t.Fatal("the notice is still on screen a second after Indicate(false)")
	}
}

// noticeOnScreen reports whether the notice process has a screen-saver-level
// window on screen. windows.js lists every on-screen window with its owner's
// PID and layer, the notice's included.
func noticeOnScreen(t *testing.T, p *macPlatform) bool {
	t.Helper()
	p.mu.Lock()
	notice := p.notice
	p.mu.Unlock()
	if notice == nil || notice.Process == nil {
		return false
	}
	out, err := jxa("windows.js", 10*time.Second)
	var windows []struct{ PID, Layer int }
	if err != nil || json.Unmarshal(out, &windows) != nil {
		t.Fatalf("windows %s %v", out, err)
	}
	for _, w := range windows {
		if w.PID == notice.Process.Pid && w.Layer == 1000 {
			return true
		}
	}
	return false
}
