package takeover

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/workspaceidentity"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/policy"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

const WorkspaceVersion = "remotearc.takeover-workspace/v1"
const maxChanges = 1000
const maxFileBytes = 1 << 20
const maxHashBytes = 8 << 20

const workspaceHelp = `Read-only Git/worktree inspection
Usage: remotelink takeover workspace --workspace <directory>

Returns real repository/worktree identity, HEAD/branch, changed and untracked
paths in the selected directory, linked-worktree metadata and bounded hashes.
Requires Git 2.36+; file hashes stay inside the selected directory. Git itself
may inspect repository-wide metadata and files while computing status.
Only status=ok has a fingerprint, after two matching reads. This is not an
atomic snapshot or authority to execute later: inspect again before continuing.
Limits: 1,000 changes, 1 MiB/file, 8 MiB hashed/pass, 2 MiB/Git output, 30 seconds.
Ignored files, clean-file bytes, submodule contents and session text are excluded.
Sensitive files, symlinks, external filters and limits produce explicit gaps.
No pairing, persistent capture, network/model calls or workspace/index writes.
`

type FileChange struct {
	Path     string `json:"path"` // repository-relative, not session-reported
	Index    string `json:"index_status"`
	Worktree string `json:"worktree_status"`
	Kind     string `json:"kind"`
	Content  string `json:"content_status"`
	SHA256   string `json:"sha256,omitempty"`
	Size     int64  `json:"size,omitempty"`
	Mode     uint32 `json:"mode,omitempty"`
}

type LinkedWorktree struct {
	Path     string `json:"path"`
	HEAD     string `json:"head,omitempty"`
	Branch   string `json:"branch,omitempty"`
	Detached bool   `json:"detached"`
	Bare     bool   `json:"bare"`
	Locked   bool   `json:"locked"`
	Prunable bool   `json:"prunable"`
}

type WorkspaceSnapshot struct {
	Root           string           `json:"repository_root"`
	GitDir         string           `json:"git_directory"`
	CommonDir      string           `json:"common_git_directory"`
	Identity       string           `json:"workspace_identity"`
	GitIdentity    string           `json:"git_directory_identity"`
	CommonIdentity string           `json:"common_git_directory_identity"`
	HEAD           string           `json:"head"`
	Branch         string           `json:"branch"`
	Detached       bool             `json:"detached"`
	Unborn         bool             `json:"unborn"`
	Upstream       string           `json:"upstream,omitempty"`
	Ahead          *int             `json:"ahead,omitempty"`
	Behind         *int             `json:"behind,omitempty"`
	Changes        []FileChange     `json:"changes"`
	Worktrees      []LinkedWorktree `json:"linked_worktrees"`
	Complete       bool             `json:"complete"`
	LimitReached   bool             `json:"limit_reached"`
	// Includes index object IDs/conflict stages without returning file contents.
	StatusSHA256 string `json:"git_status_sha256"`
}

type WorkspaceInspection struct {
	Version     string             `json:"version"`
	Workspace   string             `json:"workspace"`
	ObservedAt  time.Time          `json:"observed_at"`
	Status      string             `json:"status"`
	Reason      string             `json:"reason,omitempty"`
	Consistency string             `json:"consistency"`
	Scope       string             `json:"fingerprint_scope"`
	Fingerprint string             `json:"fingerprint,omitempty"`
	Snapshot    *WorkspaceSnapshot `json:"snapshot,omitempty"`
}

func runWorkspace(ctx context.Context, args []string, output io.Writer) error {
	f := flag.NewFlagSet("takeover workspace", flag.ContinueOnError)
	f.SetOutput(io.Discard)
	root := f.String("workspace", "", "selected local directory")
	help := f.Bool("help", false, "help")
	f.BoolVar(help, "h", false, "help")
	if err := f.Parse(args); err != nil {
		return err
	}
	if f.NArg() != 0 {
		return errors.New("unexpected arguments; quote paths containing spaces")
	}
	if *help {
		_, err := fmt.Fprint(output, workspaceHelp)
		return err
	}
	result, err := InspectWorkspace(ctx, *root)
	if err != nil {
		return err
	}
	e := json.NewEncoder(output)
	e.SetIndent("", "  ")
	return e.Encode(result)
}

