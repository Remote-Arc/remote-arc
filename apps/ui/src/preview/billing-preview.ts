import {
  ARC_PLANS,
  ARC_TOPUPS,
  ARC_PREMIUM_MODELS,
  CONNECT_FREE_OVERFLOW,
  CONNECT_UNLIMITED_PLAN_ID,
  FREE_BINARY_BYTES_PER_MONTH,
} from "@remotearc/protocol";
/**
 * The names production publishes today. ARC_PLANS keeps the seed versions'
 * original names, which must not change, so previews apply the current ones.
 */
export const PUBLISHED_PLAN_LABELS: Readonly<Record<string, string>> = {
  [CONNECT_UNLIMITED_PLAN_ID]: "Pro",
  "arc-pro-v1": "Max",
};
/**
 * The plan terms decided for publication (Remote-Arc/remote-arc-docs →
 * docs/plan-tracking-2026-11.zh.md). Production prices from its published
 * versions; previews show these terms so pages and tests match what is published.
 * Terms not listed keep production's current values.
 */
const PREVIEW_PLAN_TERMS: Readonly<Record<string, Record<string, unknown>>> = {
  free: {
    connectWriteCalls: 5000,
    routines: 1,
    connectionLimit: 2,
    notifications: false,
    unattendedBrowser: false,
    fleetRun: false,
    unattendedApps: false,
  },
  [CONNECT_UNLIMITED_PLAN_ID]: {
    yearlyPriceCents: 19000,
    monthlyCredits: 500,
    deviceLimit: 5,
    routines: 20,
    concurrentRuns: 2,
    maxSteps: 16,
    maxTokens: 48000,
    maxSeconds: 1800,
    allHostedModels: true,
    fleetRun: false,
  },
  "arc-pro-v1": {
    monthlyPriceCents: 4900,
    yearlyPriceCents: 49000,
    monthlyCredits: 3000,
    deviceLimit: 20,
    routines: 100,
    concurrentRuns: 5,
    maxSeconds: 3600,
  },
};
export const previewBillingPlans = ARC_PLANS.map((p) => ({
  ...p,
  label: PUBLISHED_PLAN_LABELS[p.id] ?? p.label,
  versionId: "preview:" + p.id,
  ...PREVIEW_PLAN_TERMS[p.id],
}));
const storageKey = "remote-arc-billing-preview-v1";
type State = {
  planId: string;
  revision: number;
  cancelled: boolean;
  pending: string | null;
  methodUpdated: boolean;
  /** The card-backed trial is offered (STRIPE_PRO_TRIAL), as decided; a demo may turn it off. */
  trialOffered?: boolean;
  /** The subscription's billing period. */
  interval?: "month" | "year";
  /** When the started Pro trial ends. */
  trialEndsAt?: string | null;
  orders: Record<
    string,
    {
      productId: string;
      interval?: "month" | "year";
      expiresAt?: string;
      status: "open" | "complete" | "expired";
      trial?: boolean;
    }
  >;
};
const PREVIEW_TRIAL = { days: 7, credits: 300 };
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });
/** Local demo state only. No provider, authentication or production API calls. */
export function createBillingPreview(storage: Pick<Storage, "getItem" | "setItem">, entry: URL) {
  let state: State = {
    planId: entry.pathname === "/checkout" ? "free" : "arc-plus-v1",
    revision: 0,
    cancelled: false,
    pending: null,
    methodUpdated: false,
    // ?protrial=off shows checkout as it works while the card-backed trial is off.
    trialOffered: entry.searchParams.get("protrial") !== "off",
    orders: {},
  };
  try {
    const saved = JSON.parse(storage.getItem(storageKey) || "null");
    if (
      saved &&
      ARC_PLANS.some((p) => p.id === saved.planId) &&
      Number.isSafeInteger(saved.revision) &&
      saved.orders &&
      typeof saved.orders === "object"
    )
      state = saved;
  } catch {}
  if (entry.searchParams.get("demo") === "new")
    state = { ...state, planId: "free", cancelled: false, pending: null, orders: {} };
  if (entry.searchParams.get("protrial") === "off") state = { ...state, trialOffered: false };
  const save = () => {
    try {
      storage.setItem(storageKey, JSON.stringify(state));
    } catch {}
  };
  save();
  const period = () => new Date(Date.now() + 30 * 86400000).toISOString(),
    // The decided terms, as checkout shows them: Pro includes Arc with 500 Credits.
    plan = () => previewBillingPlans.find((p) => p.id === state.planId) || previewBillingPlans[0]!;
  const plans = previewBillingPlans,
    topups = ARC_TOPUPS.map((p) => ({ ...p, versionId: "preview:" + p.id }));
  // Like the Relay's proTrialState: offered, then once per account, for Free only.
  const proTrial = () => {
    const reason =
      state.trialOffered === false
        ? "not_offered"
        : state.trialEndsAt
          ? "used"
          : plan().monthlyPriceCents
            ? "subscribed"
            : null;
    return {
      offered: state.trialOffered !== false,
      available: reason === null,
      reason,
      ...PREVIEW_TRIAL,
      trial: state.trialEndsAt
        ? {
            status: "trialing",
            startedAt: new Date(
              Date.parse(state.trialEndsAt) - PREVIEW_TRIAL.days * 86400000,
            ).toISOString(),
            endsAt: state.trialEndsAt,
            cancelAtPeriodEnd: state.cancelled,
            active: state.trialEndsAt > new Date().toISOString(),
          }
        : null,
    };
  };
  return {
    handle(url: URL, method: string, body: unknown): Response | null {
      if (!url.pathname.startsWith("/api/billing")) return null;
      const path = url.pathname.slice("/api/billing".length);
      let input: any = {};
      try {
        if (body) input = JSON.parse(String(body));
      } catch {
        return json({ error: "BILLING_INVALID_REQUEST" }, 400);
      }
      if (method === "GET" && path === "")
        return json({
          enabled: true,
          connectEnabled: true,
          embeddedCheckoutEnabled: true,
          subscriptionManagementEnabled: true,
          hasCustomer: true,
          plan: plan(),
          // With the card-backed trial on, a Free account has no Arc trial: it starts the
          // trial at checkout. With it off, the preview's Free account is in its Arc trial.
          access: {
            status: plan().monthlyPriceCents
              ? "paid"
              : state.trialOffered === false
                ? "active"
                : "eligible",
            canUse: Boolean(plan().monthlyPriceCents) || state.trialOffered === false,
            daysRemaining: 7,
            trialDays: PREVIEW_TRIAL.days,
            trialCredits: PREVIEW_TRIAL.credits,
            proTrial: state.trialOffered !== false,
            dailyUsedPercent: 0,
          },
          credits: {
            // A trial has the trial's Credits; a paid plan its monthly Credits.
            available: state.trialEndsAt
              ? PREVIEW_TRIAL.credits
              : plan().monthlyPriceCents
                ? plan().monthlyCredits
                : state.trialOffered === false
                  ? PREVIEW_TRIAL.credits
                  : 0,
            pending: 0,
          },
          usage: {
            month: new Date().toISOString().slice(0, 7),
            used: 1732,
            limit: plan().connectToolCalls,
            ...(plan().id === "free"
              ? {
                  afterAllowance: {
                    next: state.trialOffered === false ? "trial" : "slow_lane",
                    trialDays: CONNECT_FREE_OVERFLOW.trialDays,
                    slowLaneCallsPerMinute: CONNECT_FREE_OVERFLOW.slowLaneCallsPerMinute,
                  },
                }
              : {}),
          },
          transfer: {
            used: 380 * 1024 ** 2,
            limit: plan().id === "free" ? FREE_BINARY_BYTES_PER_MONTH : null,
          },
          plans,
          topups,
          models: ARC_PREMIUM_MODELS.map((m) => ({
            id: m.id,
            label: m.label,
            inputCreditsPer1000: m.inputMicrosPerMillion / 2000000,
            outputCreditsPer1000: m.outputMicrosPerMillion / 2000000,
          })),
          hostedModelFamilies: ["GPT", "Claude"],
          proTrial: proTrial(),
          subscriptions: plan().monthlyPriceCents
            ? [
                {
                  status: state.trialEndsAt ? "trialing" : "active",
                  period_end: state.trialEndsAt || period(),
                  billing_interval: state.interval ?? "month",
                  cancel_at_period_end: Number(state.cancelled),
                  revision: state.revision,
                  pending_product_id: state.pending,
                  pending_effective_at: state.pending ? period() : null,
                },
              ]
            : [],
        });
      if (method === "GET" && path === "/details")
        return json({
          paymentMethod: {
            type: "card",
            brand: "Visa",
            last4: state.methodUpdated ? "1881" : "4242",
            expMonth: 12,
            expYear: 2030,
          },
          invoices: plan().monthlyPriceCents
            ? [
                {
                  id: "in_preview",
                  number: "DEMO-1001",
                  status: "paid",
                  currency: "usd",
                  amountPaid: plan().monthlyPriceCents,
                  amountDue: 0,
                  createdAt: new Date().toISOString(),
                  pdfUrl: null,
                },
              ]
            : [],
          hasMore: false,
        });
      if (method === "POST" && path === "/checkout") {
        const session = (id: string, mode = "elements") =>
          json({
            mode,
            sessionId: id,
            clientSecret: "preview-only",
            publishableKey: "preview-only",
          });
        // Like the Relay: one unfinished subscription order at a time. A different
        // offer or billing period gets the original order back to resume or close.
        if (typeof input.resumeSessionId === "string") {
          const order = state.orders[input.resumeSessionId];
          if (!order) return json({ error: "NOT_FOUND" }, 404);
          if (order.status === "expired") return json({ error: "BILLING_CHECKOUT_EXPIRED" }, 409);
          if (order.status === "complete")
            return json({ error: "BILLING_CHECKOUT_AWAITING_CONFIRMATION" }, 409);
          return session(input.resumeSessionId);
        }
        if (![...plans, ...topups].some((p) => p.id === input.productId))
          return json({ error: "BILLING_INVALID_PRODUCT" }, 400);
        const interval = input.interval === "year" ? "year" : "month";
        if (input.trial === true) {
          if (![CONNECT_UNLIMITED_PLAN_ID, "arc-pro-v1"].includes(input.productId))
            return json({ error: "BILLING_INVALID_REQUEST" }, 400);
          const offer = proTrial();
          if (!offer.available)
            return json({ error: "PRO_TRIAL_UNAVAILABLE", reason: offer.reason }, 409);
        }
        let order = Object.entries(state.orders).find(([, order]) => order.status === "open");
        if (
          order &&
          (order[1].productId !== input.productId || (order[1].interval ?? "month") !== interval)
        ) {
          const held = plans.find((p) => p.id === order![1].productId);
          if (!held || !plans.some((p) => p.id === input.productId))
            return json({ error: "BILLING_CHECKOUT_IN_PROGRESS" }, 409);
          const heldInterval = order[1].interval ?? "month";
          return json(
            {
              error: "BILLING_CHECKOUT_ALREADY_OPEN",
              recovery: {
                action: "resume",
                sessionId: order[0],
                productId: held.id,
                interval: heldInterval,
                label: held.label,
                amountCents:
                  heldInterval === "year"
                    ? (held as { yearlyPriceCents?: number }).yearlyPriceCents
                    : held.monthlyPriceCents,
                ...(order[1].expiresAt ? { expiresAt: order[1].expiresAt } : {}),
              },
            },
            409,
          );
        }
        if (!order) {
          const id = "cs_preview_" + crypto.randomUUID().replaceAll("-", "");
          state.orders[id] = {
            productId: input.productId,
            interval,
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            status: "open",
            ...(input.trial === true ? { trial: true } : {}),
          };
          order = [id, state.orders[id]];
          save();
        }
        return session(order[0], input.uiMode === "elements" ? "elements" : "embedded_page");
      }
      if (method === "POST" && path === "/checkout/abandon") {
        const order = state.orders[input.sessionId];
        if (!order) return json({ error: "BILLING_CHECKOUT_NOT_FOUND" }, 404);
        if (order.status === "complete") return json({ complete: true });
        order.status = "expired";
        save();
        return json({ expired: true });
      }
      if (method === "POST" && path === "/preview/complete") {
        const order = state.orders[input.sessionId];
        if (!order || order.status === "expired")
          return json({ error: "BILLING_CHECKOUT_NOT_FOUND" }, 404);
        order.status = "complete";
        if (plans.some((p) => p.id === order.productId)) {
          state.planId = order.productId;
          state.interval = order.interval ?? "month";
        }
        if (order.trial)
          state.trialEndsAt = new Date(Date.now() + PREVIEW_TRIAL.days * 86400000).toISOString();
        save();
        return json({ complete: true });
      }
      if (method === "GET" && path === "/checkout-status")
        return json({
          status: state.orders[url.searchParams.get("session") || ""]?.status || "expired",
        });
      if (method === "POST" && path === "/subscription/renewal") {
        if (input.revision !== state.revision)
          return json({ error: "BILLING_SUBSCRIPTION_CHANGED" }, 409);
        if (!["cancel", "resume"].includes(input.action))
          return json({ error: "BILLING_INVALID_REQUEST" }, 400);
        state.cancelled = input.action === "cancel";
        if (state.cancelled) state.pending = null;
        state.revision++;
        save();
        return json({ cancelAtPeriodEnd: state.cancelled, effectiveAt: period() });
      }
      if (method === "POST" && (path === "/plan/change" || path === "/plan/preview")) {
        const target = plans.find((p) => p.id === input.productId && p.monthlyPriceCents > 0);
        if (!target) return json({ error: "BILLING_INVALID_PRODUCT" }, 400);
        const interval: "month" | "year" = input.interval === "year" ? "year" : "month",
          cents = (
            p: { monthlyPriceCents: number; yearlyPriceCents?: number | null },
            i: string,
          ) =>
            i === "year" ? p.yearlyPriceCents || p.monthlyPriceCents * 12 : p.monthlyPriceCents,
          priceCents = cents(target, interval),
          held = state.interval ?? "month",
          rank = (id: string) => ARC_PLANS.findIndex((p) => p.id === id);
        // Like the Relay: a trial switches for nothing, an upgrade is charged now less the
        // unused time (here 12 of 30 days), and anything else waits for the renewal.
        const mode = state.trialEndsAt
          ? "trial"
          : rank(target.id) > rank(state.planId) && !(held === "year" && interval === "month")
            ? "upgrade"
            : "scheduled";
        const creditCents = Math.round((cents(plan(), held) * 12) / 30);
        if (path === "/plan/preview")
          return json({
            mode,
            productId: target.id,
            interval,
            priceCents,
            ...(mode === "trial" ? { effectiveAt: state.trialEndsAt } : {}),
            ...(mode === "scheduled" ? { effectiveAt: period() } : {}),
            ...(mode === "upgrade"
              ? {
                  creditCents,
                  taxCents: 0,
                  totalCents: priceCents - creditCents,
                  renewsAt: new Date(
                    Date.now() + (interval === "year" ? 365 : 30) * 86400000,
                  ).toISOString(),
                }
              : {}),
          });
        if (mode === "scheduled") {
          state.pending = input.productId;
          state.revision++;
          save();
          return json({ scheduled: true, effectiveAt: period() });
        }
        state.planId = target.id;
        state.interval = interval;
        state.pending = null;
        state.revision++;
        save();
        return json(
          mode === "trial"
            ? { changed: true, trial: true, productId: target.id, interval }
            : { upgraded: true, productId: target.id, interval },
        );
      }
      if (method === "POST" && path === "/payment-method/setup")
        return json({
          id: "seti_preview",
          clientSecret: "preview-only",
          publishableKey: "preview-only",
        });
      if (method === "POST" && path === "/payment-method/confirm") {
        if (input.setupIntentId !== "seti_preview")
          return json({ error: "BILLING_PAYMENT_METHOD_NOT_READY" }, 409);
        state.methodUpdated = true;
        save();
        return json({ updated: true });
      }
      return null;
    },
  };
}
