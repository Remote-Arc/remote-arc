// Package desktop lets an authorized AI see and operate the signed-in user's
// desktop: a screenshot with the foreground window's accessibility tree
// (desktop_snapshot) and mouse and keyboard input (desktop_act).
//
// The person at the computer always wins. Any physical mouse or keyboard
// input stops the current action and blocks the next one until the computer
// has been quiet for a moment and the AI has looked again. A notice on screen
// says when AI is viewing or using the computer. Windows of password managers
// and system security prompts are masked in screenshots and never receive
// input. Nothing here is stored: snapshots live in memory for two minutes.
package desktop

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
	"golang.org/x/image/draw"
)

// Tools are the device tool names. The Relay requires the owner to enable
// both for the computer; the Agent also checks the policy on every call.
var Tools = []string{"desktop_snapshot", "desktop_act"}

const (
	snapshotTTL       = 2 * time.Minute
	keptSnapshots     = 4
	defaultMaxWidth   = 1366
	defaultElements   = 150
	maxElements       = 300
	maxWindows        = 30
	maxTextRunes      = 2000
	maxValueRunes     = 200
	indicatorLinger   = 20 * time.Second
	jpegQuality       = 75
	maxScreenshotSize = 1_500_000
)

// noticeText is shown on the computer's screen while AI views or uses it.
const noticeText = "Remote Arc · AI is using this computer — move the mouse or press any key to take over"

// userQuiet is how long the person must leave mouse and keyboard alone
// before AI input starts again.
var userQuiet = 5 * time.Second

// blockedApps never receive input, and their windows are masked in
// screenshots: password managers and the system's own credential and
// security prompts.
var blockedApps = map[string]bool{
	"1password.exe":          true,
	"bitwarden.exe":          true,
	"keepass.exe":            true,
	"keepassxc.exe":          true,
	"dashlane.exe":           true,
	"enpass.exe":             true,
	"roboform.exe":           true,
	"nordpass.exe":           true,
	"lastpass.exe":           true,
	"proton pass.exe":        true,
	"credentialuibroker.exe": true,
	"consent.exe":            true,
	"lockapp.exe":            true,
	"logonui.exe":            true,
	"sechealthui.exe":        true,
	// Linux: password managers, keyring and polkit prompts, screen lockers.
	"keepassxc":                           true,
	"1password":                           true,
	"bitwarden":                           true,
	"enpass":                              true,
	"gcr-prompter":                        true,
	"seahorse":                            true,
	"pinentry":                            true,
	"pinentry-gnome3":                     true,
	"pinentry-gtk-2":                      true,
	"pinentry-qt":                         true,
	"polkit-gnome-authentication-agent-1": true,
	"polkit-kde-authentication-agent-1":   true,
	"polkit-mate-authentication-agent-1":  true,
	"lxqt-policykit-agent":                true,
	"xfce-polkit":                         true,
	"i3lock":                              true,
	"xsecurelock":                         true,
	"xscreensaver":                        true,
	"light-locker":                        true,
}

// Error codes start the error message so the Relay and the AI can branch on them.
const (
	ErrDisabled       = "DESKTOP_CONTROL_DISABLED"
	ErrUnsupported    = "DESKTOP_UNSUPPORTED"
	ErrLocked         = "DESKTOP_LOCKED"
	ErrUserActive     = "DESKTOP_USER_ACTIVE"
	ErrStaleSnapshot  = "DESKTOP_STALE_SNAPSHOT"
	ErrAppBlocked     = "DESKTOP_APP_BLOCKED"
	ErrFocusChanged   = "DESKTOP_FOCUS_CHANGED"
	ErrUserTookOver   = "DESKTOP_USER_TOOK_OVER"
	ErrInvalidRequest = "DESKTOP_INVALID_REQUEST"
)

func fail(code, message string) error { return errors.New(code + ": " + message) }

