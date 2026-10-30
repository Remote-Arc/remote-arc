// Real relay functions + real SQLite SQL, using an in-memory D1 adapter and
// authenticated device transport stub. No model, cloud or GitHub effects.
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { EventEmitter } from "node:events";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const relay = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(path.join(relay, "package.json"))("typescript");
const compiled = fs.mkdtempSync(path.join(os.tmpdir(), "remote-arc-goal-test-"));
fs.writeFileSync(path.join(compiled, "package.json"), '{"type":"module"}');
// Newly imported relay modules also use runtime dependencies (for example Zod).
// Resolve the installed dependencies for the entire compiled module graph.
fs.symlinkSync(path.join(relay, "node_modules"), path.join(compiled, "node_modules"), "junction");
const protocolSource = fs.readFileSync(
  path.resolve(relay, "../../packages/protocol/src/index.ts"),
  "utf8",
);
fs.writeFileSync(
  path.join(compiled, "protocol.js"),
  ts.transpileModule(protocolSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText,
);
// Keep real shared cloud definitions and follow-up templates inside the
// fixture root; their repository-relative paths are invalid after transpiling.
const sharedModules = [
  ["skills/src/community.generated", "community-skills"],
  ["skills/src/catalog.generated", "cloud-skill-catalog"],
  ["skills/src/media-resources.generated", "media-resources"],
  ["skills/src/library", "skill-library"],
  ["protocol/src/followup-templates", "followup-templates"],
];
for (const [source, target] of sharedModules) {
  let input=fs.readFileSync(path.resolve(relay, "../../packages/" + source + ".ts"), "utf8");
  for(const [dependency,local] of sharedModules)input=input.replaceAll("./"+path.basename(dependency)+".js","./"+local+".js");
  fs.writeFileSync(path.join(compiled, target + ".js"), ts.transpileModule(
    input,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } },
  ).outputText);
}
for (const name of fs.readdirSync(path.join(relay, "src")).filter(n => n.endsWith(".ts"))) {
  let input = fs.readFileSync(path.join(relay, "src", name), "utf8");
  input = input.replaceAll('from "@remotearc/protocol"', 'from "./protocol.js"');
  for (const [source, target] of sharedModules) {
    input = input.replaceAll("../../../packages/" + source + ".js", "./" + target + ".js");
  }
  if (name === "mcp.ts") for (const packageName of ["@modelcontextprotocol/server", "zod"]) {
    input = input.replace('from "' + packageName + '"', 'from "' + pathToFileURL(createRequire(path.join(relay, "package.json")).resolve(packageName)).href + '"');
  }
  const js = ts.transpileModule(input, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  fs.writeFileSync(path.join(compiled, name.replace(/\.ts$/, ".js")), js);
}
const importSource = name => import(pathToFileURL(path.join(compiled, name + ".js")).href);

try {
  const runtime = await importSource("automations");
  const store = await importSource("automation-store");
  const source = await importSource("source-goals");
  const events = await importSource("task-events");
  const settings = await importSource("device-task-settings");
  const fileResources = await importSource("file-resources");
  const authModule = await importSource("auth");
  const entitlements = await importSource("entitlements");
  const planAdmin = await importSource("plan-admin");
  const billing = await importSource("billing-ledger");
  const sqlite = new DatabaseSync(":memory:");
  for (const name of fs.readdirSync(path.join(relay, "migrations")).filter(n => n.endsWith(".sql")).sort()) {
    sqlite.exec(fs.readFileSync(path.join(relay, "migrations", name), "utf8"));
  }
  const db = {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      const bound = args => ({
        async first() { return stmt.get(...args) || null; },
        async all() { return { results: stmt.all(...args) }; },
        async run() { const r = stmt.run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
        runSync() { const r = stmt.run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
      });
      return { ...bound([]), bind(...args) { assert(!args.includes(undefined)); return bound(args); } };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try { const results = statements.map(s => s.runSync()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  const now = new Date().toISOString();
  sqlite.prepare("INSERT INTO users(id,google_sub,email,created_at,plan) VALUES(?,?,?,?,\'plus\')").run("owner", "test-owner", "owner@test.invalid", now);
  const tools = ["read_file", "read_binary_file", "edit_block", "write_file", "start_process", "process_status", "process_output", "stop_process"];
  sqlite.prepare("INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at,allowed_tools,workspace_roots) VALUES(?,?,?,?,?,?,?,?)")
    .run("device", "owner", "Test device", "linux", "fixture-hash", now, JSON.stringify(tools), JSON.stringify(["/workspace"]));
  sqlite.prepare("UPDATE devices SET automation_permissions = ? WHERE id = 'device'").run(JSON.stringify({
    background_tasks: true, scheduled_tasks: true, adaptive_agent: true, source_agent: true, keep_awake: false,
  }));
  let calls = [], processCounter = 0, keepAwakeSeconds = [];
  const binaryFixture = Buffer.from([0, 1, 2, 3]);
  let binaryRevision = "binary-rev-1";
  let deviceHandler = body => {
    calls.push(body.tool);
    if (body.tool === "start_process") return { process_id: "process-" + (++processCounter) };
    if (body.tool === "process_status") return { status: "completed", exit_code: 0 };
    if (body.tool === "process_output") return { stdout: "PASS: acceptance check", stderr: "" };
    if (body.tool === "read_file") return "implementation contents";
    if (body.tool === "read_binary_file") {
      if (body.arguments.expected_revision && body.arguments.expected_revision !== binaryRevision) {
        throw new Error("FILE_CHANGED_DURING_READ: fixture revision changed");
      }
      const offset = Number(body.arguments.offset || 0);
      const length = Math.max(1, Number(body.arguments.length || 65536));
      const chunk = binaryFixture.subarray(offset, Math.min(binaryFixture.length, offset + length));
      return {
        path: body.arguments.path,
        mime_type: "image/png",
        encoding: "base64",
        size: binaryFixture.length,
        file_revision: binaryRevision,
        offset,
        bytes_read: chunk.length,
        eof: offset + chunk.length >= binaryFixture.length,
        chunk_sha256: "fixture",
        data: chunk.toString("base64"),
      };
    }
    if (body.tool === "set_task_keep_awake") {
      keepAwakeSeconds.push(Number(body.arguments.seconds));
      return { supported: true, active: Number(body.arguments.seconds) > 0 };
    }
    return { ok: true };
  };
  const env = { DB: db, PUBLIC_ORIGIN: "https://relay.test.invalid", REGISTRY: { getByName() { return {
    async fetch(request) { return Response.json({ result: await deviceHandler(await request.json()) }); },
  }; } } };
  const identity = { userId: "owner", clientId: "source-client", scope: "automation:read automation:write agent:write computer:read", resource: env.PUBLIC_ORIGIN + "/mcp" };
  const create = async (name, extra = {}) => (await runtime.createAutomation(env, "owner", { name, kind: "agent_goal", device_id: "device", agent_goal: {
    controller: "source", controller_client_id: identity.clientId, objective: "Fix the implementation", success_criteria: "Acceptance check passes",
    allowed_tools: ["read_file", "edit_block", "start_process"], verify_command: "verify", max_iterations: 20,
  }, ...extra })).automation.id;
  const get = id => runtime.getAutomation(env, "owner", id);
  const tick = async id => { sqlite.prepare("UPDATE automations SET next_run_at = ? WHERE id = ? AND status != 'waiting_for_event'").run(new Date().toISOString(), id); await runtime.runAutomationTick(env); };
  const decision = (kind, tool = "none", args = {}, evidence = "") => ({ decision: kind, tool, arguments_json: JSON.stringify(args), decision_summary: "Next bounded action", memory: "Factual checkpoint", completion_evidence: evidence });

  const downgradeFenceId = await create("Plan downgrade fence");
  await runtime.pauseAutomation(env, "owner", downgradeFenceId);
  sqlite.prepare("UPDATE users SET plan = 'free' WHERE id = 'owner'").run();
  const freeGoalId = await create("Free source Agent Goal");
  await runtime.cancelAutomation(env, "owner", freeGoalId);
  await runtime.resumeAutomation(env, "owner", downgradeFenceId);
  assert.notEqual((await get(downgradeFenceId)).status, "paused", "Free retains source-goal resume access");
  sqlite.prepare("UPDATE users SET plan = 'plus' WHERE id = 'owner'").run();
  await runtime.cancelAutomation(env, "owner", downgradeFenceId);

  // Changing to Free retains Connect task and keep-awake capabilities.
  sqlite.prepare("UPDATE devices SET automation_permissions = json_set(automation_permissions, '$.keep_awake', json('true')) WHERE id = 'device'").run();
  const keepAwakeTaskId = await create("Keep-awake downgrade fence", { keep_awake: true });
  sqlite.prepare(`UPDATE automations
    SET status = 'waiting_for_event',
        next_run_at = NULL,
        state_json = json_set(COALESCE(state_json, '{}'), '$.run_id', 'lease-run')
    WHERE id = ?`).run(keepAwakeTaskId);
  await runtime.runAutomationTick(env);
  assert.equal(keepAwakeSeconds.at(-1), 180, "Plus task should renew its keep-awake lease");
  sqlite.prepare("UPDATE users SET plan = 'free' WHERE id = 'owner'").run();
  await runtime.runAutomationTick(env);
  assert.equal((await get(keepAwakeTaskId)).status, "waiting_for_event", "Free must retain the saved source task");
  assert.equal(keepAwakeSeconds.at(-1), 180, "Free retains an explicitly authorized keep-awake lease");
  sqlite.prepare("UPDATE users SET plan = 'plus' WHERE id = 'owner'").run();
  await runtime.cancelAutomation(env, "owner", keepAwakeTaskId);

  const sourceCallsStart = calls.length;
  const taskId = await create("Source protocol");
  await tick(taskId);
  let context = await source.getGoalContext(db, "owner", taskId);
  assert(context.ready_for_decision);
  assert.equal(context.controller, "source");
  assert.equal(calls.length, sourceCallsStart);
  const read = decision("tool", "read_file", { path: "/workspace/app.ts", length: 200 });
  const concurrent = await Promise.all([
    source.submitGoalDecision(db, identity, taskId, context.revision, "read-1", read),
    source.submitGoalDecision(db, identity, taskId, context.revision, "read-1", decision("tool", "read_file", { length: 200, path: "/workspace/app.ts" })),
  ]);
  assert.equal(concurrent.filter(result => result.duplicate).length, 1, "Concurrent retry must acknowledge the same decision despite argument key order");
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM automation_decisions WHERE automation_id = ?").get(taskId).n, 1);
  await assert.rejects(source.submitGoalDecision(db, identity, taskId, context.revision, "read-1", decision("tool", "read_file", { path: "/workspace/different.ts" })), /different decision/);
  assert((await source.submitGoalDecision(db, identity, taskId, context.revision, "read-1", read)).duplicate);
  await assert.rejects(source.submitGoalDecision(db, identity, taskId, context.revision, "stale", read), /revision/);
  await tick(taskId);
  context = await source.getGoalContext(db, "owner", taskId);
  assert(context.ready_for_decision && context.latest_observation.includes("implementation contents"));
  assert.equal(calls.filter(t => t === "read_file").length, 1);
  await assert.rejects(source.getGoalContext(db, "stranger", taskId), /not found/);
  await assert.rejects(source.submitGoalDecision(db, { ...identity, clientId: "other-client" }, taskId, context.revision, "other", read), /another source client/);
  await assert.rejects(source.submitGoalDecision(db, identity, taskId, context.revision, "no-evidence", decision("complete")), /evidence/);
  await source.submitGoalDecision(db, identity, taskId, context.revision, "finish", decision("complete", "none", {}, "Implementation inspected; acceptance is ready."));
  await tick(taskId);
  assert.equal((await get(taskId)).status, "running", "Completion must wait for verifier");
  await tick(taskId);
  assert.equal((await get(taskId)).status, "completed");
  const accountedRun = sqlite.prepare("SELECT usage_accounted_at FROM automation_runs WHERE automation_id = ? ORDER BY started_at DESC LIMIT 1").get(taskId);
  assert(accountedRun?.usage_accounted_at, "Completed automation run must atomically account runtime usage");
  context = await source.getGoalContext(db, "owner", taskId);
  assert(context.completion_evidence.includes("verification succeeded"));
  assert(context.journal.some(e => e.event === "needs_agent"));
  assert(context.journal.some(e => e.event === "run_completed"));

  const cancelledId = await create("Cancel race");
  sqlite.prepare("UPDATE automations SET lease_token = 'old', lease_until = ?, status = 'running' WHERE id = ?")
    .run(new Date(Date.now() + 150000).toISOString(), cancelledId);
  const stale = await get(cancelledId);
  await runtime.cancelAutomation(env, "owner", cancelledId);
  await assert.rejects(store.checkpointTask(db, stale, {}, "running", now, null), store.LeaseLostError);
  assert.equal((await get(cancelledId)).status, "cancelled");
  const takeoverId = await create("Lease takeover");
  sqlite.prepare("UPDATE automations SET lease_token = 'old', lease_until = ?,status = 'running' WHERE id = ?")
    .run(new Date(Date.now() + 150000).toISOString(), takeoverId);
  const oldWorker = await get(takeoverId);
  sqlite.prepare("UPDATE automations SET lease_token = 'new' WHERE id = ?").run(takeoverId);
  await assert.rejects(store.checkpointTask(db, oldWorker, {}, "running", now, null), store.LeaseLostError);
  assert.equal((await get(takeoverId)).lease_token, "new");
  await runtime.cancelAutomation(env, "owner", takeoverId);

  const uncertainId = await create("Unknown effect");
  sqlite.prepare("UPDATE automations SET state_json = ? WHERE id = ?")
    .run(JSON.stringify({ phase: "idle", inflight_action: { id: "crashed", tool: "start_process" }, agent: { iteration: 1, memory: "", observation: "" } }), uncertainId);
  const before = calls.length;
  await tick(uncertainId);
  assert.equal(calls.length, before);
  assert((await source.getGoalContext(db, "owner", uncertainId)).latest_observation.includes("unknown outcome"));
  await runtime.cancelAutomation(env, "owner", uncertainId);

  const lateId = await create("Late process");
  await tick(lateId);
  context = await source.getGoalContext(db, "owner", lateId);
  await source.submitGoalDecision(db, identity, lateId, context.revision, "start", decision("tool", "start_process", { command: "slow" }));
  const normalHandler = deviceHandler;
  deviceHandler = async body => { if (body.tool === "start_process") await runtime.cancelAutomation(env, "owner", lateId); return normalHandler(body); };
  await tick(lateId);
  deviceHandler = normalHandler;
  assert.equal((await get(lateId)).status, "cancelled");
  assert.equal(calls.at(-1), "stop_process");

  const future = new Date(Date.now() + 3600000).toISOString();
  const scheduledId = await create("Future goal", { schedule: { at: future } });
  await runtime.runAutomationTick(env);
  assert.equal((await get(scheduledId)).next_run_at, future);
  assert.equal((await source.getGoalContext(db, "owner", scheduledId)).ready_for_decision, false);

  const recurringId = await create("Recurring source", { schedule: { every_seconds: 60 }, max_runs: 2 });
  await tick(recurringId);
  context = await source.getGoalContext(db, "owner", recurringId);
  await source.submitGoalDecision(db, identity, recurringId, context.revision, "recurring-finish-1", decision("complete", "none", {}, "Ready for verifier"));
  await tick(recurringId); await tick(recurringId);
  let recurring = await get(recurringId);
  assert.equal(recurring.run_count, 1);
  assert.equal(recurring.status, "waiting");
  assert(Date.parse(recurring.next_run_at) > Date.now());
  assert.equal(JSON.parse(recurring.state_json).agent.iteration, 0);
  await tick(recurringId);
  context = await source.getGoalContext(db, "owner", recurringId);
  await source.submitGoalDecision(db, identity, recurringId, context.revision, "recurring-finish-2", decision("complete", "none", {}, "Second independent run ready"));
  await tick(recurringId); await tick(recurringId);
  assert.equal((await get(recurringId)).status, "completed");
  assert.equal((await runtime.listAutomationRuns(env, "owner", recurringId)).length, 2);

  // Failed deterministic verification is an observation for a new decision.
  const failedCheckId = await create("Failed verification");
  await tick(failedCheckId);
  context = await source.getGoalContext(db, "owner", failedCheckId);
  await source.submitGoalDecision(db, identity, failedCheckId, context.revision, "failed-check", decision("complete", "none", {}, "Run the acceptance check"));
  await tick(failedCheckId);
  deviceHandler = body => body.tool === "process_status" ? { status: "completed", exit_code: 1 } : normalHandler(body);
  await tick(failedCheckId); deviceHandler = normalHandler;
  context = await source.getGoalContext(db, "owner", failedCheckId);
  assert(context.ready_for_decision && context.latest_observation.includes("exit code 1"));
  await runtime.cancelAutomation(env, "owner", failedCheckId);

  const hostedGoal = { controller: "hosted", objective: "Check the result", success_criteria: "Evidence available", allowed_tools: ["read_file"], max_iterations: 10 };
  let providerCalls = 0;
  sqlite.prepare("INSERT INTO users(id,google_sub,email,role,created_at) VALUES(?,?,?,'admin',?)").run("billing-admin","billing-admin","billing-admin@test.invalid",now);
  for(const [scope_type,scope_id] of [["global","platform"],["organization","personal:owner"],["user","owner"]])
    for(const [metric,limit] of [["credits",100],["neurons",9000]])
      await billing.setBillingLimit(db,"billing-admin",{scope_type,scope_id,lane:"arc_hosted",metric,period_key:now.slice(0,10),limit});
  await billing.configureFreeAiPool(db,"billing-admin",{id:"fixture-pool",period:now.slice(0,10),mode:"dedicated_account",managedPoolAssertion:true,freeNeurons:10000,outsideUsedNeurons:1000});
  sqlite.exec(`CREATE TRIGGER fixture_hosted_task_budget AFTER INSERT ON automations BEGIN
    INSERT INTO billing_budgets(scope_type,scope_id,lane,metric,period_key,limit_units,updated_at)
    VALUES('task',NEW.id,'arc_hosted','credits',substr(NEW.created_at,1,10),50,NEW.created_at),
    ('task',NEW.id,'arc_hosted','neurons',substr(NEW.created_at,1,10),9000,NEW.created_at); END;`);
  env.MODEL_GATEWAY_ENABLED="1";env.MODEL_GATEWAY_FREE_POOL_ID="fixture-pool";
  env.AI = { async run() { if (++providerCalls === 1) throw new Error("temporary upstream failure"); return { response: decision("complete", "none", {}, "Inspection evidence available"),usage:{prompt_tokens:20,completion_tokens:10} }; } };
  const retryId = await create("Provider retry", { agent_goal: hostedGoal });
  await tick(retryId);
  assert.equal((await get(retryId)).status, "failed","Unknown inference must stop instead of silently spending again");
  await tick(retryId);
  assert.equal(providerCalls,1,"A transport failure keeps its reservation and cannot retry inference");
  assert.equal(sqlite.prepare("SELECT status FROM billing_reservations WHERE task_id=?").get(retryId).status,"unknown");
  const healthyId=await create("Authorized fresh hosted task",{agent_goal:hostedGoal});
  await tick(healthyId);
  assert.equal((await get(healthyId)).status,"completed");
  const pausedId = await create("Pause during planner", { agent_goal: hostedGoal });
  env.AI = { async run() { await runtime.pauseAutomation(env, "owner", pausedId); return { response: decision("tool", "read_file", { path: "/workspace/app.ts" }),usage:{prompt_tokens:20,completion_tokens:10} }; } };
  const beforePause = calls.length;
  await tick(pausedId);
  assert.equal((await get(pausedId)).status, "paused");
  assert.equal(calls.length, beforePause);
  await runtime.cancelAutomation(env, "owner", pausedId);
  delete env.AI;delete env.MODEL_GATEWAY_ENABLED;delete env.MODEL_GATEWAY_FREE_POOL_ID;

  // Account-authenticated device switches cancel only affected modes.
  const sessionToken = "test-only-session";
  sqlite.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)")
    .run(createHash("sha256").update(sessionToken).digest("hex"), "owner", new Date(Date.now() + 3600000).toISOString(), now);
  const permissions = { background_tasks: true, scheduled_tasks: true, adaptive_agent: true, source_agent: true, keep_awake: false };
  const switchRequest = (body, id = "device") => new Request(env.PUBLIC_ORIGIN + "/api/devices/" + id + "/task-permissions", {
    method: "POST", headers: { cookie: "rl_session=" + sessionToken, "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const stopped = await settings.handleDeviceTaskSettings(switchRequest({ ...permissions, source_agent: false }), env);
  assert(stopped.ok);
  assert.equal((await get(scheduledId)).status, "cancelled");
  await assert.rejects(create("Disallowed source"), /disabled/);
  assert.equal((await settings.handleDeviceTaskSettings(switchRequest(permissions, "foreign-device"), env)).status, 404);
  assert((await settings.handleDeviceTaskSettings(switchRequest(permissions), env)).ok);

  // Secure callbacks are required and use standard HMAC signatures. Retry
  // keeps the delivery ID; unsubscribe and grant revocation stop delivery.
  const eventTask = await create("Event source");
  const signingSecret = "whsec_" + Buffer.alloc(32, 7).toString("base64");
  let appRequests = [], callbackCalls = 0, callbackFailure = true;
  const eventEnv = { ...env, MCP_EVENT_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"), MCP_EVENT_EGRESS: { async fetch(request) {
    callbackCalls++;
    const body = await request.text(), payload = JSON.parse(body);
    const id = request.headers.get("webhook-id"), timestamp = request.headers.get("webhook-timestamp");
    const signature = "v1," + createHmac("sha256", Buffer.from(signingSecret.slice(6), "base64")).update(id + "." + timestamp + "." + body).digest("base64");
    assert(request.headers.get("webhook-signature").split(" ").includes(signature));
    assert.equal(request.redirect, "error");
    if (payload.type === "verification") return Response.json({ challenge: payload.challenge });
    assert.equal(id, payload.eventId);
    appRequests.push(payload);
    return new Response(null, { status: callbackFailure ? 503 : 204 });
  } } };
  const subscribeParams = { name: "automation.updated", arguments: { automation_id: eventTask }, delivery: { mode: "webhook", url: "https://callbacks.example.com/task", secret: signingSecret } };
  const rpc = async (method, params, who = identity, targetEnv = eventEnv) => {
    const request = new Request(env.PUBLIC_ORIGIN + "/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    return (await events.handleTaskEventRpc(request, targetEnv, who)).json();
  };
  assert.equal((await rpc("events/list", {}, null)).error.code, -32001);
  assert(!("events" in (await rpc("server/discover", {}, null, env)).result.capabilities));
  const callbackBefore = callbackCalls;
  assert((await rpc("events/subscribe", { ...subscribeParams, delivery: { ...subscribeParams.delivery, url: "https://127.0.0.1/private" } })).error);
  assert.equal(callbackCalls, callbackBefore);
  assert((await rpc("events/subscribe", subscribeParams, { ...identity, userId: "foreign-user" })).error);
  const subscription = (await rpc("events/subscribe", subscribeParams)).result;
  assert(subscription.id);
  assert.equal((await rpc("events/subscribe", subscribeParams)).result.id, subscription.id);
  assert(!sqlite.prepare("SELECT secret_ciphertext FROM task_event_subscriptions WHERE id = ?").get(subscription.id).secret_ciphertext.includes(signingSecret));
  sqlite.prepare("INSERT INTO oauth_tokens(access_token_hash,client_id,user_id,resource,scope,expires_at,created_at) VALUES(?,?,?,?,?,?,?)")
    .run("test-access-hash", identity.clientId, "owner", identity.resource, identity.scope, new Date(Date.now() + 3600000).toISOString(), now);
  await tick(eventTask);
  assert.equal((await events.deliverTaskEvents(eventEnv)).delivered, 0);
  assert.equal(appRequests.length, 1);
  callbackFailure = false;
  sqlite.prepare("UPDATE task_event_deliveries SET next_attempt_at = ?").run(new Date().toISOString());
  assert.equal((await events.deliverTaskEvents(eventEnv)).delivered, 1);
  assert.equal(appRequests.length, 2);
  assert.equal(appRequests[0].eventId, appRequests[1].eventId);
  assert.equal(appRequests[1].data.event, "needs_agent");
  await rpc("events/unsubscribe", subscribeParams);
  assert.equal(sqlite.prepare("SELECT active FROM task_event_subscriptions WHERE id = ?").get(subscription.id).active, 0);
  await rpc("events/subscribe", subscribeParams);
  sqlite.prepare("UPDATE oauth_tokens SET revoked_at = ? WHERE client_id = ?").run(new Date().toISOString(), identity.clientId);
  const beforeRevocation = callbackCalls;
  await events.deliverTaskEvents(eventEnv);
  assert.equal(callbackCalls, beforeRevocation);
  assert.equal(sqlite.prepare("SELECT active FROM task_event_subscriptions WHERE id = ?").get(subscription.id).active, 0);

  // Power leases are bounded, shared and cleaned up without changing OS policy.
  const deviceCalls = await importSource("device-call");
  sqlite.prepare("UPDATE devices SET automation_permissions = json_set(automation_permissions, '$.keep_awake', json('false')) WHERE id = 'device'").run();
  await assert.rejects(deviceCalls.callDevice(env, identity, "device", "set_task_keep_awake", { task_id: taskId, seconds: 180 }), /disabled/);
  await deviceCalls.callDevice(env, identity, "device", "set_task_keep_awake", { task_id: taskId, seconds: 0 });
  assert.equal(calls.at(-1), "set_task_keep_awake", "Revoked power permission must still allow releasing an existing lease");
  const powerFile = path.join(relay, "../../packages/cli/src/keep-awake.ts");
  fs.writeFileSync(path.join(compiled, "keep-awake.js"), ts.transpileModule(fs.readFileSync(powerFile, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
  const power = await importSource("keep-awake");
  let clock = 1000, launches = [];
  const manager = power.createTaskKeepAwakeManager({ platform: "win32", now: () => clock, spawn(command, args, options) {
    const child = new EventEmitter(); child.kill = () => { child.killed = true; child.emit("exit", null); };
    launches.push({ command, args, options, child }); queueMicrotask(() => child.emit("spawn")); return child;
  } });
  assert((await manager.set("task-1", 180)).active);
  assert((await manager.set("task-2", 180)).active);
  assert.equal(launches.length, 1);
  assert(launches[0].options.windowsHide && launches[0].args.includes("Hidden"));
  assert((await manager.set("task-1", 0)).active);
  clock += 181000;
  assert(!manager.status().active);
  assert(launches[0].child.killed);
  manager.close();

  // Exercise actual MCP SDK registration/HTTP dispatch, not only helpers.
  const mcp = await importSource("mcp");
  let schedulerKicks = 0;
  const callMcp = async (method, params, who = identity) => {
    const handler = mcp.createRemoteLinkMcp(env, who, {
      kickScheduler: () => { schedulerKicks++; },
    });
    const response = await handler.fetch(new Request(env.PUBLIC_ORIGIN + "/mcp", { method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }));
    const text = await response.text();
    assert(response.ok, text);
    const payload = JSON.parse(text.trim().startsWith("{") ? text : text.split("\n").find(line => line.startsWith("data: ")).slice(6));
    assert(!payload.error, JSON.stringify(payload));
    return payload.result;
  };
  const toolList = await callMcp("tools/list", {});
  assert(toolList.tools.some(tool => tool.name === "get_goal_context"));
  const createGoalTool = toolList.tools.find(tool => tool.name === "create_agent_goal");
  const submitGoalTool = toolList.tools.find(tool => tool.name === "submit_goal_decision");
  assert(createGoalTool?.securitySchemes);
  assert(submitGoalTool?.securitySchemes);
  assert.deepEqual(createGoalTool.securitySchemes[0].scopes, ["automation:write", "agent:write"]);
  assert.deepEqual(submitGoalTool.securitySchemes[0].scopes, ["automation:write", "agent:write"]);
  assert(toolList.tools.some(tool => tool.name === "read_binary_file"));

  const authProbeGoal = {
    name: "OAuth scope probe",
    device_id: "device",
    controller: "source",
    objective: "Inspect file",
    success_criteria: "File inspected",
    allowed_tools: ["read_file"],
  };
  for (const partialScope of ["automation:write", "agent:write"]) {
    const denied = await callMcp(
      "tools/call",
      { name: "create_agent_goal", arguments: authProbeGoal },
      { ...identity, scope: partialScope },
    );
    assert(denied.isError, `create_agent_goal must reject partial scope ${partialScope}`);
    const challenge = denied._meta?.["mcp/www_authenticate"]?.[0] || "";
    assert.deepEqual(
      new Set(/scope="([^"]+)"/.exec(challenge)?.[1].split(/\s+/) || []),
      new Set(["automation:write", "agent:write", "offline_access"]),
      `create_agent_goal must challenge the full scope set, got: ${challenge}`,
    );
  }
  const deniedDecisionScope = await callMcp(
    "tools/call",
    {
      name: "submit_goal_decision",
      arguments: {
        automation_id: "missing",
        expected_revision: 0,
        idempotency_key: "scope-probe",
        decision: "pause",
        tool: "none",
        decision_summary: "Scope probe",
      },
    },
    { ...identity, scope: "agent:write" },
  );
  assert(deniedDecisionScope.isError);
  assert.deepEqual(
    new Set(/scope="([^"]+)"/.exec(deniedDecisionScope._meta?.["mcp/www_authenticate"]?.[0] || "")?.[1].split(/\s+/) || []),
    new Set(["automation:write", "agent:write", "offline_access"]),
    "submit_goal_decision must challenge the full scope set",
  );

  const usageCount = () => Number(
    sqlite.prepare("SELECT COALESCE(SUM(tool_calls), 0) AS n FROM user_monthly_usage WHERE user_id = ?").get("owner").n,
  );

  // Every Connect task mode is available to Free through the actual MCP boundary.
  sqlite.prepare("UPDATE users SET plan = 'free' WHERE id = 'owner'").run();
  for (const input of [
    { name: "Free long task", kind: "long_task", command: "true" },
    { name: "Free schedule", kind: "schedule_watch", command: "true", schedule: { every_seconds: 60 } },
    { name: "Free condition", kind: "condition_watch", command: "true", condition: { source: "generic", event: "check" } },
    { name: "Free verification loop", kind: "goal_loop", command: "true", goal: { command: "true", cwd: "/workspace" } },
  ]) {
    const createdFree = await callMcp("tools/call", { name: "create_automation", arguments: {
      ...input, device_id: "device", cwd: "/workspace", max_runs: 1, recovery: "fail",
    } });
    const createdFreeId = JSON.parse(createdFree.content[0].text).automation?.id;
    assert(createdFreeId, JSON.stringify(createdFree));
    for (const action of ["pause", "resume", "cancel"]) {
      const managedFree = await callMcp("tools/call", { name: "manage_automation", arguments: {
        automation_id: createdFreeId, action,
      } });
      assert.equal(JSON.parse(managedFree.content[0].text).status, action === "pause" ? "paused" : action === "cancel" ? "cancelled" : JSON.parse(createdFree.content[0].text).automation.status);
    }
  }
  const freeGoalMcp = await callMcp("tools/call", { name: "create_agent_goal", arguments: {
    name: "Free source goal through MCP", device_id: "device", controller: "source",
    objective: "Inspect file", success_criteria: "File inspected", allowed_tools: ["read_file"],
    task_version: 1,
  } });
  const freeGoalMcpId = JSON.parse(freeGoalMcp.content[0].text).automation?.id;
  assert(freeGoalMcpId, JSON.stringify(freeGoalMcp));
  const freeGoalContext = await callMcp("tools/call", { name: "get_goal_context", arguments: { automation_id: freeGoalMcpId } });
  assert.equal(JSON.parse(freeGoalContext.content[0].text).controller, "source");
  const freeReadDecision = await callMcp("tools/call", { name: "submit_goal_decision", arguments: {
    automation_id: freeGoalMcpId, expected_revision: JSON.parse(freeGoalContext.content[0].text).revision,
    idempotency_key: "free-source-read", decision: "tool", tool: "read_file",
    arguments_json: JSON.stringify({ path: "/workspace/app.ts" }), decision_summary: "Inspect the approved file",
  } });
  assert.equal(JSON.parse(freeReadDecision.content[0].text).accepted, true);
  await tick(freeGoalMcpId);
  const freeReadContext = await source.getGoalContext(db, "owner", freeGoalMcpId);
  assert(freeReadContext.latest_observation.includes("implementation contents"));
  const freeCompleteDecision = await callMcp("tools/call", { name: "submit_goal_decision", arguments: {
    automation_id: freeGoalMcpId, expected_revision: freeReadContext.revision,
    idempotency_key: "free-source-complete", decision: "complete", tool: "none",
    decision_summary: "Approved file inspected", completion_evidence: "read_file returned implementation contents",
  } });
  assert.equal(JSON.parse(freeCompleteDecision.content[0].text).accepted, true);
  await tick(freeGoalMcpId);
  assert.equal((await get(freeGoalMcpId)).status, "completed");

  // Free binary reads retain the normal scope/device/quota checks.
  const usageBeforeFreeBinary = usageCount();
  const callsBeforeFreeBinary = calls.length;
  const deniedBinaryScope = await callMcp("tools/call", { name: "read_binary_file", arguments: {
    device_id: "device", path: "/workspace/image.png", offset: 0, length: 4,
  } }, { ...identity, scope: "devices:read" });
  assert(deniedBinaryScope.isError, "Free access must still require computer:read");
  assert.equal(usageCount(), usageBeforeFreeBinary, "Rejected scope must not consume usage");
  assert.equal(calls.length, callsBeforeFreeBinary, "Rejected scope must not reach the device");
  const freeBinary = await callMcp("tools/call", { name: "read_binary_file", arguments: {
    device_id: "device", path: "/workspace/image.png", offset: 0, length: 4,
  } });
  assert(!freeBinary.isError, JSON.stringify(freeBinary));
  const freeBinaryPayload = JSON.parse(freeBinary.content[0].text);
  assert.equal(freeBinaryPayload.data, "AAECAw==");
  assert.equal(freeBinaryPayload.file_revision, binaryRevision);
  const freeContinuation = await callMcp("tools/call", { name: "read_binary_file", arguments: {
    device_id: "device", path: "/workspace/image.png", offset: 2, length: 2,
    expected_revision: freeBinaryPayload.file_revision,
  } });
  assert(!freeContinuation.isError, JSON.stringify(freeContinuation));
  assert.equal(JSON.parse(freeContinuation.content[0].text).data, "AgM=");
  assert.equal(usageCount(), usageBeforeFreeBinary + 2, "Each Free binary chunk consumes one normal call");
  assert.equal(calls.length, callsBeforeFreeBinary + 2);
  assert.equal(Number(sqlite.prepare(
    "SELECT binary_bytes FROM user_monthly_plus_usage WHERE user_id = ? ORDER BY month_key DESC LIMIT 1",
  ).get("owner")?.binary_bytes || 0), 6, "Free binary bytes remain metered");

  const usageBeforeGuards = usageCount();
  const callsBeforeGuards = calls.length;
  const oversizedBinary = await callMcp("tools/call", { name: "read_binary_file", arguments: {
    device_id: "device", path: "/workspace/image.png", length: 262145,
  } });
  assert(oversizedBinary.isError, "Free binary reads retain the 256 KiB chunk bound");
  assert.equal(usageCount(), usageBeforeGuards);
  assert.equal(calls.length, callsBeforeGuards);
  env.MONTHLY_TOOL_CALL_LIMIT = String(usageBeforeGuards);
  const exhaustedBinary = await callMcp("tools/call", { name: "read_binary_file", arguments: {
    device_id: "device", path: "/workspace/image.png", length: 4,
  } });
  assert.equal(JSON.parse(exhaustedBinary.content[0].text).error.code, "MONTHLY_LIMIT_REACHED", "Free binary reads must honor the monthly call quota");
  assert.equal(usageCount(), usageBeforeGuards);
  assert.equal(calls.length, callsBeforeGuards);
  delete env.MONTHLY_TOOL_CALL_LIMIT;

  sqlite.prepare("UPDATE devices SET allowed_tools = ? WHERE id = 'device'")
    .run(JSON.stringify(tools.filter(tool => tool !== "read_binary_file")));
  const disabledBinary = await callMcp("tools/call", { name: "read_binary_file", arguments: {
    device_id: "device", path: "/workspace/image.png", length: 4,
  } });
  assert(JSON.parse(disabledBinary.content[0].text).error, "Free binary reads must still require the device tool switch");
  assert.equal(calls.length, callsBeforeGuards, "Disabled tool must not reach the device");
  sqlite.prepare("UPDATE devices SET allowed_tools = ? WHERE id = 'device'").run(JSON.stringify(tools));

  // Individual file tools, including temporary links, are available on Free.
  const freeResourceResult = await callMcp("tools/call", { name: "create_file_resource", arguments: {
    device_id: "device", path: "/workspace/image.png",
  } });
  const freeResource = JSON.parse(freeResourceResult.content[0].text);
  assert(freeResource.resource_id, JSON.stringify(freeResourceResult));
  const freeResourceToken = new URL(freeResource.url).pathname.split("/").at(-1);
  const freeResourceDownload = await fileResources.handleFileResource(new Request(freeResource.url), env, freeResourceToken);
  assert.equal(freeResourceDownload.status, 200);
  assert.deepEqual(Buffer.from(await freeResourceDownload.arrayBuffer()), binaryFixture);
  const freeRevoke = await callMcp("tools/call", { name: "revoke_file_resource", arguments: {
    resource_id: freeResource.resource_id,
  } });
  assert.equal(JSON.parse(freeRevoke.content[0].text).already_revoked, false);
  assert.equal((await fileResources.handleFileResource(new Request(freeResource.url), env, freeResourceToken)).status, 404);
  const usageBeforeDenied = usageCount();

  const deniedGoalPlan = await callMcp("tools/call", { name: "create_agent_goal", arguments: {
    name: "Hosted model access remains separate", device_id: "device", controller: "hosted",
    objective: "Inspect file", success_criteria: "File inspected", allowed_tools: ["read_file"],
  } });
  assert.equal(JSON.parse(deniedGoalPlan.content[0].text).error.code, "PLAN_UPGRADE_REQUIRED", JSON.stringify(deniedGoalPlan));
  assert.equal(usageCount(), usageBeforeDenied, "Denied hosted model access must not consume monthly tool usage");

  sqlite.prepare("UPDATE users SET plan = 'plus' WHERE id = 'owner'").run();
  const allowedBinary = await callMcp("tools/call", { name: "read_binary_file", arguments: {
    device_id: "device", path: "/workspace/image.png", offset: 0, length: 4,
  } });
  assert(!allowedBinary.isError, JSON.stringify(allowedBinary));
  const binaryPayload = JSON.parse(allowedBinary.content[0].text);
  assert.equal(binaryPayload.data, "AAECAw==");
  assert.equal(binaryPayload.file_revision, binaryRevision);
  assert.equal(usageCount(), usageBeforeDenied + 1, "Allowed Plus binary read should consume exactly one MCP call");
  const continuedBinary = await callMcp("tools/call", { name: "read_binary_file", arguments: {
    device_id: "device", path: "/workspace/image.png", offset: 2, length: 2,
    expected_revision: binaryPayload.file_revision,
  } });
  assert(!continuedBinary.isError, JSON.stringify(continuedBinary));
  assert.equal(JSON.parse(continuedBinary.content[0].text).data, "AgM=");
  assert.equal(calls.at(-1), "read_binary_file");
  const plusUsageAfterBinary = sqlite.prepare(
    "SELECT binary_bytes FROM user_monthly_plus_usage WHERE user_id = ? ORDER BY month_key DESC LIMIT 1",
  ).get("owner");
  assert.equal(Number(plusUsageAfterBinary?.binary_bytes || 0), 17, "Free binary chunks, file resources and Plus chunks must all meter returned bytes");

  const resource = await fileResources.createFileResource(
    env,
    identity,
    "device",
    "/workspace/image.png",
  );
  const resourceToken = new URL(resource.url).pathname.split("/").at(-1);
  assert(resource.resource_id, "Temporary file resource must return a revocation id");
  assert(resourceToken, "Temporary file resource must return an opaque bearer token");
  const callsBeforeHead = calls.length;
  const headResource = await fileResources.handleFileResource(
    new Request(resource.url, { method: "HEAD" }),
    env,
    resourceToken,
  );
  assert.equal(headResource.status, 200);
  assert.equal(headResource.headers.get("accept-ranges"), "bytes");
  assert.equal(calls.length, callsBeforeHead, "HEAD must not pull file bytes from the device");

  const partial = await fileResources.handleFileResource(
    new Request(resource.url, { headers: { range: "bytes=1-2" } }),
    env,
    resourceToken,
  );
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), "bytes 1-2/4");
  assert.deepEqual(Buffer.from(await partial.arrayBuffer()), Buffer.from([1, 2]));

  const downloaded = await fileResources.handleFileResource(
    new Request(resource.url),
    env,
    resourceToken,
  );
  assert.deepEqual(
    Buffer.from(await downloaded.arrayBuffer()),
    binaryFixture,
    "Temporary file resource must stream the exact pinned bytes",
  );

  sqlite.prepare("UPDATE users SET plan = 'free' WHERE id = 'owner'").run();
  const downgradedResource = await fileResources.handleFileResource(
    new Request(resource.url),
    env,
    resourceToken,
  );
  assert.equal(downgradedResource.status, 200, "Free accounts retain individual file resource access");
  assert.deepEqual(Buffer.from(await downgradedResource.arrayBuffer()), binaryFixture);
  sqlite.prepare("UPDATE users SET plan = 'plus' WHERE id = 'owner'").run();

  binaryRevision = "binary-rev-2";
  const changedResource = await fileResources.handleFileResource(
    new Request(resource.url),
    env,
    resourceToken,
  );
  await assert.rejects(
    changedResource.arrayBuffer(),
    /FILE_CHANGED_DURING_READ/,
    "Pinned file resource must abort if the file revision changes",
  );
  binaryRevision = "binary-rev-1";

  const revoked = await fileResources.revokeFileResource(env, identity, resource.resource_id);
  assert.equal(revoked.already_revoked, false);
  const revokedAgain = await fileResources.revokeFileResource(env, identity, resource.resource_id);
  assert.equal(revokedAgain.already_revoked, true, "Resource revocation should be idempotent");
  const revokedResource = await fileResources.handleFileResource(
    new Request(resource.url),
    env,
    resourceToken,
  );
  assert.equal(revokedResource.status, 404, "Revoked resource must stop working before expiry");

  const createdMcp = await callMcp("tools/call", { name: "create_agent_goal", arguments: {
    name: "MCP source goal", device_id: "device", controller: "source", objective: "Inspect file", success_criteria: "File inspected", allowed_tools: ["read_file"],
  } });
  assert(!createdMcp.isError, JSON.stringify(createdMcp));
  const mcpTask = JSON.parse(createdMcp.content[0].text).automation.id;
  assert.equal(JSON.parse((await runtime.getAutomation(env, "owner", mcpTask)).goal_json).max_iterations, 30, "Legacy MCP default remains unchanged");
  await tick(mcpTask);
  const contextMcp = await callMcp("tools/call", { name: "get_goal_context", arguments: { automation_id: mcpTask } });
  assert(JSON.parse(contextMcp.content[0].text).ready_for_decision);
  const deniedMcp = await callMcp("tools/call", { name: "submit_goal_decision", arguments: {
    automation_id: mcpTask, expected_revision: 0, idempotency_key: "denied", decision: "pause", tool: "none", decision_summary: "Blocked",
  } }, { ...identity, scope: "computer:write" });
  assert(deniedMcp.isError);

  const goalArgs = { name: "MCP unified goal", device_id: "device", controller: "source", objective: "Inspect file", success_criteria: "File inspected", allowed_tools: ["read_file"] };
  const unifiedMcp = await callMcp("tools/call", { name: "create_agent_goal", arguments: { ...goalArgs, task_version: 1, trigger: { type: "now" } } });
  assert(!unifiedMcp.isError, JSON.stringify(unifiedMcp));
  const unifiedId = JSON.parse(unifiedMcp.content[0].text).automation.id;
  const unified = await runtime.getAutomation(env, "owner", unifiedId);
  const unifiedGoal = JSON.parse(unified.goal_json);
  assert.equal(unifiedGoal.max_iterations, 720);
  assert.equal(unifiedGoal.plan.time_policy.max_duration_seconds, 86400);
  assert.equal(unifiedGoal.controller_client_id, identity.clientId, "Unified source goals remain bound to the authorizing OAuth client");
  assert.equal(unified.next_run_at, null);
  assert.equal((await runtime.listAutomationRuns(env, "owner", unifiedId)).length, 0, "Saving a goal must not invent an execution record");
  const unifiedContext = await callMcp("tools/call", { name: "get_goal_context", arguments: { automation_id: unifiedId } });
  assert(JSON.parse(unifiedContext.content[0].text).ready_for_decision, "An immediate source goal accepts its first decision without a fake scheduler run");
  const kicksBeforeDecision = schedulerKicks;
  const kickedDecision = await callMcp("tools/call", { name: "submit_goal_decision", arguments: {
    automation_id: unifiedId, expected_revision: 0, idempotency_key: "kick-source-goal",
    decision: "pause", tool: "none", decision_summary: "Pause after testing immediate scheduler kick",
  } });
  assert(!kickedDecision.isError, JSON.stringify(kickedDecision));
  assert.equal(schedulerKicks, kicksBeforeDecision + 1, "Accepted source decisions must request an immediate scheduler kick");
  const missingExecutor = await callMcp("tools/call", { name: "create_agent_goal", arguments: { ...goalArgs, controller: undefined, task_version: 1 } });
  assert.equal(JSON.parse(missingExecutor.content[0].text).error.code, "INVALID_TOOL_REQUEST", "New contract requires explicit executor selection");
  const mixedTrigger = await callMcp("tools/call", { name: "create_agent_goal", arguments: { ...goalArgs, trigger: { type: "now" } } });
  assert.equal(JSON.parse(mixedTrigger.content[0].text).error.code, "INVALID_TOOL_REQUEST", "Legacy and new trigger semantics cannot be silently mixed");

  await assert.rejects(runtime.createAutomation({ ...env, GITHUB_APP_ID: "test", GITHUB_APP_PRIVATE_KEY: "not-used", GITHUB_APP_INSTALLATION_ID: "7" }, "owner", {
    name: "Unauthorized cloud merge", kind: "condition_watch", github_merge: { owner: "owner", repo: "repo", pull_number: 1 },
  }), /permission binding/);

  // Early-access Plus provisioning is auditable, expiring and admin-only.
  sqlite.prepare("INSERT INTO users(id,google_sub,email,created_at,role,plan) VALUES(?,?,?,?,?,?)")
    .run("plan-admin", "plan-admin-sub", "admin@test.invalid", now, "admin", "free");
  sqlite.prepare("INSERT INTO users(id,google_sub,email,created_at,role,plan) VALUES(?,?,?,?,?,?)")
    .run("plan-user", "plan-user-sub", "plus-target@test.invalid", now, "user", "free");
  const adminToken = await authModule.createSession("plan-admin", env);
  const userToken = await authModule.createSession("plan-user", env);
  const adminHeaders = {
    cookie: "rl_session=" + encodeURIComponent(adminToken),
    "content-type": "application/json",
  };
  const userHeaders = {
    cookie: "rl_session=" + encodeURIComponent(userToken),
    "content-type": "application/json",
  };
  assert.equal(await entitlements.getAccountPlan(env, "plan-user"), "free");

  const forbiddenGrant = await planAdmin.handleAdminPlanGrants(
    new Request(env.PUBLIC_ORIGIN + "/api/admin/plan-grants", {
      method: "POST",
      headers: userHeaders,
      body: JSON.stringify({ email: "plus-target@test.invalid", reason: "self grant denied" }),
    }),
    env,
  );
  assert.equal(forbiddenGrant.status, 403);

  const firstGrantResponse = await planAdmin.handleAdminPlanGrants(
    new Request(env.PUBLIC_ORIGIN + "/api/admin/plan-grants", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        email: "plus-target@test.invalid",
        reason: "Early access testing",
        expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      }),
    }),
    env,
  );
  assert.equal(firstGrantResponse.status, 201);
  const firstGrant = (await firstGrantResponse.json()).grant;
  assert.equal(await entitlements.getAccountPlan(env, "plan-user"), "plus");
  const grantedSessionUser = await authModule.getSessionUser(
    new Request(env.PUBLIC_ORIGIN + "/api/me", { headers: { cookie: userHeaders.cookie } }),
    env,
  );
  assert.equal(grantedSessionUser?.plan, "plus", "Session user should reflect an active grant immediately");

  sqlite.prepare("UPDATE plan_grants SET expires_at = ? WHERE id = ?")
    .run(new Date(Date.now() - 60_000).toISOString(), firstGrant.id);
  assert.equal(await entitlements.getAccountPlan(env, "plan-user"), "free", "Expired grant must stop authorizing Plus");

  const secondGrantResponse = await planAdmin.handleAdminPlanGrants(
    new Request(env.PUBLIC_ORIGIN + "/api/admin/plan-grants", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        email: "plus-target@test.invalid",
        reason: "Temporary preview access",
        expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      }),
    }),
    env,
  );
  assert.equal(secondGrantResponse.status, 201);
  const secondGrant = (await secondGrantResponse.json()).grant;
  assert.equal(await entitlements.getAccountPlan(env, "plan-user"), "plus");

  const revokeResponse = await planAdmin.handleAdminPlanGrantRevoke(
    new Request(env.PUBLIC_ORIGIN + "/api/admin/plan-grants/" + secondGrant.id + "/revoke", {
      method: "POST",
      headers: adminHeaders,
    }),
    env,
    secondGrant.id,
  );
  assert.equal(revokeResponse.status, 200);
  assert.equal(await entitlements.getAccountPlan(env, "plan-user"), "free", "Revoked grant must stop authorizing Plus");

  const scheduler = await importSource("task-scheduler");
  sqlite.prepare("DELETE FROM task_scheduler_health").run();
  assert.equal((await scheduler.taskSchedulerHealth(db, "owner")).state, "unavailable");
  const oldConsoleError = console.error;
  try {
    console.error = () => {};
    const brokenDb = { ...db, prepare(sql) {
      if (sql.includes("FROM automations")) throw new Error("Injected scheduler dispatch failure");
      return db.prepare(sql);
    } };
    await assert.rejects(scheduler.runScheduledTasks({ ...env, DB: brokenDb }, "* * * * *"), /Injected scheduler dispatch failure/);
  } finally { console.error = oldConsoleError; }
  assert.equal((await scheduler.taskSchedulerHealth(db, "owner")).state, "error", "Dispatch failure must be visible instead of a healthy heartbeat");
  sqlite.prepare("UPDATE task_scheduler_health SET last_error=NULL,last_success_at=?").run(new Date(Date.now() - 4 * 60_000).toISOString());
  assert.equal((await scheduler.taskSchedulerHealth(db, "owner")).state, "stale");
  assert.equal((await scheduler.taskSchedulerHealth(db, "plan-user")).overdue_count, 0, "Due task counts remain scoped to the requesting account");
  sqlite.close();
  console.log("PASS: source protocol, fences/recovery, verification/retry, recurring goals, device permissions, signed events/retry/revocation, bounded power leases, cloud action ownership");
} finally {
  if (!path.basename(compiled).startsWith("remote-arc-goal-test-") || path.dirname(compiled) !== os.tmpdir()) throw new Error("Invalid cleanup directory");
  fs.rmSync(compiled, { recursive: true, force: true });
}
