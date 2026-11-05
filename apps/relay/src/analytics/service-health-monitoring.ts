import { applicationJson } from "../platform/application-json.js";
import { canonicalErrorCode } from "../../../../packages/protocol/src/error-codes.js";
import { getSessionUser } from "../auth/auth.js";
import {
  errorCatalog,
  failureDefinition,
  FAILURE_CATEGORIES,
  safeFailureCode,
} from "./error-catalog.js";
const json = (body: unknown, status = 200) =>
  applicationJson(body, { status, headers: { "cache-control": "private, no-store" } });
type Env = {
  DB: D1Database;
  PUBLIC_ORIGIN: string;
  ADMIN_ORIGIN?: string;
};
const domains = [
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
];
// Static, validated code literals only; never interpolate request values into SQL.
const knownCodes = errorCatalog()
  .map((item) => "'" + item.code + "'")
  .join(",");
const canonicalCode = `CASE WHEN UPPER(p.error_code) IN (${knownCodes}) THEN UPPER(p.error_code) ELSE 'REQUEST_FAILED' END`;
const attention =
  "(COALESCE(p.http_status,0)>=500 OR p.failure_category IS NULL OR p.failure_category IN ('dependency','execution','client','unknown'))";
/** Bounded operational metadata only. Account/device labels are resolved for administrators here. */
export async function handleServiceHealthMonitoring(request: Request, env: Env) {
  const url = new URL(request.url);
  if (url.origin !== new URL(env.ADMIN_ORIGIN || "https://admin.remotearc.app").origin)
    return json({ error: "not_found" }, 404);
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!user.isAdmin) return json({ error: "forbidden" }, 403);
  if (url.searchParams.get("catalog") === "1")
    return json({ catalog: errorCatalog(), categories: FAILURE_CATEGORIES, domains });
  const hours = Number(url.searchParams.get("hours") || 24),
    category = url.searchParams.get("category") || "",
    domain = url.searchParams.get("domain") || "",
    code = canonicalErrorCode(url.searchParams.get("code")) || url.searchParams.get("code") || "",
    email = (url.searchParams.get("email") || "").trim(),
    userId = url.searchParams.get("userId") || "",
    deviceId = url.searchParams.get("deviceId") || "",
    trace = url.searchParams.get("trace") || "",
    before = url.searchParams.get("before") || "",
    mode = url.searchParams.get("mode") || "";
  if (
    ![1, 24, 168].includes(hours) ||
    (category && !FAILURE_CATEGORIES.includes(category as never)) ||
    (domain && !domains.includes(domain)) ||
    (code && safeFailureCode(code) !== code) ||
    (email && (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email))) ||
    [userId, deviceId, trace].some((id) => id && !/^[A-Za-z0-9_:-]{1,180}$/.test(id)) ||
    (mode && !["attention", "expected"].includes(mode))
  )
    return json({ error: "invalid_filter" }, 400);
  if (before && !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\|[a-f0-9-]{36}$/.test(before))
    return json({ error: "invalid_cursor" }, 400);
  const at = new Date(),
    from = new Date(at.getTime() - hours * 3600000).toISOString();
  const args: unknown[] = [from, at.toISOString()];
  let where = "p.outcome='failed' AND p.occurred_at>=?1 AND p.occurred_at<=?2";
  const filter = (sql: string, value: unknown) => {
    args.push(value);
    where += " AND " + sql.replaceAll("?", "?" + args.length);
  };
  if (domain) filter("p.domain=?", domain);
  if (code) filter(`(${canonicalCode})=?`, code);
  if (email) filter("p.user_id IN (SELECT id FROM users WHERE lower(email)=lower(?))", email);
  if (userId) filter("p.user_id=?", userId);
  if (deviceId) filter("(p.device_id=? OR (p.domain='devices' AND p.entity_id=?))", deviceId);
  if (trace) filter("(p.trace_id=? OR p.journey_id=? OR p.entity_id=?)", trace);
  if (mode) where += " AND " + (mode === "attention" ? attention : "NOT " + attention);
  const facetWhere = where,
    facetArgs = [...args];
  if (category) filter("COALESCE(p.failure_category,'unknown')=?", category);
  try {
    const [summary, facets, groups] = await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(*) total,COUNT(DISTINCT p.user_id) affectedUsers,COUNT(DISTINCT COALESCE(p.device_id,CASE WHEN p.domain='devices' THEN p.entity_id END)) affectedDevices,COALESCE(SUM(CASE WHEN ${attention} THEN 1 ELSE 0 END),0) attention,COALESCE(SUM(p.source='browser'),0) browserReports,MAX(p.occurred_at) lastSeen FROM product_events p WHERE ${where}`,
      )
        .bind(...args)
        .first(),
      env.DB.prepare(
        `SELECT p.domain,COALESCE(p.failure_category,'unknown') category,COUNT(*) total FROM product_events p WHERE ${facetWhere} GROUP BY p.domain,COALESCE(p.failure_category,'unknown') ORDER BY total DESC`,
      )
        .bind(...facetArgs)
        .all(),
      env.DB.prepare(
        `SELECT p.domain,${canonicalCode} code,COALESCE(p.failure_category,'unknown') category,COUNT(*) total,COUNT(DISTINCT p.user_id) affectedUsers,COUNT(DISTINCT COALESCE(p.device_id,CASE WHEN p.domain='devices' THEN p.entity_id END)) affectedDevices,MIN(p.occurred_at) firstSeen,MAX(p.occurred_at) lastSeen,MAX(p.http_status) maxStatus FROM product_events p WHERE ${where} GROUP BY p.domain,${canonicalCode},COALESCE(p.failure_category,'unknown') ORDER BY total DESC,lastSeen DESC,p.domain,code LIMIT 201`,
      )
        .bind(...args)
        .all<{
          domain: string;
          code: string;
          category: string;
          total: number;
          lastSeen: string;
          maxStatus?: number;
        }>(),
    ]);
    const showEvents = Boolean(code || trace || userId || email || deviceId),
      pageArgs = [...args];
    let pageWhere = where;
    if (before) {
      const [time, id] = before.split("|");
      pageArgs.push(time, id);
      pageWhere += ` AND (p.occurred_at<?${pageArgs.length - 1} OR (p.occurred_at=?${pageArgs.length - 1} AND p.id<?${pageArgs.length}))`;
    }
    const rows = showEvents
      ? (
          await env.DB.prepare(
            `SELECT p.id,p.occurred_at,p.domain,p.name,p.source,p.user_id,p.trace_id,p.journey_id,p.entity_id,p.route,p.error_code,p.http_status,p.duration_ms,p.deployment,p.failure_category,p.device_id,p.app_provider,p.operation,u.name userName,u.email userEmail,d.name deviceName,d.platform devicePlatform FROM product_events p LEFT JOIN users u ON u.id=p.user_id LEFT JOIN devices d ON d.id=COALESCE(p.device_id,CASE WHEN p.domain='devices' THEN p.entity_id END) AND d.user_id=p.user_id WHERE ${pageWhere} ORDER BY p.occurred_at DESC,p.id DESC LIMIT 51`,
          )
            .bind(...pageArgs)
            .all<Record<string, any>>()
        ).results
      : [];
    const events = rows.slice(0, 50).map((row) => ({
        ...row,
        error_code: safeFailureCode(row.error_code),
        definition: failureDefinition(row.error_code, row.http_status),
      })),
      last = rows.slice(0, 50).at(-1);
    return json({
      checkedAt: at.toISOString(),
      from,
      hours,
      retentionDays: 30,
      coverage: "observed",
      summary,
      facets: facets.results,
      groups: groups.results.slice(0, 200).map((g) => ({
        ...g,
        code: safeFailureCode(g.code),
        definition: failureDefinition(g.code, g.maxStatus),
      })),
      groupsTruncated: groups.results.length > 200,
      events,
      nextCursor: rows.length > 50 && last ? last.occurred_at + "|" + last.id : null,
      showEvents,
    });
  } catch {
    return json({ error: "observability_unavailable" }, 503);
  }
}
