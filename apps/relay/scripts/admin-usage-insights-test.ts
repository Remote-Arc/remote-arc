import assert from "node:assert/strict";
import { handleAdminUsageInsights } from "../src/admin/admin-usage-insights.js";
import { adminApiMethods } from "../src/admin/admin-service.js";

const origin = "https://admin.remotearc.app";
function fakeEnv(role: "admin" | "user" = "admin") {
  const sqls: string[] = [];
  const values: unknown[][] = [];
  const db = {
    prepare(sql: string) {
      sqls.push(sql);
      let args: unknown[] = [];
      const s = {
        bind(...p: unknown[]) {
          args = p;
          values.push(p);
          return s;
        },
        async first() {
          if (sql.includes("FROM sessions s"))
            return { id: "admin", email: "admin@example.test", role, plan: "plus", name: "Admin" };
          if (sql === "SELECT id FROM users WHERE id=?1 LIMIT 1")
            return args[0] === "existing" ? { id: "existing" } : null;
          if (sql.includes("FROM user_monthly_usage")) return { total: 20000 };
          if (sql.includes("COUNT(*) AS total"))
            return { total: 1350, succeeded: 1250, failed: 100 };
          return null;
        },
        async all() {
          if (sql.includes("GROUP BY substr"))
            return { results: [{ day: "2026-10-24", calls: 400, failures: 12 }] };
          if (sql.includes("GROUP BY tool_name"))
            return { results: [{ tool: "read_file", calls: 900, failures: 10 }] };
          if (sql.includes("GROUP BY outcome"))
            return { results: [{ outcome: "allowed", calls: 1250 }] };
          return { results: [] };
        },
        async run() {
          throw Error("Read-only diagnostics must never write D1");
        },
      };
      return s;
    },
  } as unknown as D1Database;
  return { env: { DB: db, PUBLIC_ORIGIN: origin }, sqls, values };
}
function req(query: string, auth = true, method = "GET") {
  return new Request(origin + "/api/admin/usage-insights" + query, {
    method,
    headers: auth ? { cookie: "rl_session=unit-session" } : {},
  });
}
assert.deepEqual(adminApiMethods("/api/admin/usage-insights"), ["GET"]);
const { env, sqls, values } = fakeEnv();
assert.equal((await handleAdminUsageInsights(req("?userId=existing", false), env)).status, 401);
assert.equal((await handleAdminUsageInsights(req("?userId=../other"), env)).status, 400);
assert.equal((await handleAdminUsageInsights(req("?userId=unknown"), env)).status, 404);
assert.equal(
  (await handleAdminUsageInsights(req("?userId=existing", true, "POST"), env)).status,
  405,
);
const denied = fakeEnv("user");
assert.equal((await handleAdminUsageInsights(req("?userId=existing"), denied.env)).status, 403);
const result = await handleAdminUsageInsights(req("?userId=existing"), env);
assert.equal(result.status, 200);
assert.equal(result.headers.get("cache-control"), "private, no-store");
const data = (await result.json()) as any;
assert.equal(data.chargedCalls, 20000);
assert.deepEqual(data.audited, { total: 1350, succeeded: 1250, failed: 100 });
assert.equal(data.taskSuccessAvailable, false);
assert.equal(data.retriesAvailable, false);
assert.ok(sqls.filter((s) => s.includes("FROM audit_events")).length === 5);
assert.ok(values.some((v) => v[0] === "existing" && String(v[1]).includes("T00:00:00")));
assert.ok(!JSON.stringify(data).includes("admin@example.test"));
console.log("PASS: admin usage insights owner guard, bounded month aggregates, counts and privacy");

