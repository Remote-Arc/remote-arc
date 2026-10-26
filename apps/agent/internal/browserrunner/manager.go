// Package browserrunner gives the Go Agent a task-scoped browser: an
// isolated Chrome/Edge/Chromium profile driven over the DevTools protocol.
// It is part of the Agent, not a separate agent: calls arrive over the same
// Relay connection, under the same device policy, and are journaled the same
// way. Reasoning stays in the caller's own AI host.
package browserrunner

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/policy"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// Tools is the device tool contract. Names are stable across AI hosts.
var Tools = []string{
	"browser_runner_start", "browser_runner_snapshot", "browser_runner_act",
	"browser_runner_status", "browser_runner_confirm", "browser_runner_close", "browser_runner_wait",
}

func IsTool(name string) bool {
	for _, t := range Tools {
		if t == name {
			return true
		}
	}
	return false
}

const maxLiveSessions = 4

// CallBudget bounds one tool call end to end.
var CallBudget = 40 * time.Second

type Manager struct {
	mu                sync.Mutex
	sessions          map[string]*session
	findBrowser       func() (string, error)
	now               func() time.Time
	IdleTimeout       time.Duration
	UserActionTimeout time.Duration
	attentionMode     string
	attentionEvents   map[string]Attention
	frames            chan ViewFrame
	videoSignals      chan VideoSignal
	reaper            sync.Once
	stop              chan struct{}
	your              *yourChrome // the shared connection to the user's own Chrome, when a task uses it
}

func New() *Manager {
	return &Manager{sessions: map[string]*session{}, findBrowser: FindBrowser, now: time.Now, IdleTimeout: 20 * time.Minute, UserActionTimeout: 2 * time.Hour, attentionEvents: map[string]Attention{}, frames: make(chan ViewFrame, 2), videoSignals: make(chan VideoSignal, 16), stop: make(chan struct{})}
}

// Available reports whether this device can run the browser_runner at all.
func (m *Manager) Available() bool { _, e := m.findBrowser(); return e == nil }

// ActiveSessions counts tasks with a running browser. A session busy with an
// action counts as active. Used only to warn before an Agent upgrade.
func (m *Manager) ActiveSessions() int {
	m.mu.Lock()
	list := make([]*session, 0, len(m.sessions))
	for _, s := range m.sessions {
		list = append(list, s)
	}
	m.mu.Unlock()
	active := 0
	for _, s := range list {
		if !s.mu.TryLock() {
			active++
			continue
		}
		if s.live() {
			active++
		}
		s.mu.Unlock()
	}
	return active
}

// Close stops every browser and keeps checkpoints so tasks can resume.
func (m *Manager) Close() {
	m.mu.Lock()
	select {
	case <-m.stop:
	default:
		close(m.stop)
	}
	list := make([]*session, 0, len(m.sessions))
	for _, s := range m.sessions {
		list = append(list, s)
	}
	your := m.your
	m.mu.Unlock()
	if your != nil {
		your.closeNow()
	}
	for _, s := range list {
		s.mu.Lock()
		s.shutdownBrowser(true)
		_ = s.flush()
		s.mu.Unlock()
	}
}

func (m *Manager) startReaper() {
	m.reaper.Do(func() {
		go func() {
			t := time.NewTicker(time.Second)
			nextReap := time.Now().Add(time.Minute)
			defer t.Stop()
			for {
				select {
				case <-m.stop:
					return
				case <-t.C:
					m.serviceViews()
					if time.Now().After(nextReap) {
						m.reapIdle()
						nextReap = time.Now().Add(time.Minute)
					}
				}
			}
		}()
	})
}

// reapIdle pauses sessions nobody has used for a while. The source AI may be
// gone (chat closed); the checkpoint lets a later turn resume.
func (m *Manager) reapIdle() {
	m.mu.Lock()
	list := []*session{}
	for _, s := range m.sessions {
		list = append(list, s)
	}
	m.mu.Unlock()
	for _, s := range list {
		if !s.mu.TryLock() {
			continue
		}
		limit, since := m.IdleTimeout, s.lastUsed
		if s.cp.State == StateNeedsUser {
			limit = m.UserActionTimeout
			if limit <= 0 {
				limit = 2 * time.Hour
			}
			if at, e := time.Parse(time.RFC3339Nano, s.cp.AttentionSince); e == nil {
				since = at
			}
			if s.live() && m.now().Sub(since) >= limit*9/10 && !s.cp.AttentionReminded {
				s.cp.AttentionReminded = true
				s.emitAttention("reminder")
				_ = s.flush()
				s.mu.Unlock()
				continue // A reminder always precedes collection by at least one reaper pass.
			}
		}
		if s.live() && m.now().Sub(since) > limit {
			s.shutdownBrowser(true)
			s.cp.receipt(m.now(), Receipt{Tool: "browser_runner_status", Outcome: "paused", Detail: "idle timeout; browser closed, checkpoint kept"})
			_ = s.flush()
		}
		s.mu.Unlock()
	}
}

func stringList(args map[string]any, key string) ([]string, error) {
	raw, ok := args[key]
	if !ok {
		return nil, nil
	}
	list, ok := raw.([]any)
	if !ok {
		if l, ok2 := raw.([]string); ok2 {
			return l, nil
		}
		return nil, fmt.Errorf("%s must be an array of strings.", key)
	}
	out := []string{}
	for _, v := range list {
		s, ok := v.(string)
		if !ok {
			return nil, fmt.Errorf("%s must be an array of strings.", key)
		}
		out = append(out, s)
	}
	return out, nil
}

func sessionID(args map[string]any, key string) (string, error) {
	id := protocol.OptionalString(args, key)
	if !idPattern.MatchString(id) {
		return "", fmt.Errorf("%s must be 1-100 characters of letters, digits, '-' or '_'.", key)
	}
	return id, nil
}

