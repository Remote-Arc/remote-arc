import assert from "node:assert/strict";
import { CONNECT_FREE_OVERFLOW } from "@remotearc/protocol";
import { consumeToolCall, getMonthlyUsage } from "../src/billing/usage.js";
import { createRemoteLinkMcp } from "../src/mcp/mcp.js";
import { AGENT, MCP, createWorkerFixture } from "./worker-fixture.js";

const fixture = createWorkerFixture(),
  { sql } = fixture;
const env = { ...fixture.env, ARC_PLATFORM_ENABLED: "1" } as never;
const month = new Date().toISOString().slice(0, 7);
const intervalMs = 60_000 / CONNECT_FREE_OVERFLOW.slowLaneCallsPerMinute;
const setUsed = (userId: string, calls: number, monthKey = month) =>
  sql
    .prepare(
      `INSERT INTO user_monthly_usage(user_id,month_key,tool_calls,updated_at) VALUES(?,?,?,?)
       ON CONFLICT(user_id,month_key) DO UPDATE SET tool_calls=excluded.tool_calls`,
    )
    .run(userId, monthKey, calls, new Date().toISOString());
const used = (userId: string) =>
  Number(
    sql
      .prepare("SELECT tool_calls n FROM user_monthly_usage WHERE user_id=? AND month_key=?")
      .get(userId, month)?.n ?? 0,
  );
const trialRows = (userId: string) =>
  Number(
    sql.prepare("SELECT COUNT(*) n FROM connect_unlimited_trials WHERE user_id=?").get(userId)!.n,
  );
const slowLane = (userId: string) =>
  sql.prepare("SELECT * FROM connect_slow_lane_usage WHERE user_id=?").get(userId) as
    { last_call_at: string; month_key: string; month_calls: number } | undefined;
const rejectsWith = async (promise: Promise<unknown>, code: string) => {
  const error = (await promise.then(
    () => assert.fail("expected " + code),
    (caught) => caught,
  )) as Error & { code?: string; retryAfterSeconds?: number };
  assert.equal(error.code, code);
  return error;
};

// 1. Below and at the allowance nothing changes.
fixture.addUser("free");
setUsed("free", 9999);
assert.equal((await consumeToolCall(env, "free")).used, 10000, "the 10,000th call succeeds");
assert.equal(trialRows("free"), 0, "reaching the allowance alone does not start a trial");
const atLimit = await getMonthlyUsage(env, "free");
assert.equal(atLimit.remaining, 0);
assert.deepEqual(
  atLimit.freeOverflow,
  {
    trialDays: CONNECT_FREE_OVERFLOW.trialDays,
    slowLaneCallsPerMinute: CONNECT_FREE_OVERFLOW.slowLaneCallsPerMinute,
    trial: null,
    slowLaneCallsThisMonth: 0,
  },
  "an exhausted Free account is told a trial is available",
);

// 2. The first call past the allowance starts the one-off reverse trial and succeeds.
const before = Date.now();
const started = await consumeToolCall(env, "free");
assert.equal(started.used, 10001, "the trial call is counted, not blocked");
assert.equal(started.limit, 10000, "the Free allowance itself is unchanged");
assert.equal(started.unlimited, false);
assert.equal(started.freeOverflow?.trial?.active, true);
const endsAt = Date.parse(started.freeOverflow!.trial!.endsAt);
const days = CONNECT_FREE_OVERFLOW.trialDays * 86_400_000;
assert(endsAt >= before + days && endsAt <= Date.now() + days, "trial lasts the published days");
assert.equal(trialRows("free"), 1);
const event = sql
  .prepare("SELECT domain,outcome,user_id FROM product_events WHERE name=?")
  .get("billing.connect_trial.started") as Record<string, unknown> | undefined;
assert.deepEqual(
  { ...event },
  { domain: "billing", outcome: "succeeded", user_id: "free" },
  "trial starts are measurable",
);

// 3. During the trial calls are uncapped and concurrent calls never start a second trial.
await Promise.all(Array.from({ length: 5 }, () => consumeToolCall(env, "free")));
assert.equal(used("free"), 10006);
assert.equal(trialRows("free"), 1);
assert.equal(slowLane("free"), undefined, "trial calls never use the slow lane");

// 4. After the trial: the slow lane allows one call per interval, then refuses with a retry time.
sql
  .prepare("UPDATE connect_unlimited_trials SET ends_at=? WHERE user_id=?")
  .run(new Date(Date.now() - 1000).toISOString(), "free");
