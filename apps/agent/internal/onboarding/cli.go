package onboarding

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"path/filepath"

	"github.com/yaohuangguan/remote-arc/apps/agent/internal/codexsetup"
)

const Help = `Local coding-agent setup inspection
Usage: remotelink setup inspect [--agent codex|claude|all]
       remotelink setup auto
       remotelink setup <install|status|doctor|repair|uninstall> --global --agent codex|claude|all
       remotelink setup <install|status|doctor|repair|uninstall> --workspace <absolute-dir>
  --agent <name>  Select executable locations to inspect (default: all)
                 Project setup supports codex; --global supports both clients
  --workspace <absolute-dir>  Select the project for local Codex integration
  --codex-binary <absolute-file>  Optional native Codex executable
  --help, -h     Show this help

Inspection only:
Returns JSON with executable candidates from PATH and known install locations.
No executable is run. Client versions, compatibility and existing integrations
remain unchecked. A missing candidate does not prove the client is absent.
Private sessions, configuration and workspace files are not opened. This local
inspection needs no pairing or account and makes no configuration changes.

Ordinary device startup attempts user-wide Codex/Claude MCP setup in the
background. Missing clients, conflicts, timeouts and failures never gate pairing
or device execution. Existing Remote Arc MCP/Connectors are kept. setup auto
waits for that optional work only when explicitly requested for diagnostics.
Global doctor/repair/uninstall operate on Remote Arc's owned registrations.
Restart an already-open client after a new registration.

Project installation actions run Codex's local configuration API, preserve other settings,
and register project read-only tools using this native Go binary. No manual MCP
setup or extra Remote Arc approval is required. Doctor verifies the client tool
connection without starting a model turn. Existing Codex clients need restart.
`

func Run(ctx context.Context, args []string, version string, output io.Writer) error {
	if len(args) == 0 || args[0] != "setup" {
		return errors.New("expected setup command")
	}
	if len(args) == 1 || (len(args) == 2 && (args[1] == "--help" || args[1] == "-h")) {
		_, err := fmt.Fprint(output, Help)
		return err
	}
	action := args[1]
	switch action {
	case "auto", "inspect", "install", "status", "doctor", "repair", "uninstall":
	default:
		return errors.New("expected setup inspect, install, status, doctor, repair or uninstall; use setup --help")
	}
	f := flag.NewFlagSet("setup "+action, flag.ContinueOnError)
	f.SetOutput(io.Discard)
	defaultAgent := "all"
	if action != "inspect" && action != "auto" {
		defaultAgent = "codex"
	}
	agent := f.String("agent", defaultAgent, "coding-agent executable candidates")
	workspace := f.String("workspace", "", "selected project")
	binary := f.String("codex-binary", "", "native Codex binary")
	global := f.Bool("global", action == "auto", "user-wide client integration")
	help := f.Bool("help", false, "show help")
	f.BoolVar(help, "h", false, "show help")
	if err := f.Parse(args[2:]); err != nil {
		return err
	}
	if f.NArg() != 0 {
		return errors.New("unexpected setup arguments")
	}
	if *help {
		_, err := fmt.Fprint(output, Help)
		return err
	}
	encoder := json.NewEncoder(output)
	encoder.SetIndent("", "  ")
	if *global {
		if *workspace != "" || *binary != "" || action == "inspect" {
			return errors.New("global client setup does not accept a project or binary override")
		}
		if *agent != "all" && *agent != "codex" && *agent != "claude" {
			return errors.New("--agent must be codex, claude or all")
		}
		if action == "auto" {
			action = "install"
		}
		return encodeAutomatic(ctx, *agent, action, version, encoder)
	}
	if action == "inspect" {
		if *workspace != "" || *binary != "" {
			return errors.New("setup inspect only accepts --agent; installation requires its own action")
		}
		r, err := Inspect(ctx, *agent, version)
		if err != nil {
			return err
		}
		return encoder.Encode(r)
	}
	if *agent != "codex" {
		return errors.New("project installation supports --agent codex; use --global for Claude Code")
	}
	if !filepath.IsAbs(*workspace) {
		return errors.New("--workspace must select an absolute project directory")
	}
	if *binary == "" {
		r, err := Inspect(ctx, "codex", version)
		if err != nil {
			return err
		}
		*binary = nativeCandidate(r.Clients[0])
	}
	r, err := codexsetup.Run(ctx, codexsetup.Request{Action: action, Workspace: *workspace, CodexBinary: *binary, Version: version})
	if encodeErr := encoder.Encode(r); encodeErr != nil {
		return encodeErr
	}
	return err
}
