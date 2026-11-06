import { applicationJson } from "../platform/application-json.js";
import { getSessionUser } from "../auth/auth.js";

export type OverviewEnv = {
  DB: D1Database;
  REGISTRY: DurableObjectNamespace;
  PUBLIC_ORIGIN: string;
};

const HOUR = 3600_000;
const DAY = 24 * HOUR;
// Reviewer demo accounts are not customers.
const DEMO_USERS = "('reviewer-openai-v1','reviewer-anthropic-v1')";
// Presence lookups fan out to one Durable Object per device owner.
export const OVERVIEW_PRESENCE_LIMIT = 100;

export type OverviewSection = "people" | "usage" | "devices" | "revenue" | "teams" | "inbox";

type Hour = { hour: string; calls: number; failed: number; users: number };

const count = (value: unknown) => Number(value || 0);

async function people(db: D1Database, now: Date) {
  const today = now.toISOString().slice(0, 10);
  const weekStart = new Date(now.getTime() - 6 * DAY).toISOString().slice(0, 10);
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM users) total,
      (SELECT COUNT(*) FROM business_cohort_users WHERE is_demo=0 AND registered_at>=?1) new7d,
      (SELECT COUNT(DISTINCT user_id) FROM business_activity_days
        WHERE day=?2 AND user_id NOT IN ${DEMO_USERS}) activeToday,
      (SELECT COUNT(DISTINCT user_id) FROM business_activity_days
        WHERE day>=?3 AND user_id NOT IN ${DEMO_USERS}) active7d`,
    )
    .bind(new Date(now.getTime() - 7 * DAY).toISOString(), today, weekStart)
    .first<Record<string, number>>();
  return {
    total: count(row?.total),
    new7d: count(row?.new7d),
    activeToday: count(row?.activeToday),
    active7d: count(row?.active7d),
  };
}

async function usage(db: D1Database, now: Date) {
  // Only the 48 hours the chart shows: a wider window multiplies D1 row reads.
  const from = new Date(Math.floor(now.getTime() / HOUR) * HOUR - 47 * HOUR).toISOString();
  const [hourly, monthly] = await Promise.all([
    db
      .prepare(
        `SELECT substr(created_at,1,13) AS hour, COUNT(*) AS calls,
        SUM(CASE WHEN success=0 AND (outcome IS NULL OR outcome LIKE 'device_%') THEN 1 ELSE 0 END) AS failed,
        COUNT(DISTINCT user_id) AS users
        FROM audit_events WHERE created_at>=?1 AND event_type='mcp.tool_call'
        GROUP BY substr(created_at,1,13) ORDER BY hour`,
      )
      .bind(from)
      .all<Hour>(),
    db
      .prepare(
        "SELECT COALESCE(SUM(tool_calls),0) AS calls FROM user_monthly_usage WHERE month_key=?1",
      )
      .bind(now.toISOString().slice(0, 7))
      .first<{ calls: number }>(),
  ]);
  const rows = (hourly.results || []).map((row) => ({
    hour: row.hour,
    calls: count(row.calls),
    failed: count(row.failed),
    users: count(row.users),
  }));
  const split = new Date(Math.floor(now.getTime() / HOUR) * HOUR - 23 * HOUR)
    .toISOString()
    .slice(0, 13);
  const sum = (list: Hour[], key: "calls" | "failed") =>
    list.reduce((total, row) => total + row[key], 0);
  const last = rows.filter((row) => row.hour >= split);
  const previous = rows.filter((row) => row.hour < split);
  return {
    monthlyCalls: count(monthly?.calls),
    calls24h: sum(last, "calls"),
    failed24h: sum(last, "failed"),
    callsPrevious24h: sum(previous, "calls"),
    failedPrevious24h: sum(previous, "failed"),
    hourly: rows,
  };
}

async function devices(env: OverviewEnv) {
  const rows = await env.DB.prepare(
    `SELECT id, user_id FROM devices WHERE revoked_at IS NULL
    ORDER BY COALESCE(last_seen,created_at) DESC`,
  ).all<{ id: string; user_id: string }>();
  const owned = new Map<string, Set<string>>();
  for (const row of rows.results || []) {
    const ids = owned.get(row.user_id) || new Set<string>();
    ids.add(row.id);
    owned.set(row.user_id, ids);
  }
  const checked = [...owned.keys()].slice(0, OVERVIEW_PRESENCE_LIMIT);
  // Online comes from the live device registry, never from last_seen. Only the
  // owner's active devices count, so a revoked device that is still connected does not.
  const answers = await Promise.all(
    checked.map(async (userId) => {
      try {
        const response = await env.REGISTRY.getByName("user:" + userId).fetch(
          new Request("https://registry/devices", {
            headers: { "x-remote-link-user-id": userId },
          }),
        );
        if (!response.ok) return null;
        const live = (await response.json()) as Array<{ id?: string; status?: string }>;
        const ids = owned.get(userId)!;
        return live.filter((row) => row.status === "online" && ids.has(String(row.id))).length;
      } catch {
        return null;
      }
    }),
  );
  const known = answers.filter((value): value is number => value !== null);
  return {
    total: rows.results?.length || 0,
    online: known.reduce((sum, value) => sum + value, 0),
    // False when some owners were not checked or their registry did not answer.
    complete: owned.size <= OVERVIEW_PRESENCE_LIMIT && known.length === checked.length,
  };
}

async function revenue(db: D1Database, now: Date) {
  const row = await db
    .prepare(
      `SELECT
      (SELECT COALESCE(SUM(r.amount_cents),0) FROM arc_payment_receipts r
        LEFT JOIN arc_commercial_versions v ON v.id=r.commercial_version_id
        WHERE r.user_id NOT IN ${DEMO_USERS} AND COALESCE(v.mode,'live')='live'
        AND r.state='paid' AND r.amount_cents>0 AND r.verified_at>=?1) paidCents30d,
      (SELECT COUNT(*) FROM arc_payment_receipts r
        LEFT JOIN arc_commercial_versions v ON v.id=r.commercial_version_id
        WHERE r.user_id NOT IN ${DEMO_USERS} AND COALESCE(v.mode,'live')='live'
        AND r.state='paid' AND r.amount_cents>0 AND r.verified_at>=?1) payments30d,
      (SELECT COUNT(DISTINCT user_id) FROM arc_billing_subscriptions
        WHERE status IN ('active','trialing') AND period_end>?2) activeSubscriptions,
      (SELECT COUNT(*) FROM connect_unlimited_trials WHERE ends_at>?2) activeTrials`,
    )
    .bind(new Date(now.getTime() - 30 * DAY).toISOString(), now.toISOString())
    .first<Record<string, number>>();
  return {
    paidCents30d: count(row?.paidCents30d),
    payments30d: count(row?.payments30d),
    activeSubscriptions: count(row?.activeSubscriptions),
    activeTrials: count(row?.activeTrials),
  };
}

async function teams(db: D1Database) {
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM organizations WHERE kind='team') teams,
      (SELECT COUNT(*) FROM organization_members m JOIN organizations o ON o.id=m.organization_id
        WHERE o.kind='team' AND m.status='active') members`,
    )
    .first<Record<string, number>>();
  return { teams: count(row?.teams), members: count(row?.members) };
}

