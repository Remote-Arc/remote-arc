package codexsetup

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func layer(profile string, config any) map[string]any {
	return map[string]any{"name": map[string]any{"type": "user", "file": filepath.Join(profile, "config.toml")}, "version": "revision-1", "config": config}
}
func readReplies(layers []any) map[string][]map[string]any {
	return map[string][]map[string]any{"configRequirements/read": {ok(map[string]any{"requirements": nil})}, "config/read": {ok(map[string]any{"layers": layers})}}
}

func TestProviderReadsOnlyExpectedUserRevisionAndOwnedEntry(t *testing.T) {
	profile := t.TempDir()
	entry := map[string]any{"command": "synthetic-native"}
	replies := readReplies([]any{layer(profile, map[string]any{"mcp_servers": map[string]any{"remote_arc_fixture": entry, "unrelated": map[string]any{"env": map[string]any{"secret": "PRIVATE_CONFIG_CANARY"}}}})})
	rpc := fixtureRPCProfile(t, profile, replies)
	p := codexProvider{rpc, profile}
	snapshot, err := p.read("remote_arc_fixture", profile)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Revision != "revision-1" || emptyJSON(snapshot.Entry) || len(snapshot.Servers) != 2 {
		t.Fatal("user revision or scoped entry missing")
	}
	if snapshot.File != filepath.Join(profile, "config.toml") {
		t.Fatal("provider's exact config path spelling was discarded")
	}
	if strings.Contains(string(snapshot.Entry), "PRIVATE_CONFIG_CANARY") {
		t.Fatal("unrelated credentials adopted into owned entry")
	}
}

func TestProviderDeclinesManagedOverridesMalformedAndWrongFile(t *testing.T) {
	for _, mode := range []string{"requirements", "managed_layer", "override", "wrong_file", "no_revision", "disabled", "malformed_config", "malformed_servers", "no_layer"} {
		t.Run(mode, func(t *testing.T) {
			profile := t.TempDir()
			base := layer(profile, map[string]any{})
			layers := []any{base}
			code := "config_revision_unavailable"
			replies := readReplies(layers)
			switch mode {
			case "requirements":
				replies["configRequirements/read"] = []map[string]any{ok(map[string]any{"requirements": map[string]any{"allowedSandboxModes": []string{"readOnly"}}})}
				code = "managed_config"
			case "managed_layer":
				layers = append(layers, map[string]any{"name": map[string]any{"type": "mdm"}, "config": map[string]any{"model": "managed-model"}})
				code = "managed_config"
			case "override":
				layers = append(layers, map[string]any{"name": map[string]any{"type": "project"}, "config": map[string]any{"mcp_servers": map[string]any{"remote_arc_fixture": map[string]any{"command": "override"}}}})
				code = "config_overridden"
			case "wrong_file":
				base["name"] = map[string]any{"type": "user", "file": filepath.Join(profile, "other.toml")}
			case "no_revision":
				base["version"] = ""
			case "disabled":
				base["disabledReason"] = "Untrusted profile"
			case "malformed_config":
				base["config"] = []string{"unexpected"}
				code = "config_shape_unsupported"
			case "malformed_servers":
				base["config"] = map[string]any{"mcp_servers": []string{"unexpected"}}
				code = "config_shape_unsupported"
			case "no_layer":
				layers = nil
			}
			replies["config/read"] = []map[string]any{ok(map[string]any{"layers": layers})}
			rpc := fixtureRPCProfile(t, profile, replies)
			p := codexProvider{rpc, profile}
			_, err := p.read("remote_arc_fixture", profile)
			expectCode(t, err, code)
		})
	}
}

