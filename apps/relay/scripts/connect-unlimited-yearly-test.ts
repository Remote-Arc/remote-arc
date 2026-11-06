// Yearly Connect Unlimited: publishing the yearly price, checkout, the paid
// year, renewal, cancellation at period end, refund revocation and
// monthly <-> yearly changes. Existing monthly subscribers and historical
// commercial versions must not change.
import assert from "node:assert/strict";
import { ARC_PLANS, CONNECT_UNLIMITED_PLAN_ID } from "@remotearc/protocol";
import { createWorkerFixture, AGENT } from "./worker-fixture.js";
import {
  approvedCommercialPrice,
  commercialCatalog,
  planConfigSchema,
  publishCommercialDraft,
  saveCommercialDraft,
} from "../src/arc/arc-commercial-config.js";
import { currentArcPlan } from "../src/arc/arc-plan.js";
import { paymentOverview } from "../src/admin/admin-payments.js";
import { getMonthlyUsage } from "../src/billing/usage.js";
import {
  handleBilling,
  processStripeEvent,
  type BillingEnv,
} from "../src/billing/stripe-billing.js";

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
  YEAR = 365 * DAY,
  start = Math.floor(Date.now() / 1000) - 60,
  monthEnd = start + 30 * DAY,
  yearEnd = start + YEAR,
  isoAt = (seconds: number) => new Date(seconds * 1000).toISOString();
const users = ["operator", "monthly", "annual", "switcher"] as const;
for (const user of users) {
  fixture.addUser(user, user === "operator" ? "admin" : "user");
  if (user !== "operator")
    sql
      .prepare("INSERT INTO arc_billing_customers VALUES(?,?,?)")
      .run(user, "cus_" + user, fixture.now);
}
const cookies = Object.fromEntries(
  await Promise.all(users.map(async (user) => [user, await fixture.sessionCookie(user)])),
) as Record<(typeof users)[number], string>;

