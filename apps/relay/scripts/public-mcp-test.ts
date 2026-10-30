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
const assertFirstRunLinks = (text: string) => {
  const ordered = ["https://remotearc.app/downloads", "https://remotearc.app/connect-ai", "curl -fsSL https://remotearc.app/install.sh | sh", "npx remotelink@latest"];
  const positions = ordered.map(value => text.indexOf(value));
  assert(positions.every(position => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "Direct download and optional setup information must precede terminal alternatives");
  assert(text.includes("https://agent.remotearc.app/devices"), "First-time users get the Dashboard link");
  assert.match(text, /Node.js 20(?:\+| or newer)/);
};
assertFirstRunLinks(emptyDevices.result.content[1].text);
for (const clientId of ["chatgpt-client", "claude-client", "codex-client", "unrecognized-client"]) {
  const response = await rpc("tools/call", { name: "list_devices", arguments: {} }, "devices:read", env,
    { ...identity("devices:read"), userId: "newcomer", clientId });
  const text = response.result.content[1].text;
  assertFirstRunLinks(text);
  assert(!text.includes("/install/chatgpt"), "The shared MCP must use a general setup guide");
  assert(!text.includes("this ChatGPT conversation"));
  assert(!text.includes("ChatGPT Plugin"));
}

sql.prepare("INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at,allowed_tools) VALUES(?,'newcomer','Chrome Companion','browser',?, ?,?)").run("browser-only", "test-browser", stamp, "[]");
const browserOnly = await rpc("tools/call", { name: "list_devices", arguments: {} },
  "devices:read", env, { ...identity("devices:read"), userId: "newcomer" });
assert.equal(JSON.parse(browserOnly.result.content[0].text).length, 1);
assertFirstRunLinks(browserOnly.result.content[1].text);
const linkedDevices = await rpc("tools/call", { name: "list_devices", arguments: {} }, "devices:read");
assert.equal(linkedDevices.result.content.length, 1);
assert.equal(JSON.parse(linkedDevices.result.content[0].text).length, 2);
const setupManifest = JSON.parse(fs.readFileSync(new URL("../../../plugin.json", import.meta.url), "utf8"));
assert.equal(setupManifest.extensions["com.openai"].onboardingSkill, "./skills/setup/SKILL.md");
assertFirstRunLinks(fs.readFileSync(new URL("../../../skills/setup/SKILL.md", import.meta.url), "utf8"));
const listDevicesDefinition = ((await rpc("tools/list", {})).result.tools as any[]).find(tool => tool.name === "list_devices");
assert(listDevicesDefinition.description.includes("https://remotearc.app/connect-ai"));
assert(!listDevicesDefinition.description.includes("/install/chatgpt"));
const listed = (await rpc("tools/list", {})).result.tools as any[];
const APP_TOOL_NAMES = ["list_apps", "run_app_read_action", "run_app_write_action"];
const appNames = listed.filter(tool => APP_TOOL_NAMES.includes(tool.name) || tool.name === "call_app").map(tool => tool.name).sort();
assert.deepEqual(appNames, APP_TOOL_NAMES, "The generic call_app executor is replaced by typed read and write action tools");
assert(!listed.some(tool => /^(github|gmail|slack|google_slides)_(messages|issues|presentations|channels)_/.test(tool.name)),
  "Apps should not add hundreds of per-operation MCP tool definitions");
// Every operation is published up front with its own description and exact schema.
const { APP_OPERATIONS } = await import("../src/app-catalog.js");
const actionVariants = (name: string) => {
  const schema = listed.find(tool => tool.name === name).inputSchema;
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual([...schema.required].sort(), ["connectionId", "operation", "requestId"]);
  const variants = schema.properties.operation.oneOf ?? schema.properties.operation.anyOf;
  for (const variant of variants) {
    assert.equal(variant.additionalProperties, false);
    assert.equal(typeof variant.properties.action.const, "string");
    assert(variant.description?.length > 10, variant.properties.action.const + " needs its own description");
    assert.equal(variant.properties.arguments.type, "object", variant.properties.action.const + " needs a typed argument schema");
  }
  return variants.map((variant: any) => variant.properties.action.const as string);
};
const readActions = actionVariants("run_app_read_action"), writeActions = actionVariants("run_app_write_action");
const expectedActions = (permission: string) => APP_OPERATIONS.filter(o => o.permission === permission).map(o => o.provider + "." + o.name).sort();
assert.deepEqual([...readActions].sort(), expectedActions("read"), "The read tool exposes exactly the read operations");
assert.deepEqual([...writeActions].sort(), expectedActions("write"), "The write tool exposes exactly the write operations");
assert.equal(readActions.length + writeActions.length, 344);
assert.equal(new Set([...readActions, ...writeActions]).size, 344, "Action IDs are unique across providers");
assert(writeActions.includes("gmail.messages.send") && readActions.includes("gmail.messages.get") && !readActions.includes("gmail.messages.send"));
const discoverySchema = listed.find(tool => tool.name === "list_apps").inputSchema;
assert(discoverySchema.properties.use_case && discoverySchema.properties.includeSchemas);
const disabled = (await rpc("tools/list", {}, undefined, { ...env, ENABLE_APPS: "0" })).result.tools;
assert(!disabled.some((tool: any) => APP_TOOL_NAMES.includes(tool.name)));
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
assert(gh.operations.some((o: any) => o.action === "github.issues.create"), "Search returns the typed action ID");
const annotations = (name: string) => listed.find(tool => tool.name === name).annotations;
assert.deepEqual(annotations("list_apps"), { readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: true });
assert.deepEqual(annotations("run_app_read_action"), { readOnlyHint: true, openWorldHint: true, destructiveHint: false, idempotentHint: true });
assert.deepEqual(annotations("run_app_write_action"), { readOnlyHint: false, openWorldHint: true, destructiveHint: true, idempotentHint: false });
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
  // Typed action calls: { connectionId, requestId, operation: { action, arguments } }.
  const READ = "run_app_read_action", WRITE = "run_app_write_action";
  const action = (connectionId: string, id: string, args: unknown, requestId: string) => ({ connectionId, requestId, operation: { action: id, arguments: args } });
  const createArgs = { repo: "test/project", title: "Review", body: "Body" };
  const create = action(ids.github, "github.issues.create", createArgs, "create-issue-1");
  for (const connectionId of [ids.gmail, ids.other, ids.revoked]) {
    assert(rejected(await invoke(WRITE, { ...create, connectionId })),
      "Wrong provider, owner or revoked accounts must not dispatch");
  }
  assert.equal(providerRequests.length, 0);
  assert(rejected(await invoke(WRITE, action(ids.github, "gmail.messages.send", { to: ["a@example.test"], subject: "S", body: "B" }, "wrong-provider-1"))),
    "An action ID must match the connection's provider");
  assert(rejected(await invoke(WRITE, action(ids.github, "github.issues.unknown", createArgs, "unknown-action-1"))));
  assert(rejected(await invoke(READ, create)), "The read-only tool cannot run a write action");
  assert(rejected(await invoke(WRITE, action(ids.github, "github.issues.get", { repo: "test/project", number: 17 }, "read-via-write-1"))),
    "The write tool exposes only write actions");
  assert(rejected(await invoke(WRITE, action(ids.github, "github.issues.create", { ...createArgs, repo: "../escape" }, "escape-1"))));
  assert(rejected(await invoke(WRITE, action(ids.github, "github.issues.create", { ...createArgs, extra: true }, "extra-field-1"))),
    "Arguments are validated against the action's exact schema");
  assert((await invoke(WRITE, create, "apps:read")).result._meta["mcp/www_authenticate"]);
  assert((await invoke(WRITE, create, "apps:write")).result._meta["mcp/www_authenticate"]);
  assert((await invoke(READ, action(ids.github, "github.issues.get", { repo: "test/project", number: 17 }, "read-scope-1"), "apps:write")).result._meta["mcp/www_authenticate"]);
  assert.equal(providerRequests.length, 0, "Invalid operations, inputs or missing OAuth scopes must not dispatch");
  const result = data(await invoke(WRITE, create));
  assert.equal(result.result.number, 17);
  assert.equal(data(await invoke(WRITE, create)).replayed, true);
  assert.equal(providerRequests.length, 1, "Stable requestId must prevent duplicate writes");
  assert.equal(data(await invoke(WRITE, action(ids.github, "github.issues.create", { ...createArgs, title: "Changed" }, "create-issue-1"))).error.code, "app_request_id_conflict");
  const readBack = data(await invoke(READ, action(ids.github, "github.issues.get", { repo: "test/project", number: 17 }, "read-issue-1")));
  assert.deepEqual(readBack.result, result.result);
  const msg = data(await invoke(READ, action(ids.gmail, "gmail.messages.get", { id: "message-1" }, "read-mail-1")));
  assert.equal(msg.result.id, "message-1");
  const draft = action(ids.gmail, "gmail.drafts.create", { to: ["test@example.test"], subject: "Subject", body: "Body" }, "create-draft-1");
  assert(rejected(await invoke(WRITE, { ...draft, connectionId: ids.readonly })), "Provider write scope must be enforced");
  assert.equal(data(await invoke(WRITE, draft)).result.id, "draft-1");
  assert(!providerRequests.some(url => url.endsWith("/send")), "Draft creation must not send mail");
  assert(!JSON.stringify(result).includes("test-provider-token"));
  for (const [operation, connectionId, fields] of additionalOperations) {
    const provider = connectionId === ids.github ? "github" : "gmail";
    const tool = APP_OPERATIONS.find(o => o.provider === provider && o.name === operation)!.permission === "write" ? WRITE : READ;
    const reply = data(await invoke(tool, action(connectionId, provider + "." + operation, fields, "router-" + operation.replaceAll(".", "-"))));
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
console.log("PASS: App discovery plus typed read/write action tools publishing all 344 operation schemas, owner/provider/scope checks, ledger replay, Slides/Slack search, and browser policy");
