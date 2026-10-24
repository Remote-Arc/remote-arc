package browserrunner

import (
	"context"
	"encoding/json"
	"time"
)

const maxFrameBytes = 200 * 1024

type ViewFrame struct {
	Type      string `json:"type"`
	SessionID string `json:"session_id"`
	Data      string `json:"data"`
}

// ViewHeartbeat is an internal authenticated Dashboard control, never an AI tool.
// It does not operate the page, show a window, or start a stopped browser.
func (m *Manager) ViewHeartbeat(id string, watching bool) {
	if !idPattern.MatchString(id) {
		return
	}
	m.mu.Lock()
	s := m.sessions[id]
	m.mu.Unlock()
	if s == nil {
		return
	}
	s.ev.Lock()
	if watching {
		s.viewUntil = time.Now().Add(30 * time.Second)
	} else {
		s.viewUntil = time.Time{}
	}
	s.ev.Unlock()
}
func (m *Manager) Frames() <-chan ViewFrame { return m.frames }
func (m *Manager) serviceViews() {
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
		ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
		s.serviceView(ctx)
		cancel()
		s.mu.Unlock()
	}
}
func (s *session) serviceView(ctx context.Context) {
	s.ev.Lock()
	wanted, active := time.Now().Before(s.viewUntil), s.viewActive
	s.ev.Unlock()
	if !s.live() {
		return
	}
	if wanted && !active {
		s.ev.Lock()
		s.viewConn = s.conn
		s.viewActive = true
		s.ev.Unlock()
		if err := s.conn.Call(ctx, "Page.startScreencast", map[string]any{"format": "jpeg", "quality": 50, "maxWidth": 1280, "everyNthFrame": 2}, nil); err != nil {
			s.ev.Lock()
			s.viewActive = false
			s.ev.Unlock()
		}
	} else if !wanted && active {
		s.conn.Fire("Page.stopScreencast", nil)
		s.ev.Lock()
		s.viewActive = false
		s.ev.Unlock()
	}
}
func (s *session) onViewFrame(raw json.RawMessage) {
	// Reject oversized payloads before decoding the frame's base64 string.
	if len(raw) > maxFrameBytes*4/3+4096 {
		s.stopOversizedView(raw)
		return
	}
	var event struct {
		SessionID int    `json:"sessionId"`
		Data      string `json:"data"`
	}
	if json.Unmarshal(raw, &event) != nil {
		return
	}
	s.ev.Lock()
	conn := s.viewConn
	wanted := s.viewActive && time.Now().Before(s.viewUntil)
	send := wanted && time.Since(s.lastViewFrame) >= 500*time.Millisecond && len(event.Data) <= (maxFrameBytes/3)*4
	if send {
		s.lastViewFrame = time.Now()
	}
	if !wanted {
		s.viewActive = false
	}
	s.ev.Unlock()
	if conn == nil {
		return
	}
	conn.Fire("Page.screencastFrameAck", map[string]any{"sessionId": event.SessionID})
	if !wanted {
		conn.Fire("Page.stopScreencast", nil)
		return
	}
	if send {
		select {
		case s.m.frames <- ViewFrame{Type: "runner_frame", SessionID: s.cp.SessionID, Data: event.Data}:
		default:
		}
	}
}
func (s *session) stopOversizedView(raw json.RawMessage) {
	// Still acknowledge a dropped frame so Chrome cannot stall the stream. Decode
	// only the small ID; never keep or journal the image.
	var event struct {
		SessionID int `json:"sessionId"`
	}
	if json.Unmarshal(raw, &event) != nil {
		return
	}
	s.ev.Lock()
	conn := s.viewConn
	s.ev.Unlock()
	if conn != nil {
		conn.Fire("Page.screencastFrameAck", map[string]any{"sessionId": event.SessionID})
	}
}
