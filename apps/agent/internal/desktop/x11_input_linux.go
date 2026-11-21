//go:build linux

package desktop

import (
	"errors"
	"fmt"
	"time"

	"github.com/jezek/xgb/xproto"
	"github.com/jezek/xgb/xtest"
)

// X11 keysyms for the key names desktop_act accepts.
var x11Keysyms = func() map[string]xproto.Keysym {
	keys := map[string]xproto.Keysym{
		"ctrl": 0xffe3, "alt": 0xffe9, "shift": 0xffe1, "win": 0xffeb, "menu": 0xff67,
		"enter": 0xff0d, "tab": 0xff09, "escape": 0xff1b, "backspace": 0xff08, "space": 0x20,
		"pageup": 0xff55, "pagedown": 0xff56, "end": 0xff57, "home": 0xff50,
		"left": 0xff51, "up": 0xff52, "right": 0xff53, "down": 0xff54, "insert": 0xff63, "delete": 0xffff,
	}
	for c := 'a'; c <= 'z'; c++ {
		keys[string(c)] = xproto.Keysym(c)
	}
	for c := '0'; c <= '9'; c++ {
		keys[string(c)] = xproto.Keysym(c)
	}
	for i := 1; i <= 12; i++ {
		keys[fmt.Sprintf("f%d", i)] = xproto.Keysym(0xffbd + i)
	}
	return keys
}()

// keymap is the server's keycode to keysym table, read once per action.
type keymap struct {
	first   xproto.Keycode
	perCode int
	syms    []xproto.Keysym
}

func (p *x11Platform) loadKeymap() error {
	setup := xproto.Setup(p.conn)
	count := byte(int(setup.MaxKeycode) - int(setup.MinKeycode) + 1)
	reply, err := xproto.GetKeyboardMapping(p.conn, setup.MinKeycode, count).Reply()
	if err != nil {
		return err
	}
	p.keymap = keymap{first: setup.MinKeycode, perCode: int(reply.KeysymsPerKeycode), syms: reply.Keysyms}
	return nil
}

// find returns the keycode for a keysym and whether Shift selects it.
func (k keymap) find(sym xproto.Keysym) (xproto.Keycode, bool, bool) {
	if k.perCode == 0 {
		return 0, false, false
	}
	for i := 0; i+k.perCode <= len(k.syms); i += k.perCode {
		code := xproto.Keycode(int(k.first) + i/k.perCode)
		if k.syms[i] == sym {
			return code, false, true
		}
		if k.perCode > 1 && k.syms[i+1] == sym {
			return code, true, true
		}
	}
	return 0, false, false
}

// spare is a keycode with no keysyms, which typing borrows for characters
// the keyboard layout does not have.
func (k keymap) spare() (xproto.Keycode, bool) {
	for i := len(k.syms) - k.perCode; i >= 0; i -= k.perCode {
		empty := true
		for _, s := range k.syms[i : i+k.perCode] {
			empty = empty && s == 0
		}
		if empty {
			return xproto.Keycode(int(k.first) + i/k.perCode), true
		}
	}
	return 0, false
}

// keysymFor is the X11 keysym of a character: Latin-1 maps directly, the
// rest of Unicode is 0x01000000 + code point.
func keysymFor(r rune) xproto.Keysym {
	if r >= 0x20 && r <= 0xff {
		return xproto.Keysym(r)
	}
	return xproto.Keysym(0x01000000 + uint32(r))
}