// Call dispatches one browser_runner tool. The returned value is serialized
// by the Agent like any other tool result.
func (m *Manager) Call(ctx context.Context, tool string, args map[string]any, p protocol.Policy) (any, error) {
	callStarted := time.Now()
	if args == nil {
		args = map[string]any{}
	}
	// Answer before the Relay's 45s device-call deadline. An interrupted
	// submit is recorded as unknown, never retried.
	ctx, cancel := context.WithTimeout(ctx, CallBudget)
	defer cancel()
	m.startReaper()
	if tool == "browser_runner_start" {
		return m.start(ctx, args)
	}
	if tool == "browser_runner_status" && protocol.OptionalString(args, "session_id") == "" {
		return m.list(), nil
	}
	id, e := sessionID(args, "session_id")
	if e != nil {
		return nil, e
	}
	s, e := m.get(id)
	if e != nil {
		return nil, e
	}
	if !lockSession(ctx, s) {
		if tool == "browser_runner_wait" {
			return map[string]any{"state": "timeout", "waited_ms": time.Since(callStarted).Milliseconds(), "reason": "The session is busy with another call.", "next_action": "Call browser_runner_wait again after the active call returns."}, nil
		}
		return nil, ctx.Err()
	}
	defer s.mu.Unlock()
	s.lastUsed = m.now()
	if tool == "browser_runner_status" {
		return s.cp.Summary(s.live()), nil
	}
	if tool == "browser_runner_close" {
		return m.close(ctx, s, args)
	}
	if s.cp.State == StateClosed {
		return nil, errors.New("Session is closed. Call browser_runner_start with the same task_id to reopen it.")
	}
	if e := s.ensureLive(ctx); e != nil {
		return nil, e
	}
	s.keepHidden(ctx)
	blockedBefore := len(s.cp.Blocked)
	var out map[string]any
	hidAgain := false
	switch tool {
	case "browser_runner_wait":
		out, e = m.waitUntil(ctx, s, args)
	case "browser_runner_snapshot":
		maxEl, e1 := protocol.Integer(args, "max_elements", 150, 10, 400)
		maxText, e2 := protocol.Integer(args, "max_text", 6000, 500, 20000)
		if e = errors.Join(e1, e2); e == nil {
			out, e = s.snapshot(ctx, maxEl, maxText)
		}
	case "browser_runner_act":
		hidAgain = s.hideAfterUser(ctx)
		// One action tool keeps the surface small for every AI host:
		// page actions on snapshot refs, plus navigate, upload and wait.
		switch protocol.OptionalString(args, "action") {
		case "navigate":
			out, e = s.navigate(ctx, protocol.OptionalString(args, "url"))
			if e == nil {
				s.scanAfterAction(ctx)
				s.cp.receipt(m.now(), Receipt{Tool: tool, Action: "navigate", URL: safeURL(fmt.Sprint(out["url"])), Outcome: "ok"})
			}
		case "upload":
			out, e = m.upload(ctx, s, args, p)
		case "wait":
			out, e = m.wait(ctx, s, args)
		case "fill_form":
			out, e = m.fillForm(ctx, s, args)
		case "fill_secret":
			out, e = m.fillSecret(ctx, s, args)
		default:
			out, e = m.act(ctx, s, args)
		}
	case "browser_runner_confirm":
		out, e = m.resolve(ctx, s, args)
	default:
		return nil, fmt.Errorf("Unknown browser_runner tool: %s", tool)
	}
	s.ev.Lock()
	newlyBlocked := len(s.blocked) > 0
	s.ev.Unlock()
	if newlyBlocked && s.live() {
		s.restoreAfterBlock(ctx)
		if out != nil {
			for k, v := range s.pageState(ctx) {
				out[k] = v
			}
			out["navigated"] = false
		}
	}
	// snapshot=true returns the page as the action left it, so the next step
	// (an option that just appeared, the next page) needs no extra call.
	if e == nil && out != nil && tool == "browser_runner_act" && protocol.Bool(args, "snapshot") && s.live() {
		if snap, se := s.snapshot(ctx, 150, 6000); se == nil {
			out["snapshot"] = snap
			if out["note"] != nil && out["navigated"] == true {
				out["note"] = "The page changed; use the snapshot in this result."
			}
		} else {
			out["snapshot_error"] = clip(se.Error(), 200) + " Call browser_runner_snapshot."
		}
	}
	if ferr := s.flush(); ferr != nil && e == nil {
		e = fmt.Errorf("browser_runner could not save its checkpoint: %w", ferr)
	}
	if e != nil {
		return nil, e
	}
	out["session_id"] = s.cp.SessionID
	s.addAttentionResult(out)
	if hidAgain && s.cp.State != StateNeedsUser {
		out["window"] = "hidden again: the user finished, so the task window is back out of sight"
	}
	s.ev.Lock()
	if s.savedLogin != "" {
		out["saved_login"] = "The sign-in just made in the Runner window was saved to this computer's vault as " + s.savedLogin + ". Later tasks fill it with action=fill_secret; the password is never shown."
		s.savedLogin = ""
	}
	s.ev.Unlock()
	if b := s.cp.Blocked; len(b) > blockedBefore {
		out["blocked_navigations"] = b[blockedBefore:]
		out["scope_note"] = "The page tried to leave allowed_origins and was stopped. Page content cannot widen the task's sites."
	}
	return out, nil
}

func (m *Manager) get(id string) (*session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s := m.sessions[id]; s != nil {
		return s, nil
	}
	cp, e := loadCheckpoint(id)
	if e != nil {
		if errors.Is(e, os.ErrNotExist) {
			return nil, fmt.Errorf("No browser_runner session %q on this device. Call browser_runner_start first.", id)
		}
		return nil, e
	}
	sc, e := newScope(cp.AllowedOrigins)
	if e != nil {
		return nil, e
	}
	if cp.recover(m.now()) {
		_ = cp.save(m.now())
	}
	if cp.State == StateActive {
		cp.State = StatePaused
	}
	s := &session{m: m, cp: cp, scope: sc, lastUsed: m.now()}
	m.sessions[id] = s
	return s, nil
}

