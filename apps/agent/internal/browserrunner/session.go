package browserrunner

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

//go:embed page.js
var pageJS string

const worldName = "remotearc_browser_runner"

// session is one delegated browser task. All tool calls on a session are
// serialized by mu; CDP events arrive on another goroutine and only touch the
// fields guarded by ev.
type session struct {
	mu       sync.Mutex
	m        *Manager
	cp       *Checkpoint
	auth     protocol.BrowserAuth
	scope    scope
	proc     *browserProcess
	conn     cdpClient
	lastUsed time.Time

	ev           sync.Mutex
	mainFrame    string
	worldCtx     int
	epoch        int
	loads        int                  // main-frame loads started; moves before a navigation commits
	loading      bool                 // main frame is loading (including blocked attempts)
	routes       int                  // same-document navigations (pushState, hash) of the main frame
	requests     map[string]time.Time // page XHR/fetch requests in flight, by request id
	lastRequest  time.Time            // when the page last sent anything that can carry data
	flushedEpoch int
	href         string
	submitting   bool
	dialogs      []string
	blocked      []Blocked

	frames   map[string]*frameInfo // child frames, guarded by ev
	frameSeq int

	// identifiers remembers the username sent on each site's first sign-in
	// step, for a password page that asks for it alone. Guarded by ev.
	identifiers map[string]identifier
	// savedLogin names a sign-in saved to the vault since the last tool
	// result, to report it. Guarded by ev.
	savedLogin string

	// unsent remembers, per submit key, the page state at a click that sent
	// nothing, so a retry can prove nothing has been sent since.
	unsent map[string]navMark

	// shownForUser: the window was brought on screen for the user to act
	// in; it goes back out of sight when the AI continues.
	shownForUser      bool
	viewUntil         time.Time    // guarded by ev
	video             *videoStream // guarded by ev; one encoded publisher per task
	viewJPEG          bool         // guarded by ev; false only after all viewers play video
	viewActive        bool
	viewConn          cdpClient
	lastViewFrame     time.Time
	viewStarted       time.Time
	viewError         string             // diagnostic only; never contains a frame
	viewCaptureCancel context.CancelFunc // guarded by ev; at most one viewport capture
	viewCaptureID     uint64
	networkRequests   map[string]bool
	networkChanged    time.Time

	snapshotID    string
	snapshotEpoch int
	snapshotSeq   int
	snapFrames    map[string]string // ref prefix (f1, f2...) -> frame id for the latest snapshot
}

func (s *session) live() bool { return s.conn != nil && s.conn.Alive() }

func (s *session) onEvent(cdpSession, method string, raw json.RawMessage) {
	if method == "Network.requestWillBeSent" || method == "Network.loadingFinished" || method == "Network.loadingFailed" {
		var event struct {
			RequestID string `json:"requestId"`
		}
		if json.Unmarshal(raw, &event) == nil {
			s.ev.Lock()
			if s.networkRequests == nil {
				s.networkRequests = map[string]bool{}
			}
			key := cdpSession + ":" + event.RequestID
			if method == "Network.requestWillBeSent" {
				s.networkRequests[key] = true
			} else {
				delete(s.networkRequests, key)
			}
			s.networkChanged = time.Now()
			s.ev.Unlock()
		}
	}

	if cdpSession != "" {
		s.onChildEvent(cdpSession, method, raw)
		return
	}
	switch method {
	case "Page.screencastFrame":
		s.onViewFrame(raw)
	case "Fetch.requestPaused":
		var p struct {
			RequestID string `json:"requestId"`
			FrameID   string `json:"frameId"`
			Request   struct {
				URL string `json:"url"`
			} `json:"request"`
		}
		if json.Unmarshal(raw, &p) != nil {
			return
		}
		s.ev.Lock()
		// Scope governs where the task goes (the top-level page). Embedded
		// frames from other sites may load, but are never read or acted on.
		subframe := s.mainFrame != "" && p.FrameID != "" && p.FrameID != s.mainFrame
		allowed := subframe || s.scope.Allows(p.Request.URL)
		if !allowed {
			s.blocked = append(s.blocked, Blocked{At: stamp(s.m.now()), Origin: originOf(p.Request.URL), Reason: "outside allowed_origins"})
		}
		s.ev.Unlock()
		if allowed {
			s.conn.Fire("Fetch.continueRequest", map[string]any{"requestId": p.RequestID})
		} else {
			s.conn.Fire("Fetch.failRequest", map[string]any{"requestId": p.RequestID, "errorReason": "BlockedByClient"})
		}
	case "Page.frameNavigated":
		var p struct {
			Frame struct {
				ID       string `json:"id"`
				ParentID string `json:"parentId"`
				URL      string `json:"url"`
			} `json:"frame"`
		}
		if json.Unmarshal(raw, &p) == nil && p.Frame.ParentID == "" {
			s.ev.Lock()
			s.mainFrame = p.Frame.ID
			s.href = p.Frame.URL
			s.epoch++
			s.worldCtx = 0
			s.ev.Unlock()
		} else if p.Frame.ParentID != "" {
			s.ev.Lock()
			s.frameNavigated("", p.Frame.ID, p.Frame.ParentID, p.Frame.URL)
			s.ev.Unlock()
		}
	case "Page.frameAttached":
		var p struct {
			FrameID       string `json:"frameId"`
			ParentFrameID string `json:"parentFrameId"`
		}
		if json.Unmarshal(raw, &p) == nil {
			s.ev.Lock()
			s.frameAttached("", p.FrameID, p.ParentFrameID)
			s.ev.Unlock()
		}
	case "Page.frameDetached":
		var p struct {
			FrameID string `json:"frameId"`
			Reason  string `json:"reason"`
		}
		if json.Unmarshal(raw, &p) == nil {
			s.ev.Lock()
			s.frameDetached(p.FrameID, p.Reason)
			s.ev.Unlock()
		}
	case "Target.attachedToTarget":
		s.childAttached("", raw)
	case "Target.detachedFromTarget":
		s.childDetached(raw)
	case "Page.frameStartedLoading", "Page.frameStoppedLoading":
		var p struct {
			FrameID string `json:"frameId"`
		}
		if json.Unmarshal(raw, &p) == nil {
			s.ev.Lock()
			if p.FrameID == s.mainFrame {
				if method == "Page.frameStartedLoading" {
					s.loads++
					s.loading = true
				} else {
					s.loading = false
				}
			}
			s.ev.Unlock()
		}
	case "Page.navigatedWithinDocument":
		var p struct {
			FrameID string `json:"frameId"`
			URL     string `json:"url"`
		}
		if json.Unmarshal(raw, &p) == nil {
			s.ev.Lock()
			if p.FrameID == s.mainFrame {
				s.href = p.URL
				s.routes++
			}
			s.ev.Unlock()
		}
	case "Network.requestWillBeSent":
		// Only the page's own data requests say whether an action is still
		// being processed; images, media and scripts do not.
		var p struct {
			RequestID string `json:"requestId"`
			Type      string `json:"type"`
		}
		if json.Unmarshal(raw, &p) != nil {
			break
		}
		data := p.Type == "XHR" || p.Type == "Fetch"
		// Anything that can carry data off the page counts as sent; passive
		// loads (images, scripts, styles, fonts, media) do not.
		if !data && p.Type != "Ping" && p.Type != "EventSource" && p.Type != "Document" {
			break
		}
		now := time.Now()
		s.ev.Lock()
		if data {
			if s.requests == nil {
				s.requests = map[string]time.Time{}
			}
			if _, redirect := s.requests[p.RequestID]; !redirect {
				s.requests[p.RequestID] = now
			}
		}
		s.lastRequest = now
		s.ev.Unlock()
	case "Network.webSocketFrameSent":
		s.ev.Lock()
		s.lastRequest = time.Now()
		s.ev.Unlock()
	case "Network.loadingFinished", "Network.loadingFailed":
		var p struct {
			RequestID string `json:"requestId"`
		}
		if json.Unmarshal(raw, &p) == nil {
			s.ev.Lock()
			delete(s.requests, p.RequestID)
			s.ev.Unlock()
		}
	case "Runtime.executionContextCreated":
		var p struct {
			Context struct {
				ID      int    `json:"id"`
				Name    string `json:"name"`
				AuxData struct {
					FrameID string `json:"frameId"`
				} `json:"auxData"`
			} `json:"context"`
		}
		if json.Unmarshal(raw, &p) == nil && p.Context.Name == worldName {
			s.ev.Lock()
			if p.Context.AuxData.FrameID == s.mainFrame {
				s.worldCtx = p.Context.ID
			} else if f := s.frames[p.Context.AuxData.FrameID]; f != nil && f.session == "" {
				f.world = p.Context.ID
			}
			s.ev.Unlock()
		}
	case "Runtime.executionContextsCleared":
		s.ev.Lock()
		s.worldCtx = 0
		s.clearWorlds("")
		s.ev.Unlock()
	case "Runtime.bindingCalled":
		var p struct {
			Name    string `json:"name"`
			Payload string `json:"payload"`
		}
		if json.Unmarshal(raw, &p) == nil && p.Name == loginBinding {
			go s.loginSent(p.Payload)
		}
	case "Page.javascriptDialogOpening":
		s.onDialog("", raw)
	}
}

