package execution

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"sync"

	"github.com/yaohuangguan/remote-arc/packages/execution-core/policy"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/protocol"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/secrets"
)

//go:embed tools.json tool_modes.json guards.json
var contracts embed.FS

type Definition struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}
type guardRule struct {
	Pattern string `json:"pattern"`
	Reason  string `json:"reason"`
}

var definitions []Definition

// toolModes is the mode contract shared with the generated tool reference:
// "developer" adds to "safe", and every other mode exposes all definitions.
var toolModes struct {
	Safe      []string `json:"safe"`
	Developer []string `json:"developer"`
}
var guards []guardRule
var compiled []*regexp.Regexp

func init() {
	b, _ := contracts.ReadFile("tools.json")
	if e := json.Unmarshal(b, &definitions); e != nil {
		panic(e)
	}
	b, _ = contracts.ReadFile("tool_modes.json")
	if e := json.Unmarshal(b, &toolModes); e != nil {
		panic(e)
	}
	b, _ = contracts.ReadFile("guards.json")
	if e := json.Unmarshal(b, &guards); e != nil {
		panic(e)
	}
	for _, g := range guards {
		compiled = append(compiled, regexp.MustCompile(g.Pattern))
	}
}

// AssertCommandAllowed checks a command that runs in this process's working directory.
func AssertCommandAllowed(command string) error {
	return AssertCommandAllowedIn(command, "")
}

// AssertCommandAllowedIn refuses catastrophic commands before they run. Deletion
// is judged by where it would land (delete_guard.go), so narrow cleanup stays
// allowed while roots, homes, protected folders and unresolvable targets are
// refused. cwd is the directory the shell starts in ("" = this process's).
func AssertCommandAllowedIn(command, cwd string) error {
	if os.Getenv("REMOTEARC_ALLOW_DESTRUCTIVE") == "1" {
		return nil
	}
	if reason := FindDangerousDelete(command, LocalDeleteGuardContext(cwd)); reason != "" {
		return errors.New("Blocked by Remote Arc Safety Guard: " + reason + ". Delete a specific folder with a literal absolute path in a single shell layer, or use the safe-cleanup Skill for bulk cleanup. Run this action manually on the device if you intentionally need it.")
	}
	for i, re := range compiled {
		if re.MatchString(command) {
			return errors.New("Blocked by Remote Arc Safety Guard: " + guards[i].Reason + ". Run this action manually on the device if you intentionally need it.")
		}
	}
	return nil
}

type Core struct {
	Mode      string
	Processes *Processes
	// Secrets holds one-time values a user entered for start_process stdin_secret.
	Secrets  *secrets.Store
	mutation sync.Mutex
}

