import type { Translate } from "../../../locales/locale-catalog.js";
import {
  canonicalErrorEnvelope,
  canonicalErrorCode,
} from "../../../../../../packages/protocol/src/error-codes.js";
import { followupTemplate } from "../../../../../../packages/protocol/src/followup-templates.js";
import {
  DEFAULT_FOLLOWUP_DESIGN,
  type FollowupDesign,
} from "../../../../../../packages/protocol/src/followup-email.js";
export type NextStep = "pair_computer" | "connect_ai" | "first_use" | "active";
// The template that helps with each user's next step.
export const NEXT_STEP_TEMPLATE: Record<NextStep, string> = {
  pair_computer: "pair-computer",
  connect_ai: "finish-mcp",
  first_use: "first-result",
  active: "experience",
};
export type Person = {
  id: string;
  email: string;
  name: string | null;
  devices: number;
  computers?: number;
  next_step?: NextStep;
  apps: number;
  calls: number;
  monthly_calls?: number;
  monthly_limit?: number | null;
  arc_runs: number;
  mcp_connections?: number;
  queued_followups?: number;
  status: string | null;
  note: string | null;
  next_followup_at: string | null;
  consent_at: string | null;
  suppressed_at: string | null;
  last_contact_at: string | null;
  feedback_count: number;
};
export type Contact = {
  status: string;
  note: string;
  next_followup_at: string | null;
  consent_at: string | null;
  consent_note: string;
  suppressed_at: string | null;
};
export type Mail = {
  id: string;
  template_id: string;
  locale: "en" | "zh";
  subject: string;
  body: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  error_code: string | null;
  html_body: string | null;
  design_json: string | null;
  draft_revision: number;
  batch_id?: string | null;
  batch_status?: string | null;
  batch_recipient_status?: string | null;
};
export type LifecycleKind =
  "welcome" | "setup_reminder" | "connect_trial_started" | "connect_trial_ending" | "plan_started";
export type LifecycleStatus = "queued" | "sending" | "sent" | "failed" | "unknown" | "skipped";
/** An automated email the product sent (or skipped) for one person. */
export type LifecycleEmail = {
  id: string;
  kind: LifecycleKind;
  status: LifecycleStatus;
  error_code: string | null;
  created_at: string;
  attempted_at: string | null;
  sent_at: string | null;
};
/** Sample setup progress for previewing the emails that adapt to it. The setup
 * reminder is never sent once setup is done, so it has no "ready" stage. */
export const WELCOME_SETUPS = ["new", "connected", "paired", "ready"] as const;
export type WelcomeSetup = (typeof WELCOME_SETUPS)[number];
export const setupPreviewsFor = (kind: LifecycleKind): readonly WelcomeSetup[] =>
  kind === "welcome"
    ? WELCOME_SETUPS
    : kind === "setup_reminder"
      ? WELCOME_SETUPS.filter((setup) => setup !== "ready")
      : [];
