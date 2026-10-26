package browserrunner

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
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
	m.ViewHeartbeatMode(id, watching, true)
}

func (m *Manager) ViewHeartbeatMode(id string, watching, jpeg bool) {
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
	s.viewJPEG = jpeg
	if watching {
		s.viewUntil = time.Now().Add(30 * time.Second)
	} else {
		s.viewUntil = time.Time{}
		s.stopVideoLocked()
		s.cancelViewCapture()
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
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		s.serviceView(ctx)
		cancel()
		s.mu.Unlock()
	}
}
func (s *session) serviceView(ctx context.Context) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	s.ev.Lock()
	wanted, active := time.Now().Before(s.viewUntil), s.viewActive
	if !wanted {
		s.stopVideoLocked()
		active = s.viewActive
	}
	s.ev.Unlock()
	if !wanted && !active {
		return
	}
	if !s.live() {
		return
	}
	if wanted && !active {
		s.ev.Lock()
		s.viewConn = s.conn
		s.viewActive = true
		s.viewStarted = time.Now()
		s.ev.Unlock()
		s.ev.Lock()
		video := s.video != nil
		s.ev.Unlock()
		params := map[string]any{"format": "jpeg", "quality": 50, "maxWidth": 1280, "everyNthFrame": 2}
		if video {
			params["maxHeight"], params["everyNthFrame"] = 720, 1
		}
		if err := s.conn.Call(ctx, "Page.startScreencast", params, nil); err != nil {
			s.ev.Lock()
			s.viewActive = false
			s.viewError = "start screencast: " + err.Error()
			s.ev.Unlock()
		}
	} else if !wanted && active {
		s.conn.Fire("Page.stopScreencast", nil)
		s.ev.Lock()
		s.viewActive = false
		s.cancelViewCapture()
		s.ev.Unlock()
	}
	// A static/headless page may not paint enough frames to satisfy everyNthFrame=2.
	// Bootstrap from the surface and refresh it if an occluded window stops
	// painting. Normal updates use screencast events; the fallback uses the same
	// memory-only/rate/size limits and only runs for an active viewer.
	s.ev.Lock()
	needFrame := s.viewActive && time.Now().Before(s.viewUntil) && s.viewCaptureCancel == nil && (s.lastViewFrame.Before(s.viewStarted) || time.Since(s.lastViewFrame) >= 2*time.Second)
	if s.video != nil && time.Since(s.video.last) < 2*time.Second {
		needFrame = false
	}
	if needFrame {
		// Native screenshot callbacks can take longer than the control tick on a
		// minimized Mac. Keep a single request alive without holding the session
		// mutex, so page actions, waits and heartbeat expiry remain responsive.
		captureCtx, captureCancel := context.WithTimeout(context.Background(), 25*time.Second)
		s.viewCaptureCancel = captureCancel
		s.viewCaptureID++
		id, conn := s.viewCaptureID, s.conn
		go s.initialViewFrame(captureCtx, captureCancel, conn, id)
	}
	s.ev.Unlock()
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
	lease := time.Now().Before(s.viewUntil)
	wanted := s.viewActive && lease
	if !lease {
		s.stopVideoLocked()
		s.viewActive = false
		s.cancelViewCapture()
	}
	s.ev.Unlock()
	if conn == nil {
		return
	}
	conn.Fire("Page.screencastFrameAck", map[string]any{"sessionId": event.SessionID})
	if !wanted {
		// Frames queued by the previous JPEG screencast can arrive while a
		// video start restarts capture. They must not cancel the new publisher.
		if !lease {
			conn.Fire("Page.stopScreencast", nil)
		}
		return
	}
	s.forwardViewFrame(event.Data)
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

func (s *session) forwardViewFrame(data string) {
	s.ev.Lock()
	s.offerVideoFrame(data)
	send := s.viewActive && (s.video == nil || s.viewJPEG) && time.Now().Before(s.viewUntil) && time.Since(s.lastViewFrame) >= 500*time.Millisecond && len(data) > 0 && len(data) <= (maxFrameBytes/3)*4
	if send {
		s.lastViewFrame = time.Now()
		s.viewError = ""
	}
	s.ev.Unlock()
	if send {
		select {
		case s.m.frames <- ViewFrame{Type: "runner_frame", SessionID: s.cp.SessionID, Data: data}:
		default:
		}
	}
}

