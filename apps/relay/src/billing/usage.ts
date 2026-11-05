import { CONNECT_FREE_OVERFLOW, CONNECT_UNLIMITED_PLAN_ID } from "@remotearc/protocol";
import { billingEnabled, type PlatformLaunchEnv } from "../platform/platform-launch.js";
import { currentArcPlan } from "../arc/arc-plan.js";
import { recordProductEvent } from "../analytics/product-events.js";
import { rewardAllowance, consumeRewardCall } from "./connect-rewards.js";
type UsageEnv = PlatformLaunchEnv & {
  DB: D1Database;
  MONTHLY_TOOL_CALL_LIMIT?: string;
  FREE_MONTHLY_TOOL_CALL_LIMIT?: string;
  OPERATOR_EMAIL?: string;
  ARC_BILLING_ENABLED?: string;
};

/** Present only for a Free account that has used its allowance or started its
 * reverse trial. After the trial, calls continue in the slow lane. */
export type FreeOverflow = {
  trialDays: number;
  slowLaneCallsPerMinute: number;
  trial: { startedAt: string; endsAt: string; active: boolean } | null;
  slowLaneCallsThisMonth: number;
};

export type MonthlyUsage = {
  month: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
  freeOverflow?: FreeOverflow;
};

type Allowance = { limit: number | null; freeOverflow: boolean };
type TrialRow = { started_at: string; ends_at: string };
type OverflowState = { trial: TrialRow | null; slowLaneCalls: number };

const SLOW_LANE_INTERVAL_MS = 60_000 / CONNECT_FREE_OVERFLOW.slowLaneCallsPerMinute;

const monthKey = () => new Date().toISOString().slice(0, 7);

function configuredMonthlyLimit(env: UsageEnv) {
  const raw = env.MONTHLY_TOOL_CALL_LIMIT ?? "10000";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

async function allowanceForUser(env: UsageEnv, userId: string): Promise<Allowance> {
  let user: {
    role: string | null;
    email: string | null;
    plan: string | null;
    has_plus_grant: number;
    extra_calls: number;
  } | null;
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
      .first<{
        role: string | null;
        email: string | null;
        plan: string | null;
        has_plus_grant: number;
        extra_calls: number;
      }>();
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
    )
      .bind(userId, new Date().toISOString())
      .first<{
        role: string | null;
        email: string | null;
        plan: string | null;
        has_plus_grant: number;
      }>();
    user = old ? { ...old, extra_calls: 0 } : null;
  }

  const operatorEmail = env.OPERATOR_EMAIL?.trim().toLowerCase();
  const fixed = (limit: number | null): Allowance => ({ limit, freeOverflow: false });
  if (
    user?.role === "admin" ||
    (operatorEmail && user?.email?.trim().toLowerCase() === operatorEmail)
  ) {
    return fixed(null);
  }
  if (billingEnabled(env)) {
    const plan = await currentArcPlan(env, userId);
    if (plan.id !== "free")
      return fixed(
        plan.connectToolCalls === null ? null : plan.connectToolCalls + (user?.extra_calls ?? 0),
      );
    if (user?.plan !== "plus" && !user?.has_plus_grant) {
      const legacy = await env.DB.prepare(
        "SELECT monthly_calls FROM arc_connect_legacy_allowances WHERE user_id=?1",
      )
        .bind(userId)
        .first<{ monthly_calls: number }>();
      const allowance =
        plan.connectToolCalls === null
          ? null
          : Math.max(legacy?.monthly_calls ?? 0, plan.connectToolCalls);
      return allowance === null
        ? fixed(null)
        : { limit: allowance + (user?.extra_calls ?? 0), freeOverflow: true };
    }
  }
  // Keep existing Plus entitlements. A separate Free budget is explicitly
  // opt-in: absent FREE_MONTHLY_TOOL_CALL_LIMIT means no policy change.
  if (
    user?.plan !== "plus" &&
    !user?.has_plus_grant &&
    env.FREE_MONTHLY_TOOL_CALL_LIMIT !== undefined
  ) {
    const freeLimit = Number(env.FREE_MONTHLY_TOOL_CALL_LIMIT);
    if (!Number.isSafeInteger(freeLimit) || freeLimit < 1) {
      throw new Error("FREE_MONTHLY_TOOL_CALL_LIMIT must be a positive integer");
    }
    return fixed(freeLimit + (user?.extra_calls ?? 0));
  }
  const base = configuredMonthlyLimit(env);
  return fixed(base === null ? null : base + (user?.extra_calls ?? 0));
}

