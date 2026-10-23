# remotelink

Connect a Windows, macOS, or Linux computer to **Remote Arc** with one command.

Remote Arc lets authorized AI clients such as ChatGPT, Claude, and Codex reach
the computers you explicitly pair through a secure outbound connection.

## Quick start

```bash
npx remotelink
```

From 0.6.0, this npm command starts the complete **native Go Agent** by default.
The Node launcher verifies the matching platform binary against the SHA256
manifest pinned to this npm release. `--go` remains an alias; `--ts` selects the
retained TypeScript implementation.

Without Node, use [standalone downloads](https://remotearc.app/downloads) or:

```bash
brew tap yaohuangguan/remote-arc https://github.com/yaohuangguan/remote-arc
if brew command trust >/dev/null 2>&1; then brew trust --formula yaohuangguan/remote-arc/remotelink yaohuangguan/remote-arc/remotelink-go; fi
brew install yaohuangguan/remote-arc/remotelink
remotelink
```

Stop the current Go Agent before upgrading: `npx remotelink@latest --stop`, then
`npx remotelink@latest --foreground`. Existing TS owners require
`npx remotelink@latest --ts --no-background` and stopping their original terminal
before Go starts. Go refuses to take execution from an active TS owner.
Pairing, permissions and Undo records are preserved; commands are not replayed.
For TS fallback, stop Go first, then run `npx remotelink@latest --ts`.

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

**remotelink 0.6.2 — Browser Runner, native client setup and device upgrades**

Published 2026-10-23

- Add Browser Runner (beta) to the native Go Agent: task-scoped Chrome, Edge or Chromium sessions, declared site boundaries, durable submit receipts and restart recovery. Enable it separately for each device in Dashboard.
- Let Browser Runner connect to the user's running Chrome with `browser=your_chrome`, reusing existing sign-ins in a task-owned window. Chrome 144+ requires remote debugging and approval for each new connection; tasks share a connection that disconnects five minutes after the last task detaches. Closing a task preserves the user's Chrome profile.
- Replace fixed action delays with page, network and DOM settling. Batch ordinary fields with `action=fill_form`, request the resulting page with `snapshot=true`, and wait for uploaded-file parsing. Older Agents receive compatible sequential field entry and snapshots through the Relay.
- Separate repeatable sign-in steps, intermediate form pages and final submissions. Intermediate steps settle from the next page's evidence; final submit, pay, book, post and send actions retain one-time dispatch and confirmation. A click that sent nothing can be retried with the same key until something leaves the page.
- Hand off only open CAPTCHA challenges, resume when they close, and report visible checkboxes as non-blocking attention notes. CAPTCHA response values remain secret and cannot be filled or read by the agent.
- Preserve browser profiles and saved sign-ins across conversations. Restarted pages report the labels of missing fields, choices and uploads without retaining their values; relabelled controls stay unverified until checked.
- Support filling one-time sign-in codes through authorized connected sources without recording their values. Each device can disable this with `browserRunnerOneTimeCodes=false`. Passwords and payment details are never typed from the conversation; CAPTCHAs still require the user.
- Add local saved sign-ins with `remotelink vault add` and `action=fill_secret`, constrained to the saved site and credential part. Use Windows DPAPI, macOS Keychain or a user-restricted credential file as appropriate. Completed browser sign-ins can be saved automatically and disabled with `browserRunnerSaveLogins=false`.
- Attempt Codex and Claude Code MCP setup independently in the background during normal startup. Preserve existing registrations, disabled entries, pairing and permissions; missing clients, uncertain inventories and setup failures never block the Agent.
- Discover official Windows npm client binaries in local and global prefixes, including nested native packages, without evaluating command wrappers. Add project-scoped setup inspection, read-only MCP, coding-session metadata discovery and repair commands; session discovery does not resume another agent.
- Replace an older idle Agent when a newer release starts, preserving pairing, permissions, pause state and recovery ownership. Active or uninstrumented Agents require terminal confirmation or explicit `--force-update`; unattended updates leave them running.
- Use `browser_runner_*` and `shared_tab_*` consistently while keeping cached legacy shared-tab tool calls working during upgrades. Existing AI clients should refresh their connector's tool list after updating.
- Add bounded CPU and available-memory telemetry and resource-aware Fleet placement, respecting device ownership, tool permissions, trusted directories, explicit OS requirements and Windows/WSL shared hardware. Active work is not silently migrated.
- Publish fresh 0.6.2 npm, six native binaries, SHA256 manifests and Homebrew formulas. The website's default Agent downloads and version badge use the latest stable release rather than the development package's RC version.
- Keep the shared Chrome connection alive until a task tab's closure is confirmed, then release it when idle. This avoids reporting a lost connection while Chrome is still finishing a close.

See the [full Remote Arc release history](https://remotearc.app/releases) or the [GitHub changelog](https://github.com/yaohuangguan/remote-arc/blob/master/CHANGELOG.md).
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

In **0.6.2**, Browser Runner (beta) uses task-scoped Chrome, Edge or Chromium,
with optional connection to your running Chrome, batched form entry, durable final
submissions, profile reuse and restart recovery. Enable **Browser Runner** for the
device in Dashboard. Open CAPTCHA challenges still need you; the Agent never reads
or fills their responses. Sign-in codes can come from an authorized connected source,
and saved passwords are filled only from the computer's protected local vault.

Normal startup attempts Codex and Claude Code setup in independent background tasks.
Existing MCP entries, device pairing and permissions are preserved; a skipped client
never blocks the Agent. Project-scoped [local setup](../../docs/codex-local-integration.md),
[read-only MCP](../../docs/workspace-local-mcp.md), [setup inspection](../../docs/local-setup-inspection.md)
and [coding-session discovery](../../docs/local-session-discovery.md) are included.
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

Terminal access stays useful for normal development workflows. The local CLI
only blocks a narrow set of catastrophic commands such as root/home recursive
deletion, disk formatting or raw-disk overwrite, fork bombs, and machine
shutdown/reboot. These checks happen on the device before the command reaches
the local execution core.

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
Agent binaries and Homebrew installations need no Node.js; see the
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

For native installation on macOS/Linux without Node:

```sh
brew tap yaohuangguan/remote-arc https://github.com/yaohuangguan/remote-arc
if brew command trust >/dev/null 2>&1; then brew trust --formula yaohuangguan/remote-arc/remotelink yaohuangguan/remote-arc/remotelink-go; fi
brew install yaohuangguan/remote-arc/remotelink
remotelink --foreground
```

Go binaries accompany the matching npm release. For development builds,
installation, compatibility coverage and recovery behavior, see the
[Go device runtime guide](https://github.com/yaohuangguan/remote-arc/blob/master/apps/agent/README.md).

## Product vs package name

**Remote Arc** is the product name.

`remotelink` is the npm package and CLI command.

## Support

- Website: https://remotearc.app
- Support: https://remotearc.app/support
- GitHub: https://github.com/yaohuangguan/remote-arc

## License

The Remote Arc implementation is source-available under the **Remote Arc
Proprietary Source License**. It is not MIT-licensed for new releases.

Historical revisions that were previously released under MIT remain governed
by the MIT terms that applied to those revisions.
