package takeover

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/policy"
)

func fixtureGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	base := []string{"-c", "user.name=Takeover Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgSign=false", "-c", "core.hooksPath=" + os.DevNull, "-c", "core.autocrlf=false", "-C", dir}
	cmd := exec.Command("git", append(base, args...)...)
	cmd.Env = inspectionEnv()
	b, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("fixture git %v: %v %s", args, err, b)
	}
	return strings.TrimSpace(string(b))
}

func committedRepo(t *testing.T) string {
	t.Helper()
	root := repo(t)
	fixtureGit(t, root, "config", "core.autocrlf", "false")
	for _, name := range []string{"edit.txt", "delete.txt", "move.txt", "src/child.txt"} {
		write(t, filepath.Join(root, name), "original\n")
	}
	fixtureGit(t, root, "add", ".")
	fixtureGit(t, root, "commit", "-qm", "synthetic baseline")
	return root
}

func inspectOK(t *testing.T, root string) WorkspaceInspection {
	t.Helper()
	r, err := InspectWorkspace(context.Background(), root)
	if err != nil || r.Status != "ok" || len(r.Fingerprint) != 64 || r.Consistency != "two_matching_reads" {
		t.Fatalf("inspection: %+v %v", r, err)
	}
	return r
}

func changesByPath(r WorkspaceInspection) map[string]FileChange {
	m := map[string]FileChange{}
	for _, c := range r.Snapshot.Changes {
		m[c.Path] = c
	}
	return m
}

func TestWorkspaceActualGitAndReadOnly(t *testing.T) {
	root := committedRepo(t)
	write(t, filepath.Join(root, "edit.txt"), "unstaged change\n")
	write(t, filepath.Join(root, "staged.txt"), "staged content\n")
	fixtureGit(t, root, "add", "staged.txt")
	fixtureGit(t, root, "mv", "move.txt", "moved.txt")
	if err := os.Remove(filepath.Join(root, "delete.txt")); err != nil {
		t.Fatal(err)
	}
	write(t, filepath.Join(root, "new space 中文.txt"), "PRIVATE_SOURCE_MUST_NOT_APPEAR\n")
	index := filepath.Join(root, ".git", "index")
	before, _ := os.ReadFile(index)
	head := fixtureGit(t, root, "rev-parse", "HEAD")
	r := inspectOK(t, root)
	if r.Snapshot.HEAD != head || r.Snapshot.Branch == "" || !r.Snapshot.Complete || len(r.Snapshot.Worktrees) != 1 {
		t.Fatalf("wrong repo: %+v", r.Snapshot)
	}
	c := changesByPath(r)
	if c["edit.txt"].Worktree != "M" || c["staged.txt"].Index != "A" || c["delete.txt"].Content != "deleted" || c["move.txt"].Index != "D" || c["moved.txt"].Index != "A" || c["new space 中文.txt"].Kind != "untracked" {
		t.Fatalf("changes: %+v", c)
	}
	if c["new space 中文.txt"].SHA256 != digest([]byte("PRIVATE_SOURCE_MUST_NOT_APPEAR\n")) {
		t.Fatal("content hash mismatch")
	}
	after, _ := os.ReadFile(index)
	if !bytes.Equal(before, after) || fixtureGit(t, root, "rev-parse", "HEAD") != head {
		t.Fatal("inspection changed Git state")
	}
	if _, err := os.Stat(index + ".lock"); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("inspection left a lock")
	}
	if inspectOK(t, root).Fingerprint != r.Fingerprint {
		t.Fatal("fingerprint not deterministic")
	}
	encoded, _ := json.Marshal(r)
	if bytes.Contains(encoded, []byte("PRIVATE_SOURCE_MUST_NOT_APPEAR")) {
		t.Fatal("source content leaked")
	}
	write(t, filepath.Join(root, "new space 中文.txt"), "PRIVATE_SOURCE_MUST_NOT_CHANGE\n")
	if inspectOK(t, root).Fingerprint == r.Fingerprint {
		t.Fatal("same status content edit not detected")
	}
}