// cancelViewCapture requires ev. Incrementing the ID also invalidates a late
// reply after cancellation or after a new viewer/browser connection takes over.
func (s *session) cancelViewCapture() {
	if s.viewCaptureCancel != nil {
		s.viewCaptureCancel()
		s.viewCaptureCancel = nil
	}
	s.viewCaptureID++
}

// Capture the existing viewport without clip/device emulation. Chromium resizes
// its RenderWidgetHostView when a clip is supplied; a minimized macOS window can
// never present that resized surface, leaving captureScreenshot pending. Scaling
// the JPEG locally avoids changing the page or showing/focusing its native window.
func (s *session) initialViewFrame(ctx context.Context, cancel context.CancelFunc, conn cdpClient, id uint64) {
	defer cancel()
	defer func() {
		s.ev.Lock()
		if s.viewCaptureID == id {
			s.viewCaptureCancel = nil
		}
		s.ev.Unlock()
	}()
	var frame struct {
		Data string `json:"data"`
	}
	params := map[string]any{"format": "jpeg", "quality": 50, "captureBeyondViewport": false, "fromSurface": true, "optimizeForSpeed": true}
	err := conn.Call(ctx, "Page.captureScreenshot", params, &frame)
	if err == nil && ctx.Err() == nil {
		frame.Data, err = cappedViewJPEG(frame.Data)
	}
	if err == nil {
		err = ctx.Err()
	}
	s.ev.Lock()
	current := s.viewCaptureID == id && s.viewConn == conn && s.viewActive && time.Now().Before(s.viewUntil)
	if current && err != nil {
		s.viewError = "initial frame: " + err.Error()
	}
	if current && err == nil && time.Since(s.lastViewFrame) >= 500*time.Millisecond {
		s.offerVideoFrame(frame.Data)
		s.lastViewFrame = time.Now()
		s.viewError = ""
		select {
		case s.m.frames <- ViewFrame{Type: "runner_frame", SessionID: s.cp.SessionID, Data: frame.Data}:
		default:
		}
	}
	s.ev.Unlock()
}

// Decode only a bounded viewport image, never a whole-document screenshot. The
// input cap and JPEG header limits apply before allocating the decoded bitmap.
func cappedViewJPEG(data string) (string, error) {
	const maxCaptureBytes = 8 * 1024 * 1024
	if len(data) > base64.StdEncoding.EncodedLen(maxCaptureBytes) {
		return "", fmt.Errorf("viewport capture exceeds the local size limit")
	}
	raw, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return "", fmt.Errorf("invalid viewport image")
	}
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(raw))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width > 16384 || cfg.Height > 16384 || int64(cfg.Width)*int64(cfg.Height) > 32*1024*1024 {
		return "", fmt.Errorf("invalid or oversized viewport dimensions")
	}
	if cfg.Width <= 1280 && len(raw) <= maxFrameBytes {
		return data, nil
	}
	src, err := jpeg.Decode(bytes.NewReader(raw))
	if err != nil {
		return "", fmt.Errorf("invalid viewport image")
	}
	width := min(cfg.Width, 1280)
	height := max(1, cfg.Height*width/cfg.Width)
	// Sampling stays bounded to the output viewport, including on Retina screens.
	dst := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			dst.Set(x, y, src.At(x*cfg.Width/width, y*cfg.Height/height))
		}
	}
	for _, quality := range []int{50, 35, 20} {
		var out bytes.Buffer
		if err := jpeg.Encode(&out, dst, &jpeg.Options{Quality: quality}); err != nil {
			return "", fmt.Errorf("unable to encode viewport image")
		}
		if out.Len() <= maxFrameBytes {
			return base64.StdEncoding.EncodeToString(out.Bytes()), nil
		}
	}
	return "", fmt.Errorf("viewport image exceeds the frame size limit")
}
