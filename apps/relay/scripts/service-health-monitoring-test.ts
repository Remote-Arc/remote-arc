import assert from "node:assert/strict";
import { createWorkerFixture, AGENT, ADMIN } from "./worker-fixture.js";
import { observeProductRequest } from "../src/analytics/product-observability.js";
const f = createWorkerFixture();
f.addUser("admin", "admin");
f.addUser("alice");
f.addUser("bob");
const cookie = await f.sessionCookie("alice");
await observeProductRequest(
  new Request(AGENT + "/api/apps/connections?private=CANARY", { headers: { cookie } }),
  Response.json(
    { error: "app_reauthorization_required", message: "CANARY_PRIVATE" },
    { status: 401 },
  ),
  f.env as never,
  Date.now(),
);
assert.equal(
  f.sql.prepare("SELECT error_code FROM product_events WHERE outcome='failed'").get()?.error_code,
  "APP_REAUTHORIZATION_REQUIRED",
  "Read-only business failures must be recorded with their actual safe code",
);
const { recordProductEvent, eventStatement } = await import("../src/analytics/product-events.js");
const { safeFailureCode, failureDefinition, errorCatalog } =
  await import("../src/analytics/error-catalog.js");
const { createRemoteLinkMcp } = await import("../src/mcp/mcp.js");
const { DEFAULT_MCP_SCOPES } = await import("../src/auth/oauth.js");
const { adminApiMethods } = await import("../src/admin/admin-service.js");
const { startBusinessFlow, failBusinessFlow } =
  await import("../src/analytics/business-tracking.js");
const { DatabaseSync } = await import("node:sqlite");
const fs = await import("node:fs");
const now = new Date().toISOString(),
  trace = crypto.randomUUID();
