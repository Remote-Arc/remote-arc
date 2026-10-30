package browserrunner

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// Attention contains routing metadata only. No page text, fields, screenshot or
// credential is sent to the Relay notification channel.
type Attention struct {
	Type      string `json:"type"`
	EventID   string `json:"event_id"`
	SessionID string `json:"session_id"`
	TaskID    string `json:"task_id"`
	Kind      string `json:"kind"`
	Origin    string `json:"origin"`
	Title     string `json:"title"`
}

func (m *Manager) SetAttentionMode(mode string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.attentionMode = mode
}

// PendingAttention survives Relay reconnects. Ack only after a successful send;
// repeated events have a stable ID and are deduplicated by the Relay.
func (m *Manager) PendingAttention() []Attention {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := []Attention{}
	for _, event := range m.attentionEvents {
		result = append(result, event)
	}
	sort.SliceStable(result, func(i, j int) bool { return result[i].Kind != "reminder" && result[j].Kind == "reminder" })
	return result
}
func (m *Manager) AckAttention(event Attention) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.attentionEvents, event.EventID+":"+event.Kind)
}
func (s *session) emitAttention(kind string) {
	if s.cp.AttentionID == "" {
		return
	}
	event := Attention{Type: "runner_attention", EventID: s.cp.AttentionID, SessionID: s.cp.SessionID, TaskID: s.cp.SessionID, Kind: kind, Origin: originOf(s.currentHref()), Title: "Browser task needs your help"}
	s.m.mu.Lock()
	defer s.m.mu.Unlock()
	if s.m.attentionEvents == nil {
		s.m.attentionEvents = map[string]Attention{}
	}
	// Each session has one episode; drop superseded notifications before sending.
	for key, previous := range s.m.attentionEvents {
		if previous.SessionID == event.SessionID && (previous.EventID != event.EventID || kind == "resolved") {
			delete(s.m.attentionEvents, key)
		}
	}
	s.m.attentionEvents[event.EventID+":"+kind] = event
}
func (s *session) clearAttention() {
	if s.cp.AttentionID != "" {
		s.emitAttention("resolved")
	}
	s.cp.AttentionID, s.cp.AttentionSince, s.cp.AttentionKind = "", "", ""
	s.cp.AttentionReminded = false
	s.cp.AttentionShown, s.cp.AttentionDismissed, s.cp.AttentionPresented = false, false, false
	if s.cp.State == StateNeedsUser {
		s.cp.State, s.cp.NeedsUser = StateActive, ""
	}
}
func (s *session) updateAttention(ctx context.Context, blockers []any) {
	if len(blockers) == 0 {
		s.clearAttention()
		return
	}
	kind := "sign_in"
	kinds := []string{}
	for _, raw := range blockers {
		if b, ok := raw.(map[string]any); ok {
			value := fmt.Sprint(b["kind"])
			kinds = append(kinds, value)
			if value == "scope" {
				kind = "scope"
			} else if value == "captcha" {
				kind = "captcha"
			} else if value == "verification_code" && kind != "captcha" {
				kind = "otp"
			}
		}
	}
	fresh := s.cp.AttentionID == ""
	s.cp.State = StateNeedsUser
	s.cp.NeedsUser = "The page needs the user (" + strings.Join(kinds, ", ") + "). Complete it in the task window, or approve supported OTP/CAPTCHA actions in Dashboard Browser authentication. CAPTCHA response tokens stay private; Remote Arc never reads their responses. Then use browser_runner_wait until=user_done. This does not authorize another submit."
	if kind == "scope" {
		s.cp.NeedsUser = "The task attempted to leave allowed_origins. Ask the user to review the exact sites in Dashboard Boundary requests; waiting does not expand scope. Resume with browser_runner_start only after approval."
	}
	if fresh {
		s.cp.AttentionID, s.cp.AttentionSince, s.cp.AttentionKind = randomHex(16), stamp(s.m.now()), kind
		s.cp.AttentionReminded = false
	}
	if kind != "scope" {
		s.showAttention(ctx)
	}
	if fresh {
		if s.cp.Browser != browserYourChrome && !s.hasWindow() {
			s.cp.NeedsUser += " This device has no display; resume on a device with a display to complete it."
		}
		s.emitAttention(kind)
	}
}

// The policy is session-local: concurrent background tasks must not change an
// interactive task's behavior, nor inherit its permission to raise a window.
func (s *session) setCallAttentionMode(mode string) {
	if mode != "" {
		s.cp.AttentionMode = mode
	}
}

func (s *session) mayShowWindow() bool {
	mode := s.cp.AttentionMode
	if mode == "" {
		s.m.mu.Lock()
		mode = s.m.attentionMode
		s.m.mu.Unlock()
	}
	return mode != "notify_only" && s.m.userPresent != nil && s.m.userPresent()
}

