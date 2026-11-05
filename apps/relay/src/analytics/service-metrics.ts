import type { ServiceMetrics, ServiceMetricsPoint } from "@remotearc/protocol";
import { getSessionUser } from "../auth/auth.js";
import { applicationJson } from "../platform/application-json.js";

export const METRIC_DOMAINS = [
  "billing",
  "auth",
  "oauth",
  "devices",
  "apps",
  "tasks",
  "automations",
  "client",
  "mcp",
  "admin",
  "platform",
  "notifications",
] as const;
type Env = {
  DB: D1Database;
  PUBLIC_ORIGIN: string;
  ADMIN_ORIGIN?: string;
  ADMIN_METRICS_TOKEN?: string;
};
type Row = Record<string, number | null>;
const bucketSizes: Record<number, number> = { 1: 60, 24: 1800, 168: 10800 };

/** Existing observations are partial: never present these as total Worker traffic
 * or calculate a success/error rate from the biased observation sample. */
export async function serviceMetrics(
  db: D1Database,
  hours: number,
  domain = "",
  now = new Date(),
): Promise<ServiceMetrics> {
  const seconds = bucketSizes[hours];
  if (!seconds || (domain && !METRIC_DOMAINS.includes(domain as never)))
    throw Error("INVALID_FILTER");
  const checkedAt = now.toISOString();
  const start = now.getTime() - hours * 3600000;
  const from = new Date(start).toISOString();
  const scope = domain ? " AND domain=?4" : "";
  const args: (string | number)[] = [from, checkedAt, seconds];
  if (domain) args.push(domain);
  const bucket = "CAST(unixepoch(occurred_at)/?3 AS INTEGER)*?3";
  const [failures, requests] = await Promise.all([
    db
      .prepare(
        `SELECT ${bucket} bucket,COUNT(*) failures,
      SUM(CASE WHEN COALESCE(http_status,0)>=500 OR failure_category IS NULL OR failure_category IN ('dependency','execution','client','unknown') THEN 1 ELSE 0 END) attention,
      COUNT(DISTINCT user_id) affectedUsers,
      COUNT(DISTINCT COALESCE(device_id,CASE WHEN domain='devices' THEN entity_id END)) affectedDevices
      FROM product_events WHERE outcome='failed' AND occurred_at>=?1 AND occurred_at<?2${scope}
      GROUP BY bucket ORDER BY bucket`,
      )
      .bind(...args)
      .all<Row>(),
    db
      .prepare(
        `WITH histogram AS MATERIALIZED (
      SELECT ${bucket} bucket,duration_ms,COUNT(*) samples,
        SUM(http_status>=500) serverErrors,
        SUM(http_status>=400 AND http_status<500) clientErrors,
        SUM(duration_ms>=1000) slowRequests
      FROM product_events WHERE source='server' AND route IS NOT NULL
        AND http_status IS NOT NULL AND duration_ms IS NOT NULL
        AND occurred_at>=?1 AND occurred_at<?2${scope}
      GROUP BY bucket,duration_ms
    ), ranked AS (
      SELECT *,SUM(samples) OVER(PARTITION BY bucket) population,
        SUM(samples) OVER(PARTITION BY bucket ORDER BY duration_ms ROWS UNBOUNDED PRECEDING) position
      FROM histogram
    ), durations AS (
      SELECT duration_ms,SUM(samples) samples FROM histogram GROUP BY duration_ms
    ), overall AS (
      SELECT duration_ms,SUM(samples) OVER() population,
        SUM(samples) OVER(ORDER BY duration_ms ROWS UNBOUNDED PRECEDING) position
      FROM durations
    ) SELECT bucket,SUM(samples) requests,SUM(serverErrors) serverErrors,
        SUM(clientErrors) clientErrors,SUM(slowRequests) slowRequests,
        MIN(CASE WHEN position>=CAST((population+1)/2 AS INTEGER) THEN duration_ms END) p50Ms,
        MIN(CASE WHEN position>=CAST((population*95+99)/100 AS INTEGER) THEN duration_ms END) p95Ms,
        NULL totalP50,NULL totalP95
      FROM ranked GROUP BY bucket
      UNION ALL SELECT -1,0,0,0,0,NULL,NULL,
        MIN(CASE WHEN position>=CAST((population+1)/2 AS INTEGER) THEN duration_ms END),
        MIN(CASE WHEN position>=CAST((population*95+99)/100 AS INTEGER) THEN duration_ms END)
      FROM overall`,
      )
      .bind(...args)
      .all<Row>(),
  ]);
  const byBucket = new Map<number, Record<string, number | null>>();
  for (const row of [...failures.results, ...requests.results])
    byBucket.set(Number(row.bucket), { ...byBucket.get(Number(row.bucket)), ...row });
  const points: ServiceMetricsPoint[] = [];
  for (
    let at = Math.floor(start / (seconds * 1000)) * seconds * 1000;
    at < now.getTime();
    at += seconds * 1000
  ) {
    const row = byBucket.get(at / 1000);
    points.push({
      at: new Date(Math.max(start, at)).toISOString(),
      requests: Number(row?.requests || 0),
      serverErrors: Number(row?.serverErrors || 0),
      clientErrors: Number(row?.clientErrors || 0),
      slowRequests: Number(row?.slowRequests || 0),
      failures: Number(row?.failures || 0),
      attention: Number(row?.attention || 0),
      affectedUsers: Number(row?.affectedUsers || 0),
      affectedDevices: Number(row?.affectedDevices || 0),
      p50Ms: row?.p50Ms ?? null,
      p95Ms: row?.p95Ms ?? null,
    });
  }
  // Weighted order statistics over exact-duration counts preserve ties and the
  // global distribution. The sentinel row is not a chart bucket. Grouping first
  // avoids sorting every raw request through multiple window functions.
  const quantile = (key: string) => {
    const value = requests.results.find((row) => row[key] !== null)?.[key];
    return value === undefined ? null : Number(value);
  };
  const total = (
    key: "requests" | "serverErrors" | "clientErrors" | "slowRequests" | "failures" | "attention",
  ) => points.reduce((sum, point) => sum + point[key], 0);
  return {
    checkedAt,
    from,
    hours,
    domain,
    bucketSeconds: seconds,
    coverage: "recorded_events",
    totals: {
      requests: total("requests"),
      serverErrors: total("serverErrors"),
      clientErrors: total("clientErrors"),
      slowRequests: total("slowRequests"),
      failures: total("failures"),
      attention: total("attention"),
      p50Ms: quantile("totalP50"),
      p95Ms: quantile("totalP95"),
    },
    points,
  };
}

