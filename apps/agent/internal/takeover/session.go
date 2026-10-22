package takeover

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/workspaceidentity"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/policy"
)

const BindingVersion = "remotearc.takeover-session-binding/v1"
const sessionAdapter = "codex-local-session-meta/v1"

const sessionHelp = `Verify one selected Codex local session against its worktree
Usage: remotelink takeover session --workspace <absolute-directory>
  --session-file <absolute-jsonl>  Select the exact local record or export
  --session-id <id>               Expected ID from metadata discovery
  --expect-fingerprint <sha256>   Optional: reject a changed previous binding
  --help, -h                     Show help

Reads at most 64 KiB per source observation, returning metadata only. Records
are untrusted local-file fallback data, not an authenticated Codex API response.
Only observed record versions are qualified; unknown formats/versions stay gaps.
Two combined source/worktree observations must match to return status=bound.
Different worktrees, missing directories and ambiguous projectless cwd are
reported explicitly. A bound result proves current metadata association only,
not task ownership, full history, stopped execution, or authority to continue.
No source model, session resume, upload, config edit or persistent capture.
`

// These exact metadata versions were observed in the #253 research or its
// committed fixtures. This is not qualification of their full history format.
var metadataVersions = map[string]bool{
	"0.147.0-alpha.1.2": true, "0.147.0-alpha.6.5": true,
	"0.148.0-alpha.9": true, "0.155.0-alpha.16.4": true,
	"0.162.0-alpha.17.2": true, "0.163.0-alpha.10.2": true,
	"0.163.0-alpha.11": true,
}

type SessionSource struct {
	Adapter      string    `json:"adapter"`
	Trust        string    `json:"trust"`
	Path         string    `json:"path"`
	ID           string    `json:"id"`
	RecordedCWD  string    `json:"recorded_cwd"`
	CLIVersion   string    `json:"recorded_cli_version"`
	FileIdentity string    `json:"file_identity"`
	Size         int64     `json:"size"`
	Modified     time.Time `json:"modified"`
	PrefixBytes  int       `json:"prefix_bytes"`
	PrefixSHA256 string    `json:"prefix_sha256"`
	History      string    `json:"history_coverage"`
}

type SessionAssociation struct {
	Status      string `json:"status"`
	Relation    string `json:"cwd_relation"`
	ResolvedCWD string `json:"resolved_cwd,omitempty"`
	CWDIdentity string `json:"cwd_identity,omitempty"`
	GitDir      string `json:"cwd_git_directory,omitempty"`
	GitIdentity string `json:"cwd_git_identity,omitempty"`
}

type SessionBinding struct {
	Version       string               `json:"version"`
	Status        string               `json:"status"`
	Reason        string               `json:"reason,omitempty"`
	ObservedAt    time.Time            `json:"observed_at"`
	Consistency   string               `json:"consistency"`
	Scope         string               `json:"fingerprint_scope"`
	Source        *SessionSource       `json:"source,omitempty"`
	Association   *SessionAssociation  `json:"association,omitempty"`
	Workspace     *WorkspaceInspection `json:"workspace,omitempty"`
	BaselineMatch *bool                `json:"baseline_match,omitempty"`
	Fingerprint   string               `json:"fingerprint,omitempty"`
}

func runSession(ctx context.Context, args []string, output io.Writer) error {
	f := flag.NewFlagSet("takeover session", flag.ContinueOnError)
	f.SetOutput(io.Discard)
	root := f.String("workspace", "", "selected project")
	path := f.String("session-file", "", "explicit source record")
	id := f.String("session-id", "", "expected source ID")
	expected := f.String("expect-fingerprint", "", "previous binding SHA256")
	help := f.Bool("help", false, "help")
	f.BoolVar(help, "h", false, "help")
	if err := f.Parse(args); err != nil {
		return err
	}
	if f.NArg() != 0 {
		return errors.New("unexpected arguments; quote paths containing spaces")
	}
	if *help {
		_, err := fmt.Fprint(output, sessionHelp)
		return err
	}
	r, err := BindSession(ctx, *root, *path, *id, *expected)
	if err != nil {
		return err
	}
	e := json.NewEncoder(output)
	e.SetIndent("", "  ")
	return e.Encode(r)
}

func validSessionID(s string) bool {
	return s != "" && len(s) <= 256 && utf8.ValidString(s) && strings.IndexFunc(s, unicode.IsControl) < 0
}

func BindSession(ctx context.Context, workspace, path, id, expected string) (SessionBinding, error) {
	return bindSession(ctx, workspace, path, id, expected, nil)
}

