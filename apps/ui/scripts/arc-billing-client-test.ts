import { createTranslator, loadLocale } from "../src/locales/locale-catalog.js";
import assert from "node:assert/strict";
import {
  billingRequest,
  billingFailureMessage,
  secureBillingUrl,
  BillingFailure,
  connectPlanFeatures,
  offeredPlans,
  planIncludesArc,
  transferSize,
  usageResetAt,
} from "../src/features/billing/arc-billing-client.js";
import {
  billingRecovery,
  paymentStatusHref,
} from "../../../packages/protocol/src/billing-recovery.js";
await loadLocale("en", "all");
const en = createTranslator("en");
assert.equal(new BillingFailure("unauthorized").message, "UNAUTHORIZED");
assert.match(billingFailureMessage(Error("unauthorized"), en), /Sign in again/);
assert.match(
  billingFailureMessage(new BillingFailure("BILLING_INVALID_PLAN_CHANGE"), en),
  /current subscription/i,
  "existing subscriptions need management guidance, not another checkout attempt",
);
assert.match(
  billingFailureMessage(new BillingFailure("BILLING_CREDITS_EXHAUSTED"), en),
  /balance/i,
);
assert.match(
  billingFailureMessage(new BillingFailure("BILLING_CHECKOUT_AWAITING_CONFIRMATION"), en),
  /Do not pay again/i,
);
for (const code of [
  "app_connection_limit",
  "MONTHLY_LIMIT_REACHED",
  "BINARY_TRANSFER_LIMIT_REACHED",
  "BILLING_CREDITS_EXHAUSTED",
  "PLAN_UPGRADE_REQUIRED",
]) {
  const guidance = billingRecovery(code)!;
  assert(
    guidance.actions.some((action) => action.href === "/settings?section=billing"),
    code + " needs a working path to plan and payment options",
  );
  assert(guidance.message[0] && guidance.message[1], code + " needs English and Chinese guidance");
}
assert.match(billingRecovery("MONTHLY_LIMIT_REACHED")!.message[0], /next UTC month/);
for (const code of [
  "app_daily_limit_reached",
  "app_rate_limited",
  "BILLING_QUOTA_OR_AUTHORITY_UNAVAILABLE",
  "ARC_FUNDING_PAUSED_OR_LIMIT",
]) {
  assert(
    !billingRecovery(code)!.actions.some((action) => action.href === "/checkout"),
    code + " must not imply that payment removes a service limit",
  );
}
for (const code of [
  "BILLING_SIGNATURE_INVALID",
  "BILLING_CUSTOMER_MISMATCH",
  "BILLING_CONFIGURATION_INVALID",
]) {
  const guidance = billingRecovery(code)!;
  assert.equal(guidance.retry, "check_status");
  assert(guidance.actions.some((action) => action.href.includes("/support")));
}
assert.equal(billingRecovery("unknown_private_canary"), null);
assert(
  !billingFailureMessage(Error("secret_private_canary"), en).includes("secret_private_canary"),
);
assert.equal(
  paymentStatusHref("cs_test_owned"),
  "/checkout?checkout=success&session_id=cs_test_owned",
);
for (const value of [
  "https://evil.invalid",
  "cs_test_owned&checkout=charge",
  "javascript:alert(1)",
])
  assert.equal(paymentStatusHref(value), "/settings?section=billing");
assert.equal(
  usageResetAt("2026-10").toISOString(),
  "2026-11-01T00:00:00.000Z",
  "allowances renew at the next UTC month",
);
assert.equal(
  usageResetAt("2026-12").toISOString(),
  "2027-01-01T00:00:00.000Z",
  "December renews in January",
);
assert.deepEqual(
  [
    transferSize(0),
    transferSize(380 * 1024 ** 2),
    transferSize(1.5 * 1024 ** 3),
    transferSize(2 * 1024 ** 3),
  ],
  ["0 MB", "380 MB", "1.5 GB", "2 GB"],
);
// Plans on offer: Plus and Pro step back once Connect Unlimited includes Credits,
// except for an account that already has them or a Connect-only subscriber.
const catalog = (connectCredits: number) => [
    { id: "free", monthlyCredits: 0 },
    { id: "connect-unlimited-v1", monthlyCredits: connectCredits },
    { id: "arc-plus-v1", monthlyCredits: 1500 },
    { id: "arc-pro-v1", monthlyCredits: 5000 },
  ],
  ids = (plans: Array<{ id: string }>) => plans.map((plan) => plan.id);
assert.deepEqual(ids(offeredPlans(catalog(0))), ids(catalog(0)), "Connect-only: every plan");
assert.deepEqual(ids(offeredPlans(catalog(1000))), ["free", "connect-unlimited-v1"]);
assert.deepEqual(ids(offeredPlans(catalog(1000), { id: "arc-pro-v1", monthlyCredits: 5000 })), [
  "free",
  "connect-unlimited-v1",
  "arc-pro-v1",
]);
assert.deepEqual(
  ids(offeredPlans(catalog(1000), { id: "connect-unlimited-v1", monthlyCredits: 0 })),
  ids(catalog(1000)),
  "A Connect-only subscriber can still add Arc with Plus",
);
assert.deepEqual(
  [planIncludesArc({ monthlyCredits: 1000 }), planIncludesArc({ monthlyCredits: 0 })],
  [true, false],
);
assert.equal(planIncludesArc(undefined), false);
const bundledFeatures = connectPlanFeatures(en, { monthlyCredits: 1000 });
assert(bundledFeatures.some((item) => item.includes("1,000 Arc Credits every month")));
assert(!bundledFeatures.some((item) => /needs Plus/.test(item)));
assert(connectPlanFeatures(en).some((item) => /no monthly Credits/.test(item)));
const original = globalThis.fetch;
let requests = 0;
try {
  globalThis.fetch = (async (path, init) => {
    requests++;
    assert.equal(path, "/api/billing/checkout");
    assert.equal(init?.credentials, "same-origin");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      productId: "plus",
      versionId: "version-reviewed",
    });
    return Response.json(
      { error: "BILLING_PROVIDER_ERROR", reference: "req_safe_reference" },
      { status: 503 },
    );
  }) as typeof fetch;
  await assert.rejects(
    () => billingRequest("checkout", { productId: "plus", versionId: "version-reviewed" }),
    (error: any) => error instanceof BillingFailure && error.reference === "req_safe_reference",
  );
  assert.equal(requests, 1, "A provider failure does not trigger an automatic POST retry");
  for (const value of [
    "https://checkout.stripe.com.evil.invalid/a",
    "https://checkout.stripe.com@evil.invalid/a",
    "http://checkout.stripe.com/a",
    "javascript:alert(1)",
    "https://user:password@checkout.stripe.com/a",
  ])
    assert.throws(() => secureBillingUrl(value));
  assert.equal(
    secureBillingUrl("https://checkout.stripe.com/c/pay/synthetic"),
    "https://checkout.stripe.com/c/pay/synthetic",
  );
  assert.equal(
    secureBillingUrl("https://billing.stripe.com/p/session/synthetic"),
    "https://billing.stripe.com/p/session/synthetic",
  );
  console.log(
    "PASS: reviewed price version, same-origin billing, safe request references, no automatic POST replay and exact Stripe redirect hosts",
  );
} finally {
  globalThis.fetch = original;
}
