package codexsetup

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/lease"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/localmcp"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/mcpregistration"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/workspaceidentity"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/config"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/execution"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/policy"
)

type Request struct {
	Action, Workspace, CodexBinary, RemoteArcBinary, Version string
	Global                                                   bool
}
type Result struct {
	Contract      string `json:"contract"`
	Action        string `json:"action"`
	Agent         string `json:"agent"`
	Status        string `json:"status"`
	Workspace     string `json:"workspace"`
	Registration  string `json:"registration"`
	ClientVersion string `json:"client_version,omitempty"`
	Changed       *bool  `json:"changed"`
	ToolsVerified bool   `json:"client_tools_verified"`
	Restart       string `json:"existing_clients"`
	ErrorCode     string `json:"error_code,omitempty"`
	Hint          string `json:"hint,omitempty"`
}

type transaction struct {
	profile, root, name, binary, identity, binaryHash string
	store                                             store
	provider                                          provider
	held                                              func() bool
	global                                            bool
}

func Run(ctx context.Context, request Request) (result Result, err error) {
	result = Result{Contract: recordContract, Action: request.Action, Agent: "codex", Status: "unverified", Changed: change(false), Restart: "Restart existing Codex clients after registration changes. Current diagnostic verification is reported in client_tools_verified."}
	defer func() {
		if err != nil {
			result.Status = "action_required"
			if failure, ok := err.(*Failure); ok {
				result.ErrorCode = failure.Code
				result.Hint = failure.Hint
			} else {
				result.ErrorCode = "setup_failed"
				result.Hint = "Local setup could not complete; run doctor."
			}
		}
	}()
	switch request.Action {
	case "install", "status", "doctor", "repair", "uninstall":
	default:
		return result, fail("action_invalid", "Use install, status, doctor, repair or uninstall.")
	}
	if !request.Global && !filepath.IsAbs(request.Workspace) {
		return result, fail("workspace_invalid", "Select an absolute project directory with --workspace.")
	}
	root, err := policy.Canonical(request.Workspace)
	if !request.Global && err != nil {
		return result, fail("workspace_unavailable", "Could not resolve the selected project directory.")
	}
	result.Workspace = root
	profile := os.Getenv("CODEX_HOME")
	if profile == "" {
		home, e := os.UserHomeDir()
		if e != nil {
			return result, fail("profile_unavailable", "Could not find the current user's Codex profile.")
		}
		profile = filepath.Join(home, ".codex")
	}
	if !filepath.IsAbs(profile) {
		return result, fail("profile_invalid", "CODEX_HOME must be an absolute local profile directory.")
	}
	profile, err = policy.Canonical(profile)
	if err != nil {
		return result, fail("profile_unavailable", "Could not resolve the selected Codex profile.")
	}
	if request.Global {
		root, result.Workspace = profile, ""
	}
	sum := sha256.Sum256([]byte(profile + "\x00" + root))
	key := hex.EncodeToString(sum[:])
	name := "remote_arc_" + key[:16]
	if request.Global {
		name = mcpregistration.Name
	}
	result.Registration = name
	stateDir := filepath.Join(config.Dir(), "integrations", "codex")
	state := fileStore{filepath.Join(stateDir, key+".json")}
	old, err := state.load()
	if err != nil {
		return result, err
	}
	if old == nil && request.Action != "install" {
		result.Status = "not_installed"
		return result, nil
	}
	if request.RemoteArcBinary == "" {
		request.RemoteArcBinary, err = os.Executable()
		if err != nil {
			return result, fail("binary_unavailable", "Could not resolve the running Remote Arc binary.")
		}
	}
	if !filepath.IsAbs(request.RemoteArcBinary) {
		return result, fail("binary_unavailable", "Remote Arc requires its absolute native binary path.")
	}
	identity, idErr := workspaceidentity.Read(root)
	if !request.Global && (request.Action == "install" || request.Action == "repair") {
		core := execution.New("safe")
		_, scopeErr := localmcp.WorkspaceServer(core, request.Version, root)
		core.Close()
		if scopeErr != nil || idErr != nil {
			return result, fail("workspace_unavailable", "The project is missing, protected or cannot be identified; choose an available project.")
		}
	}
	if err = os.MkdirAll(profile, 0700); err != nil {
		return result, fail("profile_unavailable", "Codex profile is not writable or available.")
	}
	if request.Global {
		identity, idErr = workspaceidentity.Read(profile)
		if idErr != nil {
			return result, idErr
		}
	}
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	clientVersion, err := qualify(ctx, request.CodexBinary, profile)
	if err != nil {
		return result, err
	}
	result.ClientVersion = clientVersion
	rpc, err := startRPC(ctx, request.CodexBinary, profile)
	if err != nil {
		return result, err
	}
	defer rpc.close()
	mutating := request.Action == "install" || request.Action == "repair" || request.Action == "uninstall"
	held := func() bool { return true }
	if mutating {
		lock, e := lease.Acquire(stateDir, key)
		if e != nil || lock == nil {
			return result, fail("setup_busy", "Another local setup operation is active; retry after it finishes.")
		}
		defer lock.Release()
		held = func() bool {
			select {
			case <-lock.Lost():
				return false
			default:
				return true
			}
		}
	}
	binaryHash := ""
	if request.Action == "install" || request.Action == "repair" {
		binaryHash, err = hashFile(request.RemoteArcBinary)
		if err != nil {
			return result, fail("binary_unavailable", "Could not fingerprint the running Go binary.")
		}
	}
	provider := &codexProvider{rpc, profile}
	if request.Global && request.Action == "install" {
		before, e := provider.read(name, root)
		if e != nil {
			return result, e
		}
		if existing, found := mcpregistration.Existing(before.Servers); found {
			if existing != name || old == nil || old.Stage == "installed" {
				result.Status, result.Registration = "already_registered", existing
				return result, nil
			}
		}
		if !emptyJSON(before.Entry) && (old == nil || !sameJSON(before.Entry, old.Desired)) {
			return result, fail("config_conflict", "The remote_arc name is already used; existing settings were preserved.")
		}
		if emptyJSON(before.Entry) {
			if cwd, e := os.Getwd(); e == nil {
				active, e := provider.read(name, cwd)
				if e != nil {
					return result, e
				}
				if existing, found := mcpregistration.Existing(active.Servers); found {
					result.Status, result.Registration = "already_registered", existing
					return result, nil
				}
			}
			if found, e := provider.remoteArcApp(); e != nil {
				return result, e
			} else if found {
				result.Status = "connector_present"
				return result, nil
			}
		}
	}
	if request.Global && (request.Action == "install" || request.Action == "repair") {
		request.RemoteArcBinary, err = mcpregistration.PinBinary(ctx, request.RemoteArcBinary)
		if err != nil {
			return result, err
		}
		binaryHash, err = hashFile(request.RemoteArcBinary)
		if err != nil {
			return result, err
		}
	}
	t := transaction{profile: profile, root: root, name: name, binary: request.RemoteArcBinary, identity: identity, binaryHash: binaryHash, store: state, provider: provider, held: held, global: request.Global}
	err = t.run(request.Action, &result)
	return result, err
}

