package codexsetup

import (
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strings"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/mcpregistration"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/execution"
	"github.com/yaohuangguan/remote-arc/packages/execution-core/policy"
)

type snapshot struct {
	File     string
	Revision string
	Entry    json.RawMessage
	Servers  map[string]json.RawMessage
}

type provider interface {
	read(name, workspace string) (snapshot, error)
	write(snapshot, string, json.RawMessage) error
	verify(string, string, json.RawMessage) error
}

type codexProvider struct {
	rpc     *rpcClient
	profile string
}

func (p *codexProvider) read(name, workspace string) (snapshot, error) {
	var requirements struct {
		Requirements json.RawMessage `json:"requirements"`
	}
	if err := p.rpc.call("configRequirements/read", map[string]any{}, &requirements); err != nil {
		return snapshot{}, err
	}
	if !emptyJSON(requirements.Requirements) {
		return snapshot{}, fail("managed_config", "This first integration slice supports unmanaged Codex profiles. Keep administrator policy unchanged and use an allowed profile.")
	}
	if info, err := os.Lstat(filepath.Join(p.profile, "config.toml")); err == nil && (!info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0) {
		return snapshot{}, fail("config_path_unsupported", "Codex configuration must be a regular file, not a symlink.")
	}
	var response struct {
		Layers []struct {
			Name struct {
				Type    string  `json:"type"`
				File    string  `json:"file"`
				Profile *string `json:"profile"`
			} `json:"name"`
			Version  string          `json:"version"`
			Disabled *string         `json:"disabledReason"`
			Config   json.RawMessage `json:"config"`
		} `json:"layers"`
	}
	cwd := workspace
	if info, err := os.Stat(cwd); err != nil || !info.IsDir() {
		cwd = p.profile
	}
	if err := p.rpc.call("config/read", map[string]any{"includeLayers": true, "cwd": cwd}, &response); err != nil {
		return snapshot{}, err
	}
	result := snapshot{Servers: map[string]json.RawMessage{}}
	for _, layer := range response.Layers {
		if layer.Disabled != nil {
			continue
		}
		var config map[string]json.RawMessage
		if json.Unmarshal(layer.Config, &config) != nil {
			return result, fail("config_shape_unsupported", "Codex returned an unsupported configuration layer.")
		}
		var servers map[string]json.RawMessage
		if raw := config["mcp_servers"]; len(raw) > 0 && json.Unmarshal(raw, &servers) != nil {
			return result, fail("config_shape_unsupported", "Codex returned unsupported local integration settings.")
		}
		for server, value := range servers {
			result.Servers[server] = value
		}
		base := layer.Name.Type == "user" && layer.Name.Profile == nil
		if base {
			expected, err := policy.Canonical(filepath.Join(p.profile, "config.toml"))
			if err != nil {
				return result, fail("config_path_unsupported", "Could not resolve the selected Codex configuration.")
			}
			actual, err := policy.Canonical(layer.Name.File)
			if err != nil || actual != expected || layer.Version == "" {
				return result, fail("config_revision_unavailable", "Codex did not expose the selected user configuration revision.")
			}
			// Validate canonical identity, but preserve the provider's spelling.
			// On Windows a not-yet-created config path has a case-sensitive
			// API target check even though the filesystem is case-insensitive.
			result.File = layer.Name.File
			result.Revision = layer.Version
			result.Entry = servers[name]
		} else if !emptyJSON(servers[name]) {
			return result, fail("config_overridden", "Another Codex configuration layer controls this registration; leave it unchanged and inspect the active profile.")
		}
		if len(config) > 0 && (layer.Name.Type == "mdm" || layer.Name.Type == "enterpriseManaged" || layer.Name.Type == "system" || strings.HasPrefix(layer.Name.Type, "legacyManaged")) {
			return result, fail("managed_config", "This Codex profile has managed settings; this integration slice leaves them unchanged.")
		}
	}
	if result.File == "" || result.Revision == "" {
		return result, fail("config_revision_unavailable", "Codex did not expose a writable user layer with a revision. Update the client.")
	}
	return result, nil
}

func (p *codexProvider) write(before snapshot, name string, value json.RawMessage) error {
	var result struct {
		Status  string `json:"status"`
		Version string `json:"version"`
	}
	if len(value) == 0 {
		value = json.RawMessage("null")
	}
	err := p.rpc.call("config/batchWrite", map[string]any{"filePath": before.File, "expectedVersion": before.Revision, "reloadUserConfig": false, "edits": []any{map[string]any{"keyPath": "mcp_servers." + name, "mergeStrategy": "replace", "value": value}}}, &result)
	if err != nil {
		return err
	}
	if result.Status != "ok" || result.Version == "" {
		return fail("config_write_overridden", "Codex reports that policy overrides the registration; run doctor and retain the recovery record.")
	}
	return nil
}

