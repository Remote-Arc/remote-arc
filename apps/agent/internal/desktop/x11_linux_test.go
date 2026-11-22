//go:build linux

package desktop

import (
	"bufio"
	"image"
	"os"
	"os/exec"
	"strings"
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
	// Other tests open windows on the same display at the same time (the
	// browser runner's Chrome in the coverage job), so the fixture asks the
	// window manager to keep it above them.
	above := make([]byte, 4)
	xgb.Put32(above, uint32(atom("_NET_WM_STATE_ABOVE")))
	xproto.ChangeProperty(conn, xproto.PropModeReplace, window, atom("_NET_WM_STATE"), xproto.AtomAtom, 32, 1, above)
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

// ownX11Display starts an X server and window manager for this test alone,
// when Xvfb and openbox are installed. Other tests in the same job open
// browser windows on the shared display, and those take focus and cover the
// fixture. Without them, the test uses DISPLAY as it is.
func ownX11Display(t *testing.T) {
	t.Helper()
	xvfb, err := exec.LookPath("Xvfb")
	if err != nil {
		return
	}
	openbox, err := exec.LookPath("openbox")
	if err != nil {
		return
	}
	read, write, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	server := exec.Command(xvfb, "-displayfd", "3", "-screen", "0", "1280x800x24", "-nolisten", "tcp")
	server.ExtraFiles = []*os.File{write}
	if err := server.Start(); err != nil {
		t.Fatal(err)
	}
	write.Close()
	t.Cleanup(func() { server.Process.Kill(); server.Wait() })
	number, err := bufio.NewReader(read).ReadString('\n')
	read.Close()
	if err != nil {
		t.Fatalf("Xvfb did not report its display: %v", err)
	}
	t.Setenv("DISPLAY", ":"+strings.TrimSpace(number))
	manager := exec.Command(openbox)
	if err := manager.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { manager.Process.Kill(); manager.Wait() })
	// openbox names itself on the root window a moment before it manages new
	// windows, so it is ready once it lists a probe window: mapped again each
	// half second, in case the first map came too early.
	conn, err := xgb.NewConn()
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	screen := xproto.Setup(conn).DefaultScreen(conn)
	probe, _ := xproto.NewWindowId(conn)
	xproto.CreateWindow(conn, screen.RootDepth, probe, screen.Root, 0, 0, 10, 10, 0, xproto.WindowClassInputOutput, screen.RootVisual, 0, nil)
	name := "_NET_CLIENT_LIST"
	list, _ := xproto.InternAtom(conn, false, uint16(len(name)), name).Reply()
	listed := func() bool {
		reply, err := xproto.GetProperty(conn, false, screen.Root, list.Atom, xproto.AtomWindow, 0, 1024).Reply()
		for i := 0; err == nil && i+4 <= len(reply.Value); i += 4 {
			if xproto.Window(xgb.Get32(reply.Value[i:])) == probe {
				return true
			}
		}
		return false
	}
	for deadline := time.Now().Add(10 * time.Second); time.Now().Before(deadline); {
		xproto.UnmapWindow(conn, probe)
		xproto.MapWindow(conn, probe)
		for tries := 0; tries < 10 && !listed(); tries++ {
			time.Sleep(50 * time.Millisecond)
		}
		if listed() {
			// The fixture's connection may be given the probe's id, so the
			// probe must be gone from the list first.
			xproto.DestroyWindow(conn, probe)
			for tries := 0; tries < 100 && listed(); tries++ {
				time.Sleep(50 * time.Millisecond)
			}
			return
		}
	}
	t.Fatal("openbox did not start managing windows on the test's own display")
}

func TestX11DesktopAgainstARealWindow(t *testing.T) {
	ownX11Display(t)
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
	fixtureConn, window, events := fixtureX11Window(t)

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
	var cx, cy int
	// A window another test opened a moment ago may still be on top, and on a
	// busy machine the window manager may still be placing the fixture: raise
	// it and read where it is until the screenshot shows it, for up to two seconds.
	var img *image.RGBA
	for deadline := time.Now().Add(2 * time.Second); ; {
		xproto.ConfigureWindow(fixtureConn, window, xproto.ConfigWindowStackMode, []uint32{xproto.StackModeAbove})
		fixtureConn.Sync()
		time.Sleep(100 * time.Millisecond)
		windows, _ := p.Windows()
		for _, w := range windows {
			if w.Handle == uintptr(window) {
				fixture = w
			}
		}
		cx, cy = fixture.Bounds.X+200, fixture.Bounds.Y+120
		if img, err = p.Capture(displays[0].Bounds); err != nil {
			t.Fatal(err)
		}
		if c := img.RGBAAt(cx, cy); c.R == 0xff && c.G == 0 && c.B == 0 {
			break
		} else if time.Now().After(deadline) {
			t.Fatalf("pixel inside the fixture is %+v", c)
		}
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