func (s *session) onDialog(cdpSession string, raw json.RawMessage) {
	var p struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	}
	if json.Unmarshal(raw, &p) != nil {
		return
	}
	s.ev.Lock()
	accept := p.Type == "alert" || p.Type == "beforeunload" || (p.Type == "confirm" && s.submitting)
	verb := "dismissed"
	if accept {
		verb = "accepted"
	}
	s.dialogs = append(s.dialogs, fmt.Sprintf("%s %s: %s", verb, p.Type, clip(p.Message, 160)))
	s.ev.Unlock()
	s.conn.FireIn(cdpSession, "Page.handleJavaScriptDialog", map[string]any{"accept": accept})
}

func clip(s string, n int) string {
	s = strings.Join(strings.Fields(s), " ")
	if len([]rune(s)) > n {
		return string([]rune(s)[:n-1]) + "…"
	}
	return s
}

// ensureLive starts or reattaches the browser, restoring the last page.
func (s *session) ensureLive(ctx context.Context) error {
	if s.live() {
		return nil
	}
	s.shutdownBrowser(false)
	if s.cp.Browser == browserYourChrome {
		page, e := s.m.yourChrome().openTab(ctx, s, s.cp.YourTab)
		if e != nil {
			return e
		}
		s.conn = page
		s.cp.YourTab = page.target
	} else {
		exe, e := s.m.findBrowser()
		if e != nil {
			return e
		}
		var proc *browserProcess
		delivered := s.cp.State == StateNeedsUser && (s.cp.AttentionShown || s.cp.AttentionDismissed)
		launchHidden := s.cp.Headless || delivered || !s.mayShowWindow()
		e = s.startupStep("launch", func() error {
			var err error
			proc, err = launchBrowser(ctx, exe, profilePath(s.cp.Profile), launchHidden)
			return err
		})
		if e != nil {
			return e
		}
		var ws string
		e = s.startupStep("pageTarget", func() error {
			var err error
			ws, err = proc.pageTarget(ctx)
			return err
		})
		if e != nil {
			proc.stop()
			return e
		}
		var conn *cdpConn
		e = s.startupStep("dialCDP", func() error {
			var err error
			conn, err = dialCDP(ctx, ws, s.onEvent)
			return err
		})
		if e != nil {
			proc.stop()
			return e
		}
		s.proc, s.conn = proc, conn
	}
	s.ev.Lock()
	s.worldCtx, s.mainFrame, s.href = 0, "", ""
	s.frames = map[string]*frameInfo{}
	s.networkRequests = map[string]bool{}
	s.networkChanged = time.Now()
	s.ev.Unlock()
	s.snapFrames = nil
	if e := s.startupStep("setup", func() error { return s.setup(ctx) }); e != nil {
		s.shutdownBrowser(false)
		return e
	}
	if s.cp.recover(s.m.now()) {
		s.cp.receipt(s.m.now(), Receipt{Tool: "browser_runner_start", Outcome: "recovered", Detail: "an in-flight submit was interrupted; its effect is now unknown"})
	}
	// Task windows never take the user's focus; pages that check focus
	// still behave as in a focused window.
	_ = s.startupStep("setup.focus", func() error {
		return s.conn.Call(ctx, "Emulation.setFocusEmulationEnabled", map[string]any{"enabled": true}, nil)
	})
	if s.hasWindow() {
		delivered := s.cp.State == StateNeedsUser && (s.cp.AttentionShown || s.cp.AttentionDismissed)
		visible := !s.cp.Headless && !delivered && s.mayShowWindow()
		if e := s.startupStep("setup.window", func() error {
			// A surviving handoff may have been minimized or restored manually.
			// Reattaching must preserve that native window exactly as the user left it.
			if s.proc.attached && delivered {
				return nil
			}
			return s.setVisible(ctx, visible)
		}); e != nil {
			if visible {
				return fmt.Errorf("browser_runner could not show the task window: %w", e)
			}
		}
		// Re-check the actual page after navigation; stale checkpoint blockers
		// must never cause another automatic popup during startup.
		s.shownForUser = false
	}
	if s.cp.ResumeURL != "" && s.scope.Allows(s.cp.ResumeURL) && !strings.HasPrefix(s.currentHref(), "http") {
		// Reopening loads the page fresh: whatever was typed, chosen or
		// attached there before the restart is gone. Say so instead of
		// letting receipts suggest the form is still filled.
		if r := s.cp.lostInput(safeURL(s.cp.ResumeURL), s.m.now()); r != nil {
			s.cp.Reentry = r
		}
		_ = s.startupStep("navigate", func() error { _, err := s.navigate(ctx, s.cp.ResumeURL); return err })
	}
	if s.cp.State == StatePaused || s.cp.State == StateClosed {
		s.cp.State = StateActive
	}
	return nil
}