for (const [id, owner] of [
  ["alice-mac", "alice"],
  ["bob-mac", "bob"],
])
  f.sql
    .prepare(
      "INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run(id, owner, owner + " Mac", "darwin", id, now);
const adminCookie = await f.sessionCookie("admin"),
  userCookie = await f.sessionCookie("alice");
const api = async (query = "", token = adminCookie, origin = ADMIN, method = "GET") =>
  f.call(origin + "/api/admin/monitoring" + query, { method, headers: { cookie: token } });
assert.deepEqual(adminApiMethods("/api/admin/monitoring"), ["GET"]);
assert.equal((await api("", "missing")).status, 401);
assert.equal((await api("", userCookie)).status, 403);
assert.equal((await api("", adminCookie, AGENT)).status, 404);
assert.equal((await api("", adminCookie, ADMIN, "POST")).status, 405);
for (const query of [
  "?hours=999",
  "?category=nope",
  "?domain=bogus",
  "?code=PRIVATE_CANARY",
  "?email=bad",
  "?deviceId=" + encodeURIComponent("' OR 1=1"),
  "?before=invalid",
])
  assert.equal((await api(query)).status, 400, query);
assert.equal(
  safeFailureCode("BILLING_SECRET_CANARY"),
  "REQUEST_FAILED",
  "Only actual literal error codes may be persisted",
);
assert.equal(failureDefinition("MONTHLY_LIMIT_REACHED").attention, false);
assert.equal(failureDefinition("BILLING_INVALID_PLAN_CHANGE").category, "conflict");
assert.equal(failureDefinition("BILLING_INVALID_LIMIT").category, "validation");
assert.equal(failureDefinition("BILLING_QUOTA_OR_AUTHORITY_UNAVAILABLE").category, "dependency");
assert.equal(failureDefinition("SAFETY_GUARD_BLOCKED").category, "access");
assert.match(failureDefinition("BILLING_INVALID_PLAN_CHANGE").meaning, /订阅/);
assert(errorCatalog().length > 500);
assert(errorCatalog().every((item) => item.meaning && item.action && item.sources.length));
await recordProductEvent(f.env as never, {
  domain: "devices",
  name: "device.tool.completed",
  source: "server",
  outcome: "failed",
  userId: "alice",
  deviceId: "alice-mac",
  entityId: "alice-mac",
  operation: "read_file",
  errorCode: "DEVICE_TIMEOUT",
  httpStatus: 502,
  traceId: trace,
});
await recordProductEvent(f.env as never, {
  domain: "billing",
  name: "billing.plan.changed",
  source: "server",
  outcome: "failed",
  userId: "alice",
  errorCode: "BILLING_INVALID_PLAN_CHANGE",
  httpStatus: 409,
});
await recordProductEvent(f.env as never, {
  domain: "mcp",
  name: "mcp.tool.failed",
  source: "server",
  outcome: "failed",
  userId: "bob",
  deviceId: "alice-mac",
  errorCode: "MONTHLY_LIMIT_REACHED",
});
await recordProductEvent(f.env as never, {
  domain: "apps",
  name: "app.call.failed",
  source: "server",
  outcome: "failed",
  userId: "alice",
  errorCode: "app_provider_unavailable",
  appProvider: "gmail",
  operation: "messages.get",
});
// Trusted observer verifies ownership before attaching device context from a URL.
await observeProductRequest(
  new Request(AGENT + "/api/devices/bob-mac/policy", {
    method: "PATCH",
    headers: { cookie: userCookie },
  }),
  Response.json({ error: "forbidden", message: "CANARY_PRIVATE" }, { status: 404 }),
  f.env as never,
  Date.now(),
);
assert.equal(
  f.sql
    .prepare(
      "SELECT device_id FROM product_events WHERE name='device.request' ORDER BY rowid DESC LIMIT 1",
    )
    .get()?.device_id,
  null,
);
await startBusinessFlow(f.env as never, {
  id: "auth-attempt",
  scene: "email_login",
  userId: "alice",
  expiresAt: new Date(Date.now() + 60000).toISOString(),
});
await failBusinessFlow(f.env as never, "auth-attempt", "delivery_failed");
assert.equal(
  f.sql.prepare("SELECT error_code FROM product_events WHERE name='auth.flow.failed'").get()
    ?.error_code,
  "AUTH_DELIVERY_FAILED",
);
const summaryResponse = await api();
assert.equal(summaryResponse.headers.get("cache-control"), "private, no-store");
const summary = (await summaryResponse.json()) as any;
assert(summary.groups.some((g: any) => g.code === "BILLING_INVALID_PLAN_CHANGE"));
assert.equal(summary.events.length, 0, "Do not dump all event records on entry");
assert(summary.summary.attention > 0);
assert(
  summary.summary.total > summary.summary.attention,
  "Expected guards are separate from actionable failures",
);
const details = (await (await api("?code=DEVICE_TIMEOUT")).json()) as any;
assert.equal(details.events.length, 1);
assert.equal(details.events[0].userName, "alice");
assert.equal(details.events[0].userEmail, "alice@example.test");
assert.equal(details.events[0].deviceName, "alice Mac");
assert.equal(details.events[0].trace_id, trace);
const guards = (await (await api("?mode=expected&code=MONTHLY_LIMIT_REACHED")).json()) as any;
assert.equal(guards.events.length, 1, "Expected failures without an HTTP status remain visible");
const alien = (await (await api("?code=MONTHLY_LIMIT_REACHED")).json()) as any;
assert.equal(alien.events[0].deviceName, null, "Never join a device owned by another account");
const email = (await (await api("?email=alice%40example.test")).json()) as any;
assert(email.events.every((e: any) => e.user_id === "alice"));
const selected = (await (await api("?trace=" + trace)).json()) as any;
assert.equal(selected.events.length, 1);
const provider = (await (await api("?code=app_provider_unavailable")).json()) as any;
assert.equal(provider.events[0].app_provider, "gmail");
assert.equal(provider.events[0].operation, "messages.get");
// Protocol failures can have HTTP 200 and still need an observation.
await observeProductRequest(
  new Request(AGENT + "/mcp", { method: "POST", headers: { cookie: userCookie } }),
  new Response(
    "event: message\ndata: " +
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32602, message: "CANARY_PRIVATE" },
      }) +
      "\n\n",
    { headers: { "content-type": "text/event-stream" } },
  ),
  f.env as never,
  Date.now(),
);
assert.equal(
  f.sql
    .prepare(
      "SELECT error_code FROM product_events WHERE domain='mcp' AND name='mcp.request' ORDER BY rowid DESC LIMIT 1",
    )
    .get()?.error_code,
  "MCP_PROTOCOL_ERROR",
);
const identity = {
  userId: "alice",
  clientId: "fixture",
  grantId: null,
  scope: DEFAULT_MCP_SCOPES.join(" "),
  resource: AGENT + "/mcp",
};
f.env.ARC_BILLING_ENABLED = "1";
f.sql
  .prepare(
    "INSERT INTO user_monthly_usage(user_id,month_key,tool_calls,updated_at) VALUES(?,?,?,?)",
  )
  .run("alice", now.slice(0, 7), 10000, now);