const isMissingOverflowTableError = (error: unknown) =>
  /no such table:\s*connect_(unlimited_trials|slow_lane_usage)/i.test(String(error));

/** Null when the overflow migration is not deployed yet: callers then keep the
 * previous hard monthly limit instead of failing every call. */
async function overflowState(
  db: D1Database,
  userId: string,
  month: string,
): Promise<OverflowState | null> {
  try {
    const row = await db
      .prepare(
        `SELECT t.started_at, t.ends_at,
          COALESCE((SELECT month_calls FROM connect_slow_lane_usage s
            WHERE s.user_id=?1 AND s.month_key=?2), 0) AS slow_lane_calls
         FROM (SELECT 1) LEFT JOIN connect_unlimited_trials t ON t.user_id=?1`,
      )
      .bind(userId, month)
      .first<{ started_at: string | null; ends_at: string | null; slow_lane_calls: number }>();
    return {
      trial:
        row?.started_at && row.ends_at
          ? { started_at: row.started_at, ends_at: row.ends_at }
          : null,
      slowLaneCalls: row?.slow_lane_calls ?? 0,
    };
  } catch (error) {
    if (isMissingOverflowTableError(error)) return null;
    throw error;
  }
}

const trialActive = (trial: TrialRow | null, now: string) => Boolean(trial && trial.ends_at > now);

function overflowSnapshot(state: OverflowState, now: string): FreeOverflow {
  return {
    trialDays: CONNECT_FREE_OVERFLOW.trialDays,
    slowLaneCallsPerMinute: CONNECT_FREE_OVERFLOW.slowLaneCallsPerMinute,
    trial: state.trial
      ? {
          startedAt: state.trial.started_at,
          endsAt: state.trial.ends_at,
          active: trialActive(state.trial, now),
        }
      : null,
    slowLaneCallsThisMonth: state.slowLaneCalls,
  };
}

const limitReached = (message: string) => {
  const error = new Error(message);
  (error as Error & { code: string }).code = "MONTHLY_LIMIT_REACHED";
  return error;
};

export class SlowLaneRateLimitedError extends Error {
  readonly code = "SLOW_LANE_RATE_LIMITED";
  constructor(readonly retryAfterSeconds: number) {
    super(
      `Free Connect calls for this month are used up, so calls continue in the slow lane at ${CONNECT_FREE_OVERFLOW.slowLaneCallsPerMinute} per minute. Wait ${retryAfterSeconds} seconds before the next call.`,
    );
  }
}

const isMissingUsageTableError = (error: unknown) =>
  /no such table:\s*user_monthly_usage/i.test(
    error instanceof Error ? error.message : String(error),
  );

function usageSnapshot(
  month: string,
  used: number,
  limit: number | null,
  freeOverflow?: FreeOverflow,
): MonthlyUsage {
  return {
    month,
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    unlimited: limit === null,
    ...(freeOverflow ? { freeOverflow } : {}),
  };
}

export async function getMonthlyUsage(env: UsageEnv, userId: string): Promise<MonthlyUsage> {
  const month = monthKey(),
    now = new Date().toISOString();
  const { limit: base, freeOverflow } = await allowanceForUser(env, userId),
    reward = base === null ? null : await rewardAllowance(env.DB, userId);
  const limit =
    base === null ? null : base + (reward?.available || 0) + (reward?.spentThisMonth || 0);
  let used = 0;
  try {
    const row = await env.DB.prepare(
      "SELECT tool_calls FROM user_monthly_usage WHERE user_id = ?1 AND month_key = ?2",
    )
      .bind(userId, month)
      .first<{ tool_calls: number }>();
    used = row?.tool_calls || 0;
  } catch (error) {
    if (!isMissingUsageTableError(error)) throw error;
  }
  const state = freeOverflow && limit !== null ? await overflowState(env.DB, userId, month) : null;
  const show = state !== null && limit !== null && (trialActive(state.trial, now) || used >= limit);
  return usageSnapshot(month, used, limit, show ? overflowSnapshot(state, now) : undefined);
}

async function countUncapped(
  env: UsageEnv,
  userId: string,
  month: string,
  now: string,
  limit: number | null,
  freeOverflow?: FreeOverflow,
) {
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
    return usageSnapshot(month, row?.tool_calls || 1, limit, freeOverflow);
  } catch (error) {
    if (!isMissingUsageTableError(error)) throw error;
    return usageSnapshot(month, 0, limit, freeOverflow);
  }
}

