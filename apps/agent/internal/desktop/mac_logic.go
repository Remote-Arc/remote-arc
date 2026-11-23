package desktop

import (
	"embed"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"
)

// The macOS platform drives the screen through JavaScript for Automation
// (osascript), which reaches CoreGraphics and AppKit without cgo. This file
// holds what does not need macOS, so it is tested on every platform.

// macScripts are the JXA programs the macOS platform runs with osascript.
//
//go:embed mac_scripts/*.js
var macScripts embed.FS

// macKeyCodes are the virtual key codes of a US layout for the key names
// desktop_act accepts. Modifiers are sent as flags, not keys.
var macKeyCodes = map[string]int{
	"a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
	"b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "1": 18, "2": 19,
	"3": 20, "4": 21, "6": 22, "5": 23, "9": 25, "7": 26, "8": 28, "0": 29, "o": 31,
	"u": 32, "i": 34, "p": 35, "l": 37, "j": 38, "k": 40, "n": 45, "m": 46,
	"enter": 36, "tab": 48, "space": 49, "backspace": 51, "escape": 53, "delete": 117,
	"home": 115, "end": 119, "pageup": 116, "pagedown": 121,
	"left": 123, "right": 124, "down": 125, "up": 126, "insert": 114, "menu": 110,
	"f1": 122, "f2": 120, "f3": 99, "f4": 118, "f5": 96, "f6": 97, "f7": 98,
	"f8": 100, "f9": 101, "f10": 109, "f11": 103, "f12": 111,
}

// macModifierFlags are CGEventFlags; "win" is Command on a Mac.
var macModifierFlags = map[string]int64{
	"shift": 0x00020000, "ctrl": 0x00040000, "alt": 0x00080000, "win": 0x00100000,
}

// macOp is one operation the JXA input script performs.
type macOp struct {
	Op     string `json:"op"` // move, down, up, wheel, key, text, pause
	X      int    `json:"x,omitempty"`
	Y      int    `json:"y,omitempty"`
	Button string `json:"button,omitempty"`
	DX     int    `json:"dx,omitempty"`
	DY     int    `json:"dy,omitempty"`
	Clicks int    `json:"clicks,omitempty"`
	Code   int    `json:"code,omitempty"`
	Flags  int64  `json:"flags,omitempty"`
	Text   string `json:"text,omitempty"`
	MS     int    `json:"ms,omitempty"`
}

// macBatch is a run of operations sent in one osascript call, and how many
// of the original steps it covers, so input can stop between batches.
type macBatch struct {
	ops   []macOp
	steps int
}

const macBatchOps = 24

// typedRunes are the typed Enter and Tab presses as text.
var typedRunes = map[string]uint16{"enter": '\n', "tab": '\t'}

// typedTextFollows reports whether more typed characters come after steps[i]
// before any other input: only then does a typed Enter or Tab join the text.
func typedTextFollows(steps []Step, i int) bool {
	for _, next := range steps[i+1:] {
		switch {
		case next.Kind == StepChar:
			return true
		case next.Kind == StepPause, next.Typed:
		default:
			return false
		}
	}
	return false
}

// macBatches turns steps into JXA operations. A held modifier becomes a flag
// on the next key or click, consecutive characters become one text operation
// (the pauses between them are left to the system), and a typed Enter or Tab
// with more typed text after it joins that text: the text is pasted, and an
// input method can swallow a key press between two pastes. A typed Enter at
// the end stays a key press, so it still submits a form. The pointer position
// is carried onto button events, which CoreGraphics needs. A move while a
// button is held is a drag, and a press where the last one was released
// counts as the next click of a double or triple click.
func macBatches(steps []Step) ([]macBatch, error) {
	batches := []macBatch{}
	current := macBatch{}
	var flags int64
	x, y := 0, 0
	held, lastUp, clicks := "", "", 0
	text := []uint16{}
	textSteps := 0
	flushText := func() {
		if len(text) == 0 {
			return
		}
		current.ops = append(current.ops, macOp{Op: "text", Text: string(utf16.Decode(text))})
		current.steps += textSteps
		text, textSteps = text[:0], 0
	}
	flush := func() {
		flushText()
		if len(current.ops) > 0 || current.steps > 0 {
			batches = append(batches, current)
		}
		current = macBatch{}
	}
	for i, step := range steps {
		if r, ok := typedRunes[step.Key]; ok && step.Typed && flags == 0 && typedTextFollows(steps, i) {
			if step.Kind == StepKeyDown {
				text = append(text, r)
			}
			textSteps++
			continue
		}
		if step.Kind == StepChar {
			text = append(text, step.Char)
			textSteps++
			continue
		}
		if step.Kind == StepPause && len(text) > 0 {
			textSteps++
			continue
		}
		flushText()
		switch step.Kind {
		case StepMove:
			if step.X != x || step.Y != y {
				lastUp = ""
			}
			x, y = step.X, step.Y
			current.ops = append(current.ops, macOp{Op: "move", X: x, Y: y, Button: held})
		case StepButtonDown:
			if !macButton(step.Button) {
				return nil, fmt.Errorf("unknown mouse button %q", step.Button)
			}
			if lastUp == step.Button {
				clicks++
			} else {
				clicks = 1
			}
			held = step.Button
			current.ops = append(current.ops, macOp{Op: "down", X: x, Y: y, Button: step.Button, Clicks: clicks, Flags: flags})
		case StepButtonUp:
			if !macButton(step.Button) {
				return nil, fmt.Errorf("unknown mouse button %q", step.Button)
			}
			held, lastUp = "", step.Button
			current.ops = append(current.ops, macOp{Op: "up", X: x, Y: y, Button: step.Button, Clicks: max(clicks, 1), Flags: flags})
		case StepWheel:
			current.ops = append(current.ops, macOp{Op: "wheel", X: x, Y: y, DX: step.DX, DY: step.DY})
		case StepKeyDown:
			lastUp = ""
			if flag, ok := macModifierFlags[step.Key]; ok {
				flags |= flag
				break
			}
			code, ok := macKeyCodes[step.Key]
			if !ok {
				return nil, fmt.Errorf("unknown key %q", step.Key)
			}
			current.ops = append(current.ops, macOp{Op: "key", Code: code, Flags: flags})
		case StepKeyUp:
			if flag, ok := macModifierFlags[step.Key]; ok {
				flags &^= flag
			}
		case StepPause:
			current.ops = append(current.ops, macOp{Op: "pause", MS: int(step.Pause.Milliseconds())})
		default:
			return nil, fmt.Errorf("unknown input step %d", step.Kind)
		}
		current.steps++
		if len(current.ops) >= macBatchOps {
			flush()
		}
	}
	flush()
	return batches, nil
}

