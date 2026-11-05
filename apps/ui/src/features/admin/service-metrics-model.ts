import type { ServiceMetrics } from "@remotearc/protocol";

const countKeys = [
  "requests",
  "serverErrors",
  "clientErrors",
  "slowRequests",
  "failures",
  "attention",
] as const;
const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
export function validServiceMetrics(value: unknown): value is ServiceMetrics {
  if (!value || typeof value !== "object") return false;
  const data = value as ServiceMetrics;
  const counts = (row: object) =>
    countKeys.every(
      (key) =>
        typeof (row as Record<string, unknown>)[key] === "number" &&
        Number.isFinite((row as Record<string, number>)[key]) &&
        (row as Record<string, number>)[key]! >= 0,
    );
  const latency = (row: { p50Ms: number | null; p95Ms: number | null }) =>
    [row.p50Ms, row.p95Ms].every(
      (n) => n === null || (typeof n === "number" && Number.isFinite(n) && n >= 0),
    );
  return (
    ["recorded_events", "recorded_business_errors"].includes(data.coverage) &&
    [1, 24, 168].includes(data.hours) &&
    date(data.from) &&
    date(data.checkedAt) &&
    typeof data.domain === "string" &&
    !!data.totals &&
    counts(data.totals) &&
    latency(data.totals) &&
    Array.isArray(data.modules) &&
    data.modules.length > 0 &&
    data.modules.length <= 13 &&
    data.modules.every(
      (module) =>
        !!module &&
        typeof module.domain === "string" &&
        [module.failures, module.attention].every((n) => Number.isInteger(n) && n >= 0) &&
        module.attention <= module.failures,
    ) &&
    Array.isArray(data.points) &&
    data.points.length > 0 &&
    data.points.length <= 100 &&
    data.points.every(
      (point) =>
        !!point &&
        date(point.at) &&
        counts(point) &&
        latency(point) &&
        Number.isFinite(point.affectedUsers) &&
        point.affectedUsers >= 0 &&
        Number.isFinite(point.affectedDevices) &&
        point.affectedDevices >= 0,
    )
  );
}

/** Only used by the explicitly labelled design preview, never as a failure fallback. */
export function sampleServiceMetrics(
  hours: number,
  domain: string,
  business = false,
): ServiceMetrics {
  const now = Date.now(),
    seconds = hours === 1 ? 60 : hours === 24 ? 1800 : 10800;
  const count = Math.round((hours * 3600) / seconds);
  const points = Array.from({ length: count }, (_, index) => {
    const requests = 20 + Math.round(18 * (1 + Math.sin(index / 4)));
    const errors = index % 13 === 0 ? 4 : index % 5 === 0 ? 1 : 0;
    return {
      at: new Date(now - (count - index) * seconds * 1000).toISOString(),
      requests,
      serverErrors: errors,
      clientErrors: index % 3,
      slowRequests: errors,
      failures: errors + (index % 4),
      attention: errors,
      affectedUsers: errors ? 2 : 0,
      affectedDevices: errors ? 1 : 0,
      p50Ms: 120 + (index % 7) * 12,
      p95Ms: errors ? 1400 : 340 + (index % 9) * 24,
    };
  });
  const sum = (key: (typeof countKeys)[number]) => points.reduce((n, point) => n + point[key], 0);
  return {
    checkedAt: new Date(now).toISOString(),
    from: points[0]!.at,
    hours,
    domain,
    bucketSeconds: seconds,
    coverage: business ? "recorded_business_errors" : "recorded_events",
    modules: (domain ? [domain] : ["mcp", "apps", "devices", "tasks", "billing"]).map(
      (module, index) => ({
        domain: module,
        failures: domain
          ? sum("failures")
          : Math.floor(sum("failures") / 5) + (index < sum("failures") % 5 ? 1 : 0),
        attention: domain
          ? sum("attention")
          : Math.floor(sum("attention") / 5) + (index < sum("attention") % 5 ? 1 : 0),
      }),
    ),
    points,
    totals: {
      requests: sum("requests"),
      serverErrors: sum("serverErrors"),
      clientErrors: sum("clientErrors"),
      slowRequests: sum("slowRequests"),
      failures: sum("failures"),
      attention: sum("attention"),
      p50Ms: 156,
      p95Ms: 1400,
    },
  };
}

export const durationLabel = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : value >= 1000
      ? (value / 1000).toFixed(2) + " s"
      : Math.round(value) + " ms";