func (s *session) setup(ctx context.Context) error {
	calls := []struct {
		method string
		params any
	}{
		{"Page.enable", nil},
		{"Runtime.enable", nil},
		{"Fetch.enable", map[string]any{"patterns": []map[string]any{{"urlPattern": "*", "resourceType": "Document", "requestStage": "Request"}}}},
		{"Page.addScriptToEvaluateOnNewDocument", map[string]any{"source": pageJS + `("install", {})`}},
		{"Page.addScriptToEvaluateOnNewDocument", map[string]any{"source": pageJS + `("watch_logins", {})`, "worldName": worldName}},
		{"DOM.enable", nil},
		// Request start and end events (never bodies) tell when the page has
		// finished what an action started, instead of waiting a fixed time.
		{"Network.enable", nil},
		// Cross-site iframes run in their own process; attach to them so
		// embedded forms can be read and filled.
		{"Target.setAutoAttach", map[string]any{"autoAttach": true, "waitForDebuggerOnStart": true, "flatten": true}},
	}
	// The isolated world watches sign-in forms (see watch_logins) and reports
	// through a binding that exists only in that world. A browser too old
	// for it still runs; sign-ins are then just not saved.
	_ = s.startupStep("setup.Runtime.addBinding", func() error {
		return s.conn.Call(ctx, "Runtime.addBinding", map[string]any{"name": loginBinding, "executionContextName": worldName}, nil)
	})
	for _, c := range calls {
		if e := s.startupStep("setup."+c.method, func() error { return s.conn.Call(ctx, c.method, c.params, nil) }); e != nil {
			return fmt.Errorf("browser_runner setup failed (%s): %w", c.method, e)
		}
	}
	// Downloads are not part of the delegated surface. In the user's own
	// Chrome this setting would reach their whole profile, so it is left as
	// the user has it there.
	if s.cp.Browser != browserYourChrome {
		_ = s.startupStep("setup.Page.setDownloadBehavior", func() error {
			return s.conn.Call(ctx, "Page.setDownloadBehavior", map[string]any{"behavior": "deny"}, nil)
		})
	}
	var tree struct {
		FrameTree struct {
			Frame struct {
				ID  string `json:"id"`
				URL string `json:"url"`
			} `json:"frame"`
		} `json:"frameTree"`
	}
	if e := s.startupStep("setup.Page.getFrameTree", func() error { return s.conn.Call(ctx, "Page.getFrameTree", nil, &tree) }); e != nil {
		return e
	}
	s.ev.Lock()
	s.mainFrame, s.href = tree.FrameTree.Frame.ID, tree.FrameTree.Frame.URL
	s.ev.Unlock()
	_ = s.startupStep("setup.install", func() error { _, err := s.evaluateMain(ctx, pageJS+`("install", {})`); return err })
	_ = s.startupStep("setup.watch_logins", func() error { _, err := s.helper(ctx, "watch_logins", nil, true); return err })
	return nil
}

func (s *session) shutdownBrowser(markPaused bool) {
	s.ev.Lock()
	s.stopVideoLocked()
	s.viewActive = false
	s.viewUntil = time.Time{}
	s.cancelViewCapture()
	s.ev.Unlock()
	if s.conn != nil {
		s.conn.Close()
		s.conn = nil
	}
	if s.proc != nil {
		s.proc.stop()
		s.proc = nil
	}
	if markPaused && s.cp.State == StateActive {
		s.cp.State = StatePaused
	}
}

func (s *session) currentHref() string {
	s.ev.Lock()
	defer s.ev.Unlock()
	return s.href
}

// flush copies event-side observations into the checkpoint and saves it.
func (s *session) flush() error {
	s.ev.Lock()
	s.cp.Navigations += s.epoch - s.flushedEpoch
	s.flushedEpoch = s.epoch
	s.cp.Blocked = append(s.cp.Blocked, s.blocked...)
	s.blocked = nil
	if strings.HasPrefix(s.href, "http") {
		s.cp.ResumeURL = authResumeURL(s.href)
		s.cp.LastURL = safeURL(s.href)
	}
	s.ev.Unlock()
	return s.cp.save(s.m.now())
}

func (s *session) takeDialogs() []string {
	s.ev.Lock()
	defer s.ev.Unlock()
	d := s.dialogs
	s.dialogs = nil
	return d
}

type evalResult struct {
	Result struct {
		Type     string          `json:"type"`
		Value    json.RawMessage `json:"value"`
		ObjectID string          `json:"objectId"`
	} `json:"result"`
	Exception *struct {
		Text      string `json:"text"`
		Exception struct {
			Description string `json:"description"`
		} `json:"exception"`
	} `json:"exceptionDetails"`
}

func (s *session) evaluateMain(ctx context.Context, expr string) (json.RawMessage, error) {
	var r evalResult
	if e := s.conn.Call(ctx, "Runtime.evaluate", map[string]any{"expression": expr, "returnByValue": true}, &r); e != nil {
		return nil, e
	}
	return r.Result.Value, nil
}

// world returns the isolated execution context for the main frame. Page
// scripts cannot read or replace the Runner's element map there.
func (s *session) world(ctx context.Context) (int, error) {
	s.ev.Lock()
	id, frame := s.worldCtx, s.mainFrame
	s.ev.Unlock()
	if id != 0 {
		return id, nil
	}
	var r struct {
		ID int `json:"executionContextId"`
	}
	if e := s.conn.Call(ctx, "Page.createIsolatedWorld", map[string]any{"frameId": frame, "worldName": worldName}, &r); e != nil {
		return 0, e
	}
	s.ev.Lock()
	if s.mainFrame == frame {
		s.worldCtx = r.ID
	}
	s.ev.Unlock()
	return r.ID, nil
}

var errStale = errors.New("STALE_REF: the page navigated or reloaded. Take a new browser_runner_snapshot.")

// helper runs one page.js operation in the main frame's isolated world.
func (s *session) helper(ctx context.Context, op string, args map[string]any, byValue bool) (*evalResult, error) {
	return s.helperIn(ctx, "", op, args, byValue)
}

