# Remote Arc

`remotelink` is the official npm CLI for pairing your Windows, macOS or Linux computer with Remote Arc.

[Website](https://remotearc.app) · [GitHub](https://github.com/Remote-Arc/remote-arc) · [User guide](https://remotearc.app/docs/start-here)

<!-- github-overview:start -->
**Agent infrastructure for real work across your apps and computers.**

Arc is your hosted AI teammate. Connect brings the same authorized Apps and device execution to the AI client you already use. Remote Arc manages the context, permissions, persistent work, device placement and usage around model decisions so work can proceed from a request to an inspectable result.

## Two ways to work

| Product | Start here | What it does |
| --- | --- | --- |
| **Arc** | [Hosted workspace](https://agent.remotearc.app/dashboard/agent/chat) | Chat with a personal agent, use connected Apps/computers, reuse Skills, and create one-off Tasks or recurring routines. |
| **Connect** | [Connect your AI](https://remotearc.app/connect-ai) | Use authorized cloud accounts, paired devices and your browser from compatible ChatGPT, Claude, Codex, Cursor or other MCP clients. |

Arc keeps a delegated responsibility together: its sources, instructions, conversation and run history, with fresh bounded judgment when scheduled and checks against actual results. Start with a daily work brief, project check-in, delivery verification or change follow-up. The [use-case catalog](https://remotearc.app/use-cases) also keeps Arc and Connect paths for all 15 concrete workflows.

Every plan includes every Connect tool. **Free** has monthly Connect call and file-transfer allowances and up to 2 computers. **Connect Unlimited** removes the call and computer limits for people who bring their own AI client; it includes no hosted models. **Plus** and **Pro** add Arc-hosted AI with monthly Credits. Every account can activate a one-time 14-day Arc trial. Users never supply a model API key. Current prices and allowances are on the [pricing page](https://remotearc.app/pricing); third-party App charges are separate. Preview environments use simulated data.
<!-- github-overview:end -->

## Quick start

```bash
npx remotelink@latest
```

From 0.6.0, this npm command starts the complete **native Go Agent** by default.
The Node launcher verifies the matching platform binary against the SHA256
manifest pinned to this npm release. `--go` remains an alias; `--ts` selects the
retained TypeScript implementation.

Or install the CLI globally:

```bash
npm install -g remotelink@latest
remotelink
```

Requires Node.js 20 or later. The npm launcher downloads and verifies the
matching native Agent. For installation without Node.js, see the
[download guide](https://remotearc.app/downloads).

**Updating:** run `npx remotelink@latest`. A known older, idle Go Agent is
replaced while preserving pairing, permissions and pause state. Active work
requires confirmation in the terminal. Stop the current Agent before changing
runtimes; `--ts` selects the TypeScript compatibility implementation.

The primary runtime is `apps/agent` and its independent Go module is
`packages/execution-core`. `apps/agent-ts` and `packages/execution-core-ts` support
explicit fallback and compatibility checks. The Cloudflare Relay and React
Dashboard remain TypeScript; native device execution requires neither Node nor
a local Go compiler.

On first run, `remotelink`:

1. creates a short-lived pairing request;
2. opens the Remote Arc pairing page in your browser;
3. asks you to sign in and approve the device;
4. stores a device credential locally in `~/.remotearc/config.json`;
5. connects in the foreground while you choose device permissions;
6. if Background connection remains selected, installs a user-level login service only after you finish browser setup.

No public IP, VPN, router port forwarding, repository clone, or manual token
copy is required.

<!-- latest-release:start -->
## Latest release

**remotelink 0.6.5 — Dashboard browser authentication and reliable process admission**

Published 2026-10-28

- Add per-device, exact-website Dashboard approval and revocation for OTP sign-in/registration and supported CAPTCHA controls. Snapshots report effective authorization; missing approval and outdated clients return actionable errors.
- Make legacy shared-tab fill and current action tools use the same OTP policy. Approved Runner verification providers expose visible controls and optional cropped challenge images; response tokens stay private, unsupported challenges retain human handoff and final submissions remain separately authorized.
- Record authentication permission changes without recording code values, and remove authentication codes from resumable URLs.
- Raise the default running-command limit from 32 to 64, configurable from 1 to 256 with REMOTEARC_MAX_ACTIVE_PROCESSES. Completed jobs no longer occupy running slots; retain at most 128 finished records for up to 30 minutes in both Go and TypeScript runtimes.
- Publish Remote Arc Browser 0.4.1 with Dashboard OTP enforcement and corrected legacy tool behavior.
- Promote the qualified Agent changes to the stable 0.6.5 npm/native release.

See the [full Remote Arc release history](https://remotearc.app/releases) or the [GitHub changelog](https://github.com/Remote-Arc/remote-arc/blob/master/CHANGELOG.md).
<!-- latest-release:end -->

## Connect your AI client

Remote MCP endpoint:

```text
https://mcp.remotearc.app/mcp
```

Website and device dashboard:

```text
https://remotearc.app
```

### After a Remote Arc update

AI clients cache a connector's tool list when it connects. If new tools (for example `browser_runner_*`) are missing after an update, refresh or reconnect the Remote Arc connector in your AI client; in Claude, disconnect and reconnect it. A device's Browser Runner also needs the **Browser Runner** switch on that device in Dashboard → Devices.

Clients that still show the older shared-tab names (`browser_read_page`, `browser_click`, …) keep working: those calls are routed to the current `shared_tab_*` tools and the result asks the user to refresh the connector.

## Commands

In **0.6.3**, Browser Runner (beta) keeps task windows out of sight by default
and uses task-scoped Chrome, Edge or Chromium,
with optional connection to your running Chrome, batched form entry, durable final
submissions, profile reuse and restart recovery. Enable **Browser Runner** for the
device in Dashboard. Open CAPTCHA challenges still need you; the Agent never reads
or fills their responses. Sign-in codes can come from an authorized connected source,
and saved passwords are filled only from the computer's protected local vault.

Normal startup attempts Codex and Claude Code setup in independent background tasks.
Existing MCP entries, device pairing and permissions are preserved; a skipped client
never blocks the Agent. Project-scoped [local setup](https://github.com/Remote-Arc/remote-arc/blob/master/docs/codex-local-integration.md),
[read-only MCP](https://github.com/Remote-Arc/remote-arc/blob/master/docs/workspace-local-mcp.md), [setup inspection](https://github.com/Remote-Arc/remote-arc/blob/master/docs/local-setup-inspection.md)
and [coding-session discovery](https://github.com/Remote-Arc/remote-arc/blob/master/docs/local-session-discovery.md) are included.
Discovery lists metadata for review; it does not resume an agent or reconstruct its history.

A newer release replaces an older idle Agent automatically. Active work, an Agent too
old to report its work, or a same/newer version requires terminal confirmation or explicit
`--force-update`. Install the stable release with `npx remotelink@latest` or a matching
native download. Refresh the Remote Arc connector in your AI client after upgrading.

```text
npx remotelink                 Pair/reconnect and keep the terminal and logs open
npx remotelink --safe          Hard local read-only cap
npx remotelink --developer     Legacy alias for dashboard-managed capabilities
npx remotelink --foreground    Stay attached without installing/repairing recovery
npx remotelink --background    Enable/repair recovery; keep this terminal attached
npx remotelink --no-background Disable recovery; preserve current execution
npx remotelink --reset         Remove local pairing and background registration
npx remotelink --force-update  Replace the running Agent even if busy or not older
npx remotelink --version       Show the CLI version
npx remotelink --help          Show help
```

The package also exposes the aliases `remote-link` and `remote-arc`.

**Updating a running Agent.** Run the newer release normally (for example `npx remotelink@latest`). If the running Go Agent is older and idle, it is replaced automatically: it finishes the current operation, releases execution, and the new release takes over and installs itself as the recovery service. Pairing, permissions and pause state are kept. If the running Agent has active work (managed processes or Browser Runner sessions), or is too old to report it, Remote Arc explains what would stop and asks in the terminal; without a terminal it changes nothing. Add `--force-update` to replace it anyway, or to replace an Agent that is the same version or newer (for example to roll back).

Background recovery and Relay reconnect are separate. A normal `npx remotelink@latest` launch can safely hand off a known older background Agent to the current release without creating two executors.
Recovery installs a user service (macOS/Linux) or a hidden login supervisor
(Windows), which takes over when the executing Agent ends. Only one updated
Agent owns execution; additional terminals follow its operation log and offer
approvals. A forcibly killed owner can take about 15 seconds to release its
execution lease. Turning recovery off preserves current execution. Explicit
Stop background Agent also ends that Agent's work. Windows recovery needs the
supervisor to remain running; killing it requires a local relaunch or login.
Sleep/power loss still makes the device unavailable. All concurrent instances
must be updated; pre-0.4.4 Agents do not participate in the execution lease. When the installed version is identified as an older release, the current CLI performs a controlled handoff even when that older Agent still owns the execution lease: it stops the known Remote Arc worker and supervisor, waits for the lease to release, preserves pairing and policy, installs the replacement bundle, and verifies that the replacement worker owns execution. If a saved device pairing has been revoked from Dashboard, interactive startup now validates it before viewer/background attach, stops the known local background owner, clears the revoked credential and begins fresh pairing. Unknown processes still fail closed instead of being killed automatically.

## Native execution core

Remote Arc no longer shells out to a third-party computer-control MCP server.
The CLI bundles Remote Arc's own cross-platform execution core for filesystem,
process, terminal, Local Undo, and Safety Guard behavior.

MCP remains the interoperability protocol between AI clients and Remote Arc;
local OS execution is implemented and versioned by Remote Arc itself.

## Capability model

Newly paired devices start with only read-oriented skills enabled:
directory listing, file reading, file metadata, and process listing.

Use the Remote Arc dashboard to enable or disable individual skills per device.
The Safe preset keeps access read-only, Developer adds file editing, and Full
adds terminal execution.

By default the local CLI exposes the capabilities that the dashboard may grant,
while the relay enforces the saved per-device policy before forwarding a call.
Use `--safe` when you want an additional local hard cap that prevents write
skills from running even if they are enabled in the dashboard.

Device permissions, Trusted Write Locations, Sensitive Path settings, Approval
Broker decisions, and Undo policy are managed from Remote Arc Cloud and enforced
again by the local execution core. The
CLI does not keep a second editable copy of those policies. Local options such as
`--safe` may only make access stricter; they cannot silently broaden Dashboard
permissions.

Background mode is different because it is operating-system state. The Dashboard
can request a change while the device is online, but the local agent reports the
actual launchd, Task Scheduler, or systemd-user result back before the Dashboard
shows the setting as enabled.

## Local Undo

Remote Arc snapshots the previous local file state before supported
`write_file` and `edit_block` operations. These snapshots stay under
`~/.remotearc/undo` on the device and are never uploaded to Remote Arc Cloud.

The `undo_last_change` skill controls whether an AI may invoke the newest
reversible Remote Arc file change. Snapshot creation is a separate per-device
Recovery setting in the dashboard. The dashboard can also list local undo
metadata on demand and restore a specific action without uploading snapshot
contents. Snapshots expire after 7 days, use at most 200 MB in total, and files
larger than 20 MB are not snapshotted.

Local Undo covers Remote Arc file writes only. It cannot reverse external side
effects such as publishing a package, deploying cloud infrastructure, sending a
request to another service, or mutating a remote database.

## Trusted Write Locations, approvals and sensitive paths

The dashboard can configure Trusted Write Locations, additional protected
paths, and narrow sensitive-path exceptions per device. Online devices also
support a local directory picker so trusted write roots can be selected without
typing paths manually.

Ordinary non-sensitive read-only file tools may inspect paths outside Trusted
Write Locations. Supported mutations stay inside trusted write roots unless an
out-of-scope write receives a matching Approval Broker grant. The dashboard and
an interactive remotelink terminal can approve once, allow the same file
briefly, trust the parent folder, or deny the request.

Sensitive-path protection is **enabled by default** for credential locations
and `.env` files. Device owners may explicitly turn it off in Dashboard after
confirming the risks. Disabling it pauses both built-in and custom sensitive
path restrictions for file tools, so a narrow exception is preferable whenever
possible. A sensitive-path exception only grants file visibility; it does not
allow writes outside Trusted Write Locations. Terminal execution is a separate
high-risk capability and is not sandboxed by file policy.

Filesystem paths are canonicalized and checked locally immediately before
execution. Full terminal mode requires an in-scope `cwd` when trusted write
roots are configured, but shell commands are not an OS sandbox and can still
reference other paths, credentials, processes or network services.

## Safety Guard

Terminal access stays useful for normal development and cleanup workflows.
Before a command runs, the device resolves where each delete would land
(`rd`, `del`, `Remove-Item`, `rm`, `find -delete`, `robocopy /MIR`,
`rsync --delete`, inline `rmtree`/`rmSync`), including through nested
cmd/PowerShell/sh layers, variables, wildcards and simple pipelines. It refuses
drive and volume roots, home and personal folders, system and credential
folders and the `~/.remotearc` Undo store, plus any delete whose target cannot
be resolved unambiguously (for example escaped quotes across nested shells or
an unset variable). Narrow cleanup such as `node_modules`, `%TEMP%` or
`~/Library/Caches` still runs. It also blocks disk formatting or raw-disk
overwrite, fork bombs, and machine shutdown/reboot. This is defense in depth,
not an OS sandbox; `REMOTEARC_ALLOW_DESTRUCTIVE=1` on the device disables it.

Full mode also supports managed background processes. `start_process` can
return a local process id, and `process_status`, `process_output`, and
`stop_process` manage that process without introducing another execution
backend. The authenticated dashboard can list Remote Arc-managed jobs, inspect
their captured output, and stop a running job on demand.

## Security

- Each computer receives its own revocable credential.
- Raw device credentials are not stored in the hosted database.
- Connections are initiated outbound from your computer.
- MCP access uses OAuth 2.1 + PKCE.
- Each AI OAuth authorization is shown separately as active, refreshable, or expired.
- Revoking one AI authorization does not revoke paired computers or other AI grants.
- Device access is scoped to the authenticated Remote Arc account.
- You can revoke paired devices from the Remote Arc dashboard.
- Supported file changes can be rolled back from local-only snapshots.

Remote computer control can modify files and execute commands. Remote Arc
starts new devices read-only; enable additional skills only when you want the
connected AI to use them. Full terminal access should be used only on computers
you control.

## Requirements for npm / npx

Node.js is required only for this npm package and the TS fallback. Standalone
Agent binaries need no Node.js; see the
[installation guide](https://remotearc.app/downloads).

- Node.js 20 or later
- Windows, macOS, or Linux

### Runtime selection

The CLI defaults to the complete native Go device runtime. `--go` remains a
compatible alias; `--ts` selects the retained TS runtime. Native Go executables
run without Node; npx requires Node for the installation and launch entry.
The Go runtime uses the same paired device identity, permissions and execution
lease. Stop the executing agent before switching runtimes.

Start Go with `npx remotelink@latest --go --foreground`. Use
`npx remotelink@latest --go --status` to inspect the native runtime, or
`npx remotelink@latest --go --stop` to stop it before returning to TS.

Go binaries accompany the matching npm release. For development builds,
installation, compatibility coverage and recovery behavior, see the
[Go device runtime guide](https://github.com/Remote-Arc/remote-arc/blob/master/apps/agent/README.md).

## Product vs package name

**Remote Arc** is the product name.

`remotelink` is the npm package and CLI command.

## Support

- Website: https://remotearc.app
- Support: https://remotearc.app/support
- GitHub: https://github.com/Remote-Arc/remote-arc

## License

**Remote Arc Proprietary Source License — commercial exploitation requires
written permission from Remote Arc.**

You may use the official software under its applicable terms. Selling,
redistributing, sublicensing, white-labeling, modifying it, or offering a
competing service requires written authorization. The full terms are in the
[LICENSE](https://github.com/Remote-Arc/remote-arc/blob/master/LICENSE),
which is included in this npm package and synchronized with the GitHub repository.

Historical revisions previously released under MIT retain the MIT terms that
applied to those revisions. Third-party components retain their own licenses.