const mcpTrace = crypto.randomUUID();
async function rpc(deviceId: string) {
  const handler = createRemoteLinkMcp(f.env as never, identity, { traceId: mcpTrace });
  const response = await handler.fetch(
    new Request(AGENT + "/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "read_file", arguments: { device_id: deviceId, path: "/CANARY_PRIVATE" } },
      }),
    }),
  );
  await response.text();
}
await rpc("alice-mac");
await rpc("bob-mac");
const calls = f.sql
  .prepare(
    "SELECT user_id,device_id,trace_id,error_code,operation FROM product_events WHERE name='mcp.tool.failed' AND trace_id=? ORDER BY rowid",
  )
  .all(mcpTrace) as any[];
assert.equal(calls.length, 2);
assert.equal(calls[0].device_id, "alice-mac");
assert.equal(calls[1].device_id, null);
assert(
  calls.every(
    (c) =>
      c.user_id === "alice" &&
      c.error_code === "MONTHLY_LIMIT_REACHED" &&
      c.operation === "read_file",
  ),
);
assert.equal(f.state.calls.length, 0, "Quota observations must not dispatch or replay work");
for (let i = 0; i < 55; i++)
  await eventStatement(
    f.env as never,
    {
      domain: "billing",
      name: "billing.plan.changed",
      source: "server",
      outcome: "failed",
      userId: "alice",
      errorCode: "BILLING_INVALID_PLAN_CHANGE",
    },
    now,
  ).run();
const page1 = (await (await api("?code=BILLING_INVALID_PLAN_CHANGE")).json()) as any;
assert.equal(page1.events.length, 50);
assert(page1.nextCursor);
const page2 = (await (
  await api("?code=BILLING_INVALID_PLAN_CHANGE&before=" + encodeURIComponent(page1.nextCursor))
).json()) as any;
assert.equal(page2.events.length, 6);
assert(!page2.events.some((e: any) => page1.events.some((v: any) => v.id === e.id)));
assert(
  !JSON.stringify(f.sql.prepare("SELECT * FROM product_events").all()).includes("CANARY_PRIVATE"),
);
assert(!JSON.stringify(summary).includes("CANARY_PRIVATE"));
await observeProductRequest(
  new Request(AGENT + "/api/apps/call", { method: "POST", headers: { cookie: userCookie } }),
  Response.json({ status: "failed", error: "app_execution_failed", result: "CANARY_PRIVATE" }),
  f.env as never,
  Date.now(),
);
assert.equal(
  f.sql
    .prepare(
      "SELECT error_code FROM product_events WHERE name='app.request' ORDER BY rowid DESC LIMIT 1",
    )
    .get()?.error_code,
  "APP_EXECUTION_FAILED",
  "HTTP 200 does not hide a business failure",
);
assert.equal(safeFailureCode("EMAIL_DELIVERY_UNKNOWN"), "EMAIL_DELIVERY_UNKNOWN");
assert.equal(failureDefinition("BILLING_PROMOTION_EXPIRED").category, "conflict");
assert.match(
  failureDefinition("BILLING_PROMOTION_EXPIRED").meaning,
  /优惠/,
  "Catalog explanations identify the affected object",
);
assert.match(failureDefinition("BILLING_PROMOTION_EXPIRED").meaningEn, /promotion/);
f.sql
  .prepare(
    "INSERT INTO product_events(id,occurred_at,domain,name,source,outcome,trace_id,error_code) VALUES(?,?,'apps','app.request','server','failed',?,'APP_CANARY_PRIVATE')",
  )
  .run(crypto.randomUUID(), now, crypto.randomUUID());
const historical = (await (await api("?code=REQUEST_FAILED")).json()) as any;
assert(historical.events.some((e: any) => e.error_code === "REQUEST_FAILED"));
assert(!JSON.stringify(historical).includes("APP_CANARY_PRIVATE"));
const categories = (await (await api("?category=quota")).json()) as any;
assert(
  categories.facets.some((facet: any) => facet.category === "execution"),
  "Category navigation retains counts outside the selected category",
);
const netEvent = crypto.randomUUID(),
  journey = crypto.randomUUID();
const ingest = (token: string) =>
  f.call(ADMIN + "/api/product-events", {
    method: "POST",
    headers: { cookie: token, origin: ADMIN, "content-type": "application/json" },
    body: JSON.stringify({
      journeyId: journey,
      events: [
        {
          id: netEvent,
          name: "client.network.failed",
          traceId: trace,
          route: "/api/admin",
          errorCode: "CANARY_PRIVATE",
        },
      ],
    }),
  });
