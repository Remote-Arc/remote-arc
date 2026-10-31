// Dashboard device management through the Worker entry: ownership, input
// validation, the Trusted Write Location rules, Local Undo, directory
// browsing, background recovery and pause/resume. The device registry is a
// recorded stub, so each test also checks what the Relay asks the device to do.
import assert from "node:assert/strict";
import { AGENT, createWorkerFixture, json } from "./worker-fixture.js";

const { sql, state, pending, call, now, addUser, sessionCookie } = createWorkerFixture();
addUser("owner"); addUser("intruder");
const owner = await sessionCookie("owner"), intruder = await sessionCookie("intruder");
sql.prepare("INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at) VALUES(?,?,?,?,?,?)")
  .run("laptop", "owner", "Laptop", "darwin", "hash-laptop", now);
const send = (path: string, cookie: string | null, method = "POST", payload?: unknown) => call(AGENT + "/api/devices/laptop" + path, {
  method,
  headers: { ...(cookie ? { cookie } : {}), ...(payload === undefined ? {} : { "content-type": "application/json" }) },
  ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
});
const device = () => sql.prepare("SELECT * FROM devices WHERE id='laptop'").get() as Record<string, any>;
const audits = () => (sql.prepare("SELECT event_type FROM audit_events WHERE device_id='laptop' ORDER BY created_at, rowid").all() as { event_type: string }[]).map((row) => row.event_type);
const expectError = async (response: Promise<Response>, status: number, error: RegExp | string) => {
  const result = await response;
  assert.equal(result.status, status);
  const body = await json(result);
  if (typeof error === "string") assert.equal(body.error, error);
  else assert.match(body.error, error);
  return body;
};

// Every management endpoint needs a session.
for (const [path, method] of [["/rename", "POST"], ["/tools", "POST"], ["/policy", "POST"], ["/revoke", "POST"], ["/undo", "GET"],
  ["/undo/a1", "POST"], ["/directories", "GET"], ["/background", "POST"], ["/runtime", "POST"]] as const) {
  assert.equal((await send(path, null, method, method === "POST" ? {} : undefined)).status, 401, path + " requires a session");
}

// Rename: trimmed, bounded, owner only.
await expectError(send("/rename", owner, "POST", { name: "   " }), 400, "name is required");
await expectError(send("/rename", intruder, "POST", { name: "Mine" }), 404, "device not found");
let body = await json(await send("/rename", owner, "POST", { name: "  " + "M".repeat(100) + "  " }));
assert.equal(body.name, "M".repeat(80));
assert.equal(device().name, "M".repeat(80));

// Tools: validated names; file mutation and terminal need a Trusted Write Location.
await expectError(send("/tools", owner, "POST", { allowed_tools: "read_file" }), 400, /must be an array/);
await expectError(send("/tools", owner, "POST", { allowed_tools: Array.from({ length: 65 }, (_, index) => "tool" + index) }), 400, /must be an array/);
body = await json(await send("/tools", owner, "POST", { allowed_tools: ["read_file", "read_file", "bad name!", 7, "list_directory"] }));
assert.deepEqual(body.allowed_tools, ["read_file", "list_directory"]);
assert.deepEqual(JSON.parse(device().allowed_tools), ["read_file", "list_directory"]);
await expectError(send("/tools", owner, "POST", { allowed_tools: ["read_file", "write_file"] }), 409, /Trusted Write Locations are required/);
await expectError(send("/tools", intruder, "POST", { allowed_tools: ["write_file"] }), 404, "device not found");
await expectError(send("/tools", intruder, "POST", { allowed_tools: ["read_file"] }), 404, "device not found");