// ---- Stripe test double: every provider call is recorded, nothing is charged.
const fixtures = new Map<string, any>(),
  posts: Array<{ path: string; body: URLSearchParams; key: string | null }> = [],
  deletions: string[] = [],
  refunded = new Set<string>();
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
    deletions.push(u.pathname);
    const value = { ...fixtures.get(u.pathname), status: "canceled" };
    fixtures.set(u.pathname, value);
    return Response.json(value);
  }
  if (init?.method === "POST") {
    const body = new URLSearchParams(String(init.body));
    posts.push({ path: key, body, key: new Headers(init.headers).get("idempotency-key") });
    if (u.pathname === "/v1/prices") {
      const value = {
        id: "price_" + posts.length,
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
    if (u.pathname === "/v1/checkout/sessions")
      return Response.json({
        id: "cs_test_" + posts.length,
        url: "https://checkout.stripe.com/c/pay/" + posts.length,
      });
    if (u.pathname === "/v1/subscription_schedules") {
      const subscription = fixtures.get("/v1/subscriptions/" + body.get("from_subscription")),
        value = {
          id: "sub_sched_" + subscription.id.slice(4),
          subscription: subscription.id,
          current_phase: { start_date: start, end_date: subscription.current_period_end },
        };
      subscription.schedule = value.id;
      fixtures.set("/v1/subscription_schedules/" + value.id, value);
      return Response.json(value);
    }
    if (u.pathname.startsWith("/v1/subscription_schedules/"))
      return Response.json(fixtures.get(u.pathname));
    assert.fail("Unexpected provider mutation POST " + key);
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
  if (u.pathname === "/v1/subscriptions" && u.searchParams.get("status") === "all")
    return Response.json({ has_more: false, data: [] });
  assert(fixtures.has(key), "Unexpected provider call " + key);
  return Response.json(fixtures.get(key));
};

function subscription(user: string, price: string, periodEnd: number) {
  const value = {
    id: "sub_" + user,
    customer: "cus_" + user,
    status: "active",
    cancel_at_period_end: false,
    current_period_end: periodEnd,
    items: { data: [{ quantity: 1, price }] },
    schedule: null as string | null,
    metadata: {},
  };
  fixtures.set("/v1/subscriptions/" + value.id, value);
  return value;
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
const billing = async (user: (typeof users)[number], path = "", body?: unknown) => {
  const response = await handleBilling(
    new Request(AGENT + "/api/billing" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin: AGENT,
        cookie: cookies[user],
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
  );
  return { status: response.status, value: (await response.json()) as any };
};
const row = (id: string) => ({
  ...sql
    .prepare(
      "SELECT product_id,status,period_end,cancel_at_period_end,billing_interval,pending_product_id,pending_billing_interval,pending_effective_at,commercial_version_id FROM arc_billing_subscriptions WHERE id=?",
    )
    .get(id),
});
const planAt = async (user: string, seconds: number) =>
  (await currentArcPlan(env, user, isoAt(seconds))).id;
const versions = () =>
  sql
    .prepare(
      "SELECT id,config_json,stripe_price_id,stripe_yearly_price_id,published_at FROM arc_commercial_versions ORDER BY id",
    )
    .all()
    .map((v) => ({ ...v }));

try {
  // ---- Schema: yearly is Connect-only, never above twelve monthly payments.
  const connect = ARC_PLANS.find((p) => p.id === CONNECT_UNLIMITED_PLAN_ID)!,
    plus = ARC_PLANS.find((p) => p.id === "arc-plus-v1")!;
  assert(planConfigSchema.safeParse({ ...connect, yearlyPriceCents: 9900 }).success);
  assert(planConfigSchema.safeParse(connect).success, "Versions without a yearly price stay valid");
  assert(!planConfigSchema.safeParse({ ...connect, yearlyPriceCents: 1900 * 12 + 1 }).success);
  assert(!planConfigSchema.safeParse({ ...connect, yearlyPriceCents: 99 }).success);
  assert(
    !planConfigSchema.safeParse({ ...plus, yearlyPriceCents: 39000 }).success,
    "Arc plans grant Credits per invoice, so they have no yearly price",
  );

  // ---- An existing monthly subscriber on the original seed price.
  subscription("monthly", seedMonthly.id, monthEnd);
  await deliver(
    "invoice.paid",
    invoice("monthly_1", "monthly", seedMonthly, start, monthEnd, "subscription_create"),
  );
  const monthlyBefore = row("sub_monthly");
  assert.deepEqual(
    [monthlyBefore.billing_interval, monthlyBefore.commercial_version_id],
    ["month", "seed:test:" + CONNECT_UNLIMITED_PLAN_ID],
  );

  // ---- Before publishing, yearly is not sold.
  const unpublished = await billing("annual", "/checkout", {
    productId: CONNECT_UNLIMITED_PLAN_ID,
    interval: "year",
  });
  assert.deepEqual(
    [unpublished.status, unpublished.value.error],
    [400, "BILLING_INVALID_PRODUCT"],
    "Seed versions carry no yearly price",
  );

  // ---- Publish: one approved version, a monthly and a yearly price with their own lookup keys.
  const history = versions(),
    head = (await commercialCatalog(env)).plans.find((p) => p.id === CONNECT_UNLIMITED_PLAN_ID)!;
  const { versionId: _v, revision, ...config } = head;
  await assert.rejects(
    () =>
      saveCommercialDraft(env, "operator", {
        id: "plus-yearly",
        kind: "plan",
        config: { ...ARC_PLANS.find((p) => p.id === "arc-plus-v1")!, yearlyPriceCents: 39000 },
        revision: 1,
      }),
    /Only Connect Unlimited has a yearly price/,
  );
  await saveCommercialDraft(env, "operator", {
    id: "connect-yearly-v2",
    kind: "plan",
    config: { ...config, yearlyPriceCents: 9900 },
    revision,
  });
  await publishCommercialDraft(env, "operator", "connect-yearly-v2");
  const prices = posts.filter((p) => p.path === "/v1/prices");
  assert.equal(prices.length, 2);
  const [monthlyPost, yearlyPost] = prices;
  assert.deepEqual(
    [
      monthlyPost!.body.get("lookup_key"),
      monthlyPost!.body.get("recurring[interval]"),
      monthlyPost!.body.get("unit_amount"),
    ],
    ["remote-arc:version:connect-yearly-v2", "month", "1900"],
  );
  assert.deepEqual(
    [
      yearlyPost!.body.get("lookup_key"),
      yearlyPost!.body.get("recurring[interval]"),
      yearlyPost!.body.get("unit_amount"),
      yearlyPost!.body.get("metadata[remote_arc_interval]"),
      yearlyPost!.key,
    ],
    [
      "remote-arc:version:connect-yearly-v2:year",
      "year",
      "9900",
      "year",
      "arc-commercial-price:connect-yearly-v2:year",
    ],
  );
  const published = sql
    .prepare(
      "SELECT stripe_price_id,stripe_yearly_price_id FROM arc_commercial_versions WHERE id='connect-yearly-v2'",
    )
    .get()!;
  const monthlyPrice = fixtures.get("/v1/prices/" + published.stripe_price_id),
    yearlyPrice = fixtures.get("/v1/prices/" + published.stripe_yearly_price_id);
  assert.equal(yearlyPrice.unit_amount, 9900);
  assert.deepEqual(
    versions().filter((v) => v.id !== "connect-yearly-v2"),
    history,
    "Historical commercial versions are untouched",
  );
  const catalog = (await commercialCatalog(env)).plans.find(
    (p) => p.id === CONNECT_UNLIMITED_PLAN_ID,
  )!;
  assert.deepEqual(
    [catalog.versionId, catalog.monthlyPriceCents, catalog.yearlyPriceCents],
    ["connect-yearly-v2", 1900, 9900],
  );
  // A Stripe price is approved only with its own interval, key and version.
  await assert.rejects(
    () =>
      approvedCommercialPrice(env, {
        ...yearlyPrice,
        recurring: { interval: "month", interval_count: 1 },
      }),
    /BILLING_CATALOG_CONFLICT/,
  );
  await assert.rejects(
    () =>
      approvedCommercialPrice(env, {
        ...yearlyPrice,
        id: "price_forged",
        lookup_key: "remote-arc:" + CONNECT_UNLIMITED_PLAN_ID,
      }),
    /BILLING_CATALOG_CONFLICT/,
    "A seed lookup key never approves a yearly amount",
  );
  assert.equal((await approvedCommercialPrice(env, yearlyPrice)).interval, "year");
  assert.equal((await approvedCommercialPrice(env, monthlyPrice)).interval, "month");

  // ---- The existing monthly subscriber renews unchanged on the seed price.
  await deliver(
    "invoice.paid",
    invoice(
      "monthly_2",
      "monthly",
      seedMonthly,
      monthEnd,
      monthEnd + 30 * DAY,
      "subscription_cycle",
    ),
  );
  assert.deepEqual(
    { ...row("sub_monthly"), period_end: null },
    { ...monthlyBefore, period_end: null },
    "Same product, interval and commercial version after the yearly launch",
  );
  assert.equal(
    sql.prepare("SELECT amount_cents FROM arc_payment_receipts WHERE id='in_monthly_2'").get()!
      .amount_cents,
    1900,
  );

  // ---- Checkout validation.
  for (const [body, error] of [
    [{ productId: CONNECT_UNLIMITED_PLAN_ID, interval: "week" }, "BILLING_INVALID_REQUEST"],
    [
      { productId: "arc-plus-v1", versionId: "seed:test:arc-plus-v1", interval: "year" },
      "BILLING_INVALID_PRODUCT",
    ],
    [{ productId: CONNECT_UNLIMITED_PLAN_ID, interval: "year" }, "BILLING_PRICE_CHANGED"],
    [
      {
        productId: CONNECT_UNLIMITED_PLAN_ID,
        versionId: "connect-yearly-v2",
        interval: "year",
        promoCode: "SAVE20",
      },
      "BILLING_INVALID_PROMOTION",
    ],
  ] as const)
    assert.equal(
      (await billing("annual", "/checkout", body)).value.error,
      error,
      JSON.stringify(body),
    );

  // ---- Yearly checkout uses the approved yearly price.
  const checkout = await billing("annual", "/checkout", {
    productId: CONNECT_UNLIMITED_PLAN_ID,
    versionId: "connect-yearly-v2",
    interval: "year",
  });
  assert.equal(checkout.status, 200, JSON.stringify(checkout.value));
  const session = posts.at(-1)!;
  assert.equal(session.path, "/v1/checkout/sessions");
  assert.equal(session.body.get("line_items[0][price]"), yearlyPrice.id);
  assert.equal(session.body.get("mode"), "subscription");
  assert(!session.body.has("discounts[0][promotion_code]"));
  assert.match(
    String(session.body.get("success_url")),
    /product=connect-unlimited-v1&interval=year&/,
  );
  assert.equal(
    sql.prepare("SELECT billing_interval FROM arc_billing_checkouts WHERE user_id='annual'").get()!
      .billing_interval,
    "year",
  );
  assert.equal(
    (
      await billing("annual", "/checkout", {
        productId: CONNECT_UNLIMITED_PLAN_ID,
        versionId: "connect-yearly-v2",
      })
    ).value.error,
    "BILLING_CHECKOUT_ALREADY_OPEN",
    "An open yearly checkout is never reused for a monthly purchase",
  );

  // ---- The paid year: the entitlement lasts until the yearly period ends.
  subscription("annual", yearlyPrice.id, yearEnd);
  await deliver(
    "invoice.paid",
    invoice("annual_1", "annual", yearlyPrice, start, yearEnd, "subscription_create"),
  );
  assert.deepEqual(
    [row("sub_annual").billing_interval, row("sub_annual").period_end],
    ["year", isoAt(yearEnd)],
  );
  assert.equal(
    sql.prepare("SELECT amount_cents FROM arc_payment_receipts WHERE id='in_annual_1'").get()!
      .amount_cents,
    9900,
  );
  assert.equal(
    sql
      .prepare("SELECT expires_at FROM billing_plan_assignments WHERE id='stripe:in_annual_1'")
      .get()!.expires_at,
    isoAt(yearEnd),
  );
  assert.equal(await planAt("annual", start + 300 * DAY), CONNECT_UNLIMITED_PLAN_ID);
  assert.equal(await planAt("annual", yearEnd + 1), "free");
  assert.equal((await currentArcPlan(env, "annual")).commercialVersionId, "connect-yearly-v2");
  assert.equal((await getMonthlyUsage(env, "annual")).unlimited, true);
  assert.equal(
    sql.prepare("SELECT COUNT(*) n FROM arc_credit_lots WHERE user_id='annual'").get()!.n,
    0,
    "A paid year grants no Credits",
  );
  const overview = await billing("annual");
  assert.equal(overview.value.subscriptions[0].billing_interval, "year");
  assert.equal(
    overview.value.plans.find((p: any) => p.id === CONNECT_UNLIMITED_PLAN_ID).yearlyPriceCents,
    9900,
  );
  // Admin recurring revenue counts a year as one twelfth per month.
  assert.equal((await paymentOverview(env as any)).recurring.cents, 1900 + 825);

  // ---- Cancellation at period end keeps the paid year; resuming restores renewal.
  fixtures.get("/v1/subscriptions/sub_annual").cancel_at_period_end = true;
  await deliver("customer.subscription.updated", "sub_annual");
  assert.equal(row("sub_annual").cancel_at_period_end, 1);
  assert.equal(await planAt("annual", yearEnd - DAY), CONNECT_UNLIMITED_PLAN_ID);
  assert.equal(await planAt("annual", yearEnd + 1), "free");
  assert.equal(deletions.length, 0, "Cancelling renewal does not end the paid year early");
  fixtures.get("/v1/subscriptions/sub_annual").cancel_at_period_end = false;
  await deliver("customer.subscription.updated", "sub_annual");
  assert.equal(row("sub_annual").cancel_at_period_end, 0);

  // ---- Refunding the current yearly invoice revokes the year now and ends the subscription.
  refunded.add("ch_annual_1");
  await deliver("charge.refunded", "ch_annual_1");
  assert.deepEqual(deletions, ["/v1/subscriptions/sub_annual"]);
  assert.equal(row("sub_annual").status, "canceled");
  assert.equal((await currentArcPlan(env, "annual")).id, "free");
  assert.equal(
    sql.prepare("SELECT state FROM arc_payment_receipts WHERE id='in_annual_1'").get()!.state,
    "refunded",
  );
  assert.notEqual(
    sql
      .prepare("SELECT revoked_at FROM billing_plan_assignments WHERE id='stripe:in_annual_1'")
      .get()!.revoked_at,
    null,
  );

  // ---- Monthly -> yearly for a subscriber on the newly published monthly price.
  subscription("switcher", monthlyPrice.id, monthEnd);
  await deliver(
    "invoice.paid",
    invoice("switch_1", "switcher", monthlyPrice, start, monthEnd, "subscription_create"),
  );
  const toYearly = { productId: CONNECT_UNLIMITED_PLAN_ID, versionId: "connect-yearly-v2" };
  const change = await billing("switcher", "/plan/change", { ...toYearly, interval: "year" });
  assert.equal(change.status, 200, JSON.stringify(change.value));
  assert.deepEqual(
    [change.value.scheduled, change.value.interval, change.value.effectiveAt],
    [true, "year", isoAt(monthEnd)],
  );
  const phases = posts.at(-1)!;
  assert.equal(phases.path, "/v1/subscription_schedules/sub_sched_switcher");
  assert.deepEqual(
    [
      phases.body.get("phases[0][items][0][price]"),
      phases.body.get("phases[0][end_date]"),
      phases.body.get("phases[1][start_date]"),
      phases.body.get("phases[1][items][0][price]"),
      phases.body.get("phases[1][duration][interval]"),
      phases.body.get("proration_behavior"),
    ],
    [monthlyPrice.id, String(monthEnd), String(monthEnd), yearlyPrice.id, "year", "none"],
    "The paid month runs out, then a full year starts; no proration",
  );
  assert.deepEqual(
    [
      row("sub_switcher").pending_product_id,
      row("sub_switcher").pending_billing_interval,
      row("sub_switcher").billing_interval,
    ],
    [CONNECT_UNLIMITED_PLAN_ID, "year", "month"],
  );
  const scheduledPosts = posts.length;
  assert.equal(
    (await billing("switcher", "/plan/change", { ...toYearly, interval: "year" })).value.scheduled,
    true,
  );
  assert.equal(posts.length, scheduledPosts, "Repeating the same change calls Stripe once");
  assert.equal(
    (await billing("switcher", "/plan/change", toYearly)).status,
    200,
    "Choosing the current monthly term cancels the pending yearly change",
  );
  assert.deepEqual(
    [
      posts.at(-1)!.body.get("phases[1][items][0][price]"),
      posts.at(-1)!.body.get("phases[1][duration][interval]"),
      row("sub_switcher").pending_product_id,
      row("sub_switcher").pending_billing_interval,
    ],
    [monthlyPrice.id, "month", null, null],
  );
  await billing("switcher", "/plan/change", { ...toYearly, interval: "year" });
  // A renewal on the old monthly term is not the scheduled yearly change.
  await deliver(
    "invoice.paid",
    invoice(
      "switch_1b",
      "switcher",
      monthlyPrice,
      monthEnd,
      monthEnd + 30 * DAY,
      "subscription_cycle",
    ),
  );
  assert.deepEqual(
    [row("sub_switcher").pending_billing_interval, row("sub_switcher").billing_interval],
    ["year", "month"],
  );
  // Stripe starts the yearly phase at the boundary and bills a full year.
  const switchEnd = monthEnd + YEAR;
  Object.assign(fixtures.get("/v1/subscriptions/sub_switcher"), {
    items: { data: [{ quantity: 1, price: yearlyPrice.id }] },
    current_period_end: switchEnd,
    schedule: null,
  });
  await deliver(
    "invoice.paid",
    invoice("switch_2", "switcher", yearlyPrice, monthEnd, switchEnd, "subscription_cycle"),
  );
  assert.deepEqual(
    [
      row("sub_switcher").billing_interval,
      row("sub_switcher").pending_product_id,
      row("sub_switcher").pending_billing_interval,
      row("sub_switcher").period_end,
    ],
    ["year", null, null, isoAt(switchEnd)],
  );
  assert.equal(await planAt("switcher", monthEnd + 300 * DAY), CONNECT_UNLIMITED_PLAN_ID);
  assert.equal(await planAt("switcher", switchEnd + 1), "free");

  // ---- Renewal for a second year extends the entitlement by a year.
  const renewedEnd = switchEnd + YEAR;
  fixtures.get("/v1/subscriptions/sub_switcher").current_period_end = renewedEnd;
  await deliver(
    "invoice.paid",
    invoice("switch_3", "switcher", yearlyPrice, switchEnd, renewedEnd, "subscription_cycle"),
  );
  assert.deepEqual(
    [row("sub_switcher").period_end, row("sub_switcher").billing_interval],
    [isoAt(renewedEnd), "year"],
  );
  assert.equal(await planAt("switcher", switchEnd + 300 * DAY), CONNECT_UNLIMITED_PLAN_ID);
  assert.equal(
    sql.prepare("SELECT amount_cents FROM arc_payment_receipts WHERE id='in_switch_3'").get()!
      .amount_cents,
    9900,
  );

  // ---- Yearly -> monthly takes effect when the paid year ends.
  const back = await billing("switcher", "/plan/change", { ...toYearly, interval: "month" });
  assert.equal(back.status, 200, JSON.stringify(back.value));
  assert.equal(back.value.effectiveAt, isoAt(renewedEnd));
  assert.deepEqual(
    [
      posts.at(-1)!.body.get("phases[0][items][0][price]"),
      posts.at(-1)!.body.get("phases[1][items][0][price]"),
      posts.at(-1)!.body.get("phases[1][duration][interval]"),
    ],
    [yearlyPrice.id, monthlyPrice.id, "month"],
  );
  assert.deepEqual(
    [row("sub_switcher").pending_billing_interval, row("sub_switcher").billing_interval],
    ["month", "year"],
  );
  assert.equal(
    (await billing("monthly", "/plan/change", { ...toYearly, interval: "month" })).value.error,
    "BILLING_INVALID_PLAN_CHANGE",
    "The current term with nothing pending is not a change",
  );

  console.log(
    "PASS: Connect Unlimited yearly: Connect-only schema, approved yearly price with its own lookup key and idempotency key, historical versions and seed monthly subscribers untouched, interval-checked price approval, yearly checkout without promotions, entitlement for the paid year, yearly renewal, cancellation at period end, refund revocation, monthly<->yearly scheduled changes and admin MRR",
  );
} finally {
  globalThis.fetch = original;
  sql.close();
}
