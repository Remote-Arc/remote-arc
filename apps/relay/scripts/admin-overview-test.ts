import assert from "node:assert/strict";
import { ADMIN, createWorkerFixture, json } from "./worker-fixture.js";
import { OVERVIEW_PRESENCE_LIMIT } from "../src/admin/admin-overview.js";

const f = createWorkerFixture();
const HOUR = 3600_000;
const now = Date.now();
const ago = (ms: number) => new Date(now - ms).toISOString();
const today = new Date(now).toISOString().slice(0, 10);

f.addUser("overview-admin", "admin");
f.addUser("customer-a");
f.addUser("customer-b");
f.addUser("reviewer-openai-v1");
f.sql.exec("UPDATE business_cohort_users SET is_demo=1 WHERE user_id='reviewer-openai-v1'");
const adminCookie = await f.sessionCookie("overview-admin");
const customerCookie = await f.sessionCookie("customer-a");
const overview = (cookie = adminCookie) =>
  f.call(ADMIN + "/api/admin/overview", { headers: { cookie } });

// Activity rollup: two real customers today, one demo account that must not count.
for (const [user, day] of [
  ["customer-a", today],
  ["customer-b", today],
  ["reviewer-openai-v1", today],
  ["customer-a", ago(3 * 24 * HOUR).slice(0, 10)],
])
  f.sql
    .prepare("INSERT OR IGNORE INTO business_activity_days VALUES(?,?,?,?)")
    .run(user!, day!, day + "T01:00:00.000Z", day + "T02:00:00.000Z");

// Tool calls: three in the last 24 hours, one the day before, one outside the chart.
const audit = f.sql.prepare(
  `INSERT INTO audit_events(id,user_id,device_id,event_type,success,outcome,created_at)
  VALUES(?,?,?,?,?,?,?)`,
);
audit.run("a1", "customer-a", "d1", "mcp.tool_call", 1, "allowed", ago(HOUR));
audit.run("a2", "customer-b", "d2", "mcp.tool_call", 0, "device_timeout", ago(2 * HOUR));
audit.run("a3", "customer-a", "d1", "mcp.tool_call", 0, "safety_guard_block", ago(3 * HOUR));
audit.run("a4", "customer-a", "d1", "mcp.tool_call", 0, "device_offline", ago(30 * HOUR));
audit.run("a5", "customer-a", "d1", "mcp.tool_call", 1, "allowed", ago(72 * HOUR));
audit.run("a6", "customer-a", "d1", "auth.login", 1, null, ago(HOUR));

const device = f.sql.prepare(
  "INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at,revoked_at) VALUES(?,?,?,?,?,?,?)",
);
device.run("d1", "customer-a", "Mac", "darwin", "h1", ago(HOUR), null);
device.run("d2", "customer-b", "PC", "win32", "h2", ago(HOUR), null);
device.run("d3", "customer-b", "Old", "win32", "h3", ago(HOUR), ago(HOUR));
f.state.online = [{ id: "d1", status: "online" }];

const receipt = f.sql.prepare(
  `INSERT INTO arc_payment_receipts(id,provider,event_id,user_id,product_id,state,amount_cents,currency,verified_at,payload_hash)
  VALUES(?,'stripe',?,?,'connect_unlimited',?,?,'usd',?,'hash')`,
);
receipt.run("r1", "e1", "customer-a", "paid", 900, ago(2 * 24 * HOUR));
receipt.run("r2", "e2", "customer-b", "refunded", 900, ago(2 * 24 * HOUR));
receipt.run("r3", "e3", "customer-b", "paid", 900, ago(40 * 24 * HOUR));
receipt.run("r4", "e4", "reviewer-openai-v1", "paid", 900, ago(HOUR));

f.sql
  .prepare(
    `INSERT INTO website_submissions(id,category,email,consent_at,status,created_at,updated_at)
    VALUES(?,'feedback',?,?,?,?,?)`,
  )
  .run("s1", "lead@example.test", ago(HOUR), "new", ago(HOUR), ago(HOUR));

// Only administrators can read it.
assert.equal((await f.call(ADMIN + "/api/admin/overview")).status, 401);
assert.equal((await overview(customerCookie)).status, 403);

const queries: string[] = [];
const db = f.env.DB as D1Database;
f.env.DB = {
  ...db,
  prepare(query: string) {
    queries.push(query);
    return db.prepare(query);
  },
} as D1Database;

