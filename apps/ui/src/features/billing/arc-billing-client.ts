import {
  canonicalErrorEnvelope,
  canonicalErrorCode,
} from "../../../../../packages/protocol/src/error-codes.js";
import { CONNECT_FAIR_USE, CONNECT_UNLIMITED_PLAN_ID } from "@remotearc/protocol";
import { productRequestHeaders } from "../../lib/product-events.js";
import { billingRecovery } from "../../../../../packages/protocol/src/billing-recovery.js";
import type { ArcAccess } from "../arc/chat/use-arc-chat.js";
import type { FreeOverflow } from "../../types/app-types.js";
export type BillingPlan = {
  versionId?: string;
  id: string;
  label: string;
  monthlyPriceCents: number;
  /** Connect Unlimited only, once a yearly price is published. */
  yearlyPriceCents?: number | null;
  monthlyCredits: number;
  connectToolCalls: number | null;
  concurrentRuns: number;
  maxSeconds: number;
  deviceLimit?: number | null;
  allHostedModels?: boolean;
};
export type BillingInterval = "month" | "year";
export type NativePaymentSession = {
  clientSecret: string;
  publishableKey: string;
  sessionId?: string;
  id?: string;
  mode?: "embedded_page" | "elements";
  billingAddress?: boolean;
};
export type BillingDetails = {
  paymentMethod:
    | null
    | {
        type: "card";
        brand: string;
        last4: string;
        expMonth: number;
        expYear: number;
        wallet?: "apple_pay" | "google_pay";
      }
    | { type: "link" | "other" };
  invoices: {
    id: string;
    number: string | null;
    status: string;
    currency: string;
    amountPaid: number;
    amountDue: number;
    createdAt: string;
    pdfUrl: string | null;
  }[];
  hasMore: boolean;
};
export type ArcBilling = {
  embeddedCheckoutEnabled?: boolean;
  subscriptionManagementEnabled?: boolean;
  enabled: boolean;
  connectEnabled?: boolean;
  portalEnabled?: boolean;
  hasCustomer?: boolean;
  plan: BillingPlan;
  access?: ArcAccess;
  credits: { available: number; pending: number };
  usage: { month?: string; used: number; limit: number | null; freeOverflow?: FreeOverflow };
  transfer?: { used: number; limit: number | null };
  plans: BillingPlan[];
  topups: { versionId?: string; id: string; credits: number; priceCents: number }[];
  models: {
    id: string;
    label: string;
    inputCreditsPer1000: number;
    outputCreditsPer1000: number;
  }[];
  subscriptions: {
    revision?: number;
    status: string;
    period_end: string;
    cancel_at_period_end: number;
    pending_product_id?: string | null;
    pending_effective_at?: string | null;
    billing_interval?: BillingInterval;
    pending_billing_interval?: BillingInterval | null;
  }[];
};
export class BillingFailure extends Error {
  constructor(
    code: string,
    readonly reference?: string,
  ) {
    super(canonicalErrorCode(code) || code);
  }
}
export async function billingRequest<T>(
  path = "",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch("/api/billing" + (path ? "/" + path : ""), {
    credentials: "same-origin",
    signal,
    headers: {
      accept: "application/json",
      ...productRequestHeaders(),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  const result = await response
    .json()
    .then(canonicalErrorEnvelope)
    .catch(() => null);
  if (!response.ok || !result)
    throw new BillingFailure(
      typeof result?.error === "string" ? result.error : "BILLING_UNAVAILABLE",
      typeof result?.reference === "string" && /^req_[\w]{1,160}$/.test(result.reference)
        ? result.reference
        : undefined,
    );
  return result as T;
}
export function secureBillingUrl(value: unknown) {
  if (typeof value !== "string") throw new BillingFailure("BILLING_UNAVAILABLE");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)
  )
    throw new BillingFailure("BILLING_UNAVAILABLE");
  return url.href;
}
/** Monthly Connect allowances reset at the start of each UTC month ("YYYY-MM" usage key). */
export const usageResetAt = (month: string) => {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, index!, 1));
};
export const transferSize = (bytes: number) =>
  bytes >= 1024 ** 3
    ? (bytes / 1024 ** 3).toFixed(2).replace(/\.?0+$/, "") + " GB"
    : Math.round(bytes / 1024 ** 2) + " MB";
/** Connect Unlimited: paid remote execution; no monthly Credits or hosted Arc beyond the one-time trial. */
export const isConnectOnlyPlan = (plan: { id: string }) => plan.id === CONNECT_UNLIMITED_PLAN_ID;
export function connectPlanFeatures(tr: (en: string, zh: string) => string) {
  const registrationsPerDay = CONNECT_FAIR_USE.computerRegistrationsPerDay;
  return [
    tr(
      "Your agents at full speed all month · no call cap, no slow lane",
      "agent 整月全速运行 · 不限调用次数，没有慢速通道",
    ),
    tr(
      "Unlimited Connect calls · published fair-use rate limits only",
      "无限 Connect 调用 · 仅有公开的合理使用速率限制",
    ),
    tr(
      "Unlimited registered computers, each authenticated and revocable",
      "不限已注册电脑数量，每台独立认证、可随时撤销",
    ),
    tr("Unlimited file transfer", "不限文件传输量"),
    tr(
      `Up to ${registrationsPerDay} new computers per day · runs follow each computer’s own capacity`,
      `每天最多新增 ${registrationsPerDay} 台电脑 · 运行并发取决于每台电脑自身容量`,
    ),
    tr(
      "Local terminal, files, browser, Fleet and connected Apps",
      "本地终端、文件、浏览器、Fleet 与已连接应用",
    ),
    tr(
      "Bring your own ChatGPT, Claude or Codex · no monthly Credits; Arc after the free trial needs Plus",
      "使用你自己的 ChatGPT、Claude 或 Codex · 不含月度 Credits；免费试用后使用 Arc 需要 Plus",
    ),
  ];
}
export function billingFailureMessage(error: unknown, tr: (en: string, zh: string) => string) {
  const code = error instanceof Error ? canonicalErrorCode(error.message) || error.message : "";
  if (code === "UNAUTHORIZED")
    return tr(
      "Your session expired. Sign in again before continuing.",
      "登录状态已过期，请重新登录后继续。",
    );
  const recovery = billingRecovery(code);
  return recovery
    ? tr(...recovery.message)
    : tr(
        "This billing request could not be completed. Check your current payment status before retrying, and keep the error reference if you need help.",
        "支付请求未能完成。请先核对当前付款状态再重试，如需帮助请保留错误编号。",
      );
}
