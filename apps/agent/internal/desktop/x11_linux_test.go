//go:build linux

package desktop

import (
	"os"
	"testing"
	"time"

	"github.com/jezek/xgb"
	"github.com/jezek/xgb/xproto"
)

// fixtureX11Window maps a red window that reports its own key and button
// presses, through a connection of its own.
func fixtureX11Window(t *testing.T) (*xgb.Conn, xproto.Window, chan xgb.Event) {
	t.Helper()
	conn, err := xgb.NewConn()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(conn.Close)
	screen := xproto.Setup(conn).DefaultScreen(conn)
	window, _ := xproto.NewWindowId(conn)
	err = xproto.CreateWindowChecked(conn, screen.RootDepth, window, screen.Root, 200, 200, 400, 240, 0,
		xproto.WindowClassInputOutput, screen.RootVisual, xproto.CwBackPixel|xproto.CwEventMask,
		[]uint32{0xff0000, xproto.EventMaskKeyPress | xproto.EventMaskButtonPress}).Check()
	if err != nil {
		t.Fatal(err)
	}
	atom := func(name string) xproto.Atom {
		reply, _ := xproto.InternAtom(conn, false, uint16(len(name)), name).Reply()
		return reply.Atom
	}
	title := "Remote Arc desktop test"
	xproto.ChangeProperty(conn, xproto.PropModeReplace, window, atom("_NET_WM_NAME"), atom("UTF8_STRING"), 8, uint32(len(title)), []byte(title))
	pid := make([]byte, 4)
	xgb.Put32(pid, uint32(os.Getpid()))
	xproto.ChangeProperty(conn, xproto.PropModeReplace, window, atom("_NET_WM_PID"), xproto.AtomCardinal, 32, 1, pid)
	xproto.MapWindow(conn, window)
	conn.Sync()
	events := make(chan xgb.Event, 64)
	go func() {
		for {
			event, err := conn.WaitForEvent()
			if event == nil && err == nil {
				return
			}
			if event != nil {
				events <- event
			}
		}
	}()
	return conn, window, events
}

func TestX11DesktopAgainstARealWindow(t *testing.T) {
	if os.Getenv("DISPLAY") == "" {
		t.Skip("needs an X11 display; CI runs this under Xvfb with a window manager")
	}
	p := &x11Platform{}
	if err := p.Ready(); err != nil {
		t.Fatal(err)
	}
	if err := p.Start(); err != nil {
		t.Fatal(err)
	}
	displays, err := p.Displays()
	if err != nil || len(displays) == 0 {
		t.Fatalf("displays: %v %v", displays, err)
	}
	_, window, events := fixtureX11Window(t)

	// The window manager lists the fixture once it has managed it.
	var fixture Window
	for deadline := time.Now().Add(3 * time.Second); fixture.Handle == 0 && time.Now().Before(deadline); time.Sleep(50 * time.Millisecond) {
		windows, _ := p.Windows()
		for _, w := range windows {
			if w.Handle == uintptr(window) {
				fixture = w
			}
		}
	}
	if fixture.Title != "Remote Arc desktop test" || fixture.App != linuxProcessName(uint32(os.Getpid())) || fixture.Bounds.W != 400 {
		t.Fatalf("fixture window as listed: %+v", fixture)
	}
	if err := p.Focus(fixture); err != nil {
		t.Fatal(err)
	}

	// The screenshot sees the red window, but never the notice.
	p.Indicate(true)
	defer p.Indicate(false)
	time.Sleep(100 * time.Millisecond)
	img, err := p.Capture(displays[0].Bounds)
	if err != nil {
		t.Fatal(err)
	}
	cx, cy := fixture.Bounds.X+200, fixture.Bounds.Y+120
	if c := img.RGBAAt(cx, cy); c.R != 0xff || c.G != 0 || c.B != 0 {
		t.Fatalf("pixel inside the fixture is %+v", c)
	}
	if c := img.RGBAAt(displays[0].Bounds.W/2, 30); c.R == 0x6d && c.G == 0x28 && c.B == 0xd9 {
		t.Fatal("the notice must be hidden while the screen is captured")
	}
	if !p.noticeWindow().shown.Load() {
		t.Fatal("the notice is shown again after the screenshot")
	}
	if at, err := p.WindowAt(cx, cy); err != nil || at.Handle != uintptr(window) {
		t.Fatalf("window at the fixture's centre: %+v %v", at, err)
	}

	before := p.LastUserInput()
	steps := append(clickSteps(cx, cy, "left", 1), textSteps("héllo 😀")...)
	if sent, err := p.Send(steps, func() bool { return false }); err != nil || sent != len(steps) {
		t.Fatalf("send: %d of %d, %v", sent, len(steps), err)
	}
	if x, y, _ := p.Cursor(); x != cx || y != cy {
		t.Fatalf("pointer at %d,%d, want %d,%d", x, y, cx, cy)
	}
	clicks, keys := 0, 0
	for timeout := time.After(2 * time.Second); clicks < 1 || keys < 7; {
		select {
		case event := <-events:
			switch e := event.(type) {
			case xproto.ButtonPressEvent:
				clicks += map[bool]int{true: 1}[e.Event == window && e.Detail == 1]
			case xproto.KeyPressEvent:
				keys += map[bool]int{true: 1}[e.Event == window]
			}
		case <-timeout:
			t.Fatalf("the fixture received %d clicks and %d key presses, want 1 and 7 (h é l l o space 😀)", clicks, keys)
		}
	}
	time.Sleep(400 * time.Millisecond)
	if !p.LastUserInput().Equal(before) {
		t.Fatal("the Agent's own input must never count as the person's")
	}
	// A borrowed key is given back once typing is done.
	if err := p.loadKeymap(); err != nil {
		t.Fatal(err)
	}
	if _, _, found := p.keymap.find(keysymFor('😀')); found {
		t.Fatal("the borrowed keycode still types 😀 after the action")
	}
}