func (p *codexProvider) verify(name, workspace string, binding json.RawMessage) error {
	state, err := p.read(name, workspace)
	if err != nil {
		return err
	}
	if !sameJSON(state.Entry, binding) {
		return fail("config_drift", "The registration changed before verification; rerun doctor.")
	}
	// Disable unrelated MCP registrations for the temporary diagnostic thread.
	// This override is session-local; no other client settings are written.
	servers := map[string]any{}
	for other := range state.Servers {
		servers[other] = map[string]any{"enabled": false}
	}
	servers[name] = binding
	var thread struct {
		Thread struct {
			ID string `json:"id"`
		} `json:"thread"`
	}
	if err = p.rpc.call("thread/start", map[string]any{"cwd": workspace, "ephemeral": true, "sandbox": "read-only", "config": map[string]any{"mcp_servers": servers}}, &thread); err != nil {
		return err
	}
	if thread.Thread.ID == "" {
		return fail("client_verification_failed", "Codex did not create the nonpersistent diagnostic thread.")
	}
	var catalog struct {
		Data []struct {
			Name  string                     `json:"name"`
			Tools map[string]json.RawMessage `json:"tools"`
		} `json:"data"`
	}
	if err = p.rpc.call("mcpServerStatus/list", map[string]any{"serverName": name, "threadId": thread.Thread.ID, "detail": "toolsAndAuthOnly", "limit": 10}, &catalog); err != nil {
		return err
	}
	expected := []string{"remote_arc_status", "list_directory", "read_file", "read_binary_file", "get_file_info"}
	global := name == mcpregistration.Name
	if global {
		core := execution.New("safe")
		expected = []string{"remote_arc_status"}
		for _, tool := range core.ListTools() {
			expected = append(expected, tool.Name)
		}
		core.Close()
	}
	found := false
	for _, server := range catalog.Data {
		if server.Name == name {
			if len(server.Tools) != len(expected) {
				return fail("client_verification_failed", "Codex did not discover the expected project read-only tool catalog.")
			}
			for _, tool := range expected {
				if len(server.Tools[tool]) == 0 {
					return fail("client_verification_failed", "Codex did not discover the expected project read-only tools.")
				}
			}
			found = true
		}
	}
	if !found {
		return fail("client_verification_failed", "Codex could not connect the local integration; check the Go binary path and rerun repair.")
	}
	var response struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		IsError bool `json:"isError"`
	}
	if err = p.rpc.call("mcpServer/tool/call", map[string]any{"threadId": thread.Thread.ID, "server": name, "tool": "remote_arc_status", "arguments": map[string]any{}}, &response); err != nil {
		return err
	}
	if response.IsError || len(response.Content) != 1 {
		return fail("client_verification_failed", "Codex could not call the read-only integration status tool.")
	}
	var status struct {
		Mode      string `json:"mode"`
		Scope     string `json:"scope"`
		Workspace string `json:"workspace"`
		Available bool   `json:"root_available"`
		Engine    string `json:"engine"`
	}
	if json.Unmarshal([]byte(response.Content[0].Text), &status) != nil || status.Mode != "safe" {
		return fail("client_verification_failed", "The local integration did not report safe mode.")
	}
	if global {
		if status.Scope != "" || status.Engine != "go" {
			return fail("client_verification_failed", "The local integration did not report the native safe transport.")
		}
	} else if status.Scope != "workspace-read-only" || status.Workspace != workspace || !status.Available {
		return fail("client_verification_failed", "The connected tools do not match the requested read-only project scope.")
	}
	return nil
}

func (p *codexProvider) remoteArcApp() (bool, error) {
	var identity struct {
		Account *struct {
			Type string `json:"type"`
		} `json:"account"`
	}
	if err := p.rpc.call("account/read", map[string]any{"refreshToken": false}, &identity); err != nil {
		return false, fail("connector_inspection_failed", "Could not determine Codex connector availability; automatic setup was skipped.")
	}
	// Fresh/API-key profiles do not inherit ChatGPT account connectors. Avoid
	// querying an unauthenticated cloud directory just to install local tools.
	if identity.Account == nil || identity.Account.Type == "apiKey" {
		return false, nil
	}
	cursor := ""
	uncertain := false
	for page := 0; page < 20; page++ {
		var response struct {
			Data []struct {
				Name, InstallURL string
				IsAccessible     bool
			} `json:"data"`
			NextCursor *string `json:"nextCursor"`
		}
		if err := p.rpc.call("app/list", map[string]any{"cursor": cursor, "limit": 100, "forceRefetch": false}, &response); err != nil {
			return false, fail("connector_inspection_failed", "Could not check existing Codex connectors; registration was skipped to avoid duplicates.")
		}
		if response.Data == nil {
			return false, fail("connector_inspection_failed", "Codex returned an incomplete connector list; registration was skipped.")
		}
		for _, app := range response.Data {
			name := strings.NewReplacer(" ", "", "-", "", "_", "").Replace(strings.ToLower(app.Name))
			if app.IsAccessible && (name == "remotearc" || mcpregistration.Endpoint(app.InstallURL)) {
				return true, nil
			}
			if app.IsAccessible {
				u, err := url.Parse(app.InstallURL)
				// A catalogue link (or missing link) does not identify the
				// endpoint of a renamed custom connector.
				if err != nil || u.Hostname() == "" || strings.EqualFold(u.Hostname(), "chatgpt.com") {
					uncertain = true
				}
			}
		}
		if response.NextCursor == nil || *response.NextCursor == "" {
			if uncertain {
				return false, fail("connector_identity_unavailable", "An existing Codex connector cannot be identified safely; registration was skipped to avoid duplicates.")
			}
			return false, nil
		}
		if cursor == *response.NextCursor {
			break
		}
		cursor = *response.NextCursor
	}
	return false, fail("connector_inspection_failed", "Codex connector enumeration exceeded its limit; registration was skipped.")
}

func emptyJSON(raw json.RawMessage) bool { return len(raw) == 0 || string(raw) == "null" }
func sameJSON(a, b json.RawMessage) bool {
	if emptyJSON(a) || emptyJSON(b) {
		return emptyJSON(a) && emptyJSON(b)
	}
	var x, y any
	return json.Unmarshal(a, &x) == nil && json.Unmarshal(b, &y) == nil && reflect.DeepEqual(x, y)
}
