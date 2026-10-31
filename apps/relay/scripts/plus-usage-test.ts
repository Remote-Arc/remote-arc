// Tests for Plus usage metering, binary transfer allowances, envelope
// normalization, and automation run settlement in billing/plus-usage.ts.
import assert from "node:assert/strict";
import { createWorkerFixture } from "./worker-fixture.js";
import {
  binaryChunkResult,
  binaryBytesRead,
  recordPlusUsage,
  assertBinaryAllowance,
  meterBinaryBytes,
  getMonthlyPlusUsage,
  finishAutomationRunWithUsage,
  BinaryTransferLimitError,
} from "../src/billing/plus-usage.js";

const { db, sql, now, addUser } = createWorkerFixture();
addUser("alice");
addUser("bob");
sql.prepare("INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at) VALUES(?,?,?,?,?,?)")
  .run("laptop", "alice", "Laptop", "darwin", "hash-laptop", now);

// 1. Binary chunk normalization & envelope parsing
assert.equal(binaryChunkResult(null), null);
assert.equal(binaryChunkResult("not-an-object"), null);
assert.equal(binaryChunkResult({}), null);
assert.equal(binaryChunkResult({ encoding: "utf8" }), null);

const directValid = {
  encoding: "base64",
  data: "aGVsbG8=",
  file_revision: "rev-1",
  bytes_read: 1024,
  size: 4096,
  offset: 0,
  eof: 1,
};
const parsedDirect = binaryChunkResult(directValid);
assert.ok(parsedDirect);
assert.equal(parsedDirect.encoding, "base64");
assert.equal(parsedDirect.bytes_read, 1024);
assert.equal(parsedDirect.size, 4096);
assert.equal(parsedDirect.offset, 0);
assert.equal(parsedDirect.eof, true);
assert.equal(binaryBytesRead(directValid), 1024);

// MCP error and wrapped envelope extraction
assert.equal(binaryChunkResult({ isError: true, content: [] }), null);
assert.equal(binaryChunkResult({ content: [{ type: "image", data: "..." }] }), null);
assert.equal(binaryChunkResult({ content: [{ type: "text", text: "invalid-json" }] }), null);

const wrappedValid = {
  content: [
    { type: "other" },
    { type: "text", text: JSON.stringify(directValid) },
  ],
};
const parsedWrapped = binaryChunkResult(wrappedValid);
assert.ok(parsedWrapped);
assert.equal(parsedWrapped.bytes_read, 1024);
assert.equal(binaryBytesRead(wrappedValid), 1024);
assert.equal(binaryBytesRead(null), 0);

// Counter validation: negative or non-finite counter throws
await assert.rejects(
  async () => recordPlusUsage({ DB: db }, "alice", { binary_bytes: -1 }),
  /Plus usage counters must be finite non-negative numbers/,
);
await assert.rejects(
  async () => recordPlusUsage({ DB: db }, "alice", { planner_turns: Infinity }),
  /Plus usage counters must be finite non-negative numbers/,
);

// Zero delta is a no-op
await recordPlusUsage({ DB: db }, "alice", { binary_bytes: 0, planner_turns: 0, task_runtime_seconds: 0 });
let usage = await getMonthlyPlusUsage({ DB: db }, "alice", "2026-10-15T00:00:00Z");
assert.equal(usage.binary_bytes, 0);
assert.equal(usage.planner_turns, 0);
assert.equal(usage.task_runtime_seconds, 0);
assert.equal(usage.active_tasks, 0);

// 2. recordPlusUsage records and accumulates deltas
await recordPlusUsage(
  { DB: db },
  "alice",
  { binary_bytes: 500, planner_turns: 2, task_runtime_seconds: 60 },
  "2026-10-15T10:00:00Z",
);
usage = await getMonthlyPlusUsage({ DB: db }, "alice", "2026-10-20T00:00:00Z");
assert.equal(usage.month, "2026-10");
assert.equal(usage.binary_bytes, 500);
assert.equal(usage.planner_turns, 2);
assert.equal(usage.task_runtime_seconds, 60);

// Accumulate on conflict
await recordPlusUsage(
  { DB: db },
  "alice",
  { binary_bytes: 300, planner_turns: 1, task_runtime_seconds: 30 },
  "2026-10-25T12:00:00Z",
);
usage = await getMonthlyPlusUsage({ DB: db }, "alice", "2026-10-31T00:00:00Z");
assert.equal(usage.binary_bytes, 800);
assert.equal(usage.planner_turns, 3);
assert.equal(usage.task_runtime_seconds, 90);

// Active tasks count reflection
sql.prepare(
  "INSERT INTO automations(id,user_id,kind,action_json,status,name,device_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)"
).run("auto-1", "alice", "long_task", "{}", "running", "Task 1", "laptop", now, now);
sql.prepare(
  "INSERT INTO automations(id,user_id,kind,action_json,status,name,device_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)"
).run("auto-2", "alice", "long_task", "{}", "waiting_for_device", "Task 2", "laptop", now, now);
sql.prepare(
  "INSERT INTO automations(id,user_id,kind,action_json,status,name,device_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)"
).run("auto-3", "alice", "long_task", "{}", "completed", "Task 3", "laptop", now, now);

