import { CONNECT_FREE_OVERFLOW, CONNECT_UNLIMITED_PLAN_ID } from "@remotearc/protocol";
import { recordProductEvent } from "../analytics/product-events.js";
import { commercialCatalog } from "../arc/arc-commercial-config.js";
import { currentArcPlan } from "../arc/arc-plan.js";
import { ensureContact } from "../followups/followup-common.js";
import {
  emailWindows,
  followupUsageSql,
  lifecycleUsageSql,
  otpReserve,
  otpUsageSql,
  providerEmailLimits,
  supportUsageSql,
  type EmailCapacityEnv,
} from "./email-capacity.js";
import { deliverEmail } from "./email-delivery-provider.js";
import { emailMailbox, followupReplyTo } from "./email-sender.js";
import { lifecycleEmail, type LifecycleKind } from "./lifecycle-email-content.js";

export type LifecycleEmailEnv = EmailCapacityEnv & {
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
  DASHBOARD_ORIGIN?: string;
  MARKETING_ORIGIN?: string;
  STRIPE_SECRET_KEY?: string;
  DEPLOYMENT_SHA?: string;
  /** "1" turns delivery on. Rows still queue while it is off. */
  LIFECYCLE_EMAILS_ENABLED?: string;
  LIFECYCLE_FROM?: string;
  SENDPULSE_API_KEY?: string;
  FOLLOWUP_FROM?: string;
  FOLLOWUP_REPLY_TO?: string;
};

type Row = {
  id: string;
  user_id: string;
  kind: LifecycleKind;
  ref: string;
  details_json: string;
  created_at: string;
  email: string | null;
  locale: string | null;
};

/** Confirmations are sent even to people who opted out of product email. */
const TRANSACTIONAL: readonly LifecycleKind[] = ["plan_started"];
const BATCH_SIZE = 10;
const STALE_MS = 3 * 86_400_000;
const TRIAL_ENDING_NOTICE_MS = 86_400_000;

export function lifecycleSender(env: LifecycleEmailEnv) {
  const apiKey = env.SENDPULSE_API_KEY?.trim(),
    from =
      env.LIFECYCLE_FROM?.trim() ||
      env.FOLLOWUP_FROM?.trim() ||
      "Remote Arc <support@remotearc.app>",
    replyTo = followupReplyTo(env);
  if (!apiKey || !emailMailbox(from) || !emailMailbox(replyTo)) return null;
  return { provider: "sendpulse" as const, apiKey, from, replyTo };
}

/** Queue the reminder once for every trial that ends within the next day. */
export async function queueTrialEndingEmails(db: D1Database, now = new Date()) {
  const at = now.toISOString(),
    until = new Date(now.getTime() + TRIAL_ENDING_NOTICE_MS).toISOString();
  await db
    .prepare(
      `INSERT OR IGNORE INTO lifecycle_emails(id,user_id,kind,ref,details_json,created_at)
       SELECT lower(hex(randomblob(16))),t.user_id,'connect_trial_ending','',json_object('endsAt',t.ends_at),?1
       FROM connect_unlimited_trials t WHERE t.ends_at>?1 AND t.ends_at<=?2`,
    )
    .bind(at, until)
    .run();
}

/** A paid plan confirmation for a new or changed plan, never for a renewal of
 * the same plan that continues an earlier paid period. */
