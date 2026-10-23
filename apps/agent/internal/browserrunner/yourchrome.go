package browserrunner

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Your Chrome: a task can run in the browser the user already uses, with the
// sites they are signed into, instead of a separate Runner window. Chrome 144
// and later let the user open their running browser to local automation once,
// with "Allow remote debugging for this browser instance" on
// chrome://inspect/#remote-debugging. Chrome then asks the user to Allow every
// new connection and shows that it is being controlled while one is open.
//
// So the Agent keeps a single connection for every task and gives each task
// its own tab over it. Chrome does not serve its /json endpoints in this mode;
// everything goes over the one browser connection, with each tab as a
// flattened session. The Runner never closes the user's browser, and closes
// only tabs it opened. When no task has used the connection for a while it
// disconnects, so Chrome's banner goes away.

const (
	browserRunner     = "runner"
	browserYourChrome = "your_chrome"
	// yourChromeProfile marks tasks in the user's Chrome. It names no Runner
	// profile directory, so it is never listed as one or removed.
	yourChromeProfile = "your-chrome"
)

var (
	// allowWait is how long a connection waits for the user to answer
	// Chrome's Allow prompt. A start returns earlier (yourChromeCallWait) so
	// the call does not time out; the next call picks up the same request.
	allowWait          = 3 * time.Minute
	yourChromeCallWait = 25 * time.Second
	// yourChromeLinger keeps the connection after the last task left it, so
	// a follow-up task in the same conversation does not ask again.
	yourChromeLinger = 5 * time.Minute
	// enableWait is how long a start waits for Chrome to open its endpoint
	// after Remote Arc opened the switch page (or started Chrome).
	enableWait = 15 * time.Second
)

const inspectURL = "chrome://inspect/#remote-debugging"

var (
	errYourChromeOff     = errors.New(`YOUR_CHROME_NOT_ENABLED: the user's Chrome is not open to Remote Arc yet. Remote Arc opened ` + inspectURL + ` in Chrome on this computer. Ask the user to tick "Allow remote debugging for this browser instance" there (once; Chrome 144 or later), then call browser_runner_start again. Without it, use browser=runner: a separate Runner window that keeps its own sign-ins.`)
	errYourChromeWaiting = errors.New("YOUR_CHROME_WAITING: Chrome on this computer is asking the user to allow Remote Arc to connect. Ask the user to click Allow in Chrome, then call browser_runner_start again with the same task_id. The request stays open for 3 minutes; after that Chrome asks again.")
)

type yourRoute struct {
	s    *session
	page *yourPage
}

// yourChrome is the Agent's one connection to the user's Chrome.
type yourChrome struct {
	m          *Manager
	mu         sync.Mutex
	conn       *cdpConn
	dialing    chan struct{}
	dialErr    error
	dialCancel context.CancelFunc
	stopped    bool
	opening    int                  // keeps the idle timer from closing a tab being attached
	routes     map[string]yourRoute // CDP session id (a task's tab or one of its frames) -> task
	pages      map[*yourPage]bool
	idle       *time.Timer
	inspected  time.Time
	dials      int // connections opened, for tests
}

func (m *Manager) yourChrome() *yourChrome {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.your == nil {
		m.your = &yourChrome{m: m, routes: map[string]yourRoute{}, pages: map[*yourPage]bool{}}
	}
	return m.your
}

// yourChromeDirs are the user data directories Chrome-family browsers keep
// their DevToolsActivePort in while remote debugging is allowed.
func yourChromeDirs() []string {
	if d := strings.TrimSpace(os.Getenv("REMOTEARC_YOUR_CHROME_DIR")); d != "" {
		return []string{d}
	}
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "windows":
		base := os.Getenv("LOCALAPPDATA")
		return []string{
			filepath.Join(base, "Google", "Chrome", "User Data"),
			filepath.Join(base, "Google", "Chrome Beta", "User Data"),
			filepath.Join(base, "Google", "Chrome SxS", "User Data"),
			filepath.Join(base, "Microsoft", "Edge", "User Data"),
		}
	case "darwin":
		base := filepath.Join(home, "Library", "Application Support")
		return []string{
			filepath.Join(base, "Google", "Chrome"),
			filepath.Join(base, "Google", "Chrome Beta"),
			filepath.Join(base, "Google", "Chrome Canary"),
			filepath.Join(base, "Microsoft Edge"),
		}
	default:
		base := filepath.Join(home, ".config")
		return []string{
			filepath.Join(base, "google-chrome"),
			filepath.Join(base, "google-chrome-beta"),
			filepath.Join(base, "chromium"),
			filepath.Join(base, "microsoft-edge"),
		}
	}
}