func New(mode string) *Core {
	return &Core{Mode: mode, Processes: NewProcesses(), Secrets: secrets.New()}
}
func (c *Core) ListTools() []Definition {
	result := []Definition{}
	for _, d := range definitions {
		if c.Mode == "safe" && !slices.Contains(toolModes.Safe, d.Name) {
			continue
		}
		if c.Mode == "developer" && !slices.Contains(toolModes.Safe, d.Name) && !slices.Contains(toolModes.Developer, d.Name) {
			continue
		}
		result = append(result, d)
	}
	return result
}
func (c *Core) Close() { c.Processes.Close() }
func (c *Core) Call(ctx context.Context, name string, args map[string]any, p protocol.Policy) (protocol.Result, error) {
	p = protocol.Normalize(p)
	allowed := false
	for _, d := range c.ListTools() {
		if d.Name == name {
			allowed = true
			break
		}
	}
	if !allowed {
		return protocol.Result{}, errors.New("Tool blocked by local permission mode: " + name)
	}
	if args == nil {
		args = map[string]any{}
	}
	rawPath := func(key string, workspace bool) (string, error) {
		s, e := protocol.String(args, key)
		if e != nil {
			return "", e
		}
		return policy.Enforce(s, p, workspace)
	}
	var result any
	var e error
	switch name {
	case "list_directory", "browse_directories", "read_file", "read_binary_file", "get_file_info":
		target, err := rawPath("path", false)
		if err != nil {
			return protocol.Result{}, err
		}
		switch name {
		case "list_directory":
			result, e = listDirectory(target, protocol.Number(args, "depth", 2), p)
		case "browse_directories":
			result, e = browse(target, p)
		case "read_file":
			result, e = readText(target, protocol.Number(args, "offset", 0), protocol.Number(args, "length", 240))
		case "read_binary_file":
			result, e = readBinary(target, protocol.Number(args, "offset", 0), protocol.Number(args, "length", 65536), protocol.OptionalString(args, "expected_revision"))
		case "get_file_info":
			result, e = fileInfo(target)
		}
	case "list_processes":
		result, e = listProcesses(protocol.OptionalString(args, "filter"), protocol.Number(args, "limit", 200), protocol.Bool(args, "details"))
	case "list_undo_actions", "undo_change", "undo_last_change":
		c.mutation.Lock()
		defer c.mutation.Unlock()
		if name != "list_undo_actions" && !protocol.Enabled(p.UndoEnabled) {
			return protocol.Result{}, errors.New("Local Undo is disabled for this device.")
		}
		limit := 100
		if name == "list_undo_actions" {
			limit = protocol.Number(args, "limit", 20)
		}
		items, err := undoCandidates()
		if err != nil {
			return protocol.Result{}, err
		}
		visible := []snapshot{}
		for _, a := range items {
			if _, err := policy.Enforce(a.Manifest.Target, p, true); err == nil {
				visible = append(visible, a)
			}
		}
		if name == "list_undo_actions" {
			// List metadata and validation status only for authorized records.
			result, e = listUndoFiltered(visible, limit)
			break
		}
		var selected *snapshot
		if name == "undo_change" {
			id, err := protocol.String(args, "action_id")
			if err != nil {
				return protocol.Result{}, err
			}
			for i := range visible {
				if visible[i].Manifest.ID == id {
					selected = &visible[i]
					break
				}
			}
		} else if len(visible) > 0 {
			selected = &visible[0]
		}
		if selected == nil {
			if name == "undo_last_change" {
				e = errors.New("No reversible in-scope Remote Arc file change is available.")
			} else {
				e = errors.New("Undo action not found or expired on this device.")
			}
			break
		}
		result, e = restoreUndoSnapshot(*selected)
	case "start_process":
		command, err := protocol.String(args, "command")
		if err != nil {
			return protocol.Result{}, err
		}
		// Relative delete targets are judged against the directory the shell starts in.
		guardCwd := protocol.OptionalString(args, "cwd")
		if guardCwd != "" {
			if abs, absErr := filepath.Abs(guardCwd); absErr == nil {
				guardCwd = abs
			}
		}
		if err = AssertCommandAllowedIn(command, guardCwd); err != nil {
			return protocol.Result{}, err
		}
		cwd := protocol.OptionalString(args, "cwd")
		if (len(p.WorkspaceRoots) > 0 || p.TaskWorkspaceRoot != "") && cwd == "" {
			return protocol.Result{}, errors.New("Trusted Write Locations are enabled. start_process requires an in-scope cwd. Terminal commands are not an OS sandbox and may still access paths outside that directory.")
		}
		if cwd != "" {
			cwd, e = policy.Enforce(cwd, p, true)
			if e != nil {
				return protocol.Result{}, e
			}
		}
		var seconds int
		if protocol.Bool(args, "background") {
			seconds, err = protocol.Integer(args, "max_duration_seconds", 0, 1, 7*86400)
			if err != nil {
				return protocol.Result{}, errors.New("Invalid managed process duration.")
			}
		}
		// Taken last, so a command refused above leaves the secret for a retry.
		secret := ""
		if handle := protocol.OptionalString(args, "stdin_secret"); handle != "" {
			if !secrets.ValidHandle(handle) {
				return protocol.Result{}, errors.New("stdin_secret must be a handle from request_secret.")
			}
			if c.Secrets == nil {
				return protocol.Result{}, errors.New("One-time secrets are unavailable on this device.")
			}
			if secret, err = c.Secrets.Take(handle); err != nil {
				return protocol.Result{}, err
			}
		}
		if protocol.Bool(args, "background") {
			result, e = c.Processes.BackgroundWithSecret(command, cwd, seconds, secret)
		} else {
			result, e = c.Processes.RunWithSecret(ctx, command, cwd, protocol.Number(args, "timeout_ms", 5000), secret)
		}
	case "list_managed_processes":
		result = c.Processes.List()
	case "process_status", "process_output", "stop_process":
		id, err := protocol.String(args, "process_id")
		if err != nil {
			return protocol.Result{}, err
		}
		switch name {
		case "process_status":
			waitMS, err := protocol.Integer(args, "wait_ms", 0, 0, 9007199254740991)
			if err != nil {
				return protocol.Result{}, err
			}
			result, e = c.Processes.WaitStatus(ctx, id, waitMS, protocol.OptionalString(args, "until_text"))
		case "process_output":
			result, e = c.Processes.Output(id)
		case "stop_process":
			result, e = c.Processes.Stop(id)
		}
	case "write_file", "edit_block":
		c.mutation.Lock()
		defer c.mutation.Unlock()
		key := "path"
		if name == "edit_block" {
			key = "file_path"
		}
		target, err := rawPath(key, true)
		if err != nil {
			return protocol.Result{}, err
		}
		var snap *snapshot
		if protocol.Enabled(p.UndoEnabled) {
			snap, e = createSnapshot(name, target)
			if e != nil {
				return protocol.Result{}, e
			}
		}
		var data map[string]any
		if name == "write_file" {
			content, err := protocol.String(args, "content")
			if err != nil {
				discardSnapshot(snap)
				return protocol.Result{}, err
			}
			mode := "rewrite"
			if args["mode"] == "append" {
				mode = "append"
			}
			data, e = writeText(target, content, mode)
		} else {
			old, err := protocol.String(args, "old_string")
			if err != nil {
				discardSnapshot(snap)
				return protocol.Result{}, err
			}
			next, err := protocol.String(args, "new_string")
			if err != nil {
				discardSnapshot(snap)
				return protocol.Result{}, err
			}
			data, e = editBlock(target, old, next, protocol.Number(args, "expected_replacements", 1))
		}
		if e != nil {
			// A failed post-rename directory sync can leave the target changed.
			// Keep the prepared snapshot for inspection instead of deleting it.
			discardUnchangedSnapshot(snap)
			break
		}
		available := finalizeSnapshot(snap)
		data["undo_available"] = available
		data["undo_storage"] = nil
		if available {
			data["undo_storage"] = "local-device-only"
		}
		result = data
	default:
		e = fmt.Errorf("Unknown Remote Arc tool: %s", name)
	}
	if e != nil {
		return protocol.Result{}, e
	}
	return protocol.TextResult(result), nil
}
