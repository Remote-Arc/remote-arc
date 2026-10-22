import { getSessionUser } from "./auth.js";
import { summarizeCloudflareBillableUsage } from "./cloudflare-billing.js";

export type OpsEnv = {
  DB: D1Database;
  REGISTRY: DurableObjectNamespace;
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
  MARKETING_ORIGIN?: string;
  MONTHLY_TOOL_CALL_LIMIT?: string;
  FREE_MONTHLY_TOOL_CALL_LIMIT?: string;
  CF_BILLING_READ_TOKEN?: string;
  CF_BILLING_ACCOUNT_ID?: string;
};

type OpsUser = {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  role: string;
  plan: string;
  used: number;
  extra: number;
  device_count: number;
  computer_count: number;
  last_activity: string | null;
  has_plus_grant: number;
  linked_login: "google" | "email_only";
  first_mcp_client: string | null;
};
type OpsDevice = {
  id: string; user_id: string; name: string; platform: string; arch: string | null;
  last_seen: string | null; created_at: string;
};
type LiveDevice = { id: string; status: string; agentVersion?: string | null; background_agent_version?: string | null; recovery_bundle_version?: string | null };
const month = () => new Date().toISOString().slice(0, 7);
const jsonError = (error: string, status: number) => Response.json({ error }, { status });
const safeLimit = (raw: string | undefined) => {
  const n = Number(raw ?? "10000");
  return Number.isSafeInteger(n) && n > 0 ? n : 10000;
};

async function requireAdmin(request: Request, env: OpsEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return { error: jsonError("unauthorized", 401) };
  if (!user.isAdmin) return { error: jsonError("forbidden", 403) };
  return { user };
}

