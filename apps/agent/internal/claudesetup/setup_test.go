package claudesetup

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/mcpregistration"
)

// Use the test executable as an installed client on every CI operating system.
func TestMain(m *testing.M) {
	if os.Getenv("REMOTEARC_CLAUDE_TEST_HELPER") == "1" {
		fakeClaude()
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func fakeClaude() {
	args := os.Args[1:]
	if len(args) == 0 {
		os.Exit(2)
	}
	log := os.Getenv("REMOTEARC_CLAUDE_TEST_LOG")
	if log != "" {
		f, e := os.OpenFile(log, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
		if e != nil {
			os.Exit(2)
		}
		fmt.Fprintln(f, strings.Join(args, " "))
		f.Close()
	}
	mode := os.Getenv("REMOTEARC_CLAUDE_TEST_MODE")
	if args[0] == "--version" {
		if mode == "old" {
			fmt.Println("1.0.0 (Claude Code)")
		} else {
			fmt.Println("2.1.118 (Claude Code)")
		}
		return
	}
	if len(args) < 2 || args[0] != "mcp" {
		os.Exit(2)
	}
	file, _ := profileConfig()
	data, e := readConfig(file)
	if e != nil {
		os.Exit(2)
	}
	items, e := servers(data["mcpServers"])
	if e != nil {
		os.Exit(2)
	}
	switch args[1] {
	case "list":
		if mode == "list-timeout" {
			time.Sleep(time.Minute)
		}
		fmt.Print(os.Getenv("REMOTEARC_CLAUDE_TEST_LIST"))
		return
	case "get":
		if len(items[mcpregistration.Name]) == 0 || mode == "disconnected" {
			fmt.Println("Status: ✗ Failed to connect")
			return
		}
		fmt.Println("Status: ✓ Connected")
		return
	case "add":
		// The supported provider command rejects an existing name instead of
		// replacing it. This is essential for concurrent user configuration.
		if mode == "race-add" {
			items[mcpregistration.Name] = json.RawMessage(`{"command":"user-won-the-race"}`)
			data["mcpServers"], _ = json.Marshal(items)
			b, _ := json.Marshal(data)
			_ = os.WriteFile(file, b, 0600)
			os.Exit(1)
		}
		if len(items[mcpregistration.Name]) != 0 {
			os.Exit(1)
		}
		for i, arg := range args {
			if arg == "--" && i+1 < len(args) {
				items[mcpregistration.Name] = mcpregistration.Desired(args[i+1], true)
			}
		}
	case "remove":
		delete(items, mcpregistration.Name)
	default:
		os.Exit(2)
	}
	data["mcpServers"], _ = json.Marshal(items)
	b, _ := json.Marshal(data)
	if os.WriteFile(file, b, 0600) != nil {
		os.Exit(2)
	}
	if mode == "ack-lost" {
		os.Exit(1)
	}
}

func fixture(t *testing.T) (Request, string, string) {
	t.Helper()
	base := t.TempDir()
	profile := filepath.Join(base, "claude")
	project := filepath.Join(base, "project")
	for _, p := range []string{profile, project} {
		if e := os.Mkdir(p, 0700); e != nil {
			t.Fatal(e)
		}
	}
	t.Setenv("CLAUDE_CONFIG_DIR", profile)
	t.Setenv("REMOTEARC_HOME", filepath.Join(base, "arc"))
	t.Setenv("REMOTEARC_CLAUDE_TEST_HELPER", "1")
	t.Setenv("REMOTEARC_CLAUDE_TEST_MODE", "")
	// Self-executing race-instrumented fixtures need no production atexit
	// sleep; a delay at --version would test the wrong timeout stage.
	t.Setenv("GORACE", "atexit_sleep_ms=0")
	t.Setenv("REMOTEARC_CLAUDE_TEST_LIST", "")
	log := filepath.Join(base, "calls.log")
	t.Setenv("REMOTEARC_CLAUDE_TEST_LOG", log)
	binary, e := os.Executable()
	if e != nil {
		t.Fatal(e)
	}
	return Request{Action: "install", Binary: binary, RemoteArcBinary: binary, CWD: project}, filepath.Join(profile, ".claude.json"), log
}

func writeFixture(t *testing.T, file, body string) {
	t.Helper()
	if e := os.WriteFile(file, []byte(body), 0600); e != nil {
		t.Fatal(e)
	}
}
func requireResult(t *testing.T, req Request, status string) Result {
	t.Helper()
	r, e := Run(context.Background(), req)
	if e != nil || r.Status != status {
		t.Fatal(req.Action, r, e)
	}
	return r
}

func TestUserLifecycleRepeatRepairAndCleanUninstall(t *testing.T) {
	req, file, log := fixture(t)
	writeFixture(t, file, `{"theme":"dark","mcpServers":{"other":{"url":"https://example.test/mcp"}}}`)
	if r := requireResult(t, req, "installed"); !r.ConnectionVerified || r.ToolsVerified {
		t.Fatal(r)
	}
	before, _ := os.ReadFile(file)
	calls, _ := os.ReadFile(log)
	requireResult(t, req, "already_registered")
	after, _ := os.ReadFile(file)
	again, _ := os.ReadFile(log)
	if string(before) != string(after) || string(calls) != string(again) {
		t.Fatal("repeat invoked provider or rewrote settings")
	}
	req.Action = "doctor"
	if r := requireResult(t, req, "healthy"); !r.ConnectionVerified || r.ToolsVerified {
		t.Fatal(r)
	}
	data, _ := readConfig(file)
	items, _ := servers(data["mcpServers"])
	delete(items, mcpregistration.Name)
	data["mcpServers"], _ = json.Marshal(items)
	b, _ := json.Marshal(data)
	writeFixture(t, file, string(b))
	req.Action = "repair"
	requireResult(t, req, "installed")
	req.Action = "uninstall"
	requireResult(t, req, "uninstalled")
	requireResult(t, req, "not_owned")
	data, _ = readConfig(file)
	items, _ = servers(data["mcpServers"])
	if len(items) != 1 || len(items["other"]) == 0 || string(data["theme"]) != `"dark"` {
		t.Fatal("unrelated config changed", data)
	}
}

func TestExistingCustomNamesDisabledProjectAndCloudPreserved(t *testing.T) {
	for _, scope := range []string{"user", "disabled", "local", "project", "cloud", "renamed-cloud", "other-cloud"} {
		t.Run(scope, func(t *testing.T) {
			req, file, log := fixture(t)
			remote := `{"url":"https://mcp.remotearc.app/mcp","disabled":true}`
			want := "already_registered"
			switch scope {
			case "user", "disabled":
				writeFixture(t, file, `{"mcpServers":{"my RA":`+remote+`}}`)
			case "local":
				b, _ := json.Marshal(map[string]any{"projects": map[string]any{req.CWD: map[string]any{"mcpServers": map[string]json.RawMessage{"custom": json.RawMessage(remote)}}}})
				writeFixture(t, file, string(b))
			case "project":
				writeFixture(t, filepath.Join(req.CWD, ".mcp.json"), `{"mcpServers":{"custom":`+remote+`}}`)
			case "cloud":
				t.Setenv("REMOTEARC_CLAUDE_TEST_LIST", "claude.ai Remote Arc: https://mcp.remotearc.app/mcp - ✓ Connected")
				want = "connector_present"
			case "renamed-cloud":
				t.Setenv("REMOTEARC_CLAUDE_TEST_LIST", "claude.ai my device: https://mcp.remotearc.app/mcp - ✓ Connected")
				want = "connector_present"
			case "other-cloud":
				t.Setenv("REMOTEARC_CLAUDE_TEST_LIST", "claude.ai GitHub: https://api.githubcopilot.com/mcp - ✓ Connected")
				want = "installed"
			}
			before, _ := os.ReadFile(file)
			requireResult(t, req, want)
			after, _ := os.ReadFile(file)
			if want != "installed" && string(before) != string(after) {
				t.Fatal("existing config modified")
			}
			commands, _ := os.ReadFile(log)
			if want != "installed" && strings.Contains(string(commands), "mcp add") {
				t.Fatal("duplicate added")
			}
		})
	}
}

func TestInterruptedRegistrationReconcilesWithoutSecondAdd(t *testing.T) {
	req, file, log := fixture(t)
	t.Setenv("REMOTEARC_CLAUDE_TEST_MODE", "ack-lost")
	if _, e := Run(context.Background(), req); e == nil {
		t.Fatal("lost acknowledgement reported success")
	}
	before, _ := os.ReadFile(file)
	t.Setenv("REMOTEARC_CLAUDE_TEST_MODE", "")
	requireResult(t, req, "installed")
	after, _ := os.ReadFile(file)
	commands, _ := os.ReadFile(log)
	if string(before) != string(after) || strings.Count(string(commands), "mcp add") != 1 {
		t.Fatal("interrupted retry wrote duplicate")
	}
}

func TestConcurrentProviderAddAndLaterCustomEntryArePreserved(t *testing.T) {
	req, file, _ := fixture(t)
	t.Setenv("REMOTEARC_CLAUDE_TEST_MODE", "race-add")
	if _, e := Run(context.Background(), req); e == nil {
		t.Fatal("concurrent add reported success")
	}
	before, _ := os.ReadFile(file)
	t.Setenv("REMOTEARC_CLAUDE_TEST_MODE", "")
	if _, e := Run(context.Background(), req); e == nil {
		t.Fatal("prepared record adopted user entry")
	}
	after, _ := os.ReadFile(file)
	if string(before) != string(after) {
		t.Fatal("user race winner overwritten")
	}
	writeFixture(t, file, `{"mcpServers":{"renamed by user":{"url":"https://mcp.remotearc.app/mcp"}}}`)
	before, _ = os.ReadFile(file)
	requireResult(t, req, "already_registered")
	after, _ = os.ReadFile(file)
	if string(before) != string(after) {
		t.Fatal("prepared journal recreated a duplicate")
	}
}

func TestDoctorNeverInstallsAndRepairRequiresOwnership(t *testing.T) {
	req, file, log := fixture(t)
	req.Action = "repair"
	requireResult(t, req, "not_owned")
	req.Action = "doctor"
	if _, e := Run(context.Background(), req); e == nil || e.Error() != "claude_registration_not_owned" {
		t.Fatal(e)
	}
	req.Action = "install"
	requireResult(t, req, "installed")
	writeFixture(t, file, `{"mcpServers":{}}`)
	calls, _ := os.ReadFile(log)
	req.Action = "doctor"
	if _, e := Run(context.Background(), req); e == nil || e.Error() != "claude_registration_missing" {
		t.Fatal(e)
	}
	after, _ := os.ReadFile(log)
	if string(calls) != string(after) {
		t.Fatal("doctor dispatched a provider mutation")
	}
	current, _ := readConfig(file)
	items, _ := servers(current["mcpServers"])
	if len(items) != 0 {
		t.Fatal("doctor recreated missing registration")
	}
}

func TestDriftConflictInvalidMissingUnsupportedAndTimeout(t *testing.T) {
	for _, scenario := range []string{"drift", "name-conflict", "invalid", "missing", "old", "cloud-unknown", "timeout", "blocked", "disconnected"} {
		t.Run(scenario, func(t *testing.T) {
			req, file, _ := fixture(t)
			switch scenario {
			case "drift":
				requireResult(t, req, "installed")
				writeFixture(t, file, `{"mcpServers":{"remote_arc":{"command":"user-command"}}}`)
				req.Action = "uninstall"
			case "name-conflict":
				writeFixture(t, file, `{"mcpServers":{"remote_arc":{"url":"https://other.test/mcp"}}}`)
			case "invalid":
				writeFixture(t, file, `{`)
			case "missing":
				req.Binary = filepath.Join(t.TempDir(), "missing")
			case "old", "disconnected":
				t.Setenv("REMOTEARC_CLAUDE_TEST_MODE", scenario)
			case "cloud-unknown":
				t.Setenv("REMOTEARC_CLAUDE_TEST_LIST", "claude.ai my custom device: ✓ Connected")
			case "timeout":
				t.Setenv("REMOTEARC_CLAUDE_TEST_MODE", "list-timeout")
			case "blocked":
				writeFixture(t, filepath.Join(filepath.Dir(file), "settings.json"), `{"allowedMcpServers":[]}`)
			}
			before, _ := os.ReadFile(file)
			limit := 5 * time.Second
			if scenario == "timeout" {
				limit = 500 * time.Millisecond
			}
			ctx, cancel := context.WithTimeout(context.Background(), limit)
			defer cancel()
			r, e := Run(ctx, req)
			if e == nil || r.Status != "setup_skipped" || r.ToolsVerified {
				t.Fatal(r, e)
			}
			want := map[string]string{"drift": "claude_registration_conflict", "name-conflict": "claude_registration_conflict", "invalid": "claude_config_invalid", "missing": "claude_version_unavailable", "old": "claude_version_unavailable", "cloud-unknown": "claude_connector_identity_unavailable", "timeout": "claude_connector_inspection_failed", "blocked": "claude_managed_config", "disconnected": "claude_connection_not_verified"}[scenario]
			if e.Error() != want {
				t.Fatal("unexpected failure", scenario, e, want)
			}
			after, _ := os.ReadFile(file)
			if scenario != "disconnected" && string(before) != string(after) {
				t.Fatal("failed setup mutated user config")
			}
		})
	}
}

func TestPolicyChecksLeaveManagedProfilesAlone(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"managed-mcp.json", "managed-settings.json", "settings.json"} {
		file := filepath.Join(dir, name)
		writeFixture(t, file, `{"deniedMcpServers":[]}`)
		if checkPolicy([]string{file}) == nil {
			t.Fatal("managed policy accepted", name)
		}
	}
	if e := checkPolicy([]string{filepath.Join(dir, "missing")}); e != nil {
		t.Fatal(e)
	}
}
