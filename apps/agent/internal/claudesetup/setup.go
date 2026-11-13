// Package claudesetup registers one user-scoped MCP through Claude's own CLI.
package claudesetup

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"runtime"
	"strings"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/mcpregistration"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/policy"
)

type Request struct{ Action, Binary, RemoteArcBinary, CWD string }
type Result struct {
	Agent              string `json:"agent"`
	Status             string `json:"status"`
	Registration       string `json:"registration"`
	ToolsVerified      bool   `json:"client_tools_verified"`
	ConnectionVerified bool   `json:"client_connection_verified"`
	Hint               string `json:"hint,omitempty"`
}
type record struct {
	Config, Name, Stage string
	Desired             json.RawMessage
}

type limitedOutput struct{ bytes.Buffer }

func (b *limitedOutput) Write(p []byte) (int, error) {
	if b.Len()+len(p) > 1<<20 {
		return 0, io.ErrShortBuffer
	}
	return b.Buffer.Write(p)
}

func command(ctx context.Context, binary, cwd string, args ...string) ([]byte, error) {
	c := exec.CommandContext(ctx, binary, args...)
	hide(c)
	c.Dir = cwd
	c.WaitDelay = time.Second
	c.Stdin = strings.NewReader("")
	c.Stderr = io.Discard
	for _, value := range os.Environ() {
		key, _, _ := strings.Cut(value, "=")
		if key != "CLAUDECODE" && key != "DISABLE_AUTOUPDATER" && key != "MCP_TIMEOUT" {
			c.Env = append(c.Env, value)
		}
	}
	c.Env = append(c.Env, "DISABLE_AUTOUPDATER=1", "MCP_TIMEOUT=5000")
	out := &limitedOutput{}
	c.Stdout = out
	err := c.Run()
	return out.Bytes(), err
}

func profileConfig() (string, error) {
	base := os.Getenv("CLAUDE_CONFIG_DIR")
	if base != "" {
		if !filepath.IsAbs(base) {
			return "", errors.New("claude_profile_invalid")
		}
		return filepath.Join(base, ".claude.json"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", errors.New("claude_profile_unavailable")
	}
	return filepath.Join(home, ".claude.json"), nil
}

func readConfig(path string) (map[string]json.RawMessage, error) {
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return map[string]json.RawMessage{}, nil
	}
	if err != nil || !info.Mode().IsRegular() || info.Size() >= 4<<20 {
		return nil, errors.New("claude_config_unavailable")
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, errors.New("claude_config_unavailable")
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, 4<<20))
	var result map[string]json.RawMessage
	if err != nil || len(b) >= 4<<20 || json.Unmarshal(b, &result) != nil || result == nil {
		return nil, errors.New("claude_config_invalid")
	}
	return result, nil
}

func servers(raw json.RawMessage) (map[string]json.RawMessage, error) {
	result := map[string]json.RawMessage{}
	if len(raw) > 0 && string(raw) != "null" && json.Unmarshal(raw, &result) != nil {
		return nil, errors.New("claude_mcp_config_invalid")
	}
	return result, nil
}

func same(a, b json.RawMessage) bool {
	var x, y any
	return json.Unmarshal(a, &x) == nil && json.Unmarshal(b, &y) == nil && reflect.DeepEqual(x, y)
}

