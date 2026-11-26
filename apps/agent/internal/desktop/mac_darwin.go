//go:build darwin

package desktop

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"golang.org/x/image/draw"
)

// macPlatform serves desktop control on macOS through the system's own
// osascript (JavaScript for Automation, which reaches CoreGraphics and
// AppKit) and screencapture, so the Agent stays a single binary built
// without cgo. Coordinates are points, the unit CoreGraphics events use;
// screenshots are scaled from Retina pixels to points.
type macPlatform struct {
	mu        sync.Mutex
	checked   time.Time
	notice    *exec.Cmd
	noticeOn  bool
	stateFile string

	// lastInjected and lastUser are unix nanoseconds, as on Linux: the HID
	// idle timer cannot tell posted input from a person's.
	lastInjected atomic.Int64
	lastUser     atomic.Int64
}

func newPlatform() platform { return &macPlatform{} }

const (
	osascript       = "/usr/bin/osascript"
	screencapture   = "/usr/sbin/screencapture"
	ioreg           = "/usr/sbin/ioreg"
	macInjectGrace  = 300 * time.Millisecond
	macPermissionOK = time.Minute
)

func (p *macPlatform) Ready() error {
	for _, tool := range []string{osascript, screencapture, ioreg} {
		if _, err := os.Stat(tool); err != nil {
			return fmt.Errorf("%s is missing, so the screen cannot be seen or controlled", filepath.Base(tool))
		}
	}
	// A LaunchDaemon or another user's Agent has no window server session.
	if info, err := os.Stat("/dev/console"); err == nil {
		if stat, ok := info.Sys().(*syscall.Stat_t); ok && int(stat.Uid) == os.Getuid() {
			return nil
		}
	}
	return errors.New("desktop control needs the Agent to run as the user signed in at this Mac's screen")
}

// Start checks the two privacy permissions macOS asks the person to grant,
// and asks for any that is missing so the Agent appears in System Settings.
func (p *macPlatform) Start() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if time.Since(p.checked) < macPermissionOK {
		return nil
	}
	out, err := jxa("probe.js", 10*time.Second, "ask")
	if err != nil {
		return err
	}
	var granted struct{ Screen, Input bool }
	if err := json.Unmarshal(out, &granted); err != nil {
		return fmt.Errorf("could not read the macOS permissions: %v", err)
	}
	missing := []string{}
	if !granted.Screen {
		missing = append(missing, "Screen & System Audio Recording")
	}
	if !granted.Input {
		missing = append(missing, "Accessibility")
	}
	if len(missing) > 0 {
		return fmt.Errorf("macOS has not allowed the Remote Arc Agent to use %s. Ask the user to open System Settings, Privacy & Security, turn on Remote Arc under each (Agents before 0.8.1 appear as remotelink), then try again", joinAnd(missing))
	}
	p.checked = time.Now()
	return nil
}

func joinAnd(items []string) string {
	if len(items) == 2 {
		return items[0] + " and " + items[1]
	}
	return items[0]
}

// jxa runs an embedded script with arguments and returns what it printed.
func jxa(name string, timeout time.Duration, args ...string) ([]byte, error) {
	script, err := macScripts.ReadFile("mac_scripts/" + name)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, osascript, append([]string{"-l", "JavaScript", "-e", string(script)}, args...)...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("osascript %s failed: %v %s", name, err, clip(stderr.String(), 300))
	}
	return bytes.TrimSpace(out), nil
}

func (p *macPlatform) Displays() ([]Display, error) {
	out, err := jxa("displays.js", 5*time.Second)
	if err != nil {
		return nil, err
	}
	return parseMacDisplays(out)
}

