// normalizeTaskContract is the one typed boundary between Dashboard / MCP task
// requests and durable automations. Every rejection and every mapping is pinned.
import assert from "node:assert/strict";
import { normalizeTaskContract, type TaskContract } from "../src/tasks/task-contract.js";

const goal = (overrides: Partial<NonNullable<TaskContract["goal"]>> = {}) =>
  ({ objective: "Keep the build green", controller: "hosted", ...overrides }) as NonNullable<TaskContract["goal"]>;
const contract = (overrides: Partial<TaskContract>): TaskContract =>
  ({ version: 1, intent: "goal", trigger: { type: "now" }, goal: goal(), ...overrides }) as TaskContract;
const rejects = (task: unknown, message: RegExp) => assert.throws(() => normalizeTaskContract(task as TaskContract), message);
const command = { text: "npm test", cwd: "/work/app" };

// Shape and intent.
rejects(null, /Unsupported task contract/);
rejects({ ...contract({}), version: 2 }, /Unsupported task contract/);
rejects(contract({ intent: "chat" as never }), /Unsupported task contract/);
rejects(contract({ trigger: undefined as never }), /explicit task trigger/);
rejects(contract({ trigger: { type: "daily" as never } }), /explicit task trigger/);

// Goals and commands never cross over.
rejects(contract({ command }), /goal cannot be submitted as a shell command/);
rejects(contract({ github_merge: { owner: "o", repo: "r", pull_number: 1 } as never }), /goal cannot be submitted/);
rejects(contract({ intent: "command", command }), /Use goal intent/);
rejects(contract({ goal: undefined }), /explicitly selected decision executor/);
rejects(contract({ goal: goal({ controller: "auto" as never }) }), /explicitly selected decision executor/);
rejects(contract({ intent: "command", goal: undefined }), /explicit executable instructions/);
rejects(contract({ intent: "command", goal: undefined, command, github_merge: { owner: "o", repo: "r", pull_number: 1 } as never }), /one explicit command or cloud action/);
rejects(contract({ intent: "command", goal: undefined, command: { text: "ls", cwd: "  " } }), /explicit working directory/);
rejects(contract({ goal: goal({ allowed_tools: ["read_file", "start_process"] as never, workspace: " " }) }), /terminal access needs an explicit approved workspace/);

// Triggers.
for (const every_seconds of [59, 30 * 86400 + 1, 90.5, undefined]) {
  rejects(contract({ trigger: { type: "interval", every_seconds } }), /between 60 seconds and 30 days/);
}
rejects(contract({ trigger: { type: "at" } }), /needs a start timestamp/);
rejects(contract({ intent: "command", goal: undefined, trigger: { type: "interval", every_seconds: 600 }, command: { ...command, verification: "npm test" } }), /requires an immediate trigger/);

// Goals need a finite budget even when a plan is supplied.
rejects(contract({ goal: goal({ plan: { planning_mode: "autonomous", phases: [], time_policy: {} } as never }) }), /finite time budget/);

// A goal gets bounded defaults and no expiry of its own; each run is bounded by its plan.
let input = normalizeTaskContract(contract({ name: "Green build", device_id: "laptop", platform: "linux", keep_awake: true }));
assert.equal(input.kind, "agent_goal");
assert.equal(input.name, "Green build");
assert.equal(input.device_id, "laptop");
assert.equal(input.agent_goal?.max_iterations, 720);
assert.deepEqual((input.agent_goal?.plan as { time_policy: unknown }).time_policy, { max_duration_seconds: 86400, finalization_reserve_seconds: 300 });
assert.equal(input.expires_at, null);
assert.equal(input.keep_awake, true);
assert.equal(input.recovery, "fail");
assert.equal(input.command, undefined, "A goal objective never becomes a shell command");
input = normalizeTaskContract(contract({ goal: goal({ controller: "source", max_iterations: 12, allowed_tools: ["start_process"] as never, workspace: "/work",
  plan: { planning_mode: "autonomous", phases: [], time_policy: { end_at: "2026-11-01T00:00:00Z" } } as never }) }));
assert.equal(input.agent_goal?.max_iterations, 12);
assert.equal(input.agent_goal?.controller, "source");
input = normalizeTaskContract(contract({ trigger: { type: "interval", every_seconds: 3600, at: "2026-11-01T09:00:00Z" }, limits: { expires_at: "2026-12-01T00:00:00Z" } }));
assert.deepEqual(input.schedule, { every_seconds: 3600, start_at: "2026-11-01T09:00:00Z" });
assert.equal(input.expires_at, "2026-12-01T00:00:00Z");

// Commands map to the matching automation kind.
input = normalizeTaskContract(contract({ intent: "command", goal: undefined, command: { ...command, recovery: "restart" }, limits: { max_runs: 3, check_interval_seconds: 30 } }));
assert.equal(input.kind, "long_task");
assert.equal(input.command, "npm test");
assert.equal(input.cwd, "/work/app");
assert.equal(input.recovery, "restart");
assert.equal(input.max_runs, 3);
assert.equal(input.interval_seconds, 30);
assert.equal(input.expires_at, undefined, "Commands keep the server's default expiry");
input = normalizeTaskContract(contract({ intent: "command", goal: undefined, command: { ...command, verification: "npm run check" } }));
assert.equal(input.kind, "goal_loop");
assert.deepEqual(input.goal, { command: "npm run check", cwd: "/work/app", expected_exit_code: 0 });
input = normalizeTaskContract(contract({ intent: "command", goal: undefined, command, trigger: { type: "at", at: "2026-11-01T09:00:00Z" } }));
assert.equal(input.kind, "schedule_watch");
assert.deepEqual(input.schedule, { at: "2026-11-01T09:00:00Z" });
input = normalizeTaskContract(contract({ intent: "command", goal: undefined, command, trigger: { type: "interval", every_seconds: 60 } }));
assert.equal(input.kind, "schedule_watch");
assert.deepEqual(input.schedule, { every_seconds: 60 });
const merge = { owner: "remote-arc", repo: "remote-arc", pull_number: 7 } as never;
input = normalizeTaskContract(contract({ intent: "command", goal: undefined, github_merge: merge,
  trigger: { type: "event", source: "github", event: "workflow_run", match: { action: "completed" } } }));
assert.equal(input.kind, "condition_watch");
assert.deepEqual(input.condition, { source: "github", event: "workflow_run", match: { action: "completed" } });
assert.equal(input.github_merge, merge);
assert.equal(input.command, undefined);

console.log("PASS: task contract rejects ambiguous intent, missing executors, unsafe commands and unbounded goals, and maps every trigger to its automation kind");
