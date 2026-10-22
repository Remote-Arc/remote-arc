# Automatic coding-client MCP setup

The Go device agent attempts optional **background** client setup on ordinary
startup. This is included in 0.6.2-rc.4; rc.3 and stable 0.6.1 predate it.
The Windows npm-client discovery fix described below requires a later build.
Delivery and platform qualification remain tracked in
[#254](https://github.com/Remote-Arc/remote-arc/issues/254).

## User flow

Run `remotelink` normally. The native Agent continues pairing/connecting as usual
and independently attempts to register Remote Arc in supported installed Codex
and Claude Code clients. The npm launcher runs that same Go entry point. A curl
installer installs a binary; starting the installed binary invokes this behavior.
The installer itself is not a new integration or startup gate.

No separate setup command or Remote Arc confirmation screen is needed. A missing
client produces an informational skip. A failed, locked, incompatible or slow
client cannot prevent pairing, device connections, tool calls or shutdown. The
optional task has a 30-second deadline, and each client runs independently.

After a new registration, restart an already-open coding client and ask it to
use Remote Arc. This registers the **local safe MCP**, with file/status tools;
it does not silently add cloud OAuth, process/write permissions, browser tools,
workspace trust or lifecycle Hooks. The paired device's dashboard policy remains
independent. Already configured cloud MCP/Connectors keep their existing features.

Existing Remote Arc registrations are detected by endpoint/launch command,
including custom names and disabled entries. They are kept without enabling,
changing or adding another entry. Current project/local MCP definitions are
also checked. If a cloud connector list is unavailable or a renamed connector
cannot be identified from available metadata, setup skips conservatively rather
than risk adding a duplicate. This may require a later retry; it never blocks
Remote Link. Existing project-only MCP definitions retain that scope.

`--help`, `--version`, status, logs, stop, reset, MCP stdio servers and internal
recovery workers do not recursively run this setup. Starting a normal interactive
Agent again retries previously skipped clients.

## Diagnostics and removal

These commands are optional; normal startup does not wait for them:

```sh
remotelink setup auto
remotelink setup status --global --agent all
remotelink setup doctor --global --agent all
remotelink setup repair --global --agent all
remotelink setup uninstall --global --agent all
```

JSON reports one result per completed client. Missing/unavailable clients are
results, not a failing device startup. `already_registered` does not assert a new
healthcheck. Codex doctor discovers the safe tool catalog and calls
`remote_arc_status` through its installed app-server without a model turn.
Claude doctor uses `claude mcp get` to verify an actual connection:
`client_connection_verified: true`, while `client_tools_verified` remains false
because no tool call through a Claude model session was made.

The user-wide registration is named `remote_arc` and starts a durable copy of
the native binary with `--mcp --safe`. It survives deletion of a temporary npx
download. Content-addressed versions do not replace a running executable.
Repetition does not rewrite existing settings; use repair to restore a missing
owned entry. Ownership journals contain only the relevant MCP entry, not a
whole copy of credential-bearing configuration. Uninstall removes the owned
entry; shared cached binaries are retained so another client is not broken.

Codex writes use its official revision-checked configuration API. Claude uses
its official user-scope MCP commands, which reject an existing name on add.
Both preserve observed config drift and unrelated entries. Claude's remove
command has no revision/CAS parameter: an external edit racing an explicitly
requested uninstall is not a cross-process transaction guarantee. Managed or
restricted profiles are skipped; their policies are never broadened. Claude
connector discovery uses its own `mcp list` in an empty temporary project, which
can healthcheck existing user MCPs but does not approve project MCPs.

Native executables from PATH and known locations are supported. The Windows
npm-client fix resolves native executables from fixed official npm package
locations beside PATH/global `.cmd` shims, including local `node_modules/.bin`
prefixes, on x64 and ARM64. It never evaluates wrapper contents or invokes a
shell. Hoisted and nested optional dependencies are checked; actual native
packages take precedence over bundled wrapper stubs. The resolved client still must pass the usual version and capability
checks. Missing optional native packages and unsupported JS-only layouts skip
without changing client configuration. Claude Code on Windows also requires
its normal Git Bash installation. Package-manager-specific layouts beyond these
locations remain unqualified.

Qualified versions: Codex `0.163.0-alpha.11`, Claude Code `2.1.118`. The
[distribution report](automatic-client-mcp-distribution.md) distinguishes
published rc.4 behavior from the source-only Windows fix and records WSL evidence.

## Troubleshooting

| Result | Next step |
| --- | --- |
| No supported executable found with npm-only clients on rc.4 | Use a later candidate containing the Windows npm discovery fix, or install the provider's native executable. |
| Claude connection inspection fails on Windows | Check the provider's Git Bash prerequisite; use `CLAUDE_CODE_GIT_BASH_PATH` if Git Bash is installed outside its normal location. |
| Existing MCP/Connector kept | Restart the client if needed. Automatic setup preserves its name, scope and enabled state. |
| Managed settings, unknown connector inventory or config conflict | Follow the provider's account/managed settings. Remote Link continues to connect; automatic setup can retry on a later start. |
| Registration changed but an open client has no tools | Restart that client, then optionally run `setup doctor --global --agent all`. |

## Reproduce checks

```sh
go -C apps/agent test ./...
go -C apps/agent vet ./...
# With a C compiler; the go-device CI matrix also runs the full race suite:
GORACE=atexit_sleep_ms=0 go -C apps/agent test -race ./internal/onboarding ./internal/claudesetup ./internal/codexsetup ./internal/mcpregistration ./internal/cli
python scripts/automatic-client-mcp-smoke.py --binary <absolute-native-build> --codex <absolute-native-codex> --claude <absolute-native-claude> --report <report.json>
```

The device test harness also isolates both client profiles, so running the
normal Agent in distribution tests cannot configure a developer's real clients.
The real-client smoke uses isolated profiles and a loopback synthetic Relay.
It checks ordinary startup, an actual device file read, both real client
connections, safe MCP catalog/status, duplicate/config-hash preservation,
custom names, clean owned uninstall and normal device execution when both
client configs are invalid. Unit tests separately hold an integration open
while the device connects/executes, inject panics/timeouts, simulate account
connectors, managed settings and interrupted writes. No source-model turn runs.
The [Windows report](validation/automatic-client-mcp-windows.json) records
what was actually verified; CI platform coverage is separate from real clients.

`scripts/automatic-client-mcp-qualification.py` drives pinned real clients
against the source build, a checksum-verified public binary and the published
npm launcher without a Go override. The `Real client MCP qualification` workflow
runs these checks on Windows, macOS and Linux and uploads JSON receipts. Its
source Windows case hides other client installations, exposing only npm shims
and the OS/Git prerequisites. It runs no model turn. A passing source test does
not establish that the currently published candidate contains the source fix.

Provider references: [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli),
[Codex app-server](https://learn.chatgpt.com/docs/app-server),
[Claude Code MCP](https://code.claude.com/docs/en/mcp),
[Claude managed MCP](https://code.claude.com/docs/en/managed-mcp).
