package takeover

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func sourcePath(t *testing.T) string {
	t.Helper()
	// macOS temp roots may use /var -> /private/var. Tests select the real
	// path; the command deliberately refuses source aliases and symlinks.
	base, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return filepath.Join(base, "selected.jsonl")
}

func sessionRecord(t *testing.T, path, cwd, id string) {
	t.Helper()
	header, err := json.Marshal(map[string]any{"type": "session_meta", "payload": map[string]any{"id": id, "cwd": cwd, "cli_version": "0.163.0-alpha.11", "git": map[string]string{"branch": "UNTRUSTED_RECORDED_BRANCH"}, "instructions": "PRIVATE_HEADER_INSTRUCTION"}})
	if err != nil {
		t.Fatal(err)
	}
	write(t, path, string(header)+"\n"+`{"type":"response_item","payload":{"role":"user","content":"PRIVATE_CHAT_BODY"}}`+"\n")
}

func bindOK(t *testing.T, root, path, id, expected string) SessionBinding {
	t.Helper()
	r, err := BindSession(context.Background(), root, path, id, expected)
	if err != nil || r.Status != "bound" || len(r.Fingerprint) != 64 || r.Consistency != "two_matching_combined_observations" {
		t.Fatalf("binding %+v %v", r, err)
	}
	return r
}

func TestSessionBindingActualWorktreeAndPrivacy(t *testing.T) {
	root, path := committedRepo(t), sourcePath(t)
	sessionRecord(t, path, root, "selected-id")
	beforeSource, _ := os.ReadFile(path)
	index := filepath.Join(root, ".git", "index")
	beforeIndex, _ := os.ReadFile(index)
	r := bindOK(t, root, path, "selected-id", "")
	if r.Source.Adapter != sessionAdapter || r.Source.Trust != "untrusted_local_record" || r.Source.History != "not_inspected" || r.Source.CLIVersion != "0.163.0-alpha.11" || r.Source.PrefixBytes != len(beforeSource) || r.Source.Size != int64(len(beforeSource)) || r.Source.PrefixSHA256 != digest(beforeSource) || r.Source.FileIdentity == "" {
		t.Fatalf("source %+v", r.Source)
	}
	if r.Association.Status != "same_worktree" || r.Association.Relation != "exact_selection" || r.Association.GitDir != r.Workspace.Snapshot.GitDir {
		t.Fatal("not associated with actual Git")
	}
	again := bindOK(t, root, path, "selected-id", strings.ToUpper(r.Fingerprint))
	if again.BaselineMatch == nil || !*again.BaselineMatch || again.Fingerprint != r.Fingerprint {
		t.Fatal("same binding failed revalidation")
	}
	encoded, _ := json.Marshal(r)
	for _, forbidden := range []string{"PRIVATE_CHAT_BODY", "PRIVATE_HEADER_INSTRUCTION", "UNTRUSTED_RECORDED_BRANCH"} {
		if bytes.Contains(encoded, []byte(forbidden)) {
			t.Fatal("private content leaked", forbidden)
		}
	}
	afterSource, _ := os.ReadFile(path)
	afterIndex, _ := os.ReadFile(index)
	if !bytes.Equal(beforeSource, afterSource) || !bytes.Equal(beforeIndex, afterIndex) {
		t.Fatal("read-only command changed source/index")
	}
	if runtime.GOOS == "windows" {
		// Case differences and the 8.3-vs-long path aliases in real Codex cwd
		// must be resolved before comparing with Git's worktree directory.
		sessionRecord(t, path, strings.ToUpper(root), "selected-id")
		bindOK(t, root, path, "selected-id", "")
	}
}