usage = await getMonthlyPlusUsage({ DB: db }, "alice", "2026-10-31T00:00:00Z");
assert.equal(usage.active_tasks, 2, "Only waiting/running automations count toward active tasks");

// 3. Binary allowance & BinaryTransferLimitError
// Unlimited (null limit) always passes
await assertBinaryAllowance({ DB: db }, "alice", null, 10 * 1024 * 1024 * 1024);

// Allowance check with limit
const LIMIT = 2 * 1024 * 1024 * 1024; // 2 GB
await assertBinaryAllowance({ DB: db }, "alice", LIMIT, 1024); // 800 bytes used, 1024 requested -> passes

// Throws when exceeding limit
await assert.rejects(
  async () => assertBinaryAllowance({ DB: db }, "alice", 1000, 300), // 800 + 300 > 1000
  (err: unknown) => {
    assert.ok(err instanceof BinaryTransferLimitError);
    assert.equal(err.code, "BINARY_TRANSFER_LIMIT_REACHED");
    assert.equal(err.name, "BinaryTransferLimitError");
    assert.equal(err.limit, 1000);
    assert.equal(err.used, 800);
    assert.equal(err.requested, 300);
    assert.match(err.message, /Monthly binary transfer allowance exceeded/);
    return true;
  },
);

// 4. Atomic meterBinaryBytes
// Unlimited meters via recordPlusUsage
await meterBinaryBytes({ DB: db }, "bob", 2048, null);
let bobUsage = await getMonthlyPlusUsage({ DB: db }, "bob");
assert.equal(bobUsage.binary_bytes, 2048);

// 0 bytes is a no-op
await meterBinaryBytes({ DB: db }, "bob", 0, 5000);

// Within limit meters atomically
await meterBinaryBytes({ DB: db }, "bob", 1000, 4000);
bobUsage = await getMonthlyPlusUsage({ DB: db }, "bob");
assert.equal(bobUsage.binary_bytes, 3048);

// Exceeding limit throws and leaves usage unchanged
await assert.rejects(
  async () => meterBinaryBytes({ DB: db }, "bob", 1500, 4000), // 3048 + 1500 = 4548 > 4000
  BinaryTransferLimitError,
);
bobUsage = await getMonthlyPlusUsage({ DB: db }, "bob");
assert.equal(bobUsage.binary_bytes, 3048, "Usage remains unchanged on rejection");

// 5. finishAutomationRunWithUsage settlement
sql.prepare(
  "INSERT INTO automations(id,user_id,kind,action_json,status,lease_token,lease_until,name,device_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)"
).run("auto-settle", "alice", "long_task", "{}", "running", "lease-123", "2026-11-01T12:00:00Z", "Settle test", "laptop", now, now);

sql.prepare(
  "INSERT INTO automation_runs(id,automation_id,user_id,attempt,status,started_at) VALUES(?,?,?,?,?,?)"
).run("run-1", "auto-settle", "alice", 1, "running", "2026-10-31T10:00:00Z");

await finishAutomationRunWithUsage(db, {
  run_id: "run-1",
  automation_id: "auto-settle",
  user_id: "alice",
  lease_token: "lease-123",
  status: "completed",
  exit_code: 0,
  error: null,
  finished_at: "2026-10-31T10:05:00Z", // 300 seconds later
});

const runRow = sql.prepare("SELECT * FROM automation_runs WHERE id='run-1'").get() as Record<string, any>;
assert.equal(runRow.status, "completed");
assert.equal(runRow.exit_code, 0);
assert.equal(runRow.finished_at, "2026-10-31T10:05:00Z");
assert.equal(runRow.usage_accounted_at, "2026-10-31T10:05:00Z");

// Check that 300 seconds were credited to monthly plus usage
usage = await getMonthlyPlusUsage({ DB: db }, "alice", "2026-10-31T00:00:00Z");
assert.equal(usage.task_runtime_seconds, 90 + 300);

// Calling again does not double-count (usage_accounted_at guard)
await finishAutomationRunWithUsage(db, {
  run_id: "run-1",
  automation_id: "auto-settle",
  user_id: "alice",
  lease_token: "lease-123",
  status: "completed",
  exit_code: 0,
  error: null,
  finished_at: "2026-10-31T10:05:00Z",
});
usage = await getMonthlyPlusUsage({ DB: db }, "alice", "2026-10-31T00:00:00Z");
assert.equal(usage.task_runtime_seconds, 390, "Runtime seconds are not double counted on idempotent replay");

console.log("PASS: plus usage metering, binary envelope parsing, allowance checks and run settlement");
