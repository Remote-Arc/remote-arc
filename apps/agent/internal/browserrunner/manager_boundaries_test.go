package browserrunner

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

func TestActionValidationPrecedesInputAndSubmitFailuresAreDurable(t *testing.T) {
	s, calls := protocolSession(t, func(message cdpMessage) (any, error) { return nil, protocolFailure })
	for _, args := range []map[string]any{
		{"snapshot_id": "old", "action": "fill", "ref": "e1"},
		{"snapshot_id": "snapshot", "action": "fill", "ref": "e1", "value": strings.Repeat("x", 10001)},
		{"snapshot_id": "snapshot", "action": "fill"},
		{"snapshot_id": "snapshot", "action": "fill", "ref": "e1", "effect": "delete"},
		{"snapshot_id": "snapshot", "action": "press", "key": "Enter"},
	} {
		if _, err := s.m.act(context.Background(), s, args); err == nil {
			t.Fatalf("invalid action accepted: %v", args)
		}
	}
	if len(calls) != 0 {
		t.Fatal("validation failure touched browser")
	}
	_, err := s.m.act(context.Background(), s, map[string]any{"snapshot_id": "snapshot", "action": "press", "key": "Enter", "effect": "submit", "idempotency_key": "submit"})
	if err == nil {
		t.Fatal("failed submit accepted")
	}
	if effect := s.cp.effect("submit"); effect == nil || effect.Status != EffectNotDispatched {
		t.Fatalf("pre-dispatch failure has unsafe replay state: %+v", effect)
	}
	if len(s.cp.Receipts) == 0 || s.cp.Receipts[len(s.cp.Receipts)-1].Outcome != "error" {
		t.Fatal("input failure lacks audit receipt")
	}
	if err = s.flush(); err != nil {
		t.Fatal(err)
	}
	persisted, err := loadCheckpoint(s.cp.SessionID)
	if err != nil || persisted.effect("submit").Status != EffectNotDispatched {
		t.Fatal("effect was not persisted", err)
	}
	// A failed durable write must stop a new submit before browser dispatch.
	if err = os.Remove(checkpointPath(s.cp.SessionID)); err != nil {
		t.Fatal(err)
	}
	if err = os.Mkdir(checkpointPath(s.cp.SessionID), 0700); err != nil {
		t.Fatal(err)
	}
	before := len(calls)
	_, err = s.m.act(context.Background(), s, map[string]any{"snapshot_id": "snapshot", "action": "press", "key": "Enter", "effect": "submit", "idempotency_key": "not-persisted"})
	if err == nil || !strings.Contains(err.Error(), "before sending") {
		t.Fatal("submit proceeded without durable ledger", err)
	}
	if len(calls) != before {
		t.Fatal("browser contacted before submit ledger saved")
	}
}