/** One automated email rendered by the relay with sample dates, for review. */
export type LifecyclePreview = {
  kind: LifecycleKind;
  locale: "en" | "zh";
  setup?: WelcomeSetup;
  subject: string;
  html: string;
  text: string;
};
export type LifecycleSummary = {
  delivery: "on" | "off" | "no_sender";
  queued: number;
  oldestQueuedAt: string | null;
  since: string;
  recent: Array<{ kind: LifecycleKind; status: LifecycleStatus; count: number }>;
};
export type ContactDetail = {
  contact: Contact;
  messages: Mail[];
  /** Null when the automated-email history could not be read. */
  lifecycleEmails?: LifecycleEmail[] | null;
  rewardAvailable?: boolean;
  emailConfigured: boolean;
  sender?: { from: string; replyTo: string } | null;
};
export type EmailDraft = {
  id: string;
  templateId: string;
  locale: "en" | "zh";
  subject: string;
  body: string;
  design: FollowupDesign;
  revision: number | null;
  savedFingerprint: string | null;
  html: string | null;
  edited: boolean;
};
export type FollowupTab = "all" | "pending" | "contacted" | "waiting" | "resolved" | "suppressed";
export type EmailBudget = {
  limit: number;
  used: number;
  remaining: number;
  provider?: "resend" | "sendpulse";
  hourly?: { limit: number; used: number; remaining: number };
  monthly?: { limit: number; used: number; remaining: number; windowDays: number };
  otpUsage?: { daily: number; hourly: number; monthly: number };
  lifecycleUsage?: { daily: number; hourly: number; monthly: number };
};
export function followupBudgetSummary(budget: EmailBudget) {
  return [
    budget.provider === "sendpulse" ? "SendPulse" : "Resend",
    `24h ${budget.used}/${budget.limit}`,
    budget.hourly && `1h ${budget.hourly.used}/${budget.hourly.limit}`,
    budget.monthly &&
      `${budget.monthly.windowDays}d ${budget.monthly.used}/${budget.monthly.limit}`,
    budget.otpUsage && `OTP 24h ${budget.otpUsage.daily}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
export type FollowupFunnel = {
  registered: number;
  paired: number;
  connected: number;
  used: number;
} & Record<NextStep, number>;
export type FollowupList = {
  items: Person[];
  total: number;
  emailConfigured: boolean;
  counts: Record<FollowupTab | "due", number>;
  funnel?: FollowupFunnel;
  emailBudget?: EmailBudget;
  /** Null when the automated-email summary could not be read. */
  lifecycle?: LifecycleSummary | null;
};
export type FollowupBatch = {
  id: string;
  title: string;
  template_id: string;
  locale: "en" | "zh";
  status: string;
  created_at: string;
  queued_at: string | null;
  finished_at: string | null;
  total: number;
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  unknown: number;
  skipped: number;
  cancelled: number;
};
export type BatchRecipient = {
  user_id: string;
  message_id: string | null;
  name: string | null;
  email: string;
  subject: string | null;
  body: string | null;
  status: string;
  error_code: string | null;
  attempts: number;
  sent_at: string | null;
};
export type BatchDetail = {
  batch: FollowupBatch;
  recipients: BatchRecipient[];
  preview: { user_id: string; subject: string; html_body: string } | null;
  sender: { from: string; replyTo: string };
  basis: string;
  basisNote: string;
  emailConfigured: boolean;
  emailBudget?: EmailBudget;
};
export const followupStatus = (person: Person) =>
  person.suppressed_at
    ? "suppressed"
    : person.status || (person.last_contact_at ? "contacted" : "new");
export function followupReason(code: string | null, tr: Translate) {
  return (
    (
      {
        RECIPIENT_SUPPRESSED: tr("admin.followups.followupModel.followUpsStopped"),
        CONTACT_PERMISSION_REQUIRED: tr("admin.followups.followupModel.noRecordedContactBasis"),
        CONTACT_COOLDOWN: tr("admin.followups.followupModel.contactedWithinHours"),
        CONTACT_COOLDOWN_OR_IN_PROGRESS: tr(
          "admin.followups.followupModel.recentlyContactedOrSending",
        ),
        DELIVERY_UNCONFIRMED: tr("admin.followups.followupModel.deliveryNeedsChecking"),
        RECIPIENT_CHANGED: tr("admin.followups.followupModel.recipientAddressChanged"),
        EMAIL_NOT_CONFIGURED: tr("admin.followups.followupModel.emailChannelUnavailable"),
        ACTOR_NO_LONGER_ADMIN: tr("admin.followups.followupModel.operatorAccessChanged"),
        SENDER_CHANGED: tr("admin.followups.followupModel.senderConfigurationChangedPrepareAgain"),
        BATCH_CANCELLED: tr("admin.followups.followupModel.cancelled"),
        BATCH_NOT_QUEUED: tr("admin.followups.followupModel.batchCancelledOrNotQueued"),
        PROVIDER_429: tr("admin.followups.followupModel.waitingForEmailServiceCapacity"),
        NO_ELIGIBLE_RECIPIENTS: tr("admin.followups.followupModel.noEligibleRecipientsInThisBatch"),
        BATCH_NOT_READY: tr("admin.followups.followupModel.batchIsNotReadyToSend"),
        BATCH_CONFLICT: tr("admin.followups.followupModel.thisBatchChangedPrepareANew"),
        BATCH_MANAGED_MESSAGE: tr("admin.followups.followupModel.manageThisEmailInBulkHistory"),
        DAILY_EMAIL_BUDGET_REACHED: tr("admin.followups.followupModel.theDailyFollowUpLimitIs"),
        HOURLY_EMAIL_BUDGET_REACHED: tr("admin.followups.followupModel.theHourlyFollowUpLimitIs"),
        MONTHLY_EMAIL_BUDGET_REACHED: tr(
          "admin.followups.followupModel.theMonthlyFollowUpAllocationIs",
        ),
      } as Record<string, string>
    )[canonicalErrorCode(code) || ""] ||
    (canonicalErrorCode(code)?.startsWith("PROVIDER_")
      ? tr("admin.followups.followupModel.emailServiceRejectedTheRequest")
      : tr("admin.followups.followupModel.couldNotConfirmTheActionYour"))
  );
}
export const followupTime = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "—";
export const draftFingerprint = (draft: EmailDraft) =>
  JSON.stringify([
    draft.templateId,
    draft.locale,
    draft.subject.trim(),
    draft.body.trim(),
    draft.design,
  ]);
export const draftDirty = (draft: EmailDraft) => draftFingerprint(draft) !== draft.savedFingerprint;
export function newFollowupDraft(
  person: Person,
  locale: "en" | "zh" = "en",
  templateId = person.next_step
    ? NEXT_STEP_TEMPLATE[person.next_step]
    : person.devices > 0 && person.mcp_connections === 0
      ? "finish-mcp"
      : "experience",
): EmailDraft {
  const id = crypto.randomUUID(),
    site = "https://remotearc.app" + (locale === "zh" ? "/zh" : "");
  const text = followupTemplate(templateId, locale, {
    name: person.name || (locale === "zh" ? "朋友" : "there"),
    setupUrl: site + "/connect-ai",
    feedbackUrl: site + "/feedback?source=" + encodeURIComponent("followup:" + id),
  });
  return {
    id,
    templateId,
    locale,
    ...text,
    design: { ...DEFAULT_FOLLOWUP_DESIGN, highlights: [] },
    revision: null,
    savedFingerprint: null,
    html: null,
    edited: false,
  };
}
export function savedFollowupDraft(mail: Mail): EmailDraft {
  let design = { ...DEFAULT_FOLLOWUP_DESIGN, highlights: [] } as FollowupDesign;
  try {
    if (mail.design_json) design = { ...design, ...JSON.parse(mail.design_json) };
  } catch {
    /* Legacy drafts without a design use the default. */
  }
  const draft: EmailDraft = {
    id: mail.id,
    templateId: mail.template_id,
    locale: mail.locale,
    subject: mail.subject,
    body: mail.body,
    design,
    revision: mail.draft_revision || 1,
    savedFingerprint: null,
    html: mail.html_body,
    edited: false,
  };
  return { ...draft, savedFingerprint: draftFingerprint(draft) };
}
export class FollowupApiError extends Error {
  constructor(
    message: string,
    readonly data: Record<string, unknown> = {},
  ) {
    super(canonicalErrorCode(message) || message);
  }
}
export async function followupApi<T>(path: string, options?: RequestInit) {
  const response = await fetch("/api/admin/followups" + path, {
    credentials: "same-origin",
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
  });
  const data = await response
    .json()
    .then(canonicalErrorEnvelope)
    .catch(() => ({ error: "INVALID_RESPONSE" }));
  if (!response.ok) throw new FollowupApiError(data.error || "REQUEST_FAILED", data);
  return data as T;
}