func macButton(name string) bool { return name == "left" || name == "right" || name == "middle" }

// macWindow is one entry the JXA window script prints.
type macWindow struct {
	Number     uint64  `json:"number"`
	Owner      string  `json:"owner"`
	PID        uint32  `json:"pid"`
	Name       string  `json:"name"`
	Layer      int     `json:"layer"`
	Alpha      float64 `json:"alpha"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	Width      float64 `json:"width"`
	Height     float64 `json:"height"`
	Foreground bool    `json:"foreground"`
}

// parseMacWindows reads the window script's JSON: on-screen windows, front
// to back. Menu bars, the Dock and other system layers are left out, except
// a password or sign-in prompt, which must stay visible to be protected.
func parseMacWindows(data []byte) ([]Window, error) {
	var raw []macWindow
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("could not read the window list: %v", err)
	}
	windows := []Window{}
	foreground := false
	for _, w := range raw {
		app := strings.ToLower(strings.TrimSpace(w.Owner))
		if w.Layer != 0 && !blockedApps[app] {
			continue
		}
		if w.Width < 1 || w.Height < 1 || w.Alpha <= 0 {
			continue
		}
		out := Window{
			Handle: uintptr(w.Number),
			Title:  w.Name,
			App:    app,
			PID:    w.PID,
			Bounds: Rect{int(w.X), int(w.Y), int(w.Width), int(w.Height)},
		}
		if out.Title == "" {
			out.Title = w.Owner
		}
		// The front window of the front app has keyboard focus.
		if w.Foreground && !foreground && w.Layer == 0 {
			out.Foreground, foreground = true, true
		}
		windows = append(windows, out)
	}
	return windows, nil
}

// parseMacDisplays reads the display script's JSON, in points with the origin at
// the top left of the main display, as CoreGraphics events use.
func parseMacDisplays(data []byte) ([]Display, error) {
	var raw []struct {
		X      float64 `json:"x"`
		Y      float64 `json:"y"`
		Width  float64 `json:"width"`
		Height float64 `json:"height"`
		Main   bool    `json:"main"`
	}
	if err := json.Unmarshal(data, &raw); err != nil || len(raw) == 0 {
		return nil, fmt.Errorf("could not read the displays: %v", err)
	}
	displays := []Display{}
	for _, d := range raw {
		displays = append(displays, Display{Bounds: Rect{int(d.X), int(d.Y), int(d.Width), int(d.Height)}, Primary: d.Main})
	}
	return displays, nil
}

var (
	macIdleTime     = regexp.MustCompile(`"HIDIdleTime"\s*=\s*([0-9]+)`)
	macConsoleEntry = regexp.MustCompile(`\{[^{}]+\}`)
	macConsoleUID   = regexp.MustCompile(`"kCGSSessionUserIDKey"\s*=\s*([0-9]+)`)
	macOnConsole    = regexp.MustCompile(`"kCGSSessionOnConsoleKey"\s*=\s*Yes`)
	macScreenLocked = regexp.MustCompile(`"CGSSessionScreenIsLocked"\s*=\s*Yes`)
)

// parseMacIdle reads HIDIdleTime, in nanoseconds, from `ioreg -c IOHIDSystem`.
func parseMacIdle(data []byte) (time.Duration, bool) {
	match := macIdleTime.FindSubmatch(data)
	if len(match) != 2 {
		return 0, false
	}
	idle, err := strconv.ParseUint(string(match[1]), 10, 63)
	if err != nil {
		return 0, false
	}
	return time.Duration(idle), true
}

// macSessionLocked reads the console users from `ioreg -n Root -d 1 -l`. The
// session is treated as locked unless uid is the user on the console and its
// screen is not locked, which also covers fast user switching.
func macSessionLocked(data []byte, uid int) bool {
	for _, line := range strings.Split(string(data), "\n") {
		if !strings.Contains(line, `"IOConsoleUsers"`) {
			continue
		}
		for _, entry := range macConsoleEntry.FindAllString(line, -1) {
			match := macConsoleUID.FindStringSubmatch(entry)
			if len(match) != 2 || match[1] != strconv.Itoa(uid) {
				continue
			}
			return !macOnConsole.MatchString(entry) || macScreenLocked.MatchString(entry)
		}
	}
	return true
}

// macNoticeState is the line the notice process reads: whether to show, and
// when the Agent last wrote it. A notice whose Agent has gone stops showing.
func macNoticeState(show bool, now time.Time) string {
	return fmt.Sprintf("%s %d", map[bool]string{true: "show", false: "hide"}[show], now.UnixMilli())
}