func TestWorkspaceSubdirectoryAndLinkedWorktrees(t *testing.T) {
	root := committedRepo(t)
	linked := filepath.Join(t.TempDir(), "linked branch")
	fixtureGit(t, root, "worktree", "add", "-qb", "linked-fixture", linked)
	fixtureGit(t, root, "worktree", "lock", "--reason", "PRIVATE_REASON", linked)
	write(t, filepath.Join(linked, "edit.txt"), "outside selection\n")
	write(t, filepath.Join(linked, "src", "child.txt"), "inside selection\n")
	r := inspectOK(t, filepath.Join(linked, "src"))
	if r.Snapshot.Branch != "linked-fixture" || len(r.Snapshot.Changes) != 1 || r.Snapshot.Changes[0].Path != "src/child.txt" || len(r.Snapshot.Worktrees) != 2 {
		t.Fatalf("scope: %+v", r.Snapshot)
	}
	if r.Snapshot.GitDir == r.Snapshot.CommonDir {
		t.Fatal("linked Git directory confused with common repository")
	}
	locked := false
	for _, wt := range r.Snapshot.Worktrees {
		locked = locked || wt.Locked
	}
	encoded, _ := json.Marshal(r)
	if !locked || bytes.Contains(encoded, []byte("PRIVATE_REASON")) {
		t.Fatal("linked metadata privacy")
	}
	fixtureGit(t, root, "worktree", "unlock", linked)
	fixtureGit(t, linked, "checkout", "--detach")
	detached := inspectOK(t, linked)
	if !detached.Snapshot.Detached || detached.Snapshot.Branch != "" {
		t.Fatal("detached state lost")
	}
}

func TestWorkspaceUnbornNonGitAndMissing(t *testing.T) {
	root := repo(t)
	write(t, filepath.Join(root, "first.txt"), "new project")
	r := inspectOK(t, root)
	if !r.Snapshot.Unborn || r.Snapshot.HEAD != "" || len(r.Snapshot.Changes) != 1 {
		t.Fatalf("unborn %+v", r)
	}
	for _, test := range []struct{ path, want string }{{t.TempDir(), "not_git"}, {filepath.Join(t.TempDir(), "missing"), "missing_workspace"}} {
		got, err := InspectWorkspace(context.Background(), test.path)
		if err != nil || got.Status != test.want || got.Fingerprint != "" {
			t.Fatalf("%s: %+v %v", test.want, got, err)
		}
	}
	broken := t.TempDir()
	write(t, filepath.Join(broken, ".git"), "gitdir: does-not-exist\n")
	r, err := InspectWorkspace(context.Background(), broken)
	if err != nil || r.Status != "unavailable" {
		t.Fatal("broken repository reported as non-Git", r, err)
	}
	bare := t.TempDir()
	fixtureGit(t, bare, "init", "--bare", "-q")
	r, err = InspectWorkspace(context.Background(), bare)
	if err != nil || r.Reason != "bare_repository_not_supported" {
		t.Fatal("bare repo", r, err)
	}
}

func TestWorkspaceConcurrentContentAndBranchChanges(t *testing.T) {
	for _, kind := range []string{"same-status-content", "branch", "missing-workspace", "index"} {
		t.Run(kind, func(t *testing.T) {
			root := committedRepo(t)
			write(t, filepath.Join(root, "edit.txt"), "version1")
			r, err := inspectWorkspace(context.Background(), root, func() {
				switch kind {
				case "same-status-content":
					write(t, filepath.Join(root, "edit.txt"), "version2")
				case "branch":
					fixtureGit(t, root, "checkout", "-qb", "new-branch")
				case "index":
					fixtureGit(t, root, "add", "edit.txt")
				case "missing-workspace":
					if err := os.Rename(root, root+"-moved"); err != nil {
						t.Fatal(err)
					}
					t.Cleanup(func() { _ = os.Rename(root+"-moved", root) })
				}
			})
			if err != nil || r.Status == "ok" || r.Fingerprint != "" || (kind != "missing-workspace" && r.Status != "changed_during_capture") {
				t.Fatal("stale fingerprint", r, err)
			}
		})
	}
}

func TestWorkspaceProtectsSensitiveAndLargeFiles(t *testing.T) {
	root := committedRepo(t)
	write(t, filepath.Join(root, ".env"), "SECRET_SENTINEL=do-not-hash\n")
	write(t, filepath.Join(root, "huge.dat"), strings.Repeat("x", maxFileBytes+1))
	write(t, filepath.Join(root, ".gitignore"), "ignored.dat\n")
	write(t, filepath.Join(root, "ignored.dat"), "not included")
	for i := 0; i < 9; i++ {
		write(t, filepath.Join(root, fmt.Sprintf("large-%d.dat", i)), strings.Repeat("a", maxFileBytes))
	}
	r, err := InspectWorkspace(context.Background(), root)
	if err != nil || r.Status != "incomplete" || r.Fingerprint != "" || !r.Snapshot.LimitReached {
		t.Fatal(r, err)
	}
	c := changesByPath(r)
	if c[".env"].Content != "protected_path" || c[".env"].SHA256 != "" || c["huge.dat"].Content != "size_limit" || c["large-8.dat"].Content != "total_limit" {
		t.Fatalf("limits: %+v", c)
	}
	if _, ok := c["ignored.dat"]; ok {
		t.Fatal("ignored files included")
	}
}

