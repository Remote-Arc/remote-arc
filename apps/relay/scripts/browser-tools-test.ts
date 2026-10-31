import assert from "node:assert/strict";
import { LEGACY_ALIAS_META_KEY, LEGACY_SHARED_TAB_ALIASES, registerLegacySharedTabAliases, registerSharedTabTools, SHARED_TAB_TOOLS } from "../src/mcp/shared-tab-mcp.js";
import { registerBrowserRunnerTools, BROWSER_RUNNER_TOOLS, browserRunnerDefinitionsForTest, runAct, runStart } from "../src/mcp/browser-runner-mcp.js";
import { callDevice } from "../src/devices/device-call.js";
import { parseRunnerAttention, runnerViewPath } from "../src/browser/runner-attention.js";
import { classifyExpectedMcpError } from "../src/mcp/mcp-errors.js";
import type { OAuthIdentity } from "../src/auth/auth.js";

type Registered = { def: { annotations: Record<string, boolean>; description: string }; handler: (input: Record<string, unknown>) => Promise<unknown> };
const tools = new Map<string, Registered>();
const server = { registerTool(name: string, def: Registered["def"], handler: Registered["handler"]) { tools.set(name, { def, handler }); } };

const identity = (scope: string) => ({ userId: "u1", clientId: "c", grantId: "g", scope }) as unknown as OAuthIdentity;
let current: OAuthIdentity | null = identity("browser:read browser:interact");
const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
let failing = new Set<string>();
const deps = {
  get identity() { return current; },
  hasScope: (id: OAuthIdentity, scope: string) => id.scope.split(" ").includes(scope),
  authRequired: (scope: string) => ({ auth: scope }),
  consume: async () => null,
  oauthToolMeta: (scope: string) => ({ scope }),
  textResult: (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] }),
  callDevice: async (_id: OAuthIdentity, _device: string, tool: string, args: Record<string, unknown>) => {
    calls.push({ tool, args });
    if (failing.has(tool)) throw new Error('tool "' + tool + '" is disabled for this device');
    return { tool };
  },
};
registerSharedTabTools(server as never, deps as never);
registerBrowserRunnerTools(server as never, deps as never);

// Two families with names that cannot be confused, 13 tools in total.
assert.deepEqual([...tools.keys()].sort(), [...SHARED_TAB_TOOLS, ...BROWSER_RUNNER_TOOLS].sort());
assert.equal(tools.size, 13);
// Routing-only notifications must discard page content, query strings and secrets.
const parsedAttention = parseRunnerAttention({
  type: "runner_attention", event_id: "a".repeat(32), session_id: "runner-1",
  task_id: "untrusted", kind: "captcha", origin: "https://example.test/private?token=secret",
  title: "untrusted title", password: "never-forward", screenshot: "never-forward",
});
assert.deepEqual(parsedAttention, {
  type: "runner_attention", event_id: "a".repeat(32), session_id: "runner-1",
  task_id: "runner-1", kind: "captcha", origin: "https://example.test",
});
assert.equal(parseRunnerAttention({ ...parsedAttention, origin: "javascript:alert(1)" }), null);
assert.equal(parseRunnerAttention({ ...parsedAttention, origin: "https://user:pass@example.test" }), null);
assert.equal(parseRunnerAttention({ ...parsedAttention, kind: "screenshot" }), null);
assert.equal(parseRunnerAttention({ ...parsedAttention, session_id: "../escape" }), null);
assert.equal(runnerViewPath("device-1", "session-1"), "/dashboard/browser/device-1/session-1");
for (const name of BROWSER_RUNNER_TOOLS) {
  assert.match(tools.get(name)!.def.description + browserRunnerDefinitionsForTest[name].description, /./);
}
assert.match(tools.get("browser_runner_start")!.def.description, /shared_tab_\*/, "runner points to shared tabs");
assert.match(tools.get("shared_tab_read")!.def.description, /browser_runner_\*/, "shared tabs point to runner");
assert.equal(tools.get("browser_runner_snapshot")!.def.annotations.readOnlyHint, true);
assert.equal(tools.get("browser_runner_act")!.def.annotations.destructiveHint, true);
assert.equal(tools.get("shared_tab_click")!.def.annotations.destructiveHint, true);

