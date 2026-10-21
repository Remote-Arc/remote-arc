// Package takeover discovers project-scoped local session metadata.
// It does not load conversations, change agent configuration or start work.
package takeover

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/policy"
)

const Version = "remotearc.takeover-discovery/v1"
const metadataBytes = 64 << 10
const maxEntries = 20000

type Session struct {
	Agent    string    `json:"agent"`
	ID       string    `json:"id"`
	Path     string    `json:"path"`
	CWD      string    `json:"cwd"`
	Modified time.Time `json:"modified"`
}

type Source struct {
	Agent  string `json:"agent"`
	Root   string `json:"root"`
	Status string `json:"status"`
}

type Discovery struct {
	Version   string    `json:"version"`
	Workspace string    `json:"workspace"`
	Sources   []Source  `json:"sources"`
	Sessions  []Session `json:"sessions"`
	Skipped   int       `json:"skipped_entries"`
	Limited   bool      `json:"limit_reached"`
}

func workspaceDirectory(ctx context.Context, path string) (string, error) {
	if ctx.Err() != nil {
		return "", ctx.Err()
	}
	if strings.TrimSpace(path) == "" {
		return "", errors.New("--workspace must name a local project directory")
	}
	root, err := policy.Canonical(path)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(root)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", errors.New("--workspace must be a directory")
	}
	return root, nil
}

func sessionMeta(agent, path string) (Session, error) {
	s := Session{Agent: agent, Path: path}
	info, err := os.Lstat(path)
	if err != nil {
		return s, err
	}
	if !info.Mode().IsRegular() {
		return s, errors.New("session must be a regular file")
	}
	f, err := os.Open(path)
	if err != nil {
		return s, err
	}
	defer f.Close()
	opened, err := f.Stat()
	if err != nil || !os.SameFile(info, opened) {
		return s, errors.New("session changed while opening")
	}
	// Read at most 64 KiB and expose only ID, cwd and filesystem metadata.
	// Conversation text, tool calls and reasoning have no output fields.
	scanner := bufio.NewScanner(io.LimitReader(f, metadataBytes))
	scanner.Buffer(make([]byte, 4096), metadataBytes)
	for scanner.Scan() {
		var r struct {
			Type      string `json:"type"`
			SessionID string `json:"sessionId"`
			CWD       string `json:"cwd"`
			Payload   struct {
				ID  string `json:"id"`
				CWD string `json:"cwd"`
			} `json:"payload"`
		}
		if json.Unmarshal(scanner.Bytes(), &r) != nil {
			continue
		}
		id, cwd := "", ""
		if agent == "codex" && r.Type == "session_meta" {
			id, cwd = r.Payload.ID, r.Payload.CWD
		} else if agent == "claude" {
			id, cwd = r.SessionID, r.CWD
		}
		if id != "" && len(id) <= 256 && !strings.ContainsAny(id, "\x00\r\n\t") && filepath.IsAbs(cwd) {
			s.ID, s.CWD, s.Modified = id, cwd, info.ModTime().UTC()
			return s, nil
		}
	}
	return s, errors.New("no supported session metadata in the first 64 KiB")
}

// Include subdirectory sessions while excluding nested Git repositories.
func belongsToWorkspace(s Session, root string) bool {
	cwd, err := policy.Canonical(s.CWD)
	if err != nil || !policy.Inside(cwd, root) {
		return false
	}
	for cursor := cwd; cursor != root; cursor = filepath.Dir(cursor) {
		if _, err := os.Lstat(filepath.Join(cursor, ".git")); err == nil || !errors.Is(err, os.ErrNotExist) {
			return false
		}
	}
	return true
}

func sourceRoot(agent, home string) string {
	if agent == "codex" {
		base := os.Getenv("CODEX_HOME")
		if base == "" {
			base = filepath.Join(home, ".codex")
		}
		return filepath.Join(base, "sessions")
	}
	base := os.Getenv("CLAUDE_CONFIG_DIR")
	if base == "" {
		base = filepath.Join(home, ".claude")
	}
	return filepath.Join(base, "projects")
}

func Discover(ctx context.Context, workspace, agent, override string, limit int) (Discovery, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	d := Discovery{Version: Version, Sessions: []Session{}, Sources: []Source{}}
	if agent != "all" && agent != "codex" && agent != "claude" {
		return d, errors.New("--source must be codex, claude or all")
	}
	if override != "" && agent == "all" {
		return d, errors.New("--sessions-root requires one explicit --source")
	}
	if limit < 1 || limit > 100 {
		return d, errors.New("--limit must be between 1 and 100")
	}
	root, err := workspaceDirectory(ctx, workspace)
	if err != nil {
		return d, err
	}
	d.Workspace = root
	home, err := os.UserHomeDir()
	if err != nil {
		return d, err
	}
	agents := []string{agent}
	if agent == "all" {
		agents = []string{"codex", "claude"}
	}
	visited := 0
	for _, current := range agents {
		base := override
		if base == "" {
			base = sourceRoot(current, home)
		}
		base, err = filepath.Abs(base)
		if err != nil {
			return d, err
		}
		source := Source{Agent: current, Root: base, Status: "available"}
		err = filepath.WalkDir(base, func(path string, entry fs.DirEntry, walkErr error) error {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			visited++
			if visited > maxEntries {
				d.Limited = true
				source.Status = "scan_limit_reached"
				return fs.SkipAll
			}
			if walkErr != nil {
				if path == base {
					if errors.Is(walkErr, os.ErrNotExist) {
						source.Status = "not_found"
						return nil
					}
					return walkErr
				}
				d.Skipped++
				return nil
			}
			rel, _ := filepath.Rel(base, path)
			depth := len(strings.Split(rel, string(filepath.Separator)))
			maxDepth := 4 // sessions/YYYY/MM/DD/rollout-*.jsonl
			if current == "claude" {
				maxDepth = 2
			} // projects/<project>/<id>.jsonl; exclude subagents.
			if entry.Type()&os.ModeSymlink != 0 {
				d.Skipped++
				if path == base {
					source.Status = "symlink_not_followed"
				}
				return nil
			}
			if path == base && !entry.IsDir() {
				return errors.New("session root must be a directory")
			}
			if entry.IsDir() {
				if depth >= maxDepth {
					return fs.SkipDir
				}
				return nil
			}
			if filepath.Ext(path) != ".jsonl" {
				return nil
			}
			s, err := sessionMeta(current, path)
			if err != nil {
				d.Skipped++
			} else if belongsToWorkspace(s, root) {
				d.Sessions = append(d.Sessions, s)
			}
			return nil
		})
		if err != nil {
			return d, err
		}
		d.Sources = append(d.Sources, source)
	}
	sort.Slice(d.Sessions, func(i, j int) bool {
		if d.Sessions[i].Modified.Equal(d.Sessions[j].Modified) {
			return d.Sessions[i].Path < d.Sessions[j].Path
		}
		return d.Sessions[i].Modified.After(d.Sessions[j].Modified)
	})
	if len(d.Sessions) > limit {
		d.Sessions, d.Limited = d.Sessions[:limit], true
	}
	return d, nil
}
