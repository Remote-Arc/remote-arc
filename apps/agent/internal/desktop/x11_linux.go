//go:build linux

package desktop

import (
	"context"
	"errors"
	"fmt"
	"image"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jezek/xgb"
	"github.com/jezek/xgb/randr"
	"github.com/jezek/xgb/screensaver"
	"github.com/jezek/xgb/xproto"
	"github.com/jezek/xgb/xtest"
)

// x11Platform serves desktop control in an X11 (Xorg) session through the
// core protocol plus the XTEST, RandR and MIT-SCREEN-SAVER extensions.
// Wayland does not let one client see or drive other clients' windows, so a
// Wayland session is refused rather than half served through XWayland.
type x11Platform struct {
	mu      sync.Mutex
	conn    *xgb.Conn
	root    xproto.Window
	atoms   map[string]xproto.Atom
	keymap  keymap
	notice  *x11Notice
	randrOK bool

	// lastInjected is when the Agent last sent input, in unix nanoseconds.
	// The server's idle timer cannot tell the Agent's XTEST input from a
	// person's, so input seen well after it is the person's.
	lastInjected atomic.Int64
	injecting    atomic.Int32
	lastUser     atomic.Int64
	watching     sync.Once
}

func newPlatform() platform { return &x11Platform{} }

// injectionGrace covers the delay between sending input and the server
// counting it, so the Agent's own input never looks like the person's.
const injectionGrace = 250 * time.Millisecond

func (p *x11Platform) Ready() error {
	if strings.EqualFold(os.Getenv("XDG_SESSION_TYPE"), "wayland") {
		return errors.New("desktop control needs an X11 (Xorg) session; Wayland sessions are not supported yet")
	}
	if os.Getenv("DISPLAY") == "" {
		return errors.New("no X11 display is available to this Agent (DISPLAY is not set)")
	}
	_, err := p.connect()
	return err
}

func (p *x11Platform) connect() (*xgb.Conn, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.conn != nil {
		return p.conn, nil
	}
	conn, err := xgb.NewConn()
	if err != nil {
		return nil, fmt.Errorf("could not connect to the X11 display: %v", err)
	}
	if err := xtest.Init(conn); err != nil {
		conn.Close()
		return nil, errors.New("the X server does not offer the XTEST extension, so input cannot be sent")
	}
	if err := screensaver.Init(conn); err != nil {
		conn.Close()
		return nil, errors.New("the X server does not offer the MIT-SCREEN-SAVER extension, so the Agent cannot tell when the person is using the computer")
	}
	p.randrOK = randr.Init(conn) == nil
	p.root = xproto.Setup(conn).DefaultScreen(conn).Root
	p.atoms = map[string]xproto.Atom{}
	p.conn = conn
	return conn, nil
}

func (p *x11Platform) atom(name string) xproto.Atom {
	p.mu.Lock()
	defer p.mu.Unlock()
	if a, ok := p.atoms[name]; ok {
		return a
	}
	reply, err := xproto.InternAtom(p.conn, false, uint16(len(name)), name).Reply()
	if err != nil {
		return 0
	}
	p.atoms[name] = reply.Atom
	return reply.Atom
}

// Start watches the server's idle timer so input the Agent did not send is
// recorded as the person's.
func (p *x11Platform) Start() error {
	if _, err := p.connect(); err != nil {
		return err
	}
	p.watching.Do(func() {
		go func() {
			for range time.Tick(100 * time.Millisecond) {
				p.sampleUserInput()
			}
		}()
	})
	p.sampleUserInput()
	return nil
}

func (p *x11Platform) sampleUserInput() {
	// A reading taken while the Agent's own input was on its way to the server
	// may already count it, so it is dropped.
	injected := p.lastInjected.Load()
	if p.injecting.Load() > 0 {
		return
	}
	// Counting back from when the question was asked never places input later
	// than it happened, however long the reply takes.
	asked := time.Now()
	info, err := screensaver.QueryInfo(p.conn, xproto.Drawable(p.root)).Reply()
	if err != nil || p.injecting.Load() > 0 || p.lastInjected.Load() != injected {
		return
	}
	last := asked.Add(-time.Duration(info.MsSinceUserInput) * time.Millisecond)
	if last.UnixNano() > injected+int64(injectionGrace) && last.UnixNano() > p.lastUser.Load() {
		p.lastUser.Store(last.UnixNano())
	}
}

