import assert from "node:assert/strict";
import { createWorkerFixture, ADMIN, AGENT } from "./worker-fixture.js";
import { eventStatement } from "../src/analytics/product-events.js";
import { handleServiceMetrics, serviceMetrics } from "../src/analytics/service-metrics.js";

const f = createWorkerFixture();
f.addUser("metrics-admin", "admin");
f.addUser("metrics-user");
const admin = await f.sessionCookie("metrics-admin");
const ordinary = await f.sessionCookie("metrics-user");
const api = (suffix = "", cookie = admin, origin = ADMIN, method = "GET") =>
  f.call(origin + "/api/admin/metrics" + suffix, { method, headers: { cookie } });
assert.equal((await api("", "missing")).status, 401);
assert.equal((await api("", ordinary)).status, 403);
assert.equal((await api("", admin, AGENT)).status, 404);
assert.equal((await api("", admin, ADMIN, "POST")).status, 405);
for (const suffix of ["?hours=999", "?domain=unknown", "?format=html"])
  assert.equal((await api(suffix)).status, 400);
const now = new Date();
for (const [index, duration] of [
  10000,
  20,
  ...Array.from({ length: 18 }, (_, i) => (i + 1) * 10),
].entries()) {
  const status = index === 0 ? 503 : index === 1 ? 429 : 200;
  await eventStatement(
    f.env as never,
    {
      name: "app.request",
      domain: "apps",
      source: "server",
      outcome: status >= 400 ? "failed" : "accepted",
      userId: "metrics-user",
      route: "/api/apps/:action",
      httpStatus: status,
      durationMs: duration,
      ...(status >= 400 ? { errorCode: "REQUEST_FAILED" } : {}),
    },
    new Date(now.getTime() - (index < 2 ? 90 : 65) * 60000).toISOString(),
  ).run();
}
await eventStatement(
  f.env as never,
  {
    name: "client.network.failed",
    domain: "client",
    source: "browser",
    outcome: "failed",
    userId: "metrics-user",
    httpStatus: 500,
    durationMs: 900000,
    errorCode: "REQUEST_FAILED",
  },
  new Date(now.getTime() - 30000).toISOString(),
).run();
const response = await api();
assert.equal(response.status, 200);
const data = (await response.json()) as Awaited<ReturnType<typeof serviceMetrics>>;
assert.deepEqual(data.totals, {
  requests: 20,
  serverErrors: 1,
  clientErrors: 1,
  slowRequests: 1,
  failures: 3,
  attention: 3,
  p50Ms: 90,
  p95Ms: 180,
});
assert.equal(data.coverage, "recorded_events");
assert(
  data.points.some((point) => point.requests === 0 && point.p95Ms === null),
  "No latency samples stay null, not a fabricated zero",
);
assert.equal(
  data.points.reduce((sum, point) => sum + point.requests, 0),
  20,
);
assert.equal((await serviceMetrics(f.env.DB as D1Database, 1, "", now)).totals.requests, 0);
assert.equal((await serviceMetrics(f.env.DB as D1Database, 24, "client", now)).totals.requests, 0);
assert.equal((await serviceMetrics(f.env.DB as D1Database, 168, "apps", now)).totals.failures, 2);
assert(!JSON.stringify(data).includes("metrics-user"), "Metrics never contain user identifiers");
assert(
  !JSON.stringify(data).includes("/api/apps"),
  "Raw request routes never become metric labels",
);

const token = "metrics-export-fixture-only-32-characters-CANARY";
f.env.ADMIN_METRICS_TOKEN = token;
const scrape = (path: string, supplied = token) =>
  f.call(ADMIN + path, { headers: { authorization: "Bearer " + supplied } });
assert.equal((await scrape("/api/admin/metrics?format=prometheus", "wrong-token")).status, 401);
assert.equal(
  (await scrape("/api/admin/metrics")).status,
  401,
  "Exporter credentials cannot read the normal Admin JSON API",
);
assert.equal(
  (await scrape("/api/admin/operations")).status,
  401,
  "Exporter credentials never grant general administrator access",
);
const exported = await scrape("/api/admin/metrics?format=prometheus&domain=apps");
assert.equal(exported.status, 200);
assert.match(exported.headers.get("content-type")!, /text\/plain; version=0\.0\.4/);
assert.match(exported.headers.get("cache-control")!, /private, no-store/);
const text = await exported.text();
assert.match(text, /# TYPE remote_arc_observed_requests gauge/);
assert.match(text, /remote_arc_observed_requests\{window="24h",domain="apps"\} 20/);
assert.match(text, /remote_arc_observed_duration_p95_seconds.*0\.18/);
assert(!text.includes(token));
assert(!text.includes("metrics-user"));
const empty = await scrape("/api/admin/metrics?format=prometheus&domain=auth");
assert.match(await empty.text(), /remote_arc_observed_duration_p95_seconds.*NaN/);
f.env.ADMIN_METRICS_TOKEN = "short";
assert.equal((await scrape("/api/admin/metrics?format=prometheus")).status, 401);
assert.equal(
  (await api("?format=prometheus")).status,
  200,
  "An administrator can inspect the export through their existing session",
);
// Repeated durations must carry their full sample weight, including the exact
// 95th-percentile boundary. A percentile of unique durations would fail here.
for (let i = 0; i < 21; i++) {
  await eventStatement(
    f.env as never,
    {
      name: "task.request",
      domain: "tasks",
      source: "server",
      outcome: "accepted",
      route: "/api/arc/tasks",
      httpStatus: 200,
      durationMs: i < 19 ? 10 : 1000,
    },
    new Date(now.getTime() - 3600000).toISOString(),
  ).run();
  if (i === 19) {
    const weighted = await serviceMetrics(f.env.DB, 24, "tasks", now);
    assert.equal(weighted.totals.p95Ms, 10);
    assert.equal(weighted.points.find((point) => point.requests)?.p95Ms, 10);
  }
}
const weighted = await serviceMetrics(f.env.DB, 24, "tasks", now);
assert.equal(weighted.totals.requests, 21);
assert.equal(weighted.totals.p50Ms, 10);
assert.equal(weighted.totals.p95Ms, 1000);
f.env.ADMIN_METRICS_TOKEN = token;
const unavailable = await handleServiceMetrics(
  new Request(ADMIN + "/api/admin/metrics?format=prometheus", {
    headers: { authorization: "Bearer " + token },
  }),
  {
    ...f.env,
    DB: {
      prepare() {
        throw Error("SQL-CANARY-SECRET");
      },
    } as unknown as D1Database,
  },
);
assert.equal(unavailable.status, 503);
assert.deepEqual(await unavailable.json(), { error: "METRICS_UNAVAILABLE" });
f.sql.close();
console.log(
  "PASS: actual SQL time buckets, exact global quantiles, sparse data, scope, privacy, admin RBAC and aggregate-only Prometheus credentials",
);
