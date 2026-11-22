package agent

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/takeover"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/policy"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
)

// AgentSessionsTool lets a calling AI answer "which Codex / Claude Code tasks
// exist on this computer, where is each one's working directory or worktree,
// and what Git state is it in" without guessing paths. It is read-only and
// returns metadata only: no conversation text, tool calls or file contents.
const AgentSessionsTool = "list_agent_sessions"

const (
	agentSessionsDefaultLimit = 15
	agentSessionsMaxLimit     = 50
	agentSessionsMaxGit       = 6
	agentSessionsGitBudget    = 20 * time.Second
	agentSessionRecent        = 10 * time.Minute
)

type agentSession struct {
	Agent          string    `json:"agent"`
	ID             string    `json:"id"`
	SessionFile    string    `json:"session_file"`
	WorkingDir     string    `json:"working_directory"`
	LastActivity   time.Time `json:"last_activity"`
	MinutesIdle    int       `json:"minutes_since_activity"`
	RecentActivity bool      `json:"recent_activity"`
}

type agentWorkspace struct {
	Path             string   `json:"path"`
	Status           string   `json:"status"`
	Reason           string   `json:"reason,omitempty"`
	RepositoryRoot   string   `json:"repository_root,omitempty"`
	LinkedWorktree   bool     `json:"is_linked_worktree,omitempty"`
	Branch           string   `json:"branch,omitempty"`
	Head             string   `json:"head,omitempty"`
	Detached         bool     `json:"detached,omitempty"`
	Upstream         string   `json:"upstream,omitempty"`
	Ahead            *int     `json:"ahead,omitempty"`
	Behind           *int     `json:"behind,omitempty"`
	ChangedFiles     int      `json:"changed_files"`
	ChangesTruncated bool     `json:"changes_truncated,omitempty"`
	OtherWorktrees   []string `json:"other_worktrees,omitempty"`
}

type agentSessionsResult struct {
	Version    string            `json:"version"`
	Workspace  string            `json:"workspace,omitempty"`
	Sources    []takeover.Source `json:"sources"`
	Sessions   []agentSession    `json:"sessions"`
	Workspaces []agentWorkspace  `json:"workspaces"`
	Skipped    int               `json:"skipped_entries"`
	Limited    bool              `json:"limit_reached"`
	Note       string            `json:"note"`
}

func agentSessionsArgs(args map[string]any) (source, workspace string, limit int, git bool, err error) {
	source = strings.ToLower(strings.TrimSpace(protocol.OptionalString(args, "source")))
	if source == "" {
		source = "all"
	}
	if source != "all" && source != "codex" && source != "claude" {
		return "", "", 0, false, errors.New(`source must be "codex", "claude" or "all".`)
	}
	workspace = strings.TrimSpace(protocol.OptionalString(args, "workspace"))
	limit = protocol.Number(args, "limit", agentSessionsDefaultLimit)
	if limit < 1 {
		limit = 1
	}
	if limit > agentSessionsMaxLimit {
		limit = agentSessionsMaxLimit
	}
	git = true
	if value, ok := args["git"].(bool); ok {
		git = value
	}
	return source, workspace, limit, git, nil
}