func digest(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func InspectWorkspace(ctx context.Context, workspace string) (WorkspaceInspection, error) {
	return inspectWorkspace(ctx, workspace, nil)
}

// betweenReads is a deterministic seam for concurrent-mutation regression tests.
func inspectWorkspace(ctx context.Context, workspace string, betweenReads func()) (WorkspaceInspection, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	r := WorkspaceInspection{Version: WorkspaceVersion, ObservedAt: time.Now().UTC(), Status: "unavailable", Consistency: "not_checked", Scope: "selected-directory:git-head-status-and-bounded-changed-file-bytes/v1"}
	if strings.TrimSpace(workspace) == "" {
		return r, errors.New("--workspace must name a local project directory")
	}
	root, err := workspaceDirectory(ctx, workspace)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			r.Status, r.Reason = "missing_workspace", "selected directory does not exist"
			return r, nil
		}
		return r, err
	}
	r.Workspace = root
	binary, err := exec.LookPath("git")
	if err != nil {
		r.Reason = "git_not_found"
		return r, nil
	}
	g := gitReader{binary: binary, dir: root}
	version, err := g.run(ctx, nil, "--version")
	var major, minor int
	_, versionErr := fmt.Sscanf(string(version), "git version %d.%d", &major, &minor)
	if err != nil || versionErr != nil || major < 2 || major == 2 && minor < 36 {
		r.Reason = "git_2_36_or_newer_required"
		return r, nil
	}
	inside, err := g.run(ctx, nil, "rev-parse", "--is-inside-work-tree")
	if err != nil {
		if ctx.Err() != nil || errors.Is(err, context.DeadlineExceeded) || errors.Is(err, errGitLimit) {
			r.Reason = inspectionFailure(err)
			return r, nil
		}
		// An error from a repository marker is not proof of an empty/non-Git
		// project (it may be a moved worktree, dubious ownership or corruption).
		r.Status, r.Reason = "not_git", "no_repository_found"
		for dir := root; ; dir = filepath.Dir(dir) {
			if _, e := os.Lstat(filepath.Join(dir, ".git")); !errors.Is(e, os.ErrNotExist) {
				r.Status, r.Reason = "unavailable", "git_repository_unreadable"
				break
			}
			if filepath.Dir(dir) == dir {
				break
			}
		}
		return r, nil
	}
	if strings.TrimSpace(string(inside)) != "true" {
		r.Reason = "bare_repository_not_supported"
		return r, nil
	}
	first, err := g.capture(ctx)
	if err != nil {
		r.Reason = inspectionFailure(err)
		return r, nil
	}
	r.Snapshot = &first
	if betweenReads != nil {
		betweenReads()
	}
	second, err := g.capture(ctx)
	if err != nil {
		r.Status, r.Consistency, r.Reason = "incomplete", "not_verified", inspectionFailure(err)
		return r, nil
	}
	a, _ := json.Marshal(first)
	b, _ := json.Marshal(second)
	if !bytes.Equal(a, b) {
		r.Status, r.Consistency = "changed_during_capture", "changed"
		return r, nil
	}
	r.Consistency = "two_matching_reads"
	if !first.Complete {
		r.Status, r.Reason = "incomplete", "one_or_more_paths_not_fingerprinted"
		return r, nil
	}
	r.Status = "ok"
	// Include selection and schema so a subdirectory cannot reuse a root digest.
	r.Fingerprint = digest(append([]byte(r.Version+"\x00"+r.Scope+"\x00"+root+"\x00"), a...))
	return r, nil
}

var errFiltered = errors.New("external_filters_not_supported")
var errGitFormat = errors.New("unsupported_git_output")

func inspectionFailure(err error) string {
	switch {
	case errors.Is(err, errGitLimit):
		return "git_output_limit_reached"
	case errors.Is(err, errFiltered):
		return "external_filters_not_supported"
	case errors.Is(err, errGitFormat):
		return "unsupported_git_output"
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return "inspection_cancelled_or_timed_out"
	default:
		return "git_or_workspace_unreadable"
	}
}

