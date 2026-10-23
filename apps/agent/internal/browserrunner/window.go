package browserrunner

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"runtime"
	"time"
)

// The task browser is a sandbox the user does not see: a real browser
// window, kept off screen, that never takes focus while the AI works. When a
// page needs the user (a CAPTCHA, a first sign-in), the window is brought on
// screen where it is, with the page and everything entered on it intact,
// and goes back out of sight once the AI continues.

var errNoWindow = errors.New("This computer runs the task browser without a window (no display), so it cannot be shown here.")

type windowBounds struct {
	Left        int    `json:"left"`
	Top         int    `json:"top"`
	Width       int    `json:"width"`
	Height      int    `json:"height"`
	WindowState string `json:"windowState"`
}

// hasWindow is whether this task's browser has a window that can be shown.
func (s *session) hasWindow() bool {
	return s.proc != nil && !s.proc.headless && s.cp.Browser != browserYourChrome
}

func (s *session) window(ctx context.Context) (int, windowBounds, error) {
	var out struct {
		WindowID int          `json:"windowId"`
		Bounds   windowBounds `json:"bounds"`
	}
	e := s.conn.Call(ctx, "Browser.getWindowForTarget", nil, &out)
	return out.WindowID, out.Bounds, e
}

func (s *session) setBounds(ctx context.Context, id int, b map[string]any) error {
	return s.conn.Call(ctx, "Browser.setWindowBounds", map[string]any{"windowId": id, "bounds": b}, nil)
}

// A native window transition can acknowledge without applying during startup.
// Reissue the idempotent state request while observing the actual window, as
// ChromeDriver does, rather than only polling a request the OS has discarded.
func (s *session) setWindowState(ctx context.Context, id int, state string) error {
	wait, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	if e := s.setBounds(wait, id, map[string]any{"windowState": state}); e != nil {
		return e
	}
	tick := time.NewTicker(100 * time.Millisecond)
	defer tick.Stop()
	for {
		_, b, e := s.window(wait)
		if e != nil {
			return e
		}
		if b.WindowState == state {
			return nil
		}
		select {
		case <-wait.Done():
			return fmt.Errorf("task window did not become %s: %w", state, wait.Err())
		case <-tick.C:
			if e := s.setBounds(wait, id, map[string]any{"windowState": state}); e != nil {
				return e
			}
		}
	}
}

// setVisible brings the task window on screen and to the front, or moves it
// back out of sight. Nothing is reloaded.
func (s *session) setVisible(ctx context.Context, visible bool) error {
	if !s.hasWindow() {
		return errNoWindow
	}
	id, b, e := s.window(ctx)
	if e != nil {
		return e
	}
	if !visible && b.WindowState == "minimized" {
		return nil
	}
	if b.WindowState != "normal" {
		if e := s.setWindowState(ctx, id, "normal"); e != nil {
			return e
		}
	}
	if !visible {
		// macOS may clamp the requested position after acknowledging it.
		// Minimize directly and wait for the native transition to complete.
		if runtime.GOOS == "darwin" {
			return s.setWindowState(ctx, id, "minimized")
		}
		// Prefer an off-screen window so rendering continues normally.
		if e := s.setBounds(ctx, id, map[string]any{"left": offscreen, "top": 0, "width": 1280, "height": 900}); e != nil {
			return e
		}
		// Fall back to minimizing if the window manager clamps this position.
		_, now, e := s.window(ctx)
		if e != nil {
			return e
		}
		if now.Left > offscreen/2 {
			return s.setWindowState(ctx, id, "minimized")
		}
		return nil
	}
	left, top, width, height := 40, 40, 1280, 900
	if raw, e := s.evaluateMain(ctx, `JSON.stringify([screen.availLeft||0, screen.availTop||0, screen.availWidth||0, screen.availHeight||0])`); e == nil {
		var text string
		var area [4]int
		if json.Unmarshal(raw, &text) == nil && json.Unmarshal([]byte(text), &area) == nil && area[2] > 400 && area[3] > 300 {
			width, height = min(width, area[2]-80), min(height, area[3]-80)
			left, top = area[0]+(area[2]-width)/2, area[1]+(area[3]-height)/2
		}
	}
	if e := s.setBounds(ctx, id, map[string]any{"left": left, "top": top, "width": width, "height": height}); e != nil {
		return e
	}
	// The user asked for it: here taking focus is the point.
	return s.conn.Call(ctx, "Page.bringToFront", nil, nil)
}

// hideAfterUser puts the window back out of sight when it was shown for the
// user and the page no longer needs them. It reports whether it did.
func (s *session) hideAfterUser(ctx context.Context) bool {
	if !s.shownForUser || s.cp.State == StateNeedsUser || !s.live() {
		return false
	}
	s.shownForUser = false
	if s.setVisible(ctx, false) != nil {
		return false
	}
	s.cp.Headless = true
	return true
}
