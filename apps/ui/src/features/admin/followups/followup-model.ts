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
export type ContactDetail = {
  contact: Contact;
  messages: Mail[];
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
export function followupReason(code: string | null, tr: (en: string, zh: string) => string) {
  return (
    (
      {
        RECIPIENT_SUPPRESSED: tr("Follow-ups stopped", "已停止接收"),
        CONTACT_PERMISSION_REQUIRED: tr("No recorded contact basis", "尚无联系依据"),
        CONTACT_COOLDOWN: tr("Contacted within 72 hours", "72 小时内已联系"),
        CONTACT_COOLDOWN_OR_IN_PROGRESS: tr(
          "Recently contacted or sending",
          "近期已联系或正在发送",
        ),
        DELIVERY_UNCONFIRMED: tr("Delivery needs checking", "投递状态待核实"),
        RECIPIENT_CHANGED: tr("Recipient address changed", "收件邮箱已变更"),
        EMAIL_NOT_CONFIGURED: tr("Email channel unavailable", "发信通道未配置"),
        ACTOR_NO_LONGER_ADMIN: tr("Operator access changed", "操作员权限已变更"),
        SENDER_CHANGED: tr(
          "Sender configuration changed; prepare again",
          "发件配置已变更，请重新准备",
        ),
        BATCH_CANCELLED: tr("Cancelled", "已取消"),
        BATCH_NOT_QUEUED: tr("Batch cancelled or not queued", "任务已取消或未入队"),
        PROVIDER_429: tr("Waiting for email service capacity", "等待发信服务恢复额度"),
        NO_ELIGIBLE_RECIPIENTS: tr("No eligible recipients in this batch", "本批次暂无可发送用户"),
        BATCH_NOT_READY: tr("Batch is not ready to send", "任务尚未准备完成"),
        BATCH_CONFLICT: tr(
          "This batch changed. Prepare a new batch.",
          "任务内容已变更，请重新准备",
        ),
        BATCH_MANAGED_MESSAGE: tr(
          "Manage this email in Bulk history.",
          "请在群发记录中管理此邮件。",
        ),
        DAILY_EMAIL_BUDGET_REACHED: tr(
          "The daily follow-up limit is reached. Your draft is kept; queued emails continue when capacity returns.",
          "跟进邮件已达每日上限，草稿已保留，排队邮件会在额度恢复后继续发送。",
        ),
        HOURLY_EMAIL_BUDGET_REACHED: tr(
          "The hourly follow-up limit is reached. Queued emails continue when capacity returns.",
          "跟进邮件已达小时上限，排队邮件会在额度恢复后继续发送。",
        ),
        MONTHLY_EMAIL_BUDGET_REACHED: tr(
          "The monthly follow-up allocation is used. Queued emails wait for capacity.",
          "跟进邮件已达月度额度，排队邮件将等待额度恢复。",
        ),
      } as Record<string, string>
    )[canonicalErrorCode(code) || ""] ||
    (canonicalErrorCode(code)?.startsWith("PROVIDER_")
      ? tr("Email service rejected the request", "发信服务未接受此请求")
      : tr(
          "Could not confirm the action. Your work is kept.",
          "暂时无法确认操作结果，内容已保留。",
        ))
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
