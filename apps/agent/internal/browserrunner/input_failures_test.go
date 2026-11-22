package browserrunner

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestInputFailureReportsWhetherDispatchCouldHaveOccurred(t *testing.T) {
	for _, tc := range []struct {
		name, action, value, key, fail  string
		hasValue, dispatched, reachable bool
	}{
		{"locate click", "click", "", "", "locate", false, false, true},
		{"mouse move", "click", "", "", "mouseMoved", false, false, true},
		{"mouse down", "click", "", "", "mousePressed", false, true, true},
		{"mouse up", "click", "", "", "mouseReleased", false, true, true},
		{"covered click", "click", "", "", "jsclick", false, true, false},
		{"fill locate", "fill", "text", "", "locate", true, false, false},
		{"prepare fill", "fill", "text", "", "prepare_fill", true, false, false},
		{"insert text", "fill", "text", "", "Input.insertText", true, true, false},
		{"clear field", "fill", "", "", "rawKeyDown", true, true, false},
		{"finish fill", "fill", "text", "", "finish_fill", true, true, false},
		{"key focus", "press", "", "Tab", "focus", false, false, false},
		{"key down", "press", "", "Tab", "rawKeyDown", false, true, false},
		{"text key down", "press", "", "Space", "keyDown", false, true, false},
		{"key up", "press", "", "Escape", "keyUp", false, true, false},
		{"stale select", "select", "one", "", "select", true, false, false},
		{"stale checkbox", "uncheck", "", "", "check", false, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, _ := protocolSession(t, func(message cdpMessage) (any, error) {
				op := helperOperation(message)
				var params map[string]any
				_ = json.Unmarshal(message.Params, &params)
				if op == tc.fail || message.Method == tc.fail || params["type"] == tc.fail {
					if tc.fail == "select" || tc.fail == "check" {
						return map[string]any{"exceptionDetails": map[string]any{"exception": map[string]any{"description": "Error: STALE_REF: element was removed"}}}, nil
					}
					return nil, protocolFailure
				}
				if message.Method == "Runtime.evaluate" {
					return evaluated(map[string]any{"reachable": tc.reachable, "label": "fixture control"}), nil
				}
				return map[string]any{}, nil
			})
			_, dispatched, err := s.act(context.Background(), actRequest{SnapshotID: "snapshot", Ref: "e1", Action: tc.action, Value: tc.value, HasValue: tc.hasValue, Key: tc.key})
			if err == nil || dispatched != tc.dispatched {
				t.Fatalf("unsafe dispatch classification: dispatched=%v want=%v error=%v", dispatched, tc.dispatched, err)
			}
		})
	}
}

func TestInputVerificationAndKeyboardGuardDoNotClaimSuccess(t *testing.T) {
	for _, maxlength := range []any{nil, float64(4)} {
		t.Run(map[bool]string{true: "maxlength", false: "unknown limit"}[maxlength != nil], func(t *testing.T) {
			s, _ := protocolSession(t, func(message cdpMessage) (any, error) {
				if message.Method == "Runtime.evaluate" {
					return evaluated(map[string]any{"matched": false, "length": 4, "maxlength": maxlength}), nil
				}
				return map[string]any{}, nil
			})
			_, sent, err := s.act(context.Background(), actRequest{Action: "fill", Ref: "e1", SnapshotID: "snapshot", Value: "too long", HasValue: true})
			if !sent || err == nil || !strings.Contains(err.Error(), "FILL_MISMATCH") {
				t.Fatalf("changed field accepted: %v %v", sent, err)
			}
		})
	}
	s, _ := protocolSession(t, func(message cdpMessage) (any, error) { return nil, protocolFailure })
	for _, request := range []actRequest{{Action: "press", Key: "Tab"}, {Action: "press", Key: "Unsupported"}, {Action: "fill", Ref: "e1"}, {Action: "select", Ref: "e1"}, {Action: "unknown", Ref: "e1"}, {Action: "click", Ref: "f-bad"}} {
		if _, sent, err := s.act(context.Background(), request); err == nil || sent {
			t.Fatalf("invalid/unguarded input dispatched: %+v %v %v", request, sent, err)
		}
	}
}

func TestLostExecutionContextsInvalidateOnlyTheirFrame(t *testing.T) {
	s, _ := protocolSession(t, func(message cdpMessage) (any, error) { return nil, &contextProtocolError{} })
	s.frames["child"] = &frameInfo{id: "child", session: "iframe", world: 7, url: "https://example.test/child"}
	if _, err := s.helperIn(context.Background(), "child", "snapshot", nil, true); err != errStale {
		t.Fatalf("child context error: %v", err)
	}
	if s.frames["child"].world != 0 || s.worldCtx != 1 {
		t.Fatal("child invalidation changed main world")
	}
	if _, err := s.helper(context.Background(), "snapshot", nil, true); err != errStale {
		t.Fatal(err)
	}
	if s.worldCtx != 0 {
		t.Fatal("lost main world retained")
	}
}

type contextProtocolError struct{}

func (*contextProtocolError) Error() string { return "execution context was destroyed" }