// frameSession is the CDP session that owns a frame ("" for the page).
func (s *session) frameSession(frameID string) string {
	if frameID == "" {
		return ""
	}
	f, _ := s.frameByID(frameID)
	return f.session
}

// helperIn runs one page.js operation in a frame's isolated world; an empty
// frame id is the top-level page.
func (s *session) helperIn(ctx context.Context, frameID, op string, args map[string]any, byValue bool) (*evalResult, error) {
	var id int
	var e error
	cdpSession := ""
	if frameID == "" {
		id, e = s.world(ctx)
	} else {
		cdpSession, id, e = s.worldIn(ctx, frameID)
	}
	if e != nil {
		return nil, e
	}
	if args == nil {
		args = map[string]any{}
	}
	rawURL := s.currentHref()
	if frameID != "" {
		f, ok := s.frameByID(frameID)
		if !ok || !s.readableFrame(f) {
			return nil, errors.New("BROWSER_AUTH_REQUIRED: this frame is not approved in Dashboard.")
		}
		rawURL = f.url
		args["captcha_frame"] = s.captchaFrame(f)
	}
	args["allow_codes"] = s.codesAllowed(rawURL)
	args["allow_captcha"] = s.captchaAllowed()
	args["mailbox"] = s.auth.Mailbox
	b, _ := json.Marshal(args)
	expr := pageJS + "(" + quoteJS(op) + ", " + string(b) + ")"
	var r evalResult
	e = s.conn.CallIn(ctx, cdpSession, "Runtime.evaluate", map[string]any{"expression": expr, "contextId": id, "returnByValue": byValue}, &r)
	if e != nil {
		if strings.Contains(e.Error(), "context") {
			s.ev.Lock()
			if frameID == "" {
				s.worldCtx = 0
			} else if f := s.frames[frameID]; f != nil {
				f.world = 0
			}
			s.ev.Unlock()
			return nil, errStale
		}
		return nil, e
	}
	if r.Exception != nil {
		msg := r.Exception.Exception.Description
		if msg == "" {
			msg = r.Exception.Text
		}
		msg = strings.TrimPrefix(strings.SplitN(msg, "\n", 2)[0], "Error: ")
		return nil, errors.New(msg)
	}
	return &r, nil
}

func quoteJS(s string) string { b, _ := json.Marshal(s); return string(b) }

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

type navMark struct {
	epoch, loads, routes int
	at                   time.Time
}

func (s *session) mark() navMark {
	s.ev.Lock()
	defer s.ev.Unlock()
	return navMark{s.epoch, s.loads, s.routes, time.Now()}
}

// navWindowLong is how long a navigation may take to begin after an action
// that is expected to navigate (a link, a submit, a declared navigation).
const navWindowLong = 2500 * time.Millisecond

// settlePlan says how long to wait after an action, by what the action can
// do. Waits end as soon as the page is still; the durations are upper bounds.
type settlePlan struct {
	// expectNav: the action may navigate, so absence of change is not taken
	// as done until navWindow has passed.
	expectNav bool
	// navWindow is how long a document navigation may take to begin.
	navWindow time.Duration
	// minWait is the least time given for the action to take effect.
	minWait time.Duration
	// quiet is how long the DOM must be unchanged with no request the
	// action started still running.
	quiet time.Duration
	// noisyAfter stops waiting for the DOM to be still on pages that never
	// are (tickers, animations) once no request is outstanding.
	noisyAfter time.Duration
	// limit bounds the wait for outstanding requests.
	limit time.Duration
}

var (
	// fill, select, check: the field updates synchronously; a change handler
	// may still validate, reveal fields or submit a GET form.
	settleField = settlePlan{navWindow: 100 * time.Millisecond, minWait: 60 * time.Millisecond, quiet: 60 * time.Millisecond, noisyAfter: 400 * time.Millisecond, limit: 2 * time.Second}
	// between the fields of one fill_form call.
	settleStep = settlePlan{navWindow: 50 * time.Millisecond, minWait: 20 * time.Millisecond, quiet: 40 * time.Millisecond, noisyAfter: 250 * time.Millisecond, limit: 1500 * time.Millisecond}
	// a click or key on something that does not navigate (radio, option,
	// tab, menu, dropdown toggle): wait for what it opens to render.
	settleToggle = settlePlan{navWindow: 200 * time.Millisecond, minWait: 150 * time.Millisecond, quiet: 100 * time.Millisecond, noisyAfter: time.Second, limit: 4 * time.Second}
	// links, Next/Continue and declared navigations.
	settleNav = settlePlan{expectNav: true, navWindow: navWindowLong, minWait: 400 * time.Millisecond, quiet: 150 * time.Millisecond, noisyAfter: navWindowLong, limit: 10 * time.Second}
	// submits: same, with more time for a confirmation page to begin loading.
	settleSubmit = settlePlan{expectNav: true, navWindow: navWindowLong, minWait: 1200 * time.Millisecond, quiet: 200 * time.Millisecond, noisyAfter: navWindowLong, limit: 15 * time.Second}
	// uploads: a form may read the file (resume parsing) and fill fields.
	settleUpload = settlePlan{navWindow: 100 * time.Millisecond, minWait: 150 * time.Millisecond, quiet: 200 * time.Millisecond, noisyAfter: time.Second, limit: 8 * time.Second}
)

// actPlan picks how long to wait after one act from what it can do.
func actPlan(action, key, effect string, mayNavigate bool) settlePlan {
	activates := action == "click" || (action == "press" && (key == "Enter" || key == "Space"))
	switch {
	case effect == "submit":
		return settleSubmit
	case effect == "navigation", activates && mayNavigate:
		return settleNav
	case action == "click" || action == "press":
		return settleToggle
	default:
		return settleField
	}
}

// domState reports how long the DOM of a frame ("" for the page) has been
// unchanged and how many changes it has seen.
func (s *session) domState(ctx context.Context, frameID string) (idle time.Duration, changes int, ok bool) {
	r, e := s.helperIn(ctx, frameID, "quiet", nil, true)
	if e != nil {
		return 0, 0, false
	}
	var q struct {
		Idle    float64 `json:"idle"`
		Changes int     `json:"changes"`
	}
	if json.Unmarshal(r.Result.Value, &q) != nil {
		return 0, 0, false
	}
	return time.Duration(q.Idle) * time.Millisecond, q.Changes, true
}

// stepView tells one page of a form from the next: its field names and
// headings, never values.
type stepView struct {
	Fields   string   `json:"fields"`
	Headings []string `json:"headings"`
	Title    string   `json:"title"`
	ok       bool
}