export async function handleAdminOperations(request: Request, env: OpsEnv) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  if (request.method !== "GET") return jsonError("method_not_allowed", 405);
  const url = new URL(request.url);
  const page = Math.min(100, Math.max(0, Number(url.searchParams.get("page") || 0) | 0));
  const pageSize = 30;
  const utcMonth = month();
  const from = new Date(Date.now() - 7 * 86400_000).toISOString();
  let creditsReady = true;
  const [userRows, deviceRows, chartRows, totalUsers, totalDevices, auditSummary, totalMonthlyCalls, teamCount, teamMembers] = await Promise.all([
    env.DB.prepare(`SELECT u.id, u.email, u.name, u.created_at, u.role, u.plan,
      CASE WHEN u.google_sub LIKE 'email:%' THEN 'email_only' ELSE 'google' END AS linked_login,
      (SELECT COALESCE(NULLIF(c.client_name,''), 'MCP client')
         FROM oauth_tokens t LEFT JOIN oauth_clients c ON c.client_id=t.client_id
         WHERE t.user_id=u.id ORDER BY t.created_at ASC LIMIT 1) AS first_mcp_client,
      COALESCE(um.tool_calls, 0) AS used,
      COALESCE((SELECT SUM(extra_calls) FROM user_call_credit_grants c
        WHERE c.user_id=u.id AND c.month_key=?1), 0) AS extra,
      (SELECT COUNT(*) FROM devices d WHERE d.user_id=u.id AND d.revoked_at IS NULL) AS device_count,
      (SELECT COUNT(*) FROM devices d WHERE d.user_id=u.id AND d.revoked_at IS NULL AND d.platform<>'browser') AS computer_count,
      (SELECT MAX(created_at) FROM audit_events a WHERE a.user_id=u.id) AS last_activity,
      EXISTS(SELECT 1 FROM plan_grants g WHERE g.user_id=u.id AND g.plan='plus'
        AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > ?2)) AS has_plus_grant
      FROM users u LEFT JOIN user_monthly_usage um ON um.user_id=u.id AND um.month_key=?1
      ORDER BY u.created_at DESC LIMIT ?3 OFFSET ?4`).bind(utcMonth, new Date().toISOString(), pageSize, page * pageSize).all<OpsUser>().catch(async error => {
        if (!/no such table:\s*user_call_credit_grants/i.test(String(error))) throw error;
        creditsReady = false;
        return env.DB.prepare(`SELECT u.id, u.email, u.name, u.created_at, u.role, u.plan,
          CASE WHEN u.google_sub LIKE 'email:%' THEN 'email_only' ELSE 'google' END AS linked_login,
          (SELECT COALESCE(NULLIF(c.client_name,''), 'MCP client')
            FROM oauth_tokens t LEFT JOIN oauth_clients c ON c.client_id=t.client_id
            WHERE t.user_id=u.id ORDER BY t.created_at ASC LIMIT 1) AS first_mcp_client,
          COALESCE(um.tool_calls,0) AS used, 0 AS extra,
          (SELECT COUNT(*) FROM devices d WHERE d.user_id=u.id AND d.revoked_at IS NULL) AS device_count,
      (SELECT COUNT(*) FROM devices d WHERE d.user_id=u.id AND d.revoked_at IS NULL AND d.platform<>'browser') AS computer_count,
          (SELECT MAX(created_at) FROM audit_events a WHERE a.user_id=u.id) AS last_activity,
          EXISTS(SELECT 1 FROM plan_grants g WHERE g.user_id=u.id AND g.plan='plus'
            AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > ?2)) AS has_plus_grant
          FROM users u LEFT JOIN user_monthly_usage um ON um.user_id=u.id AND um.month_key=?1
          ORDER BY u.created_at DESC LIMIT ?3 OFFSET ?4`)
          .bind(utcMonth, new Date().toISOString(), pageSize, page * pageSize).all<OpsUser>();
      }),
    env.DB.prepare(`SELECT d.id, d.user_id, d.name, d.platform, d.arch, d.last_seen, d.created_at
      FROM devices d WHERE d.revoked_at IS NULL
      ORDER BY COALESCE(d.last_seen,d.created_at) DESC LIMIT 200`).all<OpsDevice>(),
    env.DB.prepare(`SELECT substr(created_at,1,13) AS hour, COUNT(*) AS calls,
      COUNT(DISTINCT user_id) AS users
      FROM audit_events WHERE created_at>=?1 AND event_type='mcp.tool_call'
      GROUP BY substr(created_at,1,13) ORDER BY hour`).bind(from).all<{hour:string;calls:number;users:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM users").first<{total:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM devices WHERE revoked_at IS NULL").first<{total:number}>(),
    env.DB.prepare(`SELECT COUNT(*) AS count,
      SUM(CASE WHEN created_at>=?1 THEN 1 ELSE 0 END) AS last7d
      FROM audit_events`).bind(from).first<{count:number;last7d:number}>(),
    env.DB.prepare("SELECT COALESCE(SUM(tool_calls),0) AS calls FROM user_monthly_usage WHERE month_key=?1")
      .bind(utcMonth).first<{calls:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM organizations WHERE kind='team'").first<{total:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM organization_members m JOIN organizations o ON o.id=m.organization_id WHERE o.kind='team' AND m.status='active'").first<{total:number}>(),
  ]);
  const users = userRows.results || [];
  const devices = deviceRows.results || [];
  const byUser = new Map<string, Map<string, LiveDevice>>();
  // Real-time online is queried from the same per-user DO registry used by Devices,
  // not guessed from last_seen. Cap per-refresh DO fan-out.
  await Promise.all([...new Set(devices.map(d => d.user_id))].slice(0, 60).map(async userId => {
    try {
      const response = await env.REGISTRY.getByName("user:" + userId).fetch(
        new Request("https://registry/devices", {
          headers: { "x-remote-link-user-id": userId },
        }),
      );
      if (!response.ok) return;
      const rows = await response.json() as LiveDevice[];
      byUser.set(userId, new Map(rows.filter(row => row.status === "online").map(row => [row.id, row])));
    } catch { /* unknown is not online */ }
  }));
  const extended = devices.map(d => {
    const live = byUser.get(d.user_id)?.get(d.id);
    return {
      ...d,
      online: Boolean(live),
      statusVerified: byUser.has(d.user_id),
      agent_version: live?.agentVersion || null,
      background_agent_version: live?.background_agent_version || null,
      recovery_bundle_version: live?.recovery_bundle_version || null,
    };
  });
  const base = safeLimit(env.MONTHLY_TOOL_CALL_LIMIT);
  const freeBase = env.FREE_MONTHLY_TOOL_CALL_LIMIT === undefined ? base : safeLimit(env.FREE_MONTHLY_TOOL_CALL_LIMIT);
  return Response.json({
    checkedAt: new Date().toISOString(), month: utcMonth, page, pageSize, creditsReady,
    totals: { users: totalUsers?.total || 0, devices: totalDevices?.total || 0,
      online: extended.filter(x => x.online).length, auditRows: auditSummary?.count || 0,
      auditLast7d: auditSummary?.last7d || 0, monthlyCalls: totalMonthlyCalls?.calls || 0,
      teams: teamCount?.total || 0, teamMembers: teamMembers?.total || 0 },
    limits: { free: freeBase, plus: base },
    users: users.map(user => {
      const privileged = user.role === "admin";
      const baseCalls = privileged ? null : user.plan === "plus" || user.has_plus_grant ? base : freeBase;
      const userDevices = extended.filter(x => x.user_id===user.id);
      return { ...user, online_devices: userDevices.filter(x => x.online).length,
        live_agent_versions: [...new Set(userDevices.flatMap(x => x.agent_version ? [x.agent_version] : []))],
        allowance: baseCalls === null ? null : baseCalls + user.extra };
    }),
    devices: extended, activity: chartRows.results || [],
    billing: {
      currency: "USD", actualUsd: null, source: "unavailable",
      note: "Cloudflare billing is account-wide; exact cost requires separately authorized Billing Read API access.",
      billingUrl: "https://dash.cloudflare.com/6b1d0dd4e6f7f30df92753cd1e2ee12d/billing",
      services: ["Workers Paid", "D1", "Durable Objects", "R2", "KV"],
    },
  }, { headers: { "cache-control": "private, no-store" } });
}