func TestSessionBindingSubdirectoriesAndWrongWorktree(t *testing.T) {
	root, path := committedRepo(t), sourcePath(t)
	sub := filepath.Join(root, "src")
	for _, test := range []struct{ selection, cwd, relation string }{{root, sub, "cwd_inside_selection"}, {sub, root, "selection_inside_cwd"}} {
		sessionRecord(t, path, test.cwd, "chosen")
		if bindOK(t, test.selection, path, "chosen", "").Association.Relation != test.relation {
			t.Fatal("incorrect hierarchy")
		}
	}
	linked := filepath.Join(t.TempDir(), "linked")
	fixtureGit(t, root, "worktree", "add", "-qb", "different-session", linked)
	sessionRecord(t, path, linked, "chosen")
	r, err := BindSession(context.Background(), root, path, "chosen", "")
	if err != nil || r.Status != "association_unverified" || r.Association.Status != "different_worktree" || r.Fingerprint != "" {
		t.Fatal("wrong linked worktree accepted", r, err)
	}
	// A nested repo within the selection is a different worktree too.
	nested := filepath.Join(root, "src", "nested")
	write(t, filepath.Join(nested, "file"), "nested")
	fixtureGit(t, nested, "init", "-q")
	// Keep the selected parent worktree complete so this case isolates the
	// source's different Git directory rather than a nested-content gap.
	write(t, filepath.Join(root, ".git", "info", "exclude"), "src/nested/\n")
	sessionRecord(t, path, nested, "chosen")
	r, err = BindSession(context.Background(), root, path, "chosen", "")
	if err != nil || r.Association == nil || r.Association.Status != "different_worktree" {
		t.Fatal("nested repo accepted", r, err)
	}
}

func TestSessionProjectlessAndUnrelatedCWDStayUnverified(t *testing.T) {
	root, path := committedRepo(t), sourcePath(t)
	cases := []struct{ cwd, status string }{
		{filepath.Dir(root), "recorded_cwd_has_no_verified_worktree"},
		{filepath.Join(t.TempDir(), "missing"), "recorded_cwd_missing_or_unreadable"},
		{committedRepo(t), "different_worktree"},
		{"relative/project", "foreign_or_relative_cwd"},
		{root + " ", "foreign_or_relative_cwd"},
	}
	if runtime.GOOS == "windows" {
		cases = append(cases, struct{ cwd, status string }{"/mnt/c/project", "foreign_or_relative_cwd"})
	} else {
		cases = append(cases, struct{ cwd, status string }{`C:\project`, "foreign_or_relative_cwd"})
	}
	for _, test := range cases {
		sessionRecord(t, path, test.cwd, "chosen")
		r, err := BindSession(context.Background(), root, path, "chosen", "")
		if err != nil || r.Status != "association_unverified" || r.Association.Status != test.status || r.Fingerprint != "" {
			t.Fatalf("%s: %+v %v", test.status, r, err)
		}
	}
	// Two sibling directories in one worktree don't establish the selected
	// task's narrower scope just because they share a Git repository.
	sibling := filepath.Join(root, "sibling")
	if err := os.Mkdir(sibling, 0700); err != nil {
		t.Fatal(err)
	}
	sessionRecord(t, path, sibling, "chosen")
	r, err := BindSession(context.Background(), filepath.Join(root, "src"), path, "chosen", "")
	if err != nil || r.Association.Status != "cwd_outside_selection" {
		t.Fatal("sibling selection widened", r, err)
	}
}

func TestSessionBindingStaleSourceAndWorkspaceBaselines(t *testing.T) {
	for _, kind := range []string{"append", "replace-same-bytes", "prefix-edit", "branch", "file-content", "record-version"} {
		t.Run(kind, func(t *testing.T) {
			root, path := committedRepo(t), sourcePath(t)
			sessionRecord(t, path, root, "chosen")
			first := bindOK(t, root, path, "chosen", "")
			switch kind {
			case "append":
				f, _ := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0600)
				if _, err := f.WriteString("{}\n"); err != nil {
					t.Fatal(err)
				}
				_ = f.Close()
			case "replace-same-bytes":
				b, _ := os.ReadFile(path)
				if err := os.Rename(path, path+".original"); err != nil {
					t.Fatal(err)
				}
				write(t, path, string(b))
				_ = os.Chtimes(path, first.Source.Modified, first.Source.Modified)
			case "prefix-edit":
				b, _ := os.ReadFile(path)
				write(t, path, strings.ReplaceAll(string(b), "PRIVATE_CHAT_BODY", "CHANGED_CHAT_BODY"))
				_ = os.Chtimes(path, first.Source.Modified, first.Source.Modified)
			case "branch":
				fixtureGit(t, root, "checkout", "-qb", "later-branch")
			case "file-content":
				write(t, filepath.Join(root, "edit.txt"), "new edit")
			case "record-version":
				b, _ := os.ReadFile(path)
				write(t, path, strings.ReplaceAll(string(b), "0.163.0-alpha.11", "0.163.0-alpha.10.2"))
			}
			r, err := BindSession(context.Background(), root, path, "chosen", first.Fingerprint)
			if err != nil || r.Status != "stale_baseline" || r.Fingerprint != "" || r.BaselineMatch == nil || *r.BaselineMatch {
				t.Fatal("stale baseline accepted", r, err)
			}
		})
	}
}