type snapshot struct {
	id         string
	taken      time.Time
	display    Rect
	scale      float64 // image pixels per physical pixel
	imageW     int
	imageH     int
	foreground Window
	elements   []Element
	windows    []Window
}

// Manager serves the desktop tools. The zero value is not usable; use New.
type Manager struct {
	mu        sync.Mutex
	p         platform
	now       func() time.Time
	seq       int
	snapshots []*snapshot
	indicator *time.Timer
}

// New returns a Manager for this operating system.
func New() *Manager { return newManager(newPlatform(), time.Now) }

func newManager(p platform, now func() time.Time) *Manager {
	return &Manager{p: p, now: now}
}

// Available reports whether this computer can serve desktop control at all.
func (m *Manager) Available() bool { return m != nil && m.p.Ready() == nil }

// Call runs one desktop tool. policy is the owner's per-computer setting,
// sent by the Relay with every call.
func (m *Manager) Call(ctx context.Context, tool string, args map[string]any, policy protocol.Policy) (any, error) {
	if !policy.DesktopControlEnabled {
		return nil, fail(ErrDisabled, "desktop control is turned off for this computer. The owner can turn it on in the Remote Arc Dashboard.")
	}
	if err := m.p.Ready(); err != nil {
		return nil, fail(ErrUnsupported, err.Error())
	}
	if err := m.p.Start(); err != nil {
		return nil, fail(ErrUnsupported, err.Error())
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.p.Locked() {
		return nil, fail(ErrLocked, "the computer is locked or showing a secure system prompt. Ask the user to unlock it.")
	}
	switch tool {
	case "desktop_snapshot":
		m.indicateLocked()
		return m.snapshotLocked(args)
	case "desktop_act":
		m.indicateLocked()
		return m.actLocked(ctx, args)
	}
	return nil, fail(ErrInvalidRequest, "unknown desktop tool "+tool)
}

// indicateLocked shows the on-screen notice and hides it once AI has been
// idle for a while.
func (m *Manager) indicateLocked() {
	m.p.Indicate(true)
	if m.indicator != nil {
		m.indicator.Stop()
	}
	m.indicator = time.AfterFunc(indicatorLinger, func() { m.p.Indicate(false) })
}

func (m *Manager) snapshotLocked(args map[string]any) (any, error) {
	maxWidth, err := protocol.Integer(args, "max_width", defaultMaxWidth, 640, 1920)
	if err != nil {
		return nil, fail(ErrInvalidRequest, err.Error())
	}
	limit, err := protocol.Integer(args, "max_elements", defaultElements, 0, maxElements)
	if err != nil {
		return nil, fail(ErrInvalidRequest, err.Error())
	}
	includeImage := true
	if value, ok := args["include_image"].(bool); ok {
		includeImage = value
	}
	displays, err := m.p.Displays()
	if err != nil || len(displays) == 0 {
		return nil, fmt.Errorf("could not list displays: %v", err)
	}
	windows, err := m.p.Windows()
	if err != nil {
		return nil, fmt.Errorf("could not list windows: %v", err)
	}
	foreground := Window{}
	for _, w := range windows {
		if w.Foreground {
			foreground = w
			break
		}
	}
	index, err := chooseDisplay(args, displays, foreground)
	if err != nil {
		return nil, err
	}
	display := displays[index].Bounds
	scale := 1.0
	if display.W > maxWidth {
		scale = float64(maxWidth) / float64(display.W)
	}
	snap := &snapshot{
		taken:      m.now(),
		display:    display,
		scale:      scale,
		imageW:     max(1, int(float64(display.W)*scale+0.5)),
		imageH:     max(1, int(float64(display.H)*scale+0.5)),
		foreground: foreground,
	}
	result := map[string]any{}
	if includeImage {
		pixels, err := m.p.Capture(display)
		if err != nil {
			return nil, fmt.Errorf("could not capture the screen: %v", err)
		}
		masked := maskBlocked(pixels, display, windows)
		data, err := encodeJPEG(pixels, snap.imageW, snap.imageH)
		if err != nil {
			return nil, err
		}
		result["screenshot"] = map[string]any{"mimeType": "image/jpeg", "data": data}
		if masked > 0 {
			result["masked_windows"] = masked
		}
	}
	if foreground.Handle != 0 && !blockedApps[foreground.App] && limit > 0 {
		elements, truncated, err := m.p.Elements(foreground, limit)
		if err != nil {
			result["elements_error"] = err.Error()
		}
		snap.elements = visibleElements(elements, display)
		if truncated {
			result["elements_truncated"] = true
		}
	}
	m.seq++
	snap.id = "d" + strconv.Itoa(m.seq)
	listed := []map[string]any{}
	for _, w := range windows {
		if len(snap.windows) == maxWindows {
			break
		}
		snap.windows = append(snap.windows, w)
		entry := map[string]any{"ref": "w" + strconv.Itoa(len(snap.windows)), "app": w.App}
		if blockedApps[w.App] {
			entry["hidden"] = true
		} else {
			entry["title"] = clip(w.Title, 120)
		}
		if w.Minimized {
			entry["minimized"] = true
		} else if r := snap.toImage(w.Bounds); !r.empty() {
			entry["rect"] = rectJSON(r)
		} else {
			entry["on_other_display"] = true
		}
		if w.Foreground {
			entry["foreground"] = true
		}
		listed = append(listed, entry)
	}
	elements := []map[string]any{}
	for i, e := range snap.elements {
		entry := map[string]any{"ref": "e" + strconv.Itoa(i+1), "role": e.Role, "rect": rectJSON(snap.toImage(e.Bounds))}
		if e.Name != "" {
			entry["name"] = clip(e.Name, 120)
		}
		if e.Password {
			entry["password"] = true
		} else if e.Value != "" {
			entry["value"] = clip(e.Value, maxValueRunes)
		}
		if !e.Enabled {
			entry["disabled"] = true
		}
		if e.Focused {
			entry["focused"] = true
		}
		elements = append(elements, entry)
	}
	m.keepLocked(snap)
	result["snapshot_id"] = snap.id
	result["image"] = map[string]any{"width": snap.imageW, "height": snap.imageH}
	result["display"] = map[string]any{"index": index, "count": len(displays), "width": display.W, "height": display.H}
	if x, y, err := m.p.Cursor(); err == nil {
		if p := snap.pointToImage(x, y); p != nil {
			result["cursor"] = p
		}
	}
	if foreground.Handle != 0 {
		fg := map[string]any{"app": foreground.App}
		if !blockedApps[foreground.App] {
			fg["title"] = clip(foreground.Title, 120)
		} else {
			fg["blocked"] = true
		}
		result["foreground"] = fg
	}
	result["windows"] = listed
	result["elements"] = elements
	result["next_action"] = "Coordinates are pixels of this screenshot. Act with desktop_act using this snapshot_id: prefer ref=e# for a control, or x and y for anything else. Take a new snapshot after the screen changes."
	return result, nil
}

func chooseDisplay(args map[string]any, displays []Display, foreground Window) (int, error) {
	if _, ok := args["display"]; ok {
		index, err := protocol.Integer(args, "display", 0, 0, len(displays)-1)
		if err != nil {
			return 0, fail(ErrInvalidRequest, err.Error())
		}
		return index, nil
	}
	if foreground.Handle != 0 && !foreground.Minimized {
		cx, cy := foreground.Bounds.X+foreground.Bounds.W/2, foreground.Bounds.Y+foreground.Bounds.H/2
		for i, d := range displays {
			if d.Bounds.contains(cx, cy) {
				return i, nil
			}
		}
	}
	for i, d := range displays {
		if d.Primary {
			return i, nil
		}
	}
	return 0, nil
}

func (m *Manager) keepLocked(snap *snapshot) {
	m.snapshots = append(m.snapshots, snap)
	if len(m.snapshots) > keptSnapshots {
		m.snapshots = m.snapshots[len(m.snapshots)-keptSnapshots:]
	}
}

func (m *Manager) findLocked(id string) (*snapshot, error) {
	for _, snap := range m.snapshots {
		if snap.id == id {
			if m.now().Sub(snap.taken) > snapshotTTL {
				return nil, fail(ErrStaleSnapshot, "snapshot "+id+" is older than two minutes. Take a new desktop_snapshot.")
			}
			return snap, nil
		}
	}
	return nil, fail(ErrStaleSnapshot, "snapshot "+id+" is not available. Take a new desktop_snapshot.")
}

// toImage maps a physical rectangle to screenshot pixels, clipped to the display.
func (s *snapshot) toImage(r Rect) Rect {
	r = r.intersect(s.display)
	if r.empty() {
		return Rect{}
	}
	x := int(float64(r.X-s.display.X) * s.scale)
	y := int(float64(r.Y-s.display.Y) * s.scale)
	return Rect{x, y, max(1, int(float64(r.W)*s.scale)), max(1, int(float64(r.H)*s.scale))}
}

func (s *snapshot) pointToImage(x, y int) map[string]any {
	if !s.display.contains(x, y) {
		return nil
	}
	return map[string]any{"x": int(float64(x-s.display.X) * s.scale), "y": int(float64(y-s.display.Y) * s.scale)}
}

// toPhysical maps a screenshot point to a physical point on the display.
func (s *snapshot) toPhysical(x, y int) (int, int, error) {
	if x < 0 || y < 0 || x >= s.imageW || y >= s.imageH {
		return 0, 0, fail(ErrInvalidRequest, fmt.Sprintf("point %d,%d is outside the %dx%d screenshot", x, y, s.imageW, s.imageH))
	}
	px := s.display.X + int((float64(x)+0.5)/s.scale)
	py := s.display.Y + int((float64(y)+0.5)/s.scale)
	return min(px, s.display.X+s.display.W-1), min(py, s.display.Y+s.display.H-1), nil
}

func visibleElements(elements []Element, display Rect) []Element {
	out := []Element{}
	for _, e := range elements {
		if !e.Bounds.intersect(display).empty() {
			out = append(out, e)
		}
	}
	return out
}

// maskBlocked paints over every visible window of a blocked app and returns
// how many it masked.
func maskBlocked(img *image.RGBA, display Rect, windows []Window) int {
	masked := 0
	fill := image.NewUniform(color.RGBA{40, 40, 46, 255})
	for _, w := range windows {
		if !blockedApps[w.App] || w.Minimized {
			continue
		}
		r := w.Bounds.intersect(display)
		if r.empty() {
			continue
		}
		area := image.Rect(r.X-display.X, r.Y-display.Y, r.X-display.X+r.W, r.Y-display.Y+r.H)
		draw.Draw(img, area.Add(img.Bounds().Min), fill, image.Point{}, draw.Src)
		masked++
	}
	return masked
}

func encodeJPEG(img *image.RGBA, width, height int) (string, error) {
	var out image.Image = img
	if img.Bounds().Dx() != width || img.Bounds().Dy() != height {
		scaled := image.NewRGBA(image.Rect(0, 0, width, height))
		draw.BiLinear.Scale(scaled, scaled.Bounds(), img, img.Bounds(), draw.Src, nil)
		out = scaled
	}
	for quality := jpegQuality; ; quality -= 15 {
		var buf bytes.Buffer
		if err := jpeg.Encode(&buf, out, &jpeg.Options{Quality: quality}); err != nil {
			return "", err
		}
		if buf.Len() <= maxScreenshotSize || quality <= 30 {
			return base64.StdEncoding.EncodeToString(buf.Bytes()), nil
		}
	}
}

func rectJSON(r Rect) []int { return []int{r.X, r.Y, r.W, r.H} }

func clip(s string, n int) string {
	s = strings.TrimSpace(s)
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "…"
}