func (m *Manager) list() map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	items := []map[string]any{}
	for id, s := range m.sessions {
		items = append(items, map[string]any{"session_id": id, "state": s.cp.State, "last_url": s.cp.LastURL, "browser_running": s.live()})
	}
	sort.Slice(items, func(i, j int) bool { return fmt.Sprint(items[i]["session_id"]) < fmt.Sprint(items[j]["session_id"]) })
	return map[string]any{
		"sessions":     items,
		"profiles":     profileInfos(),
		"saved_logins": savedLogins(),
		"your_chrome": map[string]any{
			"ready":     YourChromeReady(),
			"connected": m.your != nil && m.your.connected(),
		},
		"note": "sessions lists tasks open in this Agent run; profiles lists the browser profiles on this computer with the tasks and sites used in each. A profile keeps its sign-ins: pass the same profile to browser_runner_start (for example the person's name) to continue signed in, even from a new conversation. Any task listed can be reopened with browser_runner_start and its task_id. saved_logins are sign-ins kept on this computer (names, sites, masked usernames; never passwords): fill them with action=fill_secret. your_chrome.ready means the user's own Chrome is open to Remote Arc (browser=your_chrome works without setup); connected means Remote Arc is attached to it now.",
	}
}

func (m *Manager) liveCount(except string, profile string) (int, bool) {
	n, clash := 0, false
	for id, s := range m.sessions {
		if id == except {
			continue
		}
		if s.live() {
			n++
		}
		// Tasks in the user's own Chrome each have their own tab there.
		if profile != yourChromeProfile && s.cp.Profile == profile && s.cp.State != StateClosed && s.live() {
			clash = true
		}
	}
	return n, clash
}

func (m *Manager) start(ctx context.Context, args map[string]any) (any, error) {
	id, e := sessionID(args, "task_id")
	if e != nil {
		return nil, e
	}
	origins, e := stringList(args, "allowed_origins")
	if e != nil {
		return nil, e
	}
	sc, e := newScope(origins)
	if e != nil {
		return nil, e
	}
	s, e := m.get(id)
	resumed := e == nil
	if e != nil && !strings.HasPrefix(e.Error(), "No browser_runner session") {
		return nil, e
	}
	// browser=your_chrome runs the task in the user's own Chrome, signed in
	// as they are; runner (the default) in a Runner window with its own
	// profile.
	browser := protocol.OptionalString(args, "browser")
	if browser == "" {
		browser = browserRunner
		if resumed && s.cp.Browser == browserYourChrome {
			browser = browserYourChrome
		}
	}
	if browser != browserRunner && browser != browserYourChrome {
		return nil, errors.New(`browser must be "runner" or "your_chrome".`)
	}
	profile := protocol.OptionalString(args, "profile")
	if profile == "" && resumed {
		profile = s.cp.Profile
	}
	if browser == browserYourChrome {
		if profile != "" && profile != yourChromeProfile {
			return nil, errors.New("A task in the user's own Chrome uses the user's own sign-ins; leave profile out.")
		}
		profile = yourChromeProfile
	} else if profile == yourChromeProfile {
		return nil, errors.New(`profile "your-chrome" is the user's own Chrome; pass browser="your_chrome" instead.`)
	}
	if profile == "" {
		profile = id
	}
	if !idPattern.MatchString(profile) {
		return nil, errors.New("profile must be 1-100 characters of letters, digits, '-' or '_'.")
	}
	// The task window is hidden unless headless=false asks to show it;
	// headless left out keeps a running task as it is.
	headless, chosen := true, false
	if v, ok := args["headless"].(bool); ok {
		headless, chosen = v, true
	}
	if browser == browserYourChrome {
		if chosen && headless {
			return nil, errors.New("The user's own Chrome is always visible; leave headless out.")
		}
		headless, chosen = false, false
	}
	startURL := protocol.OptionalString(args, "start_url")
	if startURL != "" && !sc.Allows(startURL) {
		return nil, fmt.Errorf("OUT_OF_SCOPE: start_url %s is not in allowed_origins.", originOf(startURL))
	}
	reason := strings.TrimSpace(protocol.OptionalString(args, "scope_change_reason"))

	m.mu.Lock()
	n, clash := m.liveCount(id, profile)
	if clash {
		m.mu.Unlock()
		return nil, fmt.Errorf("Profile %q is already open in another browser_runner session. Close it first or use a different profile.", profile)
	}
	if n >= maxLiveSessions {
		m.mu.Unlock()
		return nil, fmt.Errorf("At most %d browser_runner sessions can run at once on this device. Close one first.", maxLiveSessions)
	}
	if s == nil {
		now := m.now()
		s = &session{m: m, scope: sc, lastUsed: now, cp: &Checkpoint{
			Version: checkpointVersion, SessionID: id, Profile: profile, AllowedOrigins: sc.Strings(),
			Headless: headless, Browser: map[bool]string{true: browserYourChrome, false: ""}[browser == browserYourChrome], State: StateActive, Receipts: []Receipt{}, Uploads: []Upload{},
			Effects: []Effect{}, Blocked: []Blocked{}, CreatedAt: stamp(now),
		}}
		m.sessions[id] = s
	}
	m.mu.Unlock()

	s.mu.Lock()
	defer s.mu.Unlock()
	s.lastUsed = m.now()
	if resumed {
		if s.cp.Profile != profile || (s.cp.Browser == browserYourChrome) != (browser == browserYourChrome) {
			return nil, errors.New("A session keeps its browser and profile. Close it with forget=true to start over in another.")
		}
		if !s.scope.covers(sc) {
			if reason == "" || args["scope_change_approved"] != true {
				return nil, fmt.Errorf("SCOPE_CHANGE_REQUIRED: this task is limited to %v. Adding sites requires a one-time approval for the exact origins in the Dashboard; a model-provided reason is not authorization.", s.scope.Strings())
			}
			merged, _ := newScope(append(s.scope.Strings(), sc.Strings()...))
			s.cp.receipt(m.now(), Receipt{Tool: "browser_runner_start", Outcome: "scope_widened", Detail: clip(reason, 200) + " → " + strings.Join(merged.Strings(), ", ")})
			s.ev.Lock()
			s.scope = merged
			s.ev.Unlock()
			s.cp.AllowedOrigins = merged.Strings()
		}
		if chosen && headless && s.cp.State == StateNeedsUser {
			return nil, errors.New("RUNNER_USER_ACTION_PENDING: finish the user handoff before hiding the task window.")
		}
		if chosen && s.cp.Headless != headless {
			switch {
			case s.live() && s.hasWindow():
				// Shown or hidden in place: the page and what was entered stay.
				if e := s.setVisible(ctx, !headless); e != nil {
					return nil, fmt.Errorf("browser_runner could not %s the task window: %w", map[bool]string{true: "hide", false: "show"}[headless], e)
				}
				s.cp.Headless = headless
				s.shownForUser = !headless && s.cp.State == StateNeedsUser
			case !headless && !hasDisplay():
				return nil, errNoWindow
			default:
				s.shutdownBrowser(false)
				s.cp.Headless = headless
				s.shownForUser = !headless && s.cp.State == StateNeedsUser
			}
		}
		if s.cp.State == StateClosed {
			s.cp.State = StatePaused
		}
	}
	if e := s.ensureLive(ctx); e != nil {
		_ = s.flush()
		return nil, e
	}
	out := map[string]any{}
	if startURL != "" {
		out, e = s.navigate(ctx, startURL)
		if e != nil {
			_ = s.flush()
			return nil, e
		}
	} else {
		out = s.pageState(ctx)
	}
	s.cp.receipt(m.now(), Receipt{Tool: "browser_runner_start", URL: safeURL(fmt.Sprint(out["url"])), Outcome: map[bool]string{true: "resumed", false: "started"}[resumed]})
	if e := s.flush(); e != nil {
		return nil, e
	}
	out["session_id"] = id
	out["resumed"] = resumed
	out["profile"] = s.cp.Profile
	out["headless"] = s.cp.Headless
	if s.cp.Browser != browserYourChrome {
		switch {
		case !s.hasWindow():
			out["window"] = "none: this computer has no display, so the browser runs without a window"
		case s.cp.Headless:
			out["window"] = "hidden: the task runs out of sight and never takes the user's focus"
		default:
			out["window"] = "on screen"
		}
	}
	if s.cp.Browser == browserYourChrome {
		out["browser"] = browserYourChrome
		out["note"] = "This task runs in its own window of the user's Chrome, signed in as the user is. Chrome shows that it is being controlled while Remote Arc is connected. Closing the task closes only its window's tab."
	} else {
		out["browser"] = browserRunner
	}
	out["status"] = s.cp.Summary(true)
	return out, nil
}