// Policy: path lists are validated, de-duplicated and trimmed.
const policy = { workspace_roots: ["/work"], sensitive_paths: [], sensitive_allow_paths: [], protect_sensitive_paths: true, undo_enabled: true };
for (const invalid of [{ workspace_roots: "/work" }, { workspace_roots: [""] }, { sensitive_paths: ["x".repeat(501)] }, { sensitive_allow_paths: Array(33).fill("/a") }]) {
  await expectError(send("/policy", owner, "POST", { ...policy, ...invalid }), 400, /arrays of valid paths/);
}
await expectError(send("/policy", owner, "POST", { ...policy, undo_enabled: "yes" }), 400, /must be booleans/);
await expectError(send("/policy", owner, "POST", { ...policy, protect_sensitive_paths: false }), 409, /Explicit risk acknowledgement/);
await expectError(send("/policy", intruder, "POST", policy), 404, "device not found");
body = await json(await send("/policy", owner, "POST", { ...policy, workspace_roots: [" /work ", "/work", "/repo"], sensitive_paths: ["~/.ssh"] }));
assert.deepEqual(body.workspace_roots, ["/work", "/repo"]);
assert.deepEqual(JSON.parse(device().workspace_roots), ["/work", "/repo"]);
assert.deepEqual(JSON.parse(device().sensitive_paths), ["~/.ssh"]);
body = await json(await send("/tools", owner, "POST", { allowed_tools: ["read_file", "write_file", "start_process"] }));
assert.deepEqual(body.allowed_tools, ["read_file", "write_file", "start_process"], "Trusted locations unlock mutation tools");
await expectError(send("/policy", owner, "POST", { ...policy, workspace_roots: [] }), 409, /Disable file mutation and terminal tools/);
await expectError(send("/policy", intruder, "POST", { ...policy, workspace_roots: [] }), 404, "device not found");
body = await json(await send("/policy", owner, "POST", { ...policy, protect_sensitive_paths: false, acknowledge_sensitive_path_risk: true }));
assert.equal(body.protect_sensitive_paths, false);
assert.equal(device().protect_sensitive_paths, 0);

// Directory browsing asks the device without trusted-location limits, so the owner can choose one.
state.tool = (request) => Response.json({ result: { content: [{ type: "text", text: JSON.stringify({ path: request.arguments.path, entries: ["Documents"] }) }] } });
body = await json(await send("/directories", owner, "GET"));
assert.deepEqual(body, { available: true, browser: { path: "~", entries: ["Documents"] } });
let last = state.calls.at(-1)!;
assert.equal(last.tool, "browse_directories");
assert.deepEqual(last.policy.workspaceRoots, [], "Browsing is not limited to the current trusted locations");
assert.equal(last.policy.protectSensitivePaths, false);
body = await json(await call(AGENT + "/api/devices/laptop/directories?path=%2Fwork", { headers: { cookie: owner } }));
assert.equal(body.browser.path, "/work");
state.tool = () => Response.json({ error: "tool unavailable" }, { status: 404 });
body = await expectError(send("/directories", owner, "GET"), 409, "tool unavailable");
assert.equal(body.available, false);
await expectError(call(AGENT + "/api/devices/laptop/directories", { headers: { cookie: intruder } }), 404, "device not found");

// Local Undo history and restore.
state.tool = (request) => request.tool === "list_undo_actions"
  ? Response.json({ result: [{ id: "a1", path: "/work/notes.md" }] })
  : Response.json({ result: { content: [{ type: "text", text: "restored" }] } });
body = await json(await send("/undo", owner, "GET"));
assert.deepEqual(body, { available: true, actions: [{ id: "a1", path: "/work/notes.md" }] });
assert.deepEqual(state.calls.at(-1)!.arguments, { limit: 30 });
body = await json(await send("/undo/a%2F1", owner));
assert.deepEqual(body, { ok: true, result: "restored" });
last = state.calls.at(-1)!;
assert.equal(last.tool, "undo_change");
assert.deepEqual(last.arguments, { action_id: "a/1" });
state.tool = () => Response.json({ error: "conflict detected" }, { status: 409 });
await expectError(send("/undo/a1", owner), 409, "conflict detected");
await expectError(send("/undo", owner, "GET"), 409, "conflict detected");
// A computer that does not answer is a device problem, not a Relay outage.
state.tool = () => Response.json({ error: "device call timed out" }, { status: 504 });
await expectError(send("/undo/a1", owner), 504, "device call timed out");
await Promise.all(pending);
const timedOut = sql.prepare("SELECT severity, status_code, path FROM service_incidents ORDER BY created_at DESC LIMIT 1").get() as { severity: string; status_code: number; path: string };
assert.deepEqual({ ...timedOut }, { severity: "warning", status_code: 504, path: "/api/devices/:redacted" }, "Device timeouts are recorded as warnings");
sql.prepare("UPDATE devices SET undo_enabled=0 WHERE id='laptop'").run();
await expectError(send("/undo/a1", owner), 409, "Local Undo is disabled");
await expectError(send("/undo/a1", intruder), 404, "device not found");
await expectError(send("/undo", intruder, "GET"), 404, "device not found");