func (s *session) stepState(ctx context.Context) stepView {
	var v stepView
	if r, e := s.helper(ctx, "step_state", nil, true); e == nil && json.Unmarshal(r.Result.Value, &v) == nil {
		v.ok = true
	}
	return v
}

// evidence names the page a step led to: its first new heading, else its
// first heading, else its title.
func (v stepView) evidence(prev stepView) string {
	seen := map[string]bool{}
	for _, h := range prev.Headings {
		seen[h] = true
	}
	for _, h := range v.Headings {
		if !seen[h] {
			return h
		}
	}
	if len(v.Headings) > 0 {
		return v.Headings[0]
	}
	return v.Title
}

// pending counts the page's data requests started since t that are still
// running. Requests open for over 20 s (long polling, streams) are ignored.
func (s *session) pending(t time.Time) (open int, any bool) {
	s.ev.Lock()
	defer s.ev.Unlock()
	now := time.Now()
	for id, at := range s.requests {
		if now.Sub(at) > 20*time.Second {
			delete(s.requests, id)
			continue
		}
		if !at.Before(t) {
			open++
		}
	}
	return open, !s.lastRequest.Before(t)
}

// settle waits after an action until the page has taken it in: a document
// load is followed to the end; otherwise it returns once requests the action
// started are done and the DOM is still, within the plan's bounds. A
// navigation that begins after it returns is caught by the next call
// (STALE_REF), never acted through. It reports whether the document changed.
func (s *session) settle(ctx context.Context, mark navMark, frameID string, domBefore int, p settlePlan) bool {
	start := time.Now()
	for {
		if ctx.Err() != nil || !s.live() {
			return false
		}
		elapsed := time.Since(start)
		s.ev.Lock()
		committed := s.epoch != mark.epoch
		loadStarted := s.loads != mark.loads
		routed := s.routes != mark.routes
		s.ev.Unlock()
		if committed {
			return s.waitSettled(ctx, mark, p.navWindow)
		}
		if loadStarted && !routed {
			if s.waitSettled(ctx, mark, p.navWindow) {
				return true
			}
			// The load ended without a new document. Unless it was a
			// same-document navigation (pushState), it was blocked or a
			// download, and the page is as it was.
			s.ev.Lock()
			routed = s.routes != mark.routes
			s.ev.Unlock()
			if !routed {
				return false
			}
		}
		open, requested := s.pending(mark.at)
		if elapsed >= p.minWait {
			idle, changes, ok := s.domState(ctx, frameID)
			if !ok {
				// The document went away under us: a navigation is starting.
				time.Sleep(40 * time.Millisecond)
				continue
			}
			still := open == 0 && idle >= p.quiet
			happened := routed || requested || changes != domBefore
			if still && (!p.expectNav || happened || elapsed >= p.navWindow) {
				return false
			}
			if open == 0 && elapsed >= p.noisyAfter && (!p.expectNav || elapsed >= p.navWindow) {
				return false
			}
		}
		if elapsed >= p.limit {
			return false
		}
		time.Sleep(30 * time.Millisecond)
	}
}