func (g *gitReader) capture(ctx context.Context) (WorkspaceSnapshot, error) {
	s := WorkspaceSnapshot{Changes: []FileChange{}, Worktrees: []LinkedWorktree{}, Complete: true}
	var err error
	s.Identity, err = workspaceidentity.Read(g.dir)
	if err != nil {
		return s, err
	}
	for _, field := range []struct {
		flag string
		dest *string
	}{{"--show-toplevel", &s.Root}, {"--absolute-git-dir", &s.GitDir}, {"--git-common-dir", &s.CommonDir}} {
		b, e := g.run(ctx, nil, "rev-parse", "--path-format=absolute", field.flag)
		if e != nil {
			return s, e
		}
		// Remove only Git's final newline: filenames can contain whitespace.
		path := strings.TrimSuffix(string(b), "\n")
		if !utf8.ValidString(path) || !filepath.IsAbs(path) {
			return s, errGitFormat
		}
		*field.dest, e = policy.Canonical(path)
		if e != nil {
			return s, e
		}
	}
	if !policy.Inside(g.dir, s.Root) {
		return s, errGitFormat
	}
	s.GitIdentity, err = workspaceidentity.Read(s.GitDir)
	if err != nil {
		return s, err
	}
	s.CommonIdentity, err = workspaceidentity.Read(s.CommonDir)
	if err != nil {
		return s, err
	}
	if _, err = g.disableFilters(ctx); err != nil {
		return s, err
	}
	paths, err := g.run(ctx, nil, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ".")
	if err != nil {
		return s, err
	}
	attrs, err := g.run(ctx, paths, "check-attr", "-z", "--stdin", "filter")
	if err != nil {
		return s, err
	}
	parts := bytes.Split(attrs, []byte{0})
	if (len(parts)-1)%3 != 0 {
		return s, errGitFormat
	}
	for i := 2; i < len(parts)-1; i += 3 {
		if string(parts[i]) != "unspecified" && string(parts[i]) != "unset" {
			return s, errFiltered
		}
	}
	status, err := g.run(ctx, nil, "status", "--porcelain=v2", "-z", "--branch", "--untracked-files=all", "--no-renames", "--ignore-submodules=all", "--", ".")
	if err != nil {
		return s, err
	}
	s.StatusSHA256 = digest(status)
	if err := parseStatus(status, &s); err != nil {
		return s, err
	}
	worktrees, err := g.run(ctx, nil, "worktree", "list", "--porcelain", "-z")
	if err != nil {
		return s, err
	}
	s.Worktrees, err = parseWorktrees(worktrees)
	if err != nil {
		return s, err
	}
	remaining := int64(maxHashBytes)
	for i := range s.Changes {
		if ctx.Err() != nil {
			return s, ctx.Err()
		}
		fingerprintFile(g.dir, s.Root, &s.Changes[i], &remaining)
		if s.Changes[i].Content != "hashed" && s.Changes[i].Content != "deleted" {
			s.Complete = false
		}
		if s.Changes[i].Content == "size_limit" || s.Changes[i].Content == "total_limit" {
			s.LimitReached = true
		}
	}
	id, err := workspaceidentity.Read(g.dir)
	if err != nil || id != s.Identity {
		return s, errors.New("workspace replaced")
	}
	return s, nil
}

func parseStatus(data []byte, s *WorkspaceSnapshot) error {
	if len(data) == 0 || data[len(data)-1] != 0 || !utf8.Valid(data) {
		return errGitFormat
	}
	for _, record := range strings.Split(string(data[:len(data)-1]), "\x00") {
		switch {
		case strings.HasPrefix(record, "# branch.oid "):
			s.HEAD = strings.TrimPrefix(record, "# branch.oid ")
			s.Unborn = s.HEAD == "(initial)"
			if s.Unborn {
				s.HEAD = ""
			}
		case strings.HasPrefix(record, "# branch.head "):
			s.Branch = strings.TrimPrefix(record, "# branch.head ")
			s.Detached = s.Branch == "(detached)"
			if s.Detached {
				s.Branch = ""
			}
		case strings.HasPrefix(record, "# branch.upstream "):
			s.Upstream = strings.TrimPrefix(record, "# branch.upstream ")
		case strings.HasPrefix(record, "# branch.ab "):
			var ahead, behind int
			if _, err := fmt.Sscanf(record, "# branch.ab +%d -%d", &ahead, &behind); err != nil {
				return errGitFormat
			}
			s.Ahead, s.Behind = &ahead, &behind
		case strings.HasPrefix(record, "# "): // extensible porcelain headers
		default:
			c := FileChange{Kind: "tracked"}
			if strings.HasPrefix(record, "? ") {
				c.Path, c.Index, c.Worktree, c.Kind = record[2:], "?", "?", "untracked"
			} else {
				count := 9
				if strings.HasPrefix(record, "u ") {
					count, c.Kind = 11, "unmerged"
				} else if !strings.HasPrefix(record, "1 ") {
					return errGitFormat
				}
				fields := strings.SplitN(record, " ", count)
				if len(fields) != count || len(fields[1]) != 2 {
					return errGitFormat
				}
				c.Index, c.Worktree, c.Path = fields[1][:1], fields[1][1:], fields[count-1]
				if strings.HasPrefix(fields[2], "S") {
					c.Kind = "submodule"
				}
			}
			if c.Path == "" || filepath.IsAbs(filepath.FromSlash(c.Path)) {
				return errGitFormat
			}
			if len(s.Changes) < maxChanges {
				s.Changes = append(s.Changes, c)
			} else {
				s.Complete, s.LimitReached = false, true
			}
		}
	}
	sort.Slice(s.Changes, func(i, j int) bool { return s.Changes[i].Path < s.Changes[j].Path })
	return nil
}