func (s *session) showAttention(ctx context.Context) {
	if s.cp.AttentionID == "" || !s.hasWindow() {
		return
	}
	// Once the window has been delivered, occlusion or minimization is the
	// user's choice. Persist this decision across Agent/browser reconnects.
	if s.cp.AttentionPresented {
		if bounds, ok := s.quickWindow(ctx); ok && bounds.WindowState == "minimized" {
			s.cp.AttentionDismissed = true
		}
	}
	if s.cp.AttentionShown || s.cp.AttentionDismissed || !s.mayShowWindow() {
		return
	}
	err := s.setVisible(ctx, true)
	if bounds, ok := s.quickWindow(ctx); ok && windowInWorkArea(bounds, s.windowWorkArea(ctx)) {
		s.cp.AttentionPresented = true
	}
	if err == nil {
		s.cp.AttentionShown = true
		s.shownForUser = s.shownForUser || s.cp.Headless
	} else {
		s.cp.NeedsUser += " The window could not be raised. Open the task from Dashboard, or retry browser_runner_start with the same task_id and headless=false on this computer."
	}
}
func (s *session) addAttentionResult(out map[string]any) {
	out["session_state"] = s.cp.State
	if s.cp.State == StateNeedsUser {
		out["needs_user"] = s.cp.NeedsUser
		out["next_action"] = "browser_runner_wait until=user_done"
	}
}

type blockerScan struct {
	Blockers []any  `json:"blockers"`
	Busy     bool   `json:"busy"`
	HasFile  bool   `json:"has_file"`
	Ready    string `json:"ready"`
}

// frameVisible checks the embedding element from its parent document. It does
// not enter cross-origin CAPTCHA frames or mistake a hidden sign-in for a stop.
func (s *session) frameVisibility(ctx context.Context, f frameInfo) (shown, known bool) {
	parentSession := ""
	if parent, ok := s.frameByID(f.parent); ok {
		parentSession = parent.session
	}
	var owner struct {
		BackendNodeID int `json:"backendNodeId"`
	}
	if s.conn.CallIn(ctx, parentSession, "DOM.getFrameOwner", map[string]any{"frameId": f.id}, &owner) != nil || owner.BackendNodeID == 0 {
		return false, false
	}
	var node struct {
		Object struct {
			ObjectID string `json:"objectId"`
		} `json:"object"`
	}
	if s.conn.CallIn(ctx, parentSession, "DOM.resolveNode", map[string]any{"backendNodeId": owner.BackendNodeID}, &node) != nil || node.Object.ObjectID == "" {
		return false, false
	}
	defer s.conn.FireIn(parentSession, "Runtime.releaseObject", map[string]any{"objectId": node.Object.ObjectID})
	var result struct {
		Result struct {
			Value bool `json:"value"`
		} `json:"result"`
		ExceptionDetails json.RawMessage `json:"exceptionDetails"`
	}
	e := s.conn.CallIn(ctx, parentSession, "Runtime.callFunctionOn", map[string]any{"objectId": node.Object.ObjectID, "functionDeclaration": "function(){return (" + pageJS + ")('frame_visible',{element:this})}", "returnByValue": true}, &result)
	return result.Result.Value, e == nil && len(result.ExceptionDetails) == 0
}

func (s *session) frameVisible(ctx context.Context, f frameInfo) bool {
	shown, known := s.frameVisibility(ctx, f)
	return known && shown
}

func (s *session) scanBlockers(ctx context.Context) (blockerScan, bool) {
	var scan blockerScan
	r, e := s.helper(ctx, "scan_blockers", map[string]any{"allow_codes": s.codesAllowed(s.currentHref()), "allow_captcha": s.captchaAllowed()}, true)
	if e != nil || json.Unmarshal(r.Result.Value, &scan) != nil {
		return scan, false
	}
	// Preserve vault-assisted sign-in behavior. The snapshot still tells callers
	// which saved login to fill; its password never enters a notification.
	page := map[string]any{"blockers": scan.Blockers}
	s.applySavedLogins(page)
	scan.Blockers, _ = page["blockers"].([]any)
	visible := map[string]bool{s.mainFrame: true}
	complete := true
	for _, f := range s.childFrames() {
		if !s.readableFrame(f) || !visible[f.parent] {
			continue
		}
		shown, known := s.frameVisibility(ctx, f)
		if !known {
			complete = false
			continue
		}
		if !shown {
			continue
		}
		visible[f.id] = true
		r, e := s.helperIn(ctx, f.id, "scan_blockers", map[string]any{"allow_codes": s.codesAllowed(s.currentHref()), "allow_captcha": s.captchaAllowed()}, true)
		var child blockerScan
		if e != nil || json.Unmarshal(r.Result.Value, &child) != nil {
			complete = false
			continue
		}
		scan.Blockers = append(scan.Blockers, child.Blockers...)
		scan.Busy, scan.HasFile = scan.Busy || child.Busy, scan.HasFile || child.HasFile
	}

	return scan, complete
}

