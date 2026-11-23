package desktop

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

var pointerActions = map[string]bool{"click": true, "double_click": true, "right_click": true, "move": true, "drag": true, "scroll": true}

// keyNames are the keys desktop_act accepts. Text goes through action=type.
var keyNames = func() map[string]bool {
	names := map[string]bool{}
	for _, k := range strings.Fields("ctrl alt shift win enter tab escape backspace delete insert home end pageup pagedown up down left right space menu f1 f2 f3 f4 f5 f6 f7 f8 f9 f10 f11 f12") {
		names[k] = true
	}
	for c := 'a'; c <= 'z'; c++ {
		names[string(c)] = true
	}
	for c := '0'; c <= '9'; c++ {
		names[string(c)] = true
	}
	return names
}()

var keyAliases = map[string]string{"control": "ctrl", "cmd": "win", "meta": "win", "super": "win", "windows": "win", "return": "enter", "esc": "escape", "del": "delete", "pgup": "pageup", "pgdn": "pagedown", "arrowup": "up", "arrowdown": "down", "arrowleft": "left", "arrowright": "right", "option": "alt"}

var modifiers = map[string]bool{"ctrl": true, "alt": true, "shift": true, "win": true}

// parseKeys turns "ctrl+shift+s" into its keys, modifiers first as written.
func parseKeys(value string) ([]string, error) {
	parts := strings.Split(strings.ToLower(strings.ReplaceAll(value, " ", "")), "+")
	if value == "" || len(parts) > 5 {
		return nil, fail(ErrInvalidRequest, "keys must be one key or a combination such as ctrl+s, with at most 5 keys")
	}
	keys := []string{}
	for i, part := range parts {
		if alias, ok := keyAliases[part]; ok {
			part = alias
		}
		if !keyNames[part] {
			return nil, fail(ErrInvalidRequest, "unknown key "+strconv.Quote(part)+". Use action=type for text.")
		}
		if i < len(parts)-1 && !modifiers[part] {
			return nil, fail(ErrInvalidRequest, "only ctrl, alt, shift and win can be held in a combination; "+part+" must come last")
		}
		keys = append(keys, part)
	}
	return keys, nil
}

func keySteps(keys []string) []Step {
	steps := []Step{}
	for _, k := range keys {
		steps = append(steps, Step{Kind: StepKeyDown, Key: k})
	}
	for i := len(keys) - 1; i >= 0; i-- {
		steps = append(steps, Step{Kind: StepKeyUp, Key: keys[i]})
	}
	return steps
}

func textSteps(text string) []Step {
	steps := []Step{}
	for _, r := range strings.ReplaceAll(text, "\r\n", "\n") {
		switch r {
		case '\r':
			continue
		case '\n':
			steps = append(steps, typedKey("enter")...)
		case '\t':
			steps = append(steps, typedKey("tab")...)
		default:
			for _, unit := range utf16.Encode([]rune{r}) {
				steps = append(steps, Step{Kind: StepChar, Char: unit})
			}
		}
		// A short pause keeps slow editors and IMEs from dropping characters.
		steps = append(steps, Step{Kind: StepPause, Pause: 4 * time.Millisecond})
	}
	return steps
}

// typedKey is Enter or Tab standing for a line break or tab in typed text.
func typedKey(key string) []Step {
	steps := keySteps([]string{key})
	for i := range steps {
		steps[i].Typed = true
	}
	return steps
}

func clickSteps(x, y int, button string, count int) []Step {
	steps := []Step{{Kind: StepMove, X: x, Y: y}, {Kind: StepPause, Pause: 30 * time.Millisecond}}
	for i := 0; i < count; i++ {
		if i > 0 {
			steps = append(steps, Step{Kind: StepPause, Pause: 60 * time.Millisecond})
		}
		steps = append(steps, Step{Kind: StepButtonDown, Button: button}, Step{Kind: StepButtonUp, Button: button})
	}
	return steps
}

func dragSteps(fromX, fromY, toX, toY int) []Step {
	steps := []Step{{Kind: StepMove, X: fromX, Y: fromY}, {Kind: StepPause, Pause: 40 * time.Millisecond}, {Kind: StepButtonDown, Button: "left"}}
	const parts = 12
	for i := 1; i <= parts; i++ {
		steps = append(steps,
			Step{Kind: StepPause, Pause: 15 * time.Millisecond},
			Step{Kind: StepMove, X: fromX + (toX-fromX)*i/parts, Y: fromY + (toY-fromY)*i/parts})
	}
	return append(steps, Step{Kind: StepPause, Pause: 40 * time.Millisecond}, Step{Kind: StepButtonUp, Button: "left"})
}

