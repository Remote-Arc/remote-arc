package workspace

import (
	"context"
	"encoding/json"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGoalWorkspaceRejectsMalformedOwnershipAndInputs(t *testing.T) {
	dir := repository(t)
	m := &Manager{}
	ctx := context.Background()
	for _, tt := range []struct{ task, op, action string }{
		{"bad/path", "op", "create"}, {"", "op", "create"},
		{"ok", "space is invalid", "create"},
		{"ok", "op", "bad"},
		{"ok", "op", ""},
		{strings.Repeat("x", 101), "op", "create"},
	} {
		if _, err := m.Call(ctx, map[string]any{"workspace": dir, "task_id": tt.task, "operation_id": tt.op, "action": tt.action}, protocol.Policy{}); err == nil {
			t.Fatalf("unsafe operation accepted: %+v", tt)
		}
	}
	args := map[string]any{"workspace": dir, "task_id": "owned", "operation_id": "create", "action": "create"}
	outside := t.TempDir()
	if _, err := m.Call(ctx, args, protocol.Policy{WorkspaceRoots: []string{outside}}); err == nil {
		t.Fatal("write location ignored")
	}
	if _, err := m.Call(ctx, args, protocol.Policy{TaskWorkspaceRoot: outside}); err == nil {
		t.Fatal("task-scoped ownership ignored")
	}
	if _, err := m.Call(ctx, map[string]any{"workspace": filepath.Join(dir, "missing"), "task_id": "owned", "operation_id": "create", "action": "create"}, protocol.Policy{}); err == nil {
		t.Fatal("nonexistent repo was accepted")
	}
	if _, err := m.Call(ctx, map[string]any{"workspace": dir, "task_id": "no-workspace", "operation_id": "status", "action": "status"}, protocol.Policy{}); err == nil {
		t.Fatal("status accepted without owned workspace")
	}
	created, err := m.Call(ctx, args, protocol.Policy{})
	if err != nil {
		t.Fatal(err)
	}
	candidate := created["path"].(string)
	status, err := m.Call(ctx, map[string]any{"workspace": dir, "task_id": "owned", "operation_id": "status", "action": "status"}, protocol.Policy{})
	if err != nil || status["git_status"] == nil {
		t.Fatalf("status missing: %+v %v", status, err)
	}
	file := filepath.Join(candidate, "file.txt")
	os.WriteFile(file, []byte("pending"), 0600)
	status, err = m.Call(ctx, map[string]any{"workspace": dir, "task_id": "owned", "operation_id": "dirty-status", "action": "status"}, protocol.Policy{})
	if err != nil || !strings.Contains(status["git_status"].(string), "file.txt") {
		t.Fatalf("dirty status suppressed: %+v %v", status, err)
	}
	fingerprint, err := m.Call(ctx, map[string]any{"workspace": dir, "task_id": "owned", "operation_id": "fingerprint", "action": "fingerprint"}, protocol.Policy{})
	if err != nil || fingerprint["tree"] == nil {
		t.Fatalf("fingerprint not computed: %+v %v", fingerprint, err)
	}
}

func TestGoalWorkspaceRejectsCorruptedReceipts(t *testing.T) {
	dir := repository(t)
	ctx := context.Background()
	m := &Manager{}
	base := map[string]any{"workspace": dir, "task_id": "trust", "operation_id": "create", "action": "create"}
	created, err := m.Call(ctx, base, protocol.Policy{})
	if err != nil {
		t.Fatal(err)
	}
	taskState := filepath.Join(dir, ".remotearc-goals", "trust", "state.json")
	original, err := os.ReadFile(taskState)
	if err != nil {
		t.Fatal(err)
	}
	var valid map[string]any
	if err := json.Unmarshal(original, &valid); err != nil {
		t.Fatal(err)
	}
	for _, tt := range []struct {
		name   string
		modify func(map[string]any)
	}{
		{"corrupted JSON", nil},
		{"wrong version", func(x map[string]any) { x["version"] = 99 }},
		{"wrong task", func(x map[string]any) { x["task_id"] = "someone-else" }},
		{"wrong root", func(x map[string]any) { x["root"] = t.TempDir() }},
		{"missing operations", func(x map[string]any) { delete(x, "operations") }},
		{"foreign candidate", func(x map[string]any) { x["path"] = t.TempDir() }},
		{"wrong generation", func(x map[string]any) { x["generation"] = 42 }},
	} {
		t.Run(tt.name, func(t *testing.T) {
			copyOf := map[string]any{}
			for k, v := range valid {
				copyOf[k] = v
			}
			bytes := []byte("{invalid")
			if tt.modify != nil {
				tt.modify(copyOf)
				bytes, _ = json.Marshal(copyOf)
			}
			if err := os.WriteFile(taskState, bytes, 0600); err != nil {
				t.Fatal(err)
			}
			defer os.WriteFile(taskState, original, 0600)
			_, err := m.Call(ctx, map[string]any{"workspace": dir, "task_id": "trust", "operation_id": "read-" + strings.ReplaceAll(tt.name, " ", "-"), "action": "status"}, protocol.Policy{})
			if err == nil {
				t.Fatalf("corrupted state %q accepted", tt.name)
			}
			if _, err := os.Stat(created["path"].(string)); err != nil {
				t.Fatalf("invalid state affected original candidate: %v", err)
			}
		})
	}
}