// findYourChrome returns the browser endpoint of a running Chrome that the
// user opened to local automation.
func findYourChrome() (string, bool) {
	for _, dir := range yourChromeDirs() {
		port, path, e := readActivePort(dir)
		if e != nil || !strings.HasPrefix(path, "/devtools/browser/") {
			continue
		}
		c, e := net.DialTimeout("tcp", "127.0.0.1:"+strconv.Itoa(port), 500*time.Millisecond)
		if e != nil {
			continue // a file left behind by a Chrome that has closed
		}
		c.Close()
		return "ws://127.0.0.1:" + strconv.Itoa(port) + path, true
	}
	return "", false
}

// YourChromeReady reports whether the user's Chrome is open to Remote Arc
// right now, for status.
func YourChromeReady() bool { _, ok := findYourChrome(); return ok }

// openSwitchPage shows the user the one switch Chrome needs. Launching Chrome
// with a URL opens a tab in the running browser, or starts it if it is closed
// (which is all that is needed when the switch is already on).
func (u *yourChrome) openSwitchPage() {
	u.mu.Lock()
	if time.Since(u.inspected) < 2*time.Minute {
		u.mu.Unlock()
		return
	}
	u.inspected = time.Now()
	u.mu.Unlock()
	exe := chromeExecutable()
	if exe == "" {
		return
	}
	cmd := exec.Command(exe, inspectURL)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = nil, nil, nil
	detach(cmd)
	if cmd.Start() == nil {
		go func() { _ = cmd.Wait() }()
	}
}

// chromeExecutable is the user's Google Chrome, which the switch belongs to.
func chromeExecutable() string {
	if p := strings.TrimSpace(os.Getenv("REMOTEARC_YOUR_CHROME_PATH")); p != "" {
		return p
	}
	for _, c := range browserCandidates() {
		if !strings.Contains(strings.ToLower(c), "chrome") || strings.Contains(strings.ToLower(c), "chromium") {
			continue
		}
		if filepath.IsAbs(c) {
			if isExecutable(c) {
				return c
			}
			continue
		}
		if p, e := exec.LookPath(c); e == nil {
			return p
		}
	}
	return ""
}