func (m *Manager) act(ctx context.Context, s *session, args map[string]any) (map[string]any, error) {
	// A known submit key is answered from the checkpoint before anything
	// else: retries after a navigation must never reach the page again.
	if protocol.OptionalString(args, "effect") == "submit" {
		key := protocol.OptionalString(args, "idempotency_key")
		if prev := s.cp.effect(key); prev != nil && prev.Status != EffectNotDispatched && !s.stillUnsent(prev) {
			return map[string]any{"replayed": true, "effect": *prev, "note": "This submit was already sent; it was not repeated."}, nil
		}
	}
	snap := protocol.OptionalString(args, "snapshot_id")
	if e := s.checkSnapshot(snap); e != nil {
		return nil, e
	}
	value, hasValue := args["value"].(string)
	if hasValue && len(value) > 10000 {
		return nil, errors.New("value must be at most 10000 characters.")
	}
	req := actRequest{SnapshotID: snap, Ref: protocol.OptionalString(args, "ref"), Action: protocol.OptionalString(args, "action"), Value: value, HasValue: hasValue, Key: protocol.OptionalString(args, "key")}
	if req.Ref == "" && req.Action != "press" {
		return nil, errors.New("ref is required.")
	}
	effect := protocol.OptionalString(args, "effect")
	if effect == "" {
		effect = "none"
	}
	if effect != "none" && effect != "navigation" && effect != "submit" {
		return nil, errors.New("effect must be none, navigation or submit.")
	}
	// A model can omit effect=submit or mislabel a submit as navigation.
	// Fail closed for native form submits and suspicious action labels before
	// dispatch. Unknown JavaScript side effects remain a documented limitation.
	if req.Action == "press" && req.Key == "Enter" && effect != "submit" {
		return nil, errors.New("SUBMIT_EFFECT_REQUIRED: Enter can submit a form; use effect=submit and a stable idempotency_key, or a non-submitting action.")
	}
	// target identifies what a submit acts on (form, control, fields), so
	// one action is never sent twice under different idempotency keys.
	target, targetLabel := "", ""
	mayNavigate := false
	kind := ""
	if (req.Action == "click" || req.Action == "press") && req.Ref != "" {
		frameID, e := s.refFrame(req.Ref)
		if e != nil {
			return nil, e
		}
		risk, e := s.helperIn(ctx, frameID, "effect_risk", map[string]any{"snapshot_id": snap, "ref": req.Ref}, true)
		if e != nil {
			return nil, e
		}
		var classification struct {
			RequiresSubmit bool            `json:"requires_submit"`
			MayNavigate    bool            `json:"may_navigate"`
			Kind           string          `json:"kind"`
			Target         json.RawMessage `json:"target"`
		}
		if e := json.Unmarshal(risk.Result.Value, &classification); e != nil || len(classification.Target) == 0 {
			return nil, errors.New("browser_runner could not classify this control, so it was not clicked. Take a new snapshot and try again.")
		}
		mayNavigate = classification.MayNavigate
		kind = classification.Kind
		if req.Action == "click" && classification.RequiresSubmit && effect != "submit" {
			return nil, errors.New("SUBMIT_EFFECT_REQUIRED: this control may submit data. Use effect=submit and a stable idempotency_key; navigation/none cannot bypass the submit ledger.")
		}
		target = submitTarget(req.Action, classification.Target)
		var described struct {
			Label string `json:"label"`
		}
		_ = json.Unmarshal(classification.Target, &described)
		targetLabel = described.Label
	} else if effect == "submit" {
		target = submitTarget(req.Action, []byte(strconvQuote(safeURL(s.currentHref())+" "+req.Key)))
	}
	// Signing in (an identifier, a password or code the user typed) is
	// repeated whenever a session expires; it is never a one-time submit.
	signIn := kind == "auth"
	if signIn && effect == "submit" {
		effect = "navigation"
	}
	req.Effect = effect
	var eff *Effect
	var before stepView
	if effect == "submit" {
		key := protocol.OptionalString(args, "idempotency_key")
		if !keyPattern.MatchString(key) {
			return nil, errors.New("A submit needs idempotency_key (1-120 letters, digits, '.', '_', ':' or '-'), stable for this one external action.")
		}
		if u := s.blocking(key); u != nil {
			return nil, fmt.Errorf("UNRESOLVED_EFFECT: submit %s (%s) is %s. Confirm its result with browser_runner_confirm before any new submit.", u.Key, u.Label, u.Status)
		}
		if kind == "step" {
			// One page of a longer form may be saved again (errors to fix,
			// a resumed draft), a bounded number of times.
			if n := s.cp.stepSends(target); n >= maxStepSends {
				return nil, fmt.Errorf("SUBMIT_ALREADY_RECORDED: this form step was already sent %d times in this task. It is not sent again; ask the user to check the page.", n)
			}
		} else if prev := s.cp.sentTo(target, key); prev != nil {
			// A final submit is sent once: a new key must not resend what
			// this task already sent. Other steps have other targets.
			return nil, fmt.Errorf("SUBMIT_ALREADY_RECORDED: this task already sent the same submit as %s (%s). It is not sent again under a new key; start a separately authorized task to send it again.", prev.Key, prev.Status)
		}
		effKind := ""
		if kind == "step" {
			effKind = "step"
		}
		now := stamp(m.now())
		if prev := s.cp.effect(key); prev != nil {
			prev.Status, prev.UpdatedAt, prev.URLBefore, prev.Target, prev.Kind, prev.SettledBy, prev.NothingSent = EffectInFlight, now, safeURL(s.currentHref()), target, effKind, "", false
			delete(s.unsent, key)
			eff = prev
		} else {
			s.cp.Effects = append(s.cp.Effects, Effect{Key: key, Action: req.Action, Label: clip(targetLabel, 120), Target: target, Kind: effKind, Status: EffectInFlight, URLBefore: safeURL(s.currentHref()), StartedAt: now, UpdatedAt: now})
			eff = &s.cp.Effects[len(s.cp.Effects)-1]
		}
		if effKind == "step" {
			before = s.stepState(ctx)
		}
		// Durable before the click: a crash now leaves an unknown effect,
		// never a silent duplicate.
		if e := s.flush(); e != nil {
			return nil, fmt.Errorf("browser_runner could not record the submit before sending it: %w", e)
		}
		s.ev.Lock()
		s.submitting = true
		s.ev.Unlock()
		defer func() { s.ev.Lock(); s.submitting = false; s.ev.Unlock() }()
	}
	frameID, _ := s.refFrame(req.Ref)
	_, domBefore, _ := s.domState(ctx, frameID)
	mark := s.mark()
	out, dispatched, err := s.act(ctx, req)
	navigated := false
	if dispatched && s.live() {
		navigated = s.settle(ctx, mark, frameID, domBefore, actPlan(req.Action, req.Key, effect, mayNavigate))
		// An action inside an embedded form changes that frame, not the page.
		if frameID != "" && !navigated && effect != "none" {
			s.settleFrame(ctx, frameID)
		}
	}
	if eff != nil {
		eff = s.cp.effect(eff.Key)
		eff.UpdatedAt = stamp(m.now())
		switch {
		case !dispatched:
			eff.Status = EffectNotDispatched
		case err != nil || !s.live():
			eff.Status = EffectUnknown
		default:
			eff.Status = EffectUnverified
			eff.URLAfter = safeURL(s.currentHref())
			s.settleEffect(ctx, eff, mark, navigated, frameID, before)
		}
		if l, ok := out["label"].(string); ok {
			eff.Label = clip(l, 120)
		}
	}
	if dispatched && s.live() && (effect == "submit" || effect == "navigation" || navigated) {
		s.scanAfterAction(ctx)
		if s.cp.State == StateNeedsUser && eff != nil {
			eff.Status, eff.NothingSent, eff.SettledBy, eff.Evidence = EffectUnverified, false, "", ""
			delete(s.unsent, eff.Key)
		}
	}
	rc := Receipt{Tool: "browser_runner_act", Action: req.Action, URL: safeURL(s.currentHref()), Outcome: "ok"}
	if l, ok := out["label"].(string); ok {
		rc.Label = clip(l, 120)
	}
	if err != nil {
		rc.Outcome, rc.Detail = "error", clip(err.Error(), 200)
	}
	s.cp.receipt(m.now(), rc)
	if err != nil {
		if eff != nil && eff.Status == EffectUnknown {
			return nil, fmt.Errorf("%v. The submit %s may have been sent; its effect is unknown. Do not submit again: inspect the page and use browser_runner_confirm.", err, eff.Key)
		}
		return nil, err
	}
	out["navigated"] = navigated
	for k, v := range s.pageState(ctx) {
		out[k] = v
	}
	if navigated {
		out["note"] = "The page changed; earlier refs are stale. Take a new browser_runner_snapshot."
	}
	if signIn {
		out["sign_in_step"] = "Sign-in step: not recorded as a one-time submit, so it can be repeated (for example after a session expires)."
	}
	if eff != nil {
		out["effect"] = *eff
		switch {
		case eff.NothingSent:
			out["next_action"] = "Nothing has left the page since this click: no request and no navigation. Check a new snapshot. If it shows a problem (an error, a required field), fix it and click again with the same idempotency_key; that resends only while nothing has left the page. If the click opened a verification or confirmation step, that step may still send it: let it finish and do not click again. If it only revealed part of the page, settle it with browser_runner_confirm outcome=not_submitted and text from the page."
		case eff.Status == EffectConfirmed && eff.SettledBy == "runner":
			out["next_action"] = "This step was saved and the next one opened (" + eff.Evidence + "); no browser_runner_confirm is needed. Take a snapshot and continue."
		case eff.Kind == "step":
			out["next_action"] = fmt.Sprintf("The form is still on the same step: check a new snapshot for errors, fix them and send the step again with a new idempotency_key (up to %d sends per step). This does not block other actions.", maxStepSends)
		default:
			out["next_action"] = "Read the page to confirm the result (for example a confirmation number), then call browser_runner_confirm with outcome=confirmed and that exact evidence text."
		}
	}
	if d := s.takeDialogs(); len(d) > 0 {
		out["dialogs"] = d
	}
	return out, nil
}