func TestProviderRejectsSymlinkConfig(t *testing.T) {
	profile := t.TempDir()
	target := filepath.Join(profile, "other.toml")
	if err := os.WriteFile(target, []byte("PRIVATE_CONFIG_CANARY"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, filepath.Join(profile, "config.toml")); err != nil {
		t.Skip("symlink unavailable", err)
	}
	rpc := fixtureRPCProfile(t, profile, readReplies(nil))
	p := codexProvider{rpc, profile}
	_, err := p.read("remote_arc_fixture", profile)
	expectCode(t, err, "config_path_unsupported")
}

func TestProviderWritesSingleConditionalKeyAndNullRemoval(t *testing.T) {
	log := filepath.Join(t.TempDir(), "rpc.jsonl")
	t.Setenv("REMOTEARC_CODEX_TEST_LOG", log)
	rpc, profile := fixtureRPC(t, map[string][]map[string]any{"config/batchWrite": {ok(map[string]any{"status": "ok", "version": "revision-2"}), ok(map[string]any{"status": "ok", "version": "revision-3"}), ok(map[string]any{"status": "okOverridden", "version": "revision-4"})}})
	p := codexProvider{rpc, profile}
	before := snapshot{File: filepath.Join(profile, "config.toml"), Revision: "revision-1"}
	if err := p.write(before, "remote_arc_fixture", json.RawMessage(`{"command":"native"}`)); err != nil {
		t.Fatal(err)
	}
	if err := p.write(before, "remote_arc_fixture", nil); err != nil {
		t.Fatal(err)
	}
	expectCode(t, p.write(before, "remote_arc_fixture", nil), "config_write_overridden")
	b, err := os.ReadFile(log)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(string(b)), "\n")
	for i := 0; i < 2; i++ {
		var request struct {
			Params struct {
				File    string `json:"filePath"`
				Version string `json:"expectedVersion"`
				Reload  bool   `json:"reloadUserConfig"`
				Edits   []struct {
					Key   string          `json:"keyPath"`
					Merge string          `json:"mergeStrategy"`
					Value json.RawMessage `json:"value"`
				} `json:"edits"`
			} `json:"params"`
		}
		if err = json.Unmarshal([]byte(lines[i]), &request); err != nil {
			t.Fatal(err)
		}
		if request.Params.File != before.File || request.Params.Version != before.Revision || request.Params.Reload || len(request.Params.Edits) != 1 || request.Params.Edits[0].Key != "mcp_servers.remote_arc_fixture" || request.Params.Edits[0].Merge != "replace" {
			t.Fatal("write was not scoped and conditional")
		}
		if i == 1 && !emptyJSON(request.Params.Edits[0].Value) {
			t.Fatal("uninstall did not use supported null removal")
		}
	}
}

func verificationReplies(profile, workspace, name string, binding json.RawMessage) map[string][]map[string]any {
	replies := readReplies([]any{layer(profile, map[string]any{"mcp_servers": map[string]any{name: binding, "unrelated": map[string]any{"command": "must-not-start"}}})})
	replies["thread/start"] = []map[string]any{ok(map[string]any{"thread": map[string]any{"id": "synthetic-ephemeral-thread"}})}
	tools := map[string]any{}
	for _, tool := range []string{"remote_arc_status", "list_directory", "read_file", "read_binary_file", "get_file_info"} {
		tools[tool] = map[string]any{"name": tool}
	}
	replies["mcpServerStatus/list"] = []map[string]any{ok(map[string]any{"data": []any{map[string]any{"name": name, "tools": tools}}})}
	status, _ := json.Marshal(map[string]any{"mode": "safe", "scope": "workspace-read-only", "workspace": workspace, "root_available": true})
	replies["mcpServer/tool/call"] = []map[string]any{ok(map[string]any{"isError": false, "content": []any{map[string]any{"type": "text", "text": string(status)}}})}
	return replies
}

