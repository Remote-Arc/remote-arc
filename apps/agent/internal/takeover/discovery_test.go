package takeover

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
}

func repo(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	cmd := exec.Command("git", "init", "-q", root)
	if data, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git init: %s %v", data, err)
	}
	return root
}

func fixture(t *testing.T, source, cwd, path, id string) {
	t.Helper()
	var r any
	if source == "codex" {
		r = map[string]any{"type": "session_meta", "payload": map[string]any{"id": id, "cwd": cwd}}
	} else {
		r = map[string]any{"type": "user", "sessionId": id, "cwd": cwd, "message": map[string]any{"role": "user", "content": "PRIVATE_BODY_MUST_NOT_APPEAR"}}
	}
	b, err := json.Marshal(r)
	if err != nil {
		t.Fatal(err)
	}
	write(t, path, string(b)+"\n"+`{"type":"response_item","payload":{"type":"message","role":"assistant","content":"PRIVATE_TOOL_OR_REASONING"}}`+"\n")
}

func TestDiscoveryProjectScopeAndPrivacy(t *testing.T) {
	root, other, store := repo(t), repo(t), t.TempDir()
	write(t, filepath.Join(root, "draft.txt"), "WORKSPACE_CONTENT_MUST_STAY")
	first := filepath.Join(store, "2026", "10", "22", "one.jsonl")
	second := filepath.Join(store, "2026", "10", "22", "two.jsonl")
	fixture(t, "codex", root, first, "first")
	fixture(t, "codex", root, second, "second")
	fixture(t, "codex", other, filepath.Join(store, "other.jsonl"), "other")
	sub := filepath.Join(root, "src")
	if err := os.Mkdir(sub, 0700); err != nil {
		t.Fatal(err)
	}
	fixture(t, "codex", sub, filepath.Join(store, "sub.jsonl"), "subdirectory")
	nested := filepath.Join(root, "nested")
	write(t, filepath.Join(nested, ".git"), "gitdir: elsewhere")
	fixture(t, "codex", nested, filepath.Join(store, "nested.jsonl"), "nested-project")
	fixture(t, "codex", root+"-sibling", filepath.Join(store, "sibling.jsonl"), "sibling")
	write(t, filepath.Join(store, "bad.jsonl"), "bad data")
	write(t, filepath.Join(store, "not-a-session.txt"), "ignored")
	old := time.Now().Add(-time.Hour)
	if err := os.Chtimes(first, old, old); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := Run(context.Background(), []string{"takeover", "--workspace", root, "--source", "codex", "--sessions-root", store}, &output); err != nil {
		t.Fatal(err)
	}
	var d Discovery
	if err := json.Unmarshal(output.Bytes(), &d); err != nil {
		t.Fatal(err)
	}
	if d.Version != Version || len(d.Sessions) != 3 || d.Skipped != 1 || d.Limited || len(d.Sources) != 1 || d.Sources[0].Status != "available" {
		t.Fatalf("discovery %+v", d)
	}
	if d.Sessions[2].ID != "first" {
		t.Fatal("sessions not sorted by modification time")
	}
	for _, value := range []string{"PRIVATE_BODY_MUST_NOT_APPEAR", "PRIVATE_TOOL_OR_REASONING", "WORKSPACE_CONTENT_MUST_STAY", "nested-project", "sibling", "\"other\""} {
		if strings.Contains(output.String(), value) {
			t.Fatalf("scope/privacy leak: %s", value)
		}
	}
	if data, err := os.ReadFile(filepath.Join(root, "draft.txt")); err != nil || string(data) != "WORKSPACE_CONTENT_MUST_STAY" {
		t.Fatal("workspace changed")
	}
	if _, err := os.Stat(filepath.Join(root, ".remotearc")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("unexpected local state")
	}
	d, err := Discover(context.Background(), root, "codex", store, 1)
	if err != nil || len(d.Sessions) != 1 || !d.Limited {
		t.Fatal("result limit ignored", d, err)
	}
}

func TestDefaultStoresAndClaudeSubagentExclusion(t *testing.T) {
	root, codexHome, claudeHome := repo(t), t.TempDir(), t.TempDir()
	fixture(t, "codex", root, filepath.Join(codexHome, "sessions", "one.jsonl"), "codex-local")
	fixture(t, "claude", root, filepath.Join(claudeHome, "projects", "project", "one.jsonl"), "claude-local")
	fixture(t, "claude", root, filepath.Join(claudeHome, "projects", "project", "session", "subagents", "hidden.jsonl"), "claude-child")
	t.Setenv("CODEX_HOME", codexHome)
	t.Setenv("CLAUDE_CONFIG_DIR", claudeHome)
	d, err := Discover(context.Background(), root, "all", "", 20)
	if err != nil || len(d.Sessions) != 2 || len(d.Sources) != 2 {
		t.Fatalf("default stores %+v %v", d, err)
	}
	for _, s := range d.Sessions {
		if s.ID == "claude-child" {
			t.Fatal("included subagent")
		}
	}
	t.Setenv("CODEX_HOME", "")
	t.Setenv("CLAUDE_CONFIG_DIR", "")
	if got := sourceRoot("codex", "fixture-home"); got != filepath.Join("fixture-home", ".codex", "sessions") {
		t.Fatal(got)
	}
	if got := sourceRoot("claude", "fixture-home"); got != filepath.Join("fixture-home", ".claude", "projects") {
		t.Fatal(got)
	}
}

