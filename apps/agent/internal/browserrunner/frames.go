package browserrunner

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

// frameInfo tracks one child frame of the task page. Same-process frames are
// driven through the page target (session ""); out-of-process iframes
// (cross-site embeds such as hosted application forms) through their own
// flattened CDP session.
type frameInfo struct {
	id      string
	parent  string
	session string
	url     string
	world   int
	seq     int
}

// maxFrameDepth limits which frames are read and acted on: the page's own
// frames and their direct children cover hosted forms without walking ad
// and tracker trees.
const maxFrameDepth = 2

func (s *session) frameAttached(cdpSession, id, parent string) {
	if id == "" || id == s.mainFrame {
		return
	}
	f := s.frames[id]
	if f == nil {
		s.frameSeq++
		f = &frameInfo{id: id, seq: s.frameSeq}
		s.frames[id] = f
	}
	if parent != "" {
		f.parent = parent
	}
	if f.session == "" {
		f.session = cdpSession
	}
}

func (s *session) frameNavigated(cdpSession, id, parent, url string) {
	s.frameAttached(cdpSession, id, parent)
	if f := s.frames[id]; f != nil {
		f.url = url
		f.world = 0
	}
}

func (s *session) frameDetached(id, reason string) {
	// "swap" means the frame moved to its own process; it is re-announced
	// on the child session, so keep its place in the order.
	if reason != "swap" {
		delete(s.frames, id)
	}
}

func (s *session) clearWorlds(cdpSession string) {
	for _, f := range s.frames {
		if f.session == cdpSession {
			f.world = 0
		}
	}
}

// onChildEvent handles events from an out-of-process iframe session.
func (s *session) onChildEvent(cdpSession, method string, raw json.RawMessage) {
	switch method {
	case "Page.frameNavigated":
		var p struct {
			Frame struct {
				ID       string `json:"id"`
				ParentID string `json:"parentId"`
				URL      string `json:"url"`
			} `json:"frame"`
		}
		if json.Unmarshal(raw, &p) == nil {
			s.ev.Lock()
			s.frameNavigated(cdpSession, p.Frame.ID, p.Frame.ParentID, p.Frame.URL)
			if f := s.frames[p.Frame.ID]; f != nil && p.Frame.ParentID == "" {
				f.session = cdpSession
			}
			s.ev.Unlock()
		}
	case "Page.frameAttached":
		var p struct {
			FrameID       string `json:"frameId"`
			ParentFrameID string `json:"parentFrameId"`
		}
		if json.Unmarshal(raw, &p) == nil {
			s.ev.Lock()
			s.frameAttached(cdpSession, p.FrameID, p.ParentFrameID)
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
			if f := s.frames[p.Context.AuxData.FrameID]; f != nil && f.session == cdpSession {
				f.world = p.Context.ID
			}
			s.ev.Unlock()
		}
	case "Runtime.executionContextsCleared":
		s.ev.Lock()
		s.clearWorlds(cdpSession)
		s.ev.Unlock()
	case "Target.attachedToTarget":
		s.childAttached(cdpSession, raw)
	case "Target.detachedFromTarget":
		s.childDetached(raw)
	case "Page.javascriptDialogOpening":
		s.onDialog(cdpSession, raw)
	}
}

// childAttached adopts an out-of-process iframe. Auto-attach pauses the new
// target until it is set up, so the Runner's world exists before page code.
func (s *session) childAttached(parentSession string, raw json.RawMessage) {
	var p struct {
		SessionID  string `json:"sessionId"`
		TargetInfo struct {
			TargetID string `json:"targetId"`
			Type     string `json:"type"`
			URL      string `json:"url"`
		} `json:"targetInfo"`
	}
	if json.Unmarshal(raw, &p) != nil || p.SessionID == "" {
		return
	}
	conn := s.conn
	if p.TargetInfo.Type != "iframe" {
		// Workers and other targets are not driven; just let them run.
		conn.FireIn(p.SessionID, "Runtime.runIfWaitingForDebugger", map[string]any{})
		return
	}
	s.ev.Lock()
	s.frameAttached(parentSession, p.TargetInfo.TargetID, "")
	if f := s.frames[p.TargetInfo.TargetID]; f != nil {
		f.session, f.url, f.world = p.SessionID, p.TargetInfo.URL, 0
	}
	s.ev.Unlock()
	go s.setupChild(conn, p.SessionID)
}

