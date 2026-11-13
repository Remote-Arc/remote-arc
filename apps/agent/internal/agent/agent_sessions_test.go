package agent

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

func gitRun(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@example.com", "GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@example.com")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v %s", args, err, out)
	}
}

func writeSession(t *testing.T, path, id, cwd string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	meta, _ := json.Marshal(map[string]any{"type": "session_meta", "payload": map[string]any{"id": id, "cwd": cwd}})
	body := string(meta) + "\n" + `{"type":"response_item","payload":{"role":"user","content":"PRIVATE_PROMPT_TEXT"}}` + "\n"
	if err := os.WriteFile(path, []byte(body), 0600); err != nil {
		t.Fatal(err)
	}
}

// The agent must find Codex sessions through a linked home (Windows users
// often junction ~/.codex to another drive), report each worktree's Git state,
// and never return conversation text or sensitive paths.
func TestListAgentSessionsFindsLinkedHomeAndWorktrees(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink fixture; Windows junctions are covered by policy canonicalization")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git unavailable")
	}
	home, store, projects := t.TempDir(), t.TempDir(), t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("REMOTEARC_HOME", home)
	t.Setenv("CODEX_HOME", "")
	t.Setenv("CLAUDE_CONFIG_DIR", filepath.Join(home, "no-claude"))
	if err := os.Symlink(store, filepath.Join(home, ".codex")); err != nil {
		t.Skip(err)
	}
	repo := filepath.Join(projects, "app")
	if err := os.MkdirAll(repo, 0700); err != nil {
		t.Fatal(err)
	}
	gitRun(t, repo, "init", "-q", "-b", "main")
	os.WriteFile(filepath.Join(repo, "README.md"), []byte("x\n"), 0600)
	gitRun(t, repo, "add", ".")
	gitRun(t, repo, "commit", "-q", "-m", "init")
	worktree := filepath.Join(projects, ".app-feature")
	gitRun(t, repo, "worktree", "add", "-q", "-b", "feature", worktree)
	os.WriteFile(filepath.Join(worktree, "new.txt"), []byte("y\n"), 0600)

	secretDir := filepath.Join(home, ".ssh", "work")
	writeSession(t, filepath.Join(store, "sessions", "2026", "10", "24", "rollout-a.jsonl"), "task-a", worktree)
	writeSession(t, filepath.Join(store, "sessions", "2026", "10", "24", "rollout-b.jsonl"), "task-b", secretDir)
	os.WriteFile(filepath.Join(store, "auth.json"), []byte(`{"token":"SECRET_TOKEN"}`), 0600)

	got, err := listAgentSessions(context.Background(), map[string]any{"source": "codex"}, protocol.Policy{})
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(got)
	text := string(raw)
	for _, leak := range []string{"PRIVATE_PROMPT_TEXT", "SECRET_TOKEN", "auth.json", secretDir} {
		if strings.Contains(text, leak) {
			t.Fatalf("result leaked %q: %s", leak, text)
		}
	}
	result := got.(agentSessionsResult)
	if len(result.Sessions) != 2 || result.Sources[0].Status != "available" {
		t.Fatalf("linked Codex home not scanned: %s", text)
	}
	byID := map[string]agentSession{}
	for _, s := range result.Sessions {
		byID[s.ID] = s
	}
	realWorktree, _ := filepath.EvalSymlinks(worktree)
	if wd := byID["task-a"].WorkingDir; wd != worktree && wd != realWorktree {
		t.Fatalf("worktree cwd missing: %s", text)
	}
	if byID["task-b"].WorkingDir != "" {
		t.Fatalf("sensitive cwd returned: %s", text)
	}
	if !byID["task-a"].RecentActivity {
		t.Fatalf("fresh session not marked recent: %s", text)
	}
	if len(result.Workspaces) != 1 {
		t.Fatalf("expected one inspected workspace: %s", text)
	}
	w := result.Workspaces[0]
	if w.Branch == "" || !strings.Contains(w.Branch, "feature") || !w.LinkedWorktree || w.ChangedFiles != 1 {
		t.Fatalf("worktree git summary wrong: %+v", w)
	}

	// Workspace filter and git:false keep it cheap; bad sources are rejected.
	scoped, err := listAgentSessions(context.Background(), map[string]any{"workspace": worktree, "git": false}, protocol.Policy{})
	if err != nil || len(scoped.(agentSessionsResult).Sessions) != 1 || len(scoped.(agentSessionsResult).Workspaces) != 0 {
		t.Fatalf("workspace filter wrong: %+v %v", scoped, err)
	}
	if _, err := listAgentSessions(context.Background(), map[string]any{"source": "cursor"}, protocol.Policy{}); err == nil {
		t.Fatal("accepted unknown source")
	}
	if _, err := listAgentSessions(context.Background(), map[string]any{"workspace": filepath.Join(home, ".ssh")}, protocol.Policy{}); err == nil {
		t.Fatal("accepted sensitive workspace")
	}
}