// Give delayed challenges a chance to mount after submit/navigation. Do not
// change refs, collect page text, or mark an empty/failed scan as user completion.
func (s *session) scanAfterAction(ctx context.Context) {
	scanCtx, cancel := context.WithTimeout(ctx, 3500*time.Millisecond)
	defer cancel()
	for scanCtx.Err() == nil {
		s.serviceView(scanCtx)
		if scan, _ := s.scanBlockers(scanCtx); len(scan.Blockers) > 0 {
			s.updateAttention(scanCtx, scan.Blockers)
			return
		}
		if !waitTick(scanCtx, 500*time.Millisecond) {
			return
		}
	}
}

// Wait tools may be queued behind an action. Acquiring the session itself
// must respect the same deadline as scanning, rather than blocking the Relay.
func lockSession(ctx context.Context, s *session) bool {
	for ctx.Err() == nil {
		if s.mu.TryLock() {
			return true
		}
		if !waitTick(ctx, 25*time.Millisecond) {
			return false
		}
	}
	return false
}

func waitTick(ctx context.Context, duration time.Duration) bool {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func waitLimit(args map[string]any) (int, bool, error) {
	ms, e := protocol.Integer(args, "timeout_ms", 30000, 1000, 9007199254740991)
	return min(ms, 40000), ms > 40000, e
}
func (m *Manager) waitUntil(ctx context.Context, s *session, args map[string]any) (map[string]any, error) {
	until := protocol.OptionalString(args, "until")
	switch until {
	case "user_done", "page_change", "text", "url_contains", "upload_done", "idle":
	default:
		return nil, fmt.Errorf("until must be user_done, page_change, text, url_contains, upload_done or idle.")
	}
	text, urlPart := protocol.OptionalString(args, "text"), protocol.OptionalString(args, "url_contains")
	if len(text) > 200 || len(urlPart) > 300 || (until == "text" && strings.TrimSpace(text) == "") || (until == "url_contains" && strings.TrimSpace(urlPart) == "") {
		return nil, fmt.Errorf("text (1-200 characters) or url_contains (1-300) is required for the selected condition.")
	}
	ms, clamped, e := waitLimit(args)
	if e != nil {
		return nil, e
	}
	started := time.Now()
	waitCtx, cancel := context.WithTimeout(ctx, time.Duration(ms)*time.Millisecond)
	defer cancel()
	initialURL, initialMark := s.currentHref(), s.mark()
	_, initialDOM, initialDOMOK := s.domState(waitCtx, "")
	clearScans := 0
	idleSince := time.Now()
	state, reason := "timeout", "Condition not met before the wait deadline."
	for waitCtx.Err() == nil {
		s.serviceView(waitCtx)
		scanCtx, stopScan := context.WithTimeout(waitCtx, time.Second)
		scan, scanned := s.scanBlockers(scanCtx)
		stopScan()
		if len(scan.Blockers) > 0 {
			s.updateAttention(waitCtx, scan.Blockers)
			clearScans = 0
			if until != "user_done" {
				state, reason = "needs_user", s.cp.NeedsUser
				break
			}
		} else if scanned {
			clearScans++
		} else {
			clearScans = 0
		}
		met := false
		if scanned && len(scan.Blockers) == 0 {
			switch until {
			case "user_done":
				met = clearScans >= 2
			case "page_change":
				mark := s.mark()
				_, dom, ok := s.domState(waitCtx, "")
				met = initialURL != s.currentHref() || mark.epoch != initialMark.epoch || mark.routes != initialMark.routes || (initialDOMOK && ok && dom != initialDOM)
			case "text":
				met, _ = s.probeAll(waitCtx, text)
			case "url_contains":
				met = strings.Contains(s.currentHref(), urlPart)
			case "upload_done":
				met = scan.HasFile && !scan.Busy && scan.Ready == "complete"
			case "idle":
				s.ev.Lock()
				busy := s.loading || len(s.networkRequests) > 0
				last := s.networkChanged
				s.ev.Unlock()
				if busy {
					idleSince = time.Now()
				}
				if last.After(idleSince) {
					idleSince = last
				}
				met = !busy && time.Since(idleSince) >= time.Second
			}
		}
		if met {
			if clearScans >= 2 {
				s.clearAttention()
				s.hideAfterUser(waitCtx)
			}
			state, reason = "met", "The "+until+" condition is met."
			break
		}
		if !waitTick(waitCtx, 500*time.Millisecond) {
			break
		}
	}
	out := map[string]any{"state": state, "waited_ms": time.Since(started).Milliseconds(), "reason": reason, "next_action": "Call browser_runner_wait again with the same condition."}
	if clamped {
		out["note"] = "timeout_ms was capped at 40000 ms to return before the Relay deadline."
	}
	if state == "met" {
		out["next_action"] = "Inspect the page and confirm any unresolved submit; waiting does not authorize or retry a submit."
	}
	if protocol.Bool(args, "snapshot") && ctx.Err() == nil {
		snapCtx, stop := context.WithTimeout(ctx, 300*time.Millisecond)
		if snap, err := s.snapshot(snapCtx, 150, 6000); err == nil {
			out["snapshot"] = snap
		}
		stop()
	}
	return out, nil
}
