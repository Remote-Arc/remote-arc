package takeover

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestFingerprintDoesNotTraverseOutsideNestedOrSubmoduleContent(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "normal.txt"), "fixture")
	write(t, filepath.Join(root, "nested", ".git"), "gitdir: elsewhere")
	write(t, filepath.Join(root, "nested", "file.txt"), "nested private")
	write(t, filepath.Join(root, "name "), "unsupported path")
	for _, tc := range []struct{ selection, path, kind, want string }{
		{filepath.Join(root, "selected"), "normal.txt", "tracked", "outside_selection"},
		{root, "name ", "tracked", "unsupported_path"},
		{root, "nested/file.txt", "tracked", "nested_repository"},
		{root, "normal.txt", "submodule", "submodule_not_inspected"},
		{root, "missing.txt", "tracked", "unreadable"},
	} {
		change := FileChange{Path: tc.path, Kind: tc.kind}
		budget := int64(maxHashBytes)
		fingerprintFile(tc.selection, root, &change, &budget)
		if change.Content != tc.want || change.SHA256 != "" || budget != maxHashBytes {
			t.Fatalf("unsafe fingerprint %+v: %+v budget=%d", tc, change, budget)
		}
	}
	for _, tc := range []struct {
		err  error
		want string
	}{{errGitLimit, "git_output_limit_reached"}, {errGitFormat, "unsupported_git_output"}, {context.Canceled, "inspection_cancelled_or_timed_out"}, {context.DeadlineExceeded, "inspection_cancelled_or_timed_out"}} {
		if got := inspectionFailure(tc.err); got != tc.want {
			t.Fatalf("failure classification %v: %s", tc.err, got)
		}
	}
	var snapshot WorkspaceSnapshot
	if err := parseStatus([]byte("1 M. S... 100644 100644 100644 abc def module\x00"), &snapshot); err != nil || len(snapshot.Changes) != 1 || snapshot.Changes[0].Kind != "submodule" {
		t.Fatal("submodule porcelain misclassified", snapshot, err)
	}
	worktrees, err := parseWorktrees([]byte("worktree " + root + "\x00bare\x00\x00"))
	if err != nil || !worktrees[0].Bare {
		t.Fatal(worktrees, err)
	}
	if _, err := parseWorktrees([]byte("worktree relative\x00\x00")); !errors.Is(err, errGitLimit) {
		t.Fatal("relative worktree accepted", err)
	}
}

func TestRecentDiscoveryAndCancellationKeepSessionContentsPrivate(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("CODEX_HOME", home)
	fixture(t, "codex", t.TempDir(), filepath.Join(home, "sessions", "session.jsonl"), "fixture")
	result, err := DiscoverRecent(context.Background(), "codex", 1)
	if err != nil || len(result.Sessions) != 1 || result.Sessions[0].ID != "fixture" {
		t.Fatal(result, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err = DiscoverRecent(ctx, "codex", 1); err == nil {
		t.Fatal("cancelled scan ran")
	}
	// A file at the configured source root is a configuration error, never a
	// session to ingest or an empty successful discovery.
	file := filepath.Join(home, "file")
	write(t, file, "PRIVATE_BODY")
	if _, err = Discover(context.Background(), t.TempDir(), "codex", file, 1); err == nil {
		t.Fatal("file source root accepted")
	}
	if data, err := os.ReadFile(file); err != nil || string(data) != "PRIVATE_BODY" {
		t.Fatal("read-only discovery changed source", err)
	}
}
