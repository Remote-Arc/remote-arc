package browserrunner

import (
	"context"
	"encoding/json"
	"testing"
)

func TestChildFrameEventsCannotLeaveStaleContextsOrDriveOtherTargets(t *testing.T) {
	s, calls := protocolSession(t, func(message cdpMessage) (any, error) { return map[string]any{"executionContextId": 23}, nil })
	s.frameAttached("", "", "main")
	s.frameAttached("", "main", "")
	if len(s.frames) != 0 {
		t.Fatal("empty/main frame treated as child")
	}
	s.onChildEvent("child-session", "Page.frameAttached", json.RawMessage(`{"frameId":"child","parentFrameId":"main"}`))
	s.onChildEvent("child-session", "Page.frameNavigated", json.RawMessage(`{"frame":{"id":"child","url":"https://example.test/embedded"}}`))
	if f, ok := s.frameByID("child"); !ok || f.session != "child-session" {
		t.Fatalf("iframe not adopted: %+v", f)
	}
	cdpSession, world, err := s.worldIn(context.Background(), "child")
	if err != nil || cdpSession != "child-session" || world != 23 {
		t.Fatalf("world binding: %s %d %v", cdpSession, world, err)
	}
	s.onChildEvent("child-session", "Runtime.executionContextsCleared", nil)
	if s.frames["child"].world != 0 {
		t.Fatal("destroyed world retained")
	}
	s.onChildEvent("child-session", "Target.attachedToTarget", json.RawMessage(`{"sessionId":"worker","targetInfo":{"type":"worker"}}`))
	s.onChildEvent("child-session", "Page.javascriptDialogOpening", json.RawMessage(`{"type":"prompt","message":"private"}`))
	s.onChildEvent("child-session", "Target.detachedFromTarget", json.RawMessage(`{"sessionId":"child-session"}`))
	if _, ok := s.frameByID("child"); ok {
		t.Fatal("detached frame retained")
	}
	if _, _, err = s.worldIn(context.Background(), "child"); err == nil {
		t.Fatal("world created in missing frame")
	}
	for _, method := range []string{"Page.frameAttached", "Page.frameNavigated", "Runtime.executionContextCreated", "Target.attachedToTarget", "Target.detachedFromTarget", "Page.javascriptDialogOpening"} {
		s.onChildEvent("child-session", method, json.RawMessage("{"))
	}
	s.conn.Close() // settles all preceding protocol writes before examining them
	for len(calls) > 0 {
		message := <-calls
		if message.SessionID == "worker" && message.Method != "Runtime.runIfWaitingForDebugger" {
			t.Fatalf("unrelated target driven: %+v", message)
		}
	}
}

func TestFrameTraversalIsBoundedAndFrameFailureDoesNotFabricateCoordinates(t *testing.T) {
	s, _ := protocolSession(t, func(message cdpMessage) (any, error) { return nil, protocolFailure })
	for id, f := range map[string]*frameInfo{
		"one":    {id: "one", parent: "main", url: "https://example.test/one", seq: 1},
		"two":    {id: "two", parent: "one", url: "https://example.test/two", seq: 2},
		"three":  {id: "three", parent: "two", url: "https://example.test/three", seq: 3},
		"orphan": {id: "orphan", parent: "missing", url: "https://example.test/orphan", seq: 4},
		"cycle":  {id: "cycle", parent: "cycle", url: "https://example.test/cycle", seq: 5},
	} {
		s.frames[id] = f
	}
	frames := s.childFrames()
	if len(frames) != 2 || frames[0].id != "one" || frames[1].id != "two" {
		t.Fatalf("unsafe depth/order: %+v", frames)
	}
	for _, id := range []string{"one", "two", "missing"} {
		if _, _, ok := s.frameOffset(context.Background(), id); ok {
			t.Fatal("fabricated frame position", id)
		}
	}
	if _, _, err := s.worldIn(context.Background(), "one"); err == nil {
		t.Fatal("failed world creation claimed ready")
	}
	if _, err := s.refFrame("f"); err == nil {
		t.Fatal("malformed frame ref accepted")
	}
	if shown, known := s.frameVisibility(context.Background(), *s.frames["one"]); shown || known {
		t.Fatal("failed visibility read claimed known/visible")
	}
	s.frames["one"].session = "owned"
	s.frames["two"].session = "other"
	s.frames["two"].world = 9
	s.frameDetached("one", "swap")
	if _, ok := s.frameByID("one"); !ok {
		t.Fatal("process swap lost frame identity")
	}
	s.childDetached(json.RawMessage(`{"sessionId":"owned"}`))
	if _, ok := s.frameByID("one"); ok {
		t.Fatal("detached child retained")
	}
	if s.frames["two"].world != 9 {
		t.Fatal("another session world changed")
	}
	s.setupChild(s.conn, "failure") // failure must still release the paused iframe
}
