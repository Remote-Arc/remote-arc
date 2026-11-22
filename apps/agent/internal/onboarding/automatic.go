package onboarding

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/claudesetup"
	"github.com/yaohuangguan/remote-arc/apps/agent/internal/codexsetup"
)

type AutomaticResult struct {
	Agent              string `json:"agent"`
	Status             string `json:"status"`
	Hint               string `json:"hint,omitempty"`
	ToolsVerified      bool   `json:"client_tools_verified"`
	ConnectionVerified bool   `json:"client_connection_verified"`
}

func nativeCandidate(client Client) string {
	for _, source := range []string{"path", "known_location", "npm_native", "npm_bundled", "desktop_bin"} {
		for _, candidate := range client.Candidates {
			if candidate.Source == source && (runtime.GOOS != "windows" || strings.EqualFold(filepath.Ext(candidate.Path), ".exe")) {
				return candidate.Path
			}
		}
	}
	return ""
}

func globalSetup(ctx context.Context, client Client, action, version string) AutomaticResult {
	return globalSetupWith(ctx, client, action, version, false)
}

func globalSetupWith(ctx context.Context, client Client, action, version string, skipConnectorCheck bool) AutomaticResult {
	r := AutomaticResult{Agent: client.Agent, Status: "not_found", Hint: "Client is not installed or its executable is unavailable; skipped."}
	binary := nativeCandidate(client)
	if binary == "" {
		return r
	}
	native, err := os.Executable()
	if err != nil {
		r.Status, r.Hint = "setup_skipped", "Native executable unavailable."
		return r
	}
	if client.Agent == "codex" {
		result, err := codexsetup.Run(ctx, codexsetup.Request{Action: action, Global: true, CodexBinary: binary, RemoteArcBinary: native, Version: version, SkipConnectorCheck: skipConnectorCheck})
		r.Status, r.ToolsVerified, r.Hint = result.Status, result.ToolsVerified, result.Hint
		r.ConnectionVerified = result.ToolsVerified
		if err != nil && r.Hint == "" {
			r.Hint = "Could not inspect or configure this client; Remote Arc continues normally."
		}
	} else {
		cwd, _ := os.Getwd()
		result, _ := claudesetup.Run(ctx, claudesetup.Request{Action: action, Binary: binary, RemoteArcBinary: native, CWD: cwd})
		r.Status, r.ToolsVerified, r.Hint = result.Status, result.ToolsVerified, result.Hint
		r.ConnectionVerified = result.ConnectionVerified
	}
	return r
}

// Automatic waits only for the explicit diagnostic command. Normal device
// startup always launches this work through StartAutomatic, never inline.
func Automatic(ctx context.Context, agent, action, version string) []AutomaticResult {
	return automatic(ctx, agent, action, version, Inspect, globalSetup)
}

// AutomaticSkippingConnectorCheck is the explicit manual path for users whose
// Codex cannot list ChatGPT connectors.
func AutomaticSkippingConnectorCheck(ctx context.Context, agent, action, version string) []AutomaticResult {
	return automatic(ctx, agent, action, version, Inspect, func(ctx context.Context, c Client, action, version string) AutomaticResult {
		return globalSetupWith(ctx, c, action, version, true)
	})
}

func automatic(ctx context.Context, agent, action, version string, inspect func(context.Context, string, string) (Inspection, error), setup func(context.Context, Client, string, string) AutomaticResult) []AutomaticResult {
	inspection, err := inspect(ctx, agent, version)
	if err != nil {
		return []AutomaticResult{{Agent: agent, Status: "setup_skipped", Hint: "Client inspection unavailable; Remote Arc continues normally."}}
	}
	results := make(chan AutomaticResult, len(inspection.Clients))
	pending := map[string]bool{}
	for _, client := range inspection.Clients {
		client := client
		pending[client.Agent] = true
		go func() {
			r := AutomaticResult{Agent: client.Agent, Status: "setup_skipped", Hint: "Client setup was unavailable; Remote Arc continues normally."}
			defer func() { _ = recover(); results <- r }()
			r = setup(ctx, client, action, version)
		}()
	}
	out := []AutomaticResult{}
	for len(out) < len(inspection.Clients) {
		select {
		case r := <-results:
			out = append(out, r)
			delete(pending, r.Agent)
		case <-ctx.Done():
			for _, client := range inspection.Clients {
				if pending[client.Agent] {
					out = append(out, AutomaticResult{Agent: client.Agent, Status: "setup_skipped", Hint: "Automatic setup timed out or stopped; Remote Arc continues normally."})
				}
			}
			return out
		}
	}
	return out
}

// StartAutomatic is an optional side task: no client, lock, network, failure,
// timeout or panic may prevent device pairing/execution from starting.
func StartAutomatic(parent context.Context, version string, notify func(string, string)) context.CancelFunc {
	return startAutomatic(parent, version, notify, Automatic)
}

func startAutomatic(parent context.Context, version string, notify func(string, string), run func(context.Context, string, string, string) []AutomaticResult) context.CancelFunc {
	return startAutomaticOn(parent, version, notify, run, IsWSL())
}

func startAutomaticOn(parent context.Context, version string, notify func(string, string), run func(context.Context, string, string, string) []AutomaticResult, wsl bool) context.CancelFunc {
	ctx, cancel := context.WithTimeout(parent, 30*time.Second)
	go func() {
		defer cancel()
		defer func() {
			if recover() != nil && parent.Err() == nil {
				notify("info", "Automatic client setup skipped; Remote Arc continues normally.")
			}
		}()
		for _, result := range run(ctx, "all", "install", version) {
			if parent.Err() != nil || ctx.Err() == context.Canceled {
				return
			}
			label := "Local coding clients"
			if result.Agent == "codex" {
				label = "Codex"
			} else if result.Agent == "claude" {
				label = "Claude Code"
			}
			switch result.Status {
			case "installed":
				notify("info", label+": Remote Arc MCP registered. Restart an already-open client to use it.")
			case "already_registered", "connector_present":
				notify("info", label+": existing Remote Arc MCP/Connector kept; no duplicate added.")
			case "not_found":
				if wsl {
					// WSL and Windows keep separate client installs and configs.
					notify("info", label+": not installed inside this WSL distro; automatic MCP setup skipped. If you use it on Windows, run npx remotelink@latest in Windows PowerShell to connect it there.")
				} else {
					notify("info", label+": no supported executable found; automatic MCP setup skipped.")
				}
			default:
				notify("info", fmt.Sprintf("%s: automatic MCP setup skipped (%s). Remote Arc continues normally.", label, result.Hint))
			}
		}
	}()
	return cancel
}

func encodeAutomatic(ctx context.Context, agent, action, version string, skipConnectorCheck bool, encoder *json.Encoder) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	run := Automatic
	if skipConnectorCheck {
		run = AutomaticSkippingConnectorCheck
	}
	return encoder.Encode(map[string]any{"contract": "remotearc.automatic-client-mcp/v1", "clients": run(ctx, agent, action, version)})
}

// IsWSL reports whether this Linux process runs inside Windows Subsystem for
// Linux, where Windows-side clients are not visible on PATH.
func IsWSL() bool {
	if runtime.GOOS != "linux" {
		return false
	}
	if os.Getenv("WSL_DISTRO_NAME") != "" || os.Getenv("WSL_INTEROP") != "" {
		return true
	}
	b, err := os.ReadFile("/proc/sys/kernel/osrelease")
	return err == nil && strings.Contains(strings.ToLower(string(b)), "microsoft")
}