const chromeTask = browserRunnerDefinitionsForTest.browser_runner_start.input.parse({
  device_id: "d", task_id: "chrome-task", browser: "your_chrome", allowed_origins: ["https://example.test"],
});
assert.equal(chromeTask.browser, "your_chrome", "MCP must preserve the selected Chrome mode");
assert.equal(browserRunnerDefinitionsForTest.browser_runner_start.input.safeParse({ ...chromeTask, browser: "firefox" }).success, false);
for (const code of ["YOUR_CHROME_NOT_ENABLED", "YOUR_CHROME_WAITING", "YOUR_CHROME_DENIED", "YOUR_CHROME_UNSUPPORTED"]) {
  assert.equal(classifyExpectedMcpError(new Error(`${code}: next step`))?.code, code);
}
await assert.rejects(runStart(async () => ({ session_id: "chrome-task" }), chromeTask), /YOUR_CHROME_UNSUPPORTED/);
assert.deepEqual(await runStart(async () => ({ browser: "your_chrome" }), chromeTask), { browser: "your_chrome" });
assert.deepEqual(await runStart(async () => ({ session_id: "runner-task" }), { task_id: "runner-task" }), { session_id: "runner-task" });

// Scopes: interaction needs browser:interact even when reading is allowed.
current = identity("browser:read");
assert.deepEqual(await tools.get("browser_runner_act")!.handler({ device_id: "d", session_id: "s", action: "wait" }), { auth: "browser:interact" });
assert.deepEqual(await tools.get("shared_tab_fill")!.handler({ device_id: "d", snapshot_id: "x", ref: "e1", value: "v" }), { auth: "browser:interact" });
assert.equal(calls.length, 0, "no device call without the scope");
current = identity("browser:read browser:interact");

// Runner MCP names equal device names; device_id is not forwarded as an argument.
await tools.get("browser_runner_act")!.handler({ device_id: "pc", session_id: "s1", action: "navigate", url: "https://jobs.example.com/" });
assert.deepEqual(calls.pop(), { tool: "browser_runner_act", args: { session_id: "s1", action: "navigate", url: "https://jobs.example.com/" } });

// shared_tab_read fans out to the unchanged companion device protocol.
const read = await tools.get("shared_tab_read")!.handler({ device_id: "ext", tab_id: 7, include: ["page", "links", "table"], table_index: 2 }) as { content: { text: string }[] };
assert.deepEqual(calls.splice(0).map((c) => [c.tool, c.args]), [
  ["browser_read_page", { tab_id: 7 }],
  ["browser_extract_links", { tab_id: 7 }],
  ["browser_extract_table", { tab_id: 7, table_index: 2 }],
]);
assert.deepEqual(Object.keys(JSON.parse(read.content[0].text)), ["page", "links", "table"]);
// One disabled part does not hide the parts that succeeded.
failing = new Set(["browser_extract_links"]);
const partial = JSON.parse((await tools.get("shared_tab_read")!.handler({ device_id: "ext", include: ["page", "links"] }) as { content: { text: string }[] }).content[0].text);
assert.ok(partial.page && partial.errors.links && !partial.links);
// A single requested part that fails comes back as a structured, recoverable error.
const only = await tools.get("shared_tab_read")!.handler({ device_id: "ext", include: ["links"] }) as { content: { text: string }[] };
assert.equal(JSON.parse(only.content[0].text).error.code, "TOOL_DISABLED");
failing = new Set();
calls.length = 0;
console.log("PASS: browser tool surface, scopes and shared-tab fan-out");

