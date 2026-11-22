package browserrunner

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestLiveViewFailuresAndOversizedFramesCannotLeakPageHistory(t *testing.T) {
	s, calls := protocolSession(t, func(message cdpMessage) (any, error) {
		if message.Method == "Page.startScreencast" || message.Method == "Page.captureScreenshot" {
			return nil, protocolFailure
		}
		return map[string]any{}, nil
	})
	s.m.ViewHeartbeat("invalid/path", true)
	s.m.ViewHeartbeat("missing", true)
	s.viewUntil = time.Now().Add(time.Minute)
	s.serviceView(context.Background())
	if s.viewActive || !strings.HasPrefix(s.viewError, "start screencast:") {
		t.Fatal("failed screencast advertised active", s.viewError)
	}
	s.viewActive = true
	s.viewConn = s.conn
	s.viewCaptureID = 42
	ctx, cancel := context.WithCancel(context.Background())
	s.initialViewFrame(ctx, cancel, s.conn, 42)
	if !strings.HasPrefix(s.viewError, "initial frame:") {
		t.Fatal("failed initial screenshot hidden", s.viewError)
	}
	raw := json.RawMessage(`{"sessionId":12,"data":"` + strings.Repeat("x", maxFrameBytes*2) + `"}`)
	s.onViewFrame(raw)
	s.onViewFrame(json.RawMessage("{"))
	s.stopOversizedView(json.RawMessage("{"))
	if err := s.conn.Call(context.Background(), "Page.enable", nil, nil); err != nil {
		t.Fatal(err)
	} // flush prior fire-and-forget commands
	acks := 0
	for len(calls) > 0 {
		message := <-calls
		if message.Method == "Page.screencastFrameAck" {
			var params struct {
				SessionID int `json:"sessionId"`
			}
			if err := json.Unmarshal(message.Params, &params); err != nil || params.SessionID != 12 {
				t.Fatal("wrong frame acknowledgement", err)
			}
			acks++
		}
	}
	if acks != 1 || len(s.m.Frames()) != 0 {
		t.Fatal("oversized frame forwarded or not acknowledged", acks)
	}
	s.viewUntil = time.Now().Add(-time.Second)
	s.onViewFrame(json.RawMessage(`{"sessionId":13,"data":"private"}`))
	if s.viewActive || len(s.m.Frames()) != 0 {
		t.Fatal("expired viewer received page frame")
	}
	s.viewConn = nil
	s.onViewFrame(json.RawMessage(`{"sessionId":14}`))
	s.conn.Close()
	s.viewUntil = time.Now().Add(time.Minute)
	s.serviceView(context.Background())
	if len(s.m.Frames()) != 0 {
		t.Fatal("closed browser produced frame")
	}
}

func TestFreshVideoSuppressesJPEGFallbackAndUsesBoundedCapture(t *testing.T) {
	s, calls := protocolSession(t, func(message cdpMessage) (any, error) { return map[string]any{}, nil })
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.video = &videoStream{ctx: ctx, cancel: cancel, last: time.Now()}
	s.viewUntil = time.Now().Add(time.Minute)
	s.serviceView(context.Background())
	if s.viewCaptureCancel != nil {
		t.Fatal("fresh video unnecessarily captured old JPEG")
	}
	message := <-calls
	var params map[string]any
	if err := json.Unmarshal(message.Params, &params); err != nil {
		t.Fatal(err)
	}
	if message.Method != "Page.startScreencast" || params["maxHeight"] != float64(720) || params["everyNthFrame"] != float64(1) {
		t.Fatal("unbounded video capture", params)
	}
	s.m.StopViews()
	select {
	case <-ctx.Done():
	default:
		t.Fatal("disconnect retained video capture")
	}
}

func TestWaitReturnsNeedsUserAndSnapshotWithoutExpandingAuthority(t *testing.T) {
	s, _ := protocolSession(t, func(message cdpMessage) (any, error) {
		switch helperOperation(message) {
		case "scan_blockers":
			return evaluated(map[string]any{"blockers": []any{map[string]any{"kind": "scope"}}}), nil
		case "snapshot":
			return evaluated(map[string]any{"elements": []any{}, "text": "fixture page"}), nil
		default:
			return evaluated(map[string]any{"ready": "complete"}), nil
		}
	})
	out, err := s.m.waitUntil(context.Background(), s, map[string]any{"until": "text", "text": "waiting", "timeout_ms": 1000, "snapshot": true})
	if err != nil || out["state"] != "needs_user" || out["snapshot"] == nil {
		t.Fatal("wait hid scope handoff", out, err)
	}
	if len(s.scope.Strings()) != 1 || len(s.cp.Effects) != 0 {
		t.Fatal("waiting widened scope or submitted")
	}
	if _, err = s.m.waitUntil(context.Background(), s, map[string]any{"until": "idle", "timeout_ms": -1}); err == nil {
		t.Fatal("invalid wait budget accepted")
	}
}
