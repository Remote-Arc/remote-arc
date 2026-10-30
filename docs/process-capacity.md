# Managed process capacity

Remote Arc limits the commands it launches on each device. This is separate from Windows, WSL, Linux or macOS process limits.

The default limit is **64 simultaneously running managed commands**. Completed commands do not consume a running slot. Set `REMOTEARC_MAX_ACTIVE_PROCESSES` in the Agent's environment to an integer from **1 to 256** to tune the limit for the computer. Invalid settings use the default. Restart the Agent after changing its service environment.

For example, in PowerShell before starting the Agent:

```powershell
$env:REMOTEARC_MAX_ACTIVE_PROCESSES = "128"
remotelink --background
```

Or on macOS/Linux before starting the Agent:

```sh
REMOTEARC_MAX_ACTIVE_PROCESSES=128 remotelink --background
```

Keep process output available for inspection for up to 30 minutes and retain at most 128 completed records per device. If that history fills, the oldest completed records are removed first; running tasks are never evicted to free a slot. Each output stream retains its existing 2 MiB capture cap.

Previously, the Go Agent counted all 32 retained records as occupied slots, even if every command had already exited. That could block new commands, tests and cleanup until records expired. The Go runtime now separates active admission from completed history. A genuine concurrency-limit error reports the active count and configured limit.
