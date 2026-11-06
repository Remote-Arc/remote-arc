import assert from "node:assert/strict";
import fs from "node:fs";
import { ADMIN, createWorkerFixture } from "./worker-fixture.js";

const f = createWorkerFixture();
f.addUser("query-admin", "admin");
const cookie = await f.sessionCookie("query-admin");
const now = new Date();
const recent = new Date(now.getTime() - 86400000).toISOString();
const old = new Date(now.getTime() - 8 * 86400000).toISOString();
for (const [id, at] of [
  ["recent", recent],
  ["old", old],
])
  f.sql
    .prepare(
      `INSERT INTO audit_events(id,user_id,device_id,event_type,success,created_at)
    VALUES(?, 'query-admin','fixture-device','mcp.tool_call',1,?)`,
    )
    .run(id!, at!);

const indexes = [
  "audit_success_user_time",
  "app_calls_success_user_time",
  "arc_runs_success_user_time",
  "product_success_user_time",
];
const before = f.sql.prepare("SELECT * FROM audit_events ORDER BY id").all();
for (const name of indexes) f.sql.exec("DROP INDEX " + name);
const migration = fs.readFileSync(
  new URL("../migrations/0078_admin_query_indexes.sql", import.meta.url),
  "utf8",
);
f.sql.exec(migration);
f.sql.exec(migration);
assert.deepEqual(
  f.sql.prepare("SELECT * FROM audit_events ORDER BY id").all(),
  before,
  "Applying the indexes to populated legacy rows, twice, preserves stored values",
);
const predicates = [
  "SELECT created_at FROM audit_events WHERE user_id='query-admin' AND event_type='mcp.tool_call' AND success=1 AND device_id IS NOT NULL AND (outcome IS NULL OR outcome='allowed') AND created_at<'2027'",
  "SELECT updated_at FROM app_calls WHERE user_id='query-admin' AND status='succeeded' AND updated_at<'2027'",
  "SELECT updated_at FROM arc_chat_runs WHERE user_id='query-admin' AND status='succeeded' AND updated_at<'2027'",
  "SELECT occurred_at FROM product_events WHERE user_id='query-admin' AND source='server' AND outcome='succeeded' AND name IN ('device.tool.completed','app.call.succeeded','task.run.succeeded') AND occurred_at<'2027'",
];
for (const [index, query] of predicates.entries()) {
  const plan = f.sql.prepare("EXPLAIN QUERY PLAN " + query).all();
  assert(
    JSON.stringify(plan).includes(indexes[index]!),
    "SQLite uses the intended successful-evidence index: " + indexes[index],
  );
}

const queries: string[] = [];
const original = f.env.DB;
f.env.DB = {
  ...original,
  prepare(query: string) {
    queries.push(query);
    return original.prepare(query);
  },
} as D1Database;
const response = await f.call(ADMIN + "/api/admin/operations?auditTotals=0", {
  headers: { cookie },
});
assert.equal(response.status, 200);
const bounded = (await response.json()) as any;
assert.equal(bounded.totals.auditRows, null, "An omitted lifetime total is unknown, never zero");
assert.equal(
  bounded.totals.auditLast7d,
  null,
  "Without the lifetime count, no separate 7-day count is read",
);
const chart = queries.filter((query) => query.includes("GROUP BY substr(created_at,1,13)"));
assert.equal(chart.length, 1);
const plan = f.sql
  .prepare("EXPLAIN QUERY PLAN " + chart[0]!)
  .all(new Date(now.getTime() - 48 * 3600000).toISOString());
assert(JSON.stringify(plan).includes("SEARCH"), "The hourly chart performs a bounded index search");
const legacy = await f.call(ADMIN + "/api/admin/operations", { headers: { cookie } });
assert.equal(legacy.status, 200);
const legacyBody = (await legacy.json()) as any;
assert.equal(legacyBody.totals.auditRows, 2, "Existing callers retain lifetime totals");
assert.equal(legacyBody.totals.auditLast7d, 1, "The lifetime read still splits out 7 days");