// target resolves ref=e# or x,y from a snapshot to a physical point.
func (s *snapshot) target(args map[string]any, xKey, yKey string) (int, int, error) {
	if ref := protocol.OptionalString(args, "ref"); ref != "" && xKey == "x" {
		n, err := strconv.Atoi(strings.TrimPrefix(ref, "e"))
		if !strings.HasPrefix(ref, "e") || err != nil || n < 1 || n > len(s.elements) {
			return 0, 0, fail(ErrInvalidRequest, "ref "+strconv.Quote(ref)+" is not an element of snapshot "+s.id)
		}
		b := s.elements[n-1].Bounds.intersect(s.display)
		return b.X + b.W/2, b.Y + b.H/2, nil
	}
	x, xok := args[xKey].(float64)
	y, yok := args[yKey].(float64)
	if !xok || !yok {
		return 0, 0, fail(ErrInvalidRequest, "give ref=e# from the snapshot, or "+xKey+" and "+yKey+" in screenshot pixels")
	}
	return s.toPhysical(int(x), int(y))
}

func (m *Manager) actLocked(ctx context.Context, args map[string]any) (any, error) {
	action := protocol.OptionalString(args, "action")
	id := protocol.OptionalString(args, "snapshot_id")
	if id == "" {
		return nil, fail(ErrInvalidRequest, "snapshot_id is required: take desktop_snapshot first and act on what it shows")
	}
	snap, err := m.findLocked(id)
	if err != nil {
		return nil, err
	}
	if err := m.userQuietLocked(snap.taken); err != nil {
		return nil, err
	}
	var steps []Step
	var pointX, pointY int
	pointer := pointerActions[action]
	if pointer {
		if pointX, pointY, err = snap.target(args, "x", "y"); err != nil {
			return nil, err
		}
	}
	switch action {
	case "click":
		button := protocol.OptionalString(args, "button")
		if button == "" {
			button = "left"
		}
		if button != "left" && button != "right" && button != "middle" {
			return nil, fail(ErrInvalidRequest, "button must be left, right or middle")
		}
		steps = clickSteps(pointX, pointY, button, 1)
	case "double_click":
		steps = clickSteps(pointX, pointY, "left", 2)
	case "right_click":
		steps = clickSteps(pointX, pointY, "right", 1)
	case "move":
		steps = []Step{{Kind: StepMove, X: pointX, Y: pointY}}
	case "drag":
		toX, toY, err := snap.target(args, "to_x", "to_y")
		if err != nil {
			return nil, err
		}
		if err := m.allowedAt(toX, toY); err != nil {
			return nil, err
		}
		steps = dragSteps(pointX, pointY, toX, toY)
	case "scroll":
		amount, err := protocol.Integer(args, "amount", 3, 1, 20)
		if err != nil {
			return nil, fail(ErrInvalidRequest, err.Error())
		}
		wheel := map[string]Step{
			"up":    {Kind: StepWheel, DY: amount},
			"down":  {Kind: StepWheel, DY: -amount},
			"left":  {Kind: StepWheel, DX: -amount},
			"right": {Kind: StepWheel, DX: amount},
		}
		step, ok := wheel[protocol.OptionalString(args, "direction")]
		if !ok {
			return nil, fail(ErrInvalidRequest, "direction must be up, down, left or right")
		}
		steps = []Step{{Kind: StepMove, X: pointX, Y: pointY}, {Kind: StepPause, Pause: 30 * time.Millisecond}, step}
	case "type":
		text := protocol.OptionalString(args, "text")
		if text == "" || len([]rune(text)) > maxTextRunes {
			return nil, fail(ErrInvalidRequest, fmt.Sprintf("text must be 1 to %d characters", maxTextRunes))
		}
		steps = textSteps(text)
	case "key":
		keys, err := parseKeys(protocol.OptionalString(args, "keys"))
		if err != nil {
			return nil, err
		}
		steps = keySteps(keys)
	case "focus_window":
		return m.focusLocked(snap, args)
	case "wait":
		ms, err := protocol.Integer(args, "ms", 1000, 100, 10000)
		if err != nil {
			return nil, fail(ErrInvalidRequest, err.Error())
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(time.Duration(ms) * time.Millisecond):
		}
		return m.afterLocked(action, 0, 0, args)
	default:
		return nil, fail(ErrInvalidRequest, "action must be click, double_click, right_click, move, drag, scroll, type, key, focus_window or wait")
	}
	if pointer {
		if err := m.allowedAt(pointX, pointY); err != nil {
			return nil, err
		}
	} else if err := m.keyboardTargetLocked(snap); err != nil {
		return nil, err
	}
	started := m.now()
	sent, err := m.p.Send(steps, func() bool {
		return ctx.Err() != nil || m.p.LastUserInput().After(started)
	})
	if err != nil {
		return nil, fmt.Errorf("could not send input after %d of %d steps: %v", sent, len(steps), err)
	}
	if sent < len(steps) {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fail(ErrUserTookOver, fmt.Sprintf("the user used the mouse or keyboard, so the action stopped after %d of %d steps. Wait for the user, then take a new desktop_snapshot before continuing.", sent, len(steps)))
	}
	return m.afterLocked(action, sent, len(steps), args)
}

