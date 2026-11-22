package execution

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// Every failure must be fail-closed: no file writes, process creation, or
// undo publication when the input is rejected.
func TestToolContractsFailClosedAcrossPermissionModes(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("REMOTEARC_HOME", dir)
	t.Setenv("REMOTEARC_ALLOW_DESTRUCTIVE", "")
	file := filepath.Join(dir, "contract.txt")
	if err := os.WriteFile(file, []byte("unchanged"), 0600); err != nil {
		t.Fatal(err)
	}
	no := false
	cases := []struct {
		label, mode, tool string
		args              map[string]any
		policy            protocol.Policy
		contains          string
	}{
		{"unknown tool", "managed", "not_a_tool", nil, protocol.Policy{}, "blocked"},
		{"read file missing path", "safe", "read_file", nil, protocol.Policy{}, "path"},
		{"binary file wrong path type", "safe", "read_binary_file", map[string]any{"path": true}, protocol.Policy{}, "path"},
		{"browse wrong path type", "safe", "browse_directories", map[string]any{"path": true}, protocol.Policy{}, "path"},
		{"info missing path", "safe", "get_file_info", nil, protocol.Policy{}, "path"},
		{"list missing path", "safe", "list_directory", nil, protocol.Policy{}, "path"},
		{"write disabled in safe", "safe", "write_file", map[string]any{"path": file, "content": "bad"}, protocol.Policy{}, "blocked"},
		{"process disabled in developer", "developer", "start_process", map[string]any{"command": "echo hi"}, protocol.Policy{}, "blocked"},
		{"process command required", "managed", "start_process", nil, protocol.Policy{}, "command"},
		{"process command type", "managed", "start_process", map[string]any{"command": true}, protocol.Policy{}, "command"},
		{"no cwd when roots active", "managed", "start_process", map[string]any{"command": "echo hi"}, protocol.Policy{WorkspaceRoots: []string{dir}}, "cwd"},
		{"cwd out of roots", "managed", "start_process", map[string]any{"command": "echo hi", "cwd": t.TempDir()}, protocol.Policy{WorkspaceRoots: []string{dir}}, ""},
		{"destructive safety guard", "managed", "start_process", map[string]any{"command": "rm -rf /"}, protocol.Policy{}, "Safety Guard"},
		{"wrong managed duration", "managed", "start_process", map[string]any{"command": "echo hi", "background": true, "max_duration_seconds": 0}, protocol.Policy{}, "duration"},
		{"missing process status ID", "managed", "process_status", nil, protocol.Policy{}, "process_id"},
		{"wrong process output ID", "managed", "process_output", map[string]any{"process_id": false}, protocol.Policy{}, "process_id"},
		{"missing stop ID", "managed", "stop_process", nil, protocol.Policy{}, "process_id"},
		{"write path missing", "managed", "write_file", map[string]any{"content": "bad"}, protocol.Policy{}, "path"},
		{"write content missing", "managed", "write_file", map[string]any{"path": file}, protocol.Policy{}, "content"},
		{"write content wrong type", "managed", "write_file", map[string]any{"path": file, "content": true}, protocol.Policy{}, "content"},
		{"edit missing file path", "managed", "edit_block", map[string]any{"old_string": "unchanged", "new_string": "bad"}, protocol.Policy{}, "file_path"},
		{"edit missing old string", "managed", "edit_block", map[string]any{"file_path": file, "new_string": "bad"}, protocol.Policy{}, "old_string"},
		{"edit missing new string", "managed", "edit_block", map[string]any{"file_path": file, "old_string": "unchanged"}, protocol.Policy{}, "new_string"},
		{"undo disabled", "managed", "undo_last_change", nil, protocol.Policy{UndoEnabled: &no}, "disabled"},
		{"undo change disabled", "managed", "undo_change", map[string]any{"action_id": "fake"}, protocol.Policy{UndoEnabled: &no}, "disabled"},
		{"undo ID missing", "managed", "undo_change", nil, protocol.Policy{}, "action_id"},
		{"undo no matching action", "managed", "undo_change", map[string]any{"action_id": "missing"}, protocol.Policy{}, "not found"},
		{"undo no prior changes", "managed", "undo_last_change", nil, protocol.Policy{}, "No reversible"},
	}
	for _, tt := range cases {
		t.Run(tt.label, func(t *testing.T) {
			c := New(tt.mode)
			defer c.Close()
			_, err := c.Call(context.Background(), tt.tool, tt.args, tt.policy)
			if err == nil {
				t.Fatalf("%s accepted bad inputs %#v", tt.tool, tt.args)
			}
			if tt.contains != "" && !strings.Contains(err.Error(), tt.contains) {
				t.Fatalf("error %q did not contain %q", err, tt.contains)
			}
			got, readErr := os.ReadFile(file)
			if readErr != nil || string(got) != "unchanged" {
				t.Fatalf("rejected %s modified file: %q %v", tt.tool, got, readErr)
			}
		})
	}
}
func TestToolEmptyManagedResultsAndSafeGuardOverride(t *testing.T) {
	t.Setenv("REMOTEARC_HOME", t.TempDir())
	c := New("managed")
	defer c.Close()
	for _, tool := range []string{"list_managed_processes", "list_processes", "list_undo_actions"} {
		if _, err := c.Call(context.Background(), tool, nil, protocol.Policy{}); err != nil {
			t.Fatalf("%s failed: %v", tool, err)
		}
	}
	for _, tool := range []string{"process_status", "process_output", "stop_process"} {
		if _, err := c.Call(context.Background(), tool, map[string]any{"process_id": "missing"}, protocol.Policy{}); err == nil {
			t.Fatalf("%s accepted nonexistent ID", tool)
		}
	}
	if err := AssertCommandAllowed("echo safe"); err != nil {
		t.Fatal(err)
	}
	t.Setenv("REMOTEARC_ALLOW_DESTRUCTIVE", "1")
	if err := AssertCommandAllowed("rm -rf /"); err != nil {
		t.Fatalf("explicit local override ignored: %v", err)
	}
}
