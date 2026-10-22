package takeover

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
)

const Help = `Local session discovery
Usage: remotelink takeover --workspace <directory> [--source codex|claude|all]
       remotelink takeover workspace --workspace <directory>
  --workspace <dir>      Required: select one local project directory
  --source <agent>       codex, claude or all (default: all)
  --sessions-root <dir>  Optional session directory; requires one explicit source
  --limit <number>       Return 1-100 sessions, newest modified first (default: 20)
  --help, -h            Show this help

Returns local session IDs, paths, recorded working directories and timestamps.
Does not return conversation text, pair a device, modify files, install hooks,
upload data, call a model or resume an agent. Unsupported files are counted as
skipped. No results does not prove that a client has no sessions.

The workspace subcommand inspects actual Git/worktree state without reading
sessions. Run takeover workspace --help for its scope and completeness rules.
`

func Run(ctx context.Context, args []string, output io.Writer) error {
	if len(args) > 1 && args[0] == "takeover" && args[1] == "workspace" {
		return runWorkspace(ctx, args[2:], output)
	}
	f := flag.NewFlagSet("takeover", flag.ContinueOnError)
	f.SetOutput(io.Discard)
	workspace := f.String("workspace", "", "explicit local project directory")
	source := f.String("source", "all", "session source")
	root := f.String("sessions-root", "", "explicit session directory")
	limit := f.Int("limit", 20, "maximum results")
	help := f.Bool("help", false, "show help")
	f.BoolVar(help, "h", false, "show help")
	if len(args) == 0 || args[0] != "takeover" {
		return errors.New("expected takeover command")
	}
	if err := f.Parse(args[1:]); err != nil {
		return err
	}
	if f.NArg() != 0 {
		return errors.New("unexpected arguments; quote paths containing spaces")
	}
	if *help {
		_, err := fmt.Fprint(output, Help)
		return err
	}
	d, err := Discover(ctx, *workspace, *source, *root, *limit)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(output)
	encoder.SetIndent("", "  ")
	return encoder.Encode(d)
}
