import { useId } from "react";
import { useI18n } from "../../../app/i18n.js";
import {
  followupTime,
  type EmailBudget,
  type LifecycleEmail,
  type LifecycleKind,
  type LifecycleStatus,
  type LifecycleSummary,
} from "./followup-model.js";

type Translate = (en: string, zh: string) => string;

const KINDS: LifecycleKind[] = [
  "welcome",
  "connect_trial_started",
  "connect_trial_ending",
  "plan_started",
];
// The sender gives up on queued emails older than this (STALE_MS in the relay).
const STALE_HOURS = 72;
// Queued longer than this while sending is on usually means the shared budget is used up.
const SLOW_QUEUE_MINUTES = 30;

export const lifecycleKindLabel = (kind: LifecycleKind, tr: Translate) =>
  ({
    welcome: tr("Welcome after sign-up", "注册欢迎"),
    connect_trial_started: tr("Connect trial started", "Connect 试用开始"),
    connect_trial_ending: tr("Connect trial ending", "试用即将结束"),
    plan_started: tr("Paid plan confirmation", "付费开通确认"),
  })[kind] || kind;

const statusLabel = (status: LifecycleStatus, tr: Translate) =>
  ({
    queued: tr("Queued", "排队中"),
    sending: tr("Sending", "发送中"),
    sent: tr("Sent", "已发送"),
    failed: tr("Send failed", "发送失败"),
    unknown: tr("Check delivery", "投递待核实"),
    skipped: tr("Skipped", "已跳过"),
  })[status] || status;

const reasonLabel = (code: string, tr: Translate) =>
  ({
    NO_RECIPIENT: tr("No usable email address", "没有可用的邮箱地址"),
    STALE: tr("Queued for more than 3 days, so it was not sent", "排队超过 3 天未发出，已放弃发送"),
    SUPPRESSED: tr("The person unsubscribed from follow-up email", "用户已退订跟进邮件"),
    ALREADY_PAID: tr("The person already has a paid plan", "用户已经是付费用户"),
    TRIAL_ENDED: tr("The trial had already ended", "试用已经结束"),
    PROVIDER_TIMEOUT: tr(
      "The email service timed out; it may still have been delivered",
      "发信服务超时，邮件可能已送达",
    ),
  })[code] || code;

function age(from: string, tr: Translate) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(from)) / 60000));
  if (minutes < 60) return tr(minutes + " min", minutes + " 分钟");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return tr(hours + " h", hours + " 小时");
  return tr(Math.round(hours / 24) + " days", Math.round(hours / 24) + " 天");
}

/** The latest automated email this person received in the last three days, if any. */
export function recentLifecycleEmail(emails: LifecycleEmail[] | null | undefined) {
  const since = Date.now() - STALE_HOURS * 3600_000;
  return (emails || []).find(
    (email) =>
      ["sent", "sending", "unknown"].includes(email.status) &&
      Date.parse(email.sent_at || email.attempted_at || email.created_at) >= since,
  );
}

