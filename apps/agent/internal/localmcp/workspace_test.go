package localmcp

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/execution"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/policy"
)

func workspaceClient(t *testing.T, root string) (context.Context, *mcp.ClientSession) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	core := execution.New("safe")
	s, err := WorkspaceServer(core, "workspace-test", root)
	if err != nil {
		cancel()
		core.Close()
		t.Fatal(err)
	}
	clientTransport, serverTransport := mcp.NewInMemoryTransports()
	done := make(chan error, 1)
	go func() { done <- s.Run(ctx, serverTransport) }()
	client := mcp.NewClient(&mcp.Implementation{Name: "scope-test", Version: "1"}, nil)
	session, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		cancel()
		core.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		session.Close()
		cancel()
		core.Close()
		select {
		case <-done:
		case <-time.After(time.Second):
			t.Error("workspace server leaked")
		}
	})
	return ctx, session
}

func put(t *testing.T, path, value string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(value), 0600); err != nil {
		t.Fatal(err)
	}
}

func callText(t *testing.T, ctx context.Context, session *mcp.ClientSession, tool string, args map[string]any, blocked bool) string {
	t.Helper()
	r, err := session.CallTool(ctx, &mcp.CallToolParams{Name: tool, Arguments: args})
	if blocked {
		if err == nil && !r.IsError {
			t.Fatalf("%s allowed blocked call: %+v", tool, args)
		}
		if err != nil {
			return err.Error()
		}
	} else if err != nil || r.IsError {
		t.Fatalf("%s failed: %+v / %v", tool, r, err)
	}
	return r.Content[0].(*mcp.TextContent).Text
}

func TestWorkspaceMCPFiltersToolsAndEnforcesPathPolicy(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	root := filepath.Join(home, "project")
	file := filepath.Join(root, "visible.txt")
	outside := filepath.Join(home, "project-other", "outside.txt")
	private := filepath.Join(root, "private-codex", "session.jsonl")
	put(t, file, "VISIBLE_WORKSPACE_CONTENT")
	put(t, outside, "OUTSIDE_CANARY")
	put(t, filepath.Join(root, ".env"), "SECRET_CANARY")
	put(t, private, "SESSION_CANARY")
	t.Setenv("CODEX_HOME", filepath.Dir(private))
	ctx, session := workspaceClient(t, root)
	listed, err := session.ListTools(ctx, nil)
	if err != nil || len(listed.Tools) != 5 {
		t.Fatal("unexpected workspace tools", err)
	}
	for _, tool := range listed.Tools {
		if tool.Name != "remote_arc_status" && !workspaceTools[tool.Name] {
			t.Fatal("device-level tool exposed", tool.Name)
		}
		if tool.Annotations == nil || !tool.Annotations.ReadOnlyHint {
			t.Fatal("read-only tool annotation missing")
		}
	}
	status := callText(t, ctx, session, "remote_arc_status", nil, false)
	var value map[string]any
	if err := json.Unmarshal([]byte(status), &value); err != nil {
		t.Fatal(err)
	}
	canonical, err := policy.Canonical(root)
	if err != nil || value["workspace"] != canonical || value["scope"] != "workspace-read-only" || value["mode"] != "safe" || value["root_available"] != true {
		t.Fatal(value, err)
	}
	if text := callText(t, ctx, session, "read_file", map[string]any{"path": file}, false); !strings.Contains(text, "VISIBLE_WORKSPACE_CONTENT") {
		t.Fatal(text)
	}
	callText(t, ctx, session, "read_binary_file", map[string]any{"path": file}, false)
	callText(t, ctx, session, "get_file_info", map[string]any{"path": file}, false)
	listing := callText(t, ctx, session, "list_directory", map[string]any{"path": root, "depth": 3}, false)
	if strings.Contains(listing, ".env") || strings.Contains(listing, "private-codex") {
		t.Fatal("protected entry exposed", listing)
	}
	for _, tool := range []string{"read_file", "read_binary_file", "get_file_info", "list_directory"} {
		for _, path := range []string{outside, filepath.Join(root, "..", "project-other", "outside.txt"), filepath.Join(root, ".env"), private} {
			text := callText(t, ctx, session, tool, map[string]any{"path": path}, true)
			if strings.Contains(text, "CANARY") {
				t.Fatal("blocked file contents exposed")
			}
		}
	}
	for _, tool := range []string{"list_processes", "list_undo_actions", "browse_directories", "write_file", "start_process"} {
		callText(t, ctx, session, tool, map[string]any{"path": file, "content": "changed", "command": "unexpected"}, true)
	}
	current, err := os.ReadFile(file)
	if err != nil || string(current) != "VISIBLE_WORKSPACE_CONTENT" {
		t.Fatal("workspace mutated", err)
	}
}