// Hosts with a cached pre-rc.4 tool list keep calling the old shared-tab
// names. They must still work, with the same scopes and device protocol, and
// tell the model to have the user refresh the connector.
const legacy = new Map<string, Registered & { def: { _meta?: Record<string, unknown> } }>();
registerLegacySharedTabAliases({ registerTool(name: string, def: never, handler: never) { legacy.set(name, { def, handler }); } } as never, deps as never);
assert.deepEqual([...legacy.keys()].sort(), Object.keys(LEGACY_SHARED_TAB_ALIASES).sort());
assert.equal(legacy.size, 8);
for (const [name, alias] of legacy) {
  assert.equal(alias.def._meta?.[LEGACY_ALIAS_META_KEY], LEGACY_SHARED_TAB_ALIASES[name as keyof typeof LEGACY_SHARED_TAB_ALIASES]);
  assert.ok(!tools.has(name), "legacy names are not part of the current surface");
}
assert.equal(legacy.get("browser_click")!.def.annotations.destructiveHint, true);
const legacyRead = JSON.parse((await legacy.get("browser_read_page")!.handler({ device_id: "ext", tab_id: 3 }) as { content: { text: string }[] }).content[0].text);
assert.deepEqual(calls.pop(), { tool: "browser_read_page", args: { tab_id: 3 } });
assert.deepEqual(legacyRead.result, { tool: "browser_read_page" });
assert.match(legacyRead.notice, /renamed to shared_tab_read.*refresh or reconnect the Remote Arc connector.*browser_runner_\*/s);
await legacy.get("browser_extract_table")!.handler({ device_id: "ext", table_index: 1 });
assert.deepEqual(calls.pop(), { tool: "browser_extract_table", args: { table_index: 1 } });
await legacy.get("browser_fill")!.handler({ device_id: "ext", tab_id: 2, snapshot_id: "s", ref: "e4", value: "x" });
assert.deepEqual(calls.pop(), { tool: "browser_fill", args: { tab_id: 2, snapshot_id: "s", ref: "e4", value: "x" } });
current = identity("browser:read");
assert.deepEqual(await legacy.get("browser_click")!.handler({ device_id: "ext", snapshot_id: "s", ref: "e1" }), { auth: "browser:interact" });
assert.equal(calls.length, 0, "legacy aliases keep the interaction scope");
current = identity("browser:read browser:interact");
console.log("PASS: legacy shared-tab names stay callable for cached hosts");

// Device-call guards.
const row = (platform: string, allowed: string[] | null) => ({
  id: "dev", platform, allowed_tools: allowed ? JSON.stringify(allowed) : null, workspace_roots: JSON.stringify(["/home/u"]),
  sensitive_paths: null, sensitive_allow_paths: null, protect_sensitive_paths: 1, undo_enabled: 1,
  runner_attention_mode: "show_and_notify",
});
let device = row("linux", null);
let dispatched: string[] = [];
let dispatchedAttention = "";
const env = {
  DB: { prepare: () => ({ bind: () => ({ first: async () => device, run: async () => ({ meta: { changes: 1 } }), all: async () => ({ results: [] }) }) }) },
  REGISTRY: { getByName: () => ({ fetch: async (request: Request) => { const body = await request.json() as { tool: string; policy: {runnerAttentionMode: string} }; dispatched.push(body.tool); dispatchedAttention = body.policy.runnerAttentionMode; return Response.json({ result: { ok: true } }); } }) },
} as never;
const owner = identity("browser:interact");

