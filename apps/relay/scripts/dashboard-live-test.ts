import assert from "node:assert/strict";
import { AGENT, createWorkerFixture } from "./worker-fixture.js";

const fixture = createWorkerFixture();
fixture.addUser("owner");
fixture.addUser("other");
fixture.sql
  .prepare(
    "INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at) VALUES(?,?,?,?,?,?)",
  )
  .run("device-1", "owner", "Test Mac", "darwin", "fixture-hash", fixture.now);

const registry: Array<{
  path: string;
  userId: string | null;
  upgrade: string | null;
  body: string;
}> = [];
fixture.state.registry = async (request) => {
  registry.push({
    path: new URL(request.url).pathname,
    userId: request.headers.get("x-remote-link-user-id"),
    upgrade: request.headers.get("upgrade"),
    body: request.method === "POST" ? await request.text() : "",
  });
  return Response.json({ ok: true, delivered: 1 });
};

const owner = await fixture.sessionCookie("owner");
const live = (headers: Record<string, string>) => fixture.call(AGENT + "/api/live", { headers });

assert.equal((await live({ origin: AGENT, upgrade: "websocket" })).status, 401);
assert.equal(
  (await live({ cookie: owner, origin: "https://evil.example", upgrade: "websocket" })).status,
  403,
  "another origin must not open a signed-in person's feed",
);
assert.equal((await live({ cookie: owner, upgrade: "websocket" })).status, 403);
assert.equal((await live({ cookie: owner, origin: AGENT })).status, 426);
assert.equal(registry.length, 0, "rejected feeds must not reach the Registry");

assert.equal((await live({ cookie: owner, origin: AGENT, upgrade: "websocket" })).status, 200);
assert.deepEqual(registry, [{ path: "/live", userId: "owner", upgrade: "websocket", body: "" }]);

// A decision from the Dashboard tells the person's other open tabs to reload.
const addApproval = (id: string) =>
  fixture.sql
    .prepare(
      "INSERT INTO approval_requests(id,user_id,device_id,request_id,tool_name,target_path,args_hash,status,requested_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      id,
      "owner",
      "device-1",
      "request-" + id,
      "write_file",
      "/Users/test/Desktop/a.txt",
      "hash",
      "pending",
      fixture.now,
      new Date(Date.now() + 600_000).toISOString(),
    );
addApproval("approval-1");
registry.length = 0;
const decide = (id: string, cookie: string) =>
  fixture.call(AGENT + "/api/approvals/" + id + "/decision", {
    method: "POST",
    headers: { cookie, origin: AGENT, "content-type": "application/json" },
    body: JSON.stringify({ decision: "deny" }),
  });
assert.equal((await decide("approval-1", owner)).status, 200);
assert.deepEqual(registry, [
  { path: "/live-notify", userId: "owner", upgrade: null, body: '{"topic":"approvals"}' },
]);

// A refused decision changes nothing, so it must not wake any tab.
registry.length = 0;
assert.equal((await decide("approval-1", owner)).status, 409);
assert.equal((await decide("approval-1", await fixture.sessionCookie("other"))).status, 404);
assert.deepEqual(registry, []);

console.log(
  "PASS: only a signed-in same-origin Dashboard opens its own change feed, and approval decisions notify it",
);