// settleEffect records what the page itself shows after a submit click on
// the top-level page. If nothing left the page (no request of any kind, no
// navigation), the effect stays unverified but is marked nothing_sent: the
// same key may be clicked again for as long as that stays true. It is never
// marked not sent, because a step the click opened (a CAPTCHA challenge, a
// confirmation) may still send it. If a form step was sent and the next step
// opened (its fields differ), the step is confirmed with the new page's
// heading. Everything else stays for the caller to confirm. Clicks inside
// embedded frames are not settled here: their requests are not observed.
func (s *session) settleEffect(ctx context.Context, eff *Effect, mark navMark, navigated bool, frameID string, before stepView) {
	if frameID != "" {
		return
	}
	s.ev.Lock()
	moved := s.loads != mark.loads || s.routes != mark.routes || s.epoch != mark.epoch
	s.ev.Unlock()
	if _, sent := s.pending(mark.at); !navigated && !moved && !sent {
		eff.NothingSent = true
		if s.unsent == nil {
			s.unsent = map[string]navMark{}
		}
		s.unsent[eff.Key] = mark
		return
	}
	if eff.Kind != "step" || !before.ok {
		return
	}
	if after := s.stepState(ctx); after.ok && after.Fields != before.Fields {
		eff.Status, eff.SettledBy, eff.Evidence = EffectConfirmed, "runner", clip(after.evidence(before), 300)
	}
}