func TestProviderVerifiesCatalogAndActualStatusWithoutModelTurns(t *testing.T) {
	profile := t.TempDir()
	workspace := filepath.Join(profile, "project")
	name := "remote_arc_fixture"
	binding := json.RawMessage(`{"command":"native-go"}`)
	log := filepath.Join(profile, "calls.jsonl")
	t.Setenv("REMOTEARC_CODEX_TEST_LOG", log)
	rpc := fixtureRPCProfile(t, profile, verificationReplies(profile, workspace, name, binding))
	p := codexProvider{rpc, profile}
	if err := p.verify(name, workspace, binding); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(log)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), "turn/start") {
		t.Fatal("setup started model generation")
	}
	for _, line := range strings.Split(strings.TrimSpace(string(b)), "\n") {
		var request struct {
			Method string                     `json:"method"`
			Params map[string]json.RawMessage `json:"params"`
		}
		if err = json.Unmarshal([]byte(line), &request); err != nil {
			t.Fatal(err)
		}
		if request.Method == "thread/start" {
			if string(request.Params["ephemeral"]) != "true" || string(request.Params["sandbox"]) != `"read-only"` {
				t.Fatal("persistent or unsafe diagnostic thread")
			}
			var config struct {
				Servers map[string]struct {
					Enabled bool `json:"enabled"`
				} `json:"mcp_servers"`
			}
			if err = json.Unmarshal(request.Params["config"], &config); err != nil {
				t.Fatal(err)
			}
			if config.Servers["unrelated"].Enabled {
				t.Fatal("unrelated integrations enabled for healthcheck")
			}
		}
	}
}

func TestProviderVerificationRejectsWrongConnectionAndChangedScope(t *testing.T) {
	for _, mode := range []string{"drift", "missing_thread", "missing_server", "extra_tool", "missing_tool", "tool_error", "wrong_scope", "wrong_workspace", "missing_content"} {
		t.Run(mode, func(t *testing.T) {
			profile := t.TempDir()
			workspace := profile
			name := "remote_arc_fixture"
			binding := json.RawMessage(`{"command":"native-go"}`)
			replies := verificationReplies(profile, workspace, name, binding)
			code := "client_verification_failed"
			switch mode {
			case "drift":
				replies["config/read"] = []map[string]any{ok(map[string]any{"layers": []any{layer(profile, map[string]any{})}})}
				code = "config_drift"
			case "missing_thread":
				replies["thread/start"] = []map[string]any{ok(map[string]any{"thread": map[string]any{}})}
			case "missing_server":
				replies["mcpServerStatus/list"] = []map[string]any{ok(map[string]any{"data": []any{}})}
			case "extra_tool", "missing_tool":
				tools := map[string]any{"remote_arc_status": map[string]any{}, "list_directory": map[string]any{}, "read_file": map[string]any{}, "read_binary_file": map[string]any{}, "get_file_info": map[string]any{}}
				if mode == "extra_tool" {
					tools["write_file"] = map[string]any{}
				} else {
					delete(tools, "read_file")
					tools["replacement_tool"] = map[string]any{}
				}
				replies["mcpServerStatus/list"] = []map[string]any{ok(map[string]any{"data": []any{map[string]any{"name": name, "tools": tools}}})}
			case "tool_error":
				replies["mcpServer/tool/call"] = []map[string]any{ok(map[string]any{"isError": true, "content": []any{}})}
			case "missing_content":
				replies["mcpServer/tool/call"] = []map[string]any{ok(map[string]any{"content": []any{}})}
			case "wrong_scope", "wrong_workspace":
				status := map[string]any{"mode": "safe", "scope": "workspace-read-only", "workspace": workspace, "root_available": true}
				if mode == "wrong_scope" {
					status["mode"] = "full"
				} else {
					status["workspace"] = "other-project"
				}
				b, _ := json.Marshal(status)
				replies["mcpServer/tool/call"] = []map[string]any{ok(map[string]any{"content": []any{map[string]any{"text": string(b)}}})}
			}
			rpc := fixtureRPCProfile(t, profile, replies)
			p := codexProvider{rpc, profile}
			expectCode(t, p.verify(name, workspace, binding), code)
		})
	}
}