// A legacy device with no stored tool list must not get Browser Runner.
await assert.rejects(callDevice(env, owner, "dev", "browser_runner_start", {}), /disabled for this device\. Enable browser_runner/);
device = row("linux", ["read_file"]);
await assert.rejects(callDevice(env, owner, "dev", "browser_runner_start", {}), /is disabled for this device/);
device = row("linux", ["browser_runner_start"]);
assert.deepEqual(await callDevice(env, owner, "dev", "browser_runner_start", { task_id: "t" }), { ok: true });
assert.deepEqual(dispatched, ["browser_runner_start"]);
assert.equal(dispatchedAttention, "show_and_notify");
await callDevice(env, {...owner, clientId:"automation:scheduled-run"}, "dev", "browser_runner_start", {task_id:"scheduled",runnerAttentionMode:"show_and_notify",headless:false});
assert.equal(dispatchedAttention,"notify_only","model arguments cannot override background origin");
await callDevice(env, owner,"dev","browser_runner_start",{task_id:"arc-run"},undefined,"server-side-run-id");
assert.equal(dispatchedAttention,"notify_only","Arc run routing is unattended");
device.runner_attention_mode="notify_only";
await callDevice(env,owner,"dev","browser_runner_start",{task_id:"interactive"});
assert.equal(dispatchedAttention,"notify_only","device preference overrides interactive origin");
device.runner_attention_mode="show_and_notify";
await callDevice(env,owner,"dev","browser_runner_start",{task_id:"interactive"});
assert.equal(dispatchedAttention,"show_and_notify");

// Wrong family: helpful redirect before any dispatch or permission noise.
dispatched = [];
device = row("browser", ["browser_runner_start"]);
const wrongRunner = await callDevice(env, owner, "dev", "browser_runner_start", {}).catch((e: Error) => e);
assert.match(String(wrongRunner), /browser extension device.*shared_tab_read/);
device = row("win32", ["browser_read_page"]);
const wrongTab = await callDevice(env, owner, "dev", "browser_read_page", {}).catch((e: Error) => e);
assert.match(String(wrongTab), /not available on this computer.*browser_runner_start/);
assert.deepEqual(dispatched, [], "wrong-family calls never reach a device");

// Extension 0.4.0 actions follow the click & fill permission an
// already-paired browser has; without it they are refused.
device = row("browser", ["browser_read_page", "browser_click", "browser_fill"]);
assert.deepEqual(await callDevice(env, owner, "dev", "browser_act", { action: "back" }), { ok: true });
assert.deepEqual(await callDevice(env, owner, "dev", "browser_open_tab", { url: "https://example.com/" }), { ok: true });
device = row("browser", ["browser_read_page", "browser_act", "browser_open_tab"]);
await assert.rejects(callDevice(env, owner, "dev", "browser_act", { action: "back" }), /is disabled for this device/);
assert.deepEqual(dispatched, ["browser_act", "browser_open_tab"]);
dispatched = [];
assert.equal(classifyExpectedMcpError(wrongRunner)?.code, "WRONG_BROWSER_TOOL");
assert.equal(classifyExpectedMcpError(new Error("STALE_REF: take a new snapshot"))?.code, "STALE_REF");
for (const [message, code] of [
  ["SCOPE_CHANGE_REQUIRED: this task is limited to [https://a.test]", "SCOPE_CHANGE_REQUIRED"],
  ["SCOPE_CHANGE_REQUIRED: approve the exact sites in Dashboard Security / Boundary requests (x) and retry", "SCOPE_CHANGE_REQUIRED"],
  ["SUBMIT_EFFECT_REQUIRED: this control may submit data.", "SUBMIT_EFFECT_REQUIRED"],
  ["SUBMIT_ALREADY_RECORDED: this task already sent the same submit as k (confirmed).", "SUBMIT_ALREADY_RECORDED"],
] as const) assert.equal(classifyExpectedMcpError(new Error(message))?.code, code, message);
assert.equal(classifyExpectedMcpError(new Error("browser protocol error. The submit k may have been sent; its effect is unknown. Do not submit again"))?.code, "UNKNOWN_EFFECT");
console.log("PASS: Browser Runner explicit opt-in, wrong-family hints and error codes");

// Frame refs (f1e3) from embedded application forms are accepted; junk is not.
const refSchema = browserRunnerDefinitionsForTest.browser_runner_act.input.shape.ref;
for (const ok of ["e1", "e400", "f1e3", "f12e9"]) assert.ok(refSchema.safeParse(ok).success, ok);
for (const bad of ["f0e1", "fe1", "e0", "f1", "x1"]) assert.ok(!refSchema.safeParse(bad).success, bad);
console.log("PASS: Browser Runner frame refs");

