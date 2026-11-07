// Connect Unlimited with Arc Credits: a published version may include monthly
// Credits and hosted models. A monthly invoice grants one lot; a yearly invoice
// grants one lot per month of the paid year, never twelve months at once.
// Refunds revoke every lot. Connect-only versions and their subscribers keep
// their terms, and forged month lots are refused.
import assert from "node:assert/strict";
import { ARC_CREDIT_RATE, ARC_PLANS, CONNECT_UNLIMITED_PLAN_ID } from "@remotearc/protocol";
import { createWorkerFixture } from "./worker-fixture.js";
import {
  commercialCatalog,
  planConfigSchema,
  publishCommercialDraft,
  saveCommercialDraft,
} from "../src/arc/arc-commercial-config.js";
import {
  creditBalance,
  creditMonthRef,
  creditMonths,
  grantArcCredits,
} from "../src/arc/arc-credits.js";
import { arcAccountAccess } from "../src/arc/arc-trial.js";
import { processStripeEvent, type BillingEnv } from "../src/billing/stripe-billing.js";

const fixture = createWorkerFixture(),
  { sql } = fixture;
const env = {
  ...fixture.env,
  ARC_BILLING_ENABLED: "1",
  ARC_CHAT_ENABLED: "1",
  ARC_CREDITS_ENABLED: "1",
  ARC_BILLING_ALLOW_TEST_MODE: "1",
  STRIPE_SECRET_KEY: "sk_test_fixture",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture",
} as unknown as BillingEnv;
const DAY = 86400,
  // Jan 31 exercises month-end clamping across February.
  start = Date.UTC(2027, 0, 31, 9, 30) / 1000,
  monthEnd = Date.UTC(2027, 1, 28, 9, 30) / 1000,
  yearEnd = Date.UTC(2028, 0, 31, 9, 30) / 1000,
  isoAt = (seconds: number) => new Date(seconds * 1000).toISOString(),
  units = (credits: number) => credits * ARC_CREDIT_RATE.unitsPerCredit;
const users = ["operator", "legacy", "monthly", "annual"] as const;
for (const user of users) {
  fixture.addUser(user, user === "operator" ? "admin" : "user");
  if (user !== "operator")
    sql
      .prepare("INSERT INTO arc_billing_customers VALUES(?,?,?)")
      .run(user, "cus_" + user, fixture.now);
}

// ---- Stripe test double: every provider call is answered locally, nothing is charged.
const fixtures = new Map<string, any>(),
  refunded = new Set<string>();
