package desktop

import (
	"image"
	"time"
)

// Rect is a rectangle in physical pixels of the virtual desktop.
type Rect struct{ X, Y, W, H int }

func (r Rect) contains(x, y int) bool {
	return x >= r.X && y >= r.Y && x < r.X+r.W && y < r.Y+r.H
}

func (r Rect) intersect(o Rect) Rect {
	x1, y1 := max(r.X, o.X), max(r.Y, o.Y)
	x2, y2 := min(r.X+r.W, o.X+o.W), min(r.Y+r.H, o.Y+o.H)
	if x2 <= x1 || y2 <= y1 {
		return Rect{}
	}
	return Rect{x1, y1, x2 - x1, y2 - y1}
}

func (r Rect) empty() bool { return r.W <= 0 || r.H <= 0 }

// Display is one monitor.
type Display struct {
	Bounds  Rect
	Primary bool
}

// Window is a visible top-level window, listed top of the Z order first.
type Window struct {
	Handle     uintptr
	Title      string
	App        string // lower-case executable base name, for example "notepad.exe"
	PID        uint32
	Bounds     Rect
	Minimized  bool
	Foreground bool
}

// Element is one control of the foreground window, from the OS accessibility tree.
type Element struct {
	Role     string
	Name     string
	Value    string
	Enabled  bool
	Focused  bool
	Password bool
	Bounds   Rect
}

// StepKind is one primitive the platform sends as operating-system input.
type StepKind int

const (
	StepMove StepKind = iota
	StepButtonDown
	StepButtonUp
	StepWheel
	StepKeyDown
	StepKeyUp
	StepChar // one UTF-16 code unit typed as text, down and up
	StepPause
)

// Step is one primitive input. X and Y are physical virtual-desktop pixels
// for StepMove; Button is left, right or middle; Key is a name from keyNames.
type Step struct {
	Kind   StepKind
	X, Y   int
	Button string
	DX, DY int // wheel notches: positive DY scrolls up, positive DX scrolls right
	Key    string
	Char   uint16
	Pause  time.Duration
}

// platform is the operating-system side. Every method may block briefly and
// must be safe to call from any goroutine.
type platform interface {
	// Ready explains why desktop control cannot run here, or returns nil.
	Ready() error
	// Start begins watching for the person's input. It runs on the first
	// call, so a computer that never uses desktop control installs no hooks.
	Start() error
	Displays() ([]Display, error)
	Capture(r Rect) (*image.RGBA, error)
	Windows() ([]Window, error)
	// Elements lists controls of w, at most limit; truncated reports more existed.
	Elements(w Window, limit int) (elements []Element, truncated bool, err error)
	// WindowAt is the top-level window under a physical point.
	WindowAt(x, y int) (Window, error)
	Cursor() (x, y int, err error)
	// Locked is true on the lock screen, a UAC prompt or any other secure desktop.
	Locked() bool
	// LastUserInput is the time of the last mouse or keyboard input a person
	// made, never input this program injected. Zero when none was seen.
	LastUserInput() time.Time
	// Send sends steps in order and stops before a step when abort is true.
	// It returns how many steps were sent.
	Send(steps []Step, abort func() bool) (int, error)
	Focus(w Window) error
	// Indicate shows or hides the on-screen notice that AI is using the
	// computer. The notice never appears in Capture.
	Indicate(active bool)
}