// fill_form and snapshot=true are part of the act contract.
const actSchema = browserRunnerDefinitionsForTest.browser_runner_act.input;
const formArgs = { device_id: "pc", session_id: "s1", snapshot_id: "s3-abc", action: "fill_form", fields: [{ ref: "e3", action: "fill", value: "Sam" }, { ref: "f1e2", action: "check" }], snapshot: true };
assert.ok(actSchema.safeParse(formArgs).success, "fill_form with fields");
assert.ok(!actSchema.safeParse({ ...formArgs, fields: [{ ref: "e3", action: "click" }] }).success, "clicks are not batch fields");
assert.ok(!actSchema.safeParse({ ...formArgs, fields: Array.from({ length: 41 }, (_, i) => ({ ref: "e" + (i + 1), action: "check" })) }).success, "at most 40 fields");
assert.ok(!actSchema.safeParse({ ...formArgs, fields: [] }).success, "at least one field");
assert.match(tools.get("browser_runner_act")!.def.description, /fill_form/);
assert.match(tools.get("browser_runner_act")!.def.description, /snapshot=true/);

// A current Agent answers both itself: the Relay passes the call through once.
{
  const seen: Array<[string, Record<string, unknown>]> = [];
  const call = async (tool: string, args: Record<string, unknown>) => {
    seen.push([tool, args]);
    return { action: "fill_form", entered: 2, failed: 0, snapshot: { snapshot_id: "s4" } };
  };
  const { device_id: _d, ...forwarded } = formArgs;
  const out = (await runAct(call as never, forwarded)) as Record<string, unknown>;
  assert.equal(seen.length, 1);
  assert.equal(out.entered, 2);
  assert.equal(out.compatibility, undefined);
}

// An older Agent (rc.7 and before) answers fill_form with "ref is required.":
// the Relay enters the fields one at a time with the same result shape, keeps
// going past a field that fails, and stops when the page navigates.
{
  const seen: Array<[string, Record<string, unknown>]> = [];
  const call = async (tool: string, args: Record<string, unknown>) => {
    seen.push([tool, args]);
    if (tool === "browser_runner_snapshot") return { snapshot_id: "s9", elements: [] };
    if (args.action === "fill_form") throw new Error("ref is required.");
    if (args.ref === "e2") throw new Error('NO_OPTION: no option matches "Narnia". Available: Choose | New Zealand');
    if (args.ref === "e3") return { action: "select", label: "Sort", selected: "Newest", navigated: true, url: "https://jobs.example.com/results", session_id: "s1" };
    return { action: args.action, label: "Field " + String(args.ref), value_length: 3, navigated: false, url: "https://jobs.example.com/apply", session_id: "s1" };
  };
  const out = (await runAct(call as never, {
    session_id: "s1", snapshot_id: "s3-abc", action: "fill_form", snapshot: true,
    fields: [{ ref: "e1", action: "fill", value: "Sam" }, { ref: "e2", action: "select", value: "Narnia" }, { ref: "e3", action: "select", value: "Newest" }, { ref: "e4", action: "fill", value: "x" }],
  })) as Record<string, unknown>;
  assert.deepEqual(seen.map(([tool, args]) => tool + ":" + String(args.ref ?? args.action)), [
    "browser_runner_act:fill_form", "browser_runner_act:e1", "browser_runner_act:e2", "browser_runner_act:e3", "browser_runner_snapshot:undefined",
  ]);
  assert.deepEqual(seen[1][1], { session_id: "s1", snapshot_id: "s3-abc", ref: "e1", action: "fill", value: "Sam" });
  assert.equal(out.entered, 2);
  assert.equal(out.failed, 1);
  assert.equal(out.navigated, true);
  assert.deepEqual(out.not_entered, ["e4"]);
  assert.match(String(out.stopped), /navigated after fields\[2\]/);
  assert.match(String((out.fields as Record<string, unknown>[])[1].error), /^NO_OPTION/);
  assert.equal(out.url, "https://jobs.example.com/results");
  assert.match(String(out.compatibility), /older than 0\.6\.2-rc\.8/);
  assert.deepEqual(out.snapshot, { snapshot_id: "s9", elements: [] });
}

