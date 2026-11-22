//go:build linux

package desktop

import (
	"bytes"
	"os"
	"strings"
	"testing"
	"unicode/utf16"

	"github.com/jezek/xgb/xproto"
)

func TestX11RefusesWaylandAndMissingDisplays(t *testing.T) {
	t.Setenv("XDG_SESSION_TYPE", "wayland")
	if err := (&x11Platform{}).Ready(); err == nil || !strings.Contains(err.Error(), "Wayland") {
		t.Fatalf("a Wayland session is refused: %v", err)
	}
	t.Setenv("XDG_SESSION_TYPE", "x11")
	t.Setenv("DISPLAY", "")
	if err := (&x11Platform{}).Ready(); err == nil || !strings.Contains(err.Error(), "DISPLAY") {
		t.Fatalf("no display is refused: %v", err)
	}
	t.Setenv("DISPLAY", ":4242")
	if err := (&x11Platform{}).Ready(); err == nil || !strings.Contains(err.Error(), "could not connect") {
		t.Fatalf("an unreachable display is refused: %v", err)
	}
	if New().Available() && os.Getenv("DISPLAY") == ":4242" {
		t.Fatal("not available without a display")
	}
}

func TestX11KeymapFindsShiftedKeysAndASpareKey(t *testing.T) {
	// Keycodes 8..11: a/A, 1/!, empty, é/É.
	k := keymap{first: 8, perCode: 2, syms: []xproto.Keysym{'a', 'A', '1', '!', 0, 0, 0xe9, 0xc9}}
	for _, c := range []struct {
		sym   xproto.Keysym
		code  xproto.Keycode
		shift bool
	}{{'a', 8, false}, {'A', 8, true}, {'!', 9, true}, {0xe9, 11, false}} {
		code, shift, found := k.find(c.sym)
		if !found || code != c.code || shift != c.shift {
			t.Fatalf("%x: got %d %v %v", c.sym, code, shift, found)
		}
	}
	if _, _, found := k.find(keysymFor('😀')); found {
		t.Fatal("😀 is not on this layout")
	}
	if spare, ok := k.spare(); !ok || spare != 10 {
		t.Fatalf("the empty keycode is borrowed: %d %v", spare, ok)
	}
	if _, ok := (keymap{first: 8, perCode: 1, syms: []xproto.Keysym{'a'}}).spare(); ok {
		t.Fatal("no spare key on a full layout")
	}
	if _, _, found := (keymap{}).find('a'); found {
		t.Fatal("an empty keymap finds nothing")
	}
}

func TestX11KeysymsAndCharacters(t *testing.T) {
	if keysymFor('a') != 'a' || keysymFor('é') != 0xe9 || keysymFor('中') != 0x01004e2d || keysymFor('😀') != 0x0101f600 {
		t.Fatal("keysyms: Latin-1 directly, the rest as 0x01000000 + code point")
	}
	units := utf16.Encode([]rune("a😀b"))
	steps := []Step{{Kind: StepKeyDown, Key: "shift"}}
	for _, u := range units {
		steps = append(steps, Step{Kind: StepChar, Char: u})
	}
	got := charRunes(steps)
	if len(got) != 3 || got[1] != 'a' || got[2] != '😀' || got[4] != 'b' {
		t.Fatalf("a surrogate pair is one character on its first unit: %v", got)
	}
	for name := range keyNames {
		if _, ok := x11Keysyms[name]; !ok {
			t.Fatalf("key %q has no X11 keysym", name)
		}
	}
	if x11Keysyms["f12"] != 0xffc9 || x11Keysyms["enter"] != 0xff0d {
		t.Fatal("function and named keys")
	}
}

func TestX11NoticePixels(t *testing.T) {
	pixels := renderNotice(960, 50)
	if len(pixels) != 960*50*4 {
		t.Fatalf("BGRX bytes: %d", len(pixels))
	}
	at := func(x, y int) []byte { return pixels[(y*960+x)*4 : (y*960+x)*4+3] }
	if !bytes.Equal(at(1, 1), []byte{0x00, 0xc4, 0xff}) || !bytes.Equal(at(10, 10), []byte{0xd9, 0x28, 0x6d}) || !bytes.Equal(at(26, 25), []byte{0x3b, 0x3b, 0xff}) {
		t.Fatalf("frame, bar and dot colours: %v %v %v", at(1, 1), at(10, 10), at(26, 25))
	}
	white := 0
	for i := 0; i < len(pixels); i += 4 {
		if pixels[i] == 0xff && pixels[i+1] == 0xff && pixels[i+2] == 0xff {
			white++
		}
	}
	if white < 1000 {
		t.Fatalf("the notice text is drawn: %d white pixels", white)
	}
	if len(x11NoticeText) > 62 {
		t.Fatal("the X11 notice text fits a 960 px bar at twice the bitmap font's size")
	}
}

func TestLinuxProcessNames(t *testing.T) {
	if linuxProcessName(0) != "unknown" || linuxProcessName(1<<30) != "unknown" {
		t.Fatal("unknown processes")
	}
	if name := linuxProcessName(uint32(os.Getpid())); name == "unknown" || name != strings.ToLower(name) {
		t.Fatalf("own process: %q", name)
	}
}