let created = 0;
const seedMonthly = {
  id: "price_seed_monthly",
  lookup_key: "remote-arc:" + CONNECT_UNLIMITED_PLAN_ID,
  currency: "usd",
  unit_amount: 1900,
  tax_behavior: "exclusive",
  active: true,
  recurring: { interval: "month", interval_count: 1 },
  metadata: {},
};
fixtures.set("/v1/prices/" + seedMonthly.id, seedMonthly);
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const u = new URL(String(input)),
    key = u.pathname + u.search;
  assert.equal(u.origin, "https://api.stripe.com");
  if (init?.method === "DELETE") {
    const value = { ...fixtures.get(u.pathname), status: "canceled" };
    fixtures.set(u.pathname, value);
    return Response.json(value);
  }
  if (init?.method === "POST") {
    const body = new URLSearchParams(String(init.body));
    assert.equal(u.pathname, "/v1/prices", "Unexpected provider mutation POST " + key);
    const value = {
      id: "price_" + ++created,
      lookup_key: body.get("lookup_key"),
      currency: body.get("currency"),
      unit_amount: Number(body.get("unit_amount")),
      tax_behavior: body.get("tax_behavior"),
      active: true,
      product: body.get("product"),
      recurring: { interval: body.get("recurring[interval]"), interval_count: 1 },
      metadata: {
        remote_arc_version: body.get("metadata[remote_arc_version]"),
        remote_arc_sku: body.get("metadata[remote_arc_sku]"),
        ...(body.has("metadata[remote_arc_interval]")
          ? { remote_arc_interval: body.get("metadata[remote_arc_interval]") }
          : {}),
      },
    };
    fixtures.set("/v1/prices/" + value.id, value);
    return Response.json(value);
  }
  if (u.pathname.startsWith("/v1/products/"))
    return Response.json({
      id: u.pathname.split("/").at(-1),
      metadata: { remote_arc_sku: CONNECT_UNLIMITED_PLAN_ID },
    });
  if (u.pathname.startsWith("/v1/charges/")) {
    const charge = fixtures.get(u.pathname);
    return Response.json({ ...charge, amount_refunded: refunded.has(charge.id) ? 1 : 0 });
  }
  assert(fixtures.has(key), "Unexpected provider call " + key);
  return Response.json(fixtures.get(key));
};
function subscription(user: string, price: string, periodEnd: number) {
  fixtures.set("/v1/subscriptions/sub_" + user, {
    id: "sub_" + user,
    customer: "cus_" + user,
    status: "active",
    cancel_at_period_end: false,
    current_period_end: periodEnd,
    items: { data: [{ quantity: 1, price }] },
    schedule: null,
    metadata: {},
  });
}
/** A paid subscription invoice for one period, with its payment and charge. */
function invoice(
  name: string,
  user: string,
  price: { id: string; unit_amount: number },
  from: number,
  to: number,
  reason: "subscription_create" | "subscription_cycle",
) {
  const id = "in_" + name,
    amount = price.unit_amount;
  fixtures.set("/v1/invoices/" + id, {
    id,
    customer: "cus_" + user,
    livemode: false,
    status: "paid",
    currency: "usd",
    amount_remaining: 0,
    amount_paid: amount,
    total: amount,
    total_excluding_tax: amount,
    subtotal_excluding_tax: amount,
    total_discount_amounts: [],
    post_payment_credit_notes_amount: 0,
    billing_reason: reason,
    parent: { subscription_details: { subscription: "sub_" + user } },
  });
  fixtures.set("/v1/invoices/" + id + "/lines?limit=2", {
    has_more: false,
    data: [
      {
        quantity: 1,
        amount,
        pricing: { price_details: { price: price.id } },
        period: { start: from, end: to },
      },
    ],
  });
  fixtures.set("/v1/invoice_payments?invoice=" + id + "&limit=2", {
    has_more: false,
    data: [{ status: "paid", payment: { payment_intent: "pi_" + name } }],
  });
  fixtures.set("/v1/payment_intents/pi_" + name, {
    id: "pi_" + name,
    status: "succeeded",
    currency: "usd",
    amount_received: amount,
    latest_charge: "ch_" + name,
  });
  fixtures.set("/v1/charges/ch_" + name, {
    id: "ch_" + name,
    payment_intent: "pi_" + name,
    paid: true,
    disputed: false,
  });
  fixtures.set("/v1/checkout/sessions?subscription=sub_" + user + "&limit=2", {
    has_more: false,
    data: [],
  });
  return id;
}
let events = 0;
const deliver = (type: string, object: string) =>
  processStripeEvent(
    env,
    { id: "evt_" + ++events, type, livemode: false, data: { object: { id: object } } },
    "hash-" + events,
  );
const lots = (user: string) =>
  sql
    .prepare(
      "SELECT source,source_ref,granted_units,starts_at,expires_at,revoked_at FROM arc_credit_lots WHERE user_id=? ORDER BY starts_at,source_ref",
    )
    .all(user)
    .map((l) => ({ ...l }));
const available = async (user: string, seconds: number) =>
  (await creditBalance(env.DB, user, isoAt(seconds))).available;