/** What automated emails are doing across all users: delivery state, queue and last 7 days. */
export function FollowupLifecyclePanel({
  summary,
  budget,
}: {
  summary: LifecycleSummary | null | undefined;
  budget?: EmailBudget;
}) {
  const { tr } = useI18n();
  const title = useId();
  if (summary === undefined) return null;
  if (summary === null)
    return (
      <section className="followupLifecycle" aria-labelledby={title}>
        <h4 id={title}>{tr("Automated emails", "自动邮件")}</h4>
        <p className="followupLifecycleNote">
          {tr(
            "Automated email status could not be loaded. Refresh to try again.",
            "自动邮件状态暂时无法加载，可稍后刷新重试。",
          )}
        </p>
      </section>
    );
  const count = (kind: LifecycleKind, statuses: LifecycleStatus[]) =>
    summary.recent
      .filter((row) => row.kind === kind && statuses.includes(row.status))
      .reduce((sum, row) => sum + row.count, 0);
  const troubled = KINDS.reduce((sum, kind) => sum + count(kind, ["failed", "unknown"]), 0);
  const oldest = summary.oldestQueuedAt;
  const slow =
    summary.delivery === "on" &&
    oldest !== null &&
    Date.now() - Date.parse(oldest) > SLOW_QUEUE_MINUTES * 60000;
  const warnings = [
    summary.delivery === "off" &&
      summary.queued > 0 &&
      tr(
        `Automated sending is off: ${summary.queued} queued, the oldest for ${age(oldest!, tr)}. Emails queued for more than 3 days are skipped.`,
        `自动发送未开启：${summary.queued} 封排队中，最早一封已等待 ${age(oldest!, tr)}。排队超过 3 天的邮件会被跳过。`,
      ),
    summary.delivery === "no_sender" &&
      tr(
        `Sending is turned on, but the SendPulse sender is not configured. ${summary.queued} queued.`,
        `已开启自动发送，但没有配置 SendPulse 发件信息。${summary.queued} 封排队中。`,
      ),
    slow &&
      tr(
        `${summary.queued} queued, the oldest for ${age(oldest!, tr)}. The shared sending budget may be used up.`,
        `${summary.queued} 封排队中，最早一封已等待 ${age(oldest!, tr)}，可能是共用的发送额度用完了。`,
      ),
    troubled > 0 &&
      tr(
        `In the last 7 days, ${troubled} failed or need a delivery check.`,
        `最近 7 天有 ${troubled} 封发送失败或投递待核实。`,
      ),
  ].filter((value): value is string => Boolean(value));
  return (
    <section className="followupLifecycle" aria-labelledby={title}>
      <header>
        <h4 id={title}>{tr("Automated emails", "自动邮件")}</h4>
        <span className="followupLifecycleState" data-state={summary.delivery}>
          {summary.delivery === "on"
            ? tr("Sending", "正在发送")
            : summary.delivery === "off"
              ? tr("Paused", "未开启")
              : tr("Sender not configured", "发件服务未配置")}
        </span>
      </header>
      <p className="followupLifecycleNote">
        {tr(
          "Sent by the product after sign-up, trial changes and payment. They share the sending budget with follow-up email.",
          "注册、试用变化和付费后由系统自动发送，与跟进邮件共用发送额度。",
        )}
      </p>
      {warnings.map((warning) => (
        <p key={warning} className="followupLifecycleWarning" role="status">
          {warning}
        </p>
      ))}
      <div className="followupLifecycleTable">
        <table>
          <caption>{tr("Last 7 days", "最近 7 天")}</caption>
          <thead>
            <tr>
              <th scope="col">{tr("Email", "邮件")}</th>
              <th scope="col">{tr("Sent", "已发送")}</th>
              <th scope="col">{tr("Queued", "排队中")}</th>
              <th scope="col">{tr("Skipped", "已跳过")}</th>
              <th scope="col">{tr("Failed", "失败")}</th>
            </tr>
          </thead>
          <tbody>
            {KINDS.map((kind) => (
              <tr key={kind}>
                <th scope="row">{lifecycleKindLabel(kind, tr)}</th>
                <td>{count(kind, ["sent"])}</td>
                <td>{count(kind, ["queued", "sending"])}</td>
                <td>{count(kind, ["skipped"])}</td>
                <td data-attention={count(kind, ["failed", "unknown"]) > 0 || undefined}>
                  {count(kind, ["failed", "unknown"])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {budget?.lifecycleUsage && (
        <p className="followupLifecycleNote">
          {tr(
            `${budget.lifecycleUsage.daily} automated emails went out through this sending account in the last 24 hours.`,
            `最近 24 小时通过同一发信账户发出 ${budget.lifecycleUsage.daily} 封自动邮件。`,
          )}
        </p>
      )}
    </section>
  );
}

/** One person's automated emails, shown beside the follow-up history. */
export function FollowupLifecycleHistory({
  emails,
}: {
  emails: LifecycleEmail[] | null | undefined;
}) {
  const { tr } = useI18n();
  return (
    <section className="followupLifecycleHistory">
      <h4>{tr("Automated emails", "自动邮件")}</h4>
      {emails === null && (
        <p className="adminNoData">
          {tr("Automated emails could not be loaded.", "自动邮件记录暂时无法加载。")}
        </p>
      )}
      {emails?.length === 0 && (
        <p className="adminNoData">
          {tr("No automated emails for this person yet.", "这位用户还没有自动邮件。")}
        </p>
      )}
      {emails?.map((email) => (
        <article className="followupHistoryItem" key={email.id} data-kind="lifecycle">
          <header>
            <div>
              <strong>{lifecycleKindLabel(email.kind, tr)}</strong>
              <small>
                {tr("Automated", "自动") +
                  " · " +
                  followupTime(email.sent_at || email.attempted_at || email.created_at)}
              </small>
            </div>
            <span className="adminLeadStatus" data-status={email.status}>
              {statusLabel(email.status, tr)}
            </span>
          </header>
          {email.error_code && (
            <p className={email.status === "skipped" ? undefined : "adminAlert"}>
              {reasonLabel(email.error_code, tr)} <small>{email.error_code}</small>
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
