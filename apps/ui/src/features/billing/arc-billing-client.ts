import type { Translate } from "../../locales/locale-catalog.js";
import {
  canonicalErrorEnvelope,
  canonicalErrorCode,
} from "../../../../../packages/protocol/src/error-codes.js";
import {
  CONNECT_FAIR_USE,
  CONNECT_UNLIMITED_PLAN_ID,
  PRO_CHECKOUT_SLUG,
} from "@remotearc/protocol";
import { productRequestHeaders } from "../../lib/product-events.js";
import { billingRecovery } from "../../../../../packages/protocol/src/billing-recovery.js";
import type { ArcAccess } from "../../hooks/arc/use-arc-chat.js";
import type { AfterAllowance, FreeOverflow } from "../../types/app-types.js";
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
  usage: {
    month?: string;
    used: number;
    limit: number | null;
    freeOverflow?: FreeOverflow;
    afterAllowance?: AfterAllowance;
  };
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
/**
 * What the earlier subscription checkout allows: resume it, check its payment
 * status, or wait for an order whose provider session never reported back.
 * "close" is set by the client after resume fails: the order can still be closed.
 */
export type CheckoutRecovery = {
  action: "resume" | "status" | "wait" | "close";
  sessionId?: string;
  productId: string;
  interval: BillingInterval;
  expiresAt?: string;
  label?: string;
  amountCents?: number;
};
function validCheckoutRecovery(value: unknown): CheckoutRecovery | undefined {
  if (!value || typeof value !== "object") return;
  const row = value as Record<string, unknown>;
  if (
    !["resume", "status", "wait"].includes(String(row.action)) ||
    (row.action === "wait"
      ? row.sessionId !== undefined
      : typeof row.sessionId !== "string" || !/^cs_[A-Za-z0-9_]{1,180}$/.test(row.sessionId)) ||
    typeof row.productId !== "string" ||
    !/^[a-z0-9-]{1,80}$/.test(row.productId) ||
    !["month", "year"].includes(String(row.interval))
  )
    return;
  return {
    action: row.action as CheckoutRecovery["action"],
    ...(typeof row.sessionId === "string" ? { sessionId: row.sessionId } : {}),
    productId: row.productId,
    interval: row.interval as BillingInterval,
    ...(typeof row.label === "string" && row.label.length <= 120 ? { label: row.label } : {}),
    ...(typeof row.amountCents === "number" &&
    Number.isSafeInteger(row.amountCents) &&
    row.amountCents >= 0
      ? { amountCents: row.amountCents }
      : {}),
    ...(typeof row.expiresAt === "string" && !Number.isNaN(Date.parse(row.expiresAt))
      ? { expiresAt: row.expiresAt }
      : {}),
  };
}
export class BillingFailure extends Error {
  constructor(
    code: string,
    readonly reference?: string,
    readonly checkoutRecovery?: CheckoutRecovery,
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
      validCheckoutRecovery(result?.recovery),
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
/** Connect Unlimited: paid remote execution. Older versions are Connect-only; a
 * version with monthly Credits also includes hosted Arc (see planIncludesArc). */
export const isConnectOnlyPlan = (plan: { id: string }) => plan.id === CONNECT_UNLIMITED_PLAN_ID;
/** A plan that grants monthly Credits also includes hosted Arc. */
export const planIncludesArc = (plan: { monthlyCredits?: number } | undefined) =>
  (plan?.monthlyCredits ?? 0) > 0;
/** The higher tier, sold as Max once the paid plan includes Arc. */
export const MAX_PLAN_ID = "arc-pro-v1";
/** Once the paid plan includes Arc, the plans on offer are Free, Pro and Max; Arc
 * Plus is no longer sold (the server refuses it too). */
export const offeredPlans = <P extends { id: string; monthlyCredits?: number }>(
  plans: readonly P[],
) => {
  const bundled = planIncludesArc(plans.find(isConnectOnlyPlan));
  return plans.filter(
    (plan) => !bundled || plan.id === "free" || isConnectOnlyPlan(plan) || plan.id === MAX_PLAN_ID,
  );
};
/** A Connect-only subscription can move to a version of the same plan with Arc. */
export const addsArc = (
  current: { id: string; monthlyCredits?: number },
  target: { id: string; monthlyCredits?: number } | undefined,
) =>
  Boolean(
    target && target.id === current.id && !planIncludesArc(current) && planIncludesArc(target),
  );
/** Checkout links name the paid plan "pro"; the API uses its internal id. */
export const checkoutProductId = (value: string) =>
  value === PRO_CHECKOUT_SLUG ? CONNECT_UNLIMITED_PLAN_ID : value;
export const checkoutProductSlug = (id: string) =>
  id === CONNECT_UNLIMITED_PLAN_ID ? PRO_CHECKOUT_SLUG : id;
export const checkoutHref = (id: string) =>
  "/checkout?product=" + encodeURIComponent(checkoutProductSlug(id));
export function connectPlanFeatures(
  tr: Translate,
  plan?: { monthlyCredits?: number; deviceLimit?: number | null },
) {
  const registrationsPerDay = CONNECT_FAIR_USE.computerRegistrationsPerDay;
  if (planIncludesArc(plan))
    return [
      tr("billing.arcBillingClient.yourAgentsAtFullSpeedAll"),
      tr("billing.arcBillingClient.arcCreditsEveryMonth", {
        credits: plan!.monthlyCredits!.toLocaleString(),
      }),
      tr("billing.arcBillingClient.unlimitedConnectCallsPublishedFairUse"),
      plan!.deviceLimit != null
        ? tr("billing.arcBillingClient.upToComputersEachAuthenticated", {
            computers: plan!.deviceLimit.toLocaleString(),
          })
        : tr("billing.arcBillingClient.unlimitedRegisteredComputersEachAuthenticatedAnd"),
      tr("billing.arcBillingClient.unlimitedFileTransfer"),
      tr("billing.arcBillingClient.localTerminalFilesBrowserFleetAnd"),
      tr("billing.arcBillingClient.bringYourOwnAiOrLetArc"),
    ];
  return [
    tr("billing.arcBillingClient.yourAgentsAtFullSpeedAll"),
    tr("billing.arcBillingClient.unlimitedConnectCallsPublishedFairUse"),
    tr("billing.arcBillingClient.unlimitedRegisteredComputersEachAuthenticatedAnd"),
    tr("billing.arcBillingClient.unlimitedFileTransfer"),
    tr("billing.arcBillingClient.upToNewComputersPerDay", { registrationsPerDay }),
    tr("billing.arcBillingClient.localTerminalFilesBrowserFleetAnd"),
    tr("billing.arcBillingClient.bringYourOwnChatgptClaudeOr"),
  ];
}
export function billingFailureMessage(error: unknown, tr: Translate) {
  const code = error instanceof Error ? canonicalErrorCode(error.message) || error.message : "";
  if (code === "UNAUTHORIZED") return tr("billing.arcBillingClient.yourSessionExpiredSignInAgain");
  const recovery = billingRecovery(code);
  return recovery
    ? tr(...recovery.message)
    : tr("billing.arcBillingClient.thisBillingRequestCouldNotBe");
}
