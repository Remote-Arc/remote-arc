// GET /api/activity reads the caller's audit trail with a `limit` query value.
// SQLite rejects a LIMIT that is not an integer ("datatype mismatch"), so any
// value that is not a whole number must be normalised before it reaches D1,
// or the Worker answers 500 and records an exception incident.
import assert from "node:assert/strict";
import { AGENT, createWorkerFixture, json } from "./worker-fixture.js";

const { sql, call, pending, addUser, sessionCookie } = createWorkerFixture();
addUser("owner");
addUser("other");
const cookie = await sessionCookie("owner");

const insert = sql.prepare(
  "INSERT INTO audit_events(id,user_id,event_type,success,created_at) VALUES(?,?,?,1,?)",
);
for (let i = 0; i < 120; i++)
  insert.run(
    "owner-" + i,
    "owner",
    "tool_call",
    new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
  );
insert.run("other-0", "other", "tool_call", new Date(Date.UTC(2026, 0, 2)).toISOString());

const activity = async (query: string) => {
  const response = await call(AGENT + "/api/activity" + query, { headers: { cookie } });
  return { status: response.status, body: await json(response) };
};

for (const [query, expected] of [
  ["", 20],
  ["?limit=5", 5],
  ["?limit=", 20],
  ["?limit=abc", 20],
  ["?limit=NaN", 20],
  ["?limit=Infinity", 20],
  ["?limit=1e300", 100],
  ["?limit=10.5", 10],
  ["?limit=0", 1],
  ["?limit=-7", 1],
  ["?limit=500", 100],
] as const) {
  const { status, body } = await activity(query);
  assert.equal(status, 200, "GET /api/activity" + query + " answers 200, not a D1 error");
  assert.ok(Array.isArray(body), query + " returns the activity list");
  assert.equal(body.length, expected, query + " is normalised to " + expected + " rows");
  assert.ok(
    body.every((row: { id: string }) => row.id.startsWith("owner-")),
    query + " returns only the caller's events",
  );
}
assert.equal((await activity("?limit=3")).body[0].id, "owner-119", "newest events come first");

await Promise.all(pending);
assert.equal(
  sql.prepare("SELECT COUNT(*) AS n FROM service_incidents").get()?.n,
  0,
  "no request recorded a service incident",
);

console.log(
  "PASS: GET /api/activity normalises non-integer, non-finite and out-of-range limits instead of failing in D1",
);