// stillUnsent reports whether a submit that sent nothing at its click has
// still sent nothing: no request has left the page and it has not navigated
// since. Only this session's observation counts; after a restart the answer
// is no, and the submit is treated as possibly sent.
func (s *session) stillUnsent(e *Effect) bool {
	if s.cp.State == StateNeedsUser || !e.NothingSent || e.Status != EffectUnverified {
		return false
	}
	m, ok := s.unsent[e.Key]
	if !ok {
		return false
	}
	s.ev.Lock()
	moved := s.loads != m.loads || s.routes != m.routes || s.epoch != m.epoch
	s.ev.Unlock()
	if moved {
		return false
	}
	_, sent := s.pending(m.at)
	return !sent
}

// blocking returns a final submit that must be settled before another submit
// (other than a retry of key itself). Form steps and submits that have still
// sent nothing do not block.
func (s *session) blocking(key string) *Effect {
	for i := range s.cp.Effects {
		e := &s.cp.Effects[i]
		if e.Kind == "step" || e.Key == key || s.stillUnsent(e) {
			continue
		}
		switch e.Status {
		case EffectInFlight, EffectUnverified, EffectUnknown:
			return e
		}
	}
	return nil
}

// maxFormFields bounds one fill_form call.
const maxFormFields = 40

var refPattern = regexp.MustCompile(`^(f[1-9]\d?)?e[1-9]\d{0,3}$`)

