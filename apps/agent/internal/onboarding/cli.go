package onboarding

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
)

const Help = `Local coding-agent setup inspection
Usage: remotelink setup inspect [--agent codex|claude|all]
  --agent <name>  Select executable locations to inspect (default: all)
  --help, -h     Show this help

Returns JSON with executable candidates from PATH and known install locations.
No executable is run. Client versions, compatibility and existing integrations
remain unchecked. A missing candidate does not prove the client is absent.
Private sessions, configuration and workspace files are not opened. This local
inspection needs no pairing or account and makes no configuration changes.
`

func Run(ctx context.Context, args []string, version string, output io.Writer) error {
	if len(args) == 0 || args[0] != "setup" {
		return errors.New("expected setup command")
	}
	if len(args) == 1 || (len(args) == 2 && (args[1] == "--help" || args[1] == "-h")) {
		_, err := fmt.Fprint(output, Help)
		return err
	}
	if args[1] != "inspect" {
		return errors.New("expected setup inspect; use setup --help")
	}
	f := flag.NewFlagSet("setup inspect", flag.ContinueOnError)
	f.SetOutput(io.Discard)
	agent := f.String("agent", "all", "coding-agent executable candidates")
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
	r, err := Inspect(ctx, *agent, version)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(output)
	encoder.SetIndent("", "  ")
	return encoder.Encode(r)
}