// waitSettled waits for a navigation that may follow an action, then for the
// document to finish loading. navWindow is how long a navigation may take to
// begin.
func (s *session) waitSettled(ctx context.Context, mark navMark, navWindow time.Duration) bool {
	start := time.Now()
	navigated := false
	for time.Since(start) < 20*time.Second {
		if ctx.Err() != nil || !s.live() {
			return navigated
		}
		s.ev.Lock()
		navigated = s.epoch != mark.epoch
		started := navigated || s.loads != mark.loads
		loading := s.loading
		routed := s.routes != mark.routes
		s.ev.Unlock()
		// A same-document navigation (pushState, hash) also reports loading;
		// it leaves no document to wait for.
		if started && !navigated && !loading && routed {
			return false
		}
		// A load that started (even one later blocked by scope) is followed
		// to the end; only a page that never began loading times out early.
		if !started && time.Since(start) > navWindow {
			return false
		}
		if started && !navigated && !loading && time.Since(start) > navWindow {
			return false
		}
		if navigated && !loading {
			r, e := s.helper(ctx, "probe", nil, true)
			if e == nil {
				var p struct {
					Ready string `json:"ready"`
				}
				_ = json.Unmarshal(r.Result.Value, &p)
				if p.Ready == "complete" || (p.Ready == "interactive" && time.Since(start) > 8*time.Second) {
					time.Sleep(150 * time.Millisecond)
					return true
				}
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	return navigated
}

func (s *session) navigate(ctx context.Context, target string) (map[string]any, error) {
	if !s.scope.Allows(target) {
		return nil, fmt.Errorf("OUT_OF_SCOPE: %s is not in allowed_origins %v. Ask the user to start a task that includes this site.", originOf(target), s.scope.Strings())
	}
	before := s.mark()
	var r struct {
		ErrorText string `json:"errorText"`
	}
	if e := s.conn.Call(ctx, "Page.navigate", map[string]any{"url": target}, &r); e != nil {
		return nil, e
	}
	if strings.Contains(r.ErrorText, "BLOCKED_BY_CLIENT") {
		return nil, errors.New("OUT_OF_SCOPE: the site redirected outside allowed_origins; the navigation was blocked.")
	}
	if r.ErrorText != "" {
		return nil, errors.New("Navigation failed: " + r.ErrorText)
	}
	s.waitSettled(ctx, before, navWindowLong)
	return s.pageState(ctx), nil
}

// restoreAfterBlock returns the tab to the last in-scope page after a blocked
// navigation left it on the browser's error page.
func (s *session) restoreAfterBlock(ctx context.Context) {
	if strings.HasPrefix(s.currentHref(), "http") {
		return
	}
	var h struct {
		CurrentIndex int `json:"currentIndex"`
		Entries      []struct {
			ID  int    `json:"id"`
			URL string `json:"url"`
		} `json:"entries"`
	}
	before := s.mark()
	if s.conn.Call(ctx, "Page.getNavigationHistory", nil, &h) == nil {
		for i := h.CurrentIndex - 1; i >= 0 && i < len(h.Entries); i-- {
			if s.scope.Allows(h.Entries[i].URL) {
				if s.conn.Call(ctx, "Page.navigateToHistoryEntry", map[string]any{"entryId": h.Entries[i].ID}, nil) == nil {
					s.waitSettled(ctx, before, navWindowLong)
					return
				}
				break
			}
		}
	}
	if s.cp.ResumeURL != "" && s.scope.Allows(s.cp.ResumeURL) {
		_, _ = s.navigate(ctx, s.cp.ResumeURL)
	}
}

func (s *session) pageState(ctx context.Context) map[string]any {
	out := map[string]any{"url": s.currentHref()}
	if r, e := s.helper(ctx, "probe", nil, true); e == nil {
		var p struct {
			URL   string `json:"url"`
			Title string `json:"title"`
		}
		_ = json.Unmarshal(r.Result.Value, &p)
		out["url"], out["title"] = p.URL, p.Title
		s.cp.Title = p.Title
	}
	return out
}

func (s *session) snapshot(ctx context.Context, maxElements, maxText int) (map[string]any, error) {
	s.snapshotSeq++
	id := fmt.Sprintf("s%d-%s", s.snapshotSeq, randomHex(3))
	s.ev.Lock()
	epoch := s.epoch
	s.ev.Unlock()
	r, e := s.helper(ctx, "snapshot", map[string]any{"snapshot_id": id, "max_elements": maxElements, "max_text": maxText, "allow_codes": s.codesAllowed(s.currentHref()), "allow_captcha": s.captchaAllowed()}, true)
	if e != nil {
		return nil, e
	}
	var page map[string]any
	if e := json.Unmarshal(r.Result.Value, &page); e != nil {
		return nil, e
	}
	page["authentication"] = map[string]any{"otp": s.codesAllowed(s.currentHref()), "captcha": s.captchaAllowed(), "mailbox": s.auth.Mailbox, "approval_location": "Dashboard → device → Browser authentication"}
	s.snapshotID, s.snapshotEpoch = id, epoch
	elements, _ := page["elements"].([]any)
	s.snapshotFrames(ctx, page, id, maxElements-len(elements), maxText)
	if t, ok := page["title"].(string); ok {
		s.cp.Title = t
	}
	s.applySavedLogins(page)
	blockers, _ := page["blockers"].([]any)
	s.updateAttention(ctx, blockers)
	attention, _ := page["attention"].([]any)
	// A hidden browser cannot show the user a challenge later without
	// reopening the page, which clears the form. Say it before any typing.
	if s.cp.Headless && !s.hasWindow() && len(blockers) == 0 {
		if parts, _ := page["captcha"].([]any); len(parts) > 0 {
			attention = append(attention, map[string]any{"kind": "captcha_headless", "detail": "This page carries a CAPTCHA and the task browser is hidden. If the user may have to solve it, call browser_runner_start with headless=false now, before entering anything: switching later reopens the page and clears what was entered."})
		}
	}
	if len(attention) > 0 {
		page["attention"] = attention
	} else {
		delete(page, "attention")
	}
	if r := s.reentryStatus(page); r != nil {
		page["reentry_needed"] = r
	}
	page["snapshot_id"] = id
	page["session_state"] = s.cp.State
	if s.cp.NeedsUser != "" {
		page["needs_user"] = s.cp.NeedsUser
	}
	if u := s.cp.unresolved(); u != nil {
		page["unresolved_submit"] = u
	}
	if d := s.takeDialogs(); len(d) > 0 {
		page["dialogs"] = d
	}
	page["guidance"] = "Refs are valid only for this snapshot_id. After any navigation, take a new snapshot. Use effect=submit with an idempotency_key for any action that sends the form."
	return page, nil
}

// reentryStatus compares input lost to a restart with what the page shows now.
// It clears itself once the task has left the page or every field it can
// find holds a value again, so it never outlives the problem.
func (s *session) reentryStatus(page map[string]any) map[string]any {
	r := s.cp.Reentry
	if r == nil {
		return nil
	}
	if safeURL(s.currentHref()) != r.URL {
		s.cp.Reentry = nil
		return nil
	}
	els, _ := page["elements"].([]any)
	var empty, unverified []string
	for _, f := range r.Fields {
		label := f.Label
		if f.File != "" {
			label += " (" + f.File + ")"
		}
		matched, filled := false, false
		for _, raw := range els {
			m, ok := raw.(map[string]any)
			if !ok || !sameField(m, f) {
				continue
			}
			matched = true
			if !emptyNow(m, f.Action) {
				filled = true
				break
			}
		}
		switch {
		case !matched:
			unverified = append(unverified, label)
		case !filled:
			empty = append(empty, label)
		}
	}
	if len(empty) == 0 && len(unverified) == 0 {
		s.cp.Reentry = nil
		return nil
	}
	out := map[string]any{
		"detail": "The task browser was restarted and reopened this page, so input from before the restart is gone. Fill or upload these again, then check the values in a new snapshot. Earlier receipts are history, not the current page.",
	}
	if len(empty) > 0 {
		out["fields"] = empty
	}
	// A field the page now labels differently cannot be checked here; it
	// stays listed until the task leaves the page rather than being assumed
	// filled.
	if len(unverified) > 0 {
		out["unverified"] = unverified
	}
	return out
}

// sameField matches a snapshot element to input recorded before a restart.
// Some forms relabel a file field after an upload (for example adding the
// file name), so an upload also matches a file input whose current label
// begins its recorded one.
func sameField(el map[string]any, f ReentryField) bool {
	name, _ := el["name"].(string)
	if name == f.Label {
		return true
	}
	return f.Action == "upload" && el["role"] == "file" && name != "" && strings.HasPrefix(f.Label, name)
}

// emptyNow reports whether a snapshot element lost what the action had set.
func emptyNow(el map[string]any, action string) bool {
	switch action {
	case "upload":
		n, _ := el["files"].(float64)
		return n == 0
	case "check":
		c, ok := el["checked"].(bool)
		return ok && !c
	case "uncheck":
		c, ok := el["checked"].(bool)
		return ok && c
	default:
		v, ok := el["value"].(string)
		return ok && v == ""
	}
}

func (s *session) checkSnapshot(id string) error {
	s.ev.Lock()
	epoch := s.epoch
	s.ev.Unlock()
	if id == "" || id != s.snapshotID || epoch != s.snapshotEpoch {
		return errors.New("STALE_REF: snapshot " + id + " is not the latest snapshot of the current page. Take a new browser_runner_snapshot.")
	}
	return nil
}

var keys = map[string]struct {
	code string
	vk   int
	text string
}{
	"Enter":     {"Enter", 13, "\r"},
	"Tab":       {"Tab", 9, ""},
	"Escape":    {"Escape", 27, ""},
	"ArrowDown": {"ArrowDown", 40, ""},
	"ArrowUp":   {"ArrowUp", 38, ""},
	"Space":     {"Space", 32, " "},
}

type actRequest struct {
	SnapshotID string
	Ref        string
	Action     string
	Value      string
	HasValue   bool
	Effect     string
	Key        string
	SecretPart string // username or password from the vault (fill_secret)
}

// act performs one input action. dispatched reports whether any input may
// have reached the page, which decides between not_dispatched and unknown.
func (s *session) act(ctx context.Context, a actRequest) (result map[string]any, dispatched bool, err error) {
	ref := map[string]any{"snapshot_id": a.SnapshotID, "ref": a.Ref, "action": a.Action, "allow_codes": s.codesAllowed(s.currentHref()), "allow_captcha": s.captchaAllowed(), "secret_part": a.SecretPart}
	result = map[string]any{"action": a.Action}
	frameID, e := s.refFrame(a.Ref)
	if e != nil {
		return nil, false, e
	}
	if e := s.checkAuthRef(a.Ref); e != nil {
		return nil, false, e
	}
	if frameID != "" {
		if f, ok := s.frameByID(frameID); ok {
			ref["allow_codes"] = s.codesAllowed(f.url)
		}
	}
	if frameID != "" {
		result["frame"] = a.Ref[:strings.IndexByte(a.Ref, 'e')]
	}
	switch a.Action {
	case "click":
		s.ev.Lock()
		startLoads, startEpoch := s.loads, s.epoch
		s.ev.Unlock()
		r, e := s.helperIn(ctx, frameID, "locate", ref, true)
		if e != nil {
			return nil, false, e
		}
		var loc struct {
			X, Y      float64
			Reachable bool
			Label     string
		}
		_ = json.Unmarshal(r.Result.Value, &loc)
		result["label"] = loc.Label
		minimized := false
		if s.hasWindow() {
			if _, b, e := s.window(ctx); e != nil {
				return nil, false, e
			} else if b.WindowState == "minimized" {
				// A minimized window can discard mouse input. Choose one exact
				// element click before dispatch, rather than trying a mouse click
				// and risking a second final submit as a fallback.
				minimized, loc.Reachable = true, false
			}
		}
		if frameID != "" {
			// Aim at the element through the frame's position in the page;
			// if that cannot be measured, click the element directly.
			if ox, oy, ok := s.frameOffset(ctx, frameID); ok {
				loc.X, loc.Y = loc.X+ox, loc.Y+oy
			} else {
				loc.Reachable = false
			}
		}
		if loc.Reachable {
			_, _ = s.helperIn(ctx, frameID, "arm_click", ref, true)
			for i, t := range []string{"mouseMoved", "mousePressed", "mouseReleased"} {
				p := map[string]any{"type": t, "x": loc.X, "y": loc.Y, "button": "left", "clickCount": 1}
				if t == "mouseMoved" {
					p = map[string]any{"type": t, "x": loc.X, "y": loc.Y}
				}
				if i == 1 {
					dispatched = true
				}
				if e := s.conn.Call(ctx, "Input.dispatchMouseEvent", p, nil); e != nil {
					return nil, dispatched, e
				}
			}
			// If the page navigated, the click clearly landed. Otherwise make
			// sure the trusted click reached the element; a throttled or
			// covered window can swallow synthetic mouse input.
			s.ev.Lock()
			moved := s.loads != startLoads || s.epoch != startEpoch
			s.ev.Unlock()
			if !moved {
				if r, e := s.helperIn(ctx, frameID, "click_seen", ref, true); e == nil && string(r.Result.Value) == "false" {
					if a.Effect == "submit" {
						// Never risk a second submit: report and let the
						// caller inspect the page first.
						result["note"] = "the click may not have reached the element; take a snapshot before deciding anything"
					} else {
						if _, e := s.helperIn(ctx, frameID, "jsclick", ref, true); e != nil {
							return nil, true, e
						}
						result["note"] = "the mouse click did not reach the element; a direct element click was used"
					}
				}
			}
		} else {
			// Covered by an overlay (cookie banner, sticky header): fall back
			// to a DOM click on the exact element the model chose.
			dispatched = true
			if _, e := s.helperIn(ctx, frameID, "jsclick", ref, true); e != nil {
				return nil, true, e
			}
			if minimized {
				result["note"] = "the task window is minimized; a direct element click was used"
			} else {
				result["note"] = "element was covered; a direct element click was used"
			}
		}
	case "fill":
		if !a.HasValue {
			return nil, false, errors.New("fill requires value.")
		}
		r, e := s.helperIn(ctx, frameID, "locate", ref, true)
		if e != nil {
			return nil, false, e
		}
		var loc struct{ Label string }
		_ = json.Unmarshal(r.Result.Value, &loc)
		result["label"] = loc.Label
		if _, e := s.helperIn(ctx, frameID, "prepare_fill", ref, true); e != nil {
			return nil, false, e
		}
		dispatched = true
		if a.Value == "" {
			if e := s.conn.Call(ctx, "Input.dispatchKeyEvent", map[string]any{"type": "rawKeyDown", "key": "Delete", "code": "Delete", "windowsVirtualKeyCode": 46}, nil); e != nil {
				return nil, true, e
			}
		} else if e := s.conn.Call(ctx, "Input.insertText", map[string]any{"text": a.Value}, nil); e != nil {
			return nil, true, e
		}
		fin := map[string]any{"snapshot_id": a.SnapshotID, "ref": a.Ref, "value": a.Value}
		r, e = s.helperIn(ctx, frameID, "finish_fill", fin, true)
		if e != nil {
			return nil, true, e
		}
		var f struct {
			Matched   bool `json:"matched"`
			Length    int  `json:"length"`
			MaxLength *int `json:"maxlength"`
		}
		_ = json.Unmarshal(r.Result.Value, &f)
		result["value_length"] = f.Length
		if !f.Matched {
			msg := "FILL_MISMATCH: the field did not keep the requested value"
			if f.MaxLength != nil {
				msg += fmt.Sprintf(" (maxlength %d)", *f.MaxLength)
			}
			return nil, true, errors.New(msg + ". Take a new snapshot to see what the page accepted.")
		}
	case "select":
		if !a.HasValue {
			return nil, false, errors.New("select requires value (option value or visible label).")
		}
		dispatched = true
		r, e := s.helperIn(ctx, frameID, "select", map[string]any{"snapshot_id": a.SnapshotID, "ref": a.Ref, "value": a.Value}, true)
		if e != nil {
			return nil, !strings.HasPrefix(e.Error(), "STALE_REF") && !strings.HasPrefix(e.Error(), "NO_OPTION") && !strings.HasPrefix(e.Error(), "WRONG_ACTION"), e
		}
		var sel map[string]any
		_ = json.Unmarshal(r.Result.Value, &sel)
		result["selected"] = sel["selected"]
		if l, ok := sel["label"].(string); ok {
			result["label"] = l
		}
	case "check", "uncheck":
		dispatched = true
		r, e := s.helperIn(ctx, frameID, "check", map[string]any{"snapshot_id": a.SnapshotID, "ref": a.Ref, "checked": a.Action == "check"}, true)
		if e != nil {
			return nil, !strings.HasPrefix(e.Error(), "STALE_REF") && !strings.HasPrefix(e.Error(), "WRONG_ACTION"), e
		}
		var c map[string]any
		_ = json.Unmarshal(r.Result.Value, &c)
		result["checked"] = c["checked"]
		if l, ok := c["label"].(string); ok {
			result["label"] = l
		}
	case "press":
		k, ok := keys[a.Key]
		if !ok {
			return nil, false, errors.New("press key must be one of Enter, Tab, Escape, ArrowDown, ArrowUp, Space.")
		}
		if a.Ref == "" {
			if _, e := s.helper(ctx, "guard_key_focus", nil, true); e != nil {
				return nil, false, e
			}
		}
		if a.Ref != "" {
			if _, e := s.helperIn(ctx, frameID, "focus", ref, true); e != nil {
				return nil, false, e
			}
		}
		dispatched = true
		down := map[string]any{"type": "rawKeyDown", "key": a.Key, "code": k.code, "windowsVirtualKeyCode": k.vk}
		if k.text != "" {
			down = map[string]any{"type": "keyDown", "key": strings.Replace(a.Key, "Space", " ", 1), "code": k.code, "windowsVirtualKeyCode": k.vk, "text": k.text}
		}
		if e := s.conn.Call(ctx, "Input.dispatchKeyEvent", down, nil); e != nil {
			return nil, true, e
		}
		if e := s.conn.Call(ctx, "Input.dispatchKeyEvent", map[string]any{"type": "keyUp", "key": a.Key, "code": k.code, "windowsVirtualKeyCode": k.vk}, nil); e != nil {
			return nil, true, e
		}
		result["key"] = a.Key
	default:
		return nil, false, errors.New("action must be click, fill, select, check, uncheck, press, navigate, upload, wait or fill_form.")
	}
	return result, dispatched, nil
}

// uploadLimits lists the file types browser_runner may attach and the size
// limit for each class. Media files are passed to Chrome by path and hashed as
// a stream, so larger videos do not need to fit in memory.
const (
	maxDocumentUpload = 25 << 20
	maxAudioUpload    = 512 << 20
	maxVideoUpload    = 2 << 30
)

var uploadLimits = map[string]int64{
	".pdf": maxDocumentUpload, ".doc": maxDocumentUpload, ".docx": maxDocumentUpload, ".txt": maxDocumentUpload,
	".rtf": maxDocumentUpload, ".odt": maxDocumentUpload, ".csv": maxDocumentUpload, ".xlsx": maxDocumentUpload,
	".pptx": maxDocumentUpload, ".png": maxDocumentUpload, ".jpg": maxDocumentUpload, ".jpeg": maxDocumentUpload,
	".gif": maxDocumentUpload, ".webp": maxDocumentUpload,
	".mp3": maxAudioUpload, ".wav": maxAudioUpload, ".m4a": maxAudioUpload,
	".mp4": maxVideoUpload, ".mov": maxVideoUpload, ".m4v": maxVideoUpload, ".webm": maxVideoUpload,
}

const uploadTypesText = "documents (pdf, doc, docx, txt, rtf, odt, csv, xlsx, pptx), images (png, jpg, gif, webp), audio (mp3, wav, m4a) and video (mp4, mov, m4v, webm)"

func fileDigest(path string) (int64, string, error) {
	st, e := os.Stat(path)
	if e != nil {
		if errors.Is(e, os.ErrNotExist) {
			return 0, "", errors.New("FILE_NOT_FOUND: the upload file does not exist on this device.")
		}
		return 0, "", e
	}
	if !st.Mode().IsRegular() {
		return 0, "", errors.New("Upload path must be a regular file.")
	}
	limit, ok := uploadLimits[strings.ToLower(filepath.Ext(path))]
	if !ok {
		return 0, "", errors.New("UNSUPPORTED_UPLOAD_TYPE: browser_runner uploads " + uploadTypesText + ".")
	}
	if st.Size() == 0 || st.Size() > limit {
		return 0, "", fmt.Errorf("UPLOAD_SIZE_LIMIT: %s files must be between 1 byte and %d MB.", strings.TrimPrefix(strings.ToLower(filepath.Ext(path)), "."), limit>>20)
	}
	f, e := os.Open(path)
	if e != nil {
		return 0, "", e
	}
	defer f.Close()
	h := sha256.New()
	if _, e := io.Copy(h, f); e != nil {
		return 0, "", e
	}
	return st.Size(), hex.EncodeToString(h.Sum(nil)), nil
}

func (s *session) upload(ctx context.Context, snapshotID, ref, path string) (map[string]any, error) {
	size, digest, e := fileDigest(path)
	if e != nil {
		return nil, e
	}
	frameID, e := s.refFrame(ref)
	if e != nil {
		return nil, e
	}
	cdpSession := s.frameSession(frameID)
	r, e := s.helperIn(ctx, frameID, "file_input", map[string]any{"snapshot_id": snapshotID, "ref": ref}, false)
	if e != nil {
		return nil, e
	}
	if r.Result.ObjectID == "" {
		return nil, errors.New("browser_runner could not resolve the file input.")
	}
	defer s.conn.FireIn(cdpSession, "Runtime.releaseObject", map[string]any{"objectId": r.Result.ObjectID})
	if e := s.conn.CallIn(ctx, cdpSession, "DOM.setFileInputFiles", map[string]any{"files": []string{path}, "objectId": r.Result.ObjectID}, nil); e != nil {
		return nil, e
	}
	r, e = s.helperIn(ctx, frameID, "file_state", map[string]any{"snapshot_id": snapshotID, "ref": ref}, true)
	if e != nil {
		return nil, e
	}
	var st struct {
		Files []struct {
			Name string `json:"name"`
			Size int64  `json:"size"`
		} `json:"files"`
		Label string `json:"label"`
	}
	_ = json.Unmarshal(r.Result.Value, &st)
	name := filepath.Base(path)
	status := "not_attached"
	for _, f := range st.Files {
		if f.Name == name && f.Size == size {
			status = "attached"
		}
	}
	up := Upload{Field: clip(st.Label, 120), File: name, Bytes: size, SHA256: digest, Status: status, At: stamp(s.m.now())}
	s.cp.Uploads = append(s.cp.Uploads, up)
	if status != "attached" {
		return nil, errors.New("UPLOAD_NOT_ATTACHED: the page did not keep the file. Take a new snapshot and check the field.")
	}
	return map[string]any{"upload": up}, nil
}

func (s *session) probeText(ctx context.Context, text string) (bool, map[string]any) {
	r, e := s.helper(ctx, "probe", map[string]any{"text": text}, true)
	if e != nil {
		return false, nil
	}
	var p map[string]any
	_ = json.Unmarshal(r.Result.Value, &p)
	found, _ := p["text_found"].(bool)
	return found, p
}
