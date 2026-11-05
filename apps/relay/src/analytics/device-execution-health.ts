type Env = { DB: D1Database };
type Counts = {
  calls: number;
  successfulCalls: number;
  timeouts: number;
  offlineCalls: number;
  staleSignals: number;
  keepAwakeFailures: number;
  affectedDevices: number;
};
type DeviceIssue = {
  deviceId: string;
  name: string;
  platform: string;
  timeouts: number;
  offlineCalls: number;
  staleSignals: number;
  keepAwakeFailures: number;
  lastFailureAt: string;
  lastSuccessfulCallAt: string | null;
};
export type DeviceExecutionHealth = Counts & {
  coverage: "observed" | "no_samples" | "unavailable";
  status: "operational" | "degraded" | "unknown";
  windowMinutes: 15;
  devices: DeviceIssue[];
  truncated: boolean;
};
const empty: Counts = {
  calls: 0,
  successfulCalls: 0,
  timeouts: 0,
  offlineCalls: 0,
  staleSignals: 0,
  keepAwakeFailures: 0,
  affectedDevices: 0,
};

/** Real dispatch metadata, including MCP errors inside HTTP 200. No device
 * probes, private arguments, results or automatic replay. Historical generic
 * failures cannot be retroactively classified as timeouts. */
export async function readDeviceExecutionHealth(
  env: Env,
  now = Date.now(),
): Promise<DeviceExecutionHealth> {
  const since = new Date(now - 15 * 60000).toISOString(),
    until = new Date(now).toISOString();
  const recent = `SELECT p.*,d.name device_name,d.platform FROM product_events p
    JOIN devices d ON d.id=p.entity_id AND d.user_id=p.user_id AND d.revoked_at IS NULL
    WHERE p.source='server' AND p.domain='devices' AND p.occurred_at>=?1 AND p.occurred_at<=?2
      AND p.name IN ('device.tool.completed','device.presence.stale','device.keep_awake.failed')`;
  const issue =
    "error_code IN ('DEVICE_TIMEOUT','DEVICE_OFFLINE','DEVICE_SIGNAL_STALE','DEVICE_KEEP_AWAKE_FAILED')";
  try {
    const [summary, devices] = await Promise.all([
      env.DB.prepare(
        `WITH recent AS (${recent}) SELECT
        COALESCE(SUM(name='device.tool.completed'),0) calls,
        COALESCE(SUM(name='device.tool.completed' AND outcome='succeeded'),0) successfulCalls,
        COALESCE(SUM(error_code='DEVICE_TIMEOUT'),0) timeouts,
        COALESCE(SUM(error_code='DEVICE_OFFLINE'),0) offlineCalls,
        COALESCE(SUM(name='device.presence.stale'),0) staleSignals,
        COALESCE(SUM(error_code='DEVICE_KEEP_AWAKE_FAILED'),0) keepAwakeFailures,
        COUNT(DISTINCT CASE WHEN ${issue} THEN entity_id END) affectedDevices FROM recent`,
      )
        .bind(since, until)
        .first<Counts>(),
      env.DB.prepare(
        `WITH recent AS (${recent}) SELECT entity_id deviceId,device_name name,platform,
        COALESCE(SUM(error_code='DEVICE_TIMEOUT'),0) timeouts,
        COALESCE(SUM(error_code='DEVICE_OFFLINE'),0) offlineCalls,
        COALESCE(SUM(name='device.presence.stale'),0) staleSignals,
        COALESCE(SUM(error_code='DEVICE_KEEP_AWAKE_FAILED'),0) keepAwakeFailures,
        MAX(CASE WHEN ${issue} THEN occurred_at END) lastFailureAt,
        MAX(CASE WHEN name='device.tool.completed' AND outcome='succeeded' THEN occurred_at END) lastSuccessfulCallAt
        FROM recent GROUP BY entity_id,device_name,platform HAVING MAX(CASE WHEN ${issue} THEN occurred_at END) IS NOT NULL
        ORDER BY lastFailureAt DESC,entity_id LIMIT 21`,
      )
        .bind(since, until)
        .all<DeviceIssue>(),
    ]);
    const counts = summary || empty,
      observed = counts.calls + counts.staleSignals + counts.keepAwakeFailures > 0;
    return {
      ...counts,
      coverage: observed ? "observed" : "no_samples",
      status: counts.affectedDevices > 0 ? "degraded" : observed ? "operational" : "unknown",
      windowMinutes: 15,
      devices: devices.results.slice(0, 20),
      truncated: devices.results.length > 20,
    };
  } catch {
    return {
      ...empty,
      coverage: "unavailable",
      status: "unknown",
      windowMinutes: 15,
      devices: [],
      truncated: false,
    };
  }
}