export function prometheusMetrics(data: ServiceMetrics): string {
  const labels = `window="${data.hours}h",domain="${data.domain || "all"}"`;
  const definitions: [string, string, number | null][] = [
    [
      "observed_requests",
      "HTTP request observations in the rolling window; not complete Worker traffic.",
      data.totals.requests,
    ],
    [
      "observed_server_errors",
      "HTTP 5xx observations in the rolling window.",
      data.totals.serverErrors,
    ],
    [
      "observed_client_errors",
      "HTTP 4xx observations in the rolling window.",
      data.totals.clientErrors,
    ],
    [
      "observed_failures",
      "Recorded failed business events in the rolling window; events are not unique incidents.",
      data.totals.failures,
    ],
    [
      "observed_slow_requests",
      "Observed HTTP requests lasting at least one second in the rolling window.",
      data.totals.slowRequests,
    ],
    [
      "observed_duration_p50_seconds",
      "Median duration of observed requests, in seconds; NaN when absent.",
      data.totals.p50Ms === null ? null : data.totals.p50Ms / 1000,
    ],
    [
      "observed_duration_p95_seconds",
      "P95 duration of observed requests, in seconds; NaN when absent.",
      data.totals.p95Ms === null ? null : data.totals.p95Ms / 1000,
    ],
    [
      "metrics_snapshot_timestamp_seconds",
      "Time this aggregate snapshot was read.",
      Date.parse(data.checkedAt) / 1000,
    ],
  ];
  return definitions
    .map(
      ([suffix, help, value]) =>
        `# HELP remote_arc_${suffix} ${help}\n# TYPE remote_arc_${suffix} gauge\nremote_arc_${suffix}{${labels}} ${value === null ? "NaN" : value}\n`,
    )
    .join("");
}

async function validExporterToken(request: Request, expected?: string) {
  if (!expected || expected.length < 32 || expected.length > 256) return false;
  const supplied = request.headers.get("authorization")?.match(/^Bearer (.{32,256})$/)?.[1];
  if (!supplied) return false;
  const encoder = new TextEncoder();
  const digest = (value: string) => crypto.subtle.digest("SHA-256", encoder.encode(value));
  const [a, b] = await Promise.all([digest(expected), digest(supplied)]);
  const left = new Uint8Array(a),
    right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i]! ^ right[i]!;
  return difference === 0;
}

export async function handleServiceMetrics(request: Request, env: Env) {
  const url = new URL(request.url);
  const json = (body: unknown, status: number) =>
    applicationJson(body, { status, headers: { "cache-control": "private, no-store" } });
  if (url.origin !== new URL(env.ADMIN_ORIGIN || "https://admin.remotearc.app").origin)
    return json({ error: "NOT_FOUND" }, 404);
  if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const format = url.searchParams.get("format") || "json";
  if (!(format === "prometheus" && (await validExporterToken(request, env.ADMIN_METRICS_TOKEN)))) {
    const user = await getSessionUser(request, env);
    if (!user) return json({ error: "UNAUTHORIZED" }, 401);
    if (!user.isAdmin) return json({ error: "FORBIDDEN" }, 403);
  }
  const hours = Number(url.searchParams.get("hours") || "24"),
    domain = url.searchParams.get("domain") || "";
  if (
    !bucketSizes[hours] ||
    (domain && !METRIC_DOMAINS.includes(domain as never)) ||
    !["json", "prometheus"].includes(format)
  )
    return json({ error: "INVALID_FILTER" }, 400);
  try {
    const data = await serviceMetrics(env.DB, hours, domain);
    return format === "prometheus"
      ? new Response(prometheusMetrics(data), {
          headers: {
            "content-type": "text/plain; version=0.0.4; charset=utf-8",
            "cache-control": "private, no-store",
          },
        })
      : json(data, 200);
  } catch {
    return json({ error: "METRICS_UNAVAILABLE" }, 503);
  }
}