func Run(ctx context.Context, request Request) (result Result, err error) {
	result = Result{Agent: "claude", Registration: mcpregistration.Name, Status: "skipped"}
	defer func() {
		if err != nil {
			result.Status = "setup_skipped"
			result.Hint = err.Error()
		}
	}()
	if request.Action != "install" && request.Action != "status" && request.Action != "doctor" && request.Action != "uninstall" && request.Action != "repair" {
		return result, errors.New("claude_action_invalid")
	}
	file, err := profileConfig()
	if err != nil {
		return result, err
	}
	canonical, err := policy.Canonical(file)
	if err != nil {
		return result, errors.New("claude_profile_unavailable")
	}
	key := sha256.Sum256([]byte(canonical))
	stateDir := filepath.Join(config.Dir(), "integrations", "claude")
	lock, err := lease.Acquire(stateDir, hex.EncodeToString(key[:]))
	if err != nil || lock == nil {
		return result, errors.New("claude_setup_busy")
	}
	defer lock.Release()
	stateFile := filepath.Join(stateDir, hex.EncodeToString(key[:])+".json")
	state, err := readConfig(stateFile)
	if err != nil {
		return result, err
	}
	var owned *record
	if len(state) > 0 {
		b, _ := json.Marshal(state)
		var r record
		if json.Unmarshal(b, &r) != nil || r.Config != canonical || r.Name != mcpregistration.Name || (r.Stage != "prepared" && r.Stage != "installed" && r.Stage != "removing") || !mcpregistration.IsRemoteArc(r.Desired) {
			return result, errors.New("claude_ownership_invalid")
		}
		owned = &r
	}
	current, err := readConfig(file)
	if err != nil {
		return result, err
	}
	global, err := servers(current["mcpServers"])
	if err != nil {
		return result, err
	}
	entry := global[mcpregistration.Name]
	if request.Action == "status" {
		if name, ok := mcpregistration.Existing(global); ok {
			result.Status, result.Registration = "already_registered", name
		} else {
			result.Status = "not_installed"
		}
		return result, nil
	}
	if request.Action == "install" {
		if name, ok := mcpregistration.Existing(global); ok && (name != mcpregistration.Name || owned == nil || owned.Stage == "installed") {
			result.Status, result.Registration = "already_registered", name
			return result, nil
		}
		// Read project/local registrations without executing them or granting trust.
		if request.CWD != "" {
			var projects map[string]map[string]json.RawMessage
			if len(current["projects"]) > 0 && json.Unmarshal(current["projects"], &projects) != nil {
				return result, errors.New("claude_projects_config_invalid")
			}
			for cwd, settings := range projects {
				p, e := policy.Canonical(cwd)
				wanted, _ := policy.Canonical(request.CWD)
				if e == nil && p == wanted {
					local, e := servers(settings["mcpServers"])
					if e != nil {
						return result, e
					}
					if name, ok := mcpregistration.Existing(local); ok {
						result.Status, result.Registration = "already_registered", name
						return result, nil
					}
				}
			}
			project, e := readConfig(filepath.Join(request.CWD, ".mcp.json"))
			if e != nil {
				return result, e
			}
			local, e := servers(project["mcpServers"])
			if e != nil {
				return result, e
			}
			if name, ok := mcpregistration.Existing(local); ok {
				result.Status, result.Registration = "already_registered", name
				return result, nil
			}
		}
	}
	if len(entry) > 0 && (owned == nil || !same(entry, owned.Desired)) {
		return result, errors.New("claude_registration_conflict")
	}
	if (request.Action == "uninstall" || request.Action == "repair") && owned == nil {
		result.Status = "not_owned"
		return result, nil
	}
	if request.Action == "doctor" {
		if owned == nil {
			return result, errors.New("claude_registration_not_owned")
		}
		if len(entry) == 0 {
			return result, errors.New("claude_registration_missing")
		}
	}
	if request.Action == "install" || request.Action == "repair" {
		settingsDir := filepath.Dir(file)
		if os.Getenv("CLAUDE_CONFIG_DIR") == "" {
			settingsDir = filepath.Join(settingsDir, ".claude")
		}
		if err := checkPolicy(policyPaths(settingsDir, request.CWD)); err != nil {
			return result, err
		}
	}
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	if err = os.MkdirAll(filepath.Dir(file), 0700); err != nil {
		return result, errors.New("claude_profile_unavailable")
	}
	version, e := command(ctx, request.Binary, filepath.Dir(file), "--version")
	if e != nil || !regexp.MustCompile(`^2\.[0-9]+\.[0-9]+ \(Claude Code\)\s*$`).Match(version) {
		return result, errors.New("claude_version_unavailable")
	}
	probe, err := os.MkdirTemp("", "remote-arc-claude-probe-")
	if err != nil {
		return result, errors.New("claude_probe_unavailable")
	}
	defer func() {
		base, e1 := filepath.EvalSymlinks(os.TempDir())
		target, e2 := filepath.EvalSymlinks(probe)
		if e1 == nil && e2 == nil {
			rel, e := filepath.Rel(base, target)
			if e == nil && filepath.Dir(rel) == "." && strings.HasPrefix(rel, "remote-arc-claude-probe-") {
				_ = os.RemoveAll(target)
			}
		}
	}()
	save := func() error {
		select {
		case <-lock.Lost():
			return errors.New("claude_setup_lock_lost")
		default:
		}
		b, _ := json.Marshal(owned)
		if config.DurableWrite(stateFile, b, 0600) != nil {
			return errors.New("claude_ownership_save_failed")
		}
		return nil
	}
	if request.Action == "uninstall" {
		if len(entry) > 0 {
			owned.Stage = "removing"
			if e := save(); e != nil {
				return result, e
			}
			if _, e := command(ctx, request.Binary, probe, "mcp", "remove", mcpregistration.Name, "--scope", "user"); e != nil {
				return result, errors.New("claude_remove_not_confirmed")
			}
		}
		after, e := readConfig(file)
		if e != nil {
			return result, e
		}
		items, e := servers(after["mcpServers"])
		if e != nil {
			return result, e
		}
		if len(items[mcpregistration.Name]) > 0 {
			return result, errors.New("claude_registration_changed")
		}
		if e := os.Remove(stateFile); e != nil && !errors.Is(e, os.ErrNotExist) {
			return result, errors.New("claude_ownership_cleanup_failed")
		}
		result.Status = "uninstalled"
		return result, nil
	}
	if len(entry) == 0 {
		// Account connector enumeration runs outside the user's project.
		listing, e := command(ctx, request.Binary, probe, "mcp", "list")
		if e != nil {
			return result, errors.New("claude_connector_inspection_failed")
		}
		if remoteInListing(string(listing)) {
			result.Status = "connector_present"
			return result, nil
		}
		if unknownConnector(string(listing)) {
			return result, errors.New("claude_connector_identity_unavailable")
		}
		binary, e := mcpregistration.PinBinary(ctx, request.RemoteArcBinary)
		if e != nil {
			return result, e
		}
		desired := mcpregistration.Desired(binary, true)
		owned = &record{Config: canonical, Name: mcpregistration.Name, Stage: "prepared", Desired: desired}
		if e = save(); e != nil {
			return result, e
		}
		select {
		case <-lock.Lost():
			return result, errors.New("claude_setup_lock_lost")
		default:
		}
		if _, e = command(ctx, request.Binary, probe, "mcp", "add", "--transport", "stdio", "--scope", "user", mcpregistration.Name, "--", binary, "--mcp", "--safe"); e != nil {
			return result, errors.New("claude_registration_not_confirmed")
		}
	}
	after, e := readConfig(file)
	if e != nil {
		return result, e
	}
	items, e := servers(after["mcpServers"])
	if e != nil {
		return result, e
	}
	if owned == nil || !same(items[mcpregistration.Name], owned.Desired) {
		return result, errors.New("claude_registration_changed")
	}
	status, e := command(ctx, request.Binary, probe, "mcp", "get", mcpregistration.Name)
	if e != nil || !strings.Contains(string(status), "Status: ✓ Connected") {
		return result, errors.New("claude_connection_not_verified")
	}
	owned.Stage = "installed"
	if e = save(); e != nil {
		return result, e
	}
	result.Status, result.ConnectionVerified = "installed", true
	if request.Action == "doctor" {
		result.Status = "healthy"
	}
	return result, nil
}