export async function queuePlanStartedEmail(
  db: D1Database,
  receipt: {
    receipt: string;
    userId: string;
    sku: string;
    label: string;
    cents: number;
    start: string | null;
    end: string | null;
  },
  at = new Date().toISOString(),
) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO lifecycle_emails(id,user_id,kind,ref,details_json,created_at)
       SELECT lower(hex(randomblob(16))),?1,'plan_started',?2,json_object('planId',?3,'label',?4,'cents',?5,'periodEnd',?6),?8
       WHERE NOT EXISTS(SELECT 1 FROM arc_payment_receipts r WHERE r.user_id=?1 AND r.product_id=?3
         AND r.id<>?2 AND r.state='paid' AND r.period_end IS NOT NULL
         AND r.period_end>=strftime('%Y-%m-%dT%H:%M:%fZ',COALESCE(?7,?8),'-2 days'))`,
    )
    .bind(
      receipt.userId,
      receipt.receipt,
      receipt.sku,
      receipt.label,
      receipt.cents,
      receipt.end,
      receipt.start,
      at,
    )
    .run();
}

/** Atomic claim within the shared SendPulse account, leaving OTP its reserve. */
function capacityGuard(env: LifecycleEmailEnv, now: number) {
  const limits = providerEmailLimits(env, "sendpulse"),
    reserve = otpReserve("sendpulse"),
    windows = emailWindows(now);
  const used = (since: string, name: "daily" | "hourly" | "monthly") =>
    `${followupUsageSql("'sendpulse'", since)}+${supportUsageSql("'sendpulse'", since)}+${lifecycleUsageSql("'sendpulse'", since)}+MAX(${otpUsageSql("'sendpulse'", since)},${Math.min(reserve[name], limits[name])})<${limits[name]}`;
  return {
    sql: `${used("?3", "daily")} AND ${used("?4", "hourly")} AND ${used("?5", "monthly")}`,
    bindings: [windows.daySince, windows.hourSince, windows.monthSince],
  };
}

async function skipReason(env: LifecycleEmailEnv, row: Row, now: string) {
  if (!row.email || !emailMailbox(row.email)) return "no_recipient";
  if (row.created_at < new Date(Date.parse(now) - STALE_MS).toISOString()) return "stale";
  if (!TRANSACTIONAL.includes(row.kind)) {
    const contact = await env.DB.prepare(
      "SELECT suppressed_at FROM user_followup_contacts WHERE user_id=?1",
    )
      .bind(row.user_id)
      .first<{ suppressed_at: string | null }>();
    if (contact?.suppressed_at) return "suppressed";
  }
  if (row.kind === "connect_trial_started" || row.kind === "connect_trial_ending") {
    if ((await currentArcPlan(env, row.user_id)).id !== "free") return "already_paid";
    if (row.kind === "connect_trial_ending") {
      const trial = await env.DB.prepare(
        "SELECT ends_at FROM connect_unlimited_trials WHERE user_id=?1",
      )
        .bind(row.user_id)
        .first<{ ends_at: string }>();
      if (!trial || trial.ends_at <= now) return "trial_ended";
    }
  }
  return null;
}

/** Runs every minute. Delivery stops at the first claim refused for capacity. */
export async function runLifecycleEmails(env: LifecycleEmailEnv, timeoutMs = 15000) {
  const now = new Date();
  await queueTrialEndingEmails(env.DB, now);
  if (env.LIFECYCLE_EMAILS_ENABLED?.trim() !== "1") return { sent: 0 };
  const sender = lifecycleSender(env);
  if (!sender) return { sent: 0 };
  const rows = (
    await env.DB.prepare(
      `SELECT e.id,e.user_id,e.kind,e.ref,e.details_json,e.created_at,u.email,u.locale
       FROM lifecycle_emails e JOIN users u ON u.id=e.user_id
       WHERE e.status='queued' ORDER BY e.kind='plan_started' DESC, e.created_at LIMIT ?1`,
    )
      .bind(BATCH_SIZE)
      .all<Row>()
  ).results;
  if (!rows.length) return { sent: 0 };

  const dashboard = (env.DASHBOARD_ORIGIN || env.APP_ORIGIN || env.PUBLIC_ORIGIN).replace(
    /\/$/,
    "",
  );
  const site = new URL(env.MARKETING_ORIGIN || "https://remotearc.app").origin;
  const catalog = await commercialCatalog(env).catch(() => null);
  const unlimitedCents =
    catalog?.plans.find((plan) => plan.id === CONNECT_UNLIMITED_PLAN_ID)?.monthlyPriceCents ?? null;
  let sent = 0;

  for (const row of rows) {
    const at = new Date().toISOString();
    const skip = await skipReason(env, row, at);
    if (skip) {
      await env.DB.prepare(
        "UPDATE lifecycle_emails SET status='skipped',error_code=?2 WHERE id=?1 AND status='queued'",
      )
        .bind(row.id, skip)
        .run();
      continue;
    }
    const details = JSON.parse(row.details_json || "{}") as Record<string, unknown>;
    const transactional = TRANSACTIONAL.includes(row.kind);
    const contact = transactional ? null : await ensureContact(env, row.user_id);
    const plan = await currentArcPlan(env, row.user_id);
    const mail = lifecycleEmail({
      kind: row.kind,
      locale: row.locale === "zh" ? "zh" : "en",
      freeCalls: plan.id === "free" ? plan.connectToolCalls : null,
      trialDays: CONNECT_FREE_OVERFLOW.trialDays,
      slowLaneCallsPerMinute: CONNECT_FREE_OVERFLOW.slowLaneCallsPerMinute,
      unlimitedCents,
      ...(typeof details.endsAt === "string" ? { trialEndsAt: details.endsAt } : {}),
      ...(row.kind === "plan_started"
        ? {
            plan: {
              id: String(details.planId),
              label: String(details.label),
              cents: Number(details.cents),
              periodEnd: typeof details.periodEnd === "string" ? details.periodEnd : null,
            },
          }
        : {}),
      links: {
        setup: site + "/connect-ai",
        checkout: dashboard + "/checkout?product=" + encodeURIComponent(CONNECT_UNLIMITED_PLAN_ID),
        billing: dashboard + "/settings?section=billing",
        unsubscribe: contact
          ? site +
            "/email/follow-up/unsubscribe?token=" +
            encodeURIComponent(contact.unsubscribe_token)
          : null,
      },
    });
    const guard = capacityGuard(env, Date.parse(at));
    const claimed = await env.DB.prepare(
      `UPDATE lifecycle_emails SET status='sending',provider='sendpulse',attempted_at=?2
       WHERE id=?1 AND status='queued' AND ${guard.sql} RETURNING id`,
    )
      .bind(row.id, at, ...guard.bindings)
      .first();
    if (!claimed) break;
    let result: { status: string; providerId: string | null; errorCode: string | null };
    try {
      result = await deliverEmail(
        sender,
        { idempotencyKey: "lifecycle:" + row.id, to: row.email!, ...mail },
        timeoutMs,
      );
    } catch {
      // The provider may have accepted it before the timeout: never resend.
      result = { status: "unknown", providerId: null, errorCode: "provider_timeout" };
    }
    await env.DB.prepare(
      "UPDATE lifecycle_emails SET status=?2,provider_id=?3,error_code=?4,sent_at=?5 WHERE id=?1 AND status='sending'",
    )
      .bind(
        row.id,
        result.status,
        result.providerId,
        result.errorCode,
        result.status === "sent" ? new Date().toISOString() : null,
      )
      .run();
    if (result.status === "sent") sent++;
    await recordProductEvent(env, {
      domain: "email",
      name: "email.lifecycle.delivered",
      source: "server",
      outcome:
        result.status === "sent" ? "succeeded" : result.status === "failed" ? "failed" : "waiting",
      userId: row.user_id,
      operation: row.kind,
    });
  }
  return { sent };
}