func parseWorktrees(data []byte) ([]LinkedWorktree, error) {
	result := []LinkedWorktree{}
	if !utf8.Valid(data) || len(data) == 0 || data[len(data)-1] != 0 {
		return nil, errGitFormat
	}
	var current *LinkedWorktree
	for _, line := range strings.Split(string(data), "\x00") {
		key, value, _ := strings.Cut(line, " ")
		if key == "worktree" {
			if !filepath.IsAbs(value) || len(result) >= 100 {
				return nil, errGitLimit
			}
			result = append(result, LinkedWorktree{Path: value})
			current = &result[len(result)-1]
		} else if current != nil {
			switch key {
			case "HEAD":
				current.HEAD = value
			case "branch":
				current.Branch = value
			case "bare":
				current.Bare = true
			case "detached":
				current.Detached = true
			case "locked":
				current.Locked = true
			case "prunable":
				current.Prunable = true
			}
		}
	}
	if len(result) == 0 {
		return nil, errGitFormat
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Path < result[j].Path })
	return result, nil
}

func fingerprintFile(selection, repo string, c *FileChange, remaining *int64) {
	c.Content = "unreadable"
	path := filepath.Join(repo, filepath.FromSlash(c.Path))
	if !policy.Inside(path, selection) {
		c.Content = "outside_selection"
		return
	}
	if strings.TrimSpace(path) != path {
		c.Content = "unsupported_path"
		return
	}
	// Reject all symlink components, including links that resolve within scope;
	// neither secret targets nor nested repositories are traversed for hashes.
	for cursor := path; cursor != selection; cursor = filepath.Dir(cursor) {
		info, err := os.Lstat(cursor)
		if err == nil && info.Mode()&os.ModeSymlink != 0 {
			c.Content = "symlink_not_followed"
			return
		}
		if cursor != path {
			if _, err := os.Lstat(filepath.Join(cursor, ".git")); !errors.Is(err, os.ErrNotExist) {
				c.Content = "nested_repository"
				return
			}
		}
	}
	private := []string{config.Dir()}
	if home, err := os.UserHomeDir(); err == nil {
		private = append(private, filepath.Join(home, ".codex"), filepath.Join(home, ".claude"))
	}
	for _, name := range []string{"CODEX_HOME", "CLAUDE_CONFIG_DIR"} {
		if p := os.Getenv(name); filepath.IsAbs(p) {
			private = append(private, p)
		}
	}
	resolved, err := policy.Enforce(path, protocol.Policy{TaskWorkspaceRoot: selection, SensitivePaths: private}, false)
	if err != nil {
		c.Content = "protected_path"
		return
	}
	if c.Kind == "submodule" {
		c.Content = "submodule_not_inspected"
		return
	}
	info, err := os.Lstat(resolved)
	if errors.Is(err, os.ErrNotExist) && (c.Index == "D" || c.Worktree == "D") {
		c.Content = "deleted"
		return
	}
	if err != nil {
		return
	}
	if !info.Mode().IsRegular() {
		c.Content = "not_regular_file"
		return
	}
	c.Size, c.Mode = info.Size(), uint32(info.Mode())
	if info.Size() > maxFileBytes {
		c.Content = "size_limit"
		return
	}
	if info.Size() > *remaining {
		c.Content = "total_limit"
		return
	}
	// Force lazy Windows file identity resolution before opening/replacement.
	if !os.SameFile(info, info) {
		return
	}
	f, err := os.Open(resolved)
	if err != nil {
		return
	}
	defer f.Close()
	opened, err := f.Stat()
	if err != nil || !os.SameFile(info, opened) || !opened.Mode().IsRegular() {
		c.Content = "changed_while_reading"
		return
	}
	h := sha256.New()
	n, err := io.Copy(h, io.LimitReader(f, info.Size()+1))
	*remaining -= n
	after, statErr := f.Stat()
	current, pathErr := os.Lstat(resolved)
	if err != nil || statErr != nil || pathErr != nil || !os.SameFile(info, current) || n != info.Size() || after.Size() != info.Size() || !after.ModTime().Equal(info.ModTime()) || after.Mode() != info.Mode() {
		c.Content = "changed_while_reading"
		return
	}
	c.Content, c.SHA256 = "hashed", hex.EncodeToString(h.Sum(nil))
}
