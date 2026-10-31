import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { handleMarketplaceWebhook } from "../src/billing/github-marketplace.js";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../migrations/0033_github_marketplace.sql", import.meta.url), "utf8"));
class Statement {
  private params: unknown[] = [];
  constructor(readonly sql: string) {}
  bind(...args: unknown[]) { this.params = args; return this; }
  run() { return sqlite.prepare(this.sql).run(...(this.params as any[])); }
}
const db = {
  prepare(sql: string) { return new Statement(sql); },
  async batch(statements: Statement[]) {
    sqlite.exec("BEGIN");
    try {
      const results = statements.map((s) => ({ meta: { changes: Number(s.run().changes) } }));
      sqlite.exec("COMMIT");
      return results;
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  },
};
const env = { DB: db, GITHUB_MARKETPLACE_WEBHOOK_SECRET: "test-only-webhook-key" } as any;
const basePayload = {
  action: "purchased",
  effective_date: "2026-10-18T01:00:00Z",
  marketplace_purchase: {
    account: { id: 42, login: "example-org", type: "Organization" },
    plan: { id: 100, name: "Free" },
    billing_cycle: "monthly",
    on_free_trial: false,
    unit_count: 1,
  },
};
let deliveryNumber = 0;
function signedRequest(payload: object | string, event = "marketplace_purchase", opts: { delivery?: string; badSignature?: boolean } = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const signature = createHmac("sha256", env.GITHUB_MARKETPLACE_WEBHOOK_SECRET).update(body).digest("hex");
  return new Request("https://mcp.remotearc.app/webhooks/github/marketplace", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-github-delivery": opts.delivery ?? "test-" + (++deliveryNumber),
      "x-hub-signature-256": "sha256=" + (opts.badSignature ? "f".repeat(64) : signature),
    },
    body,
  });
}
const current = () => sqlite.prepare("SELECT * FROM github_marketplace_subscriptions WHERE account_id = 42").get() as any;
const pending = () => sqlite.prepare("SELECT * FROM github_marketplace_pending_changes WHERE account_id = 42").get() as any;
const total = () => (sqlite.prepare("SELECT count(*) AS n FROM github_marketplace_deliveries").get() as any).n;
const respond = (body: object | string, event?: string, opts?: { delivery?: string; badSignature?: boolean }) =>
  handleMarketplaceWebhook(signedRequest(body, event, opts), env);

assert.equal((await handleMarketplaceWebhook(new Request("https://mcp.remotearc.app/webhooks/github/marketplace"), env)).status, 405);
assert.equal((await handleMarketplaceWebhook(signedRequest(basePayload), { DB: db } as any)).status, 503);
assert.equal((await respond(basePayload, undefined, { badSignature: true })).status, 401);
assert.equal((await respond("not-json")).status, 400);
assert.equal(total(), 0);
assert.equal((await respond({ zen: "hello" }, "ping")).status, 200);
assert.equal(total(), 0);
assert.equal((await respond(basePayload, undefined, { delivery: "purchase-one" })).status, 202);
assert.equal(current().status, "active");
assert.equal(current().plan_id, 100);
assert.equal(total(), 1);

const duplicate = await respond({ ...basePayload, action: "cancelled" }, undefined, { delivery: "purchase-one" });
assert.equal((await duplicate.json() as any).duplicate, true);
assert.equal(current().status, "active");
assert.equal(total(), 1);

const pendingChange = {
  ...basePayload, action: "pending_change", effective_date: "2026-11-18T01:00:00Z",
  marketplace_purchase: { ...basePayload.marketplace_purchase, plan: { id: 200, name: "Pro" } },
};
assert.equal((await respond(pendingChange)).status, 202);
assert.equal(pending().plan_id, 200);
assert.equal(current().plan_id, 100);

const staleChange = { ...basePayload, action: "changed", effective_date: "2026-10-17T01:00:00Z" };
assert.equal((await respond(staleChange)).status, 202);
assert.equal(current().plan_id, 100);
assert.equal(pending().plan_id, 200);

const changed = { ...pendingChange, action: "changed" };
assert.equal((await respond(changed)).status, 202);
assert.equal(current().plan_id, 200);
assert.equal(pending(), undefined);

assert.equal((await respond({ ...pendingChange, action: "cancelled", effective_date: "2026-12-18T01:00:00Z" })).status, 202);
assert.equal(current().status, "cancelled");
assert.equal(current().plan_id, 200);
const oldest = { ...basePayload, action: "purchased", effective_date: "2026-10-01T01:00:00Z" };
assert.equal((await respond(oldest)).status, 202);
assert.equal(current().status, "cancelled");

// Unknown event types must never result in subscription writes.
assert.equal((await respond({ action: "created" }, "installation")).status, 202);
assert.equal((await respond({ action: "nonsense" })).status, 400);
console.log("PASS: Marketplace HMAC, ping, validation, SQL idempotency, ordering, pending change and cancellation");
