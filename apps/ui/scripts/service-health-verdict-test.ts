import { createTranslator, loadLocale } from "../src/locales/locale-catalog.js";
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
import { samplePaymentHealth } from "../src/features/admin/payment-health-model.js";

await loadLocale("en", "all");
const en = createTranslator("en");
await loadLocale("zh", "all");
const zh = createTranslator("zh");

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

// Expected product limits alone do not raise the level.
let verdict = healthVerdict(
  health(),
  monitoring([group("MONTHLY_LIMIT_REACHED", false, 12, 1)]),
  en,
);
assert.equal(verdict.level, "ok");
assert.equal(verdict.problems.length, 0);

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

// Payments: a quiet payment monitor is "ok" only when every alert path works.
const now = Date.now();
const payments = (change: (value: ReturnType<typeof samplePaymentHealth>) => void = () => {}) => {
  const value = samplePaymentHealth(now);
  for (const signal of value.signals) {
    signal.count = 0;
    signal.firing = false;
  }
  value.status = "ok";
  change(value);
  return { ...health(), payments: value };
};
verdict = healthVerdict(payments(), monitoring([]), en);
assert.equal(verdict.level, "ok", "Payments covered and quiet");
verdict = healthVerdict(
  payments((value) => {
    const warn = value.signals.find((s) => s.key === "renewal_failures")!;
    Object.assign(warn, { count: 3, firing: true });
    const crit = value.signals.find((s) => s.key === "paid_not_recorded")!;
    Object.assign(crit, { count: 1, firing: true });
  }),
  monitoring([group("DEVICE_TIMEOUT", true, 9, 4)]),
  en,
);
assert.equal(verdict.level, "broken");
assert.deepEqual(
  verdict.problems.map((p) => p.key),
  [
    "payment:paid_not_recorded",
    "payment:renewal_failures",
    "group:devices:DEVICE_TIMEOUT:execution",
  ],
  "Payment problems come first, critical before warning",
);
assert.equal(verdict.problems[0]!.title, "Stripe took payment but the checkout was not recorded");
assert.equal(verdict.problems[0]!.detail, "1 in the last 24 h", "No threshold jargon");
assert.equal(verdict.problems[0]!.target, "payments");
assert.equal(
  healthVerdict(
    payments((v) => ((v.signals[1]!.count = 1), (v.signals[1]!.firing = true))),
    null,
    zh,
  ).problems[0]!.title,
  "Stripe 已扣款，但系统没有记录这笔订单",
);
verdict = healthVerdict(
  payments((v) => (v.alerting.emailConfigured = false)),
  null,
  en,
);
assert.equal(verdict.level, "watch", "Without alert email, silence proves nothing");
assert.equal(verdict.problems[0]!.title, "Payment alerts are not being checked");
assert.equal(verdict.problems[0]!.detail, "alert email is not configured");
verdict = healthVerdict(
  payments((v) => (v.alerting.lastEvaluatedAt = new Date(now - 20 * 60000).toISOString())),
  null,
  en,
);
assert.equal(verdict.problems[0]!.detail, "the 5-minute check has not run recently");
verdict = healthVerdict(
  payments((v) => (v.alerting.stripeCheck = "not_run")),
  null,
  en,
);
assert.equal(verdict.problems[0]!.detail, "the Stripe comparison did not complete");
verdict = healthVerdict(
  payments((v) => {
    v.billingConfigured = false;
    v.status = "not_configured";
    v.alerting.stripeCheck = "not_configured";
  }),
  null,
  en,
);
assert.deepEqual(
  verdict.problems.map((p) => p.key),
  ["payments-off"],
  "Payments switched off is said once, not as a monitoring gap",
);
verdict = healthVerdict(
  payments((v) => {
    v.status = "unavailable";
    v.signals = [];
  }),
  null,
  en,
);
assert.equal(verdict.problems[0]!.key, "payments-unavailable");
assert.equal(verdict.level, "watch");

console.log(
  "PASS: health verdict is unknown without data, ignores expected limits without listing them, ranks live server errors and dependencies as broken, lists the most widespread error codes first, puts firing payment alerts first (critical as broken), and is never ok while payments are off, unreadable or not being checked",
);