async function inbox(db: D1Database) {
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM website_submissions WHERE status='new') newSubmissions,
      (SELECT COUNT(*) FROM support_threads WHERE status='open') openSupport`,
    )
    .first<Record<string, number>>();
  return { newSubmissions: count(row?.newSubmissions), openSupport: count(row?.openSupport) };
}

/**
 * Small, bounded read for the Admin overview. Each section is read on its own,
 * so one failing query hides one section instead of the whole page.
 */
export async function handleAdminOverview(request: Request, env: OverviewEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return applicationJson({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!user.isAdmin) return applicationJson({ error: "FORBIDDEN" }, { status: 403 });
  if (request.method !== "GET")
    return applicationJson({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
  const now = new Date();
  const readers = {
    people: () => people(env.DB, now),
    usage: () => usage(env.DB, now),
    devices: () => devices(env),
    revenue: () => revenue(env.DB, now),
    teams: () => teams(env.DB),
    inbox: () => inbox(env.DB),
  } satisfies Record<OverviewSection, () => Promise<unknown>>;
  const keys = Object.keys(readers) as OverviewSection[];
  const settled = await Promise.allSettled(keys.map((key) => readers[key]()));
  const body: Record<string, unknown> = { checkedAt: now.toISOString() };
  const unavailable: OverviewSection[] = [];
  settled.forEach((result, index) => {
    const key = keys[index]!;
    if (result.status === "fulfilled") body[key] = result.value;
    else {
      body[key] = null;
      unavailable.push(key);
      console.error("admin overview section failed", key, String(result.reason).slice(0, 200));
    }
  });
  body.unavailable = unavailable;
  const status = unavailable.length === keys.length ? 503 : 200;
  if (status === 503) body.error = "SERVICE_UNAVAILABLE";
  return applicationJson(body, {
    status,
    headers: {
      "cache-control": "private, no-store",
      ...(status === 503 ? { "retry-after": "5" } : {}),
    },
  });
}
