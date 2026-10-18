import { getDevicesForUser } from "./device.js";
import { taskPermissionError } from "./device-task-policy.js";

export type FleetRequirements = {
  requiredTools: string[];
  workspace?: string;
  workspaces?: string[];
  platform?: "win32" | "darwin" | "linux";
  automation?: boolean;
  kind?: string;
  controller?: "source" | "hosted";
  scheduled?: boolean;
  keepAwake?: boolean;
  minimumAvailableMemoryMB?: number;
};
type Device = Awaited<ReturnType<typeof getDevicesForUser>>[number];
export type FleetLoad = { running: number; recent_calls: number };
export type FleetCandidate = { device: Device; running: number; recent_calls: number; score: number };
export type FleetSelection = { device_id: string; device_name: string; platform: string; running: number; eligible_count: number };

function insideRoot(path: string, root: string, platform: string): boolean {
  // Never normalize a traversal into a different trust root during routing.
  if (path.split(/[\\/]/).includes("..")) return false;
  const windows = platform === "win32";
  const normalize = (text: string) => {
    const value = windows ? text.replace(/\\/g, "/").toLowerCase() : text;
    return value.replace(/\/+$/, "") || "/";
  };
  const location = normalize(path);
  const base = normalize(root);
  return location === base || location.startsWith(base === "/" ? "/" : base + "/");
}

/** Hard requirements are checked BEFORE any balancing preference. No permission escalation. */
export function rankFleetDevices(
  devices: readonly Device[],
  activeByDevice: ReadonlyMap<string, FleetLoad | number>,
  requirements: FleetRequirements,
): FleetCandidate[] {
  const hostKey = (device: Device) => {
    const host = device.hostname?.trim().toLowerCase();
    return host && host !== "localhost" && host !== "chrome-extension"
      ? "host:" + host : "device:" + device.id;
  };
  // Windows and WSL on the same computer share CPU/RAM: never count them as
  // independent idle capacity merely because their agent IDs differ.
  const hostLoads = new Map<string, FleetLoad>();
  for (const device of devices) {
    const own = activeByDevice.get(device.id);
    const key = hostKey(device);
    const previous = hostLoads.get(key) || { running: 0, recent_calls: 0 };
    hostLoads.set(key, {
      running: previous.running + Math.max(0, typeof own === "number" ? own : own?.running ?? 0),
      recent_calls: previous.recent_calls + Math.max(0, typeof own === "number" ? 0 : own?.recent_calls ?? 0),
    });
  }
  // Resolve host-level resource pressure without double-counting Windows/WSL.
  const hostPressure = new Map<string, { cpu: number; availableRatio: number; availableMB: number }>();
  for (const device of devices) {
    const sample = device.capacity;
    if (!sample || !Number.isFinite(Date.parse(sample.observedAt)) ||
        Math.abs(Date.now() - Date.parse(sample.observedAt)) > 120_000) continue;
    const key = hostKey(device);
    const prior = hostPressure.get(key);
    const pressure = { cpu: sample.cpuPercent ?? 0,
      availableRatio: sample.memoryTotalMB > 0 ? sample.memoryAvailableMB / sample.memoryTotalMB : 1,
      availableMB: sample.memoryAvailableMB };
    hostPressure.set(key, prior ? { cpu: Math.max(prior.cpu, pressure.cpu),
      availableRatio: Math.min(prior.availableRatio, pressure.availableRatio),
      availableMB: Math.min(prior.availableMB, pressure.availableMB) } : pressure);
  }
  const tools = new Set(requirements.requiredTools);
  if (tools.has("start_process")) {
    tools.add("process_status");
    tools.add("process_output");
    tools.add("stop_process");
  }
  return devices.flatMap((device) => {
    if (device.status !== "online" || device.execution_paused) return [];
    if (requirements.platform && device.platform !== requirements.platform) return [];
    if ([...tools].some((tool) => !device.tools.includes(tool))) return [];
    const paths = [...(requirements.workspace ? [requirements.workspace] : []), ...(requirements.workspaces || [])];
    if (paths.some((path) => !device.workspace_roots.some((root) => insideRoot(path, root, device.platform)))) return [];
    if (tools.has("start_process") && !device.workspace_roots.length) return [];
    if (requirements.keepAwake && !device.keep_awake_available) return [];
    if (requirements.automation) {
      const perms = device.automation_permissions;
      const error = taskPermissionError(
        perms,
        requirements.kind || "long_task",
        requirements.kind === "agent_goal"
          ? { type: "agent_goal", controller: requirements.controller }
          : null,
        requirements.scheduled ? { type: "interval" } : { type: "immediate" },
        requirements.keepAwake,
      );
      if (error) return [];
    }
    const active = hostLoads.get(hostKey(device));
    const running = active?.running ?? 0;
    const recent_calls = active?.recent_calls ?? 0;
    const pressure = hostPressure.get(hostKey(device));
    if (requirements.minimumAvailableMemoryMB !== undefined &&
        (!pressure || pressure.availableMB < requirements.minimumAvailableMemoryMB)) return [];
    const connectedForMs = Date.now() - Date.parse(device.connected_at || "");
    const stabilityPenalty = !Number.isFinite(connectedForMs) || connectedForMs < 120_000 ? 25
      : connectedForMs < 600_000 ? 10 : 0;
    const cpuPenalty = pressure ? Math.round(Math.pow(pressure.cpu / 100, 2) * 55) : 10;
    const memoryPenalty = pressure && pressure.availableRatio < 0.15
      ? 45 : pressure && pressure.availableRatio < 0.30 ? 18 : 0;
    // Recent account activity catches interactive agent work not represented by automations.
    // Reserve Mac capacity for Mac-only work if an equally idle PC is eligible.
    const score = running * 100 + Math.min(recent_calls, 10) * 10 +
      stabilityPenalty + cpuPenalty + memoryPenalty +
      (device.platform === "darwin" && !requirements.platform ? 1 : 0);
    return [{ device, running, recent_calls, score }];
  }).sort((a, b) =>
    a.score - b.score ||
    a.device.id.localeCompare(b.device.id)
  );
}

