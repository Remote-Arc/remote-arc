import assert from "node:assert/strict";
import {
  healthVerdict,
  VERDICT_GROUP_LIMIT,
} from "../src/features/admin/service-health-verdict.js";
import type {
  FailureGroup,
  HealthSnapshot,
  MonitoringSnapshot,
} from "../src/features/admin/service-health-model.js";

const en = (english: string) => english;
const zh = (_english: string, chinese: string) => chinese;

function health(overrides: Partial<HealthSnapshot["worker"]> = {}): HealthSnapshot {
  return {
    status: "operational",
    checkedAt: "2026-11-06T09:00:00.000Z",
    worker: { status: "operational", errors15m: 0, errors1h: 0, errors24h: 0, ...overrides },
    dependencies: { d1: { status: "operational" }, durableObjects: { status: "operational" } },
    alerts: { emailConfigured: true, destination: null, recent: [] },
    account: { users: 1, devices: 1, activeTokens: 1 },
    incidents: [],
  };
}

function group(code: string, attention: boolean, total: number, users: number): FailureGroup {
  return {
    domain: "devices",
    code,
    category: attention ? "execution" : "quota",
    total,
    affectedUsers: users,
    affectedDevices: 0,
    firstSeen: "2026-11-06T08:00:00.000Z",
    lastSeen: "2026-11-06T09:00:00.000Z",
    definition: {
      code,
      category: attention ? "execution" : "quota",
      label: code,
      meaning: code + " 中文说明",
      meaningEn: code + " meaning",
      action: "",
      attention,
      sources: [],
    },
  };
}

function monitoring(groups: FailureGroup[]): MonitoringSnapshot {
  return {
    checkedAt: "2026-11-06T09:00:00.000Z",
    from: "2026-11-05T09:00:00.000Z",
    hours: 24,
    retentionDays: 30,
    coverage: "observed",
    summary: {
      total: groups.reduce((sum, item) => sum + item.total, 0),
      attention: 0,
      affectedUsers: 0,
      affectedDevices: 0,
      browserReports: 0,
      lastSeen: null,
    },
    facets: [],
    groups,
    groupsTruncated: false,
    events: [],
    nextCursor: null,
    showEvents: false,
  };
}

// Nothing loaded is unknown, never "everything is working".
assert.equal(healthVerdict(null, null, en).level, "unknown");

// Expected product limits alone do not raise the level, but are counted.
let verdict = healthVerdict(
  health(),
  monitoring([group("MONTHLY_LIMIT_REACHED", false, 12, 1)]),
  en,
);
assert.equal(verdict.level, "ok");
assert.equal(verdict.problems.length, 0);
assert.equal(verdict.expected, 12);

// Server errors right now are broken and rank before everything else.
verdict = healthVerdict(
  health({ errors15m: 2, errors1h: 5, errors24h: 9 }),
  monitoring([group("DEVICE_TIMEOUT", true, 4, 2)]),
  en,
);
assert.equal(verdict.level, "broken");
assert.equal(verdict.problems[0]!.key, "platform-now");
assert.equal(verdict.problems[0]!.target, "infrastructure");
assert.match(verdict.problems[0]!.detail, /2 errors in the last 15 minutes/);
assert.equal(verdict.problems[1]!.target, "group");

// Errors earlier in the hour, but not now, are something to look at, not an outage.
verdict = healthVerdict(health({ errors1h: 1, errors24h: 3 }), null, zh);
assert.equal(verdict.level, "watch");
assert.equal(verdict.problems[0]!.title, "最近 1 小时出现过服务器错误");

// A degraded dependency is broken even without HTTP errors.
const degraded = health();
degraded.dependencies.d1.status = "degraded";
verdict = healthVerdict(degraded, null, en);
assert.equal(verdict.level, "broken");
assert.match(verdict.problems[0]!.detail, /D1 · degraded/);

// Device trouble points to the device section.
const devices = health();
devices.deviceExecution = {
  coverage: "observed",
  status: "degraded",
  windowMinutes: 15,
  calls: 10,
  successfulCalls: 7,
  timeouts: 3,
  offlineCalls: 0,
  staleSignals: 0,
  affectedDevices: 1,
  truncated: false,
  devices: [],
};
verdict = healthVerdict(devices, null, en);
assert.equal(verdict.level, "watch");
assert.equal(verdict.problems[0]!.target, "devices");
assert.match(verdict.problems[0]!.detail, /1 computer affected/);

// Error codes are ranked by people affected and capped, with the rest pointed to.
verdict = healthVerdict(
  health(),
  monitoring([
    group("A_FEW_USERS", true, 100, 1),
    group("MANY_USERS", true, 5, 9),
    group("SOME_USERS", true, 50, 3),
    group("TWO_USERS", true, 8, 2),
    group("EXPECTED", false, 500, 40),
  ]),
  en,
);
const codes = verdict.problems.map((item) => item.group?.code);
assert.deepEqual(codes, ["MANY_USERS", "SOME_USERS", "TWO_USERS"]);
assert.equal(verdict.problems.length, VERDICT_GROUP_LIMIT);
assert.match(verdict.summary, /1 more error codes are listed below/);
assert.equal(verdict.expected, 500);

console.log(
  "PASS: health verdict is unknown without data, ignores expected limits, ranks live server errors and dependencies as broken, and lists the most widespread error codes first",
);