func remoteInListing(value string) bool {
	for _, candidate := range regexp.MustCompile(`https://[^\s)\]<>]+`).FindAllString(value, -1) {
		if mcpregistration.Endpoint(candidate) {
			return true
		}
	}
	return strings.Contains(strings.ToLower(value), "claude.ai remote arc:") || strings.Contains(strings.ToLower(value), "claude.ai remotearc:")
}

// A renamed account connector without endpoint metadata cannot safely be
// classified as a different service. Do not add a possible duplicate.
func unknownConnector(value string) bool {
	for _, line := range strings.Split(value, "\n") {
		if strings.Contains(strings.ToLower(line), "claude.ai") && !regexp.MustCompile(`https://[^\s]+`).MatchString(line) {
			return true
		}
	}
	return false
}

func policyPaths(profile, cwd string) []string {
	base := "/etc/claude-code"
	switch runtime.GOOS {
	case "darwin":
		base = "/Library/Application Support/ClaudeCode"
	case "windows":
		base = os.Getenv("ProgramFiles")
		if !filepath.IsAbs(base) {
			base = `C:\Program Files`
		}
		base = filepath.Join(base, "ClaudeCode")
	}
	paths := []string{filepath.Join(base, "managed-mcp.json"), filepath.Join(base, "managed-settings.json"), filepath.Join(profile, "settings.json")}
	if cwd != "" {
		paths = append(paths, filepath.Join(cwd, ".claude", "settings.json"), filepath.Join(cwd, ".claude", "settings.local.json"))
	}
	return paths
}

// This initial automatic integration leaves restricted/managed profiles alone;
// it does not broaden an allowlist or silently re-enable blocked tools.
func checkPolicy(paths []string) error {
	for _, path := range paths {
		_, err := os.Lstat(path)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil || filepath.Base(path) == "managed-mcp.json" || filepath.Base(path) == "managed-settings.json" {
			return errors.New("claude_managed_config")
		}
		settings, err := readConfig(path)
		if err != nil {
			return err
		}
		for _, key := range []string{"allowedMcpServers", "deniedMcpServers", "managedMcpServers", "strictPluginOnlyCustomization", "allowManagedMcpServersOnly"} {
			if _, exists := settings[key]; exists {
				return errors.New("claude_managed_config")
			}
		}
	}
	return nil
}