/** Explicit admin-only, on-demand billing read. No D1 writes, periodic polling,
 * stored invoice details, or Cloudflare billing privileges in the browser. */
export async function handleAdminBilling(request: Request, env: OpsEnv): Promise<Response> {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  if (request.method !== "GET") return jsonError("method_not_allowed", 405);
  if (!env.CF_BILLING_READ_TOKEN) {
    return Response.json({ connected: false, error: "billing_read_token_not_configured" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  const accountId = env.CF_BILLING_ACCOUNT_ID || "6b1d0dd4e6f7f30df92753cd1e2ee12d";
  if (!/^[0-9a-f]{32}$/i.test(accountId)) return jsonError("invalid_billing_account", 503);
  const from = new Date().toISOString().slice(0,7) + "-01";
  const to = new Date().toISOString().slice(0,10);
  try {
    const upstream = await fetch(
      "https://api.cloudflare.com/client/v4/accounts/" + accountId +
        "/billable-usage?from=" + from + "&to=" + to,
      { headers: { authorization: "Bearer " + env.CF_BILLING_READ_TOKEN,
          accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );
    if (!upstream.ok) {
      return Response.json({ connected: false, error: upstream.status === 403
        ? "billing_read_permission_required" : "billing_upstream_unavailable",
        status: upstream.status }, { status: 503, headers: { "cache-control": "no-store" } });
    }
    const json = await upstream.json() as { success?: boolean; result?: unknown };
    if (json.success !== true) return jsonError("billing_api_rejected_request", 503);
    const totals = summarizeCloudflareBillableUsage(json);
    return Response.json({ connected: true, ...totals, from, to,
      source: "Cloudflare Billable Usage API (alpha)",
      note: "Account-wide usage-based cost, updated daily; not an issued invoice or a Remote Arc-only bill." },
      { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("billing_read_failed", { message: error instanceof Error ? error.message : "unknown" });
    return jsonError("billing_currently_unavailable", 503);
  }
}

export async function handleAdminCallCredits(request: Request, env: OpsEnv) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  if (request.method !== "POST") return jsonError("method_not_allowed", 405);
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return jsonError("invalid_origin", 403);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const userId = typeof body.userId === "string" ? body.userId : "";
  const amount = body.amount;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const targetMonth = body.month;
  if (!userId || userId.length > 100 ||
      !Number.isSafeInteger(amount) || (amount as number) < 1 || (amount as number) > 100000 ||
      reason.length < 5 || reason.length > 300 || targetMonth !== month()) {
    return jsonError("invalid_credit_grant", 400);
  }
  const target = await env.DB.prepare("SELECT id, role FROM users WHERE id=?1")
    .bind(userId).first<{id:string;role:string}>();
  if (!target) return jsonError("user_not_found", 404);
  if (target.role === "admin") return jsonError("admin_unlimited", 400);
  const grantId = typeof body.requestId === "string" && /^[0-9a-f-]{36}$/i.test(body.requestId)
    ? body.requestId : crypto.randomUUID();
  try {
    await env.DB.prepare(`INSERT INTO user_call_credit_grants
      (id,user_id,month_key,extra_calls,reason,granted_by_user_id,created_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7)
      ON CONFLICT(id) DO NOTHING`)
      .bind(grantId, userId, targetMonth, amount, reason, auth.user!.id, new Date().toISOString()).run();
  } catch (error) {
    if (/no such table:\s*user_call_credit_grants/i.test(String(error))) {
      return jsonError("monthly_credit_migration_pending", 503);
    }
    throw error;
  }
  // Idempotent even if the browser did not receive the first response.
  const saved = await env.DB.prepare(
    "SELECT user_id, month_key, extra_calls, reason FROM user_call_credit_grants WHERE id=?1",
  ).bind(grantId).first<{user_id:string;month_key:string;extra_calls:number;reason:string}>();
  if (!saved || saved.user_id !== userId || saved.month_key !== targetMonth ||
      saved.extra_calls !== amount || saved.reason !== reason) {
    return jsonError("credit_request_id_conflict", 409);
  }
  return Response.json({ ok: true, grantId, userId, amount, month: targetMonth },
    { status: 201, headers: { "cache-control": "no-store" } });
}
