// Tests for per-device task permission boundaries, legacy defaults, error messages
// and D1 permission requirements in devices/device-task-policy.ts.
import assert from "node:assert/strict";
import { createWorkerFixture } from "./worker-fixture.js";
import {
  LEGACY_TASK_PERMISSIONS,
  parseTaskPermissions,
  taskPermissionError,
  requireTaskPermission,
} from "../src/devices/device-task-policy.js";

const { db, sql, now, addUser } = createWorkerFixture();
addUser("owner");
addUser("intruder");

// 1. parseTaskPermissions
// null returns legacy defaults
const legacy = parseTaskPermissions(null);
assert.deepEqual(legacy, LEGACY_TASK_PERMISSIONS);
assert.equal(legacy.background_tasks, true);
assert.equal(legacy.scheduled_tasks, true);
assert.equal(legacy.adaptive_agent, true);
assert.equal(legacy.source_agent, false);
assert.equal(legacy.keep_awake, false);

// Mutating returned object does not alter the constant
legacy.background_tasks = false;
assert.equal(LEGACY_TASK_PERMISSIONS.background_tasks, true);

// Valid JSON parsing with strict boolean checks
const parsed = parseTaskPermissions(JSON.stringify({
  background_tasks: true,
  scheduled_tasks: "true", // Non-boolean -> false
  adaptive_agent: 1, // Non-boolean -> false
  source_agent: true,
  keep_awake: false,
}));
assert.deepEqual(parsed, {
  background_tasks: true,
  scheduled_tasks: false,
  adaptive_agent: false,
  source_agent: true,
  keep_awake: false,
});

// Malformed JSON returns all-false permissions
const broken = parseTaskPermissions("{ bad json");
assert.deepEqual(broken, {
  background_tasks: false,
  scheduled_tasks: false,
  adaptive_agent: false,
  source_agent: false,
  keep_awake: false,
});

// 2. taskPermissionError policy evaluations
const allDisabled = {
  background_tasks: false,
  scheduled_tasks: false,
  adaptive_agent: false,
  source_agent: false,
  keep_awake: false,
};

// background_tasks is the primary gate
assert.equal(
  taskPermissionError(allDisabled, "long_task", null, null),
  "Background tasks are disabled for this device.",
);

const bgOnly = { ...allDisabled, background_tasks: true };
// schedule_watch or interval/at triggers require scheduled_tasks
assert.equal(
  taskPermissionError(bgOnly, "schedule_watch", null, null),
  "Scheduled tasks are disabled for this device.",
);
assert.equal(
  taskPermissionError(bgOnly, "long_task", null, { type: "interval" }),
  "Scheduled tasks are disabled for this device.",
);
assert.equal(
  taskPermissionError(bgOnly, "long_task", null, { type: "at" }),
  "Scheduled tasks are disabled for this device.",
);

// Adaptive agent goal requires adaptive_agent
assert.equal(
  taskPermissionError(bgOnly, "agent_goal", { type: "agent_goal" }, null),
  "Adaptive Agent Goals are disabled for this device.",
);

// Source agent goal requires source_agent
assert.equal(
  taskPermissionError(bgOnly, "agent_goal", { controller: "source" }, null),
  "Source Agent Goals are disabled for this device.",
);

// keep_awake requires keep_awake permission
assert.equal(
  taskPermissionError(bgOnly, "long_task", null, null, true),
  "Task keep-awake is disabled for this device.",
);

// Successful allowance
const fullyAllowed = {
  background_tasks: true,
  scheduled_tasks: true,
  adaptive_agent: true,
  source_agent: true,
  keep_awake: true,
};
assert.equal(taskPermissionError(fullyAllowed, "long_task", null, null), null);
assert.equal(
  taskPermissionError(fullyAllowed, "schedule_watch", { type: "agent_goal", controller: "source" }, { type: "interval" }, true),
  null,
);

// 3. requireTaskPermission against real D1 SQLite
sql.prepare(
  "INSERT INTO devices(id,user_id,name,platform,credential_hash,automation_permissions,created_at) VALUES(?,?,?,?,?,?,?)"
).run(
  "dev-1",
  "owner",
  "Dev 1",
  "linux",
  "hash-1",
  JSON.stringify({ background_tasks: true, scheduled_tasks: false, adaptive_agent: true, source_agent: false, keep_awake: false }),
  now,
);

sql.prepare(
  "INSERT INTO devices(id,user_id,name,platform,credential_hash,automation_permissions,created_at,revoked_at) VALUES(?,?,?,?,?,?,?,?)"
).run("dev-revoked", "owner", "Dev Revoked", "linux", "hash-2", null, now, now);

// Device lookup invariants: not found, revoked, or intruder access rejected
await assert.rejects(
  async () => requireTaskPermission(db, "owner", "dev-nonexistent", "long_task", null, null),
  /Device not found or revoked/,
);
await assert.rejects(
  async () => requireTaskPermission(db, "owner", "dev-revoked", "long_task", null, null),
  /Device not found or revoked/,
);
await assert.rejects(
  async () => requireTaskPermission(db, "intruder", "dev-1", "long_task", null, null),
  /Device not found or revoked/,
);

// Device found but permission denied
await assert.rejects(
  async () => requireTaskPermission(db, "owner", "dev-1", "schedule_watch", null, null),
  /Scheduled tasks are disabled for this device/,
);

// Device found and permission granted
await requireTaskPermission(db, "owner", "dev-1", "long_task", null, null);

console.log("PASS: device task permission parsing, boundary rejections, multi-tenant isolation and D1 verification");
