# Automatic coding-client MCP setup (unreleased)

This next slice of [#254](https://github.com/Remote-Arc/remote-arc/issues/254)
adds optional **background** setup when the Go device agent starts normally.
It is not in the published 0.6.2-rc.3 or stable 0.6.1 packages. Use a build
containing this change to verify it; installing an older package does not enable it.

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

Native executables from PATH and known locations are supported. Windows npm
`.cmd` wrappers alone, unknown client contracts and full real macOS/WSL
distribution acceptance remain open in #254. Windows native qualification:
Codex `0.163.0-alpha.11`, Claude Code `2.1.118`.

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

Provider references: [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli),
[Codex app-server](https://learn.chatgpt.com/docs/app-server),
[Claude Code MCP](https://code.claude.com/docs/en/mcp),
[Claude managed MCP](https://code.claude.com/docs/en/managed-mcp).
