import {billingEnabled,type PlatformLaunchEnv} from './platform-launch.js';
import {currentArcPlan} from './arc-plan.js';
type UsageEnv = PlatformLaunchEnv & {
  DB: D1Database;
  MONTHLY_TOOL_CALL_LIMIT?: string;
  FREE_MONTHLY_TOOL_CALL_LIMIT?: string;
  OPERATOR_EMAIL?: string;
  ARC_BILLING_ENABLED?:string;
};

export type MonthlyUsage = {
  month: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
};

const monthKey = () => new Date().toISOString().slice(0, 7);

function configuredMonthlyLimit(env: UsageEnv) {
  const raw = env.MONTHLY_TOOL_CALL_LIMIT ?? "10000";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

async function monthlyLimitForUser(env: UsageEnv, userId: string) {
  let user: { role: string | null; email: string | null; plan: string | null; has_plus_grant: number; extra_calls: number } | null;
  try {
    user = await env.DB.prepare(
    `SELECT u.role, u.email, u.plan,
      EXISTS(
        SELECT 1 FROM plan_grants g WHERE g.user_id = u.id AND g.plan = 'plus'
        AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > ?2)
      ) AS has_plus_grant,
      COALESCE((SELECT SUM(extra_calls) FROM user_call_credit_grants c
        WHERE c.user_id = u.id AND c.month_key = ?3), 0) AS extra_calls
     FROM users u WHERE u.id = ?1 LIMIT 1`,
  )
    .bind(userId, new Date().toISOString(), monthKey())
    .first<{ role: string | null; email: string | null; plan: string | null; has_plus_grant: number; extra_calls: number }>();
  } catch (error) {
    if (!/no such table:\s*user_call_credit_grants/i.test(String(error))) throw error;
    // Migration is not yet deployed: preserve every existing user's base
    // quota while the administrator credit UI remains unavailable.
    const old = await env.DB.prepare(
      `SELECT u.role, u.email, u.plan,
        EXISTS(SELECT 1 FROM plan_grants g WHERE g.user_id=u.id
          AND g.plan='plus' AND g.revoked_at IS NULL
          AND (g.expires_at IS NULL OR g.expires_at > ?2)) AS has_plus_grant
      FROM users u WHERE u.id=?1 LIMIT 1`,
    ).bind(userId, new Date().toISOString()).first<{
      role: string | null; email: string | null; plan: string | null; has_plus_grant: number;
    }>();
    user = old ? { ...old, extra_calls: 0 } : null;
  }

  const operatorEmail = env.OPERATOR_EMAIL?.trim().toLowerCase();
  if (
    user?.role === "admin" ||
    (operatorEmail && user?.email?.trim().toLowerCase() === operatorEmail)
  ) {
    return null;
  }
  if(billingEnabled(env)){
    const plan=await currentArcPlan(env.DB,userId);
    if(plan.id!=='free')return null;
    if(user?.plan!=='plus'&&!user?.has_plus_grant){
      const legacy=await env.DB.prepare('SELECT monthly_calls FROM arc_connect_legacy_allowances WHERE user_id=?1').bind(userId).first<{monthly_calls:number}>();
      return (legacy?.monthly_calls??plan.connectToolCalls)+(user?.extra_calls??0);
    }
  }
  // Keep existing Plus entitlements. A separate Free budget is explicitly
  // opt-in: absent FREE_MONTHLY_TOOL_CALL_LIMIT means no policy change.
  if (user?.plan !== "plus" && !user?.has_plus_grant &&
      env.FREE_MONTHLY_TOOL_CALL_LIMIT !== undefined) {
    const freeLimit = Number(env.FREE_MONTHLY_TOOL_CALL_LIMIT);
    if (!Number.isSafeInteger(freeLimit) || freeLimit < 1) {
      throw new Error("FREE_MONTHLY_TOOL_CALL_LIMIT must be a positive integer");
    }
    return freeLimit + (user?.extra_calls ?? 0);
  }
  const base = configuredMonthlyLimit(env);
  return base === null ? null : base + (user?.extra_calls ?? 0);
}

const isMissingUsageTableError = (error: unknown) =>
  /no such table:\s*user_monthly_usage/i.test(
    error instanceof Error ? error.message : String(error),
  );

function usageSnapshot(month: string, used: number, limit: number | null): MonthlyUsage {
  return {
    month,
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    unlimited: limit === null,
  };
}

export async function getMonthlyUsage(
  env: UsageEnv,
  userId: string,
): Promise<MonthlyUsage> {
  const month = monthKey();
  const limit = await monthlyLimitForUser(env, userId);
  try {
    const row = await env.DB.prepare(
      "SELECT tool_calls FROM user_monthly_usage WHERE user_id = ?1 AND month_key = ?2",
    )
      .bind(userId, month)
      .first<{ tool_calls: number }>();

    return usageSnapshot(month, row?.tool_calls || 0, limit);
  } catch (error) {
    if (!isMissingUsageTableError(error)) throw error;
    return usageSnapshot(month, 0, limit);
  }
}

export async function consumeToolCall(env: UsageEnv, userId: string) {
  const month = monthKey();
  const limit = await monthlyLimitForUser(env, userId);
  const now = new Date().toISOString();

  if (limit === null) {
    try {
      const row = await env.DB.prepare(
        `INSERT INTO user_monthly_usage (user_id, month_key, tool_calls, updated_at)
         VALUES (?1, ?2, 1, ?3)
         ON CONFLICT(user_id, month_key)
         DO UPDATE SET tool_calls = tool_calls + 1, updated_at = excluded.updated_at
         RETURNING tool_calls`,
      )
        .bind(userId, month, now)
        .first<{ tool_calls: number }>();

      return usageSnapshot(month, row?.tool_calls || 1, null);
    } catch (error) {
      if (!isMissingUsageTableError(error)) throw error;
      return usageSnapshot(month, 0, null);
    }
  }

  let row: { tool_calls: number } | null;
  try {
    row = await env.DB.prepare(
      `INSERT INTO user_monthly_usage (user_id, month_key, tool_calls, updated_at)
       VALUES (?1, ?2, 1, ?3)
       ON CONFLICT(user_id, month_key)
       DO UPDATE SET tool_calls = tool_calls + 1, updated_at = excluded.updated_at
       WHERE tool_calls < ?4
       RETURNING tool_calls`,
    )
      .bind(userId, month, now, limit)
      .first<{ tool_calls: number }>();
  } catch (error) {
    if (!isMissingUsageTableError(error)) throw error;
    return usageSnapshot(month, 0, limit);
  }

  if (!row) {
    const usage = await getMonthlyUsage(env, userId);
    const error = new Error(
      `Monthly Remote Arc tool-call limit reached (${usage.used}/${usage.limit}).`,
    );
    (error as Error & { code?: string }).code = "MONTHLY_LIMIT_REACHED";
    throw error;
  }

  return usageSnapshot(month, row.tool_calls, limit);
}
