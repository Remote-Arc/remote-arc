import { useEffect, useId, useState } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import type { Translate } from "../../../locales/locale-catalog.js";
import { FollowupEmailPreview } from "./followup-email-preview.js";
import {
  followupApi,
  setupPreviewsFor,
  followupTime,
  type WelcomeSetup,
  type EmailBudget,
  type LifecycleEmail,
  type LifecycleKind,
  type LifecyclePreview,
  type LifecycleStatus,
  type LifecycleSummary,
} from "./followup-model.js";

const KINDS: LifecycleKind[] = [
  "welcome",
  "setup_reminder",
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
    welcome: tr("admin.followups.followupLifecycle.welcomeAfterSignUp"),
    setup_reminder: tr("admin.followups.followupLifecycle.setupReminder"),
    connect_trial_started: tr("admin.followups.followupLifecycle.connectTrialStarted"),
    connect_trial_ending: tr("admin.followups.followupLifecycle.connectTrialEnding"),
    plan_started: tr("admin.followups.followupLifecycle.paidPlanConfirmation"),
  })[kind] || kind;

const statusLabel = (status: LifecycleStatus, tr: Translate) =>
  ({
    queued: tr("admin.followups.followupLifecycle.statusQueued"),
    sending: tr("admin.followups.followupLifecycle.statusSending"),
    sent: tr("admin.followups.followupLifecycle.statusSent"),
    failed: tr("admin.followups.followupLifecycle.statusFailed"),
    unknown: tr("admin.followups.followupLifecycle.statusUnknown"),
    skipped: tr("admin.followups.followupLifecycle.statusSkipped"),
  })[status] || status;

const reasonLabel = (code: string, tr: Translate) =>
  ({
    NO_RECIPIENT: tr("admin.followups.followupLifecycle.reasonNoRecipient"),
    STALE: tr("admin.followups.followupLifecycle.reasonStale"),
    SUPPRESSED: tr("admin.followups.followupLifecycle.reasonSuppressed"),
    ALREADY_PAID: tr("admin.followups.followupLifecycle.reasonAlreadyPaid"),
    TRIAL_ENDED: tr("admin.followups.followupLifecycle.reasonTrialEnded"),
    SETUP_COMPLETE: tr("admin.followups.followupLifecycle.reasonSetupComplete"),
    PROVIDER_TIMEOUT: tr("admin.followups.followupLifecycle.reasonProviderTimeout"),
  })[code] || code;

function age(from: string, tr: Translate) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(from)) / 60000));
  if (minutes < 60) return tr("admin.followups.followupLifecycle.ageMinutes", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 48) return tr("admin.followups.followupLifecycle.ageHours", { count: hours });
  return tr("admin.followups.followupLifecycle.ageDays", { count: Math.round(hours / 24) });
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

