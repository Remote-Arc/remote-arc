package desktop

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestUnknownToolAndInvalidActionArguments(t *testing.T) {
	m, _, _ := fixture(t)
	_, err := m.Call(context.Background(), "desktop_dance", map[string]any{}, enabled)
	wantCode(t, err, ErrInvalidRequest)
	snap(t, m, map[string]any{})
	for name, args := range map[string]map[string]any{
		"button":       {"action": "click", "x": 1.0, "y": 1.0, "button": "thumb"},
		"scroll":       {"action": "scroll", "x": 1.0, "y": 1.0, "direction": "up", "amount": 99.0},
		"wait":         {"action": "wait", "ms": 50.0},
		"action":       {"action": "teleport"},
		"no point":     {"action": "click"},
		"window ref":   {"action": "focus_window", "ref": "e1"},
		"drag target":  {"action": "drag", "x": 1.0, "y": 1.0},
		"empty text":   {"action": "type", "text": ""},
		"max_width":    {"snapshot_only": true, "max_width": 100.0},
		"max_elements": {"snapshot_only": true, "max_elements": 999.0},
		"display":      {"snapshot_only": true, "display": 3.0},
	} {
		args["snapshot_id"] = "d1"
		var err error
		if args["snapshot_only"] == true {
			delete(args, "snapshot_only")
			_, err = m.Call(context.Background(), "desktop_snapshot", args, enabled)
		} else {
			_, err = act(m, args)
		}
		if err == nil || !strings.HasPrefix(err.Error(), ErrInvalidRequest+":") {
			t.Fatalf("%s: want %s, got %v", name, ErrInvalidRequest, err)
		}
	}
}

func TestPointerActionsAndButtons(t *testing.T) {
	m, f, _ := fixture(t)
	snap(t, m, map[string]any{})
	for _, args := range []map[string]any{
		{"action": "right_click", "x": 10.0, "y": 10.0},
		{"action": "click", "x": 10.0, "y": 10.0, "button": "middle"},
		{"action": "move", "x": 20.0, "y": 20.0},
		{"action": "scroll", "x": 10.0, "y": 10.0, "direction": "left"},
		{"action": "scroll", "x": 10.0, "y": 10.0, "direction": "right", "amount": 2.0},
	} {
		args["snapshot_id"] = "d1"
		f.sent = nil
		out, err := act(m, args)
		if err != nil || out["done"] != true {
			t.Fatalf("%v: %v %v", args, out, err)
		}
	}
	if last := f.sent[len(f.sent)-1]; last.Kind != StepWheel || last.DX != 2 {
		t.Fatalf("scroll right two notches: %+v", last)
	}
	f.sent = nil
	act(m, map[string]any{"snapshot_id": "d1", "action": "click", "x": 10.0, "y": 10.0, "button": "middle"})
	if f.sent[2].Button != "middle" {
		t.Fatalf("middle click: %+v", f.sent)
	}
	// A drag that would drop onto a protected window is refused before any input.
	f.sent = nil
	f.at = f.windows[1]
	_, err := act(m, map[string]any{"snapshot_id": "d1", "action": "drag", "x": 1.0, "y": 1.0, "to_x": 700.0, "to_y": 100.0})
	wantCode(t, err, ErrAppBlocked)
	if len(f.sent) != 0 {
		t.Fatal("no input before a refused drag")
	}
}

