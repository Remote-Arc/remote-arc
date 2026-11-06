import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { activationOptions, listAdminUsers } from "../src/admin/admin-user-activation.js";

const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
for (const name of fs
  .readdirSync(new URL("../migrations/", import.meta.url))
  .filter((name) => name.endsWith(".sql"))
  .sort())
  sql.exec(fs.readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8"));
let queries = 0;
const db = {
  prepare(query: string) {
    queries++;
    const statement = sql.prepare(query);
    return {
      bind(...args: any[]) {
        return {
          async all() {
            return { results: statement.all(...args) };
          },
        };
      },
    };
  },
} as unknown as D1Database;
const now = "2026-10-30T12:00:00.000Z";
sql
  .prepare(
    "UPDATE business_metrics_state SET value='2026-10-01T00:00:00.000Z' WHERE key='flow_since'",
  )
  .run();
const options = {
  ...activationOptions(new URL("https://admin.remotearc.app/api/admin/operations")),
  now,
  month: "2026-10",
  page: 0,
  pageSize: 30,
  freeLimit: 10000,
  plusLimit: 20000,
  resource: "https://mcp.remotearc.app/mcp",
  pluginOAuthClientIds: '["verified-plugin-client"]',
};
function user(id: string, created = "2026-10-10T00:00:00.000Z") {
  sql
    .prepare("INSERT INTO users(id,google_sub,email,name,created_at) VALUES(?,?,?,?,?)")
    .run(id, "email:" + id, id + "@example.invalid", id, created);
}
function client(id: string, name: string) {
  sql
    .prepare(
      "INSERT INTO oauth_clients(client_id,client_name,redirect_uris,created_at) VALUES(?,?,?,?)",
    )
    .run(id, name, '["https://chatgpt.com/connector/oauth/callback"]', now);
}
function token(
  id: string,
  clientId: string,
  revoked: boolean = false,
  resource = options.resource,
) {
  sql
    .prepare(
      "INSERT INTO oauth_tokens(access_token_hash,client_id,user_id,resource,scope,created_at,expires_at,refresh_expires_at,revoked_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .run(
      "secret:" + id,
      clientId,
      id,
      resource,
      "devices:read",
      now,
      "2026-10-30T13:00:00.000Z",
      "2026-11-01T00:00:00.000Z",
      revoked ? now : null,
    );
}
function device(
  id: string,
  platform = "darwin",
  created = "2026-10-10T00:00:00.000Z",
  observed = true,
) {
  sql
    .prepare(
      "INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at,last_seen) VALUES(?,?,?,?,?,?,?)",
    )
    .run("device:" + id, id, id, platform, "credential:" + id, created, now);
  if (observed)
    sql
      .prepare(
        "INSERT INTO business_flow_attempts(id,scene,user_id,device_id,started_at,expires_at,evidence) VALUES(?,'device_pairing',?,?,?,?, 'observed')",
      )
      .run("pair:" + id, id, "device:" + id, created, now);
}
function event(
  id: string,
  at: string,
  name = "device.tool.completed",
  source = "server",
  outcome = "succeeded",
) {
  sql
    .prepare(
      "INSERT INTO product_events(id,occurred_at,domain,name,source,outcome,user_id,trace_id) VALUES(?,?,'devices',?,?,?,?,?)",
    )
    .run(crypto.randomUUID(), at, name, source, outcome, id, crypto.randomUUID());
}
for (const id of [
  "registered",
  "plugin",
  "custom",
  "named-plugin",
  "browser",
  "paired",
  "online",
  "activated",
  "returning",
  "same-day",
  "old-active",
  "unknown",
  "revoke",
  "wrong-resource",
  "discovery",
  "failed",
  "login-only",
  "literal_%",
  "apps-only",
])
  user(id);
client("verified-plugin-client", "Unhelpful name");
client("custom-client", "Claude");
client("spoof", "ChatGPT Remote Arc Official Plugin");
token("plugin", "verified-plugin-client");
token("custom", "custom-client");
token("named-plugin", "spoof");
token("revoke", "verified-plugin-client", true);
token("wrong-resource", "verified-plugin-client", false, "https://other.invalid/mcp");
device("browser", "browser");
device("paired");
device("online");
device("unknown", "darwin", "2026-09-01T00:00:00.000Z", false);
sql
  .prepare(
    "INSERT INTO business_flow_steps(flow_id,step,occurred_at) VALUES('pair:online','online','2026-10-10T00:02:00.000Z')",
  )
  .run();
event("activated", "2026-10-29T12:00:00.000Z");
for (const at of ["2026-10-28T12:00:00.000Z", "2026-10-29T12:00:00.000Z"]) event("returning", at);
for (const at of ["2026-10-29T12:00:00.000Z", "2026-10-29T14:00:00.000Z"]) event("same-day", at);
for (const at of ["2026-10-10T12:00:00.000Z", "2026-10-11T12:00:00.000Z"]) event("old-active", at);
event("failed", now, "device.tool.completed", "server", "failed");
event("failed", now, "device.tool.completed", "browser");
event("login-only", now, "auth.session.created");
event("login-only", now, "page.viewed", "browser");
sql
  .prepare(
    "INSERT INTO audit_events(id,user_id,event_type,tool_name,success,created_at) VALUES('discover','discovery','mcp.tool_call','list_devices',1,?)",
  )
  .run(now);
sql
  .prepare(
    "INSERT INTO user_monthly_usage(user_id,month_key,tool_calls,updated_at) VALUES('discovery','2026-10',99,?)",
  )
  .run(now);
sql
  .prepare(
    "INSERT INTO app_connections(id,user_id,provider,account_id,account_label,status,permissions_json,scopes_json,created_at,updated_at) VALUES('app','apps-only','github','account','GitHub','active','[]','[]',?,?)",
  )
  .run(now, now);
sql
  .prepare(
    "INSERT INTO app_calls(id,user_id,connection_id,connection_generation,operation,permission,request_id,input_hash,arguments_ciphertext,status,expires_at,created_at,updated_at) VALUES('call','apps-only','app',1,'repos.list','read','request','hash','private','succeeded',?,?,?)",
  )
  .run(now, now, now);
let data = await listAdminUsers(db, options);
assert.equal(
  queries,
  1,
  "A nonempty user page and its global activation facets must share one history aggregation",
);
assert(
  !JSON.stringify(data.users).includes("__activation_"),
  "Internal query counters must not leak into user records",
);
const byId = new Map(data.users.map((user) => [user.id, user]));
assert.equal(byId.get("registered")?.activation_stage, "registered_only");
assert.equal(byId.get("plugin")?.activation_stage, "plugin_connected_no_device");
assert.equal(byId.get("custom")?.activation_stage, "mcp_connected_no_device");
assert.equal(
  byId.get("named-plugin")?.activation_stage,
  "mcp_connected_no_device",
  "A name and registered ChatGPT callback do not prove official plugin provenance",
);
assert.equal(
  byId.get("browser")?.activation_stage,
  "registered_only",
  "A browser companion is not a computer",
);
assert.equal(
  byId.get("paired")?.activation_stage,
  "paired_never_online",
  "last_seen cannot prove online",
);
assert.equal(byId.get("online")?.activation_stage, "online_no_success");
assert.equal(byId.get("activated")?.activation_stage, "activated");
assert.equal(byId.get("returning")?.activation_stage, "returning_active");
assert.equal(byId.get("same-day")?.activation_stage, "activated");
assert.equal(
  byId.get("old-active")?.activation_stage,
  "activated",
  "Returning users must also have successful use in the past 7 days",
);
assert.equal(byId.get("unknown")?.activation_stage, "history_unknown");
assert.equal(byId.get("revoke")?.active_mcp_connections, 0);
assert.equal(byId.get("wrong-resource")?.mcp_connections, 0);
assert.equal(
  byId.get("discovery")?.first_success_at,
  null,
  "Charged/discovery counts do not prove task success",
);
assert.equal(
  byId.get("failed")?.first_success_at,
  null,
  "Failure and browser-reported success do not prove success",
);
assert.equal(byId.get("login-only")?.first_success_at, null);
assert.equal(
  byId.get("apps-only")?.activation_stage,
  "activated",
  "Successful App users can activate without a computer",
);
assert(!JSON.stringify(data).includes("secret:"));
assert(!JSON.stringify(data).includes("credential:"));
assert.equal(
  (await listAdminUsers(db, { ...options, pluginOAuthClientIds: undefined })).users.find(
    (user) => user.id === "plugin",
  )?.activation_stage,
  "mcp_connected_no_device",
  "Without verified client IDs provenance is unknown",
);
// Filtering/search/sort happen in SQLite before LIMIT and OFFSET, across all accounts.
for (let i = 0; i < 38; i++) user("late-" + String(i).padStart(2, "0"), "2026-10-29T00:00:00.000Z");
data = await listAdminUsers(db, {
  ...options,
  stage: "activated",
  pageSize: 2,
  sort: "activation_asc",
});
assert.equal(data.filteredTotal, 4);
assert.equal(data.users.length, 2);
assert(data.users.every((user) => user.activation_stage === "activated"));
assert.equal(
  (await listAdminUsers(db, { ...options, stage: "activated", pageSize: 2, page: 1 })).users.length,
  2,
);
assert.equal((await listAdminUsers(db, { ...options, query: "returning" })).filteredTotal, 1);
const beyond = await listAdminUsers(db, { ...options, stage: "activated", page: 999 });
assert.deepEqual(beyond.users, []);
assert.equal(beyond.filteredTotal, 4, "An empty page retains the global selected-stage count");
assert.equal(beyond.activationCounts.activated, 4);
const missing = await listAdminUsers(db, { ...options, query: "no-such-user" });
assert.deepEqual(missing.users, []);
assert.equal(missing.filteredTotal, 0);
assert.equal(
  (await listAdminUsers(db, { ...options, query: "literal_%" })).filteredTotal,
  1,
  "LIKE wildcards in search are literal",
);
assert.equal(
  (await listAdminUsers(db, { ...options, sort: "activation_desc" })).users[0]?.activation_stage,
  "returning_active",
);
assert.equal(
  (await listAdminUsers(db, { ...options, sort: "activation_asc" })).users[0]?.activation_stage,
  "registered_only",
);
assert.throws(
  () => activationOptions(new URL("https://admin.invalid/?activation=not-a-stage")),
  /invalid_activation/,
);
assert.throws(() => activationOptions(new URL("https://admin.invalid/?sort=DROP")), /invalid_sort/);
await assert.rejects(
  () => listAdminUsers(db, { ...options, pluginOAuthClientIds: '["malformed id"]' }),
  /invalid_public_plugin_client_ids/,
);

// Successful days are counted exactly across every ledger, for the users on the page.
user("multi");
const audit = (id: string, at: string, success = 1) =>
  sql
    .prepare(
      "INSERT INTO audit_events(id,user_id,device_id,event_type,tool_name,success,created_at) VALUES(?,'multi','device:multi','mcp.tool_call','run',?,?)",
    )
    .run(id, success, at);
audit("multi-1", "2026-10-20T08:00:00.000Z");
audit("multi-2", "2026-10-20T23:59:59.000Z");
audit("multi-failed", "2026-10-21T10:00:00.000Z", 0);
audit("multi-future", "2026-10-31T09:00:00.000Z");
event("multi", "2026-10-25T00:00:00.000Z");
event("multi", "2026-10-25T18:00:00.000Z");
sql
  .prepare(
    "INSERT INTO app_calls(id,user_id,connection_id,connection_generation,operation,permission,request_id,input_hash,arguments_ciphertext,status,expires_at,created_at,updated_at) VALUES('multi-call','multi','app',1,'repos.list','read','multi-request','hash','private','succeeded',?,?,?)",
  )
  .run(now, now, now);
const multi = (await listAdminUsers(db, { ...options, query: "multi" })).users[0];
assert.equal(multi?.first_success_at, "2026-10-20T08:00:00.000Z");
assert.equal(multi?.last_success_at, now, "A success after the read time is not counted");
assert.equal(
  multi?.successful_days,
  3,
  "Days 20, 25 and 30 count once each; a failed call and a future call count none",
);
assert.equal(multi?.activation_stage, "returning_active");
const shown = new Map(
  (await listAdminUsers(db, { ...options, pageSize: 100 })).users.map((row) => [row.id, row]),
);
assert.equal(shown.get("returning")?.successful_days, 2);
assert.equal(shown.get("same-day")?.successful_days, 1);
assert.equal(shown.get("registered")?.successful_days, 0);
assert(
  !Object.keys(shown.get("multi") || {}).some((key) => key.startsWith("__")),
  "Internal query columns never reach the response",
);

// Success history is read by index seeks per user, never by scanning a ledger.
let statement = "";
let bound: unknown[] = [];
await listAdminUsers(
  {
    prepare(query: string) {
      statement = query;
      return {
        bind(...args: unknown[]) {
          bound = args;
          return { all: async () => ({ results: [] }) };
        },
      };
    },
  } as unknown as D1Database,
  options,
);
const plan = (
  sql.prepare("EXPLAIN QUERY PLAN " + statement).all(...(bound as never[])) as Array<{
    detail: string;
  }>
).map((row) => row.detail);
for (const table of ["audit_events", "app_calls", "arc_chat_runs", "product_events"]) {
  const reads = plan.filter((detail) => detail.includes(" " + table + " "));
  assert(reads.length > 0, table + " is read");
  assert(
    reads.every(
      (detail) =>
        detail.startsWith("SEARCH") && /_success_user_time|success_user_time/.test(detail),
    ),
    table + " is read only through its success index: " + reads.join(" | "),
  );
}
sql.close();
console.log(
  "PASS: real SQLite activation evidence, provenance, historical unknowns, success/return windows, exact successful days across ledgers, index-only success reads, global filtering/sort/pagination and no token disclosure",
);