// A replaced snapshot stops the fallback before anything is typed; other
// errors from an older Agent are not mistaken for an unknown fill_form.
{
  const call = async (_tool: string, args: Record<string, unknown>) => {
    if (args.action === "fill_form") throw new Error("action must be click, fill, select, check, uncheck, press, navigate, upload or wait.");
    throw new Error("STALE_REF: snapshot s3-abc is not the latest snapshot of the current page. Take a new browser_runner_snapshot.");
  };
  const out = (await runAct(call as never, { session_id: "s1", snapshot_id: "s3-abc", action: "fill_form", fields: [{ ref: "e1", action: "fill", value: "Sam" }] })) as Record<string, unknown>;
  assert.equal(out.entered, 0);
  assert.deepEqual(out.not_entered, ["e1"]);
  await assert.rejects(
    runAct((async () => { throw new Error("BLOCKED_SENSITIVE: never types passwords"); }) as never, { session_id: "s1", action: "fill_form", fields: [] }),
    /BLOCKED_SENSITIVE/,
  );
  await assert.rejects(
    runAct((async () => { throw new Error("ref is required."); }) as never, { session_id: "s1", action: "click" }),
    /ref is required/,
  );
}

// snapshot=true on an older Agent: the Relay takes the snapshot after the act.
{
  const seen: string[] = [];
  const call = async (tool: string) => {
    seen.push(tool);
    return tool === "browser_runner_snapshot" ? { snapshot_id: "s5" } : { action: "click", navigated: false };
  };
  const out = (await runAct(call as never, { session_id: "s1", snapshot_id: "s4", ref: "e7", action: "click", snapshot: true })) as Record<string, unknown>;
  assert.deepEqual(seen, ["browser_runner_act", "browser_runner_snapshot"]);
  assert.deepEqual(out.snapshot, { snapshot_id: "s5" });
}
console.log("PASS: Browser Runner fill_form and snapshot=true on current and older Agents");

// fill_secret names a saved sign-in and a part; never a value.
assert.ok(actSchema.safeParse({ device_id: "pc", session_id: "s1", snapshot_id: "s3", action: "fill_secret", ref: "e4", secret: "jenny-nzlinfox-identity.login.pageuppeople.com", part: "password" }).success);
assert.ok(!actSchema.safeParse({ device_id: "pc", session_id: "s1", snapshot_id: "s3", action: "fill_secret", ref: "e4", secret: "jenny pageup", part: "password" }).success, "names have no spaces");
assert.ok(!actSchema.safeParse({ device_id: "pc", session_id: "s1", snapshot_id: "s3", action: "fill_secret", ref: "e4", secret: "jenny-acme", part: "token" }).success, "only username or password");
assert.match(tools.get("browser_runner_act")!.def.description, /fill_secret/);
console.log("PASS: Browser Runner fill_secret contract");

