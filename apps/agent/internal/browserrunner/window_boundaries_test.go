package browserrunner

import (
	"context"
	"encoding/json"
	"errors"
	"runtime"
	"testing"
	"time"
)

func TestWindowErrorsCannotBeReportedAsVisible(t *testing.T) {
	s, _ := protocolSession(t, func(message cdpMessage) (any, error) { return nil, protocolFailure })
	if err := s.setVisible(context.Background(), true); !errors.Is(err, errNoWindow) {
		t.Fatal(err)
	}
	s.proc = &browserProcess{}
	if err := s.setVisible(context.Background(), true); err == nil {
		t.Fatal("failed native window query reported visible")
	}
	if err := s.setVisible(context.Background(), false); err != nil {
		t.Fatal("best effort hide failed task", err)
	}
	if s.windowIsVisible(context.Background()) {
		t.Fatal("unreadable window reported visible")
	}
	if s.awaitState(context.Background(), "normal", 0) {
		t.Fatal("failed window query fulfilled transition")
	}
}

func TestHidingNormalizesWindowAndDoesNotReactivateDismissedHandoff(t *testing.T) {
	if runtime.GOOS == "windows" || runtime.GOOS == "darwin" {
		t.Skip("native raising/restoration is qualified by platform desktop tests")
	}
	var bounds = windowBounds{Left: 20, Top: 20, Width: 900, Height: 600, WindowState: "maximized"}
	s, _ := protocolSession(t, func(message cdpMessage) (any, error) {
		switch message.Method {
		case "Browser.getWindowForTarget":
			return map[string]any{"windowId": 1, "bounds": bounds}, nil
		case "Browser.setWindowBounds":
			var params struct {
				Bounds windowBounds `json:"bounds"`
			}
			if err := json.Unmarshal(message.Params, &params); err != nil {
				return nil, err
			}
			if params.Bounds.WindowState != "" {
				bounds.WindowState = params.Bounds.WindowState
			}
			return map[string]any{}, nil
		case "Runtime.evaluate":
			return evaluated([]int{0, 0, 1360, 980}), nil
		default:
			return map[string]any{}, nil
		}
	})
	s.proc = &browserProcess{}
	if err := s.setVisible(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if b, ok := s.quickWindow(context.Background()); !ok || b.WindowState != "minimized" {
		t.Fatalf("window manager ignored offscreen move but task not minimized: %+v %v", b, ok)
	}
	s.cp.State = StateNeedsUser
	s.cp.AttentionID = "episode"
	s.cp.AttentionPresented = true
	s.cp.AttentionShown = true
	s.showAttention(context.Background())
	if !s.cp.AttentionDismissed {
		t.Fatal("minimized handoff not respected")
	}
	s.cp.State = StateActive
	s.shownForUser = true
	if !s.hideAfterUser(context.Background()) || !s.cp.Headless || s.shownForUser {
		t.Fatal("completed user handoff was not hidden")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if s.awaitState(ctx, "fullscreen", time.Second) {
		t.Fatal("cancelled transition reported complete")
	}
}

func TestAttentionAckAndReplacementRetainOnlyCurrentEpisode(t *testing.T) {
	s, _ := protocolSession(t, func(message cdpMessage) (any, error) { return map[string]any{}, nil })
	s.emitAttention("sign_in")
	if len(s.m.PendingAttention()) != 0 {
		t.Fatal("empty episode emitted notification")
	}
	s.cp.AttentionID = "old"
	s.m.attentionEvents = nil
	s.emitAttention("sign_in")
	s.cp.AttentionID = "new"
	s.emitAttention("otp")
	s.emitAttention("reminder")
	events := s.m.PendingAttention()
	if len(events) != 2 || events[0].EventID != "new" || events[0].Kind == "reminder" {
		t.Fatalf("stale/unsorted notifications: %+v", events)
	}
	s.m.AckAttention(Attention{EventID: "old", Kind: "otp"})
	if len(s.m.PendingAttention()) != 2 {
		t.Fatal("stale acknowledgement removed current event")
	}
	s.m.AckAttention(events[0])
	if len(s.m.PendingAttention()) != 1 {
		t.Fatal("acknowledged event replayed")
	}
	s.clearAttention()
	events = s.m.PendingAttention()
	if len(events) != 1 || events[0].Kind != "resolved" {
		t.Fatalf("resolved event did not replace reminders: %+v", events)
	}
	s.setCallAttentionMode("notify_only")
	if s.cp.AttentionMode != "notify_only" || s.mayShowWindow() {
		t.Fatal("per-call notification-only mode ignored")
	}
	s.updateAttention(context.Background(), []any{map[string]any{"kind": "scope"}})
	if s.cp.State != StateNeedsUser || s.cp.AttentionKind != "scope" {
		t.Fatal("scope boundary was silently expanded")
	}
}