func (s *session) childDetached(raw json.RawMessage) {
	var p struct {
		SessionID string `json:"sessionId"`
	}
	if json.Unmarshal(raw, &p) != nil {
		return
	}
	s.ev.Lock()
	for id, f := range s.frames {
		if f.session == p.SessionID {
			delete(s.frames, id)
		}
	}
	s.ev.Unlock()
}

func (s *session) setupChild(conn cdpClient, child string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	// Always release the paused frame, even if setup fails.
	defer conn.FireIn(child, "Runtime.runIfWaitingForDebugger", map[string]any{})
	for _, c := range []struct {
		method string
		params any
	}{
		{"Page.enable", nil},
		{"Runtime.enable", nil},
		{"Page.addScriptToEvaluateOnNewDocument", map[string]any{"source": pageJS + `("install", {})`}},
		{"Page.addScriptToEvaluateOnNewDocument", map[string]any{"source": "void 0", "worldName": worldName}},
		{"Target.setAutoAttach", map[string]any{"autoAttach": true, "waitForDebuggerOnStart": true, "flatten": true}},
	} {
		if conn.CallIn(ctx, child, c.method, c.params, nil) != nil {
			return
		}
	}
}

// childFrames lists frames that may be read, in the order they appeared.
func (s *session) childFrames() []frameInfo {
	s.ev.Lock()
	defer s.ev.Unlock()
	depth := func(f *frameInfo) int {
		d := 1
		for p := f.parent; p != "" && p != s.mainFrame && d <= maxFrameDepth; d++ {
			parent := s.frames[p]
			if parent == nil {
				return maxFrameDepth + 1
			}
			p = parent.parent
		}
		return d
	}
	out := []frameInfo{}
	for _, f := range s.frames {
		if strings.HasPrefix(f.url, "http") && depth(f) <= maxFrameDepth {
			out = append(out, *f)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].seq < out[j].seq })
	return out
}

func (s *session) frameByID(id string) (frameInfo, bool) {
	s.ev.Lock()
	defer s.ev.Unlock()
	f := s.frames[id]
	if f == nil {
		return frameInfo{}, false
	}
	return *f, true
}

// worldIn returns the Runner's isolated world inside a child frame.
func (s *session) worldIn(ctx context.Context, frameID string) (string, int, error) {
	f, ok := s.frameByID(frameID)
	if !ok {
		return "", 0, errors.New("STALE_REF: that frame is no longer on the page. Take a new browser_runner_snapshot.")
	}
	if f.world != 0 {
		return f.session, f.world, nil
	}
	var r struct {
		ID int `json:"executionContextId"`
	}
	if e := s.conn.CallIn(ctx, f.session, "Page.createIsolatedWorld", map[string]any{"frameId": frameID, "worldName": worldName}, &r); e != nil {
		return "", 0, errors.New("STALE_REF: that frame changed. Take a new browser_runner_snapshot.")
	}
	s.ev.Lock()
	if cur := s.frames[frameID]; cur != nil && cur.session == f.session {
		cur.world = r.ID
	}
	s.ev.Unlock()
	return f.session, r.ID, nil
}

// refFrame splits a snapshot ref such as "f2e14" into its frame and checks
// that the frame belongs to the current snapshot.
func (s *session) refFrame(ref string) (string, error) {
	if !strings.HasPrefix(ref, "f") {
		return "", nil
	}
	i := strings.IndexByte(ref, 'e')
	if i < 2 {
		return "", errors.New("ref is not from this snapshot.")
	}
	id, ok := s.snapFrames[ref[:i]]
	if !ok {
		return "", errors.New("STALE_REF: " + ref + " is not in the latest snapshot. Take a new browser_runner_snapshot.")
	}
	return id, nil
}