/** Account-scoped dispatch. Reuses device enrollment, tool policy, and task authorizations. */
export async function selectFleetDevice(
  env: Parameters<typeof getDevicesForUser>[0],
  userId: string,
  requirements: FleetRequirements,
): Promise<FleetSelection> {
  const devices = await getDevicesForUser(env, userId);
  const recentCutoff = new Date(Date.now() - 180_000).toISOString();
  const active = await env.DB.prepare(`SELECT device_id, SUM(running) AS running,
      SUM(recent_calls) AS recent_calls FROM (
        SELECT device_id, COUNT(*) AS running, 0 AS recent_calls FROM automations
          WHERE user_id=?1 AND status='running' AND device_id IS NOT NULL GROUP BY device_id
        UNION ALL
        SELECT device_id, 0 AS running, COUNT(*) AS recent_calls FROM audit_events
          WHERE user_id=?1 AND created_at>=?2 AND success=1 AND device_id IS NOT NULL
            AND event_type='mcp.tool_call'
            AND tool_name IN ('start_process','process_status','read_file','write_file','edit_block','list_directory')
          GROUP BY device_id
      ) GROUP BY device_id`).bind(userId, recentCutoff).all<{ device_id: string; running: number; recent_calls: number }>();
  const usage = new Map((active.results || []).map((row) => [row.device_id,
    { running: row.running, recent_calls: row.recent_calls }]));
  const candidates = rankFleetDevices(devices, usage, requirements);
  if (!candidates.length) {
    throw new Error("No online Fleet device satisfies the required tools, device permissions, platform, and workspace. No fallback to an unauthorized device.");
  }
  const best = candidates[0]!;
  return {
    device_id: best.device.id,
    device_name: best.device.name,
    platform: best.device.platform,
    running: best.running,
    eligible_count: candidates.length,
  };
}
