# Automatic local Codex integration (0.6.2-rc.3)

For the **unreleased** ordinary-startup background integration for both clients,
see [Automatic coding-client MCP setup](automatic-client-mcp.md). The commands
below describe the project-scoped behavior already published in rc.3.

This slice of [#254](https://github.com/Remote-Arc/remote-arc/issues/254) registers
project read-only tools inside a supported **local Codex** client. Users do not
create a ChatGPT custom app, paste a URL or edit MCP/TOML themselves. The native
Go CLI performs configuration and connection checks without model generation.
This does not complete #254 or qualify cross-agent continuation.

## Use a stable native candidate binary

These commands require **0.6.2-rc.3** or later; **0.6.2-rc.2** does not contain
them. Use `npx remotelink@0.6.2-rc.3 setup install --agent codex --workspace <absolute-project>`,
or download the matching native RC into a location that will remain available to
Codex. Do not use a temporary `go run` executable as
the installed tool command. Moving/deleting the registered binary requires repair.

```sh
remotelink setup inspect
remotelink setup install --agent codex --workspace /absolute/project
remotelink setup status --agent codex --workspace /absolute/project
remotelink setup doctor --agent codex --workspace /absolute/project
remotelink setup repair --agent codex --workspace /absolute/project
remotelink setup uninstall --agent codex --workspace /absolute/project
```

Quote paths containing spaces with the shell's normal quoting. `--agent codex`
is the default for installation actions; `inspect` still defaults to all clients
and does not execute them. A custom installation can use
`--codex-binary /absolute/codex` (a native `.exe` on Windows). Shell aliases and
Windows npm `.cmd` wrappers are not qualified by this slice; native Codex Desktop
locations are detected separately.

Normal setup runs directly without additional Remote Arc preview/approval
screens. It does not install Hooks, pair a cloud device or enable write/process
tools. Provider trust and managed policies retain authority. This first slice
declines managed profiles; it does not attempt to bypass enterprise settings.

## What is registered and how it is verified

The entry name is derived from the canonical Codex profile and project, so one
project/profile receives one registration. It starts the current native Go
binary with `--mcp --safe --mcp-workspace=<project>` and an automatically supplied
workspace identity. That identity rejects a directory replaced between setup
and a later Codex connection. Ordinary edits within the same directory retain
the identity.

The installed Codex executable supplies its version and generated protocol
schema. Setup requires conditional `config/batchWrite`, layer/revision reads
and scoped MCP diagnostics before attempting mutation. Unknown/older contracts
return an actionable error; there is no hand-written whole-file TOML fallback.
The supported version is capability-qualified per invocation, not an assumed
range. Windows real-client qualification is recorded separately from CI.

Configuration is read through `config/read` and updated through the official
`config/batchWrite` API with `expectedVersion`. The exact provider-supplied file
path spelling is retained after canonical validation: on Windows, lowercasing a
not-yet-created path can fail Codex's user-config target check. Existing entries
and comments remain with the provider's configuration writer.

Installation succeeds only after Codex creates a nonpersistent diagnostic thread,
discovers exactly the five project read-only tools and calls `remote_arc_status`
successfully. Other MCP registrations are disabled for that diagnostic thread
only. No `turn/start` is issued. The diagnostic does not reload an already-running
desktop/CLI process: restart existing Codex clients to pick up changed tool
registrations. A fresh diagnostic connection is the verified behavior; live
desktop hot reload is not claimed.

`status` reports stored configuration state; it does not claim a live connection.
`doctor` repeats client verification and checks the registered binary fingerprint.
A project that is missing or replaced requires action. Uninstall can still
remove the original owned registration when the project is unavailable.

## Recovery and clean uninstall

Remote Arc keeps a bounded durable ownership/undo record under its local
`integrations/codex` directory. Before a write it stores the desired registration,
the previously observed entry, original entry state (absent for a new owned
registration), transaction stage and binary fingerprint. This is entry-level
recovery; unrelated configuration and credentials are not copied into its record.

Competing Remote Arc setup actions use a local lease. Every configuration write
uses the provider revision, and the current entry must still match owned state.
An interrupted retry reads actual state: an already-applied registration is
verified rather than written again. `changed: null` means dispatch outcome was
not acknowledged; rerun the requested action to reconcile it. Never infer
`changed: false` from an interrupted request.

Repair restores a missing owned entry or updates the current binary binding;
it refuses user-edited bindings. Uninstall removes only the owned entry and
then its journal. Unrelated settings, comments and concurrent edits remain.
If configuration drift is reported, preserve it and inspect the conflicting
entry; this slice deliberately has no force-overwrite/adopt switch.

## Native Go and distribution parity

All installation, status, doctor, repair and uninstall logic lives in Go.
The npm launcher forwards the same commands to its verified Go binary;
standalone and Homebrew invoke that binary directly. A script-installed native
binary uses the same implementation and does not require Node.

This RC adds explicit setup commands. Plain `npx remotelink`
still follows existing device pairing, and the published install script still
installs its pinned stable binary without running local integration. Automatic
first-run selection/dispatch across those bootstraps and its full distribution
matrix remain in #254; changing a version label alone would not ship this feature.

Local Codex registration does not install or connect a ChatGPT web plugin; that
handoff is [#268](https://github.com/Remote-Arc/remote-arc/issues/268). The reverse
route, ChatGPT/Arc recovering a stopped local Codex task through a paired device,
does not require this registration and remains independent in #255/#257/#258.
Codex Cloud provisioning remains separate in #263.

## Reproduce verification

```sh
go -C apps/agent test ./internal/codexsetup ./internal/onboarding ./internal/localmcp ./internal/workspaceidentity ./internal/cli
go -C apps/agent vet ./...
python3 scripts/codex-local-setup-smoke.py --binary /stable/native/candidate --codex /installed/native/codex --report work/codex-setup-smoke.json
```

The committed smoke uses fresh, isolated synthetic profiles and real installed
Codex. It covers customized config/comments, repeated/interrupted installs,
missing-entry repair, drift refusal, concurrent revisions, real client reads
and outside denial, replacement workspaces and clean/repeated uninstall. It
also checks that unrelated configured MCP commands are not started by diagnostics.
Reports contain synthetic test results and hashes, not private transcripts.
The command needs an installed Codex; CI's synthetic native-client regressions
do not substitute for that real-client check. Real Mac-host, WSL, Claude and web
activation acceptance remain unqualified by this Codex-only slice.

The [Windows acceptance report](validation/codex-local-setup-windows.json) records
Codex `0.163.0-alpha.11`, six passing scenario groups and the candidate SHA256.
That binary was built on Windows with Go using
`go -C apps/agent build -buildvcs=false -trimpath -ldflags '-X main.version=dev-codex-setup' -o <candidate.exe> ./cmd/remotelink`,
then exercised with the committed smoke script. Its profile/project/state paths
were synthetic and its configuration was removed after the run. This is evidence
for that installed build, not a certification of every Codex release.

Official contract: [Codex App Server](https://learn.chatgpt.com/docs/app-server).
