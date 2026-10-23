# Changelog

All notable changes to Remote Arc are documented here.

## 0.6.2 - Unreleased

### Faster Browser Runner forms (release candidate 0.6.2-rc.8)

- Browser Runner no longer waits a fixed time after each action. It continues once the page has taken the action in: a page load is followed to the end, and otherwise it waits until requests the action started are done and the page has stopped changing. Clicks that only change the current view (a choice, an option, a dropdown, an in-page link) used to wait 2.5 seconds for a page load that never came and now take about 0.2 seconds; field entries take about 0.1 seconds instead of 0.4; a single-page "Continue" that changes the route without loading a page is recognised. A page that navigates later than this is still caught: the next action on its old refs is refused (`STALE_REF`).
- `browser_runner_act` with `action=fill_form` enters many fields from one snapshot in one call (`fields`: fill, select, check, uncheck). Each field gets the same checks and receipt as a single action and reports `ok` or its own error while the others still go in; it never clicks, submits or uploads, and it stops if the page navigates.
- `snapshot=true` on `browser_runner_act` returns the page as the action left it, so a click that opens a dropdown or the next step needs no separate snapshot.
- After an upload, Browser Runner waits for the form to finish reading the file (for example resume parsing) before answering.
- The Relay gives older Agents the same contract: for Agents before 0.6.2-rc.8 it enters `fill_form` fields one call at a time and takes the requested snapshot itself.
- Signing in is no longer recorded as a one-time submit. A sign-in or verification step (an email or username, a password or code the user typed, Send code) needs no submit key and can be repeated, so an expired session no longer meets `SUBMIT_ALREADY_RECORDED` on the identity page.
- A page of a longer form (Next, Continue, Save and continue) still needs `effect=submit`, but settles itself when the next page opens (`settled_by: runner`, with the new page's heading as evidence), so it needs no `browser_runner_confirm`. A page that comes back with errors holds nothing up and can be sent again with a new key, up to three times per page. Final submits (submit application, pay, book, post, send) are unchanged: sent once and confirmed by the caller.
- When a submit click sends nothing (no request leaves the page and it does not navigate, for example client-side validation), the effect is marked `nothing_sent`, and the same key may be clicked again for as long as nothing has left the page since. If a step the click opened sends it later (a CAPTCHA challenge, a confirmation), the key is answered from the checkpoint and never sent again.

### Browser Runner CAPTCHA handoff and restart recovery (release candidate 0.6.2-rc.7)

- Only an open CAPTCHA challenge puts a Browser Runner task in `needs_user`. Invisible badges, challenges parked off the page and frames that stay mounted after the user has solved one no longer hold the task, and the next snapshot continues once the challenge closes. A visible CAPTCHA checkbox is reported as a non-blocking `attention` note to complete before submitting. Challenges inside open shadow roots are now detected.
- CAPTCHA response fields are treated as secrets: their values are redacted and Browser Runner refuses to fill them. Remote Arc does not solve CAPTCHAs or read their responses, and blocker details no longer include frame URL parameters.
- On a headless page that carries a CAPTCHA, the snapshot says to switch to a visible window before typing, because switching later reopens the page.
- When a restarted browser reopens a page, `reentry_needed` in snapshots and `browser_runner_status` lists the fields, choices and uploads entered there before (labels only, never values) until they hold values again or the task leaves the page. A field the page now labels differently stays listed as `unverified` rather than being assumed filled; a file field relabelled after an upload still matches.
- Receipts for `select`, `check` and `uncheck` record the control's label.
- The first start of a task's browser profile waits up to 60 seconds for the browser (30 seconds for later starts) instead of 20, so first-run setup or antivirus scanning on Windows no longer fails the start.

### Native client onboarding and browser_runner consistency (release candidate 0.6.2-rc.6)

- Attempt Codex and Claude Code MCP setup independently in the background during normal Agent startup. Existing registrations, disabled entries and uncertain connector inventories are preserved; missing clients, incompatible settings, failures and timeouts cannot block device pairing, connection or execution.
- Resolve official Windows npm clients from both local `.bin` and global prefixes, including nested optional native packages. Prefer the actual native executable over wrapper stubs, qualify its supported capabilities, and never evaluate `.cmd` wrapper contents.
- Use `browser_runner` / `browser_runner_*` consistently in the Dashboard, tool descriptions and API messages. Count its visible permission switch alongside the other skills. Publish `browser_runner_sessions` in Agent status while retaining the rc.5 compatibility alias and accepting old/new error labels during rolling upgrades.
- Keep the installation walkthrough's Next step button readable in both light and dark themes by pairing its text and background theme colors.
- Add reproducible real-client qualification across Windows, Linux and macOS, plus actual WSL2 receipts. Verify native/public npm entry points, simultaneous device reads, repeated config hashes, custom entries, clean uninstall and failure isolation with temporary profiles and no model turns.

### Upgrade and client compatibility fixes (release candidate 0.6.2-rc.5)

- A newer `npx remotelink` now replaces an older, idle Go Agent instead of only following its log. Recovery is paused while the old Agent finishes its current operation and releases execution; the new release then starts and installs itself as the recovery service. Pairing, permissions, mode and pause state are kept. Release candidates are ordered correctly (`0.6.2-rc.4` < `0.6.2-rc.5` < `0.6.2`).
- An Agent with active work (managed processes or Browser Runner sessions), or one too old to report it (0.6.2-rc.4 and earlier), is replaced only after a yes in the terminal or with the new `--force-update`; without a terminal nothing changes. `--force-update` also replaces a same or newer Agent, for reinstall or rollback.
- AI clients with a cached tool list from before 0.6.2-rc.4 can still call the old shared-tab names (`browser_read_page`, `browser_click`, …). The calls run as before and tell the user to refresh or reconnect the connector; fresh tool lists show only `shared_tab_*` and `browser_runner_*`.

### Browser Runner Beta (release candidate 0.6.2-rc.4)

- Add Browser Runner to the native Go Agent: a separate, task-scoped background browser that drives the installed Chrome, Edge or Chromium over CDP (no Node or Playwright). Each task has its own profile and never reads the everyday browser's cookies or passwords.
- Expose six host-neutral MCP tools: `browser_runner_start`, `browser_runner_snapshot`, `browser_runner_act`, `browser_runner_status`, `browser_runner_confirm` and `browser_runner_close`. They work with any MCP client and report continuation state in the tool result.
- Restrict each task to the sites it declares. Redirects, links and popups outside them are blocked, and adding sites to a running task needs a one-time Dashboard approval for the exact origins.
- Record each submit durably before it is sent, never send it twice, and confirm its result from evidence on the page. The Agent refuses POST and submit-like controls without `effect=submit`, and a crash leaves the submit `unknown` instead of retrying it. Passwords, one-time codes and payment fields are never typed; sign-in, verification codes and CAPTCHA are handed to the user in a visible window.
- Support embedded cross-site application forms (out-of-process iframes) and open Shadow DOM.
- Rename the Chrome Companion tools to `shared_tab_list`, `shared_tab_read`, `shared_tab_click` and `shared_tab_fill`. The device protocol and stored permissions are unchanged.
- Browser Runner is off by default. Each device needs the explicit Dashboard switch, and the Relay registers the tools only with `ENABLE_BROWSER_RUNNER=1`. Generic JavaScript side effects are not fully detectable yet (#279).

### Local coding-agent tools and resource-aware Fleet (release candidate)

- Add native project-scoped Codex/Claude session metadata discovery with `takeover --workspace`, plus non-executing local installation detection with `setup inspect`. These commands do not reconstruct full history or resume an agent.
- Automatically register project read-only tools in a supported local Codex client using `setup install --agent codex --workspace <absolute-project>`. Provide status, doctor, repair and clean uninstall without manual MCP configuration or additional Remote Arc preview/approval prompts; retain native provider trust and decline unsupported managed profiles.
- Use the installed Codex client's capability-qualified configuration API with conditional revisions and durable owned-entry recovery. Preserve unrelated settings/comments, refuse configuration drift, reconcile interrupted writes and pin project directory identity. Verify real client tool discovery and a read-only status call without a model turn; existing Codex clients need restart.
- Expose only project-scoped file reads with `--mcp --safe --mcp-workspace=<absolute-project>`. No process/write tools, implicit Hooks, cloud pairing or transcript upload are introduced by local setup. Windows real-client acceptance passed; live macOS/WSL/Claude integration, default first-run dispatch, full distribution parity and cross-agent continuation remain incomplete.
- Publish bounded CPU utilization and available-memory telemetry from the Go and TypeScript device runtimes over their existing authenticated connection. Ignore stale measurements and never transfer process lists or file content as telemetry.
- Make account-level fleet placement aware of host pressure, Windows/WSL shared hardware, the number of active RA-managed processes, and device connection stability, while keeping tool permissions, Trusted Write Locations, and explicit OS requirements as hard constraints. Uninstrumented agents remain usable but are ranked conservatively behind idle instrumented agents.
- Introduce immutable GitHub-commit workspace materialization on a selected fleet node, isolated to an approved directory and verified through a managed process; do not silently copy uncommitted changes or migrate an active task.
- Include integrated hosted Arc task/conversation discovery, input/refresh recovery, configured email-sender fixes and localized official installation-guide links on every AI connection card in the source snapshot. Those changes require a separate Relay/UI deployment; installing this device RC does not deploy them or qualify AI Teams acceptance.
- Keep this release candidate separate from the already published 0.6.1 binaries and Homebrew checksums.

## 0.6.1 - 2026-10-11

### Native pause, resume and recovery fixes

- Pause a device from Dashboard without exposing its filesystem, terminal or process tools. The native Go runtime retains only an authenticated, supervised wake connection; an explicit owner-authorized request resumes execution.
- Preserve the paused state across worker restarts and foreground/background execution-lease handoffs, without allocating an execution core while paused.
- Disconnect Completely disables background supervision and login recovery, closes execution and wake connections, and requires a local restart before the device can reconnect. A paused device can also be fully disconnected.
- Restore capability-gated remote Stop Agent for supported foreground and background runtimes, and verify that the device actually disconnects before reporting success.
- Use a hidden, per-user Windows Script Host launcher for Windows login recovery and migrate owned legacy startup entries while preserving pairing. This remains user-login recovery rather than a privileged Windows service.
- Wait for an abandoned TS/Go execution lease to expire before Windows Go recovery; never take over a live execution owner.
- Migrate idle legacy macOS launchd Node/TS jobs to the native Go service, while preserving pairing and refusing takeover of an active foreign owner.
- Publish six native binaries, checksum manifests, npm and Homebrew artifacts under version 0.6.1. Keep existing 0.6.0 and RC release assets unchanged.

## 0.6.0 - 2026-10-09

### Native Go Agent and Execution Core by default

- Make the complete Go Agent the default for `npx remotelink`. Put the Go runtime in `apps/agent` and its independent filesystem/process/policy/Undo module in `packages/execution-core`; keep `apps/agent-ts` and `packages/execution-core-ts` as explicit `--ts` compatibility implementations.
- Keep device configuration and Undo snapshots in the existing local `~/.remotearc` location and preserve current operation contracts, guards and runtime fallback.
- Restore the Go terminal's colored status messages, readable connection and approval prompts, and approval expiry in the computer's local date and timezone. Keep journal files as plain text.
- Preserve Undo ordering during rapid edits and clock rollback in both engines, and retain recovery evidence when an atomic replacement may have succeeded before a synchronization error.
- Make file and Undo durability explicit, retaining the TS atomic default and Go durable default. Pairing, configuration and Go recovery checkpoints remain durable independently of workspace benchmark settings.
- Reduce Windows path-policy overhead with fresh native metadata handles while preserving junction, protected-path and alternate-stream checks without a path cache.
- Keep connection timestamps stable within a WebSocket session, record new session sequences, and normalize Go binary-file results in Relay file resources.
- Add reproducible Core and full-Agent benchmarks, two-hour Mac/Windows residency results, and Linux/macOS/Windows compatibility, race, recovery, process, journal and distribution verification.
- Publish six standalone `remotelink` binaries in one GitHub release, a primary Homebrew `remotelink` formula and the existing `remotelink-go` compatibility formula. Native installations need no Node.js. Keep `--go` as a compatibility alias and preserve one execution owner across both runtimes.
- Update the website download page, installation guide, GitHub/npm documentation and system architecture together. Pin embedded contract line endings and verify stable Homebrew checksums before merging.
- Keep TS recovery explicitly on `--ts`, including launchd, systemd, Windows supervision and child restart, so recovery cannot accidentally switch runtimes.

## 0.5.0 - 2026-10-08

### Complete native Go device runtime

- Add an opt-in complete Go device agent with native pairing, Relay connection, filesystem and process tools, Local Undo, task checkpoints, local MCP, execution logs and background recovery.
- Select Go with `npx remotelink@latest --go`; retain the TS default and explicit `--ts` fallback during the transition. Both runtimes share device identity and a single execution lease.
- Publish verified native binaries for Windows, macOS and Linux on amd64 and arm64, plus a Homebrew formula for installation without Node.
- Cover the Go runtime with three-platform race and integration tests, bidirectional TS/Go Undo and task compatibility, real MCP negotiation, native crash recovery and process cleanup.

## 0.4.8 - 2026-10-08

### Device-local execution logs in Dashboard

- Add a live Device execution log to Dashboard → Activity & details, read on demand from the paired computer's local Remote Arc operation log.
- Show recent tool calls, completion/failure state, reconnect and recovery events without turning the hosted audit store into a file-content or stdout archive.
- Keep logs local when a device is offline and surface a clear update requirement for older remotelink Agents that do not support on-demand log reads.

## 0.4.7 - 2026-10-07

### Pairing repair and clearer onboarding

- Make Forget device complete the full revocation lifecycle: live Relay sockets are disconnected immediately, and interactive CLI startup validates saved pairing before viewer/background attach so revoked local identities automatically stop old background owners, clear credentials and return to fresh pairing.
- Improve first-run onboarding readability with larger permission, workspace, recovery and connector copy, and render the ChatGPT/OpenAI mark correctly for dark and light themes.
- Keep the 0.4.6 controlled background handoff and runtime-version visibility improvements.

## 0.4.6 - 2026-10-07

### Safe Agent handoff and runtime visibility

- Fix in-place upgrades from lease-owning older background Agents: a known older worker now performs a controlled stop, lease release, bundle replacement and verified restart instead of leaving the new CLI as a passive viewer.
- Surface running Agent and installed recovery-bundle versions in Dashboard and flag devices that are behind the current CLI release.
- Restore the shipped product boundary to controlled remote-computer access plus deterministic durable Tasks; autonomous ordinary-Chat reasoning remains experimental and is no longer advertised as production capability.
- Hide experimental Agent Goal/source-decision tools from the production MCP surface while retaining the implementation behind an explicit deployment flag for continued research.
- Keep core device discovery and computer tool calls compatible with production databases that have not yet received the optional background/task-permission migrations.
- Let the deploy workflow continue with the schema-compatible Worker when the configured Cloudflare token can deploy Workers but lacks D1 migration scope (error 7403); pending D1 migrations still require separately authorized credentials.


## 0.4.5 - 2026-10-06

### Safer background upgrades

- Add safe in-place handoff from a known older background Agent to the current CLI release, preserving pairing/configuration while preventing dual executors. Unknown legacy processes continue to fail closed.
- Position Remote Arc explicitly as a persistent, permissioned agent runtime for computers the user already owns.
- Refresh the private ChatGPT Plugin release so ChatGPT re-discovers the full production MCP tool surface, including durable tasks and Agent Goals.
- Align the ChatGPT app submission metadata with all 31 production MCP tools, including binary file resources and persistent task controls.
- Add a runtime-surface contract check so Relay tool registration, app submission metadata, and the runtime positioning cannot silently drift apart.

## 0.4.4 - 2026-10-05

### Durable tasks and adaptive execution

- Unify goal creation around objective, explicit decision executor, finite plan budget and independent triggers; retain command automation as an explicit code entry.
- Add a versioned Dashboard contract and opt-in MCP goal contract while preserving legacy IDs and API defaults.
- Repair registered task Cron dispatch; expose scheduler health and actual execution-start counts, preserve queued goal events on resume and meter planned hosted turns.
- Simplify device management, default to dark, fix monochrome client marks, move the tutorial to Connect AI and update platform/safety/task documentation.
- Repair Security preview authorization/approval fixtures, share response types, and show a recoverable unavailable state for malformed or failed API responses instead of crashing. Keep preview security changes disabled.

- Retain the attached terminal and operation history when enabling recovery.
- Use a single execution lease; additional terminals observe logs and the daemon takes over after an owner ends.
- Add a hidden Windows login supervisor with bounded Agent restart backoff; require a live supervisor before reporting successful enable.
- Make macOS enable idempotent and fix launchd PID/state parsing.
- Separate verified recovery, supervisor status and execution/Relay presence in Dashboard. Disabling recovery preserves execution; stopping the background Agent is explicit.
- Write pairing configuration atomically, serialize setting changes, safely discard results for disconnected sockets, and reject local permission-profile changes while another Agent owns execution.
- Add native lifecycle and bundled attached-terminal regression checks.

## 0.4.3 - 2026-10-05

### Reliable background connections

- Fixed background-agent packaging so the copied standalone agent bundle includes its WebSocket runtime and no longer crash-loops on macOS.
- Windows background connection now uses the current user's Startup registry entry instead of Task Scheduler, avoiding administrator-only `Register-ScheduledTask` failures.
- Background agents now advertise whether the live socket is the background process, plus PID, version, and connection time for Dashboard observability.
- Dashboard distinguishes configured-vs-running background state and can repair or stop the live background agent.
- Disabling background mode can stop the background process immediately rather than only removing login autostart.
- Release CI now executes the copied standalone background bundle in addition to the installed npm package.

## 0.4.2 - 2026-10-05

### Publish artifact reliability

- Fixed the published ESM bundle so the `ws` runtime dependency remains external instead of being incorrectly bundled with CommonJS dynamic requires.
- Added a release smoke test that packs the npm artifact, installs it into a clean temporary project, and executes `remotelink --version` before publication.
- Carries the current 0.4 security model and evergreen npm/GitHub product documentation.

## 0.4.1 - 2026-10-05

### Broken ESM publish, superseded

- **Broken release:** the published CLI could install but failed at startup with `Dynamic require of "events" is not supported` because `ws` was incorrectly bundled into the ESM artifact.
- Superseded by 0.4.2.

## 0.4.0 - 2026-10-05

### Trusted Write Locations and Approval Broker

### Security and permissions

- Reframed persistent filesystem mutation scope as **Trusted Write Locations** rather than treating workspace roots as the AI's entire visible filesystem.
- Ordinary non-sensitive read-only file access can operate outside Trusted Write Locations.
- Added the **Approval Broker** for out-of-scope `write_file` and `edit_block` requests.
- Added approval decisions for **Allow once**, **Allow 10 min**, **Trust this folder**, and **Deny**.
- Added Dashboard approval handling and interactive terminal approval support.
- Bound approvals to user, device, OAuth client, OAuth grant, tool, target path, request, and arguments hash.
- One-shot approvals are consumed after successful execution.
- Sensitive Path Protection is enforced for remote MCP and can no longer be globally disabled through remote policy.
- Narrow sensitive-path exceptions remain available for explicitly required files or directories.
- OAuth authorizations are tracked and revoked per grant instead of collapsing all sessions for one client.
- Added request/client/grant attribution to security audit events.
- Narrowed Safety Guard matching to reduce false positives from commands that merely contain destructive keywords.

### Reliability and compatibility

- Added production D1 migrations for security attribution, enforced sensitive-path protection, and approval state.
- Added regression coverage for approval flows, scoped mutation, OAuth consent, grant revocation, automation behavior, and native execution across Linux, macOS, and Windows.
- Kept terminal execution as a separate high-risk capability; Trusted Write Locations are not described as an operating-system sandbox.
- Added compatibility handling so older agents that still report the legacy Workspace Scope error can trigger the new Approval Broker flow.

### Browser and product surface

- Updated Dashboard, documentation, pricing, use-case copy, and security messaging to reflect Trusted Write Locations and boundary approvals.
- Browser extension permissions remain separately controlled per tab and per device capability.