func TestWorkspaceExternalProgramsAndEnvironmentNotUsed(t *testing.T) {
	root, other := committedRepo(t), committedRepo(t)
	marker := filepath.ToSlash(filepath.Join(root, "SHOULD_NOT_EXIST"))
	fixtureGit(t, root, "config", "core.fsmonitor", "echo bad > '"+marker+"'")
	fixtureGit(t, root, "config", "filter.evil.clean", "echo bad > '"+marker+"'")
	fixtureGit(t, root, "config", "filter.evil.process", "echo bad > '"+marker+"'")
	fixtureGit(t, root, "config", "filter.evil.required", "true")
	write(t, filepath.Join(root, "edit.txt"), "changed")
	t.Setenv("GIT_DIR", filepath.Join(other, ".git"))
	t.Setenv("GIT_WORK_TREE", other)
	t.Setenv("GIT_INDEX_FILE", filepath.Join(other, ".git", "index"))
	t.Setenv("GIT_CONFIG_COUNT", "1")
	t.Setenv("GIT_CONFIG_KEY_0", "core.fsmonitor")
	t.Setenv("GIT_CONFIG_VALUE_0", "echo bad > '"+marker+"'")
	r := inspectOK(t, root)
	canonical, _ := policy.Canonical(root)
	if r.Snapshot.Root != canonical || len(r.Snapshot.Changes) != 1 {
		t.Fatal("environment redirected inspection")
	}
	write(t, filepath.Join(root, ".gitattributes"), "edit.txt filter=evil\n")
	r, err := InspectWorkspace(context.Background(), root)
	if err != nil || r.Reason != "external_filters_not_supported" || r.Fingerprint != "" {
		t.Fatal(r, err)
	}
	if _, err := os.Stat(filepath.FromSlash(marker)); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("Git executed an external program")
	}
}

func TestInspectionGitCannotInvokeRemoteTransport(t *testing.T) {
	root := committedRepo(t)
	fixtureGit(t, root, "config", "protocol.file.allow", "always")
	// A valid local remote succeeds outside the inspection environment.
	control := exec.Command("git", "-c", "protocol.file.allow=always", "ls-remote", root)
	if b, err := control.CombinedOutput(); err != nil || len(b) == 0 {
		t.Fatalf("control remote: %s %v", b, err)
	}
	binary, err := exec.LookPath("git")
	if err != nil {
		t.Fatal(err)
	}
	g := gitReader{binary: binary, dir: root}
	// Even explicit local configuration cannot authorize a remote helper in
	// the reader's environment. This protects older Git partial-clone paths.
	_, err = g.run(context.Background(), nil, "ls-remote", root)
	if err == nil {
		t.Fatal("remote transport was allowed")
	}
}

func TestWorkspaceConflictsAndUpstream(t *testing.T) {
	root := committedRepo(t)
	base := fixtureGit(t, root, "branch", "--show-current")
	fixtureGit(t, root, "checkout", "-qb", "side")
	write(t, filepath.Join(root, "edit.txt"), "side\n")
	fixtureGit(t, root, "commit", "-qam", "side")
	fixtureGit(t, root, "checkout", base)
	write(t, filepath.Join(root, "edit.txt"), "main\n")
	fixtureGit(t, root, "commit", "-qam", "main")
	fixtureGit(t, root, "branch", "--set-upstream-to=side")
	cmd := exec.Command("git", "-c", "commit.gpgSign=false", "-C", root, "merge", "--no-edit", "side")
	cmd.Env = append(inspectionEnv(), "GIT_AUTHOR_NAME=Fixture", "GIT_AUTHOR_EMAIL=fixture@example.invalid", "GIT_COMMITTER_NAME=Fixture", "GIT_COMMITTER_EMAIL=fixture@example.invalid")
	if _, err := cmd.CombinedOutput(); err == nil {
		t.Fatal("expected fixture conflict")
	}
	r := inspectOK(t, root)
	c := changesByPath(r)["edit.txt"]
	if c.Kind != "unmerged" || c.Index != "U" || c.Worktree != "U" || r.Snapshot.Upstream != "side" || r.Snapshot.Ahead == nil || *r.Snapshot.Ahead != 1 || *r.Snapshot.Behind != 1 {
		t.Fatalf("conflict/upstream: %+v", r.Snapshot)
	}
}