assert.equal((await ingest(userCookie)).status, 403);
assert.equal((await ingest(adminCookie)).status, 204);
assert.equal(
  f.sql.prepare("SELECT error_code FROM product_events WHERE id=?").get(netEvent)?.error_code,
  "NETWORK_ERROR",
);
const before = f.sql.prepare("SELECT COUNT(*) n FROM product_events").get()!.n;
await observeProductRequest(
  new Request(AGENT + "/api/apps/connections", { headers: { cookie: userCookie } }),
  Response.json({ connections: [] }),
  f.env as never,
  Date.now(),
);
assert.equal(
  f.sql.prepare("SELECT COUNT(*) n FROM product_events").get()!.n,
  before,
  "Successful read-only polling is not recorded",
);
const unavailable = {
  ...f.env,
  DB: {
    prepare() {
      throw Error("CANARY_PRIVATE");
    },
  },
};
assert.equal(
  await recordProductEvent(unavailable as never, {
    domain: "apps",
    name: "app.failed",
    source: "server",
    outcome: "failed",
  }),
  false,
  "Observability outages cannot replace business results",
);
// Historical rows are grouped and filtered with current codes without rewriting data.
const legacyId = crypto.randomUUID();
f.sql
  .prepare(
    "INSERT INTO product_events(id,occurred_at,domain,name,source,outcome,user_id,trace_id,error_code,failure_category) VALUES(?,?,'apps','app.request','server','failed','alice',?,'app_provider_unavailable','dependency')",
  )
  .run(legacyId, now, crypto.randomUUID());
await recordProductEvent(f.env as never, {
  domain: "apps",
  name: "app.call.failed",
  source: "server",
  outcome: "failed",
  userId: "alice",
  errorCode: "APP_PROVIDER_UNAVAILABLE",
});
for (const code of ["app_provider_unavailable", "APP_PROVIDER_UNAVAILABLE"]) {
  const response = await api("?code=" + code);
  assert.equal(response.status, 200);
  const value = (await response.json()) as any;
  assert.equal(value.groups.length, 1);
  assert.equal(value.groups[0].code, "APP_PROVIDER_UNAVAILABLE");
  assert.equal(value.groups[0].total, 3);
  assert.equal(value.events.length, 3);
  assert(value.events.every((event: any) => event.error_code === "APP_PROVIDER_UNAVAILABLE"));
}
assert.equal(
  f.sql.prepare("SELECT error_code FROM product_events WHERE id=?").get(legacyId)?.error_code,
  "app_provider_unavailable",
  "Reading the monitor never rewrites history",
);
// Migration from a real populated pre-monitoring schema; old writer still works.
const old = new DatabaseSync(":memory:");
const migrationDir = new URL("../migrations/", import.meta.url);
for (const file of fs
  .readdirSync(migrationDir)
  .filter((v) => v.endsWith(".sql") && v < "0077_business_monitoring.sql")
  .sort())
  old.exec(fs.readFileSync(new URL(file, migrationDir), "utf8"));
old
  .prepare(
    "INSERT INTO product_events(id,occurred_at,domain,name,source,outcome,trace_id,error_code) VALUES('legacy',?,'apps','app.request','server','failed',?,'app_provider_failed')",
  )
  .run(now, crypto.randomUUID());
old.exec(fs.readFileSync(new URL("0077_business_monitoring.sql", migrationDir), "utf8"));
assert.equal(
  old.prepare("SELECT failure_category,device_id FROM product_events WHERE id='legacy'").get()
    ?.failure_category,
  null,
  "Historical context stays unknown, never fabricated",
);
old
  .prepare(
    "INSERT INTO product_events(id,occurred_at,domain,name,source,outcome,trace_id) VALUES('old-writer',?,'apps','app.request','server','accepted',?)",
  )
  .run(now, crypto.randomUUID());
assert.equal(old.prepare("SELECT COUNT(*) n FROM product_events").get()?.n, 2);
old.close();
await Promise.all(f.pending);
f.sql.close();
console.log(
  "PASS: business errors on GET/MCP HTTP 200, exact safe catalog, auth outcomes, admin host/RBAC, user/device ownership, App context, grouping, filters, cursor pagination, canary privacy, fail-open telemetry, no successful polling flood and populated schema compatibility",
);