// fillForm enters several fields from one snapshot in one call: fill,
// select, check and uncheck, in order. Each field goes through the same
// checks as a single act (sensitive and CAPTCHA fields are refused) and gets
// its own receipt. A field that fails is reported and the rest continue;
// nothing here can click, submit, navigate or upload, which stay single
// acts. If the page navigates, the remaining fields are not entered.
func (m *Manager) fillForm(ctx context.Context, s *session, args map[string]any) (map[string]any, error) {
	snap := protocol.OptionalString(args, "snapshot_id")
	if e := s.checkSnapshot(snap); e != nil {
		return nil, e
	}
	if eff := protocol.OptionalString(args, "effect"); eff != "" && eff != "none" {
		return nil, errors.New("fill_form never submits or navigates; send the submit or Next click as its own browser_runner_act after the fields.")
	}
	raw, _ := args["fields"].([]any)
	if len(raw) == 0 || len(raw) > maxFormFields {
		return nil, fmt.Errorf("fill_form needs fields: 1 to %d entries of {ref, action, value}.", maxFormFields)
	}
	steps := make([]actRequest, 0, len(raw))
	for i, r := range raw {
		f, ok := r.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("fields[%d] must be an object with ref, action and value.", i)
		}
		step := actRequest{SnapshotID: snap, Ref: protocol.OptionalString(f, "ref"), Action: protocol.OptionalString(f, "action"), Effect: "none"}
		step.Value, step.HasValue = f["value"].(string)
		switch step.Action {
		case "fill", "select", "check", "uncheck":
		default:
			return nil, fmt.Errorf("fields[%d].action must be fill, select, check or uncheck. Clicks, keys, uploads and submits are separate browser_runner_act calls.", i)
		}
		if !refPattern.MatchString(step.Ref) {
			return nil, fmt.Errorf("fields[%d].ref must be a ref from the snapshot, such as e12.", i)
		}
		if (step.Action == "fill" || step.Action == "select") && !step.HasValue {
			return nil, fmt.Errorf("fields[%d] (%s) needs value.", i, step.Action)
		}
		if len(step.Value) > 10000 {
			return nil, fmt.Errorf("fields[%d].value must be at most 10000 characters.", i)
		}
		steps = append(steps, step)
	}
	before := s.mark()
	results := make([]map[string]any, 0, len(steps))
	entered, failed := 0, 0
	var stopped string
	for i, step := range steps {
		if dl, ok := ctx.Deadline(); ok && time.Until(dl) < 4*time.Second {
			stopped = fmt.Sprintf("Out of time for this call at fields[%d]; send the remaining fields in another fill_form.", i)
			break
		}
		if e := s.checkSnapshot(snap); e != nil {
			stopped = fmt.Sprintf("The page changed before fields[%d]; the remaining fields were not entered. Take a new snapshot.", i)
			break
		}
		frameID, _ := s.refFrame(step.Ref)
		_, domBefore, _ := s.domState(ctx, frameID)
		mark := s.mark()
		out, dispatched, err := s.act(ctx, step)
		rc := Receipt{Tool: "browser_runner_act", Action: step.Action, URL: safeURL(s.currentHref()), Outcome: "ok"}
		res := map[string]any{"ref": step.Ref, "action": step.Action}
		if l, ok := out["label"].(string); ok {
			rc.Label = clip(l, 120)
			res["label"] = l
		}
		for _, k := range []string{"selected", "checked", "value_length", "frame"} {
			if v, ok := out[k]; ok {
				res[k] = v
			}
		}
		if err != nil {
			rc.Outcome, rc.Detail = "error", clip(err.Error(), 200)
			res["error"] = err.Error()
			failed++
		} else {
			res["ok"] = true
			entered++
		}
		s.cp.receipt(m.now(), rc)
		results = append(results, res)
		// Let the page react (validation, fields that appear) before the
		// next field; a navigation ends the batch.
		if dispatched && s.live() && s.settle(ctx, mark, frameID, domBefore, settleStep) {
			if i+1 < len(steps) {
				stopped = fmt.Sprintf("The page navigated after fields[%d]; the remaining fields were not entered. Take a new snapshot.", i)
			}
			break
		}
	}
	navigated := false
	if s.live() {
		_, domBefore, _ := s.domState(ctx, "")
		navigated = s.settle(ctx, before, "", domBefore, settleField)
		s.ev.Lock()
		navigated = navigated || s.epoch != before.epoch
		s.ev.Unlock()
	}
	out := map[string]any{"action": "fill_form", "fields": results, "entered": entered, "failed": failed, "navigated": navigated}
	if len(results) < len(steps) {
		rest := make([]string, 0, len(steps)-len(results))
		for _, st := range steps[len(results):] {
			rest = append(rest, st.Ref)
		}
		out["not_entered"] = rest
	}
	if stopped != "" {
		out["stopped"] = stopped
	}
	if failed > 0 {
		out["next_action"] = "Fix the fields with an error (see each error), then continue. Fields marked ok hold their values."
	}
	for k, v := range s.pageState(ctx) {
		out[k] = v
	}
	if navigated {
		out["note"] = "The page changed; earlier refs are stale. Take a new browser_runner_snapshot."
	}
	if d := s.takeDialogs(); len(d) > 0 {
		out["dialogs"] = d
	}
	return out, nil
}

// upload enforces Remote Arc device policy: files must sit inside a Trusted
// Location the user configured, and outside protected sensitive paths.
func (m *Manager) upload(ctx context.Context, s *session, args map[string]any, p protocol.Policy) (map[string]any, error) {
	snap := protocol.OptionalString(args, "snapshot_id")
	if e := s.checkSnapshot(snap); e != nil {
		return nil, e
	}
	p = protocol.Normalize(p)
	if len(p.WorkspaceRoots) == 0 && p.TaskWorkspaceRoot == "" {
		return nil, errors.New("browser_runner uploads only from a Trusted Location. Ask the user to add the folder that holds the document on this device in Remote Arc.")
	}
	raw := protocol.OptionalString(args, "path")
	if raw == "" {
		return nil, errors.New("path is required.")
	}
	target, e := policy.Enforce(raw, p, true)
	if e != nil {
		return nil, e
	}
	// Policy paths are case-folded on Windows. Upload the caller's own path so
	// the site receives the real file name, after proving it is the same file.
	original, e := filepath.Abs(policy.Expand(raw))
	if e != nil {
		return nil, e
	}
	if a, e1 := os.Stat(original); e1 == nil {
		if b, e2 := os.Stat(target); e2 != nil || !os.SameFile(a, b) {
			return nil, errors.New("Upload path could not be verified against the Trusted Location.")
		}
	}
	ref := protocol.OptionalString(args, "ref")
	frameID, _ := s.refFrame(ref)
	_, domBefore, _ := s.domState(ctx, frameID)
	before := s.mark()
	out, e := s.upload(ctx, snap, ref, original)
	if e == nil && s.live() {
		// Many forms read an uploaded resume and fill fields from it; let
		// that finish so the next snapshot shows the result.
		if s.settle(ctx, before, frameID, domBefore, settleUpload) {
			out["navigated"] = true
		}
	}
	rc := Receipt{Tool: "browser_runner_act", Action: "upload", Label: ref, URL: safeURL(s.currentHref()), Outcome: "ok"}
	if e != nil {
		rc.Outcome, rc.Detail = "error", clip(e.Error(), 200)
	}
	s.cp.receipt(m.now(), rc)
	return out, e
}

func (m *Manager) wait(ctx context.Context, s *session, args map[string]any) (map[string]any, error) {
	ms, e := protocol.Integer(args, "timeout_ms", 10000, 250, 30000)
	if e != nil {
		return nil, e
	}
	text := protocol.OptionalString(args, "text")
	urlPart := protocol.OptionalString(args, "url_contains")
	if len(text) > 200 || len(urlPart) > 300 {
		return nil, errors.New("text and url_contains are limited to 200 and 300 characters.")
	}
	deadline := m.now().Add(time.Duration(ms) * time.Millisecond)
	for {
		found, page := s.probeAll(ctx, text)
		href := s.currentHref()
		ok := (text == "" || found) && (urlPart == "" || strings.Contains(href, urlPart))
		if text == "" && urlPart == "" {
			ok = page != nil && page["ready"] == "complete"
		}
		if ok || !m.now().Before(deadline) || ctx.Err() != nil {
			out := s.pageState(ctx)
			out["matched"] = ok
			if d := s.takeDialogs(); len(d) > 0 {
				out["dialogs"] = d
			}
			return out, nil
		}
		time.Sleep(250 * time.Millisecond)
	}
}