func TestFormUploadWaitAndConfirmationInputBoundaries(t *testing.T) {
	s, calls := protocolSession(t, func(message cdpMessage) (any, error) { return nil, protocolFailure })
	for _, fields := range []any{nil, []any{}, make([]any, maxFormFields+1), []any{"not an object"}, []any{map[string]any{"ref": "wrong", "action": "fill", "value": "x"}}, []any{map[string]any{"ref": "e1", "action": "fill"}}, []any{map[string]any{"ref": "e1", "action": "fill", "value": strings.Repeat("x", 10001)}}} {
		if _, err := s.m.fillForm(context.Background(), s, map[string]any{"snapshot_id": "snapshot", "fields": fields}); err == nil {
			t.Fatal("invalid batch accepted")
		}
	}
	if len(calls) != 0 {
		t.Fatal("invalid batch touched page")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	out, err := s.m.fillForm(ctx, s, map[string]any{"snapshot_id": "snapshot", "fields": []any{map[string]any{"ref": "e1", "action": "check"}}})
	if err != nil || out["entered"] != 0 {
		t.Fatal("cancelled batch entered data", out, err)
	}
	for _, args := range []map[string]any{{"snapshot_id": "old"}, {"snapshot_id": "snapshot"}} {
		if _, err := s.m.upload(context.Background(), s, args, protocol.Policy{}); err == nil {
			t.Fatal("untrusted upload accepted")
		}
	}
	if _, err := s.m.upload(context.Background(), s, map[string]any{"snapshot_id": "snapshot"}, protocol.Policy{WorkspaceRoots: []string{t.TempDir()}}); err == nil {
		t.Fatal("empty upload path accepted")
	}
	for _, args := range []map[string]any{{"timeout_ms": 1}, {"text": strings.Repeat("x", 201)}, {"url_contains": strings.Repeat("x", 301)}} {
		if _, err := s.m.wait(context.Background(), s, args); err == nil {
			t.Fatal("unbounded wait accepted")
		}
	}
	s.cp.Effects = []Effect{{Key: "effect", Status: EffectUnverified}}
	for _, args := range []map[string]any{{"idempotency_key": "missing"}, {"idempotency_key": "effect", "evidence": "   "}, {"idempotency_key": "effect", "evidence": strings.Repeat("x", 301)}, {"idempotency_key": "effect", "evidence": "missing evidence", "outcome": "not_submitted"}, {"idempotency_key": "effect", "evidence": "missing evidence", "outcome": "invalid"}} {
		if _, err := s.m.resolve(context.Background(), s, args); err == nil {
			t.Fatal("unproved outcome accepted")
		}
		if s.cp.Effects[0].Status != EffectUnverified {
			t.Fatal("rejected confirmation changed outcome")
		}
	}
}

func TestBusyAndClosedSessionsCannotDispatchAndLoadedCheckpointsPause(t *testing.T) {
	s, _ := protocolSession(t, func(message cdpMessage) (any, error) { return nil, protocolFailure })
	s.mu.Lock()
	if s.m.ActiveSessions() != 1 {
		t.Error("busy session omitted from upgrade safety count")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := s.m.Call(ctx, "browser_runner_snapshot", map[string]any{"session_id": s.cp.SessionID}, protocol.Policy{}); err == nil {
		t.Error("cancelled lock wait dispatched")
	}
	s.mu.Unlock()
	s.cp.State = StateClosed
	if _, err := s.m.Call(context.Background(), "browser_runner_snapshot", map[string]any{"session_id": s.cp.SessionID}, protocol.Policy{}); err == nil {
		t.Fatal("closed session dispatched")
	}
	s.cp.State = StateActive
	if _, err := s.m.Call(context.Background(), "unknown_browser_tool", map[string]any{"session_id": s.cp.SessionID}, protocol.Policy{}); err == nil {
		t.Fatal("unknown tool accepted")
	}
	for _, origins := range []any{"https://example.test", []any{7}} {
		if _, err := s.m.Call(context.Background(), "browser_runner_start", map[string]any{"task_id": "other", "allowed_origins": origins}, protocol.Policy{}); err == nil {
			t.Fatal("malformed scope accepted")
		}
	}
	for _, profile := range []string{"your-chrome", "bad profile"} {
		if _, err := s.m.start(context.Background(), map[string]any{"task_id": "other", "allowed_origins": []string{"https://example.test"}, "profile": profile}, protocol.Policy{}); err == nil {
			t.Fatal("invalid profile accepted")
		}
	}
	loaded := &Checkpoint{Version: 1, SessionID: "loaded", Profile: "loaded", State: StateActive, AllowedOrigins: []string{"https://example.test"}}
	if err := loaded.save(s.m.now()); err != nil {
		t.Fatal(err)
	}
	got, err := s.m.get("loaded")
	if err != nil || got.cp.State != StatePaused {
		t.Fatal("restored checkpoint claimed live execution", err)
	}
	for _, body := range []string{"{", `{"version":1,"session_id":"corrupt","profile":"corrupt","allowed_origins":["file:///private"]}`} {
		file := checkpointPath("corrupt")
		if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file, []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := s.m.get("corrupt"); err == nil {
			t.Fatal("corrupt checkpoint adopted")
		}
	}
}

func TestInterruptedSubmitStaysUnknownAndIsNeverAutomaticallyRetried(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s, _ := protocolSession(t, func(message cdpMessage) (any, error) {
		if message.Method == "Input.dispatchKeyEvent" {
			cancel()
			return nil, protocolFailure
		}
		return evaluated(map[string]any{"ready": "complete"}), nil
	})
	_, err := s.m.act(ctx, s, map[string]any{"snapshot_id": "snapshot", "action": "press", "key": "Enter", "effect": "submit", "idempotency_key": "uncertain"})
	if err == nil || !strings.Contains(err.Error(), "effect is unknown") {
		t.Fatal("interrupted input claimed unsent", err)
	}
	if effect := s.cp.effect("uncertain"); effect == nil || effect.Status != EffectUnknown {
		t.Fatal("ambiguous external effect not retained", effect)
	}
	replayed, err := s.m.act(context.Background(), s, map[string]any{"effect": "submit", "idempotency_key": "uncertain"})
	if err != nil || replayed["replayed"] != true {
		t.Fatal("uncertain submit not replayed from ledger", replayed, err)
	}
}

func TestExpiringFormBudgetLeavesEveryFieldUnentered(t *testing.T) {
	s, _ := protocolSession(t, func(message cdpMessage) (any, error) { return nil, protocolFailure })
	s.conn.Close()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	s.dialogs = []string{"dismissed prompt"}
	out, err := s.m.fillForm(ctx, s, map[string]any{"snapshot_id": "snapshot", "fields": []any{map[string]any{"ref": "e1", "action": "check"}, map[string]any{"ref": "e2", "action": "uncheck"}}})
	if err != nil || out["entered"] != 0 || len(out["not_entered"].([]string)) != 2 || out["stopped"] == nil || out["dialogs"] == nil {
		t.Fatal("batch budget silently dropped fields", out, err)
	}
}

func TestForgettingSharedProfilePreservesOtherTaskAndStartupProfileIsImmutable(t *testing.T) {
	s, _ := protocolSession(t, func(message cdpMessage) (any, error) { return evaluated(map[string]any{}), nil })
	if _, err := s.m.start(context.Background(), map[string]any{"task_id": s.cp.SessionID, "allowed_origins": s.cp.AllowedOrigins, "profile": "different"}, protocol.Policy{}); err == nil {
		t.Fatal("active profile changed")
	}
	other := &session{m: s.m, cp: &Checkpoint{Version: 1, SessionID: "other", Profile: s.cp.Profile, State: StatePaused, AllowedOrigins: s.cp.AllowedOrigins}}
	s.m.sessions["other"] = other
	out, err := s.m.close(context.Background(), s, map[string]any{"forget": true})
	if err != nil || out.(map[string]any)["profile_removed"] != false || s.m.sessions["other"] != other {
		t.Fatal("forget removed shared profile or task", out, err)
	}
	if _, err := s.m.Call(context.Background(), "browser_runner_status", nil, protocol.Policy{}); err != nil {
		t.Fatal("empty list request failed", err)
	}
}