// The Users tab skips audit history reads; the Activity tab asks for its 48-hour chart.
queries.length = 0;
const usersTab = await f.call(ADMIN + "/api/admin/operations?auditTotals=0&activity=0", {
  headers: { cookie },
});
assert.equal(usersTab.status, 200);
const usersBody = (await usersTab.json()) as any;
assert.equal(usersBody.activity, null, "A chart that was not read is unknown, never empty");
assert.equal(usersBody.totals.auditLast7d, null);
assert.deepEqual(usersBody.unavailable, []);
assert(
  !queries.some((query) => /FROM audit_events\s+WHERE created_at>=/.test(query)),
  "The Users tab issues no time-range read of audit history",
);
f.sql
  .prepare(
    `INSERT INTO audit_events(id,user_id,device_id,event_type,success,created_at)
    VALUES('three-days','query-admin','fixture-device','mcp.tool_call',1,?)`,
  )
  .run(new Date(now.getTime() - 3 * 86400000).toISOString());
queries.length = 0;
const activityTab = (await (
  await f.call(ADMIN + "/api/admin/operations?auditTotals=0&activity=1", { headers: { cookie } })
).json()) as any;
assert.deepEqual(
  activityTab.activity.map((row: { hour: string }) => row.hour),
  [recent.slice(0, 13)],
  "The chart holds only the last 48 hours, not a 3-day-old call",
);
assert.equal(activityTab.totals.auditLast7d, null);
assert(
  !queries.some((query) => query.includes("AS last7d")),
  "The Activity tab reads no 7-day audit count",
);

// One failing read hides its own section; the rest of the page still loads.
f.sql
  .prepare(
    "INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at,last_seen) VALUES('fixture-device','query-admin','Mac','darwin','credential',?,?)",
  )
  .run(recent, recent);
f.env.DB = {
  ...original,
  prepare(query: string) {
    if (query.includes("ORDER BY COALESCE(d.last_seen,d.created_at) DESC LIMIT 200"))
      throw new Error("D1_ERROR: simulated devices failure");
    return original.prepare(query);
  },
} as D1Database;
const partial = await f.call(ADMIN + "/api/admin/operations?auditTotals=0&activity=0", {
  headers: { cookie },
});
assert.equal(partial.status, 200);
const partialBody = (await partial.json()) as any;
assert.deepEqual(partialBody.unavailable, ["devices"]);
assert.equal(partialBody.totals.online, null, "Online is unknown without the device list");
assert.equal(partialBody.totals.users, 1);
assert.equal(partialBody.users[0].id, "query-admin", "The user list survives a devices failure");

f.env.DB = {
  ...original,
  prepare(query: string) {
    if (/FROM sessions/.test(query)) return original.prepare(query);
    throw new Error("D1_ERROR: simulated outage");
  },
} as D1Database;
const outage = await f.call(ADMIN + "/api/admin/operations", { headers: { cookie } });
assert.equal(outage.status, 503);
assert.equal(outage.headers.get("retry-after"), "5");
assert.deepEqual(((await outage.json()) as any).unavailable, [
  "users",
  "devices",
  "totals",
  "activity",
]);

// A device registry that never answers cannot hold the page open.
f.env.DB = original;
f.state.registry = () => new Promise<Response>(() => {});
const started = Date.now();
const stalled = await f.call(ADMIN + "/api/admin/operations?auditTotals=0&activity=0", {
  headers: { cookie },
});
assert.equal(stalled.status, 200);
assert(Date.now() - started < 6000, "The presence deadline ends the wait");
const stalledBody = (await stalled.json()) as any;
assert.equal(stalledBody.devices[0].statusVerified, false, "No answer is unknown, not offline");
assert.equal(stalledBody.totals.online, 0);
f.state.registry = null;
f.sql.close();
console.log(
  "PASS: populated/rerunnable index migration, actual indexed plans, bounded audit reads, legacy Admin totals, per-tab audit reads, isolated failing sections and a presence deadline",
);
