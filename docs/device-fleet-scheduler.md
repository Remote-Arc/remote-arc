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
