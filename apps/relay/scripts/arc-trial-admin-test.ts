import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { ARC_CREDIT_RATE } from "@remotearc/protocol";
import { sha256Hex } from "../src/auth/auth.js";
import { handleAdminServiceRequest } from "../src/admin/admin-service.js";
import { listAdminTrials } from "../src/arc/arc-trial-admin.js";
const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
for (const name of fs
  .readdirSync(new URL("../migrations/", import.meta.url))
  .filter((n) => n.endsWith(".sql"))
  .sort())
  sql.exec(fs.readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8"));
const db = {
  prepare(query: string) {
    const statement = sql.prepare(query),
      bound = (args: any[]) => ({
        async first() {
          return statement.get(...args) || null;
        },
        async all() {
          return { results: statement.all(...args) };
        },
        async run() {
          return { success: true, meta: { changes: Number(statement.run(...args).changes) } };
        },
      });
    return {
      ...bound([]),
      bind(...args: any[]) {
        return bound(args);
      },
    };
  },
} as unknown as D1Database;
const now = new Date().toISOString(),
  future = new Date(Date.now() + 14 * 86400000).toISOString(),
  units = ARC_CREDIT_RATE.unitsPerCredit;
for (const user of [
  "operator",
  "active",
  "expired",
  "exhausted",
  "paid",
  "eligible",
  ...Array.from({ length: 31 }, (_, i) => "page-" + i),
]) {
  sql
    .prepare("INSERT INTO users(id,google_sub,email,name,role,created_at) VALUES(?,?,?,?,?,?)")
    .run(user, user, user + "@example.invalid", user, user === "operator" ? "admin" : "user", now);
  sql
    .prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)")
    .run(await sha256Hex(user + "-session"), user, future, now);
  if (["operator", "eligible"].includes(user)) continue;
  const expired = user === "expired",
    start = expired ? "2000-01-01T00:00:00.000Z" : now,
    end = expired ? "2000-01-15T00:00:00.000Z" : future;
  sql
    .prepare(
      "INSERT INTO arc_trials(user_id,started_at,expires_at,premium_allowance_micros,daily_allowance_micros,commercial_version_id) VALUES(?,?,?,50000,50000,?)",
    )
    .run(user, start, end, "seed:live:arc-trial-v1");
  sql
    .prepare(
      "INSERT INTO arc_credit_lots(id,user_id,source,source_ref,granted_units,spent_units,reserved_units,starts_at,expires_at,reason,created_at) VALUES(?,?,'trial',?,?,?,?,?,?,?,?)",
    )
    .run(
      "lot:" + user,
      user,
      "trial:" + user,
      50 * units,
      (user === "exhausted" ? 50 : 3) * units,
      user === "exhausted" ? 0 : 2 * units,
      start,
      end,
      "test",
      now,
    );
}
sql
  .prepare(
    "INSERT INTO billing_plan_assignments(id,plan_id,subject_type,subject_id,expires_at,created_at) VALUES('paid-assignment','arc-plus-v1','user','paid',?,?)",
  )
  .run(future, now);
// Funnel fixture: who opened Arc, ran work, came back on another day and
// ran a routine. Administrators and work older than 30 days are left out.
const day = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString();
for (const user of ["active", "exhausted", "operator"])
  sql
    .prepare(
      "INSERT INTO product_events(id,occurred_at,domain,name,source,outcome,user_id,trace_id) VALUES(?,?,'arc','arc.workspace.opened','server','accepted',?,?)",
    )
    .run(crypto.randomUUID(), now, user, crypto.randomUUID());
for (const user of ["active", "expired"]) {
  sql
    .prepare(
      "INSERT OR IGNORE INTO organizations(id,name,kind,personal_owner_user_id,created_at) VALUES(?,?,'personal',?,?)",
    )
    .run("personal:" + user, user, user, now);
  sql
    .prepare(
      "INSERT INTO arc_chat_sessions(id,user_id,organization_id,title_ciphertext,created_at,updated_at) VALUES(?,?,?,'x',?,?)",
    )
    .run("session:" + user, user, "personal:" + user, now, now);
}
sql
  .prepare(
    "INSERT INTO automations(id,user_id,name,kind,action_json,created_at,updated_at) VALUES('routine:active','active','Daily','goal_loop','{}',?,?)",
  )
  .run(now, now);
for (const [id, user, status, at, automation] of [
  ["run-1", "active", "succeeded", day(2), null],
  ["run-2", "active", "failed", day(0), "routine:active"],
  ["run-old", "expired", "succeeded", day(40), null],
] as const)
  sql
    .prepare(
      "INSERT INTO arc_chat_runs(id,session_id,user_id,request_id,input_hash,model_id,automation_id,status,max_tokens,max_steps,deadline,created_at,updated_at) VALUES(?,?,?,?,'h','auto',?,?,1000,8,?,?,?)",
    )
    .run(id, "session:" + user, user, id, automation, status, at, at, at);
const env = {
  DB: db,
  PUBLIC_ORIGIN: "https://mcp.remotearc.app",
  ADMIN_ORIGIN: "https://admin.remotearc.app",
} as any;
const request = (user: string, path = "/api/admin/payments/trials", method = "GET") =>
  new Request("https://admin.remotearc.app" + path, {
    method,
    headers: {
      cookie: user ? "rl_session=" + user + "-session" : "",
      origin: "https://admin.remotearc.app",
      "content-type": "application/json",
    },
  });
assert.equal((await handleAdminServiceRequest(request(""), env)).status, 401);
assert.equal((await handleAdminServiceRequest(request("active"), env)).status, 403);
assert.equal(
  (await handleAdminServiceRequest(request("operator", undefined, "POST"), env)).status,
  405,
);
const response = await handleAdminServiceRequest(request("operator"), env);
assert.equal(response.status, 200);
assert.equal(response.headers.get("cache-control"), "private, no-store");
const data = (await response.json()) as any;
assert.equal(data.total, 35);
assert.deepEqual(
  { ...data.funnel, since: undefined },
  {
    since: undefined,
    opened: 2,
    trials: 34,
    ran: 1,
    succeeded: 1,
    returned: 1,
    routines: 1,
  },
  "The funnel counts people per step over 30 days, without administrators or older work",
);
assert.equal(data.items.length, 30);
assert(!data.items.some((item: any) => item.user_id === "eligible"));
const second = await listAdminTrials(db, new URL("https://admin.remotearc.app/?page=1"));
assert.equal(second.items.length, 5);
for (const status of ["active", "expired", "exhausted", "paid"]) {
  const result = await listAdminTrials(
    db,
    new URL("https://admin.remotearc.app/?q=" + status + "&status=" + status),
  );
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]!.status, status);
  assert.equal(result.items[0]!.grantedCredits, 50);
  assert.equal(result.items[0]!.spentCredits, status === "exhausted" ? 50 : 3);
}
assert.equal(
  (await listAdminTrials(db, new URL("https://admin.remotearc.app/?q=%25"))).total,
  0,
  "Wildcard search is literal",
);
assert.equal(
  (await handleAdminServiceRequest(request("operator", "/api/admin/payments/trials?page=-1"), env))
    .status,
  400,
);
sql.prepare("UPDATE users SET role='user' WHERE id='operator'").run();
assert.equal(
  (await handleAdminServiceRequest(request("operator"), env)).status,
  403,
  "Role revocation applies immediately",
);
sql.close();
console.log(
  "PASS: trial user metadata, paid/active/expired/exhausted state, saved allowance, pagination, literal search, the 30-day Arc funnel, private responses and current administrator authorization.",
);
