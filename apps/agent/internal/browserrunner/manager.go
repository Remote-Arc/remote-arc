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
	"browser_runner_status", "browser_runner_confirm", "browser_runner_close",
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
	mu          sync.Mutex
	sessions    map[string]*session
	findBrowser func() (string, error)
	now         func() time.Time
	IdleTimeout time.Duration
	reaper      sync.Once
	stop        chan struct{}
}

func New() *Manager {
	return &Manager{sessions: map[string]*session{}, findBrowser: FindBrowser, now: time.Now, IdleTimeout: 20 * time.Minute, stop: make(chan struct{})}
}

// Available reports whether this device can run the Browser Runner at all.
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
	m.mu.Unlock()
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
			t := time.NewTicker(time.Minute)
			defer t.Stop()
			for {
				select {
				case <-m.stop:
					return
				case <-t.C:
					m.reapIdle()
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
		if s.live() && m.now().Sub(s.lastUsed) > m.IdleTimeout {
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

// Call dispatches one Browser Runner tool. The returned value is serialized
// by the Agent like any other tool result.
func (m *Manager) Call(ctx context.Context, tool string, args map[string]any, p protocol.Policy) (any, error) {
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
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lastUsed = m.now()
	if tool == "browser_runner_status" {
		return s.cp.Summary(s.live()), nil
	}
	if tool == "browser_runner_close" {
		return m.close(s, protocol.Bool(args, "forget"))
	}
	if s.cp.State == StateClosed {
		return nil, errors.New("Session is closed. Call browser_runner_start with the same task_id to reopen it.")
	}
	if e := s.ensureLive(ctx); e != nil {
		return nil, e
	}
	blockedBefore := len(s.cp.Blocked)
	var out map[string]any
	switch tool {
	case "browser_runner_snapshot":
		maxEl, e1 := protocol.Integer(args, "max_elements", 150, 10, 400)
		maxText, e2 := protocol.Integer(args, "max_text", 6000, 500, 20000)
		if e = errors.Join(e1, e2); e == nil {
			out, e = s.snapshot(ctx, maxEl, maxText)
		}
	case "browser_runner_act":
		// One action tool keeps the surface small for every AI host:
		// page actions on snapshot refs, plus navigate, upload and wait.
		switch protocol.OptionalString(args, "action") {
		case "navigate":
			out, e = s.navigate(ctx, protocol.OptionalString(args, "url"))
			if e == nil {
				s.cp.receipt(m.now(), Receipt{Tool: tool, Action: "navigate", URL: safeURL(fmt.Sprint(out["url"])), Outcome: "ok"})
			}
		case "upload":
			out, e = m.upload(ctx, s, args, p)
		case "wait":
			out, e = m.wait(ctx, s, args)
		default:
			out, e = m.act(ctx, s, args)
		}
	case "browser_runner_confirm":
		out, e = m.resolve(ctx, s, args)
	default:
		return nil, fmt.Errorf("Unknown Browser Runner tool: %s", tool)
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
	if ferr := s.flush(); ferr != nil && e == nil {
		e = fmt.Errorf("Browser Runner could not save its checkpoint: %w", ferr)
	}
	if e != nil {
		return nil, e
	}
	out["session_id"] = s.cp.SessionID
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
			return nil, fmt.Errorf("No Browser Runner session %q on this device. Call browser_runner_start first.", id)
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
	return map[string]any{"sessions": items, "note": "Sessions from before an Agent restart are listed after any call that names them."}
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
		if s.cp.Profile == profile && s.cp.State != StateClosed && s.live() {
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
	profile := protocol.OptionalString(args, "profile")
	if profile == "" {
		profile = id
	}
	if !idPattern.MatchString(profile) {
		return nil, errors.New("profile must be 1-100 characters of letters, digits, '-' or '_'.")
	}
	headless := true
	if v, ok := args["headless"].(bool); ok {
		headless = v
	}
	startURL := protocol.OptionalString(args, "start_url")
	if startURL != "" && !sc.Allows(startURL) {
		return nil, fmt.Errorf("OUT_OF_SCOPE: start_url %s is not in allowed_origins.", originOf(startURL))
	}
	reason := strings.TrimSpace(protocol.OptionalString(args, "scope_change_reason"))

	s, e := m.get(id)
	resumed := e == nil
	if e != nil && !strings.HasPrefix(e.Error(), "No Browser Runner session") {
		return nil, e
	}
	m.mu.Lock()
	n, clash := m.liveCount(id, profile)
	if clash {
		m.mu.Unlock()
		return nil, fmt.Errorf("Profile %q is already open in another Browser Runner session. Close it first or use a different profile.", profile)
	}
	if n >= maxLiveSessions {
		m.mu.Unlock()
		return nil, fmt.Errorf("At most %d Browser Runner sessions can run at once on this device. Close one first.", maxLiveSessions)
	}
	if s == nil {
		now := m.now()
		s = &session{m: m, scope: sc, lastUsed: now, cp: &Checkpoint{
			Version: checkpointVersion, SessionID: id, Profile: profile, AllowedOrigins: sc.Strings(),
			Headless: headless, State: StateActive, Receipts: []Receipt{}, Uploads: []Upload{},
			Effects: []Effect{}, Blocked: []Blocked{}, CreatedAt: stamp(now),
		}}
		m.sessions[id] = s
	}
	m.mu.Unlock()

	s.mu.Lock()
	defer s.mu.Unlock()
	s.lastUsed = m.now()
	if resumed {
		if s.cp.Profile != profile && protocol.OptionalString(args, "profile") != "" {
			return nil, errors.New("A session keeps its profile. Close it with forget=true to start over with another profile.")
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
		if s.cp.Headless != headless {
			s.shutdownBrowser(false)
			s.cp.Headless = headless
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
	out["status"] = s.cp.Summary(true)
	return out, nil
}

func (m *Manager) act(ctx context.Context, s *session, args map[string]any) (map[string]any, error) {
	// A known submit key is answered from the checkpoint before anything
	// else: retries after a navigation must never reach the page again.
	if protocol.OptionalString(args, "effect") == "submit" {
		key := protocol.OptionalString(args, "idempotency_key")
		if prev := s.cp.effect(key); prev != nil && prev.Status != EffectNotDispatched {
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
			Target         json.RawMessage `json:"target"`
		}
		if e := json.Unmarshal(risk.Result.Value, &classification); e != nil || len(classification.Target) == 0 {
			return nil, errors.New("Browser Runner could not classify this control, so it was not clicked. Take a new snapshot and try again.")
		}
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
	req.Effect = effect
	var eff *Effect
	if effect == "submit" {
		key := protocol.OptionalString(args, "idempotency_key")
		if !keyPattern.MatchString(key) {
			return nil, errors.New("A submit needs idempotency_key (1-120 letters, digits, '.', '_', ':' or '-'), stable for this one external action.")
		}
		if u := s.cp.unresolved(); u != nil {
			return nil, fmt.Errorf("UNRESOLVED_EFFECT: submit %s (%s) is %s. Confirm its result with browser_runner_confirm before any new submit.", u.Key, u.Label, u.Status)
		}
		// A new key must not resend something this task already sent. Other
		// steps of a multi-page flow (Next, then Submit) have other targets.
		if prev := s.cp.sentTo(target, key); prev != nil {
			return nil, fmt.Errorf("SUBMIT_ALREADY_RECORDED: this task already sent the same submit as %s (%s). It is not sent again under a new key; start a separately authorized task to send it again.", prev.Key, prev.Status)
		}
		now := stamp(m.now())
		if prev := s.cp.effect(key); prev != nil {
			prev.Status, prev.UpdatedAt, prev.URLBefore, prev.Target = EffectInFlight, now, safeURL(s.currentHref()), target
			eff = prev
		} else {
			s.cp.Effects = append(s.cp.Effects, Effect{Key: key, Action: req.Action, Label: clip(targetLabel, 120), Target: target, Status: EffectInFlight, URLBefore: safeURL(s.currentHref()), StartedAt: now, UpdatedAt: now})
			eff = &s.cp.Effects[len(s.cp.Effects)-1]
		}
		// Durable before the click: a crash now leaves an unknown effect,
		// never a silent duplicate.
		if e := s.flush(); e != nil {
			return nil, fmt.Errorf("Browser Runner could not record the submit before sending it: %w", e)
		}
		s.ev.Lock()
		s.submitting = true
		s.ev.Unlock()
		defer func() { s.ev.Lock(); s.submitting = false; s.ev.Unlock() }()
	}
	before := s.mark()
	out, dispatched, err := s.act(ctx, req)
	navigated := false
	if dispatched && s.live() {
		navigated = s.waitSettled(ctx, before, effect != "none" || req.Action == "click" || req.Action == "press")
		// An action inside an embedded form changes that frame, not the page.
		if frameID, _ := s.refFrame(req.Ref); frameID != "" && !navigated && effect != "none" {
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
		}
		if out != nil {
			eff.Label = clip(fmt.Sprint(out["label"]), 120)
		}
	}
	rc := Receipt{Tool: "browser_runner_act", Action: req.Action, URL: safeURL(s.currentHref()), Outcome: "ok"}
	if out != nil {
		rc.Label = clip(fmt.Sprint(out["label"]), 120)
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
	if eff != nil {
		out["effect"] = *eff
		out["next_action"] = "Read the page to confirm the result (for example a confirmation number), then call browser_runner_confirm with outcome=confirmed and that exact evidence text."
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
		return nil, errors.New("Browser Runner uploads only from a Trusted Location. Ask the user to add the folder that holds the document on this device in Remote Arc.")
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
	out, e := s.upload(ctx, snap, ref, original)
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

func (m *Manager) close(s *session, forget bool) (any, error) {
	s.shutdownBrowser(false)
	s.cp.State = StateClosed
	s.cp.receipt(m.now(), Receipt{Tool: "browser_runner_close", Outcome: "closed"})
	if !forget {
		if e := s.flush(); e != nil {
			return nil, e
		}
		return map[string]any{"session_id": s.cp.SessionID, "state": StateClosed, "checkpoint_kept": true}, nil
	}
	m.mu.Lock()
	delete(m.sessions, s.cp.SessionID)
	shared := false
	for _, o := range m.sessions {
		if o.cp.Profile == s.cp.Profile {
			shared = true
		}
	}
	m.mu.Unlock()
	_ = os.Remove(checkpointPath(s.cp.SessionID))
	if !shared && s.cp.Profile == s.cp.SessionID {
		_ = os.RemoveAll(profilePath(s.cp.Profile))
	}
	return map[string]any{"session_id": s.cp.SessionID, "state": StateClosed, "forgotten": true, "profile_removed": !shared && s.cp.Profile == s.cp.SessionID}, nil
}

// submitTarget hashes what a submit acts on: the action plus the page helper's
// description of the form (method, action URL without query, control label,
// field names). Values are never part of it.
func submitTarget(action string, desc []byte) string {
	sum := sha256.Sum256(append([]byte(action+"\x00"), desc...))
	return hex.EncodeToString(sum[:12])
}

func strconvQuote(s string) string { b, _ := json.Marshal(s); return string(b) }
