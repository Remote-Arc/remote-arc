package workspace

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

func TestReceiptPruningKeepsCurrentOperationAndBoundsStatus(t *testing.T) {
	dir := repository(t)
	m := &Manager{}
	call := func(action, operation string) (map[string]any, error) {
		return m.Call(context.Background(), map[string]any{"workspace": dir, "task_id": "bounded", "operation_id": operation, "action": action}, protocol.Policy{})
	}
	created, err := call("create", "initial")
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(dir, ".remotearc-goals", "bounded", "state.json")
	data, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	var loaded state
	if err = json.Unmarshal(data, &loaded); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 300; i++ {
		loaded.Operations[fmt.Sprintf("old-%03d", i)] = Receipt{Root: loaded.Root, Path: loaded.Path, Frontier: loaded.Frontier}
	}
	data, err = json.Marshal(loaded)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(file, data, 0600); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 160; i++ {
		if err = os.WriteFile(filepath.Join(created["path"].(string), fmt.Sprintf("long-untracked-file-%03d-%s.txt", i, strings.Repeat("x", 40))), nil, 0600); err != nil {
			t.Fatal(err)
		}
	}
	result, err := call("status", "current")
	if err != nil {
		t.Fatal(err)
	}
	if len(result["git_status"].(string)) != 6000 {
		t.Fatal("status output was not bounded")
	}
	data, err = os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &loaded); err != nil {
		t.Fatal(err)
	}
	// Decode into a fresh map: json.Unmarshal merges maps rather than deleting keys.
	var persisted state
	_ = json.Unmarshal(data, &persisted)
	if len(persisted.Operations) != 256 {
		t.Fatalf("receipt budget: %d", len(persisted.Operations))
	}
	if _, ok := persisted.Operations["current"]; !ok {
		t.Fatal("current operation pruned")
	}
	if bytes, err := os.ReadFile(filepath.Join(dir, "fixture.txt")); err != nil || string(bytes) != "baseline" {
		t.Fatal("root checkout changed", err)
	}
}

func TestWorkspaceRejectsNonRootBrokenStateAndForeignGitIdentity(t *testing.T) {
	dir := repository(t)
	m := &Manager{}
	args := map[string]any{"workspace": dir, "task_id": "identity", "operation_id": "create", "action": "create"}
	nested := filepath.Join(dir, "subdir")
	if err := os.Mkdir(nested, 0700); err != nil {
		t.Fatal(err)
	}
	args["workspace"] = nested
	if _, err := m.Call(context.Background(), args, protocol.Policy{}); err == nil || !strings.Contains(err.Error(), "repository root") {
		t.Fatal(err)
	}
	args["workspace"] = t.TempDir()
	if _, err := m.Call(context.Background(), args, protocol.Policy{}); err == nil {
		t.Fatal("non-Git root accepted")
	}
	args["workspace"] = dir
	if err := os.Remove(nested); err != nil {
		t.Fatal(err)
	}
	created, err := m.Call(context.Background(), args, protocol.Policy{})
	if err != nil {
		t.Fatal(err)
	}
	foreign := repository(t)
	marker := filepath.Join(created["path"].(string), ".git")
	if err = os.WriteFile(marker, []byte("gitdir: "+filepath.Join(foreign, ".git")+"\n"), 0600); err != nil {
		t.Fatal(err)
	}
	args["operation_id"] = "status"
	args["action"] = "status"
	if _, err = m.Call(context.Background(), args, protocol.Policy{}); err == nil || !strings.Contains(err.Error(), "another repository") {
		t.Fatal("foreign Git identity accepted", err)
	}
	stateFile := filepath.Join(dir, ".remotearc-goals", "identity", "state.json")
	if err = os.Remove(stateFile); err != nil {
		t.Fatal(err)
	}
	if err = os.Mkdir(stateFile, 0700); err != nil {
		t.Fatal(err)
	}
	if _, err = m.Call(context.Background(), args, protocol.Policy{}); err == nil {
		t.Fatal("unreadable ownership state accepted")
	}
}