// connect returns the shared connection, starting one if needed. A new
// connection waits for the user's Allow in Chrome; if that takes longer than
// one call may, the request keeps waiting and errYourChromeWaiting tells the
// caller to come back.
func (u *yourChrome) connect(ctx context.Context) (*cdpConn, error) {
	u.mu.Lock()
	if u.stopped {
		u.mu.Unlock()
		return nil, errBrowserGone
	}
	if u.conn != nil && u.conn.Alive() {
		c := u.conn
		u.mu.Unlock()
		return c, nil
	}
	ch := u.dialing
	u.mu.Unlock()
	if ch == nil {
		url, ok := findYourChrome()
		if !ok {
			u.openSwitchPage()
			deadline := time.Now().Add(enableWait)
			for !ok && time.Now().Before(deadline) {
				select {
				case <-ctx.Done():
					return nil, ctx.Err()
				case <-time.After(300 * time.Millisecond):
				}
				url, ok = findYourChrome()
			}
			if !ok {
				return nil, errYourChromeOff
			}
		}
		u.mu.Lock()
		if u.stopped {
			u.mu.Unlock()
			return nil, errBrowserGone
		}
		if u.dialing == nil && (u.conn == nil || !u.conn.Alive()) {
			u.dialing = make(chan struct{})
			u.dialErr = nil
			u.dials++
			dialCtx, cancel := context.WithTimeout(context.Background(), allowWait)
			u.dialCancel = cancel
			go u.dial(dialCtx, url, u.dialing)
		}
		ch = u.dialing
		u.mu.Unlock()
		if ch == nil { // connected meanwhile
			return u.connect(ctx)
		}
	}
	wait := yourChromeCallWait
	if d, ok := ctx.Deadline(); ok && time.Until(d)-5*time.Second < wait {
		wait = time.Until(d) - 5*time.Second
	}
	select {
	case <-ch:
	case <-time.After(wait):
		return nil, errYourChromeWaiting
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.conn != nil && u.conn.Alive() {
		return u.conn, nil
	}
	err := u.dialErr
	u.dialErr = nil
	if err == nil {
		err = errBrowserGone
	}
	return nil, fmt.Errorf("YOUR_CHROME_DENIED: Chrome did not let Remote Arc connect (%v). The user may have declined, or not answered within 3 minutes. Ask the user to click Allow when Chrome asks, then call browser_runner_start again.", err)
}

func (u *yourChrome) dial(ctx context.Context, url string, done chan struct{}) {
	conn, err := dialCDPWait(ctx, url, u.onEvent, allowWait)
	u.mu.Lock()
	u.dialCancel()
	u.dialCancel = nil
	u.dialing = nil
	if u.stopped {
		if conn != nil {
			conn.Close()
		}
		u.dialErr = errBrowserGone
	} else if err != nil {
		u.dialErr = err
	} else {
		u.conn = conn
		u.lingerLocked()
		go func() {
			<-conn.closed
			u.lost(conn)
		}()
	}
	close(done)
	u.mu.Unlock()
}

// lost drops every task's tab session when the browser connection ends (the
// user closed Chrome, or turned the switch off).
func (u *yourChrome) lost(conn *cdpConn) {
	u.mu.Lock()
	if u.conn == conn {
		u.conn = nil
	}
	pages := []*yourPage{}
	for p := range u.pages {
		if p.base == conn {
			pages = append(pages, p)
		}
	}
	u.mu.Unlock()
	for _, p := range pages {
		p.gone()
	}
}

// onEvent hands each event to the task that owns its session. A task sees its
// tab's events as its own page target ("") and its frames' under their ids,
// exactly as with a Runner window.
func (u *yourChrome) onEvent(sid, method string, raw json.RawMessage) {
	if sid == "" {
		if method == "Target.detachedFromTarget" {
			var p struct {
				SessionID string `json:"sessionId"`
			}
			if json.Unmarshal(raw, &p) == nil {
				u.mu.Lock()
				r, ok := u.routes[p.SessionID]
				u.mu.Unlock()
				if ok && r.page.root == p.SessionID {
					r.page.gone() // the user closed the task's tab
				}
			}
		}
		return
	}
	u.mu.Lock()
	r, ok := u.routes[sid]
	if ok && (method == "Target.attachedToTarget" || method == "Target.detachedFromTarget") {
		var p struct {
			SessionID string `json:"sessionId"`
		}
		if json.Unmarshal(raw, &p) == nil && p.SessionID != "" {
			if method == "Target.attachedToTarget" {
				u.routes[p.SessionID] = r
			} else {
				delete(u.routes, p.SessionID)
			}
		}
	}
	u.mu.Unlock()
	if !ok || !r.page.Alive() {
		return
	}
	if sid == r.page.root {
		sid = ""
	}
	r.s.onEvent(sid, method, raw)
}

// lingerLocked disconnects after a quiet period with no task attached.
func (u *yourChrome) lingerLocked() {
	if u.idle != nil {
		u.idle.Stop()
		u.idle = nil
	}
	if len(u.pages) > 0 || u.opening > 0 || u.conn == nil {
		return
	}
	conn := u.conn
	u.idle = time.AfterFunc(yourChromeLinger, func() {
		u.mu.Lock()
		defer u.mu.Unlock()
		if len(u.pages) == 0 && u.opening == 0 && u.conn == conn {
			conn.Close()
			u.conn = nil
		}
	})
}

// closeNow disconnects at once (the Agent is stopping).
func (u *yourChrome) closeNow() {
	u.mu.Lock()
	u.stopped = true
	if u.dialCancel != nil {
		u.dialCancel()
	}
	conn := u.conn
	u.conn = nil
	if u.idle != nil {
		u.idle.Stop()
	}
	u.mu.Unlock()
	if conn != nil {
		conn.Close()
	}
}

func (u *yourChrome) connected() bool {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.conn != nil && u.conn.Alive()
}

// Closing a paused task may use the lingering connection, but never opens
// an Allow prompt just to close a window. A disconnected window stays open.
func (u *yourChrome) closeTabIfConnected(ctx context.Context, target string) (bool, error) {
	u.mu.Lock()
	conn := u.conn
	u.mu.Unlock()
	if conn == nil || !conn.Alive() {
		return false, nil
	}
	if e := closeChromeTab(ctx, conn, target); e != nil {
		return false, e
	}
	return true, nil
}

func closeChromeTab(ctx context.Context, conn *cdpConn, target string) error {
	err := conn.Call(ctx, "Target.closeTarget", map[string]any{"targetId": target}, nil)
	if err != nil && strings.Contains(strings.ToLower(err.Error()), "no target with given id") {
		return nil // the user already closed this task's window
	}
	return err
}

// openTab gives a task its tab: the one it had, if the user has not closed
// it, or a new window that does not take the user's focus. A window of its
// own keeps the task out of the user's tabs, and unlike a background tab it
// is not throttled while the user works elsewhere.
func (u *yourChrome) openTab(ctx context.Context, s *session, target string) (*yourPage, error) {
	u.mu.Lock()
	u.opening++
	u.lingerLocked()
	u.mu.Unlock()
	defer func() {
		u.mu.Lock()
		u.opening--
		u.lingerLocked()
		u.mu.Unlock()
	}()
	conn, e := u.connect(ctx)
	if e != nil {
		return nil, e
	}
	if target != "" {
		var info struct {
			TargetInfo struct {
				Type string `json:"type"`
			} `json:"targetInfo"`
		}
		if conn.Call(ctx, "Target.getTargetInfo", map[string]any{"targetId": target}, &info) != nil || info.TargetInfo.Type != "page" {
			target = ""
		}
	}
	createdHere := target == ""
	if createdHere {
		var created struct {
			TargetID string `json:"targetId"`
		}
		if e := conn.Call(ctx, "Target.createTarget", map[string]any{"url": "about:blank", "newWindow": true, "background": true}, &created); e != nil {
			return nil, fmt.Errorf("browser_runner could not open a tab in the user's Chrome: %w", e)
		}
		target = created.TargetID
	}
	var attached struct {
		SessionID string `json:"sessionId"`
	}
	if e := conn.Call(ctx, "Target.attachToTarget", map[string]any{"targetId": target, "flatten": true}, &attached); e != nil {
		if createdHere {
			conn.Fire("Target.closeTarget", map[string]any{"targetId": target})
		}
		return nil, fmt.Errorf("browser_runner could not attach to its tab in the user's Chrome: %w", e)
	}
	p := &yourPage{u: u, base: conn, root: attached.SessionID, target: target, closed: make(chan struct{})}
	u.mu.Lock()
	u.routes[p.root] = yourRoute{s: s, page: p}
	u.pages[p] = true
	u.lingerLocked()
	u.mu.Unlock()
	return p, nil
}

// yourPage is one task's tab in the user's Chrome, seen through the shared
// connection. It implements cdpClient for the session.
type yourPage struct {
	u      *yourChrome
	base   *cdpConn
	root   string // the tab's CDP session
	target string // the tab's target id
	closed chan struct{}
	once   sync.Once
}

func (p *yourPage) Alive() bool {
	select {
	case <-p.closed:
		return false
	default:
		return p.base.Alive()
	}
}

func (p *yourPage) Call(ctx context.Context, method string, params any, out any) error {
	return p.CallIn(ctx, "", method, params, out)
}

func (p *yourPage) CallIn(ctx context.Context, session, method string, params any, out any) error {
	if !p.Alive() {
		return errBrowserGone
	}
	if session == "" {
		session = p.root
	}
	return p.base.CallIn(ctx, session, method, params, out)
}

func (p *yourPage) Fire(method string, params any) { p.FireIn("", method, params) }

func (p *yourPage) FireIn(session, method string, params any) {
	if !p.Alive() {
		return
	}
	if session == "" {
		session = p.root
	}
	p.base.FireIn(session, method, params)
}

// Close lets go of the tab and leaves it open where it is, so the user can
// see where the task stopped; a resumed task picks it up again.
func (p *yourPage) Close() {
	p.release(func() { p.base.Fire("Target.detachFromTarget", map[string]any{"sessionId": p.root}) })
}

// closeTab closes the task's own tab (the task is finished).
func (p *yourPage) closeTab(ctx context.Context) error {
	if p.Alive() {
		if e := closeChromeTab(ctx, p.base, p.target); e != nil {
			return e
		}
	}
	p.release(nil)
	return nil
}

func (p *yourPage) gone() { p.release(nil) }

func (p *yourPage) release(last func()) {
	p.once.Do(func() {
		close(p.closed)
		if last != nil && p.base.Alive() {
			last()
		}
		u := p.u
		u.mu.Lock()
		for sid, r := range u.routes {
			if r.page == p {
				delete(u.routes, sid)
			}
		}
		delete(u.pages, p)
		u.lingerLocked()
		u.mu.Unlock()
	})
}