func TestSessionConcurrentMutationWithholdsBinding(t *testing.T) {
	for _, kind := range []string{"append", "replace", "missing", "branch", "cwd-missing"} {
		t.Run(kind, func(t *testing.T) {
			root, path := committedRepo(t), sourcePath(t)
			sessionRecord(t, path, root, "chosen")
			r, err := bindSession(context.Background(), root, path, "chosen", "", func() {
				switch kind {
				case "append":
					f, _ := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0600)
					_, _ = f.WriteString("{}\n")
					_ = f.Close()
				case "replace":
					if err := os.Rename(path, path+".old"); err != nil {
						t.Fatal(err)
					}
					sessionRecord(t, path, root, "chosen")
				case "missing":
					if err := os.Remove(path); err != nil {
						t.Fatal(err)
					}
				case "branch":
					fixtureGit(t, root, "checkout", "-qb", "concurrent")
				case "cwd-missing":
					if err := os.Rename(root, root+".old"); err != nil {
						t.Fatal(err)
					}
					t.Cleanup(func() { _ = os.Rename(root+".old", root) })
				}
			})
			if err != nil || r.Status != "changed_during_capture" || r.Fingerprint != "" {
				t.Fatal("concurrent mutation accepted", r, err)
			}
		})
	}
}

func TestSessionUnsupportedSourcesAndBoundedPrefix(t *testing.T) {
	root, path := committedRepo(t), sourcePath(t)
	for _, test := range []struct {
		mutate func(string) string
		reason string
	}{
		{func(s string) string { return strings.ReplaceAll(s, "0.163.0-alpha.11", "99.0.0") }, "unqualified_recorded_cli_version"},
		{func(s string) string { return strings.ReplaceAll(s, "0.163.0-alpha.11", "") }, "unqualified_recorded_cli_version"},
		{func(s string) string { return strings.ReplaceAll(s, "session_meta", "unknown_meta") }, "unsupported_metadata_header"},
		{func(s string) string { return "corrupted\n" + s }, "unsupported_metadata_header"},
		{func(s string) string { return strings.Split(s, "\n")[0] }, "complete_metadata_header_not_found_within_limit"},
		{func(s string) string { return strings.Repeat("x", metadataBytes+1) + "\n" + s }, "complete_metadata_header_not_found_within_limit"},
	} {
		sessionRecord(t, path, root, "chosen")
		b, _ := os.ReadFile(path)
		write(t, path, test.mutate(string(b)))
		r, err := BindSession(context.Background(), root, path, "chosen", "")
		if err != nil || r.Reason != test.reason || r.Fingerprint != "" || r.Source != nil {
			t.Fatal(test.reason, r, err)
		}
	}
	sessionRecord(t, path, root, "chosen")
	f, err := os.OpenFile(path, os.O_WRONLY, 0600)
	if err != nil {
		t.Fatal(err)
	}
	if err = f.Truncate(32 << 20); err != nil {
		t.Fatal(err)
	}
	_ = f.Close()
	r := bindOK(t, root, path, "chosen", "")
	if r.Source.PrefixBytes != metadataBytes || r.Source.Size != 32<<20 || r.Source.History != "not_inspected" {
		t.Fatal("large source was not bounded")
	}
	r2, err := BindSession(context.Background(), root, path, "wrong-id", "")
	if err != nil || r2.Reason != "selected_session_id_mismatch" || r2.Source != nil {
		t.Fatal(r2, err)
	}
}