const slow = await consumeToolCall(env, "free");
assert.equal(slow.used, 10006, "slow-lane calls do not inflate the allowance counter");
assert.equal(slow.freeOverflow?.trial?.active, false);
assert.equal(slow.freeOverflow?.slowLaneCallsThisMonth, 1);
const refused = await rejectsWith(consumeToolCall(env, "free"), "SLOW_LANE_RATE_LIMITED");
assert(
  refused.retryAfterSeconds! >= 1 && refused.retryAfterSeconds! <= intervalMs / 1000,
  "a refused call says when to retry",
);
assert.equal(slowLane("free")!.month_calls, 1, "a refused call is not counted");
const concurrent = await Promise.allSettled(
  Array.from({ length: 4 }, () => consumeToolCall(env, "free")),
);
assert(
  concurrent.every((result) => result.status === "rejected"),
  "no burst past the pace",
);

// 5. Once the interval has passed, the next call is allowed again.
sql
  .prepare("UPDATE connect_slow_lane_usage SET last_call_at=? WHERE user_id=?")
  .run(new Date(Date.now() - intervalMs - 1000).toISOString(), "free");
assert.equal((await consumeToolCall(env, "free")).freeOverflow?.slowLaneCallsThisMonth, 2);
const slowUsage = await getMonthlyUsage(env, "free");
assert.equal(slowUsage.freeOverflow?.trial?.active, false);
assert.equal(slowUsage.freeOverflow?.slowLaneCallsThisMonth, 2);

// 6. A new month restores the full allowance; the trial is not offered again.
sql.prepare("UPDATE user_monthly_usage SET month_key='2000-01' WHERE user_id=?").run("free");
sql
  .prepare("UPDATE connect_slow_lane_usage SET month_key='2000-01', last_call_at=? WHERE user_id=?")
  .run(new Date(Date.now() - intervalMs - 1000).toISOString(), "free");
const fresh = await getMonthlyUsage(env, "free");
assert.equal(fresh.remaining, 10000);
assert.equal(fresh.freeOverflow, undefined, "a fresh month shows the plain allowance");
setUsed("free", 10000);
const nextMonth = await consumeToolCall(env, "free");
assert.equal(nextMonth.freeOverflow?.trial?.active, false, "the reverse trial is one-off");
assert.equal(nextMonth.freeOverflow?.slowLaneCallsThisMonth, 1, "monthly slow-lane total resets");
assert.equal(trialRows("free"), 1);

// 7. Accounts outside Free billing keep their existing behaviour.
fixture.addUser("legacy");
setUsed("legacy", 10000);
await rejectsWith(consumeToolCall(fixture.env as never, "legacy"), "MONTHLY_LIMIT_REACHED");
assert.equal(trialRows("legacy"), 0, "no trial without platform billing");
fixture.addUser("operator", "admin");
setUsed("operator", 50000);
const operator = await consumeToolCall(env, "operator");
assert.equal(operator.unlimited, true);
assert.equal(operator.freeOverflow, undefined);
assert.equal(trialRows("operator"), 0);

// 8. MCP device tools report the slow lane with a retry time and an Unlimited checkout link.
fixture.addUser("mcp-user");
setUsed("mcp-user", 10000);
sql
  .prepare(
    "INSERT INTO connect_unlimited_trials(user_id,started_at,ends_at,month_key,base_limit) VALUES(?,?,?,?,10000)",
  )
  .run("mcp-user", "2000-01-01T00:00:00.000Z", "2000-01-08T00:00:00.000Z", "2000-01");
const listDevices = async () => {
  const server = createRemoteLinkMcp(env, {
    userId: "mcp-user",
    clientId: "overflow-client",
    grantId: null,
    resource: MCP + "/mcp",
    scope: "devices:read",
  });
  const response = await server.fetch(
    new Request(MCP + "/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "list_devices", arguments: {} },
      }),
    }),
  );
  const text = await response.text();
  const rpc = JSON.parse(
    text.trim().startsWith("{")
      ? text
      : text
          .split("\n")
          .find((line) => line.startsWith("data: "))!
          .slice(6),
  );
  return JSON.parse(rpc.result.content[0].text);
};
const firstSlow = await listDevices();
assert(!("error" in firstSlow), "the first slow-lane call runs the tool");
const paced = await listDevices();
assert.equal(paced.error.code, "SLOW_LANE_RATE_LIMITED");
assert(paced.error.retry_after_seconds >= 1 && paced.error.retry_after_seconds <= 30);
assert.equal(paced.error.upgrade_url, AGENT + "/checkout?product=connect-unlimited-v1");
assert.equal(paced.error.recovery.retry, "later");

// 9. Deleting an account removes its trial and slow-lane rows.
sql.prepare("DELETE FROM users WHERE id=?").run("free");
assert.equal(trialRows("free"), 0);
assert.equal(slowLane("free"), undefined);

sql.close();
console.log(
  "PASS: Free Connect overflow starts one reverse trial at the allowance, keeps trial calls uncapped and race-safe, then paces calls in the slow lane with a retry time, reports it to MCP clients, resets monthly and leaves other accounts unchanged",
);
