# Device Fleet Scheduler (account-level)

Fleet scheduling is a **Remote Arc account capability**, not a separate device-level permission or a requirement to select a machine in the UI.

## Behavior

- `create_agent_goal` and `create_automation` automatically select an eligible device when `device_id` is omitted. Explicit IDs are preserved for compatibility and intentional pinning.
- `fleet_dispatch` routes one-off `read_file`, `get_file_info`, `list_directory`, and `start_process` operations. It returns the selected device ID so follow-up calls (such as `process_status`) stay on that machine.
- Placement uses only the signed-in account's enrolled, online and unpaused devices; it requires the actual available and allowed skills, task permissions, and matching trusted workspace paths. Platform requirements are hard constraints.
- For eligible devices, a running automation contributes the highest load; account audit activity from the last three minutes contributes a lower load. Devices sharing the same real hostname (for example Windows and WSL on one PC) share their load score, not independent capacity. Mac is preserved for Mac-only operations when alternatives are equally idle.
- Device-policy checks, workspace enforcement, approvals, Safety Guard, quotas, and task permission checks remain in the existing execution path. The scheduler cannot grant additional access.
- Once a task begins, the selected machine remains its execution owner. A disconnect makes the existing task wait or follow its established recovery policy; **no automatic cross-device replay of uncertain or stateful work**.

## Boundaries and follow-up

This is first-stage *placement*, not distributed shared storage. A path that exists only on a Mac cannot silently be used on Windows, even if Windows is idle. Automatic migration of a running job, workspace replication, battery/CPU/RAM telemetry, and atomic capacity reservations need separate protocols and rollout.

The load signal deliberately uses existing D1 tables and a bounded audit window, with no continuously polling loops or per-device scheduling user settings.

## Phase 2: resource-aware, stability-aware placement

The Go and legacy TypeScript agents now sample **host-level CPU utilization and available memory** and publish bounded values on their existing 30-second WebSocket presence message. The Durable Object validates and timestamps observations server-side. This does not add a frequent D1 write or a separate polling service.

- Freshness: resource measurements older than 2 minutes are ignored. Missing telemetry remains eligible for ordinary work, but cannot satisfy an explicit minimum-memory requirement.
- Pressure: CPU and available-memory ratios penalize busy devices. The Go agent also reports only the count of currently running Remote Arc-managed processes (never command lines or paths), including quiet long-running browser/build jobs. Windows/WSL sharing a hostname share conservative resource and managed-process pressure. Agents without fresh telemetry remain eligible but are ranked behind reasonably idle instrumented nodes: absence of a measurement does not imply idle capacity.
- Stability: sessions younger than 2 minutes incur a larger reconnect penalty; sessions younger than 10 minutes incur a smaller one. Authorization and platform requirements always override the score.
- Device process state and Agent version remain visible; resource telemetry is best-effort and may be absent on unsupported OS versions or missing system utilities.

## Reproducible Git workspace sync

The account-level `fleet_sync_workspace` tool accepts only a validated GitHub `owner/repo` and immutable **40-character commit SHA**. Fleet Scheduler picks a capable online device and materializes the requested commit under a newly named directory inside one of its **Trusted Write Locations**. The operation runs as a managed background process and returns the `device_id`, `workspace` path and process handle.

The Agent must use `process_status` on that same device, verify exit code 0, and only then start work from the returned path. Unknown acknowledgment is **never retried on a different device**. Existing directories are verified rather than overwritten; the checkout must have the expected origin, commit and clean working tree. Git credentials, when needed for private repositories, stay on the execution device. Remote Arc does not transmit them.

This intentionally distributes **tracked Git content**, not arbitrary local files. It does **not** copy uncommitted changes, ignored files, private SSH keys, database files, or a running process. Bidirectional editing, merge-conflict resolution, changeset transfer and automatic state migration require a separate consistency and approval protocol. The source and destination must both have Git and network access to GitHub.