func TestWorkspaceMCPRejectsSymlinkEscapes(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	root, outside := filepath.Join(home, "project"), filepath.Join(home, "outside")
	put(t, filepath.Join(root, "inside.txt"), "visible")
	put(t, filepath.Join(outside, "private.txt"), "OUTSIDE_CANARY")
	if err := os.Symlink(outside, filepath.Join(root, "escape")); err != nil {
		t.Skip("symlink unavailable on this host", err)
	}
	ctx, session := workspaceClient(t, root)
	for _, tool := range []string{"read_file", "read_binary_file", "get_file_info", "list_directory"} {
		callText(t, ctx, session, tool, map[string]any{"path": filepath.Join(root, "escape", "private.txt")}, true)
	}
	if text := callText(t, ctx, session, "list_directory", map[string]any{"path": root, "depth": 3}, false); strings.Contains(text, "[LINK] escape") || strings.Contains(text, "[DIR] escape") || strings.Contains(text, "private.txt") {
		t.Fatal("out-of-scope link listed", text)
	}
}

func TestWorkspaceMCPFailsClosedIfRootIsReplacedOrMissing(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	root := filepath.Join(home, "project")
	file := filepath.Join(root, "visible.txt")
	put(t, file, "original")
	ctx, session := workspaceClient(t, root)
	if err := os.Rename(root, filepath.Join(home, "original-project")); err != nil {
		t.Fatal(err)
	}
	callText(t, ctx, session, "read_file", map[string]any{"path": file}, true)
	put(t, file, "REPLACED_ROOT_CANARY")
	text := callText(t, ctx, session, "read_file", map[string]any{"path": file}, true)
	if strings.Contains(text, "REPLACED_ROOT_CANARY") {
		t.Fatal("replacement root read")
	}
	var status map[string]any
	json.Unmarshal([]byte(callText(t, ctx, session, "remote_arc_status", nil, false)), &status)
	if status["root_available"] != false {
		t.Fatal("replacement root reported available")
	}
}

func TestWorkspaceMCPRejectsInvalidRootOrBroaderMode(t *testing.T) {
	home := t.TempDir()
	t.Setenv("REMOTEARC_HOME", home)
	file := filepath.Join(home, "file")
	put(t, file, "fixture")
	for _, path := range []string{"", "  ", "relative", file, filepath.Join(home, "missing"), filepath.Join(home, ".remotearc")} {
		core := execution.New("safe")
		_, err := WorkspaceServer(core, "test", path)
		core.Close()
		if err == nil {
			t.Fatalf("invalid root accepted: %q", path)
		}
	}
	for _, mode := range []string{"developer", "managed", "full"} {
		core := execution.New(mode)
		_, err := WorkspaceServer(core, "test", home)
		core.Close()
		if err == nil {
			t.Fatal("broader core accepted", mode)
		}
	}
	t.Setenv("CODEX_HOME", home)
	core := execution.New("safe")
	defer core.Close()
	if _, err := WorkspaceServer(core, "test", home); err == nil {
		t.Fatal("private source root accepted as workspace")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := RunWorkspace(ctx, execution.New("safe"), "test", "relative"); err == nil {
		t.Fatal("invalid root run succeeded")
	}
	t.Setenv("CODEX_HOME", "")
	if err := RunWorkspace(ctx, execution.New("safe"), "test", home); err == nil {
		t.Fatal("cancelled server succeeded")
	}
}
