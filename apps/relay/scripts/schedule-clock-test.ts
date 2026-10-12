import assert from "node:assert/strict";
import { nextIntervalRun } from "../src/schedule-clock.js";

const created = "2026-10-11T11:20:00.000Z";
const start = "2026-10-11T11:45:00.000Z";
const thirtyMinutes = { type: "interval" as const, every_seconds: 1800, start_at: start };
const next = (after: string) => nextIntervalRun(thirtyMinutes, created, after);

assert.equal(next("2026-10-11T11:46:09.000Z"), "2026-10-11T12:15:00.000Z", "slow first run must not shift the anchor");
assert.equal(next("2026-10-11T12:16:09.000Z"), "2026-10-11T12:45:00.000Z", "each later run stays on the :15/:45 grid");
assert.equal(next("2026-10-11T11:45:00.000Z"), "2026-10-11T12:15:00.000Z", "a completed slot must not repeat");
assert.equal(next("2026-10-11T11:44:59.000Z"), start, "future first slot is preserved");
assert.equal(next("2026-10-11T13:20:00.000Z"), "2026-10-11T13:45:00.000Z", "missed slots are skipped without catch-up");
assert.equal(next("2026-10-11T13:45:00.000Z"), "2026-10-11T14:15:00.000Z", "do not schedule the current occupied slot twice");
assert.equal(next("2026-10-11T19:45:10.000Z"), "2026-10-11T20:15:00.000Z", "overnight cadence remains anchored after 16 runs");

const legacy = { type: "interval" as const, every_seconds: 1800 };
assert.equal(
  nextIntervalRun(legacy, "2026-10-11T11:20:00.000Z", "2026-10-11T11:51:08.000Z"),
  "2026-10-11T12:20:00.000Z",
  "older schedules without a stored start_at anchor to creation plus one interval",
);
assert.equal(
  nextIntervalRun(legacy, "2026-10-11T11:20:00.000Z", "2026-10-11T11:49:00.000Z"),
  "2026-10-11T11:50:00.000Z",
  "legacy first slot can still occur after an early completion",
);
assert.equal(
  nextIntervalRun(
    { type: "interval", every_seconds: 1800, start_at: "2026-10-12T00:45:00+13:00" },
    created,
    "2026-10-12T01:17:08+13:00",
  ),
  "2026-10-11T12:45:00.000Z",
  "offset-aware NZ timestamps have the same UTC cadence",
);
assert.equal(
  nextIntervalRun(
    { type: "interval", every_seconds: 60, start_at: start },
    created,
    "2026-10-11T11:49:31.000Z",
  ),
  "2026-10-11T11:50:00.000Z",
  "one-minute schedules keep the minute-grid anchor",
);

console.log("schedule-clock: 11 fixed-cadence regression checks passed");
