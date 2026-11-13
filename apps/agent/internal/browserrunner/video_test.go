package browserrunner

import (
	"context"
	"encoding/base64"
	"testing"
	"time"
)

func TestVideoIsOptInAndDoesNotStartTasks(t *testing.T) {
	t.Setenv("REMOTEARC_RUNNER_VIDEO", "0")
	m := New()
	if m.VideoAvailable() {
		t.Fatal("video must be opt-in")
	}
	m.VideoControl(VideoSignal{Action: "start", SessionID: "missing", StreamID: "stream"})
	if len(m.sessions) != 0 {
		t.Fatal("viewing started a browser task")
	}
	client := &staticViewClient{}
	s := &session{m: m, cp: &Checkpoint{SessionID: "task"}, conn: client, viewConn: client, viewUntil: time.Now().Add(time.Minute)}
	m.sessions["task"] = s
	m.VideoControl(VideoSignal{Action: "start", SessionID: "task", StreamID: "stream"})
	if s.video != nil {
		t.Fatal("feature gate ignored")
	}
}

func TestVideoGenerationAndLatestFrameIsolation(t *testing.T) {
	m := New()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	v := &videoStream{id: "current", ctx: ctx, cancel: cancel, frames: make(chan []byte, 1), answers: make(chan string, 1)}
	s := &session{m: m, cp: &Checkpoint{SessionID: "task"}, video: v, viewUntil: time.Now().Add(time.Minute)}
	m.sessions["task"] = s
	m.VideoControl(VideoSignal{Action: "answer", SessionID: "task", StreamID: "old", SDP: "answer"})
	if len(v.answers) != 0 {
		t.Fatal("stale answer reached a newer publisher")
	}
	m.VideoControl(VideoSignal{Action: "answer", SessionID: "task", StreamID: "current", SDP: "v=0\r\nm=audio 9 RTP/AVP 0\r\n"})
	if len(v.answers) != 0 {
		t.Fatal("audio answer accepted")
	}
	frame := base64.StdEncoding.EncodeToString([]byte{0xff, 0xd8, 0xff, 0xd9})
	for range 10 {
		v.last = time.Time{}
		s.offerVideoFrame(frame)
	}
	if len(v.frames) != 1 {
		t.Fatal("encoder queued old page frames")
	}
	m.VideoControl(VideoSignal{Action: "stop", SessionID: "task", StreamID: "old"})
	if s.video == nil {
		t.Fatal("stale stop cancelled a new stream")
	}
	m.StopViews()
	if s.video != nil || !s.viewUntil.IsZero() {
		t.Fatal("disconnect retained a publisher lease")
	}
	select {
	case <-ctx.Done():
	default:
		t.Fatal("publisher was not cancelled")
	}
}

func TestVideoExpiryCancelsBeforeCapture(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s := &session{m: New(), conn: &staticViewClient{}, video: &videoStream{id: "expired", ctx: ctx, cancel: cancel}, viewUntil: time.Now().Add(-time.Second)}
	s.serviceView(context.Background())
	if s.video != nil {
		t.Fatal("expired viewer kept encoding")
	}
	select {
	case <-ctx.Done():
	default:
		t.Fatal("encoder context remained active")
	}
}

func TestVideoRestartIgnoresQueuedJPEGFrame(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	client := &staticViewClient{}
	v := &videoStream{id: "new", ctx: ctx, cancel: cancel, frames: make(chan []byte, 1)}
	s := &session{m: New(), conn: client, viewConn: client, video: v, viewUntil: time.Now().Add(time.Minute)}
	s.onViewFrame([]byte(`{"sessionId":1,"data":"/9j/2Q=="}`))
	if s.video != v {
		t.Fatal("queued old JPEG frame cancelled new video publication")
	}
	select {
	case <-ctx.Done():
		t.Fatal("new video context cancelled")
	default:
	}
	client.mu.Lock()
	defer client.mu.Unlock()
	for _, method := range client.methods {
		if method == "Page.stopScreencast" {
			t.Fatal("stale frame stopped newly restarted capture")
		}
	}
}

func TestVideoLeaseExpiresDuringBusyPageAction(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	v := &videoStream{id: "busy", ctx: ctx, cancel: cancel}
	s := &session{m: New(), video: v, viewUntil: time.Now().Add(-time.Second)}
	s.mu.Lock()
	defer s.mu.Unlock()
	go v.watchLease(s)
	select {
	case <-ctx.Done():
	case <-time.After(1500 * time.Millisecond):
		t.Fatal("busy page action prevented media lease expiry")
	}
	s.ev.Lock()
	defer s.ev.Unlock()
	if s.video != nil {
		t.Fatal("expired video retained by session")
	}
}
