package desktop

import (
	"bytes"
	"context"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"strings"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

type fakePlatform struct {
	displays  []Display
	windows   []Window
	elements  []Element
	at        Window
	locked    bool
	lastUser  time.Time
	sent      []Step
	interrupt int // a person moves the mouse after this many steps; 0 never
	now       func() time.Time
	focused   uintptr
	notice    []bool
	focusErr  error
	sendErr   error
}

func (f *fakePlatform) Ready() error                 { return nil }
func (f *fakePlatform) Start() error                 { return nil }
func (f *fakePlatform) Displays() ([]Display, error) { return f.displays, nil }
func (f *fakePlatform) Capture(r Rect) (*image.RGBA, error) {
	img := image.NewRGBA(image.Rect(0, 0, r.W, r.H))
	for i := range img.Pix {
		img.Pix[i] = 255
	}
	return img, nil
}
func (f *fakePlatform) Windows() ([]Window, error) { return f.windows, nil }
func (f *fakePlatform) Elements(w Window, limit int) ([]Element, bool, error) {
	if len(f.elements) > limit {
		return f.elements[:limit], true, nil
	}
	return f.elements, false, nil
}
func (f *fakePlatform) WindowAt(x, y int) (Window, error) { return f.at, nil }
func (f *fakePlatform) Cursor() (int, int, error)         { return 100, 100, nil }
func (f *fakePlatform) Locked() bool                      { return f.locked }
func (f *fakePlatform) LastUserInput() time.Time          { return f.lastUser }
func (f *fakePlatform) Send(steps []Step, abort func() bool) (int, error) {
	if f.sendErr != nil {
		return 0, f.sendErr
	}
	for i, step := range steps {
		if f.interrupt > 0 && i == f.interrupt {
			f.lastUser = f.now().Add(time.Millisecond)
		}
		if abort() {
			return i, nil
		}
		f.sent = append(f.sent, step)
	}
	return len(steps), nil
}
func (f *fakePlatform) Focus(w Window) error {
	if f.focusErr != nil {
		return f.focusErr
	}
	f.focused = w.Handle
	return nil
}
func (f *fakePlatform) Indicate(active bool) { f.notice = append(f.notice, active) }

var enabled = protocol.Policy{DesktopControlEnabled: true}

func fixture(t *testing.T) (*Manager, *fakePlatform, *time.Time) {
	t.Helper()
	clock := time.Date(2026, 11, 20, 9, 0, 0, 0, time.UTC)
	editor := Window{Handle: 1, Title: "notes.txt - Notepad", App: "notepad.exe", Bounds: Rect{0, 0, 1280, 720}, Foreground: true}
	vault := Window{Handle: 2, Title: "Vault - 1Password", App: "1password.exe", Bounds: Rect{1300, 0, 600, 400}}
	f := &fakePlatform{
		displays: []Display{{Bounds: Rect{0, 0, 2732, 1536}, Primary: true}},
		windows:  []Window{editor, vault},
		elements: []Element{
			{Role: "button", Name: "Save", Enabled: true, Bounds: Rect{200, 100, 100, 40}},
			{Role: "edit", Name: "Password", Value: "hunter2", Password: true, Enabled: true, Bounds: Rect{200, 200, 400, 40}},
			{Role: "edit", Name: "Search", Value: "groceries", Enabled: true, Focused: true, Bounds: Rect{200, 300, 400, 40}},
		},
		at: editor,
	}
	f.now = func() time.Time { return clock }
	m := newManager(f, func() time.Time { return clock })
	return m, f, &clock
}

func snap(t *testing.T, m *Manager, args map[string]any) map[string]any {
	t.Helper()
	out, err := m.Call(context.Background(), "desktop_snapshot", args, enabled)
	if err != nil {
		t.Fatal(err)
	}
	return out.(map[string]any)
}

func act(m *Manager, args map[string]any) (map[string]any, error) {
	out, err := m.Call(context.Background(), "desktop_act", args, enabled)
	if err != nil {
		return nil, err
	}
	return out.(map[string]any), nil
}

func wantCode(t *testing.T, err error, code string) {
	t.Helper()
	if err == nil || !strings.HasPrefix(err.Error(), code+":") {
		t.Fatalf("want %s, got %v", code, err)
	}
}

func TestOwnerPolicyIsRequiredOnEveryCall(t *testing.T) {
	m, f, _ := fixture(t)
	_, err := m.Call(context.Background(), "desktop_snapshot", map[string]any{}, protocol.Policy{})
	wantCode(t, err, ErrDisabled)
	if len(f.notice) != 0 {
		t.Fatal("a refused call must not show the on-screen notice")
	}
}

func TestLockedComputerRefusesBothTools(t *testing.T) {
	m, f, _ := fixture(t)
	f.locked = true
	_, err := m.Call(context.Background(), "desktop_snapshot", map[string]any{}, enabled)
	wantCode(t, err, ErrLocked)
	_, err = act(m, map[string]any{"snapshot_id": "d1", "action": "click", "x": 1.0, "y": 1.0})
	wantCode(t, err, ErrLocked)
}

func TestSnapshotScalesMasksAndHidesSecrets(t *testing.T) {
	m, f, _ := fixture(t)
	out := snap(t, m, map[string]any{})
	if out["snapshot_id"] != "d1" || len(f.notice) == 0 || !f.notice[0] {
		t.Fatalf("snapshot id or notice: %v %v", out["snapshot_id"], f.notice)
	}
	img := out["image"].(map[string]any)
	if img["width"] != 1366 || img["height"] != 768 {
		t.Fatalf("a 2732 px display is scaled to 1366x768, got %v", img)
	}
	elements := out["elements"].([]map[string]any)
	if len(elements) != 3 {
		t.Fatalf("elements: %v", elements)
	}
	if got := elements[0]["rect"].([]int); got[0] != 100 || got[1] != 50 || got[2] != 50 || got[3] != 20 {
		t.Fatalf("element rect must be in screenshot pixels, got %v", got)
	}
	if _, leaked := elements[1]["value"]; leaked || elements[1]["password"] != true {
		t.Fatalf("a password field never reports its value: %v", elements[1])
	}
	if elements[2]["value"] != "groceries" || elements[2]["focused"] != true {
		t.Fatalf("ordinary value and focus: %v", elements[2])
	}
	windows := out["windows"].([]map[string]any)
	if windows[1]["hidden"] != true || windows[1]["title"] != nil {
		t.Fatalf("a password manager's title is hidden: %v", windows[1])
	}
	if out["masked_windows"] != 1 {
		t.Fatalf("masked_windows: %v", out["masked_windows"])
	}
	data, _ := base64.StdEncoding.DecodeString(out["screenshot"].(map[string]any)["data"].(string))
	decoded, err := jpeg.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	// The vault window (1300..1900 physical, 650..950 in the image) is painted over.
	inside := color.GrayModel.Convert(decoded.At(800, 100)).(color.Gray)
	outside := color.GrayModel.Convert(decoded.At(300, 600)).(color.Gray)
	if inside.Y > 80 || outside.Y < 200 {
		t.Fatalf("masked area %d, open area %d", inside.Y, outside.Y)
	}
}

func TestSnapshotOfABlockedForegroundAppReadsNoControls(t *testing.T) {
	m, f, _ := fixture(t)
	f.windows[0].Foreground, f.windows[1].Foreground = false, true
	out := snap(t, m, map[string]any{"display": 0.0})
	if len(out["elements"].([]map[string]any)) != 0 || out["foreground"].(map[string]any)["blocked"] != true {
		t.Fatalf("blocked foreground: %v", out["foreground"])
	}
}

func TestClickRefAndPointMapToPhysicalPixels(t *testing.T) {
	m, f, _ := fixture(t)
	snap(t, m, map[string]any{})
	if _, err := act(m, map[string]any{"snapshot_id": "d1", "action": "click", "ref": "e1"}); err != nil {
		t.Fatal(err)
	}
	if f.sent[0].Kind != StepMove || f.sent[0].X != 250 || f.sent[0].Y != 120 {
		t.Fatalf("click ref moves to the element's centre, got %+v", f.sent[0])
	}
	f.sent = nil
	if _, err := act(m, map[string]any{"snapshot_id": "d1", "action": "double_click", "x": 683.0, "y": 384.0}); err != nil {
		t.Fatal(err)
	}
	if f.sent[0].X != 1367 || f.sent[0].Y != 769 {
		t.Fatalf("screenshot 683,384 is physical 1367,769, got %+v", f.sent[0])
	}
	downs := 0
	for _, s := range f.sent {
		if s.Kind == StepButtonDown {
			downs++
		}
	}
	if downs != 2 {
		t.Fatalf("double click presses twice, got %d", downs)
	}
	_, err := act(m, map[string]any{"snapshot_id": "d1", "action": "click", "x": 1366.0, "y": 0.0})
	wantCode(t, err, ErrInvalidRequest)
	_, err = act(m, map[string]any{"snapshot_id": "d1", "action": "click", "ref": "e9"})
	wantCode(t, err, ErrInvalidRequest)
}

func TestTheUserAlwaysWins(t *testing.T) {
	m, f, clock := fixture(t)
	snap(t, m, map[string]any{})
	f.lastUser = clock.Add(-2 * time.Second)
	_, err := act(m, map[string]any{"snapshot_id": "d1", "action": "type", "text": "hi"})
	wantCode(t, err, ErrUserActive)

	// Quiet again, but the person used the computer after the snapshot was taken.
	f.lastUser = clock.Add(time.Second)
	*clock = clock.Add(10 * time.Second)
	_, err = act(m, map[string]any{"snapshot_id": "d1", "action": "type", "text": "hi"})
	wantCode(t, err, ErrUserTookOver)

	snap(t, m, map[string]any{})
	f.interrupt = 3
	_, err = act(m, map[string]any{"snapshot_id": "d2", "action": "type", "text": "hello world"})
	wantCode(t, err, ErrUserTookOver)
	if len(f.sent) != 3 {
		t.Fatalf("input stops at the person's first move, sent %d steps", len(f.sent))
	}
}

func TestKeyboardInputNeedsTheWindowTheAISaw(t *testing.T) {
	m, f, _ := fixture(t)
	snap(t, m, map[string]any{})
	f.windows[0].Foreground, f.windows[1].Foreground = false, true
	_, err := act(m, map[string]any{"snapshot_id": "d1", "action": "key", "keys": "ctrl+v"})
	wantCode(t, err, ErrAppBlocked)
	f.windows[1].Foreground = false
	f.windows = append(f.windows, Window{Handle: 3, Title: "Chat", App: "chat.exe", Foreground: true})
	_, err = act(m, map[string]any{"snapshot_id": "d1", "action": "type", "text": "secret plans"})
	wantCode(t, err, ErrFocusChanged)
	if len(f.sent) != 0 {
		t.Fatal("no key may be sent to an unseen window")
	}
}

func TestPointerInputNeverReachesABlockedApp(t *testing.T) {
	m, f, _ := fixture(t)
	snap(t, m, map[string]any{})
	f.at = f.windows[1]
	_, err := act(m, map[string]any{"snapshot_id": "d1", "action": "click", "x": 700.0, "y": 100.0})
	wantCode(t, err, ErrAppBlocked)
	_, err = act(m, map[string]any{"snapshot_id": "d1", "action": "focus_window", "ref": "w2"})
	wantCode(t, err, ErrAppBlocked)
	if len(f.sent) != 0 || f.focused != 0 {
		t.Fatal("nothing reaches a protected window")
	}
}

func TestSnapshotsExpireAndOnlyRecentOnesAreKept(t *testing.T) {
	m, _, clock := fixture(t)
	snap(t, m, map[string]any{})
	*clock = clock.Add(3 * time.Minute)
	_, err := act(m, map[string]any{"snapshot_id": "d1", "action": "move", "x": 1.0, "y": 1.0})
	wantCode(t, err, ErrStaleSnapshot)
	for i := 0; i < keptSnapshots+1; i++ {
		snap(t, m, map[string]any{})
	}
	_, err = act(m, map[string]any{"snapshot_id": "d2", "action": "move", "x": 1.0, "y": 1.0})
	wantCode(t, err, ErrStaleSnapshot)
	_, err = act(m, map[string]any{"action": "move", "x": 1.0, "y": 1.0})
	wantCode(t, err, ErrInvalidRequest)
}

func TestTypeAndKeySteps(t *testing.T) {
	m, f, _ := fixture(t)
	snap(t, m, map[string]any{})
	if _, err := act(m, map[string]any{"snapshot_id": "d1", "action": "type", "text": "a\nb😀"}); err != nil {
		t.Fatal(err)
	}
	var kinds []StepKind
	for _, s := range f.sent {
		if s.Kind != StepPause {
			kinds = append(kinds, s.Kind)
		}
	}
	want := []StepKind{StepChar, StepKeyDown, StepKeyUp, StepChar, StepChar, StepChar}
	if len(kinds) != len(want) {
		t.Fatalf("type steps %v", kinds)
	}
	for i := range want {
		if kinds[i] != want[i] {
			t.Fatalf("type steps %v", kinds)
		}
	}
	keys, err := parseKeys("Control+Shift+S")
	if err != nil || strings.Join(keys, "+") != "ctrl+shift+s" {
		t.Fatalf("keys %v %v", keys, err)
	}
	steps := keySteps(keys)
	if steps[0].Key != "ctrl" || steps[5].Key != "ctrl" || steps[5].Kind != StepKeyUp {
		t.Fatalf("modifiers are released last: %+v", steps)
	}
	for _, bad := range []string{"", "s+ctrl", "ctrl+hyper", "a+b+c+d+e+f"} {
		if _, err := parseKeys(bad); err == nil {
			t.Fatalf("%q must be refused", bad)
		}
	}
	_, err = act(m, map[string]any{"snapshot_id": "d1", "action": "type", "text": strings.Repeat("x", maxTextRunes+1)})
	wantCode(t, err, ErrInvalidRequest)
}

func TestScrollDragAndSnapshotAfterAction(t *testing.T) {
	m, f, _ := fixture(t)
	snap(t, m, map[string]any{})
	if _, err := act(m, map[string]any{"snapshot_id": "d1", "action": "scroll", "x": 10.0, "y": 10.0, "direction": "down", "amount": 4.0}); err != nil {
		t.Fatal(err)
	}
	if last := f.sent[len(f.sent)-1]; last.Kind != StepWheel || last.DY != -4 {
		t.Fatalf("scroll down 4 notches, got %+v", last)
	}
	f.sent = nil
	out, err := act(m, map[string]any{"snapshot_id": "d1", "action": "drag", "x": 0.0, "y": 0.0, "to_x": 100.0, "to_y": 50.0, "snapshot": true})
	if err != nil {
		t.Fatal(err)
	}
	last := f.sent[len(f.sent)-1]
	if f.sent[2].Kind != StepButtonDown || last.Kind != StepButtonUp {
		t.Fatalf("drag holds the button: %+v", f.sent)
	}
	if out["snapshot"].(map[string]any)["snapshot_id"] != "d2" {
		t.Fatalf("snapshot=true returns the new screen: %v", out)
	}
	_, err = act(m, map[string]any{"snapshot_id": "d2", "action": "scroll", "x": 1.0, "y": 1.0, "direction": "sideways"})
	wantCode(t, err, ErrInvalidRequest)
}