// Actual Worker/Admin host and SQLite queries, including legacy empty/malformed
// settlements. These fixtures are private canaries, never real customer data.
const { createWorkerFixture, ADMIN, AGENT } = await import("./worker-fixture.js");
const f = createWorkerFixture();
try {
  for (const [id, role] of [
    ["quality-admin", "admin"],
    ["quality-owner", "user"],
    ["quality-other", "user"],
    ["quality-empty", "user"],
  ])
    f.addUser(id, role);
  const cookie = await f.sessionCookie("quality-admin"),
    userCookie = await f.sessionCookie("quality-owner");
  const from = new Date().toISOString().slice(0, 7) + "-01T00:00:00.000Z";
  const next = new Date(
    Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 1),
  ).toISOString();
  const previous = new Date(Date.parse(from) - 1).toISOString();
  const audit = (
    tool: string | null,
    success: number,
    user = "quality-owner",
    at = from,
    event = "mcp.tool_call",
  ) =>
    f.sql
      .prepare(
        "INSERT INTO audit_events(id,user_id,event_type,tool_name,success,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(crypto.randomUUID(), user, event, tool, success, at);
  audit("read_file", 1);
  audit("edit_block", 1);
  audit("process_status", 1);
  audit("process_status", 0);
  audit("browser_runner_wait", 1);
  audit("start_process", 0);
  audit(null, 1);
  audit("read_file", 1, "quality-other");
  audit("read_file", 1, "quality-owner", previous);
  audit("read_file", 1, "quality-owner", next);
  audit("read_file", 1, "quality-owner", from, "other-event");
  for (const user of ["quality-owner", "quality-other"])
    f.sql
      .prepare(
        "INSERT INTO app_connections(id,user_id,provider,account_id,account_label,status,permissions_json,scopes_json,created_at,updated_at) VALUES(?,?,'gmail',?,?,'active','[]','[]',?,?)",
      )
      .run(user + "-conn", user, user, "private-account-label-canary", from, from);
  const app = (status: string, user = "quality-owner", at = from) => {
    const id = crypto.randomUUID();
    f.sql
      .prepare(
        "INSERT INTO app_calls(id,user_id,connection_id,connection_generation,operation,permission,request_id,input_hash,arguments_ciphertext,result_ciphertext,status,expires_at,created_at,updated_at) VALUES(?,?,?,1,'messages.get','read',?,'hash','private-arguments-canary','private-result-canary',?,?,?,?)",
      )
      .run(id, user, user + "-conn", id, status, next, at, at);
  };
  app("succeeded");
  app("succeeded");
  app("failed");
  app("unknown");
  app("running");
  app("succeeded", "quality-other");
  app("succeeded", "quality-owner", previous);
  app("succeeded", "quality-owner", next);
  f.sql
    .prepare(
      "INSERT INTO organizations(id,name,kind,created_at) VALUES('quality-org','Private organization canary','team',?)",
    )
    .run(from);
  const arc = (status: string, user = "quality-owner", at = from) => {
    const id = crypto.randomUUID();
    f.sql
      .prepare(
        "INSERT INTO arc_chat_sessions(id,user_id,organization_id,title_ciphertext,created_at,updated_at) VALUES(?,?,'quality-org','private-title-canary',?,?)",
      )
      .run(id, user, at, at);
    f.sql
      .prepare(
        "INSERT INTO arc_chat_runs(id,session_id,user_id,request_id,input_hash,model_id,status,max_tokens,max_steps,deadline,created_at,updated_at) VALUES(?,?,?,?,?,'auto',?,1000,10,?,?,?)",
      )
      .run(id, id, user, id, "private-hash", status, next, at, at);
  };
  arc("succeeded");
  arc("failed");
  arc("unknown");
  arc("thinking");
  arc("succeeded", "quality-other");
  arc("succeeded", "quality-owner", previous);
  arc("succeeded", "quality-owner", next);
  const bill = (
    status: string,
    settlement: string | null,
    accounted: number,
    user = "quality-owner",
    at = from,
    lane = "arc_hosted",
  ) => {
    const id = crypto.randomUUID();
    f.sql
      .prepare(
        "INSERT INTO billing_reservations(id,operation_key,user_id,organization_id,task_id,run_id,lane,provider,model_id,authorization_id,request_json,entries_json,status,accounted,settlement_json,created_at) VALUES(?,?,?,'quality-org','opaque-task','opaque-run',?,'openai','arc-auto','opaque-auth','{}','[]',?,?,?,?)",
      )
      .run(id, id, user, lane, status, accounted, settlement, at);
  };
  bill(
    "completed",
    JSON.stringify({ actual: { costMicros: 12345 }, private: "private-cost-canary" }),
    1,
  );
  bill("failed", JSON.stringify({ actual: { costMicros: 0 } }), 1);
  bill("unknown", JSON.stringify({ actual: { costMicros: 999999 } }), 0);
  bill("completed", "malformed-private-canary", 1);
  bill("completed", '{"actual":{}}', 1);
  bill("completed", '{"actual":{"costMicros":"9999"}}', 1);
  bill("completed", '{"actual":{"costMicros":-3}}', 1);
  bill("completed", '{"actual":{"costMicros":888888}}', 1, "quality-other");
  bill("completed", '{"actual":{"costMicros":888888}}', 1, "quality-owner", previous);
  bill("completed", '{"actual":{"costMicros":888888}}', 1, "quality-owner", next);
  bill("completed", '{"actual":{"costMicros":888888}}', 1, "quality-owner", from, "connect");
  bill("completed", '{"actual":{"costMicros":0}}', 1, "quality-other");
  const api = (id: string, auth = cookie) =>
    f.call(ADMIN + "/api/admin/usage-insights?userId=" + encodeURIComponent(id), {
      headers: auth ? { cookie: auth } : {},
    });
  assert.equal((await api("quality-owner", "")).status, 401);
  assert.equal((await api("quality-owner", userCookie)).status, 403);
  assert.equal((await api("missing")).status, 404);
  assert.equal(
    (
      await f.call(AGENT + "/api/admin/usage-insights?userId=quality-owner", {
        headers: { cookie },
      })
    ).status,
    404,
    "Consumer hosts cannot expose Admin cost metadata",
  );
  const snapshots = () =>
    ["app_calls", "arc_chat_runs", "billing_reservations", "audit_events"].map(
      (table) => f.sql.prepare("SELECT COUNT(*) n FROM " + table).get()?.n,
    );
  const before = snapshots(),
    response = await api("quality-owner");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const value = (await response.json()) as any;
  assert.deepEqual(value.audited, { total: 7, succeeded: 5, failed: 2 });
  assert.deepEqual(value.work, {
    deviceOperations: 2,
    stateChecks: 3,
    apps: { total: 5, succeeded: 2, failed: 1, unknown: 1 },
    arc: { total: 4, succeeded: 1, failed: 1, unknown: 1 },
    completedGoals: null,
    retries: null,
  });
  assert.deepEqual(value.cost, {
    currency: "USD",
    modelCostMicros: 12345,
    settledRequests: 2,
    unresolvedRequests: 5,
    cloudCostMicros: null,
    totalCostMicros: null,
    basis: "recorded_usage_and_model_prices",
  });
  assert.deepEqual(snapshots(), before, "Diagnostics never change quota, work or billing records");
  assert(
    !JSON.stringify(value).includes("private-"),
    "No arguments, account labels, titles, settlement details or other private canaries returned",
  );
  const empty = (await (await api("quality-empty")).json()) as any;
  assert.equal(empty.cost.modelCostMicros, null, "Missing cost is unknown, not zero");
  assert.equal(empty.work.deviceOperations, 0);
  assert.equal(empty.cost.totalCostMicros, null);
  bill("failed", '{"actual":{"costMicros":0}}', 1, "quality-empty");
  const zero = (await (await api("quality-empty")).json()) as any;
  assert.equal(
    zero.cost.modelCostMicros,
    0,
    "An explicitly settled zero is distinct from missing cost",
  );
  assert.equal(zero.cost.settledRequests, 1);
  console.log(
    "PASS: real Worker/SQLite effectiveness and partial cost aggregates, Admin/host isolation, month boundaries, status-tool classification, unknown vs zero, malformed settlements and metadata-only responses.",
  );
} finally {
  f.sql.close();
}
