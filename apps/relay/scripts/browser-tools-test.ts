import assert from "node:assert/strict";
import { registerSharedTabTools, SHARED_TAB_TOOLS } from "../src/shared-tab-mcp.js";
import { registerBrowserRunnerTools, BROWSER_RUNNER_TOOLS, browserRunnerDefinitionsForTest } from "../src/browser-runner-mcp.js";
import { callDevice } from "../src/device-call.js";
import { classifyExpectedMcpError } from "../src/mcp-errors.js";
import type { OAuthIdentity } from "../src/auth.js";

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

// Two families with names that cannot be confused, 10 tools in total.
assert.deepEqual([...tools.keys()].sort(), [...SHARED_TAB_TOOLS, ...BROWSER_RUNNER_TOOLS].sort());
assert.equal(tools.size, 10);
for (const name of BROWSER_RUNNER_TOOLS) {
  assert.match(tools.get(name)!.def.description + browserRunnerDefinitionsForTest[name].description, /./);
}
assert.match(tools.get("browser_runner_start")!.def.description, /shared_tab_\*/, "runner points to shared tabs");
assert.match(tools.get("shared_tab_read")!.def.description, /browser_runner_\*/, "shared tabs point to runner");
assert.equal(tools.get("browser_runner_snapshot")!.def.annotations.readOnlyHint, true);
assert.equal(tools.get("browser_runner_act")!.def.annotations.destructiveHint, true);
assert.equal(tools.get("shared_tab_click")!.def.annotations.destructiveHint, true);

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

// Device-call guards.
const row = (platform: string, allowed: string[] | null) => ({
  id: "dev", platform, allowed_tools: allowed ? JSON.stringify(allowed) : null, workspace_roots: JSON.stringify(["/home/u"]),
  sensitive_paths: null, sensitive_allow_paths: null, protect_sensitive_paths: 1, undo_enabled: 1,
});
let device = row("linux", null);
let dispatched: string[] = [];
const env = {
  DB: { prepare: () => ({ bind: () => ({ first: async () => device, run: async () => ({ meta: { changes: 1 } }), all: async () => ({ results: [] }) }) }) },
  REGISTRY: { getByName: () => ({ fetch: async (request: Request) => { const body = await request.json() as { tool: string }; dispatched.push(body.tool); return Response.json({ result: { ok: true } }); } }) },
} as never;
const owner = identity("browser:interact");

// A legacy device with no stored tool list must not get Browser Runner.
await assert.rejects(callDevice(env, owner, "dev", "browser_runner_start", {}), /disabled for this device\. Enable Browser Runner/);
device = row("linux", ["read_file"]);
await assert.rejects(callDevice(env, owner, "dev", "browser_runner_start", {}), /is disabled for this device/);
device = row("linux", ["browser_runner_start"]);
assert.deepEqual(await callDevice(env, owner, "dev", "browser_runner_start", { task_id: "t" }), { ok: true });
assert.deepEqual(dispatched, ["browser_runner_start"]);

// Wrong family: helpful redirect before any dispatch or permission noise.
dispatched = [];
device = row("browser", ["browser_runner_start"]);
const wrongRunner = await callDevice(env, owner, "dev", "browser_runner_start", {}).catch((e: Error) => e);
assert.match(String(wrongRunner), /browser extension device.*shared_tab_read/);
device = row("win32", ["browser_read_page"]);
const wrongTab = await callDevice(env, owner, "dev", "browser_read_page", {}).catch((e: Error) => e);
assert.match(String(wrongTab), /not available on this computer.*browser_runner_start/);
assert.deepEqual(dispatched, [], "wrong-family calls never reach a device");
assert.equal(classifyExpectedMcpError(wrongRunner)?.code, "WRONG_BROWSER_TOOL");
assert.equal(classifyExpectedMcpError(new Error("STALE_REF: take a new snapshot"))?.code, "STALE_REF");
assert.equal(classifyExpectedMcpError(new Error("browser protocol error. The submit k may have been sent; its effect is unknown. Do not submit again"))?.code, "UNKNOWN_EFFECT");
console.log("PASS: Browser Runner explicit opt-in, wrong-family hints and error codes");