func TestFocusWindowAndWait(t *testing.T) {
	m, f, _ := fixture(t)
	snap(t, m, map[string]any{})
	if out, err := act(m, map[string]any{"snapshot_id": "d1", "action": "focus_window", "ref": "w1"}); err != nil || out["action"] != "focus_window" || f.focused != 1 {
		t.Fatalf("focus: %v %v", out, err)
	}
	_, err := act(m, map[string]any{"snapshot_id": "d1", "action": "focus_window", "ref": "w9"})
	wantCode(t, err, ErrInvalidRequest)
	f.focusErr = errors.New("kept in back")
	if _, err := act(m, map[string]any{"snapshot_id": "d1", "action": "focus_window", "ref": "w1"}); err == nil || !strings.Contains(err.Error(), "kept in back") {
		t.Fatalf("a refused focus is reported: %v", err)
	}
	started := time.Now()
	if out, err := act(m, map[string]any{"snapshot_id": "d1", "action": "wait", "ms": 100.0}); err != nil || out["action"] != "wait" {
		t.Fatalf("wait: %v %v", out, err)
	}
	if time.Since(started) < 100*time.Millisecond {
		t.Fatal("wait waits on the computer")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := m.Call(ctx, "desktop_act", map[string]any{"snapshot_id": "d1", "action": "wait", "ms": 5000.0}, enabled); !errors.Is(err, context.Canceled) {
		t.Fatalf("a cancelled wait stops: %v", err)
	}
}

func TestInputFailuresAndCancellation(t *testing.T) {
	m, f, _ := fixture(t)
	snap(t, m, map[string]any{})
	f.sendErr = errors.New("blocked by an elevated window")
	if _, err := act(m, map[string]any{"snapshot_id": "d1", "action": "click", "x": 1.0, "y": 1.0}); err == nil || !strings.Contains(err.Error(), "elevated window") {
		t.Fatalf("input failure: %v", err)
	}
	f.sendErr = nil
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := m.Call(ctx, "desktop_act", map[string]any{"snapshot_id": "d1", "action": "type", "text": "hello"}, enabled); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled typing: %v", err)
	}
	// With no window in front, keys have nowhere the AI has seen to go.
	for i := range f.windows {
		f.windows[i].Foreground = false
	}
	_, err := act(m, map[string]any{"snapshot_id": "d1", "action": "key", "keys": "enter"})
	wantCode(t, err, ErrFocusChanged)
}

func TestDisplaysAndWindowsInTheSnapshot(t *testing.T) {
	m, f, _ := fixture(t)
	f.displays = []Display{{Bounds: Rect{0, 0, 1280, 800}}, {Bounds: Rect{1280, 0, 1280, 800}, Primary: true}}
	f.windows = []Window{
		{Handle: 1, Title: strings.Repeat("long title ", 30), App: "editor.exe", Bounds: Rect{1300, 10, 600, 400}, Foreground: true},
		{Handle: 2, Title: "Mail", App: "mail.exe", Bounds: Rect{10, 10, 300, 200}},
		{Handle: 3, Title: "Music", App: "music.exe", Minimized: true},
	}
	f.elements = []Element{{Role: "button", Name: "Off", Bounds: Rect{1310, 20, 50, 20}}}
	out := snap(t, m, map[string]any{"max_width": 640.0})
	if out["display"].(map[string]any)["index"] != 1 {
		t.Fatalf("the display with the foreground window is captured: %v", out["display"])
	}
	windows := out["windows"].([]map[string]any)
	if !strings.HasSuffix(windows[0]["title"].(string), "…") || len([]rune(windows[0]["title"].(string))) != 121 {
		t.Fatalf("long titles are clipped: %q", windows[0]["title"])
	}
	if windows[1]["on_other_display"] != true || windows[2]["minimized"] != true {
		t.Fatalf("other display and minimized windows: %v", windows)
	}
	if out["elements"].([]map[string]any)[0]["disabled"] != true {
		t.Fatalf("disabled controls are marked: %v", out["elements"])
	}
	if _, ok := out["cursor"]; ok {
		t.Fatal("a cursor on another display is not placed in this screenshot")
	}
	out = snap(t, m, map[string]any{"display": 0.0, "include_image": false, "max_elements": 0.0})
	if _, ok := out["screenshot"]; ok || out["display"].(map[string]any)["index"] != 0 || len(out["elements"].([]map[string]any)) != 0 {
		t.Fatalf("an explicit display without an image or controls: %v", out)
	}
	// Without a foreground window, the primary display is captured.
	f.windows[0].Foreground = false
	if out := snap(t, m, map[string]any{}); out["display"].(map[string]any)["index"] != 1 {
		t.Fatalf("primary display: %v", out["display"])
	}
}