func (p *x11Platform) Send(steps []Step, abort func() bool) (int, error) {
	if err := p.loadKeymap(); err != nil {
		return 0, err
	}
	borrowed := xproto.Keycode(0)
	defer func() {
		if borrowed != 0 {
			p.remap(borrowed, 0)
		}
	}()
	runes := charRunes(steps)
	// The pointer stays where this action put it, unless the person moves it.
	placed, atX, atY := false, 0, 0
	moved := func() bool {
		if !placed {
			return false
		}
		x, y, err := p.Cursor()
		return err == nil && (x != atX || y != atY)
	}
	sent := 0
	for i := 0; i < len(steps); i++ {
		step := steps[i]
		if abort() || moved() {
			return sent, nil
		}
		// While a step is on its way to the server, the idle timer may count it
		// before lastInjected does: sampleUserInput ignores what it reads then.
		if step.Kind != StepPause {
			p.injecting.Add(1)
		}
		err := func() (err error) {
			switch step.Kind {
			case StepPause:
				time.Sleep(step.Pause)
			case StepMove:
				err = p.fake(xproto.MotionNotify, 0, int16(step.X), int16(step.Y))
				p.conn.Sync()
				placed, atX, atY = true, step.X, step.Y
			case StepButtonDown, StepButtonUp:
				button := map[string]byte{"left": 1, "middle": 2, "right": 3}[step.Button]
				if button == 0 {
					return fmt.Errorf("unknown mouse button %q", step.Button)
				}
				err = p.fake(map[bool]byte{true: xproto.ButtonPress, false: xproto.ButtonRelease}[step.Kind == StepButtonDown], button, 0, 0)
			case StepWheel:
				button, notches := byte(4), step.DY // up
				switch {
				case step.DY < 0:
					button, notches = 5, -step.DY
				case step.DX > 0:
					button, notches = 7, step.DX
				case step.DX < 0:
					button, notches = 6, -step.DX
				}
				for n := 0; n < notches && err == nil; n++ {
					if err = p.fake(xproto.ButtonPress, button, 0, 0); err == nil {
						err = p.fake(xproto.ButtonRelease, button, 0, 0)
					}
				}
			case StepKeyDown, StepKeyUp:
				sym, ok := x11Keysyms[step.Key]
				code, _, found := p.keymap.find(sym)
				if !ok || !found {
					return fmt.Errorf("this keyboard layout has no key for %q", step.Key)
				}
				err = p.fake(map[bool]byte{true: xproto.KeyPress, false: xproto.KeyRelease}[step.Kind == StepKeyDown], byte(code), 0, 0)
			case StepChar:
				// A UTF-16 surrogate pair is one character: type it on its first unit.
				r, ok := runes[i]
				if !ok {
					break
				}
				borrowed, err = p.typeRune(r, borrowed)
			default:
				err = fmt.Errorf("unknown input step %d", step.Kind)
			}
			return err
		}()
		if step.Kind != StepPause {
			p.conn.Sync()
			p.lastInjected.Store(time.Now().UnixNano())
			p.injecting.Add(-1)
		}
		if err != nil {
			return sent, err
		}
		sent++
	}
	p.conn.Sync()
	p.lastInjected.Store(time.Now().UnixNano())
	return sent, nil
}

// charRunes maps each StepChar index that starts a character to its rune.
func charRunes(steps []Step) map[int]rune {
	out := map[int]rune{}
	for i := 0; i < len(steps); i++ {
		if steps[i].Kind != StepChar {
			continue
		}
		unit := rune(steps[i].Char)
		if unit >= 0xd800 && unit < 0xdc00 && i+1 < len(steps) && steps[i+1].Kind == StepChar {
			out[i] = (unit-0xd800)<<10 + (rune(steps[i+1].Char) - 0xdc00) + 0x10000
			i++
			continue
		}
		out[i] = unit
	}
	return out
}

func (p *x11Platform) typeRune(r rune, borrowed xproto.Keycode) (xproto.Keycode, error) {
	sym := keysymFor(r)
	code, shift, found := p.keymap.find(sym)
	if !found {
		if borrowed == 0 {
			spare, ok := p.keymap.spare()
			if !ok {
				return 0, errors.New("the keyboard layout has no free key to type this character")
			}
			borrowed = spare
		}
		if err := p.remap(borrowed, sym); err != nil {
			return borrowed, err
		}
		code, shift = borrowed, false
	}
	shiftCode, _, _ := p.keymap.find(x11Keysyms["shift"])
	if shift && shiftCode != 0 {
		p.fake(xproto.KeyPress, byte(shiftCode), 0, 0)
	}
	err := p.fake(xproto.KeyPress, byte(code), 0, 0)
	if err == nil {
		err = p.fake(xproto.KeyRelease, byte(code), 0, 0)
	}
	if shift && shiftCode != 0 {
		p.fake(xproto.KeyRelease, byte(shiftCode), 0, 0)
	}
	return borrowed, err
}

// remap points a borrowed keycode at sym (0 restores it to no keysym) and
// waits for clients to see the new mapping.
func (p *x11Platform) remap(code xproto.Keycode, sym xproto.Keysym) error {
	p.conn.Sync()
	syms := make([]xproto.Keysym, p.keymap.perCode)
	for i := range syms {
		syms[i] = sym
	}
	if err := xproto.ChangeKeyboardMappingChecked(p.conn, 1, code, byte(p.keymap.perCode), syms).Check(); err != nil {
		return err
	}
	time.Sleep(15 * time.Millisecond)
	return nil
}

func (p *x11Platform) fake(kind, detail byte, x, y int16) error {
	return xtest.FakeInputChecked(p.conn, kind, detail, 0, p.root, x, y, 0).Check()
}