let response = await overview();
assert.equal(response.status, 200);
let body = await json(response);
assert.deepEqual(body.unavailable, []);
assert.equal(body.people.total, 4);
assert.equal(body.people.new7d, 3, "Demo accounts are not new customers");
const activeToday = f.sql
  .prepare("SELECT user_id FROM business_activity_days WHERE day=? ORDER BY user_id")
  .all(today)
  .map((row) => row.user_id);
assert(activeToday.includes("reviewer-openai-v1"));
assert.equal(
  body.people.activeToday,
  activeToday.length - 1,
  "Demo activity is not customer activity",
);
assert.equal(body.people.active7d, activeToday.length - 1, "Users active on two days count once");
assert.equal(body.usage.calls24h, 3, "Only tool calls in the last 24 hours");
assert.equal(body.usage.failed24h, 1, "A safety block is not a failed call");
assert.equal(body.usage.callsPrevious24h, 1);
assert.equal(body.usage.failedPrevious24h, 1);
assert(body.usage.hourly.length <= 48);
assert(
  body.usage.hourly.every((row: { hour: string }) => row.hour >= ago(48 * HOUR).slice(0, 13)),
  "The chart never reads beyond 48 hours",
);
assert.deepEqual(body.devices, { total: 2, online: 1, complete: true });
assert.deepEqual(body.revenue, {
  paidCents30d: 900,
  payments30d: 1,
  activeSubscriptions: 0,
  activeTrials: 0,
});
assert.deepEqual(body.inbox, { newSubmissions: 1, openSupport: 0 });

// The overview must not run the per-user activation scan or a lifetime audit count.
assert(!queries.some((query) => query.includes("candidates AS MATERIALIZED")));
const auditQueries = queries.filter((query) => query.includes("FROM audit_events"));
assert.equal(auditQueries.length, 1);
assert.match(auditQueries[0]!, /created_at>=\?1/);
const plan = JSON.stringify(
  f.sql.prepare("EXPLAIN QUERY PLAN " + auditQueries[0]!).all(ago(48 * HOUR)),
);
assert.match(plan, /SEARCH audit_events USING INDEX/, "The 48-hour read is an index range search");

// One failing section hides only that section.
f.sql.exec("ALTER TABLE support_threads RENAME TO support_threads_hidden");
response = await overview();
assert.equal(response.status, 200);
body = await json(response);
assert.deepEqual(body.unavailable, ["inbox"]);
assert.equal(body.inbox, null);
assert.equal(body.people.total, 4, "Other sections still load");
f.sql.exec("ALTER TABLE support_threads_hidden RENAME TO support_threads");

// A registry that does not answer makes the online count incomplete, not zero-and-certain.
f.state.registry = async () => new Response("unavailable", { status: 503 });
body = await json(await overview());
assert.equal(body.devices.online, 0);
assert.equal(body.devices.complete, false);
f.state.registry = null;

// Presence fan-out is capped.
for (let index = 0; index < OVERVIEW_PRESENCE_LIMIT + 1; index++) {
  f.addUser("owner-" + index);
  device.run("cap-" + index, "owner-" + index, "PC", "win32", "cap-" + index, ago(HOUR), null);
}
let presenceCalls = 0;
f.state.registry = async () => {
  presenceCalls++;
  return Response.json([]);
};
body = await json(await overview());
assert.equal(presenceCalls, OVERVIEW_PRESENCE_LIMIT);
assert.equal(body.devices.complete, false, "Unchecked owners make the count incomplete");
f.state.registry = null;

// When nothing can be read, the endpoint says so instead of returning empty numbers.
f.env.DB = {
  prepare(query: string) {
    // Keep the session lookup working so the request reaches the overview.
    if (query.includes("FROM sessions")) return db.prepare(query);
    throw new Error("D1_ERROR: Replica disconnected from primary.");
  },
} as unknown as D1Database;
f.env.REGISTRY = {
  getByName: () => ({
    fetch: async () => {
      throw new Error("offline");
    },
  }),
} as unknown;
response = await overview();
assert.equal(response.status, 503);
assert.equal(response.headers.get("retry-after"), "5");
body = await json(response);
assert.equal(body.error, "SERVICE_UNAVAILABLE");
assert.equal(body.unavailable.length, 6);

f.sql.close();
console.log(
  "PASS: admin overview is admin-only, excludes demo accounts, reads only 48 hours of audit rows by index, isolates a failing section, caps presence fan-out and answers 503 when nothing loads",
);
