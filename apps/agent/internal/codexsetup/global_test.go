package codexsetup

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestGlobalFreshRepeatDoctorRepairAndUninstall(t *testing.T) {
	req, profile, _ := nativeFixture(t)
	req.Global = true
	req.Workspace = ""
	result, e := Run(context.Background(), req)
	if e != nil || result.Status != "installed" || !result.ToolsVerified || result.Workspace != "" {
		t.Fatal(result, e)
	}
	file := filepath.Join(profile, "synthetic-state.json")
	before, _ := os.ReadFile(file)
	result, e = Run(context.Background(), req)
	if e != nil || result.Status != "already_registered" || *result.Changed {
		t.Fatal(result, e)
	}
	after, _ := os.ReadFile(file)
	if string(before) != string(after) {
		t.Fatal("repeat rewrote user settings")
	}
	for _, action := range []string{"doctor", "repair", "uninstall", "uninstall"} {
		req.Action = action
		result, e = Run(context.Background(), req)
		if e != nil {
			t.Fatal(action, result, e)
		}
		if (action == "doctor" || action == "repair") && !result.ToolsVerified {
			t.Fatal(action, result)
		}
	}
}

func TestGlobalCustomDisabledAndNameConflictsPreserveConfig(t *testing.T) {
	for _, scenario := range []string{"custom", "disabled", "name-conflict", "managed"} {
		t.Run(scenario, func(t *testing.T) {
			req, profile, _ := nativeFixture(t)
			req.Global = true
			body := `{"servers":{"custom RA":{"url":"https://mcp.remotearc.app/mcp"}}}`
			switch scenario {
			case "disabled":
				body = `{"servers":{"custom RA":{"url":"https://mcp.remotearc.app/mcp","enabled":false}}}`
			case "name-conflict":
				body = `{"servers":{"remote_arc":{"command":"user-command"}}}`
			case "managed":
				body = `{"managed":true}`
			}
			file := filepath.Join(profile, "synthetic-state.json")
			if e := os.WriteFile(file, []byte(body), 0600); e != nil {
				t.Fatal(e)
			}
			r, e := Run(context.Background(), req)
			if scenario == "custom" || scenario == "disabled" {
				if e != nil || r.Status != "already_registered" || r.Registration != "custom RA" {
					t.Fatal(r, e)
				}
			} else if e == nil {
				t.Fatal("restricted/conflicting profile accepted")
			}
			after, _ := os.ReadFile(file)
			if string(after) != body {
				t.Fatal("existing config changed")
			}
		})
	}
}

func TestAccountConnectorEnumerationPaginationAndUnknowns(t *testing.T) {
	for _, scenario := range []string{"fresh", "api-key", "named", "renamed-url", "other", "unknown-custom", "missing-account", "unknown-account", "incomplete", "cycle", "failure"} {
		t.Run(scenario, func(t *testing.T) {
			t.Setenv("REMOTEARC_CODEX_TEST_MODE", "")
			identity := any(map[string]any{"type": "chatgpt"})
			if scenario == "fresh" {
				identity = nil
			}
			if scenario == "api-key" {
				identity = map[string]any{"type": "apiKey"}
			}
			replies := map[string][]map[string]any{"account/read": {ok(map[string]any{"account": identity})}}
			if scenario == "missing-account" {
				replies["account/read"] = []map[string]any{ok(map[string]any{})}
			}
			if scenario == "unknown-account" {
				replies["account/read"] = []map[string]any{ok(map[string]any{"account": map[string]any{}})}
			}
			app := map[string]any{"name": "Other app", "installUrl": "https://example.test/install", "isAccessible": true}
			if scenario == "named" {
				app["name"] = "Remote Arc"
			}
			if scenario == "renamed-url" {
				app["name"] = "my custom connector"
				app["installUrl"] = "https://mcp.remotearc.app/mcp"
				app["isEnabled"] = false
			}
			if scenario == "unknown-custom" {
				app["installUrl"] = "https://chatgpt.com/apps/custom"
			}
			replies["app/list"] = []map[string]any{ok(map[string]any{"data": []any{}, "nextCursor": "page2"}), ok(map[string]any{"data": []any{app}, "nextCursor": nil})}
			switch scenario {
			case "incomplete":
				replies["app/list"] = []map[string]any{ok(map[string]any{})}
			case "cycle":
				replies["app/list"] = []map[string]any{ok(map[string]any{"data": []any{}, "nextCursor": "same"}), ok(map[string]any{"data": []any{}, "nextCursor": "same"})}
			case "failure":
				replies["app/list"] = []map[string]any{{"error": map[string]any{"code": -1, "message": "PRIVATE"}}}
			}
			rpc, profile := fixtureRPC(t, replies)
			p := &codexProvider{rpc: rpc, profile: profile}
			found, e := p.remoteArcApp()
			want := scenario == "named" || scenario == "renamed-url"
			wantErr := scenario == "incomplete" || scenario == "cycle" || scenario == "failure" || scenario == "unknown-custom" || scenario == "missing-account" || scenario == "unknown-account"
			if found != want || (e != nil) != wantErr {
				b, _ := json.Marshal(replies)
				t.Fatal(scenario, found, e, string(b))
			}
		})
	}
}