// frameOffset is the position of a child frame's viewport in the top-level
// page, so trusted mouse input can be aimed at elements inside it.
func (s *session) frameOffset(ctx context.Context, frameID string) (float64, float64, bool) {
	f, ok := s.frameByID(frameID)
	if !ok || f.parent != s.mainFrame {
		return 0, 0, false // nested frames fall back to a direct element click
	}
	var owner struct {
		BackendNodeID int `json:"backendNodeId"`
	}
	if s.conn.Call(ctx, "DOM.getFrameOwner", map[string]any{"frameId": frameID}, &owner) != nil || owner.BackendNodeID == 0 {
		return 0, 0, false
	}
	var box struct {
		Model struct {
			Content []float64 `json:"content"`
		} `json:"model"`
	}
	if s.conn.Call(ctx, "DOM.getBoxModel", map[string]any{"backendNodeId": owner.BackendNodeID}, &box) != nil || len(box.Model.Content) < 2 {
		return 0, 0, false
	}
	return box.Model.Content[0], box.Model.Content[1], true
}

// snapshotFrames reads in-scope child frames into the page snapshot. Frames
// from sites outside allowed_origins are listed but never read or acted on.
func (s *session) snapshotFrames(ctx context.Context, page map[string]any, id string, budget, maxText int) {
	s.snapFrames = map[string]string{}
	elements, _ := page["elements"].([]any)
	text, _ := page["text"].(string)
	frames := []map[string]any{}
	for i, f := range s.childFrames() {
		prefix := fmt.Sprintf("f%d", i+1)
		entry := map[string]any{"frame": prefix, "origin": originOf(f.url), "in_scope": s.scope.Allows(f.url)}
		frames = append(frames, entry)
		if !s.scope.Allows(f.url) || budget <= 0 {
			continue
		}
		r, e := s.helperIn(ctx, f.id, "snapshot", map[string]any{"snapshot_id": id, "ref_prefix": prefix, "max_elements": max(10, budget), "max_text": max(200, maxText/2), "allow_codes": oneTimeCodesAllowed()}, true)
		if e != nil {
			entry["error"] = clip(e.Error(), 120)
			continue
		}
		var sub map[string]any
		if json.Unmarshal(r.Result.Value, &sub) != nil {
			continue
		}
		s.snapFrames[prefix] = f.id
		subEls, _ := sub["elements"].([]any)
		for _, el := range subEls {
			if m, ok := el.(map[string]any); ok {
				m["frame"] = prefix
				elements = append(elements, m)
			}
		}
		budget -= len(subEls)
		if t, _ := sub["text"].(string); strings.TrimSpace(t) != "" {
			text += "\n\n[" + prefix + " " + originOf(f.url) + "]\n" + t
		}
		// Hosted application forms carry their own sign-in walls and CAPTCHAs.
		for _, key := range []string{"blockers", "attention", "captcha"} {
			if b, _ := sub[key].([]any); len(b) > 0 {
				have, _ := page[key].([]any)
				page[key] = append(have, b...)
			}
		}
	}
	page["elements"] = elements
	page["text"] = text
	if len(frames) > 0 {
		page["frames"] = frames
	}
}

// probeAll looks for text in the page and every in-scope frame, so evidence
// shown inside an embedded form counts.
func (s *session) probeAll(ctx context.Context, text string) (bool, map[string]any) {
	found, page := s.probeText(ctx, text)
	if found || text == "" {
		return found, page
	}
	for _, f := range s.childFrames() {
		if !s.scope.Allows(f.url) {
			continue
		}
		if r, e := s.helperIn(ctx, f.id, "probe", map[string]any{"text": text}, true); e == nil {
			var p map[string]any
			_ = json.Unmarshal(r.Result.Value, &p)
			if ok, _ := p["text_found"].(bool); ok {
				return true, page
			}
		}
	}
	return false, page
}

// settleFrame waits briefly for a form inside a frame to finish loading.
func (s *session) settleFrame(ctx context.Context, frameID string) {
	deadline := time.Now().Add(8 * time.Second)
	time.Sleep(600 * time.Millisecond)
	for time.Now().Before(deadline) && ctx.Err() == nil {
		if r, e := s.helperIn(ctx, frameID, "probe", nil, true); e == nil {
			var p struct {
				Ready string `json:"ready"`
			}
			_ = json.Unmarshal(r.Result.Value, &p)
			if p.Ready == "complete" {
				return
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
}
