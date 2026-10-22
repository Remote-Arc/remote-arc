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
	scope    scope
	proc     *browserProcess
	conn     *cdpConn
	lastUsed time.Time

	ev           sync.Mutex
	mainFrame    string
	worldCtx     int
	epoch        int
	loads        int  // main-frame loads started; moves before a navigation commits
	loading      bool // main frame is loading (including blocked attempts)
	flushedEpoch int
	href         string
	submitting   bool
	dialogs      []string
	blocked      []Blocked

	frames   map[string]*frameInfo // child frames, guarded by ev
	frameSeq int

	snapshotID    string
	snapshotEpoch int
	snapshotSeq   int
	snapFrames    map[string]string // ref prefix (f1, f2...) -> frame id for the latest snapshot
}

func (s *session) live() bool { return s.conn != nil && s.conn.Alive() }

func (s *session) onEvent(cdpSession, method string, raw json.RawMessage) {
	if cdpSession != "" {
		s.onChildEvent(cdpSession, method, raw)
		return
	}
	switch method {
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
			}
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
	exe, e := s.m.findBrowser()
	if e != nil {
		return e
	}
	proc, e := launchBrowser(ctx, exe, profilePath(s.cp.Profile), s.cp.Headless)
	if e != nil {
		return e
	}
	ws, e := proc.pageTarget(ctx)
	if e != nil {
		proc.stop()
		return e
	}
	conn, e := dialCDP(ctx, ws, s.onEvent)
	if e != nil {
		proc.stop()
		return e
	}
	s.proc, s.conn = proc, conn
	s.ev.Lock()
	s.worldCtx, s.mainFrame, s.href = 0, "", ""
	s.frames = map[string]*frameInfo{}
	s.ev.Unlock()
	s.snapFrames = nil
	if e := s.setup(ctx); e != nil {
		s.shutdownBrowser(false)
		return e
	}
	if s.cp.recover(s.m.now()) {
		s.cp.receipt(s.m.now(), Receipt{Tool: "browser_runner_start", Outcome: "recovered", Detail: "an in-flight submit was interrupted; its effect is now unknown"})
	}
	if !s.cp.Headless {
		_ = s.conn.Call(ctx, "Page.bringToFront", nil, nil)
	}
	if s.cp.ResumeURL != "" && s.scope.Allows(s.cp.ResumeURL) && !strings.HasPrefix(s.currentHref(), "http") {
		_, _ = s.navigate(ctx, s.cp.ResumeURL)
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
		{"Page.addScriptToEvaluateOnNewDocument", map[string]any{"source": "void 0", "worldName": worldName}},
		{"DOM.enable", nil},
		// Cross-site iframes run in their own process; attach to them so
		// embedded forms can be read and filled.
		{"Target.setAutoAttach", map[string]any{"autoAttach": true, "waitForDebuggerOnStart": true, "flatten": true}},
	}
	for _, c := range calls {
		if e := s.conn.Call(ctx, c.method, c.params, nil); e != nil {
			return fmt.Errorf("browser_runner setup failed (%s): %w", c.method, e)
		}
	}
	// Downloads are not part of the delegated surface.
	_ = s.conn.Call(ctx, "Page.setDownloadBehavior", map[string]any{"behavior": "deny"}, nil)
	var tree struct {
		FrameTree struct {
			Frame struct {
				ID  string `json:"id"`
				URL string `json:"url"`
			} `json:"frame"`
		} `json:"frameTree"`
	}
	if e := s.conn.Call(ctx, "Page.getFrameTree", nil, &tree); e != nil {
		return e
	}
	s.ev.Lock()
	s.mainFrame, s.href = tree.FrameTree.Frame.ID, tree.FrameTree.Frame.URL
	s.ev.Unlock()
	_, _ = s.evaluateMain(ctx, pageJS+`("install", {})`)
	return nil
}

