import { canonicalErrorEnvelope } from "../../../../packages/protocol/src/error-codes.js";
import { lifecycleSender, type LifecycleEmailEnv } from "../platform/lifecycle-email.js";
import type { FollowupEnv } from "./followup-common.js";

type LifecycleAdminEnv = FollowupEnv & Partial<LifecycleEmailEnv>;

const STATUSES = ["queued", "sending", "sent", "failed", "unknown", "skipped"] as const;
const WEEK_MS = 7 * 86_400_000;

/** Whether the scheduled sender would deliver queued lifecycle emails right now. */
export function lifecycleDelivery(env: LifecycleAdminEnv) {
  if (env.LIFECYCLE_EMAILS_ENABLED?.trim() !== "1") return "off" as const;
  return lifecycleSender(env as LifecycleEmailEnv) ? ("on" as const) : ("no_sender" as const);
}

/**
 * Small read for the follow-up page: the queue, the last 7 days by kind and status,
 * and whether delivery is on. Every count uses the (status, created_at) index.
 */
export async function lifecycleEmailSummary(env: LifecycleAdminEnv, now = Date.now()) {
  const since = new Date(now - WEEK_MS).toISOString();
  const statuses = STATUSES.map((status) => `'${status}'`).join(",");
  const [queue, recent] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) queued,MIN(created_at) oldest_queued_at FROM lifecycle_emails WHERE status='queued'`,
    ).first<{ queued: number; oldest_queued_at: string | null }>(),
    env.DB.prepare(
      `SELECT kind,status,COUNT(*) count FROM lifecycle_emails
      WHERE status IN (${statuses}) AND created_at>=?1 GROUP BY kind,status`,
    )
      .bind(since)
      .all<{ kind: string; status: string; count: number }>(),
  ]);
  return {
    delivery: lifecycleDelivery(env),
    queued: Number(queue?.queued || 0),
    oldestQueuedAt: queue?.oldest_queued_at || null,
    since,
    recent: (recent.results || []).map((row) => ({ ...row, count: Number(row.count) })),
  };
}

/** One person's automated emails, newest first, for the follow-up history. */
export async function lifecycleEmailsForUser(env: LifecycleAdminEnv, userId: string) {
  const rows = await env.DB.prepare(
    `SELECT id,kind,status,error_code,created_at,attempted_at,sent_at FROM lifecycle_emails
    WHERE user_id=?1 ORDER BY created_at DESC LIMIT 20`,
  )
    .bind(userId)
    .all<Record<string, unknown>>();
  return (rows.results || []).map((row) => canonicalErrorEnvelope(row));
}
