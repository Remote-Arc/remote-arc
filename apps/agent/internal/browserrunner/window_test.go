package browserrunner

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

func TestWindowPlacementFitsSmallAndSecondaryDisplays(t *testing.T) {
	for _, area := range []windowBounds{
		{Width: 2560, Height: 1392},
		{Width: 1024, Height: 728},
		{Width: 640, Height: 480},
		{Left: -1920, Top: -240, Width: 1920, Height: 1040},
		{Left: 2560, Top: 320, Width: 1440, Height: 900},
	} {
		window := centeredWindow(area)
		if !windowInWorkArea(window, area) {
			t.Fatalf("window cannot be reached: window=%+v work area=%+v", window, area)
		}
		if window.Left < area.Left || window.Top < area.Top || window.Left+window.Width > area.Left+area.Width || window.Top+window.Height > area.Top+area.Height {
			t.Fatalf("window extends beyond work area: window=%+v work area=%+v", window, area)
		}
	}
}

func TestWindowVisibilityRejectsParkedAndMinimizedWindows(t *testing.T) {
	area := windowBounds{Width: 1920, Height: 1040}
	for _, window := range []windowBounds{
		{Left: offscreen, Width: 1280, Height: 900, WindowState: "normal"},
		{Left: 30000, Width: 1280, Height: 900, WindowState: "normal"},
		{Left: 40, Top: 40, Width: 1280, Height: 900, WindowState: "minimized"},
		{Left: 40, Top: -1500, Width: 1280, Height: 900, WindowState: "normal"},
		{Left: 40, Top: 40},
	} {
		if windowInWorkArea(window, area) {
			t.Fatalf("unreachable window reported as visible: %+v", window)
		}
	}
	for _, state := range []string{"maximized", "fullscreen"} {
		if !windowInWorkArea(windowBounds{Width: 1920, Height: 1080, WindowState: state}, area) {
			t.Fatalf("visible %s window was rejected", state)
		}
	}
}

type ignoredWindowMoveClient struct{ staticViewClient }

func (c *ignoredWindowMoveClient) Call(ctx context.Context, method string, params any, out any) error {
	if method == "Browser.getWindowForTarget" {
		data, _ := json.Marshal(map[string]any{"windowId": 1, "bounds": windowBounds{Left: offscreen, Width: 1280, Height: 900, WindowState: "normal"}})
		return json.Unmarshal(data, out)
	}
	return nil // Window manager acknowledges a request but leaves it off screen.
}

func TestWindowHandoffDoesNotReportAnIgnoredMoveAsVisible(t *testing.T) {
	s := &session{cp: &Checkpoint{}, proc: &browserProcess{}, conn: &ignoredWindowMoveClient{}}
	ctx, cancel := context.WithTimeout(context.Background(), 750*time.Millisecond)
	defer cancel()
	if err := s.setVisible(ctx, true); err == nil {
		t.Fatal("an unchanged off-screen window was reported as visible")
	}
}
