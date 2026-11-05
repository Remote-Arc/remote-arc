import assert from "node:assert/strict";
import { createWorkerFixture, ADMIN } from "./worker-fixture.js";
import { getMonthlyUsage } from "../src/billing/usage.js";

const f = createWorkerFixture();
f.addUser("followup-operator", "admin");
f.env.ARC_BILLING_ENABLED = "1";
const cookie = await f.sessionCookie("followup-operator");
const now = new Date(),
  month = now.toISOString().slice(0, 7),
  previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);
for (const [id, used] of [
  ["zero", 0],
  ["past", 0],
  ["active", 123],
  ["high", 1500],
  ["near", 8000],
  ["full", 10000],
] as const) {
  f.addUser("usage-" + id);
  f.sql
    .prepare(
      "INSERT INTO user_monthly_usage(user_id,month_key,tool_calls,updated_at) VALUES(?,?,?,?)",
    )
    .run("usage-" + id, month, used, f.now);
}
f.sql
  .prepare(
    "INSERT INTO user_monthly_usage(user_id,month_key,tool_calls,updated_at) VALUES(?,?,?,?)",
  )
  .run("usage-past", previous, 50000, f.now);
async function list(usage: string, path = "", query = "usage-") {
  const response = await f.call(
    ADMIN +
      "/api/admin/followups" +
      path +
      "?" +
      new URLSearchParams({ usage, query, sort: "name" }),
    { headers: { cookie } },
  );
  const data = (await response.json()) as any;
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}
try {
  for (const [usage, expected] of [
    ["none", ["past", "zero"]],
    ["used", ["active", "full", "high", "near"]],
    ["high", ["full", "high", "near"]],
    ["near", ["full", "near"]],
    ["exhausted", ["full"]],
  ] as const) {
    const result = await list(usage);
    assert.deepEqual(
      result.items.map((p: any) => p.id),
      expected.map((id) => "usage-" + id),
      usage + " filters current month before pagination",
    );
    assert.equal(result.total, expected.length);
    assert.equal(result.counts.all, expected.length, "tab counts use the same usage cohort");
    const selection = await list(usage, "/selection");
    assert.deepEqual(
      selection.ids,
      result.items.map((p: any) => p.id),
      "bulk matching uses the same cohort",
    );
    for (const person of result.items) {
      const usage = await getMonthlyUsage(f.env as never, person.id);
      assert.equal(person.monthly_calls, usage.used);
      assert.equal(
        person.monthly_limit,
        usage.limit,
        "displayed quota matches the authoritative billing policy",
      );
    }
  }
  const setUsage = (id: string, used: number) =>
    f.sql
      .prepare(
        "INSERT INTO user_monthly_usage(user_id,month_key,tool_calls,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,month_key) DO UPDATE SET tool_calls=excluded.tool_calls",
      )
      .run(id, month, used, f.now);
  for (const id of [
    "admin",
    "operator",
    "credit",
    "legacy",
    "reward",
    "paid",
    "pinned",
    "expired",
    "plus",
    "grant",
    "boundary",
    "priority",
    "revoked",
  ]) {
    f.addUser("policy-" + id, id === "admin" ? "admin" : "user");
    setUsage("policy-" + id, 10000);
  }
  f.env.OPERATOR_EMAIL = "  POLICY-OPERATOR@EXAMPLE.TEST  ";
  f.sql
    .prepare(
      "INSERT INTO user_call_credit_grants(id,user_id,month_key,extra_calls,reason,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run("extra", "policy-credit", month, 5000, "fixture", f.now);
  f.sql
    .prepare(
      "INSERT INTO user_call_credit_grants(id,user_id,month_key,extra_calls,reason,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run("old-extra", "policy-expired", previous, 5000, "fixture", f.now);
  f.sql
    .prepare("INSERT INTO arc_connect_legacy_allowances(user_id,monthly_calls) VALUES(?,?)")
    .run("policy-legacy", 20000);
  f.sql.prepare("UPDATE users SET plan='plus' WHERE id='policy-plus'").run();
  f.sql
    .prepare(
      "INSERT INTO plan_grants(id,user_id,plan,source,reason,created_at) VALUES('grant','policy-grant','plus','manual','fixture',?)",
    )
    .run(f.now);
  const assign = (id: string, expires: string, version: string | null = null) =>
    f.sql
      .prepare(
        "INSERT INTO billing_plan_assignments(id,plan_id,subject_type,subject_id,expires_at,created_at,commercial_version_id) VALUES(?,?,'user',?,?,?,?)",
      )
      .run(id, "arc-plus-v1", "policy-" + id, expires, f.now, version);
  assign("paid", "2099-01-01");
  assign("expired", "2000-01-01");
  f.sql
    .prepare(
      "INSERT INTO arc_commercial_versions(id,product_id,kind,mode,config_json,base_revision,created_at,published_at) SELECT 'pinned-finite',product_id,kind,mode,json_set(config_json,'$.connectToolCalls',30000),0,created_at,published_at FROM arc_commercial_versions WHERE id='seed:live:arc-plus-v1'",
    )
    .run();
  assign("pinned", "2099-01-01", "pinned-finite");
  assign("priority", "2099-01-01", "pinned-finite");
  f.sql
    .prepare(
      "INSERT INTO billing_plan_assignments(id,plan_id,subject_type,subject_id,expires_at,created_at) VALUES('higher-plan','arc-pro-v1','user','policy-priority','2098-01-01',?)",
    )
    .run(f.now);
  assign("revoked", "2099-01-01");
  f.sql.prepare("UPDATE billing_plan_assignments SET revoked_at=? WHERE id='revoked'").run(f.now);
  const rewardVersion = f.sql.prepare("SELECT id FROM feedback_reward_versions LIMIT 1").get() as {
    id: string;
  };
  f.sql
    .prepare(
      "INSERT INTO feedback_reward_claims(id,user_id,version_id,status,created_at) VALUES('claim','policy-reward',?,'granted',?)",
    )
    .run(rewardVersion.id, f.now);
  f.sql
    .prepare(
      "INSERT INTO connect_feedback_rewards(id,claim_id,user_id,granted_calls,starts_at,expires_at,created_at) VALUES('reward','claim','policy-reward',400,?,'2099-01-01',?)",
    )
    .run(f.now, f.now);
  for (let n = 0; n < 3; n++)
    f.sql
      .prepare(
        "INSERT INTO connect_reward_consumptions(id,user_id,month_key,reward_id,base_limit,created_at) VALUES(?,'policy-reward',?,'reward',10000,?)",
      )
      .run("spent-" + n, month, f.now);
  setUsage("policy-boundary", 7999);
  const limits: Record<string, number | null> = {
    admin: null,
    operator: null,
    credit: 15000,
    legacy: 20000,
    reward: 10400,
    paid: null,
    pinned: 30000,
    expired: 10000,
    plus: 10000,
    grant: 10000,
    boundary: 10000,
    priority: null,
    revoked: 10000,
  };
  for (const person of (await list("all", "", "policy-")).items) {
    const current = await getMonthlyUsage(f.env as never, person.id);
    assert.equal(
      person.monthly_limit,
      limits[person.id.slice(7)],
      person.id + " published allowance",
    );
    assert.equal(person.monthly_limit, current.limit, person.id + " canonical policy parity");
    assert.equal(person.monthly_calls, current.used);
    assert(!("quota_base" in person), "internal policy fields are not exposed");
  }
  assert.deepEqual(
    (await list("exhausted", "", "policy-")).items.map((p: any) => p.id),
    ["policy-expired", "policy-grant", "policy-plus", "policy-revoked"],
  );
  assert(
    !(await list("near", "", "policy-")).items.some((p: any) => p.id === "policy-boundary"),
    "one below 80% is excluded",
  );
  setUsage("policy-boundary", 8000);
  assert(
    (await list("near", "", "policy-")).items.some((p: any) => p.id === "policy-boundary"),
    "exactly 80% is included",
  );
  setUsage("policy-boundary", 9999);
  assert(
    !(await list("exhausted", "", "policy-")).items.some((p: any) => p.id === "policy-boundary"),
  );
  setUsage("policy-boundary", 10000);
  assert(
    (await list("exhausted", "", "policy-")).items.some((p: any) => p.id === "policy-boundary"),
  );
  f.env.ARC_BILLING_ENABLED = "0";
  f.env.MONTHLY_TOOL_CALL_LIMIT = "20000";
  f.env.FREE_MONTHLY_TOOL_CALL_LIMIT = "5000";
  for (const person of (await list("all", "", "policy-")).items)
    assert.equal(
      person.monthly_limit,
      (await getMonthlyUsage(f.env as never, person.id)).limit,
      person.id + " legacy limits and Plus grants",
    );
  f.env.ARC_BILLING_ENABLED = "1";
  delete f.env.MONTHLY_TOOL_CALL_LIMIT;
  delete f.env.FREE_MONTHLY_TOOL_CALL_LIMIT;
  assert.equal((await f.call(ADMIN + "/api/admin/followups?usage=exhausted")).status, 401);
  f.addUser("not-admin");
  const member = await f.sessionCookie("not-admin");
  assert.equal(
    (await f.call(ADMIN + "/api/admin/followups?usage=exhausted", { headers: { cookie: member } }))
      .status,
    403,
  );
  const invalid = await f.call(ADMIN + "/api/admin/followups?usage=not-a-filter", {
    headers: { cookie },
  });
  assert.equal(invalid.status, 400);
  for (let n = 0; n < 35; n++) {
    const id = "page-" + String(n).padStart(2, "0");
    f.addUser(id);
    f.sql
      .prepare(
        "INSERT INTO user_monthly_usage(user_id,month_key,tool_calls,updated_at) VALUES(?,?,?,?)",
      )
      .run(id, month, 10000, f.now);
  }
  const first = await list("exhausted", "", "page-");
  assert.equal(first.total, 35);
  assert.equal(first.items.length, 30);
  const selected = await list("exhausted", "/selection", "page-");
  assert.equal(selected.total, 35);
  assert.equal(selected.ids.length, 35);
  assert.equal(f.state.calls.length, 0);
  console.log(
    "PASS: monthly follow-up usage filters, counts, pagination and bulk selection share the same authoritative quota cohort",
  );
} finally {
  await Promise.all(f.pending);
  f.sql.close();
}