// listAgentSessions applies the device read policy to every path it returns,
// so sensitive locations stay hidden exactly as they are for read_file.
func listAgentSessions(ctx context.Context, args map[string]any, p protocol.Policy) (any, error) {
	source, workspace, limit, git, err := agentSessionsArgs(args)
	if err != nil {
		return nil, err
	}
	readPolicy := protocol.Normalize(p)
	readPolicy.WorkspaceRoots = nil
	var found takeover.Discovery
	if workspace != "" {
		if _, err := policy.Enforce(workspace, readPolicy, false); err != nil {
			return nil, err
		}
		found, err = takeover.Discover(ctx, workspace, source, "", limit)
	} else {
		found, err = takeover.DiscoverRecent(ctx, source, limit)
	}
	if err != nil {
		return nil, err
	}
	now := time.Now()
	result := agentSessionsResult{
		Version:    "remotearc.agent-sessions/v1",
		Workspace:  found.Workspace,
		Sources:    found.Sources,
		Sessions:   []agentSession{},
		Workspaces: []agentWorkspace{},
		Skipped:    found.Skipped,
		Limited:    found.Limited,
		Note:       "Metadata only. last_activity is the session file's modification time: recent activity suggests, but does not prove, that the agent is still working. Use list_processes with filter \"codex\" or \"claude\" to see live processes, and read session_file only if the user needs the conversation.",
	}
	seen := map[string]bool{}
	cwds := []string{}
	for _, s := range found.Sessions {
		if _, err := policy.Enforce(s.Path, readPolicy, false); err != nil {
			result.Skipped++
			continue
		}
		cwd := s.CWD
		if _, err := policy.Enforce(cwd, readPolicy, false); err != nil {
			cwd = ""
		}
		idle := now.Sub(s.Modified)
		result.Sessions = append(result.Sessions, agentSession{
			Agent: s.Agent, ID: s.ID, SessionFile: s.Path, WorkingDir: cwd,
			LastActivity: s.Modified, MinutesIdle: int(idle.Minutes()), RecentActivity: idle >= 0 && idle < agentSessionRecent,
		})
		if cwd != "" {
			key := strings.ToLower(filepath.Clean(cwd))
			if !seen[key] {
				seen[key] = true
				cwds = append(cwds, cwd)
			}
		}
	}
	if !git {
		return result, nil
	}
	gitCtx, cancel := context.WithTimeout(ctx, agentSessionsGitBudget)
	defer cancel()
	for i, cwd := range cwds {
		if i >= agentSessionsMaxGit {
			result.Workspaces = append(result.Workspaces, agentWorkspace{Path: cwd, Status: "not_inspected", Reason: "inspection limit reached; pass workspace to inspect this one"})
			continue
		}
		if gitCtx.Err() != nil {
			result.Workspaces = append(result.Workspaces, agentWorkspace{Path: cwd, Status: "not_inspected", Reason: "time budget reached"})
			continue
		}
		result.Workspaces = append(result.Workspaces, summarizeWorkspace(gitCtx, cwd, readPolicy))
	}
	return result, nil
}

func summarizeWorkspace(ctx context.Context, cwd string, readPolicy protocol.Policy) agentWorkspace {
	w := agentWorkspace{Path: cwd}
	inspection, err := takeover.InspectWorkspace(ctx, cwd)
	if err != nil {
		w.Status, w.Reason = "unavailable", err.Error()
		return w
	}
	w.Status, w.Reason = inspection.Status, inspection.Reason
	snap := inspection.Snapshot
	if snap == nil {
		return w
	}
	w.RepositoryRoot, w.Branch, w.Detached, w.Upstream, w.Ahead, w.Behind = snap.Root, snap.Branch, snap.Detached, snap.Upstream, snap.Ahead, snap.Behind
	if len(snap.HEAD) > 12 {
		w.Head = snap.HEAD[:12]
	} else {
		w.Head = snap.HEAD
	}
	w.LinkedWorktree = snap.GitDir != "" && snap.CommonDir != "" && !strings.EqualFold(filepath.Clean(snap.GitDir), filepath.Clean(snap.CommonDir))
	w.ChangedFiles, w.ChangesTruncated = len(snap.Changes), snap.LimitReached
	for _, linked := range snap.Worktrees {
		if strings.EqualFold(filepath.Clean(linked.Path), filepath.Clean(snap.Root)) || len(w.OtherWorktrees) >= 20 {
			continue
		}
		if _, err := policy.Enforce(linked.Path, readPolicy, false); err != nil {
			continue
		}
		label := linked.Path
		if linked.Branch != "" {
			label += " (" + strings.TrimPrefix(linked.Branch, "refs/heads/") + ")"
		}
		w.OtherWorktrees = append(w.OtherWorktrees, label)
	}
	return w
}
