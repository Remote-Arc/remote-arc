import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createRemoteLinkMcp } from "../src/mcp.js";
import { callDevice } from "../src/device-call.js";
import { seal } from "../src/app-oauth.js";
import { NO_BROWSER_AUTH } from "../src/browser-auth.js";

// Exercise the real MCP protocol, SQL ownership checks and encrypted App ledger.
// Only the external provider and device transport are simulated.
const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
for (const file of fs.readdirSync(new URL("../migrations/", import.meta.url)).filter(file => file.endsWith(".sql")).sort()) {
  sql.exec(fs.readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8"));
}
const db = {
  prepare(query: string) {
    const stmt = sql.prepare(query);
    const bound = (values: any[]) => ({
      async first() { return stmt.get(...values) ?? null; },
      async all() { return { results: stmt.all(...values) }; },
      async run() { return { success: true, meta: { changes: Number(stmt.run(...values).changes) } }; },
    });
    return { ...bound([]), bind(...values: any[]) { return bound(values); } };
  },
} as unknown as D1Database;
const stamp = new Date().toISOString();
for (const id of ["owner", "other"]) {
  sql.prepare("INSERT INTO users(id,google_sub,email,role,created_at) VALUES(?,?,?,'admin',?)")
    .run(id, id, id + "@example.test", stamp);
}
const dispatches: any[] = [];
const env = {
  DB: db, PUBLIC_ORIGIN: "https://mcp.remotearc.app", ENABLE_APPS: "1", ENABLE_BROWSER_RUNNER: "1",
  ENABLE_EXPERIMENTAL_AGENT_GOALS: "0", APP_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64"),
  REGISTRY: { getByName: () => ({ fetch: async (request: Request) => {
    const call = await request.json() as any;
    dispatches.push(call);
    if (call.arguments.ref === "e2" || call.arguments.fields?.some((field: any) => field.ref === "e2")) {
      // The native/extension field classifier supplies this denial when the
      // server-owned browserAuth policy disables one-time codes.
      return call.policy.browserAuth.otp
        ? Response.json({ result: { filled: true } })
        : Response.json({ error: "BROWSER_AUTH_REQUIRED: OTP needs approval" }, { status: 403 });
    }
    return Response.json({ result: { ok: true, snapshot_id: "snapshot-2", authentication: call.policy.browserAuth } });
  } }) },
} as any;
const ids = {
  github: "10000000-0000-4000-8000-000000000001",
  gmail: "10000000-0000-4000-8000-000000000002",
  other: "10000000-0000-4000-8000-000000000003",
  revoked: "10000000-0000-4000-8000-000000000004",
  readonly: "10000000-0000-4000-8000-000000000005",
};
for (const [key, provider, user, scopes, status] of [
  ["github", "github", "owner", ["repo", "read:user"], "active"],
  ["gmail", "gmail", "owner", ["https://www.googleapis.com/auth/gmail.modify"], "active"],
  ["other", "github", "other", ["repo"], "active"],
  ["revoked", "github", "owner", ["repo"], "disconnected"],
  ["readonly", "gmail", "owner", ["https://www.googleapis.com/auth/gmail.readonly"], "active"],
] as const) {
  const id = ids[key];
  const cipher = await seal(env, { accessToken: "test-provider-token", expiresAt: null, scopes }, `app-token:${user}:${provider}:${id}`);
  sql.prepare(`INSERT INTO app_connections(id,user_id,provider,account_id,account_label,status,permissions_json,scopes_json,token_ciphertext,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id, user, provider, id, "Test " + key, status, '["read","write"]', JSON.stringify(scopes), cipher, stamp, stamp);
}
const approved = { otp: true, captcha: true, origins: ["https://example.test"], mailbox: "owner@example.test" };
for (const [id, platform, tools] of [
  ["computer", "linux", ["browser_runner_snapshot", "browser_runner_act"]],
  ["extension", "browser", ["browser_read_page", "browser_fill", "browser_click"]],
] as const) {
  sql.prepare(`INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at,allowed_tools,browser_auth_permissions)
    VALUES(?,'owner',?,?,?, ?,?,?)`).run(id, id, platform, "fixture-" + id, stamp, JSON.stringify(tools), JSON.stringify(approved));
}
const identity = (scope = "apps:read apps:write browser:read browser:interact") => ({
  userId: "owner", clientId: "public-test", grantId: null, resource: env.PUBLIC_ORIGIN + "/mcp", scope,
});
async function rpc(method: string, params: unknown, scope?: string, options = env) {
  const response = await createRemoteLinkMcp(options, identity(scope)).fetch(new Request(env.PUBLIC_ORIGIN + "/mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }));
  const text = await response.text();
  assert(response.ok, text);
  return JSON.parse(text.trim().startsWith("{") ? text : text.split("\n").find(line => line.startsWith("data: "))!.slice(6));
}
const invoke = (name: string, args: unknown, scope?: string) => rpc("tools/call", { name, arguments: args }, scope);
const data = (response: any) => JSON.parse(response.result.content[0].text);
const rejected = (response: any) => Boolean(response.error || response.result?.isError);
const listed = (await rpc("tools/list", {})).result.tools as any[];
const appNames = listed.filter(tool => /^(github|gmail)_/.test(tool.name)).map(tool => tool.name).sort();
assert.deepEqual(appNames, ["github_repositories_list", "github_issues_list", "github_issues_get", "github_pulls_list", "github_comments_list", "github_issues_create", "github_comments_create", "gmail_messages_list", "gmail_messages_get", "gmail_drafts_create"].sort());
assert(!listed.some(tool => tool.name === "call_app"));
const disabled = (await rpc("tools/list", {}, undefined, { ...env, ENABLE_APPS: "0" })).result.tools;
assert(!disabled.some((tool: any) => tool.name === "list_apps" || /^(github|gmail)_/.test(tool.name)));
assert(rejected(await invoke("call_app", { connectionId: ids.github, operation: "issues.create", arguments: {}, requestId: "cached-old-call" })),
  "Cached generic names must not provide a hidden executor");
for (const name of appNames) {
  const schema = listed.find(tool => tool.name === name).inputSchema;
  assert.equal(schema.additionalProperties, false);
  assert(schema.properties.connectionId && schema.properties.requestId);
  assert(!schema.properties.operation && !schema.properties.arguments);
}
const accounts = data(await invoke("list_apps", { provider: "gmail", limit: 1 }));
assert.equal(accounts.connections.length, 1);
assert.equal(accounts.total, 2);
assert.equal(accounts.nextCursor, 1);
assert(accounts.connections.every((row: any) => row.provider === "gmail"));
assert(!JSON.stringify(accounts).includes("operations") && !JSON.stringify(accounts).includes("inputSchema"));
assert(!JSON.stringify(data(await invoke("list_apps", {}))).includes(ids.other));
assert.equal(listed.find(tool => tool.name === "gmail_drafts_create").annotations.destructiveHint, false);
assert.equal(listed.find(tool => tool.name === "github_issues_create").annotations.destructiveHint, true);
assert.equal(listed.find(tool => tool.name === "revoke_file_resource").annotations.destructiveHint, true);
assert.equal(listed.find(tool => tool.name === "undo_last_change").annotations.destructiveHint, true);
assert.equal(listed.find(tool => tool.name === "browser_runner_act").annotations.idempotentHint, false);

const providerRequests: string[] = [];
const additionalOperations = [
  ["github_repositories_list", ids.github, { limit: 2 }, "GET", "https://api.github.com/user/repos?per_page=2&sort=updated"],
  ["github_issues_list", ids.github, { repo: "test/project", limit: 2 }, "GET", "https://api.github.com/repos/test/project/issues?per_page=2"],
  ["github_pulls_list", ids.github, { repo: "test/project", limit: 2, state: "open" }, "GET", "https://api.github.com/repos/test/project/pulls?per_page=2&state=open"],
  ["github_comments_list", ids.github, { repo: "test/project", number: 17, limit: 2 }, "GET", "https://api.github.com/repos/test/project/issues/17/comments?per_page=2"],
  ["github_comments_create", ids.github, { repo: "test/project", number: 17, body: "Test comment" }, "POST", "https://api.github.com/repos/test/project/issues/17/comments"],
  ["gmail_messages_list", ids.gmail, { query: "in:inbox", limit: 2 }, "GET", "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in%3Ainbox&maxResults=2"],
] as const;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  providerRequests.push(href);
  if (href === "https://api.github.com/repos/test/project/issues" && init.method === "POST") return Response.json({ number: 17, title: "Review", body: "Body" });
  if (href === "https://api.github.com/repos/test/project/issues/17") return Response.json({ number: 17, title: "Review", body: "Body" });
  if (href.includes("/messages/message-1")) return Response.json({ id: "message-1", snippet: "Ordinary test email" });
  if (href.endsWith("/drafts") && init.method === "POST") return Response.json({ id: "draft-1" });
  const operation = additionalOperations.find(([, , , method, url]) => href === url && init.method === method);
  if (operation) return Response.json({ testedOperation: operation[0] });
  throw new Error("Unexpected provider URL in test: " + href);
};
try {
  const create = { connectionId: ids.github, requestId: "create-issue-1", repo: "test/project", title: "Review", body: "Body" };
  for (const connectionId of [ids.gmail, ids.other, ids.revoked]) {
    assert.equal(data(await invoke("github_issues_create", { ...create, connectionId })).error.code, "APP_CONNECTION_PROVIDER_MISMATCH");
  }
  assert.equal(providerRequests.length, 0, "Wrong provider, owner or revoked connections must not dispatch");
  assert(rejected(await invoke("github_issues_create", { ...create, operation: "messages.send" })));
  assert(rejected(await invoke("github_issues_create", { ...create, repo: "../escape" })));
  assert((await invoke("github_issues_create", create, "apps:read")).result._meta["mcp/www_authenticate"]);
  assert((await invoke("github_issues_create", create, "apps:write")).result._meta["mcp/www_authenticate"]);
  assert.equal(providerRequests.length, 0, "Invalid inputs and missing MCP scopes must not dispatch");
  const result = data(await invoke("github_issues_create", create));
  assert.equal(result.result.number, 17);
  assert.equal(data(await invoke("github_issues_create", create)).replayed, true);
  assert.equal(providerRequests.length, 1, "The real ledger reuses an acknowledged write");
  assert.equal(data(await invoke("github_issues_create", { ...create, title: "Changed" })).error.code, "app_request_id_conflict");
  const readBack = data(await invoke("github_issues_get", { connectionId: ids.github, requestId: "read-issue-1", repo: "test/project", number: 17 }));
  assert.deepEqual(readBack.result, result.result, "Read the independently selected issue back through a separate tool");
  assert.equal(data(await invoke("gmail_messages_get", { connectionId: ids.gmail, requestId: "read-mail-1", id: "message-1" })).result.id, "message-1");
  const draft = { connectionId: ids.gmail, requestId: "create-draft-1", to: ["test@example.test"], subject: "Subject", body: "Body" };
  assert.equal(data(await invoke("gmail_drafts_create", { ...draft, connectionId: ids.readonly })).error.code, "app_scope_required");
  assert.equal(data(await invoke("gmail_drafts_create", draft)).result.id, "draft-1");
  assert(!providerRequests.some(url => url.endsWith("/send")), "Draft creation must not send mail");
  assert(!JSON.stringify(result).includes("test-provider-token"));
  for (const [name, connectionId, fields] of additionalOperations) {
    const reply = data(await invoke(name, { connectionId, requestId: "public-" + name, ...fields }));
    assert.equal(reply.result.testedOperation, name, "Every advertised App tool must reach only its fixed operation");
  }
} finally { globalThis.fetch = originalFetch; }

for (const [name, args] of [
  ["browser_runner_act", { device_id: "computer", session_id: "task", action: "fill", snapshot_id: "s1", ref: "e2", value: "123456" }],
  ["browser_runner_act", { device_id: "computer", session_id: "task", action: "fill_form", snapshot_id: "s1", fields: [{ ref: "e2", action: "fill", value: "123456" }] }],
  ["shared_tab_fill", { device_id: "extension", snapshot_id: "s1", ref: "e2", value: "123456" }],
  ["shared_tab_act", { device_id: "extension", snapshot_id: "s1", action: "fill", ref: "e2", value: "123456" }],
  ["browser_fill", { device_id: "extension", snapshot_id: "s1", ref: "e2", value: "123456" }],
] as const) {
  const result = data(await invoke(name, args));
  assert.equal(result.error.code, "BROWSER_AUTH_REQUIRED");
  assert.match(result.error.message, /resume the same task/);
  assert.deepEqual(dispatches.at(-1).policy.browserAuth, NO_BROWSER_AUTH, name + " cannot inherit Dashboard OTP approval");
}
const ordinary = await invoke("shared_tab_fill", { device_id: "extension", snapshot_id: "s1", ref: "e1", value: "Normal text" });
assert.equal(data(ordinary).ok, true, "Ordinary fields still work");
await invoke("browser_runner_snapshot", { device_id: "computer", session_id: "task", include_captcha_images: true });
assert(!("include_captcha_images" in dispatches.at(-1).arguments));
assert.deepEqual(dispatches.at(-1).policy.browserAuth, NO_BROWSER_AUTH);
await callDevice(env, { ...identity(), clientId: "dashboard" }, "computer", "browser_runner_snapshot", { session_id: "task" });
assert.deepEqual(dispatches.at(-1).policy.browserAuth, approved, "The internal Dashboard policy remains separate");
sql.close();
console.log("PASS: public MCP tool schemas, owner/provider/scope checks, real App ledger replay/read-back, and public browser policy across current and cached aliases");
