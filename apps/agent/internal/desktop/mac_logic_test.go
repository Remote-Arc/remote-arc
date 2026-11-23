package desktop

import (
	"encoding/json"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func opsOf(t *testing.T, steps []Step) []macOp {
	t.Helper()
	batches, err := macBatches(steps)
	if err != nil {
		t.Fatal(err)
	}
	ops, total := []macOp{}, 0
	for _, batch := range batches {
		if len(batch.ops) > macBatchOps {
			t.Fatalf("a batch has %d operations", len(batch.ops))
		}
		ops = append(ops, batch.ops...)
		total += batch.steps
	}
	if total != len(steps) {
		t.Fatalf("batches cover %d of %d steps", total, len(steps))
	}
	return ops
}

func TestMacEveryAcceptedKeyHasACodeOrFlag(t *testing.T) {
	for name := range keyNames {
		_, key := macKeyCodes[name]
		_, flag := macModifierFlags[name]
		if key == flag {
			t.Fatalf("%q needs exactly one of a key code or a modifier flag", name)
		}
	}
}

func TestMacShortcutsCarryHeldModifiersAsFlags(t *testing.T) {
	keys, err := parseKeys("cmd+shift+s")
	if err != nil {
		t.Fatal(err)
	}
	ops := opsOf(t, keySteps(keys))
	want := []macOp{{Op: "key", Code: 1, Flags: macModifierFlags["win"] | macModifierFlags["shift"]}}
	if !reflect.DeepEqual(ops, want) {
		t.Fatalf("got %+v", ops)
	}
	// Released modifiers do not leak onto the next key.
	ops = opsOf(t, append(keySteps(keys), keySteps([]string{"enter"})...))
	if ops[1] != (macOp{Op: "key", Code: 36}) {
		t.Fatalf("got %+v", ops[1])
	}
}

func TestMacClicksCountAndDragsHoldTheButton(t *testing.T) {
	ops := opsOf(t, clickSteps(40, 50, "left", 2))
	clicks := []int{}
	for _, op := range ops {
		if op.Op == "down" || op.Op == "up" {
			clicks = append(clicks, op.Clicks)
			if op.X != 40 || op.Y != 50 {
				t.Fatalf("a button event is placed at the pointer: %+v", op)
			}
		}
	}
	if !reflect.DeepEqual(clicks, []int{1, 1, 2, 2}) {
		t.Fatalf("a double click is click 1 then click 2: %v", clicks)
	}
	// Clicking somewhere else starts counting again.
	ops = opsOf(t, append(clickSteps(1, 1, "left", 1), clickSteps(9, 9, "left", 1)...))
	for _, op := range ops {
		if op.Op == "down" && op.Clicks != 1 {
			t.Fatalf("separate clicks: %+v", ops)
		}
	}
	ops = opsOf(t, dragSteps(0, 0, 100, 0))
	dragging := false
	for _, op := range ops {
		switch op.Op {
		case "down":
			dragging = true
		case "up":
			dragging = false
		case "move":
			if dragging && op.Button != "left" || !dragging && op.Button != "" {
				t.Fatalf("a move while the button is held is a drag: %+v", ops)
			}
		}
	}
	if _, err := macBatches([]Step{{Kind: StepButtonDown, Button: "fourth"}}); err == nil {
		t.Fatal("unknown buttons are refused")
	}
	if _, err := macBatches([]Step{{Kind: StepButtonUp, Button: "fourth"}}); err == nil {
		t.Fatal("unknown buttons are refused")
	}
}

func TestMacTextBecomesOneUnicodeOperation(t *testing.T) {
	text := "Hi, 你好 😀"
	ops := opsOf(t, textSteps(text))
	if len(ops) != 1 || ops[0].Op != "text" || ops[0].Text != text {
		t.Fatalf("got %+v", ops)
	}
	steps := append(textSteps("ab"), Step{Kind: StepWheel, DY: -3}, Step{Kind: StepPause, Pause: 40 * time.Millisecond})
	ops = opsOf(t, steps)
	want := []macOp{{Op: "text", Text: "ab"}, {Op: "wheel", DY: -3}, {Op: "pause", MS: 40}}
	if !reflect.DeepEqual(ops, want) {
		t.Fatalf("got %+v", ops)
	}
	if _, err := macBatches([]Step{{Kind: StepKeyDown, Key: "hyper"}}); err == nil {
		t.Fatal("unknown keys are refused")
	}
	if _, err := macBatches([]Step{{Kind: StepKind(99)}}); err == nil {
		t.Fatal("unknown steps are refused")
	}
}

func TestMacTypedLineBreaksJoinThePastedText(t *testing.T) {
	// Line breaks and tabs inside typed text are pasted with it; a trailing
	// Enter stays a key press so it still submits.
	ops := opsOf(t, textSteps("a\nb\tc\n"))
	want := []macOp{{Op: "text", Text: "a\nb\tc"}, {Op: "key", Code: macKeyCodes["enter"]}, {Op: "pause", MS: 4}}
	if !reflect.DeepEqual(ops, want) {
		t.Fatalf("got %+v", ops)
	}
	// Text that starts with a line break keeps it.
	if ops := opsOf(t, textSteps("\nx")); len(ops) != 1 || ops[0].Text != "\nx" {
		t.Fatalf("got %+v", ops)
	}
	// Pressing Enter or Tab with action=key is never text.
	k, _ := parseKeys("enter")
	steps := append(keySteps(k), textSteps("x")...)
	if ops := opsOf(t, steps); ops[0].Op != "key" || ops[1].Text != "x" {
		t.Fatalf("got %+v", ops)
	}
	// A typed Enter followed by other input before more text stays a key press.
	steps = append(textSteps("a\n"), Step{Kind: StepMove, X: 1, Y: 1})
	steps = append(steps, textSteps("b")...)
	ops = opsOf(t, steps)
	if ops[0].Text != "a" || ops[1].Op != "key" {
		t.Fatalf("got %+v", ops)
	}
	// Each typed step still counts once, so input can stop between batches.
	batches, _ := macBatches(textSteps("a\nb"))
	if len(batches) != 1 || batches[0].steps != len(textSteps("a\nb")) {
		t.Fatalf("got %+v", batches)
	}
}

func TestMacLongInputIsSplitIntoBatches(t *testing.T) {
	steps := []Step{}
	for i := 0; i < 60; i++ {
		steps = append(steps, Step{Kind: StepMove, X: i, Y: i})
	}
	batches, err := macBatches(steps)
	if err != nil || len(batches) != 3 || batches[0].steps != macBatchOps {
		t.Fatalf("got %d batches, %v", len(batches), err)
	}
	opsOf(t, steps)
	if batches, _ := macBatches(nil); len(batches) != 0 {
		t.Fatal("no steps, no batches")
	}
}

func TestMacWindowListKeepsAppWindowsAndProtectedPrompts(t *testing.T) {
	raw := []macWindow{
		{Number: 1, Owner: "Window Server", Name: "Menubar", Layer: 25, Alpha: 1, Width: 1440, Height: 24},
		{Number: 2, Owner: "SecurityAgent", Layer: 1000, Alpha: 1, Width: 400, Height: 200},
		{Number: 3, Owner: "Safari", PID: 7, Name: "Docs", Alpha: 1, X: 10, Y: 30, Width: 800, Height: 600, Foreground: true},
		{Number: 4, Owner: "Safari", PID: 7, Name: "", Alpha: 1, Width: 300, Height: 300, Foreground: true},
		{Number: 5, Owner: "Ghost", Alpha: 0, Width: 300, Height: 300},
		{Number: 6, Owner: "Tiny", Alpha: 1, Width: 0, Height: 10},
		{Number: 7, Owner: "osascript", Layer: 1000, Alpha: 1, Width: 500, Height: 50},
	}
	data, _ := json.Marshal(raw)
	windows, err := parseMacWindows(data)
	if err != nil {
		t.Fatal(err)
	}
	got := []uintptr{}
	for _, w := range windows {
		got = append(got, w.Handle)
	}
	if !reflect.DeepEqual(got, []uintptr{2, 3, 4}) {
		t.Fatalf("windows %v", got)
	}
	if windows[0].App != "securityagent" || !blockedApps[windows[0].App] || windows[0].Foreground {
		t.Fatalf("the password prompt is kept so it is masked: %+v", windows[0])
	}
	if !windows[1].Foreground || windows[2].Foreground || windows[1].Bounds != (Rect{10, 30, 800, 600}) {
		t.Fatalf("only the front window of the front app has focus: %+v", windows[1:])
	}
	if windows[2].Title != "Safari" {
		t.Fatalf("an untitled window is named after its app: %q", windows[2].Title)
	}
	if _, err := parseMacWindows([]byte("nope")); err == nil {
		t.Fatal("bad JSON is an error")
	}
}

func TestMacDisplays(t *testing.T) {
	displays, err := parseMacDisplays([]byte(`[{"x":0,"y":0,"width":1512,"height":982,"main":true},{"x":-1920,"y":-98,"width":1920,"height":1080,"main":false}]`))
	if err != nil {
		t.Fatal(err)
	}
	want := []Display{{Bounds: Rect{0, 0, 1512, 982}, Primary: true}, {Bounds: Rect{-1920, -98, 1920, 1080}}}
	if !reflect.DeepEqual(displays, want) {
		t.Fatalf("got %+v", displays)
	}
	for _, bad := range []string{"[]", "{", ""} {
		if _, err := parseMacDisplays([]byte(bad)); err == nil {
			t.Fatalf("%q is an error", bad)
		}
	}
}

func TestMacIdleAndLockFromIoreg(t *testing.T) {
	idle, ok := parseMacIdle([]byte(`    | |   "HIDIdleTime" = 1500000000`))
	if !ok || idle != 1500*time.Millisecond {
		t.Fatalf("idle %v %v", idle, ok)
	}
	if _, ok := parseMacIdle([]byte(`"HIDIdleTime" = 99999999999999999999999`)); ok {
		t.Fatal("an overflowing idle time is ignored")
	}
	if _, ok := parseMacIdle(nil); ok {
		t.Fatal("no idle time")
	}
	console := func(entries string) []byte {
		return []byte(`  | "IOConsoleUsers" = (` + entries + `)`)
	}
	me := `{"kCGSSessionUserIDKey"=501,"kCGSSessionOnConsoleKey"=Yes,"kCGSessionLoginDoneKey"=Yes}`
	locked := `{"kCGSSessionUserIDKey"=501,"kCGSSessionOnConsoleKey"=Yes,"CGSSessionScreenIsLocked"=Yes}`
	away := `{"kCGSSessionUserIDKey"=501,"kCGSSessionOnConsoleKey"=No}`
	other := `{"kCGSSessionUserIDKey"=502,"kCGSSessionOnConsoleKey"=Yes}`
	cases := map[string]bool{me: false, locked: true, away: true, other: true, other + "," + me: false}
	for entries, want := range cases {
		if got := macSessionLocked(console(entries), 501); got != want {
			t.Fatalf("%s: locked=%v", entries, got)
		}
	}
	if !macSessionLocked([]byte("no console"), 501) {
		t.Fatal("no console user counts as locked")
	}
}

func TestMacNoticeState(t *testing.T) {
	at := time.UnixMilli(1700000000123)
	if macNoticeState(true, at) != "show 1700000000123" || macNoticeState(false, at) != "hide 1700000000123" {
		t.Fatal(macNoticeState(true, at))
	}
}

// The JXA programs are JavaScript; check that each parses where Node is
// available. Whether they work needs a Mac.
func TestMacScriptsParse(t *testing.T) {
	names, err := fs.Glob(macScripts, "mac_scripts/*.js")
	if err != nil || len(names) != 6 {
		t.Fatalf("scripts %v %v", names, err)
	}
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed")
	}
	dir := t.TempDir()
	for _, name := range names {
		data, _ := macScripts.ReadFile(name)
		if !strings.Contains(string(data), "function run(") {
			t.Fatalf("%s has no run function for osascript", name)
		}
		path := filepath.Join(dir, filepath.Base(name))
		if err := os.WriteFile(path, data, 0o600); err != nil {
			t.Fatal(err)
		}
		if out, err := exec.Command(node, "--check", path).CombinedOutput(); err != nil {
			t.Fatalf("%s: %v\n%s", name, err, out)
		}
	}
}