// resolve settles an unverified or unknown submit. "confirmed" must be backed
// by evidence text that is present on the current page right now.
func (m *Manager) resolve(ctx context.Context, s *session, args map[string]any) (map[string]any, error) {
	key := protocol.OptionalString(args, "idempotency_key")
	eff := s.cp.effect(key)
	if eff == nil {
		return nil, errors.New("No submit with that idempotency_key in this session.")
	}
	outcome := protocol.OptionalString(args, "outcome")
	evidence := strings.TrimSpace(protocol.OptionalString(args, "evidence"))
	if len([]rune(evidence)) < 4 || len(evidence) > 300 {
		return nil, errors.New("evidence must be 4-300 characters copied exactly from the current page.")
	}
	found, _ := s.probeAll(ctx, evidence)
	switch outcome {
	case "confirmed":
		if !found {
			return nil, errors.New("EVIDENCE_NOT_FOUND: that text is not on the current page. The effect stays " + eff.Status + ".")
		}
		eff.Status, eff.Evidence, eff.URLAfter = EffectConfirmed, clip(evidence, 300), safeURL(s.currentHref())
	case "not_submitted":
		// Only the user can rule out a submit whose outcome is unknown; the
		// page alone cannot prove a request never reached the server.
		if eff.Status == EffectUnknown && !protocol.Bool(args, "user_confirmed") {
			return nil, errors.New("An unknown submit can be marked not_submitted only after the user checked it (user_confirmed=true).")
		}
		if !found {
			return nil, errors.New("EVIDENCE_NOT_FOUND: that text is not on the current page.")
		}
		eff.Status, eff.Evidence = EffectNotDispatched, clip("not submitted: "+evidence, 300)
	default:
		return nil, errors.New("outcome must be confirmed or not_submitted.")
	}
	eff.UpdatedAt = stamp(m.now())
	s.cp.receipt(m.now(), Receipt{Tool: "browser_runner_confirm", Label: eff.Key, URL: safeURL(s.currentHref()), Outcome: eff.Status})
	return map[string]any{"effect": *eff}, nil
}

func (m *Manager) close(ctx context.Context, s *session, args map[string]any) (any, error) {
	forget := protocol.Bool(args, "forget")
	force := protocol.Bool(args, "force")
	reason := strings.TrimSpace(protocol.OptionalString(args, "reason"))
	if force && (reason == "" || len(reason) > 200) {
		return nil, errors.New("force=true requires a reason of 1-200 characters.")
	}
	if (s.cp.State == StateNeedsUser || s.cp.unresolved() != nil) && !force {
		return nil, errors.New("RUNNER_USER_ACTION_PENDING: the task needs the user or has an unresolved submit. Use browser_runner_wait until=user_done, inspect the result and browser_runner_confirm before closing. To deliberately abandon it, use force=true with a reason.")
	}
	if force {
		s.cp.receipt(m.now(), Receipt{Tool: "browser_runner_close", Outcome: "forced", Detail: reason})
		if e := s.flush(); e != nil {
			return nil, e
		}
	}
	s.clearAttention()

	// A finished task closes its own tab in the user's Chrome; nothing else
	// there is touched.
	if page, ok := s.conn.(*yourPage); ok && page != nil {
		if e := page.closeTab(ctx); e != nil {
			return nil, e
		}
		s.cp.YourTab = ""
	}
	if s.cp.Browser == browserYourChrome && s.cp.YourTab != "" {
		m.mu.Lock()
		your := m.your
		m.mu.Unlock()
		if your != nil {
			closed, e := your.closeTabIfConnected(ctx, s.cp.YourTab)
			if e != nil {
				return nil, e
			}
			if closed {
				s.cp.YourTab = ""
			}
		}
	}
	tabLeftOpen := s.cp.Browser == browserYourChrome && s.cp.YourTab != ""
	s.shutdownBrowser(false)
	s.cp.State = StateClosed
	s.cp.receipt(m.now(), Receipt{Tool: "browser_runner_close", Outcome: "closed"})
	// Keep a closed checkpoint until forgetting succeeds, so an OS cleanup
	// failure can be retried without losing the profile's owning session.
	if e := s.flush(); e != nil {
		return nil, e
	}
	if !forget {
		return map[string]any{"session_id": s.cp.SessionID, "state": StateClosed, "checkpoint_kept": true, "tab_left_open": tabLeftOpen}, nil
	}
	m.mu.Lock()
	shared := false
	for _, o := range m.sessions {
		if o != s && o.cp.Profile == s.cp.Profile {
			shared = true
		}
	}
	m.mu.Unlock()
	removeProfile := s.cp.Browser != browserYourChrome && !shared && s.cp.Profile == s.cp.SessionID
	if removeProfile {
		if e := removeBrowserProfile(ctx, profilePath(s.cp.Profile)); e != nil {
			return nil, fmt.Errorf("browser closed but its profile could not be forgotten; retry close with forget=true: %w", e)
		}
	}
	if e := os.Remove(checkpointPath(s.cp.SessionID)); e != nil && !os.IsNotExist(e) {
		return nil, fmt.Errorf("browser closed but its checkpoint could not be forgotten; retry close with forget=true: %w", e)
	}
	m.mu.Lock()
	delete(m.sessions, s.cp.SessionID)
	m.mu.Unlock()
	return map[string]any{"session_id": s.cp.SessionID, "state": StateClosed, "forgotten": true, "profile_removed": removeProfile, "tab_left_open": tabLeftOpen}, nil
}

// submitTarget hashes what a submit acts on: the action plus the page helper's
// description of the form (method, action URL without query, control label,
// field names). Values are never part of it.
func submitTarget(action string, desc []byte) string {
	sum := sha256.Sum256(append([]byte(action+"\x00"), desc...))
	return hex.EncodeToString(sum[:12])
}

func strconvQuote(s string) string { b, _ := json.Marshal(s); return string(b) }