// userQuietLocked refuses input while, or since, the person used the computer.
func (m *Manager) userQuietLocked(since time.Time) error {
	last := m.p.LastUserInput()
	if last.IsZero() {
		return nil
	}
	if wait := userQuiet - m.now().Sub(last); wait > 0 {
		return fail(ErrUserActive, fmt.Sprintf("the user is using the mouse or keyboard. Wait at least %d seconds, take a new desktop_snapshot, and do not take over from them.", int(wait.Seconds())+1))
	}
	if last.After(since) {
		return fail(ErrUserTookOver, "the user used the computer after this snapshot. Take a new desktop_snapshot before acting.")
	}
	return nil
}

// allowedAt refuses pointer input to a blocked app's window.
func (m *Manager) allowedAt(x, y int) error {
	w, err := m.p.WindowAt(x, y)
	if err != nil {
		return fmt.Errorf("could not identify the window at that point: %v", err)
	}
	if blockedApps[w.App] {
		return fail(ErrAppBlocked, w.App+" is protected: Remote Arc never sends input to password managers or system security prompts. Ask the user to do this step.")
	}
	return nil
}

// keyboardTargetLocked refuses typing when focus moved since the snapshot or
// is on a blocked app, so keys never land somewhere the AI has not seen.
func (m *Manager) keyboardTargetLocked(snap *snapshot) error {
	windows, err := m.p.Windows()
	if err != nil {
		return fmt.Errorf("could not identify the foreground window: %v", err)
	}
	for _, w := range windows {
		if !w.Foreground {
			continue
		}
		if blockedApps[w.App] {
			return fail(ErrAppBlocked, w.App+" is protected: Remote Arc never types into password managers or system security prompts. Ask the user to do this step.")
		}
		if w.Handle != snap.foreground.Handle {
			return fail(ErrFocusChanged, "a different window is in front than in snapshot "+snap.id+". Take a new desktop_snapshot, then focus the intended window.")
		}
		return nil
	}
	return fail(ErrFocusChanged, "no window has keyboard focus. Click the intended window first.")
}

func (m *Manager) focusLocked(snap *snapshot, args map[string]any) (any, error) {
	ref := protocol.OptionalString(args, "ref")
	n, err := strconv.Atoi(strings.TrimPrefix(ref, "w"))
	if !strings.HasPrefix(ref, "w") || err != nil || n < 1 || n > len(snap.windows) {
		return nil, fail(ErrInvalidRequest, "focus_window needs ref=w# from the windows of snapshot "+snap.id)
	}
	w := snap.windows[n-1]
	if blockedApps[w.App] {
		return nil, fail(ErrAppBlocked, w.App+" is protected. Ask the user to do this step.")
	}
	if err := m.p.Focus(w); err != nil {
		return nil, fmt.Errorf("could not bring the window to the front: %v", err)
	}
	return m.afterLocked("focus_window", 0, 0, args)
}

func (m *Manager) afterLocked(action string, sent, total int, args map[string]any) (any, error) {
	result := map[string]any{"action": action, "done": true}
	if total > 0 {
		result["steps"] = sent
	}
	if protocol.Bool(args, "snapshot") {
		// Give the application a moment to draw the result of the input.
		time.Sleep(350 * time.Millisecond)
		snap, err := m.snapshotLocked(map[string]any{})
		if err != nil {
			result["snapshot_error"] = err.Error() + " Call desktop_snapshot."
		} else {
			result["snapshot"] = snap
		}
	} else {
		result["next_action"] = "Take desktop_snapshot to see the result before the next step."
	}
	return result, nil
}