func bindSession(ctx context.Context, workspace, path, id, expected string, betweenReads func()) (SessionBinding, error) {
	r := SessionBinding{Version: BindingVersion, Status: "unavailable", ObservedAt: time.Now().UTC(), Consistency: "not_checked", Scope: "source-file-identity-size-mtime-64KiB-prefix-and-workspace-fingerprint/v1"}
	if !filepath.IsAbs(workspace) || strings.TrimSpace(workspace) != workspace {
		return r, errors.New("--workspace must be an absolute local project directory")
	}
	if !filepath.IsAbs(path) || strings.TrimSpace(path) != path || strings.ToLower(filepath.Ext(path)) != ".jsonl" {
		return r, errors.New("--session-file must be an absolute local .jsonl file")
	}
	if !validSessionID(id) {
		return r, errors.New("--session-id must name the expected session")
	}
	if expected != "" {
		b, err := hex.DecodeString(expected)
		if err != nil || len(b) != 32 {
			return r, errors.New("--expect-fingerprint must be a SHA256 digest")
		}
		expected = strings.ToLower(expected)
	}
	if ctx.Err() != nil {
		return r, ctx.Err()
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	first, err := readSelectedSession(ctx, path, id)
	if err != nil {
		r.Reason = err.Error()
		return r, nil
	}
	r.Source = &first
	w1, err := InspectWorkspace(ctx, workspace)
	if err != nil {
		return r, err
	}
	r.Workspace = &w1
	if w1.Status != "ok" {
		r.Status, r.Reason = "workspace_unverified", w1.Status
		return r, nil
	}
	a1 := associateSession(ctx, first.RecordedCWD, w1)
	r.Association = &a1
	if a1.Status != "same_worktree" {
		r.Status, r.Reason = "association_unverified", a1.Status
		return r, nil
	}
	if betweenReads != nil {
		betweenReads()
	}
	second, err := readSelectedSession(ctx, path, id)
	if err != nil {
		r.Status, r.Consistency, r.Reason = "changed_during_capture", "changed", "source_changed_or_unavailable"
		return r, nil
	}
	w2, err := InspectWorkspace(ctx, workspace)
	if err != nil {
		r.Status, r.Consistency, r.Reason = "changed_during_capture", "changed", "workspace_changed_or_unavailable"
		return r, nil
	}
	a2 := associateSession(ctx, second.RecordedCWD, w2)
	// Workspace timestamps are observations, not part of the stable baseline.
	stable := func(s SessionSource, a SessionAssociation, w WorkspaceInspection) []byte {
		b, _ := json.Marshal(struct {
			Version, Scope, Workspace string
			Source                    SessionSource
			Association               SessionAssociation
		}{r.Version, r.Scope, w.Fingerprint, s, a})
		return b
	}
	b1, b2 := stable(first, a1, w1), stable(second, a2, w2)
	if w2.Status != "ok" || !bytes.Equal(b1, b2) {
		r.Status, r.Consistency = "changed_during_capture", "changed"
		return r, nil
	}
	// Close the observation window with one more bounded source read, so an
	// append/replacement during the final Git observation cannot look stable.
	last, err := readSelectedSession(ctx, path, id)
	if err != nil || !bytes.Equal(b2, stable(last, a2, w2)) {
		r.Status, r.Consistency, r.Reason = "changed_during_capture", "changed", "source_changed_or_unavailable"
		return r, nil
	}
	r.Consistency = "two_matching_combined_observations"
	fingerprint := digest(b1)
	if expected != "" {
		match := fingerprint == expected
		r.BaselineMatch = &match
		if !match {
			r.Status, r.Reason = "stale_baseline", "selected_source_or_workspace_changed"
			return r, nil
		}
	}
	r.Status, r.Fingerprint = "bound", fingerprint
	return r, nil
}

// The file path is explicit authorization for this metadata read. Reject final
// and parent symlinks instead of turning an alias into a different source.
func selectedFileInfo(path string) (os.FileInfo, error) {
	for cursor := filepath.Clean(path); ; cursor = filepath.Dir(cursor) {
		info, err := os.Lstat(cursor)
		if err != nil {
			return nil, errors.New("source_missing_or_unreadable")
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return nil, errors.New("source_symlink_not_followed")
		}
		if filepath.Dir(cursor) == cursor {
			break
		}
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() {
		return nil, errors.New("source_not_regular_file")
	}
	// Windows Stat may defer resolving the file index until SameFile is called.
	if !os.SameFile(info, info) {
		return nil, errors.New("source_identity_unavailable")
	}
	return info, nil
}

func readSelectedSession(ctx context.Context, path, id string) (SessionSource, error) {
	s := SessionSource{Adapter: sessionAdapter, Trust: "untrusted_local_record", Path: filepath.Clean(path), History: "not_inspected"}
	if ctx.Err() != nil {
		return s, errors.New("inspection_cancelled_or_timed_out")
	}
	info, err := selectedFileInfo(s.Path)
	if err != nil {
		return s, err
	}
	identity, err := workspaceidentity.ReadFile(s.Path)
	if err != nil {
		return s, errors.New("source_identity_unavailable")
	}
	f, err := os.Open(s.Path)
	if err != nil {
		return s, errors.New("source_missing_or_unreadable")
	}
	defer f.Close()
	opened, err := f.Stat()
	if err != nil || !opened.Mode().IsRegular() || !os.SameFile(info, opened) {
		return s, errors.New("source_changed_while_reading")
	}
	prefix, err := io.ReadAll(io.LimitReader(f, metadataBytes))
	if err != nil {
		return s, errors.New("source_read_failed")
	}
	after, statErr := f.Stat()
	current, pathErr := selectedFileInfo(s.Path)
	currentID, identityErr := workspaceidentity.ReadFile(s.Path)
	if ctx.Err() != nil {
		return s, errors.New("inspection_cancelled_or_timed_out")
	}
	if statErr != nil || pathErr != nil || identityErr != nil || identity != currentID || !os.SameFile(info, current) || after.Size() != info.Size() || !after.ModTime().Equal(info.ModTime()) || !current.ModTime().Equal(info.ModTime()) || current.Size() != info.Size() {
		return s, errors.New("source_changed_while_reading")
	}
	end := bytes.IndexByte(prefix, '\n')
	if end < 0 {
		return s, errors.New("complete_metadata_header_not_found_within_limit")
	}
	header := prefix[:end]
	var record struct {
		Type    string `json:"type"`
		Payload struct {
			ID      string `json:"id"`
			CWD     string `json:"cwd"`
			Version string `json:"cli_version"`
		} `json:"payload"`
	}
	if !utf8.Valid(header) || json.Unmarshal(header, &record) != nil || record.Type != "session_meta" || !validSessionID(record.Payload.ID) || record.Payload.CWD == "" || len(record.Payload.CWD) > 32768 || strings.IndexFunc(record.Payload.CWD, unicode.IsControl) >= 0 {
		return s, errors.New("unsupported_metadata_header")
	}
	if record.Payload.ID != id {
		return s, errors.New("selected_session_id_mismatch")
	}
	if !metadataVersions[record.Payload.Version] {
		return s, errors.New("unqualified_recorded_cli_version")
	}
	s.ID, s.RecordedCWD, s.CLIVersion = record.Payload.ID, record.Payload.CWD, record.Payload.Version
	s.FileIdentity, s.Size, s.Modified = identity, info.Size(), info.ModTime().UTC()
	s.PrefixBytes, s.PrefixSHA256 = len(prefix), digest(prefix)
	return s, nil
}

func associateSession(ctx context.Context, cwd string, w WorkspaceInspection) SessionAssociation {
	a := SessionAssociation{Status: "workspace_unverified", Relation: "unknown"}
	if w.Status != "ok" || w.Snapshot == nil {
		return a
	}
	if !filepath.IsAbs(cwd) || strings.TrimSpace(cwd) != cwd {
		a.Status = "foreign_or_relative_cwd"
		return a
	}
	resolved, err := workspaceDirectory(ctx, cwd)
	if err != nil {
		a.Status = "recorded_cwd_missing_or_unreadable"
		return a
	}
	a.ResolvedCWD = resolved
	a.CWDIdentity, err = workspaceidentity.Read(resolved)
	if err != nil {
		a.Status = "recorded_cwd_identity_unavailable"
		return a
	}
	switch {
	case resolved == w.Workspace:
		a.Relation = "exact_selection"
	case policy.Inside(resolved, w.Workspace):
		a.Relation = "cwd_inside_selection"
	case policy.Inside(w.Workspace, resolved):
		a.Relation = "selection_inside_cwd"
	default:
		a.Relation = "separate_directories"
	}
	binary, err := exec.LookPath("git")
	if err != nil {
		a.Status = "git_unavailable"
		return a
	}
	g := gitReader{binary: binary, dir: resolved}
	path, err := g.run(ctx, nil, "rev-parse", "--absolute-git-dir")
	if err != nil {
		a.Status = "recorded_cwd_has_no_verified_worktree"
		return a
	}
	gitDir := strings.TrimSuffix(string(path), "\n")
	if !filepath.IsAbs(gitDir) || !utf8.ValidString(gitDir) {
		a.Status = "recorded_git_path_unsupported"
		return a
	}
	a.GitDir, err = policy.Canonical(gitDir)
	if err != nil {
		a.Status = "recorded_git_path_unreadable"
		return a
	}
	a.GitIdentity, err = workspaceidentity.Read(a.GitDir)
	if err != nil {
		a.Status = "recorded_git_identity_unavailable"
		return a
	}
	if a.GitDir != w.Snapshot.GitDir || a.GitIdentity != w.Snapshot.GitIdentity {
		a.Status = "different_worktree"
		return a
	}
	if a.Relation == "separate_directories" {
		a.Status = "cwd_outside_selection"
		return a
	}
	a.Status = "same_worktree"
	return a
}