func (p *x11Platform) LastUserInput() time.Time {
	p.sampleUserInput()
	if nanos := p.lastUser.Load(); nanos != 0 {
		return time.Unix(0, nanos)
	}
	return time.Time{}
}

func (p *x11Platform) Displays() ([]Display, error) {
	if p.randrOK {
		reply, err := randr.GetMonitors(p.conn, p.root, true).Reply()
		if err == nil && len(reply.Monitors) > 0 {
			displays := []Display{}
			for _, m := range reply.Monitors {
				displays = append(displays, Display{Bounds: Rect{int(m.X), int(m.Y), int(m.Width), int(m.Height)}, Primary: m.Primary})
			}
			return displays, nil
		}
	}
	screen := xproto.Setup(p.conn).DefaultScreen(p.conn)
	return []Display{{Bounds: Rect{0, 0, int(screen.WidthInPixels), int(screen.HeightInPixels)}, Primary: true}}, nil
}

func (p *x11Platform) Capture(r Rect) (*image.RGBA, error) {
	var img *image.RGBA
	err := p.aroundNotice(func() error {
		reply, err := xproto.GetImage(p.conn, xproto.ImageFormatZPixmap, xproto.Drawable(p.root), int16(r.X), int16(r.Y), uint16(r.W), uint16(r.H), 0xffffffff).Reply()
		if err != nil {
			return fmt.Errorf("the X server refused the screenshot: %v", err)
		}
		if len(reply.Data) < r.W*r.H*4 {
			return fmt.Errorf("unsupported screen depth %d: only 24- and 32-bit displays are supported", reply.Depth)
		}
		img = image.NewRGBA(image.Rect(0, 0, r.W, r.H))
		for i := 0; i < r.W*r.H; i++ { // BGRX to RGBA
			img.Pix[i*4], img.Pix[i*4+1], img.Pix[i*4+2], img.Pix[i*4+3] = reply.Data[i*4+2], reply.Data[i*4+1], reply.Data[i*4], 255
		}
		return nil
	})
	return img, err
}

// aroundNotice hides the notice while a screenshot is taken: X11 has no way
// to leave one window out of a capture.
func (p *x11Platform) aroundNotice(capture func() error) error {
	n := p.noticeWindow()
	if n == nil || !n.shown.Load() {
		return capture()
	}
	n.hide()
	defer n.show()
	time.Sleep(60 * time.Millisecond)
	return capture()
}

func (p *x11Platform) Windows() ([]Window, error) {
	stacking := p.windowList(p.root, "_NET_CLIENT_LIST_STACKING")
	if len(stacking) == 0 {
		stacking = p.windowList(p.root, "_NET_CLIENT_LIST")
	}
	if len(stacking) == 0 {
		return nil, errors.New("the window manager does not publish its window list (EWMH)")
	}
	active := xproto.Window(0)
	if list := p.windowList(p.root, "_NET_ACTIVE_WINDOW"); len(list) == 1 {
		active = list[0]
	}
	windows := []Window{}
	for i := len(stacking) - 1; i >= 0; i-- { // top of the stack first
		w := p.describe(stacking[i], active)
		if w.Title == "" && !w.Foreground {
			continue
		}
		windows = append(windows, w)
	}
	return windows, nil
}

func (p *x11Platform) windowList(w xproto.Window, name string) []xproto.Window {
	reply, err := xproto.GetProperty(p.conn, false, w, p.atom(name), xproto.AtomWindow, 0, 4096).Reply()
	if err != nil || reply.Format != 32 {
		return nil
	}
	out := []xproto.Window{}
	for i := 0; i+4 <= len(reply.Value); i += 4 {
		if id := xproto.Window(xgb.Get32(reply.Value[i:])); id != 0 {
			out = append(out, id)
		}
	}
	return out
}