/** One automated email as the sender renders it today, in either language. Nothing is sent. */
function LifecyclePreviewPanel({ kind, onClose }: { kind: LifecycleKind; onClose: () => void }) {
  const { tr, locale: uiLocale } = useI18n();
  const [locale, setLocale] = useState<"en" | "zh">(uiLocale === "zh" ? "zh" : "en");
  // The welcome email and setup reminder change with how far someone has got with setup.
  const [setup, setSetup] = useState<WelcomeSetup>("new");
  const setups = setupPreviewsFor(kind),
    adapts = setups.length > 0;
  const [result, setResult] = useState<{
    key: string;
    mail?: LifecyclePreview;
    failed?: boolean;
  } | null>(null);
  const query =
    "kind=" + encodeURIComponent(kind) + "&locale=" + locale + (adapts ? "&setup=" + setup : "");
  const key = query;
  useEffect(() => {
    let live = true;
    followupApi<LifecyclePreview>("/lifecycle-preview?" + query)
      .then((mail) => live && setResult({ key, mail }))
      .catch(() => live && setResult({ key, failed: true }));
    return () => {
      live = false;
    };
  }, [query, key]);
  const setupLabel = {
    new: tr("admin.followups.followupLifecycle.previewSetupNew"),
    connected: tr("admin.followups.followupLifecycle.previewSetupConnected"),
    paired: tr("admin.followups.followupLifecycle.previewSetupPaired"),
    ready: tr("admin.followups.followupLifecycle.previewSetupReady"),
  };
  const current = result?.key === key ? result : null;
  const label = lifecycleKindLabel(kind, tr);
  return (
    <div className="followupLifecyclePreview">
      <header>
        <strong>{tr("admin.followups.followupLifecycle.previewOf", { kind: label })}</strong>
        <div
          className="followupLifecyclePreviewLocale"
          role="group"
          aria-label={tr("admin.followups.followupLifecycle.previewLanguage")}
        >
          {(["zh", "en"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={locale === value}
              onClick={() => setLocale(value)}
            >
              {value === "zh"
                ? tr("admin.followups.followupLifecycle.previewChinese")
                : tr("admin.followups.followupLifecycle.previewEnglish")}
            </button>
          ))}
        </div>
        {adapts && (
          <div
            className="followupLifecyclePreviewLocale"
            role="group"
            aria-label={tr("admin.followups.followupLifecycle.previewSetup")}
          >
            {setups.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={setup === value}
                onClick={() => setSetup(value)}
              >
                {setupLabel[value]}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="adminOutlineBtn" onClick={onClose}>
          {tr("admin.followups.followupLifecycle.previewClose")}
        </button>
      </header>
      <p className="followupLifecycleNote">{tr("admin.followups.followupLifecycle.previewNote")}</p>
      {!current && (
        <p className="followupLifecycleNote" role="status">
          {tr("admin.followups.followupLifecycle.previewLoading")}
        </p>
      )}
      {current?.failed && (
        <p className="followupLifecycleWarning" role="alert">
          {tr("admin.followups.followupLifecycle.previewFailed")}
        </p>
      )}
      {current?.mail && (
        <>
          <p className="followupLifecyclePreviewSubject">
            <span>{tr("admin.followups.followupLifecycle.previewSubject")}</span>
            {current.mail.subject}
          </p>
          <FollowupEmailPreview html={current.mail.html} title={label} />
          <details className="followupLifecyclePreviewText">
            <summary>{tr("admin.followups.followupLifecycle.previewPlainText")}</summary>
            <pre>{current.mail.text}</pre>
          </details>
        </>
      )}
    </div>
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
  const [previewing, setPreviewing] = useState<LifecycleKind | null>(null);
  if (summary === undefined) return null;
  if (summary === null)
    return (
      <section className="followupLifecycle" aria-labelledby={title}>
        <h4 id={title}>{tr("admin.followups.followupLifecycle.automatedEmails")}</h4>
        <p className="followupLifecycleNote">
          {tr("admin.followups.followupLifecycle.statusUnavailable")}
        </p>
      </section>
    );
  const count = (kind: LifecycleKind, statuses: LifecycleStatus[]) =>
    summary.recent
      .filter((row) => row.kind === kind && statuses.includes(row.status))
      .reduce((sum, row) => sum + row.count, 0);
  const troubled = KINDS.reduce((sum, kind) => sum + count(kind, ["failed", "unknown"]), 0);
  const oldest = summary.oldestQueuedAt;
  const waited = oldest ? age(oldest, tr) : "";
  const slow =
    summary.delivery === "on" &&
    oldest !== null &&
    Date.now() - Date.parse(oldest) > SLOW_QUEUE_MINUTES * 60000;
  const warnings = [
    summary.delivery === "off" &&
      summary.queued > 0 &&
      tr("admin.followups.followupLifecycle.warningOff", { queued: summary.queued, age: waited }),
    summary.delivery === "no_sender" &&
      tr("admin.followups.followupLifecycle.warningNoSender", { queued: summary.queued }),
    slow &&
      tr("admin.followups.followupLifecycle.warningSlow", { queued: summary.queued, age: waited }),
    troubled > 0 && tr("admin.followups.followupLifecycle.warningFailures", { count: troubled }),
  ].filter((value): value is string => Boolean(value));
  return (
    <section className="followupLifecycle" aria-labelledby={title}>
      <header>
        <h4 id={title}>{tr("admin.followups.followupLifecycle.automatedEmails")}</h4>
        <span className="followupLifecycleState" data-state={summary.delivery}>
          {summary.delivery === "on"
            ? tr("admin.followups.followupLifecycle.deliveryOn")
            : summary.delivery === "off"
              ? tr("admin.followups.followupLifecycle.deliveryOff")
              : tr("admin.followups.followupLifecycle.deliveryNoSender")}
        </span>
      </header>
      <p className="followupLifecycleNote">{tr("admin.followups.followupLifecycle.intro")}</p>
      {warnings.map((warning) => (
        <p key={warning} className="followupLifecycleWarning" role="status">
          {warning}
        </p>
      ))}
      <div className="followupLifecycleTable">
        <table>
          <caption>{tr("admin.followups.followupLifecycle.last7Days")}</caption>
          <thead>
            <tr>
              <th scope="col">{tr("admin.followups.followupLifecycle.columnEmail")}</th>
              <th scope="col">{tr("admin.followups.followupLifecycle.columnSent")}</th>
              <th scope="col">{tr("admin.followups.followupLifecycle.columnQueued")}</th>
              <th scope="col">{tr("admin.followups.followupLifecycle.columnSkipped")}</th>
              <th scope="col">{tr("admin.followups.followupLifecycle.columnFailed")}</th>
              <th scope="col">
                <span className="srOnly">
                  {tr("admin.followups.followupLifecycle.columnPreview")}
                </span>
              </th>
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
                <td>
                  <button
                    type="button"
                    className="followupLifecyclePreviewButton"
                    aria-pressed={previewing === kind}
                    aria-label={tr("admin.followups.followupLifecycle.previewOf", {
                      kind: lifecycleKindLabel(kind, tr),
                    })}
                    onClick={() => setPreviewing((value) => (value === kind ? null : kind))}
                  >
                    {tr("admin.followups.followupLifecycle.preview")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {previewing && (
        <LifecyclePreviewPanel kind={previewing} onClose={() => setPreviewing(null)} />
      )}
      {budget?.lifecycleUsage && (
        <p className="followupLifecycleNote">
          {tr("admin.followups.followupLifecycle.sentThroughAccount", {
            count: budget.lifecycleUsage.daily,
          })}
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
      <h4>{tr("admin.followups.followupLifecycle.automatedEmails")}</h4>
      {emails === null && (
        <p className="adminNoData">{tr("admin.followups.followupLifecycle.historyUnavailable")}</p>
      )}
      {emails?.length === 0 && (
        <p className="adminNoData">{tr("admin.followups.followupLifecycle.historyEmpty")}</p>
      )}
      {emails?.map((email) => (
        <article className="followupHistoryItem" key={email.id} data-kind="lifecycle">
          <header>
            <div>
              <strong>{lifecycleKindLabel(email.kind, tr)}</strong>
              <small>
                {tr("admin.followups.followupLifecycle.automated") +
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
