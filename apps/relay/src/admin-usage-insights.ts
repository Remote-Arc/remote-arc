import { getSessionUser } from "./auth.js";

/** Admin-only, metadata-only diagnosis. Charged calls and audited device dispatches
 * are separate populations: neither is a task-completion or retry metric. */
export async function handleAdminUsageInsights(request: Request, env: { DB: D1Database; PUBLIC_ORIGIN: string }) {
  const session = await getSessionUser(request, env);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: "forbidden" }, { status: 403 });
  if (request.method !== "GET") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const userId = new URL(request.url).searchParams.get("userId") || "";
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(userId)) return Response.json({ error: "invalid_user_id" }, { status: 400 });
  const account = await env.DB.prepare("SELECT id FROM users WHERE id=?1 LIMIT 1").bind(userId).first();
  if (!account) return Response.json({ error: "user_not_found" }, { status: 404 });
  const month = new Date().toISOString().slice(0, 7);
  const from = month + "-01T00:00:00.000Z";
  const until = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString();
  const [charged, summary, daily, tools, outcomes] = await Promise.all([
    env.DB.prepare("SELECT tool_calls AS total FROM user_monthly_usage WHERE user_id=?1 AND month_key=?2").bind(userId, month).first<{total:number}>(),
    env.DB.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN success=1 THEN 1 ELSE 0 END),0) AS succeeded,
      COALESCE(SUM(CASE WHEN success=0 THEN 1 ELSE 0 END),0) AS failed
      FROM audit_events WHERE user_id=?1 AND event_type='mcp.tool_call' AND created_at>=?2 AND created_at<?3`)
      .bind(userId, from, until).first<{total:number;succeeded:number;failed:number}>(),
    env.DB.prepare(`SELECT substr(created_at,1,10) AS day, COUNT(*) AS calls,
      SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) AS failures
      FROM audit_events WHERE user_id=?1 AND event_type='mcp.tool_call' AND created_at>=?2 AND created_at<?3
      GROUP BY substr(created_at,1,10) ORDER BY day`)
      .bind(userId, from, until).all<{day:string;calls:number;failures:number}>(),
    env.DB.prepare(`SELECT COALESCE(tool_name,'unknown') AS tool, COUNT(*) AS calls,
      SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) AS failures
      FROM audit_events WHERE user_id=?1 AND event_type='mcp.tool_call' AND created_at>=?2 AND created_at<?3
      GROUP BY tool_name ORDER BY calls DESC, tool ASC LIMIT 12`)
      .bind(userId, from, until).all<{tool:string;calls:number;failures:number}>(),
    env.DB.prepare(`SELECT COALESCE(outcome,'unspecified') AS outcome, COUNT(*) AS calls
      FROM audit_events WHERE user_id=?1 AND event_type='mcp.tool_call' AND created_at>=?2 AND created_at<?3
      GROUP BY outcome ORDER BY calls DESC LIMIT 8`)
      .bind(userId, from, until).all<{outcome:string;calls:number}>(),
  ]);
  return Response.json({
    userId, month, timeZone: "UTC", chargedCalls: charged?.total ?? 0,
    audited: { total: summary?.total ?? 0, succeeded: summary?.succeeded ?? 0, failed: summary?.failed ?? 0 },
    daily: daily.results ?? [], tools: tools.results ?? [], outcomes: outcomes.results ?? [],
    scope: "Audited device dispatches only; charged calls may include Apps, Arc and other MCP requests.",
    taskSuccessAvailable: false, retriesAvailable: false,
  }, { headers: { "cache-control": "private, no-store" } });
}