func (p *macPlatform) Capture(r Rect) (*image.RGBA, error) {
	file, err := os.CreateTemp("", "remote-arc-desktop-*.png")
	if err != nil {
		return nil, err
	}
	path := file.Name()
	file.Close()
	defer os.Remove(path)
	region := fmt.Sprintf("%d,%d,%d,%d", r.X, r.Y, r.W, r.H)
	err = p.withoutNotice(func() error {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		out, err := exec.CommandContext(ctx, screencapture, "-x", "-t", "png", "-R", region, path).CombinedOutput()
		if err != nil {
			return fmt.Errorf("screencapture failed: %v %s", err, clip(string(out), 300))
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	shot, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("could not read the screenshot: %v", err)
	}
	// One image pixel per point, so masks and coordinates line up.
	out := image.NewRGBA(image.Rect(0, 0, r.W, r.H))
	draw.BiLinear.Scale(out, out.Bounds(), shot, shot.Bounds(), draw.Src, nil)
	return out, nil
}

func (p *macPlatform) Windows() ([]Window, error) {
	out, err := jxa("windows.js", 5*time.Second)
	if err != nil {
		return nil, err
	}
	return parseMacWindows(out)
}

// Controls come from the Accessibility API, which this version does not
// read: the screenshot and coordinates carry the work, as on Linux.
func (p *macPlatform) Elements(Window, int) ([]Element, bool, error) { return nil, false, nil }

func (p *macPlatform) WindowAt(x, y int) (Window, error) {
	windows, err := p.Windows()
	if err != nil {
		return Window{}, err
	}
	for _, w := range windows {
		if w.Bounds.contains(x, y) {
			return w, nil
		}
	}
	return Window{App: "desktop"}, nil
}

func (p *macPlatform) Cursor() (int, int, error) {
	out, err := jxa("cursor.js", 5*time.Second)
	if err != nil {
		return 0, 0, err
	}
	var at struct{ X, Y int }
	if err := json.Unmarshal(out, &at); err != nil {
		return 0, 0, err
	}
	return at.X, at.Y, nil
}

func ioregOutput(args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return exec.CommandContext(ctx, ioreg, args...).Output()
}

// Locked is true on the lock screen, while another user has the console, and
// while the screen saver runs.
func (p *macPlatform) Locked() bool {
	console, err := ioregOutput("-n", "Root", "-d", "1", "-l")
	if err != nil || macSessionLocked(console, os.Getuid()) {
		return true
	}
	return exec.Command("/usr/bin/pgrep", "-x", "ScreenSaverEngine").Run() == nil
}

func (p *macPlatform) LastUserInput() time.Time {
	if data, err := ioregOutput("-r", "-c", "IOHIDSystem", "-d", "1"); err == nil {
		if idle, ok := parseMacIdle(data); ok {
			last := time.Now().Add(-idle).UnixNano()
			if last > p.lastInjected.Load()+int64(macInjectGrace) && last > p.lastUser.Load() {
				p.lastUser.Store(last)
			}
		}
	}
	if nanos := p.lastUser.Load(); nanos != 0 {
		return time.Unix(0, nanos)
	}
	return time.Time{}
}

// Send posts input in batches, one osascript run each, and checks for the
// person between batches; the script itself stops if the pointer moves.
func (p *macPlatform) Send(steps []Step, abort func() bool) (int, error) {
	batches, err := macBatches(steps)
	if err != nil {
		return 0, err
	}
	sent, placed := 0, ""
	for _, batch := range batches {
		if abort() {
			return sent, nil
		}
		ops, err := json.Marshal(batch.ops)
		if err != nil {
			return sent, err
		}
		p.lastInjected.Store(time.Now().UnixNano())
		out, err := jxa("input.js", 60*time.Second, string(ops), placed)
		p.lastInjected.Store(time.Now().UnixNano())
		if err != nil {
			return sent, err
		}
		var result struct {
			Done   int
			Moved  bool
			Placed bool
			X, Y   int
		}
		if err := json.Unmarshal(out, &result); err != nil {
			return sent, fmt.Errorf("could not read the input result: %v", err)
		}
		if result.Moved || result.Done < len(batch.ops) {
			return sent, nil
		}
		sent += batch.steps
		if result.Placed {
			placed = fmt.Sprintf(`{"x":%d,"y":%d}`, result.X, result.Y)
		}
	}
	return sent, nil
}

// Focus brings the window's app to the front. Raising one window of several
// would need the Accessibility API; the caller then clicks the window.
func (p *macPlatform) Focus(w Window) error {
	script := fmt.Sprintf(`ObjC.import("AppKit"); var app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(%d); app && !app.isNil() ? app.activateWithOptions(2) : false;`, w.PID)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := exec.CommandContext(ctx, osascript, "-l", "JavaScript", "-e", script).Run(); err != nil {
		return fmt.Errorf("could not bring %s to the front: %v", w.App, err)
	}
	time.Sleep(200 * time.Millisecond)
	windows, err := p.Windows()
	if err != nil {
		return err
	}
	for _, other := range windows {
		if other.Foreground {
			if other.PID == w.PID {
				return nil
			}
			break
		}
	}
	return errors.New("another app stayed in front. Click the window's title bar instead")
}

// Indicate shows or hides the notice, which runs as its own osascript
// process with an AppKit window and follows a state file.
func (p *macPlatform) Indicate(active bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.noticeOn = active
	p.writeNoticeLocked(active)
	if active {
		p.startNoticeLocked()
	}
}

func (p *macPlatform) writeNoticeLocked(show bool) {
	if p.stateFile == "" {
		p.stateFile = filepath.Join(os.TempDir(), "remote-arc-desktop-notice-"+strconv.Itoa(os.Getpid()))
	}
	_ = os.WriteFile(p.stateFile, []byte(macNoticeState(show, time.Now())), 0o600)
}

func (p *macPlatform) startNoticeLocked() {
	if p.notice != nil {
		return
	}
	script, err := macScripts.ReadFile("mac_scripts/notice.js")
	if err != nil {
		return
	}
	cmd := exec.Command(osascript, "-l", "JavaScript", "-e", string(script), p.stateFile)
	if cmd.Start() != nil {
		return
	}
	p.notice = cmd
	go func() {
		_ = cmd.Wait()
		p.mu.Lock()
		p.notice = nil
		p.mu.Unlock()
	}()
	// Keep the state fresh while the notice process runs; once it has been
	// hidden a while, stop, and the process quits by itself.
	go func() {
		hiddenSince := time.Time{}
		for range time.Tick(time.Second) {
			p.mu.Lock()
			if p.notice != cmd {
				p.mu.Unlock()
				return
			}
			on := p.noticeOn
			if on {
				hiddenSince = time.Time{}
			} else if hiddenSince.IsZero() {
				hiddenSince = time.Now()
			}
			if !on && time.Since(hiddenSince) > time.Minute {
				p.mu.Unlock()
				return
			}
			p.writeNoticeLocked(on)
			p.mu.Unlock()
		}
	}()
}

// withoutNotice hides the notice for a capture. The window is also marked
// not to be captured, which recent macOS versions do not always honour.
func (p *macPlatform) withoutNotice(capture func() error) error {
	p.mu.Lock()
	shown := p.noticeOn && p.notice != nil
	if shown {
		p.writeNoticeLocked(false)
	}
	p.mu.Unlock()
	if shown {
		time.Sleep(120 * time.Millisecond)
		defer func() {
			p.mu.Lock()
			p.writeNoticeLocked(p.noticeOn)
			p.mu.Unlock()
		}()
	}
	return capture()
}
