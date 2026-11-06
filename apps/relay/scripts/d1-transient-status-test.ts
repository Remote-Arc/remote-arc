// A transient D1 failure is a dependency outage, not a Relay bug. Cloudflare
// documents these D1 errors as retryable. A request that hits one must answer
// 503 with Retry-After, and the monitor must classify it as "unavailable",
// instead of a 500 recorded as "D1_ERROR: details omitted".
// Other D1 errors (a bad query or bad data) still answer 500.
import assert from "node:assert/strict";
import { diagnosticError } from "../src/platform/diagnostics.js";
import { AGENT, createWorkerFixture, json } from "./worker-fixture.js";

// Error texts from https://developers.cloudflare.com/d1/observability/debug-d1/
// that matched no class before.
const transient = [
  "D1_ERROR: Cannot resolve D1 DB due to transient issue on remote node.",
  "D1_ERROR: Replica disconnected from primary.",
  "D1_ERROR: Can't read from request stream because client disconnected.",
];
for (const message of transient)
  assert.equal(
    diagnosticError(new Error(message)),
    "D1_ERROR: unavailable (details omitted)",
    message + " is classified as unavailable",
  );
assert.equal(
  diagnosticError(new Error("D1_ERROR: datatype mismatch: SQLITE_MISMATCH")),
  "D1_ERROR: details omitted",
  "a query error is not reported as an outage",
);

const { sql, env, call, pending, addUser, sessionCookie } = createWorkerFixture();
addUser("owner");
const cookie = await sessionCookie("owner");

// Fail only the browser-task attention read, the request the Dashboard polls
// every five seconds. Session lookup and incident writes use the real database.
const realDb = env.DB as D1Database;
let failure: string | null = null;
env.DB = {
  ...realDb,
  prepare(query: string) {
    const statement = realDb.prepare(query);
    if (!query.includes("FROM runner_attention a")) return statement;
    const fail = async () => {
      if (failure) throw new Error(failure);
    };
    const wrap = (inner: D1PreparedStatement) => ({
      ...inner,
      bind: (...args: unknown[]) => wrap(inner.bind(...args)),
      all: async () => (await fail(), inner.all()),
      first: async () => (await fail(), inner.first()),
    });
    return wrap(statement) as unknown as D1PreparedStatement;
  },
  batch: realDb.batch.bind(realDb),
} as D1Database;

const attention = () =>
  call(AGENT + "/api/runner/attention", { headers: { cookie, accept: "application/json" } });
const incidents = async () => {
  await Promise.all(pending.splice(0));
  return sql
    .prepare(
      "SELECT status_code, method, path, message, kind FROM service_incidents ORDER BY created_at, rowid",
    )
    .all() as { status_code: number; method: string; path: string; message: string }[];
};

let response = await attention();
assert.equal(response.status, 200, "the attention list loads while D1 is healthy");
assert.deepEqual((await json(response)).attention, []);

for (const message of transient) {
  failure = message;
  response = await attention();
  assert.equal(response.status, 503, message + " answers 503, not 500");
  assert.equal(response.headers.get("retry-after"), "5", "the client is told when to retry");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await json(response);
  assert.equal(body.error, "SERVICE_UNAVAILABLE");
  assert.ok(!JSON.stringify(body).includes("D1"), "storage details stay out of the response");
}
const recorded = await incidents();
assert.equal(recorded.length, transient.length, "each outage is still recorded");
for (const incident of recorded)
  assert.deepEqual(
    { ...incident },
    {
      status_code: 503,
      method: "GET",
      path: "/:redacted",
      message: "D1_ERROR: unavailable (details omitted)",
      kind: "exception",
    },
  );

// A non-transient D1 error keeps the unexpected-error answer.
failure = "D1_ERROR: datatype mismatch: SQLITE_MISMATCH";
response = await attention();
assert.equal(response.status, 500, "a query error is still a Relay error");
assert.equal(response.headers.get("retry-after"), null);
assert.equal((await json(response)).error, "INTERNAL_ERROR");
const last = (await incidents()).at(-1)!;
assert.equal(last.status_code, 500);
assert.equal(last.message, "D1_ERROR: details omitted");

failure = null;
assert.equal((await attention()).status, 200, "the next poll recovers");

console.log(
  "PASS: documented transient D1 errors answer 503 with Retry-After and are recorded as unavailable; other D1 errors still answer 500",
);