func (p *x11Platform) describe(w, active xproto.Window) Window {
	out := Window{Handle: uintptr(w), Foreground: w == active, App: "unknown"}
	if title := p.text(w, "_NET_WM_NAME", p.atom("UTF8_STRING")); title != "" {
		out.Title = title
	} else {
		out.Title = p.text(w, "WM_NAME", xproto.AtomString)
	}
	if reply, err := xproto.GetProperty(p.conn, false, w, p.atom("_NET_WM_PID"), xproto.AtomCardinal, 0, 1).Reply(); err == nil && len(reply.Value) >= 4 {
		out.PID = xgb.Get32(reply.Value)
		out.App = linuxProcessName(out.PID)
	}
	if geometry, err := xproto.GetGeometry(p.conn, xproto.Drawable(w)).Reply(); err == nil {
		if at, err := xproto.TranslateCoordinates(p.conn, w, p.root, 0, 0).Reply(); err == nil {
			out.Bounds = Rect{int(at.DstX), int(at.DstY), int(geometry.Width), int(geometry.Height)}
		}
	}
	hidden := p.atom("_NET_WM_STATE_HIDDEN")
	if reply, err := xproto.GetProperty(p.conn, false, w, p.atom("_NET_WM_STATE"), xproto.AtomAtom, 0, 64).Reply(); err == nil {
		for i := 0; i+4 <= len(reply.Value); i += 4 {
			if xproto.Atom(xgb.Get32(reply.Value[i:])) == hidden {
				out.Minimized = true
			}
		}
	}
	return out
}

func (p *x11Platform) text(w xproto.Window, property string, kind xproto.Atom) string {
	reply, err := xproto.GetProperty(p.conn, false, w, p.atom(property), kind, 0, 1024).Reply()
	if err != nil {
		return ""
	}
	return strings.TrimRight(string(reply.Value), "\x00")
}

// linuxProcessName is the executable's base name, or "unknown".
func linuxProcessName(pid uint32) string {
	if pid == 0 {
		return "unknown"
	}
	if exe, err := os.Readlink(fmt.Sprintf("/proc/%d/exe", pid)); err == nil {
		return strings.ToLower(filepath.Base(strings.TrimSuffix(exe, " (deleted)")))
	}
	if comm, err := os.ReadFile(fmt.Sprintf("/proc/%d/comm", pid)); err == nil {
		return strings.ToLower(strings.TrimSpace(string(comm)))
	}
	return "unknown"
}

// Controls come from AT-SPI on Linux, which this version does not read:
// the screenshot and coordinates carry the work.
func (p *x11Platform) Elements(Window, int) ([]Element, bool, error) { return nil, false, nil }

func (p *x11Platform) WindowAt(x, y int) (Window, error) {
	windows, err := p.Windows()
	if err != nil {
		return Window{}, err
	}
	for _, w := range windows {
		if !w.Minimized && w.Bounds.contains(x, y) {
			return w, nil
		}
	}
	return Window{App: "desktop"}, nil
}

func (p *x11Platform) Cursor() (int, int, error) {
	reply, err := xproto.QueryPointer(p.conn, p.root).Reply()
	if err != nil {
		return 0, 0, err
	}
	return int(reply.RootX), int(reply.RootY), nil
}

// Locked is true when the session reports itself locked or a screen saver
// covers the display.
func (p *x11Platform) Locked() bool {
	if info, err := screensaver.QueryInfo(p.conn, xproto.Drawable(p.root)).Reply(); err == nil && info.State == screensaver.StateOn {
		return true
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "loginctl", "show-session", "self", "-p", "LockedHint").Output()
	return err == nil && strings.TrimSpace(string(out)) == "LockedHint=yes"
}

func (p *x11Platform) Focus(w Window) error {
	event := xproto.ClientMessageEvent{
		Format: 32,
		Window: xproto.Window(w.Handle),
		Type:   p.atom("_NET_ACTIVE_WINDOW"),
		Data:   xproto.ClientMessageDataUnionData32New([]uint32{2, 0, 0, 0, 0}), // source: a pager acting for the user
	}
	mask := uint32(xproto.EventMaskSubstructureRedirect | xproto.EventMaskSubstructureNotify)
	if err := xproto.SendEventChecked(p.conn, false, p.root, mask, string(event.Bytes())).Check(); err != nil {
		return err
	}
	time.Sleep(150 * time.Millisecond)
	if list := p.windowList(p.root, "_NET_ACTIVE_WINDOW"); len(list) != 1 || uintptr(list[0]) != w.Handle {
		return errors.New("the window manager kept another window in front. Click the window's title bar instead")
	}
	return nil
}

func (p *x11Platform) Indicate(active bool) {
	n := p.noticeWindow()
	if n == nil {
		return
	}
	if active {
		n.show()
	} else {
		n.hide()
	}
}

func (p *x11Platform) noticeWindow() *x11Notice {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.notice == nil && p.conn != nil {
		p.notice = newX11Notice(p.conn)
	}
	return p.notice
}