// Background recovery.
await expectError(send("/background", owner, "POST", { enabled: "yes" }), 400, /must be a boolean/);
await expectError(send("/background", owner, "POST", { enabled: true, stop_current: true }), 400, /Cannot stop an Agent while enabling/);
await expectError(send("/background", owner, "POST", { enabled: false, stop_current: true }), 409, "device offline");
state.online = [{ id: "laptop", status: "online", tools: [], capabilities: [] }];
await expectError(send("/background", owner, "POST", { enabled: false, stop_current: true }), 409, /Agent upgrade required/);
state.tool = () => Response.json({ result: { enabled: true, service: "launchd" } });
body = await json(await send("/background", owner, "POST", { enabled: true }));
assert.deepEqual(body, { ok: true, enabled: true, status: { enabled: true, service: "launchd" } });
assert.equal(device().background_enabled, 1);
assert.equal(device().background_service, "launchd");
state.tool = () => Response.json({ result: { enabled: true, detail: "launchctl refused" } });
body = await expectError(send("/background", owner, "POST", { enabled: false }), 409, "launchctl refused");
assert.equal(body.enabled, true, "The Relay records what the device actually reports");
state.tool = () => Response.json({ result: "unexpected" });
assert.equal((await json(await send("/background", owner, "POST", { enabled: false }))).enabled, false);
state.online = [{ id: "laptop", status: "online", tools: [], capabilities: ["device_stop_v1"] }];
state.tool = () => Response.json({ result: { enabled: false } });
assert.equal((await send("/background", owner, "POST", { enabled: false, stop_current: true })).status, 200);
assert.deepEqual(state.calls.at(-1)!.arguments, { enabled: false, stop_current: true });
state.tool = () => Response.json({ error: "denied" }, { status: 403 });
await expectError(send("/background", owner, "POST", { enabled: true }), 409, "denied");
await expectError(send("/background", intruder, "POST", { enabled: true }), 404, "device not found");

// Pause / resume needs an online, upgraded Agent with active recovery.
await expectError(send("/runtime", owner, "POST", { paused: 1 }), 400, /must be a boolean/);
state.online = [];
await expectError(send("/runtime", owner, "POST", { paused: true }), 409, "device offline");
await expectError(send("/runtime", intruder, "POST", { paused: true }), 404, "device not found");
state.online = [{ id: "laptop", status: "online", tools: [], capabilities: [] }];
await expectError(send("/runtime", owner, "POST", { paused: true }), 409, /Upgrade the native Agent/);
state.online = [{ id: "laptop", status: "online", tools: [], capabilities: ["device_pause_v1"], recovery_enabled: true }];
await expectError(send("/runtime", owner, "POST", { paused: true }), 409, /Enable active background recovery/);
state.online = [{ id: "laptop", status: "online", tools: [], capabilities: ["device_pause_v1"], recovery_enabled: true, background_guard_active: true }];
state.tool = () => Response.json({ result: { accepted: true } });
assert.deepEqual(await json(await send("/runtime", owner, "POST", { paused: true })), { ok: true, paused: true, confirmed: false });
assert.equal(state.calls.at(-1)!.tool, "set_device_runtime");
state.online = [{ ...state.online[0], execution_paused: true }];
const calls = state.calls.length;
assert.deepEqual(await json(await send("/runtime", owner, "POST", { paused: true })), { ok: true, paused: true, confirmed: true });
assert.equal(state.calls.length, calls, "An already-applied state is confirmed without a device call");
state.tool = () => Response.json({ error: "busy" }, { status: 503 });
await expectError(send("/runtime", owner, "POST", { paused: false }), 503, "busy");

// Revoke ends the pairing; nothing else can then manage the device.
await expectError(send("/revoke", intruder), 404, "device not found");
assert.equal((await send("/revoke", owner)).status, 200);
assert.ok(device().revoked_at);
await expectError(send("/revoke", owner), 404, "device not found");
await expectError(send("/rename", owner, "POST", { name: "Again" }), 404, "device not found");

assert.deepEqual(audits().filter((event, index, all) => all.indexOf(event) === index), [
  "device.renamed", "device.tools_updated", "device.policy_updated", "device.undo_restored", "device.background_enabled",
  "device.background_update_failed", "device.background_disabled", "device.agent_stop_requested", "device.agent_pause_requested", "device.revoked",
]);
await Promise.all(pending);
sql.close();
console.log("PASS: device management ownership, validation, Trusted Write Locations, directory browsing, Local Undo, background recovery, pause/resume and revoke");