/** A Free account past its allowance: count the call during an active reverse
 * trial, start the trial if it never had one, otherwise pace it in the slow
 * lane. Read only once the allowance blocks a call, so calls within the
 * allowance cost no extra query. Null when the overflow tables are missing. */
async function overflowCall(
  env: UsageEnv,
  userId: string,
  month: string,
  now: string,
  limit: number,
): Promise<MonthlyUsage | null> {
  let state = await overflowState(env.DB, userId, month);
  if (!state) return null;
  if (trialActive(state.trial, now))
    return countUncapped(env, userId, month, now, limit, overflowSnapshot(state, now));
  if (!state.trial) {
    const endsAt = new Date(
      Date.parse(now) + CONNECT_FREE_OVERFLOW.trialDays * 86_400_000,
    ).toISOString();
    const inserted = await env.DB.prepare(
      `INSERT INTO connect_unlimited_trials (user_id, started_at, ends_at, month_key, base_limit)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(user_id) DO NOTHING
       RETURNING user_id`,
    )
      .bind(userId, now, endsAt, month, limit)
      .first<{ user_id: string }>();
    if (inserted)
      await recordProductEvent(env, {
        name: "billing.connect_trial.started",
        domain: "billing",
        source: "server",
        outcome: "succeeded",
        userId,
        entityId: CONNECT_UNLIMITED_PLAN_ID,
      });
    // Re-read so a call that lost the race still sees the trial that won it.
    state = (await overflowState(env.DB, userId, month)) ?? state;
    if (trialActive(state.trial, now))
      return countUncapped(env, userId, month, now, limit, overflowSnapshot(state, now));
  }

  const cutoff = new Date(Date.parse(now) - SLOW_LANE_INTERVAL_MS).toISOString();
  const allowed = await env.DB.prepare(
    `INSERT INTO connect_slow_lane_usage (user_id, last_call_at, month_key, month_calls, updated_at)
     VALUES (?1, ?2, ?3, 1, ?2)
     ON CONFLICT(user_id) DO UPDATE SET
       last_call_at = excluded.last_call_at,
       month_calls = CASE WHEN connect_slow_lane_usage.month_key = excluded.month_key
         THEN connect_slow_lane_usage.month_calls + 1 ELSE 1 END,
       month_key = excluded.month_key,
       updated_at = excluded.updated_at
     WHERE connect_slow_lane_usage.last_call_at <= ?4
     RETURNING month_calls`,
  )
    .bind(userId, now, month, cutoff)
    .first<{ month_calls: number }>();
  if (allowed) {
    const usage = await getMonthlyUsage(env, userId);
    return usageSnapshot(
      month,
      usage.used,
      limit,
      overflowSnapshot({ ...state, slowLaneCalls: allowed.month_calls }, now),
    );
  }
  const last = await env.DB.prepare(
    "SELECT last_call_at FROM connect_slow_lane_usage WHERE user_id = ?1",
  )
    .bind(userId)
    .first<{ last_call_at: string }>();
  const waitMs = last
    ? Date.parse(last.last_call_at) + SLOW_LANE_INTERVAL_MS - Date.parse(now)
    : SLOW_LANE_INTERVAL_MS;
  throw new SlowLaneRateLimitedError(
    Math.min(SLOW_LANE_INTERVAL_MS / 1000, Math.max(1, Math.ceil(waitMs / 1000))),
  );
}

export async function consumeToolCall(env: UsageEnv, userId: string): Promise<MonthlyUsage> {
  const month = monthKey();
  const { limit, freeOverflow } = await allowanceForUser(env, userId);
  const now = new Date().toISOString();
  const overflowed = (allowance: number) =>
    freeOverflow ? overflowCall(env, userId, month, now, allowance) : Promise.resolve(null);

  if (limit !== null) {
    const reward = await rewardAllowance(env.DB, userId, now);
    if ((reward?.available || 0) > 0 || (reward?.spentThisMonth || 0) > 0) {
      if (await consumeRewardCall(env.DB, userId, limit, now)) return getMonthlyUsage(env, userId);
      const overflow = await overflowed(limit);
      if (overflow) return overflow;
      throw limitReached("Connect call allowance reached.");
    }
  }

  if (limit === null) return countUncapped(env, userId, month, now, null);

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
    const overflow = await overflowed(limit);
    if (overflow) return overflow;
    const usage = await getMonthlyUsage(env, userId);
    throw limitReached(
      `Monthly Remote Arc tool-call limit reached (${usage.used}/${usage.limit}).`,
    );
  }

  return usageSnapshot(month, row.tool_calls, limit);
}
