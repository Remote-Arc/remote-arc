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
for (const id of ["owner", "other", "newcomer"]) {
  sql.prepare("INSERT INTO users(id,google_sub,email,role,created_at) VALUES(?,?,?,'admin',?)")
    .run(id, id, id + "@example.test", stamp);
}
const dispatches: any[] = [];
const env = {
  DB: db, PUBLIC_ORIGIN: "https://mcp.remotearc.app", ENABLE_APPS: "1", ENABLE_BROWSER_RUNNER: "1",
  ENABLE_EXPERIMENTAL_AGENT_GOALS: "0", APP_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64"),
  REGISTRY: { getByName: () => ({ fetch: async (request: Request) => {
    if (request.method === "GET" && new URL(request.url).pathname === "/devices")
      return Response.json([]);
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
async function rpc(method: string, params: unknown, scope?: string, options = env, currentIdentity = identity(scope)) {
  const response = await createRemoteLinkMcp(options, currentIdentity).fetch(new Request(env.PUBLIC_ORIGIN + "/mcp", {
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
const emptyDevices = await rpc("tools/call", { name: "list_devices", arguments: {} }, "devices:read", env, { ...identity("devices:read"), userId: "newcomer" });
assert.deepEqual(JSON.parse(emptyDevices.result.content[0].text), []);
assert(emptyDevices.result.content[1].text.includes("npx remotelink@latest"));
sql.prepare("INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at,allowed_tools) VALUES(?,'newcomer','Chrome Companion','browser',?, ?,?)").run("browser-only", "test-browser", stamp, "[]");
const browserOnly = await rpc("tools/call", { name: "list_devices", arguments: {} },
  "devices:read", env, { ...identity("devices:read"), userId: "newcomer" });
assert.equal(JSON.parse(browserOnly.result.content[0].text).length, 1);
assert(browserOnly.result.content[1].text.includes("npx remotelink@latest"));
const linkedDevices = await rpc("tools/call", { name: "list_devices", arguments: {} }, "devices:read");
assert.equal(linkedDevices.result.content.length, 1);
assert.equal(JSON.parse(linkedDevices.result.content[0].text).length, 2);
const setupManifest = JSON.parse(fs.readFileSync(new URL("../../../plugin.json", import.meta.url), "utf8"));
assert.equal(setupManifest.extensions["com.openai"].onboardingSkill, "./skills/setup/SKILL.md");
assert(fs.readFileSync(new URL("../../../skills/setup/SKILL.md", import.meta.url), "utf8").includes("npx remotelink@latest"));
const listed = (await rpc("tools/list", {})).result.tools as any[];
const appNames = listed.filter(tool => tool.name === "list_apps" || tool.name === "call_app").map(tool => tool.name).sort();
assert.deepEqual(appNames, ["call_app", "list_apps"]);
assert(!listed.some(tool => /^(github|gmail|slack|google_slides)_(messages|issues|presentations|channels)_/.test(tool.name)),
  "Apps should not add hundreds of per-operation MCP tool definitions");
const callSchema = listed.find(tool => tool.name === "call_app").inputSchema;
assert.equal(callSchema.additionalProperties, false);
assert(callSchema.properties.connectionId && callSchema.properties.requestId);
assert(callSchema.properties.operation?.enum.includes("issues.create"));
assert(callSchema.properties.operation?.enum.includes("messages.send"));
assert(callSchema.properties.arguments, "Arguments must be explicitly supplied and validated by the fixed catalog");
const discoverySchema = listed.find(tool => tool.name === "list_apps").inputSchema;
assert(discoverySchema.properties.use_case && discoverySchema.properties.includeSchemas);
const disabled = (await rpc("tools/list", {}, undefined, { ...env, ENABLE_APPS: "0" })).result.tools;
assert(!disabled.some((tool: any) => tool.name === "list_apps" || tool.name === "call_app"));
const accounts = data(await invoke("list_apps", { provider: "gmail", limit: 1 }));
assert.equal(accounts.connections.length, 2, "Legacy provider lookup retains all matching account connections");
assert.equal(accounts.total, 1, "Legacy provider query totals applications, not operations");
assert.equal(accounts.nextCursor, null);
assert.equal(accounts.apps.length, 1);
assert.equal(accounts.apps[0].operations.length, 15, "Explicit provider lookup remains backwards-compatible");
assert(accounts.connections.every((row: any) => row.provider === "gmail"));
const slides = data(await invoke("list_apps", { use_case: "create google slides presentation", limit: 10, includeSchemas: true }));
assert(slides.operations.some((o: any) => o.provider === "google_slides" && o.inputSchema),
  "Google Slides actions must be discoverable with their fixed schema");
const slack = data(await invoke("list_apps", { use_case: "send slack message", limit: 10, includeSchemas: true }));
assert(slack.operations.some((o: any) => o.provider === "slack" && o.inputSchema),
  "Slack actions must be searchable without thousands of top-level MCP tools");
const slidesZh = data(await invoke("list_apps", { use_case: "创建 Google Slides 演示文稿", limit: 10 }));
assert(slidesZh.operations.some((o: any) => o.provider === "google_slides"), "Chinese Slides requests must find operations");
const slackZh = data(await invoke("list_apps", { use_case: "给 Slack 发消息", limit: 10 }));
assert(slackZh.operations.some((o: any) => o.provider === "slack"), "Chinese Slack requests must find operations");
const gh = data(await invoke("list_apps", { provider: "github", use_case: "create issue", includeSchemas: true }));
assert(gh.operations.some((o: any) => o.operation === "issues.create" && o.inputSchema),
  "Search must return the exact operation name and schema");
const summary = data(await invoke("list_apps", {}));
assert.equal(summary.operationCatalogSize, 344);
assert(!JSON.stringify(summary).includes(ids.other), "Do not expose another owner's connection IDs");
assert(!JSON.stringify(summary).includes("inputSchema"));
assert.equal(listed.find(tool => tool.name === "call_app").annotations.destructiveHint, true);
assert.equal(listed.find(tool => tool.name === "call_app").annotations.idempotentHint, false);
assert.equal(listed.find(tool => tool.name === "revoke_file_resource").annotations.destructiveHint, true);
assert.equal(listed.find(tool => tool.name === "undo_last_change").annotations.destructiveHint, true);
assert.equal(listed.find(tool => tool.name === "browser_runner_act").annotations.idempotentHint, false);

const providerRequests: string[] = [];
const additionalOperations = [
  ["repositories.list", ids.github, { limit: 2 }, "GET", "https://api.github.com/user/repos?per_page=2&sort=updated"],
  ["issues.list", ids.github, { repo: "test/project", limit: 2 }, "GET", "https://api.github.com/repos/test/project/issues?per_page=2"],
  ["pulls.list", ids.github, { repo: "test/project", limit: 2, state: "open" }, "GET", "https://api.github.com/repos/test/project/pulls?per_page=2&state=open"],
  ["comments.list", ids.github, { repo: "test/project", number: 17, limit: 2 }, "GET", "https://api.github.com/repos/test/project/issues/17/comments?per_page=2"],
  ["comments.create", ids.github, { repo: "test/project", number: 17, body: "Test comment" }, "POST", "https://api.github.com/repos/test/project/issues/17/comments"],
  ["messages.list", ids.gmail, { query: "in:inbox", limit: 2 }, "GET", "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in%3Ainbox&maxResults=2"],
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
  const create = { connectionId: ids.github, operation: "issues.create", arguments: { repo: "test/project", title: "Review", body: "Body" }, requestId: "create-issue-1" };
  for (const connectionId of [ids.gmail, ids.other, ids.revoked]) {
    assert(rejected(await invoke("call_app", { ...create, connectionId })),
      "Wrong provider, owner or revoked accounts must not dispatch");
  }
  assert.equal(providerRequests.length, 0);
  assert(rejected(await invoke("call_app", { ...create, operation: "messages.send" })));
  assert(rejected(await invoke("call_app", { ...create, operation: "issues.unknown" })));
  assert(rejected(await invoke("call_app", { ...create, arguments: { ...create.arguments, repo: "../escape" } })));
  assert((await invoke("call_app", create, "apps:read")).result._meta["mcp/www_authenticate"]);
  assert((await invoke("call_app", create, "apps:write")).result._meta["mcp/www_authenticate"]);
  assert.equal(providerRequests.length, 0, "Invalid operations, inputs or missing OAuth scopes must not dispatch");
  const result = data(await invoke("call_app", create));
  assert.equal(result.result.number, 17);
  assert.equal(data(await invoke("call_app", create)).replayed, true);
  assert.equal(providerRequests.length, 1, "Stable requestId must prevent duplicate writes");
  assert.equal(data(await invoke("call_app", { ...create, arguments: { ...create.arguments, title: "Changed" } })).error.code, "app_request_id_conflict");
  const readBack = data(await invoke("call_app", {
    connectionId: ids.github, operation: "issues.get", arguments: { repo: "test/project", number: 17 }, requestId: "read-issue-1",
  }));
  assert.deepEqual(readBack.result, result.result);
  const msg = data(await invoke("call_app", {
    connectionId: ids.gmail, operation: "messages.get", arguments: { id: "message-1" }, requestId: "read-mail-1",
  }));
  assert.equal(msg.result.id, "message-1");
  const draft = { connectionId: ids.gmail, operation: "drafts.create",
    arguments: { to: ["test@example.test"], subject: "Subject", body: "Body" }, requestId: "create-draft-1" };
  assert(rejected(await invoke("call_app", { ...draft, connectionId: ids.readonly })), "Provider write scope must be enforced");
  assert.equal(data(await invoke("call_app", draft)).result.id, "draft-1");
  assert(!providerRequests.some(url => url.endsWith("/send")), "Draft creation must not send mail");
  assert(!JSON.stringify(result).includes("test-provider-token"));
  for (const [operation, connectionId, fields] of additionalOperations) {
    const reply = data(await invoke("call_app", { connectionId, requestId: "router-" + operation.replaceAll(".", "-"), operation, arguments: fields }));
    assert.equal(reply.result.testedOperation, operation, "The fixed registry must dispatch only the selected action");
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
console.log("PASS: two-tool App discovery/execute router, 344 fixed schemas, owner/provider/scope checks, ledger replay, Slides/Slack search, and browser policy");
