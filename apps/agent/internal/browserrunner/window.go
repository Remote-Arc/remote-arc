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

// windowStep bounds each window call: a native transition (minimize on
// macOS) can hold the browser's answer for a while, and showing or hiding
// the window must never hold up or fail the task itself.
const windowStep = 500 * time.Millisecond

func (s *session) quickBounds(ctx context.Context, id int, b map[string]any) error {
	c, cancel := context.WithTimeout(ctx, windowStep)
	defer cancel()
	return s.setBounds(c, id, b)
}

func (s *session) quickWindow(ctx context.Context) (windowBounds, bool) {
	c, cancel := context.WithTimeout(ctx, windowStep)
	defer cancel()
	_, b, e := s.window(c)
	return b, e == nil
}

// awaitState waits up to limit for a native window transition to finish.
func (s *session) awaitState(ctx context.Context, state string, limit time.Duration) bool {
	until := time.Now().Add(limit)
	for {
		if b, ok := s.quickWindow(ctx); ok && b.WindowState == state {
			return true
		}
		if time.Now().After(until) || ctx.Err() != nil {
			return false
		}
		time.Sleep(50 * time.Millisecond)
	}
}

// setVisible brings the task window on screen and to the front, or moves it
// back out of sight. Nothing is reloaded. Hiding is best effort: a window
// the system will not move or minimize stays where it is, and the task goes
// on.
func (s *session) setVisible(ctx context.Context, visible bool) error {
	if !s.hasWindow() {
		return errNoWindow
	}
	c, cancel := context.WithTimeout(ctx, windowStep)
	id, b, e := s.window(c)
	cancel()
	if e != nil {
		if visible {
			return e
		}
		return nil
	}
	if !visible {
		if b.WindowState == "minimized" {
			return nil
		}
		if b.WindowState != "normal" {
			_ = s.quickBounds(ctx, id, map[string]any{"windowState": "normal"})
			s.awaitState(ctx, "normal", 2*time.Second)
		}
		// macOS keeps part of every window on screen and reports the
		// clamped position only later, so the window is minimized there.
		if runtime.GOOS == "darwin" {
			// A window that has just opened can ignore the first request.
			for i := 0; i < 3; i++ {
				_ = s.quickBounds(ctx, id, map[string]any{"windowState": "minimized"})
				if s.awaitState(ctx, "minimized", time.Second) {
					break
				}
			}
			return nil
		}
		// Off screen keeps the page rendering normally. Some Linux window
		// managers keep part of a window on screen, sometimes only after
		// acknowledging the move; there the window is minimized.
		_ = s.quickBounds(ctx, id, map[string]any{"left": offscreen, "top": 0, "width": 1280, "height": 900})
		until := time.Now().Add(600 * time.Millisecond)
		for time.Now().Before(until) {
			if now, ok := s.quickWindow(ctx); ok && now.Left > offscreen/2 {
				_ = s.quickBounds(ctx, id, map[string]any{"windowState": "minimized"})
				return nil
			}
			time.Sleep(100 * time.Millisecond)
		}
		return nil
	}
	area := s.windowWorkArea(ctx)
	want := centeredWindow(area)
	var lastErr error
	for attempt := 0; attempt < 3 && ctx.Err() == nil; attempt++ {
		if now, ok := s.quickWindow(ctx); ok && now.WindowState != "normal" {
			if lastErr = s.quickBounds(ctx, id, map[string]any{"windowState": "normal"}); lastErr != nil {
				continue
			}
			if !s.awaitState(ctx, "normal", time.Second) {
				lastErr = errors.New("the window did not leave its minimized or fullscreen state")
				continue
			}
		}
		if lastErr = s.quickBounds(ctx, id, map[string]any{"left": want.Left, "top": want.Top, "width": want.Width, "height": want.Height}); lastErr != nil {
			continue
		}
		// An acknowledgement is not evidence that the native window moved.
		// macOS and desktop window managers may finish the transition later.
		frontCtx, stop := context.WithTimeout(ctx, windowStep)
		lastErr = s.conn.Call(frontCtx, "Page.bringToFront", nil, nil)
		stop()
		until := time.Now().Add(time.Second)
		for ctx.Err() == nil {
			if now, ok := s.quickWindow(ctx); ok && windowInWorkArea(now, area) {
				return nil
			}
			if time.Now().After(until) || !waitTick(ctx, 50*time.Millisecond) {
				break
			}
		}
	}
	if lastErr == nil {
		lastErr = errors.New("the window is still outside the visible work area")
	}
	return fmt.Errorf("could not confirm that the task window is visible: %w; retry browser_runner_start with the same task_id and headless=false", lastErr)
}

// Read native screen information in the isolated world. A site's replacement
// of window.screen must never decide where a human's task window is placed.
func (s *session) windowWorkArea(ctx context.Context) windowBounds {
	area := windowBounds{Width: 1360, Height: 980}
	c, cancel := context.WithTimeout(ctx, windowStep)
	defer cancel()
	id, err := s.world(c)
	if err != nil {
		return area
	}
	var out evalResult
	err = s.conn.Call(c, "Runtime.evaluate", map[string]any{"expression": "[screen.availLeft||0,screen.availTop||0,screen.availWidth,screen.availHeight]", "contextId": id, "returnByValue": true}, &out)
	var values [4]int
	if err == nil && json.Unmarshal(out.Result.Value, &values) == nil && values[2] > 0 && values[3] > 0 {
		area = windowBounds{Left: values[0], Top: values[1], Width: values[2], Height: values[3]}
	}
	return area
}

func centeredWindow(area windowBounds) windowBounds {
	margin := min(40, area.Width/10, area.Height/10)
	width, height := min(1280, area.Width-2*margin), min(900, area.Height-2*margin)
	return windowBounds{Left: area.Left + (area.Width-width)/2, Top: area.Top + (area.Height-height)/2, Width: width, Height: height, WindowState: "normal"}
}

func windowInWorkArea(b, area windowBounds) bool {
	if b.WindowState == "minimized" || b.Width <= 0 || b.Height <= 0 {
		return false
	}
	if b.WindowState == "fullscreen" || b.WindowState == "maximized" {
		return b.Left <= area.Left+8 && b.Top <= area.Top+8 && b.Left+b.Width >= area.Left+area.Width-8 && b.Top+b.Height >= area.Top+area.Height-8
	}
	return b.Left >= area.Left-8 && b.Top >= area.Top-8 && b.Left+b.Width <= area.Left+area.Width+8 && b.Top+b.Height <= area.Top+area.Height+8
}

func (s *session) windowIsVisible(ctx context.Context) bool {
	b, ok := s.quickWindow(ctx)
	return ok && windowInWorkArea(b, s.windowWorkArea(ctx))
}

// keepHidden puts a hidden task window back out of sight if it is on
// screen (the system restored it, or hiding did not take at launch).
func (s *session) keepHidden(ctx context.Context) {
	if s.cp.State == StateNeedsUser || !s.cp.Headless || !s.hasWindow() || !s.live() {
		return
	}
	if b, ok := s.quickWindow(ctx); ok && b.WindowState == "normal" && b.Left > offscreen/2 {
		_ = s.setVisible(ctx, false)
	}
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