try {
  // ---- Months of a paid period: contiguous, clamped at month ends, ending with the period.
  const months = creditMonths(isoAt(start), isoAt(yearEnd));
  assert.equal(months.length, 12);
  assert.equal(months[0]!.startsAt, isoAt(start));
  assert.equal(months[0]!.expiresAt, "2027-02-28T09:30:00.000Z", "Jan 31 + 1 month clamps");
  assert.equal(
    months[1]!.expiresAt,
    "2027-03-31T09:30:00.000Z",
    "Each month counts from the start",
  );
  assert.equal(months.at(-1)!.expiresAt, isoAt(yearEnd));
  for (let n = 1; n < months.length; n++)
    assert.equal(months[n]!.startsAt, months[n - 1]!.expiresAt, "No gap or overlap");
  assert.deepEqual(creditMonths(isoAt(start), isoAt(start + 10 * DAY)), [
    { startsAt: isoAt(start), expiresAt: isoAt(start + 10 * DAY) },
  ]);

  // ---- Schema: Credits and hosted models come together; Connect stays unlimited.
  const connect = ARC_PLANS.find((p) => p.id === CONNECT_UNLIMITED_PLAN_ID)!,
    withArc = { ...connect, yearlyPriceCents: 9900, monthlyCredits: 1000, allHostedModels: true };
  assert(planConfigSchema.safeParse(connect).success, "Connect-only versions stay valid");
  assert(planConfigSchema.safeParse(withArc).success);
  assert(!planConfigSchema.safeParse({ ...withArc, allHostedModels: false }).success);
  assert(!planConfigSchema.safeParse({ ...connect, allHostedModels: true }).success);
  assert(!planConfigSchema.safeParse({ ...withArc, connectToolCalls: 10000 }).success);
  assert(!planConfigSchema.safeParse({ ...withArc, deviceLimit: 5 }).success);

  // ---- A subscriber on the Connect-only seed price, before the new version.
  subscription("legacy", seedMonthly.id, monthEnd);
  await deliver(
    "invoice.paid",
    invoice("legacy_1", "legacy", seedMonthly, start, monthEnd, "subscription_create"),
  );
  assert.deepEqual(lots("legacy"), []);

  // ---- Publish Connect Unlimited with 1,000 monthly Credits.
  const head = (await commercialCatalog(env)).plans.find(
      (p) => p.id === CONNECT_UNLIMITED_PLAN_ID,
    )!,
    { versionId: _v, revision, ...config } = head;
  await saveCommercialDraft(env, "operator", {
    id: "connect-arc-v3",
    kind: "plan",
    config: { ...config, yearlyPriceCents: 9900, monthlyCredits: 1000, allHostedModels: true },
    revision,
  });
  await publishCommercialDraft(env, "operator", "connect-arc-v3");
  const published = sql
    .prepare(
      "SELECT stripe_price_id,stripe_yearly_price_id FROM arc_commercial_versions WHERE id='connect-arc-v3'",
    )
    .get()!;
  const monthlyPrice = fixtures.get("/v1/prices/" + published.stripe_price_id),
    yearlyPrice = fixtures.get("/v1/prices/" + published.stripe_yearly_price_id);
  assert.deepEqual([monthlyPrice.unit_amount, yearlyPrice.unit_amount], [1900, 9900]);
  assert.equal(
    (await commercialCatalog(env)).plans.find((p) => p.id === CONNECT_UNLIMITED_PLAN_ID)!
      .monthlyCredits,
    1000,
  );

  // ---- The Connect-only subscriber renews on their own price: still no Credits.
  await deliver(
    "invoice.paid",
    invoice("legacy_2", "legacy", seedMonthly, monthEnd, monthEnd + 30 * DAY, "subscription_cycle"),
  );
  assert.deepEqual(lots("legacy"), [], "Existing subscribers keep their saved terms");
  assert.equal((await arcAccountAccess(env, "legacy", isoAt(monthEnd + DAY))).paid, false);

  // ---- Monthly invoice on the new version: one lot for the period, plus hosted Arc.
  subscription("monthly", monthlyPrice.id, monthEnd);
  await deliver(
    "invoice.paid",
    invoice("monthly_1", "monthly", monthlyPrice, start, monthEnd, "subscription_create"),
  );
  assert.deepEqual(lots("monthly"), [
    {
      source: "subscription",
      source_ref: "in_monthly_1",
      granted_units: units(1000),
      starts_at: isoAt(start),
      expires_at: isoAt(monthEnd),
      revoked_at: null,
    },
  ]);
  assert.equal(await available("monthly", start + DAY), 1000);
  const monthlyAccess = await arcAccountAccess(env, "monthly", isoAt(start + DAY));
  assert.deepEqual([monthlyAccess.paid, monthlyAccess.premium], [true, true]);

  // ---- Yearly invoice: twelve monthly lots, one month usable at a time.
  subscription("annual", yearlyPrice.id, yearEnd);
  const annual = invoice("annual_1", "annual", yearlyPrice, start, yearEnd, "subscription_create");
  await deliver("invoice.paid", annual);
  const yearly = lots("annual");
  assert.equal(yearly.length, 12);
  assert.deepEqual(
    yearly.map((l) => [l.source, l.source_ref, l.granted_units, l.starts_at, l.expires_at]),
    months.map((m, n) => [
      "subscription",
      creditMonthRef(annual, n + 1),
      units(1000),
      m.startsAt,
      m.expiresAt,
    ]),
  );
  assert.equal(await available("annual", start + DAY), 1000, "Never twelve months at once");
  assert.equal(await available("annual", start + 200 * DAY), 1000);
  assert.equal(await available("annual", yearEnd + 1), 0);
  assert.equal((await arcAccountAccess(env, "annual", isoAt(start + 300 * DAY))).paid, true);
  await deliver("invoice.paid", annual);
  assert.equal(lots("annual").length, 12, "A redelivered invoice grants nothing twice");

  // ---- Forged or mismatched month lots are refused.
  const forged = (
    sourceRef: string,
    startsAt: string,
    expiresAt: string,
    source = "subscription",
  ) =>
    grantArcCredits(env.DB, {
      userId: "annual",
      source: source as "subscription",
      sourceRef,
      units: units(1000),
      startsAt,
      expiresAt,
      reason: "forged",
    });
  const after = isoAt(yearEnd + 30 * DAY);
  await assert.rejects(
    () => forged(creditMonthRef(annual, 13), isoAt(yearEnd), after),
    /ARC_CREDITS_RECEIPT_MISMATCH/,
    "No thirteenth month",
  );
  await assert.rejects(
    () => forged(annual + "#month-00", isoAt(start), months[0]!.expiresAt),
    /ARC_CREDITS_RECEIPT_MISMATCH/,
  );
  await assert.rejects(
    () => forged(creditMonthRef(annual, 2), months[0]!.startsAt, months[0]!.expiresAt),
    /ARC_CREDITS_RECEIPT_MISMATCH/,
    "A month lot must cover its own month",
  );
  await assert.rejects(
    () =>
      grantArcCredits(env.DB, {
        userId: "monthly",
        source: "subscription",
        sourceRef: creditMonthRef("in_monthly_1", 1),
        units: units(1000),
        startsAt: isoAt(start),
        expiresAt: isoAt(monthEnd),
        reason: "forged",
      }),
    /ARC_CREDITS_RECEIPT_MISMATCH/,
    "A monthly receipt never pays for month lots",
  );
  await assert.rejects(
    () => forged(creditMonthRef(annual, 1), months[0]!.startsAt, months[0]!.expiresAt, "topup"),
    /ARC_CREDITS_RECEIPT_MISMATCH/,
  );
  await assert.rejects(
    () =>
      grantArcCredits(env.DB, {
        userId: "monthly",
        source: "subscription",
        sourceRef: creditMonthRef(annual, 1),
        units: units(1000),
        startsAt: months[0]!.startsAt,
        expiresAt: months[0]!.expiresAt,
        reason: "forged",
      }),
    /ARC_CREDITS_GRANT_NOT_AUTHORIZED/,
    "Another user's receipt grants nothing",
  );
  assert.equal(lots("annual").length, 12);

  // ---- Refunding the yearly invoice revokes every monthly lot, including future ones.
  refunded.add("ch_annual_1");
  await deliver("charge.refunded", "ch_annual_1");
  assert(lots("annual").every((l) => l.revoked_at !== null));
  assert.equal(
    (await arcAccountAccess(env, "annual", isoAt(start + DAY))).paid,
    false,
    "The refund also revokes hosted Arc",
  );
  assert.equal(await available("annual", start + DAY), 0);
  assert.equal(await available("annual", start + 200 * DAY), 0);
  assert.equal(
    sql
      .prepare(
        "SELECT COUNT(*) n FROM arc_credit_events WHERE user_id='annual' AND event_type='revoked'",
      )
      .get()!.n,
    12,
  );
  assert.equal(
    lots("monthly")[0]!.revoked_at,
    null,
    "A refund revokes only the lots its payment paid for",
  );

  console.log(
    "PASS: Connect Unlimited with Arc Credits: Credits and hosted models only together, Connect-only subscribers keep their terms, a monthly invoice grants one lot and hosted Arc, a yearly invoice grants twelve contiguous month-end-clamped monthly lots usable one month at a time, redelivery is idempotent, forged month lots are refused, and a refund revokes every monthly lot",
  );
} finally {
  globalThis.fetch = original;
  sql.close();
}