func TestWorkspaceSymlinksAndNestedRepository(t *testing.T) {
	root := committedRepo(t)
	outside := filepath.Join(t.TempDir(), "outside.txt")
	write(t, outside, "SECRET_TARGET")
	if err := os.Symlink(outside, filepath.Join(root, "link.txt")); err != nil {
		t.Skip("symlinks unavailable", err)
	}
	nested := filepath.Join(root, "nested")
	write(t, filepath.Join(nested, "data.txt"), "nested data")
	fixtureGit(t, nested, "init", "-q")
	r, err := InspectWorkspace(context.Background(), root)
	if err != nil || r.Status != "incomplete" || changesByPath(r)["link.txt"].Content != "symlink_not_followed" {
		t.Fatal(r, err)
	}
	for _, c := range r.Snapshot.Changes {
		if strings.HasPrefix(c.Path, "nested") && c.SHA256 != "" {
			t.Fatal("nested repo was hashed")
		}
	}
}

func TestWorkspaceCLIAndUnavailableGit(t *testing.T) {
	for _, args := range [][]string{{"takeover", "workspace"}, {"takeover", "workspace", "--bad"}, {"takeover", "workspace", "--workspace", t.TempDir(), "extra"}} {
		if err := Run(context.Background(), args, &bytes.Buffer{}); err == nil {
			t.Fatalf("accepted %v", args)
		}
	}
	var out bytes.Buffer
	if err := Run(context.Background(), []string{"takeover", "workspace", "--help"}, &out); err != nil || !strings.Contains(out.String(), "two matching reads") {
		t.Fatal("help", err)
	}
	if err := Run(context.Background(), []string{"takeover", "workspace", "--help"}, brokenWriter{}); err == nil {
		t.Fatal("lost help writer error")
	}
	root := t.TempDir()
	if err := Run(context.Background(), []string{"takeover", "workspace", "--workspace", root}, &out); err != nil {
		t.Fatal(err)
	}
	if err := Run(context.Background(), []string{"takeover", "workspace", "--workspace", root}, brokenWriter{}); err == nil {
		t.Fatal("lost JSON writer error")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := InspectWorkspace(ctx, root); err == nil {
		t.Fatal("ignored cancellation")
	}
	file := filepath.Join(root, "file")
	write(t, file, "x")
	if _, err := InspectWorkspace(context.Background(), file); err == nil {
		t.Fatal("accepted file workspace")
	}
	t.Setenv("PATH", "")
	r, err := InspectWorkspace(context.Background(), root)
	if err != nil || r.Reason != "git_not_found" {
		t.Fatal(r, err)
	}
}

func TestGitBoundsAndPorcelain(t *testing.T) {
	b := &cappedOutput{limit: 4}
	if _, err := b.Write([]byte("1234")); err != nil {
		t.Fatal(err)
	}
	if _, err := b.Write([]byte("5")); !errors.Is(err, errGitLimit) || !b.full || b.String() != "1234" {
		t.Fatal("output cap")
	}
	for _, data := range []string{"", "unterminated", "1 bad\x00", "2 rename\x00", "? \x00", "# branch.ab nonsense\x00", "? \xff\x00"} {
		if err := parseStatus([]byte(data), &WorkspaceSnapshot{}); err == nil {
			t.Fatalf("accepted %q", data)
		}
	}
	var s WorkspaceSnapshot
	s.Complete = true
	var status strings.Builder
	status.WriteString("# branch.oid (initial)\x00# branch.head main\x00")
	for i := 0; i <= maxChanges; i++ {
		fmt.Fprintf(&status, "? file-%d\x00", i)
	}
	if err := parseStatus([]byte(status.String()), &s); err != nil || s.Complete || !s.LimitReached || len(s.Changes) != maxChanges {
		t.Fatal("entry bound", err)
	}
	path := "/tmp/space\nand tab\t"
	if runtime.GOOS == "windows" {
		path = "C:/fixture space"
	}
	wt, err := parseWorktrees([]byte("worktree " + path + "\x00HEAD abc\x00detached\x00locked SECRET\x00prunable SECRET\x00\x00"))
	if err != nil || len(wt) != 1 || wt[0].Path != path || !wt[0].Detached || !wt[0].Locked || !wt[0].Prunable {
		t.Fatal(wt, err)
	}
	for _, data := range []string{"", "bad", "HEAD x\x00"} {
		if _, err := parseWorktrees([]byte(data)); err == nil {
			t.Fatal("malformed worktree accepted")
		}
	}
}