func (t transaction) run(action string, result *Result) error {
	r, err := t.store.load()
	if err != nil {
		return err
	}
	if r != nil && (r.Contract != recordContract || r.Profile != t.profile || r.Workspace != t.root || r.Name != t.name || !emptyJSON(r.Original) || emptyJSON(r.Desired) || (r.Stage != "prepared" && r.Stage != "installed" && r.Stage != "removing")) {
		return fail("state_invalid", "The saved ownership record does not match this profile/project; no configuration changes were made.")
	}
	before, err := t.provider.read(t.name, t.root)
	if err != nil {
		return err
	}
	if r == nil && action != "install" {
		result.Status = "not_installed"
		return nil
	}
	owned := r != nil && (sameJSON(before.Entry, r.Desired) || (r.Stage != "installed" && sameJSON(before.Entry, r.PendingFrom)))
	if !emptyJSON(before.Entry) && !owned {
		return fail("config_drift", "This registration is not owned or was edited outside Remote Arc; preserve it and inspect the conflict.")
	}
	if action == "uninstall" {
		if !emptyJSON(before.Entry) {
			r.Stage = "removing"
			r.PendingFrom = before.Entry
			if err = t.save(r); err != nil {
				return err
			}
			result.Changed = nil // Dispatch may succeed even if its acknowledgement is lost.
			if err = t.write(before, nil); err != nil {
				return err
			}
			result.Changed = change(true)
		}
		after, e := t.provider.read(t.name, t.root)
		if e != nil {
			return e
		}
		if !emptyJSON(after.Entry) {
			return fail("config_drift", "The registration changed during uninstall; retain the recovery record and inspect it.")
		}
		if err = t.store.remove(); err != nil {
			return err
		}
		result.Status = "uninstalled"
		return nil
	}
	if r != nil && (t.identity == "" || t.identity != r.Identity) {
		return fail("workspace_changed", "The project directory is missing or was replaced. Uninstall the old registration before selecting a new workspace.")
	}
	if action == "status" {
		if emptyJSON(before.Entry) {
			result.Status = "registration_missing"
		} else if r.Stage != "installed" {
			result.Status = "interrupted_" + r.Stage
		} else {
			result.Status = "registered"
		}
		return nil
	}
	if action == "doctor" {
		if emptyJSON(before.Entry) {
			return fail("registration_missing", "The owned registration is missing; run setup repair.")
		}
		if r.Stage != "installed" {
			return fail("setup_interrupted", "The saved operation is incomplete; rerun install or uninstall to reconcile it.")
		}
		var saved struct {
			Command string `json:"command"`
		}
		if json.Unmarshal(r.Desired, &saved) != nil {
			return fail("state_invalid", "The saved native binary binding is invalid.")
		}
		if currentHash, e := hashFile(saved.Command); e != nil || currentHash != r.BinarySHA256 {
			return fail("binary_changed", "The registered native binary changed or is missing; run install/repair using the current Go binary.")
		}
		if err = t.provider.verify(t.name, t.root, r.Desired); err != nil {
			return err
		}
		result.Status = "healthy"
		result.ToolsVerified = true
		return nil
	}
	desired, _ := json.Marshal(map[string]any{"command": t.binary, "args": []string{"--mcp", "--safe", "--mcp-workspace=" + t.root, "--mcp-workspace-id=" + t.identity}, "cwd": t.root, "enabled": true})
	if t.global {
		desired = mcpregistration.Desired(t.binary, false)
	}
	if r == nil {
		r = &record{Contract: recordContract, Profile: t.profile, Workspace: t.root, Identity: t.identity, Name: t.name, Original: json.RawMessage("null")}
	}
	if !sameJSON(before.Entry, desired) {
		r.Stage = "prepared"
		r.PendingFrom = before.Entry
		r.Desired = desired
		r.BinarySHA256 = t.binaryHash
		if err = t.save(r); err != nil {
			return err
		}
		result.Changed = nil
		if err = t.write(before, desired); err != nil {
			return err
		}
		result.Changed = change(true)
	}
	after, err := t.provider.read(t.name, t.root)
	if err != nil {
		return err
	}
	if !sameJSON(after.Entry, desired) {
		return fail("config_drift", "The registration changed during installation; retain the recovery record and run doctor.")
	}
	if err = t.provider.verify(t.name, t.root, desired); err != nil {
		return err
	}
	r.Desired = desired
	r.Stage = "installed"
	r.PendingFrom = json.RawMessage("null")
	r.BinarySHA256 = t.binaryHash
	if err = t.save(r); err != nil {
		return err
	}
	result.ToolsVerified = true
	result.Status = "installed"
	return nil
}

func change(value bool) *bool { return &value }

func (t transaction) save(r *record) error {
	if !t.held() {
		return fail("setup_lock_lost", "Local setup lost its ownership lock; retry to reconcile the saved operation.")
	}
	return t.store.save(r)
}
func (t transaction) write(before snapshot, value json.RawMessage) error {
	if !t.held() {
		return fail("setup_lock_lost", "Local setup lost its ownership lock; no further configuration write was dispatched.")
	}
	return t.provider.write(before, t.name, value)
}
func hashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err = io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