func TestSessionMissingSymlinkNonGitAndCLI(t *testing.T) {
	root, path := committedRepo(t), sourcePath(t)
	sessionRecord(t, path, root, "chosen")
	for _, selected := range []string{filepath.Join(filepath.Dir(path), "missing.jsonl"), filepath.Dir(path)} {
		_, err := readSelectedSession(context.Background(), selected, "chosen")
		if err == nil {
			t.Fatal("invalid source accepted")
		}
	}
	plain := t.TempDir()
	sessionRecord(t, path, plain, "chosen")
	r, err := BindSession(context.Background(), plain, path, "chosen", "")
	if err != nil || r.Status != "workspace_unverified" || r.Reason != "not_git" {
		t.Fatal(r, err)
	}
	for _, args := range [][]string{{"takeover", "session"}, {"takeover", "session", "--bad"}, {"takeover", "session", "extra"}, {"takeover", "session", "--workspace", root, "--session-file", path, "--session-id", "chosen", "--expect-fingerprint", "bad"}} {
		if err := Run(context.Background(), args, &bytes.Buffer{}); err == nil {
			t.Fatalf("accepted %v", args)
		}
	}
	var out bytes.Buffer
	if err := Run(context.Background(), []string{"takeover", "session", "--help"}, &out); err != nil || !strings.Contains(out.String(), "Verify one selected Codex") {
		t.Fatal(err)
	}
	if err := Run(context.Background(), []string{"takeover", "session", "--help"}, brokenWriter{}); err == nil {
		t.Fatal("writer error lost")
	}
	if err := Run(context.Background(), []string{"takeover", "session", "--workspace", plain, "--session-file", path, "--session-id", "chosen"}, brokenWriter{}); err == nil {
		t.Fatal("JSON writer error lost")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := BindSession(ctx, root, path, "chosen", ""); err == nil {
		t.Fatal("cancel ignored")
	}
	if _, err := readSelectedSession(ctx, path, "chosen"); err == nil {
		t.Fatal("source cancel ignored")
	}
	for _, args := range [][]string{{"relative", path, "chosen"}, {root, "relative.jsonl", "chosen"}, {root, path, ""}, {root, path, "bad\nID"}} {
		if _, err := BindSession(context.Background(), args[0], args[1], args[2], ""); err == nil {
			t.Fatal("invalid args accepted")
		}
	}
	alias := filepath.Join(filepath.Dir(path), "alias.jsonl")
	if err := os.Symlink(path, alias); err != nil {
		t.Skip("symlinks unavailable", err)
	}
	if _, err := readSelectedSession(context.Background(), alias, "chosen"); err == nil {
		t.Fatal("source symlink accepted")
	}
	dirAlias := filepath.Join(filepath.Dir(path), "parent-link")
	if err := os.Symlink(filepath.Dir(path), dirAlias); err != nil {
		t.Fatal(err)
	}
	if _, err := readSelectedSession(context.Background(), filepath.Join(dirAlias, filepath.Base(path)), "chosen"); err == nil {
		t.Fatal("parent symlink accepted")
	}
}

func TestSessionMtimeOnlyMutationInvalidatesBaseline(t *testing.T) {
	root, path := committedRepo(t), sourcePath(t)
	sessionRecord(t, path, root, "chosen")
	first := bindOK(t, root, path, "chosen", "")
	later := first.Source.Modified.Add(2 * time.Second)
	if err := os.Chtimes(path, later, later); err != nil {
		t.Fatal(err)
	}
	r, err := BindSession(context.Background(), root, path, "chosen", first.Fingerprint)
	if err != nil || r.Status != "stale_baseline" {
		t.Fatal(r, err)
	}
}