func (s *session) shutdownBrowser(markPaused bool) {
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
		s.cp.ResumeURL = s.href
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

type navMark struct{ epoch, loads int }

func (s *session) mark() navMark {
	s.ev.Lock()
	defer s.ev.Unlock()
	return navMark{s.epoch, s.loads}
}

// waitSettled waits for a navigation that may follow an action, then for the
// document to finish loading. expectNav widens the window in which a
// navigation is allowed to start.
func (s *session) waitSettled(ctx context.Context, mark navMark, expectNav bool) bool {
	start := time.Now()
	navWindow := 400 * time.Millisecond
	if expectNav {
		navWindow = 2500 * time.Millisecond
	}
	navigated := false
	for time.Since(start) < 20*time.Second {
		if ctx.Err() != nil || !s.live() {
			return navigated
		}
		s.ev.Lock()
		navigated = s.epoch != mark.epoch
		started := navigated || s.loads != mark.loads
		loading := s.loading
		s.ev.Unlock()
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
	s.waitSettled(ctx, before, true)
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
					s.waitSettled(ctx, before, true)
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
	r, e := s.helper(ctx, "snapshot", map[string]any{"snapshot_id": id, "max_elements": maxElements, "max_text": maxText}, true)
	if e != nil {
		return nil, e
	}
	var page map[string]any
	if e := json.Unmarshal(r.Result.Value, &page); e != nil {
		return nil, e
	}
	s.snapshotID, s.snapshotEpoch = id, epoch
	elements, _ := page["elements"].([]any)
	s.snapshotFrames(ctx, page, id, maxElements-len(elements), maxText)
	if t, ok := page["title"].(string); ok {
		s.cp.Title = t
	}
	blockers, _ := page["blockers"].([]any)
	if len(blockers) > 0 {
		kinds := []string{}
		for _, b := range blockers {
			if m, ok := b.(map[string]any); ok {
				kinds = append(kinds, fmt.Sprint(m["kind"]))
			}
		}
		s.cp.State = StateNeedsUser
		s.cp.NeedsUser = "The page needs the user (" + strings.Join(kinds, ", ") + "). Sign-in, verification codes and CAPTCHAs are completed by the user in the Runner browser window"
		if s.cp.Headless {
			s.cp.NeedsUser += "; call browser_runner_start with headless=false to show it"
		}
		s.cp.NeedsUser += "."
	} else if s.cp.State == StateNeedsUser {
		s.cp.State, s.cp.NeedsUser = StateActive, ""
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
}

// act performs one input action. dispatched reports whether any input may
// have reached the page, which decides between not_dispatched and unknown.
func (s *session) act(ctx context.Context, a actRequest) (result map[string]any, dispatched bool, err error) {
	ref := map[string]any{"snapshot_id": a.SnapshotID, "ref": a.Ref, "action": a.Action}
	result = map[string]any{"action": a.Action}
	frameID, e := s.refFrame(a.Ref)
	if e != nil {
		return nil, false, e
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
			result["note"] = "element was covered; a direct element click was used"
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
	case "check", "uncheck":
		dispatched = true
		r, e := s.helperIn(ctx, frameID, "check", map[string]any{"snapshot_id": a.SnapshotID, "ref": a.Ref, "checked": a.Action == "check"}, true)
		if e != nil {
			return nil, !strings.HasPrefix(e.Error(), "STALE_REF") && !strings.HasPrefix(e.Error(), "WRONG_ACTION"), e
		}
		var c map[string]any
		_ = json.Unmarshal(r.Result.Value, &c)
		result["checked"] = c["checked"]
	case "press":
		k, ok := keys[a.Key]
		if !ok {
			return nil, false, errors.New("press key must be one of Enter, Tab, Escape, ArrowDown, ArrowUp, Space.")
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
		return nil, false, errors.New("action must be click, fill, select, check, uncheck, press, navigate, upload or wait.")
	}
	return result, dispatched, nil
}

var uploadTypes = map[string]bool{".pdf": true, ".doc": true, ".docx": true, ".txt": true, ".rtf": true, ".odt": true, ".png": true, ".jpg": true, ".jpeg": true}

const maxUpload = 25 << 20

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
	if st.Size() == 0 || st.Size() > maxUpload {
		return 0, "", fmt.Errorf("Upload files must be between 1 byte and %d MB.", maxUpload>>20)
	}
	if !uploadTypes[strings.ToLower(filepath.Ext(path))] {
		return 0, "", errors.New("browser_runner uploads documents and images only (pdf, doc, docx, txt, rtf, odt, png, jpg).")
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