// Extension 0.4.0: open tabs on allowed sites and act in them.
{
  const openSchema = (tools.get("shared_tab_open")!.def as unknown as { inputSchema: { safeParse: (v: unknown) => { success: boolean } } }).inputSchema;
  const actSchemaTab = (tools.get("shared_tab_act")!.def as unknown as { inputSchema: { safeParse: (v: unknown) => { success: boolean } } }).inputSchema;
  assert.ok(openSchema.safeParse({ device_id: "ext", url: "https://www.maoyan.com/" }).success);
  assert.ok(!openSchema.safeParse({ device_id: "ext", url: "not a url" }).success);
  assert.ok(actSchemaTab.safeParse({ device_id: "ext", tab_id: 3, action: "click", snapshot_id: "s1", ref: "e2", effect: "submit", idempotency_key: "order-1" }).success);
  assert.ok(actSchemaTab.safeParse({ device_id: "ext", action: "confirm", idempotency_key: "order-1", outcome: "succeeded" }).success);
  assert.ok(!actSchemaTab.safeParse({ device_id: "ext", action: "evaluate" }).success, "no generic script action");
  assert.ok(!actSchemaTab.safeParse({ device_id: "ext", action: "press", key: "F12" }).success);
  assert.match(tools.get("shared_tab_act")!.def.description, /SUBMIT_ALREADY_RECORDED/);
  assert.match(tools.get("shared_tab_open")!.def.description, /SITE_NOT_ALLOWED/);
  assert.equal(tools.get("shared_tab_act")!.def.annotations.destructiveHint, true);

  current = identity("browser:read");
  assert.deepEqual(await tools.get("shared_tab_open")!.handler({ device_id: "ext", url: "https://example.com/" }), { auth: "browser:interact" });
  current = identity("browser:read browser:interact");
  calls.length = 0;
  await tools.get("shared_tab_open")!.handler({ device_id: "ext", url: "https://example.com/" });
  await tools.get("shared_tab_act")!.handler({ device_id: "ext", tab_id: 4, action: "fill", snapshot_id: "s1", ref: "e1", value: "hi", snapshot: undefined });
  assert.deepEqual(calls.splice(0), [
    { tool: "browser_open_tab", args: { url: "https://example.com/" } },
    { tool: "browser_act", args: { tab_id: 4, action: "fill", snapshot_id: "s1", ref: "e1", value: "hi" } },
  ]);

  // An extension older than 0.4.0 does not know these tools: the user is told to update.
  const old = deps.callDevice;
  deps.callDevice = async () => { throw new Error("Unsupported browser tool: browser_act"); };
  const outdated = await tools.get("shared_tab_act")!.handler({ device_id: "ext", action: "back" }).catch((e: Error) => e);
  assert.match(JSON.stringify(outdated instanceof Error ? outdated.message : outdated), /EXTENSION_UPDATE_REQUIRED/);
  deps.callDevice = old;
}
for (const code of ["SUBMIT_KEY_USED", "SITE_NOT_ALLOWED", "EXTENSION_UPDATE_REQUIRED", "WAIT_TIMEOUT"]) {
  assert.equal(classifyExpectedMcpError(new Error(`${code}: next step`))?.code, code);
}
console.log("PASS: shared_tab_open and shared_tab_act contract");

// Wait reuses the existing read permission so old device opt-ins need no reset.
const waitDefinition=browserRunnerDefinitionsForTest.browser_runner_wait;
assert.equal(waitDefinition.scope,"browser:read");assert.equal(waitDefinition.annotations.readOnlyHint,true);
assert(waitDefinition.input.safeParse({device_id:"d",session_id:"s",until:"user_done",timeout_ms:60000}).success,"large waits reach the Agent for clamping");
assert(!waitDefinition.input.safeParse({device_id:"d",session_id:"s",until:"invalid"}).success);
current=identity("browser:read");calls.length=0;
await tools.get("browser_runner_wait")!.handler({device_id:"d",session_id:"s",until:"user_done",timeout_ms:40000});
assert.deepEqual(calls.pop(),{tool:"browser_runner_wait",args:{session_id:"s",until:"user_done",timeout_ms:40000}});
device=row("linux",["browser_runner_snapshot"]);
assert.deepEqual(await callDevice(env,owner,"dev","browser_runner_wait",{session_id:"s",until:"user_done"}),{ok:true});
device=row("linux",["read_file"]);
await assert.rejects(callDevice(env,owner,"dev","browser_runner_wait",{session_id:"s",until:"user_done"}),/disabled/);
console.log("PASS: Browser Runner wait read scope, legacy opt-in and timeout contract");