func TestMissingUnsupportedAndBoundedMetadata(t *testing.T) {
	root, store := repo(t), t.TempDir()
	for _, source := range []string{"codex", "claude"} {
		d, err := Discover(context.Background(), root, source, filepath.Join(store, "missing"), 20)
		if err != nil || len(d.Sessions) != 0 || d.Sources[0].Status != "not_found" {
			t.Fatal("missing store should be explicit", d, err)
		}
	}
	for _, data := range []string{`{"type":"unknown"}`, `{"type":"session_meta","payload":{"id":"x","cwd":"relative/path"}}`, strings.Repeat("x", metadataBytes) + "\n"} {
		path := filepath.Join(store, "unsupported.jsonl")
		write(t, path, data)
		if _, err := sessionMeta("codex", path); err == nil {
			t.Fatal("accepted unsupported/oversized metadata")
		}
	}
	path := filepath.Join(store, "with-preamble.jsonl")
	fixture(t, "claude", root, path, "after-preamble")
	data, _ := os.ReadFile(path)
	write(t, path, "bad line\n{\"type\":\"file-history-snapshot\"}\n"+string(data))
	if s, err := sessionMeta("claude", path); err != nil || s.ID != "after-preamble" {
		t.Fatal("metadata after initial bookkeeping", s, err)
	}
	fixture(t, "codex", root, path, strings.Repeat("a", 257))
	if _, err := sessionMeta("codex", path); err == nil {
		t.Fatal("unbounded session ID")
	}
	if _, err := sessionMeta("codex", store); err == nil {
		t.Fatal("read directory as session")
	}
	if _, err := sessionMeta("codex", filepath.Join(store, "missing.jsonl")); err == nil {
		t.Fatal("read missing session")
	}
	if _, err := Discover(context.Background(), root, "codex", path, 20); err == nil {
		t.Fatal("accepted a file as session root")
	}
}

type brokenWriter struct{}

func (brokenWriter) Write([]byte) (int, error) { return 0, errors.New("fixture write failure") }

func TestArgumentsCancellationAndDirectorySelection(t *testing.T) {
	root, store := repo(t), t.TempDir()
	for _, args := range [][]string{{}, {"other"}, {"takeover"}, {"takeover", "--bad"}, {"takeover", "--workspace", root, "extra"}, {"takeover", "--workspace", root, "--source", "other"}, {"takeover", "--workspace", root, "--sessions-root", store}, {"takeover", "--workspace", root, "--limit", "0"}, {"takeover", "--workspace", root, "--limit", "101"}, {"takeover", "--workspace", filepath.Join(store, "missing")}} {
		var out bytes.Buffer
		if err := Run(context.Background(), args, &out); err == nil {
			t.Fatalf("accepted %v", args)
		}
	}
	for _, flag := range []string{"--help", "-h"} {
		var out bytes.Buffer
		if err := Run(context.Background(), []string{"takeover", flag}, &out); err != nil || !strings.Contains(out.String(), "Does not return conversation text") {
			t.Fatal("help", err)
		}
	}
	if err := Run(context.Background(), []string{"takeover", "--help"}, brokenWriter{}); err == nil {
		t.Fatal("ignored writer error")
	}
	if err := Run(context.Background(), []string{"takeover", "--workspace", root, "--source", "codex", "--sessions-root", store}, brokenWriter{}); err == nil {
		t.Fatal("ignored JSON writer error")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := Discover(ctx, root, "codex", store, 20); err == nil {
		t.Fatal("ignored cancellation")
	}
	t.Setenv("GIT_DIR", filepath.Join(store, "wrong-repo"))
	t.Setenv("GIT_WORK_TREE", store)
	if _, err := workspaceDirectory(context.Background(), root); err != nil {
		t.Fatal("inherited Git variables redirected workspace", err)
	}
	t.Setenv("PATH", "")
	if _, err := workspaceDirectory(context.Background(), store); err != nil {
		t.Fatal("plain directories must not require Git", err)
	}
	file := filepath.Join(store, "file.txt")
	write(t, file, "fixture")
	if _, err := workspaceDirectory(context.Background(), file); err == nil {
		t.Fatal("accepted file as workspace")
	}
}

func TestSymlinksAndDirectoryStoresAreNotFollowed(t *testing.T) {
	root, store, outside := repo(t), t.TempDir(), t.TempDir()
	path := filepath.Join(outside, "private.jsonl")
	fixture(t, "codex", root, path, "outside")
	link := filepath.Join(store, "link.jsonl")
	if err := os.Symlink(path, link); err != nil {
		t.Skip("symlink creation unavailable", err)
	}
	if _, err := sessionMeta("codex", link); err == nil {
		t.Fatal("followed session symlink")
	}
	if err := os.Symlink(outside, filepath.Join(store, "directory")); err != nil {
		t.Fatal(err)
	}
	d, err := Discover(context.Background(), root, "codex", store, 20)
	if err != nil || len(d.Sessions) != 0 || d.Skipped != 2 {
		t.Fatal("followed discovery symlink", d, err)
	}
	d, err = Discover(context.Background(), root, "codex", filepath.Join(store, "directory"), 20)
	if err != nil || len(d.Sessions) != 0 || d.Sources[0].Status != "symlink_not_followed" {
		t.Fatal("followed root symlink", d, err)
	}
}
