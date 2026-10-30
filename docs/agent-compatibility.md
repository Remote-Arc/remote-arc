# Cloud and device Agent compatibility

Updated 2026-10-30. The Worker is released through the Production Release
workflow, and Agents update when each user upgrades. A new cloud therefore serves
old Agents for as long as those Agents stay installed.

## The rule

The cloud never infers a feature from a version number. Each Agent reports the
capabilities and tools it supports when it connects. The Relay gates on those
reports and filters tools by what the device advertises.

A change that needs new Agent behaviour must:

1. Add a new capability string instead of changing the meaning of an existing one.
2. Gate the cloud path on it, with a message that tells the user what to update.
3. Add a row to the table below.

`scripts/device-capability-contract-test.mjs` fails CI when the Relay gates on a
capability that the Go Agent does not report, or when a capability is missing
from this table.

## Capability matrix

"First release" is the first stable `remotelink` release containing the
capability.

| Capability | First release | With an older Agent |
| --- | --- | --- |
| `device_policy_v1` | 0.3.9 | The dashboard reports that policy enforcement is unavailable on this device |
| `undo_history_v1` | 0.3.9 | Local Undo history is unavailable in the dashboard |
| `background_agent_v1` | 0.4.0 | The background option is unavailable unless the device was previously seen in the background |
| `background_recovery_v2` | 0.4.4 | Background recovery controls are unavailable |
| `device_stop_v1` | 0.6.1 | Stopping the Agent from the dashboard is unavailable |
| `device_pause_v1` | 0.6.1 | Pausing the Agent from the dashboard is unavailable |
| `browser_runner_v1` | 0.6.2 | Reported only; the task browser depends on the device advertising its tools |
| `runner_view_v1` | 0.6.5 | Live view returns 409 with "Update Agent to enable live view" |
| `browser_auth_policy_v1` | 0.6.5 | Filling sign-in fields is refused with `BROWSER_AUTH_UPDATE_REQUIRED` |
| `runner_video_v1` | 0.6.5 | Live video is unavailable |
| `go_agent_v1` | 0.6.0 | Reported only; identifies the Go runtime |
| `native_core_v1` | 0.3.9 | Reported only; identifies the native Execution Core |

The Chrome Companion reports its own capabilities, such as
`browser_auth_policy_v1`, and the same gate applies to it.

## Tools

A tool that needs a newer Agent is not advertised by an older one, so it does not
reach that device. `device_tools` shows what a specific device supports. For
example, `list_agent_sessions` needs Agent 0.6.4 or newer.

## Checking a real device

Compare three things: the `master` commit, the Worker version from the Production
Release run, and the Agent version the device reports. A feature works only when
all three include it. Admin device views show the live Agent versions.
