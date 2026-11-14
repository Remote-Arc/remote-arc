import assert from "node:assert/strict";
import { ARC_TYPICAL_TASK_CREDITS } from "@remotearc/protocol";
import { createTranslator, loadLocale } from "../src/locales/locale-catalog.js";
import type { CatalogPlan, PlatformCatalog } from "../src/hooks/use-platform-catalog.js";
import { planCardFeatures } from "../src/features/marketing/plan-card-features.js";
import { approxTaskCount, planDescriptionKey } from "../src/features/marketing/plan-copy.js";

await loadLocale("en", "all");
await loadLocale("zh", "all");
const en = createTranslator("en"),
  zh = createTranslator("zh");

// The estimate divides by the published per-task figure and rounds down, never up.
assert.equal(ARC_TYPICAL_TASK_CREDITS, 3);
assert.equal(approxTaskCount(0), 0);
assert.equal(approxTaskCount(2), 0, "less than one task is not rounded up to one");
assert.equal(approxTaskCount(29), 9);
assert.equal(approxTaskCount(500), 160, "166 tasks shown as 160");
assert.equal(approxTaskCount(1000), 330);
assert.equal(approxTaskCount(3000), 1000);
assert.equal(approxTaskCount(3299), 1000, "1,099 tasks shown as 1,000");
assert.equal(approxTaskCount(-5), 0);
for (const credits of [1, 7, 500, 1000, 3000, 8000, 99999])
  assert.ok(approxTaskCount(credits) * ARC_TYPICAL_TASK_CREDITS <= credits, "never overstates");

// Live plans as published on 2026-11-08.
const pro: CatalogPlan = {
    id: "connect-unlimited-v1",
    label: "Pro",
    monthlyPriceCents: 1900,
    yearlyPriceCents: 14900,
    monthlyCredits: 500,
    connectToolCalls: null,
    deviceLimit: 20,
    connectionLimit: 50,
    allHostedModels: true,
    concurrentRuns: 2,
    routines: 20,
    maxSteps: 48,
    maxSeconds: 1800,
    versionId: "test:pro",
  },
  max: CatalogPlan = {
    ...pro,
    id: "arc-pro-v1",
    label: "Max",
    monthlyPriceCents: 4900,
    yearlyPriceCents: undefined,
    monthlyCredits: 3000,
    deviceLimit: 100,
    connectionLimit: 200,
    concurrentRuns: 5,
    routines: 100,
    maxSeconds: 3600,
    versionId: "test:max",
  },
  free: CatalogPlan = {
    ...pro,
    id: "free",
    label: "Free",
    monthlyPriceCents: 0,
    yearlyPriceCents: undefined,
    monthlyCredits: 0,
    connectToolCalls: 10000,
    deviceLimit: 2,
    allHostedModels: false,
    versionId: "test:free",
  },
  catalog: PlatformCatalog = {
    arcAvailable: true,
    billingAvailable: true,
    connectFreeCalls: 10000,
    plans: [free, pro, max],
    topups: [],
    trial: { days: 14, credits: 300 },
  };

const proRows = planCardFeatures(pro, catalog, en),
  maxRows = planCardFeatures(max, catalog, en);
assert.deepEqual(maxRows, [
  "Your agents at full speed all month · no call cap, no slow lane",
  "Up to 100 computers · unlimited file transfer",
  "Parallel tasks: 5 · up to 60 minutes each",
  "Scheduled routines: up to 100",
  "3,000 Arc Credits / month · about 1,000 tasks",
  "Terminal, files, browser, Fleet and connected Apps",
  "Your own ChatGPT, Claude or Codex, or Arc with Auto and named models",
]);
// Pro lists the same terms in the same order, so each line compares with Max's.
assert.equal(proRows.length, maxRows.length);
assert.deepEqual(proRows.slice(1, 5), [
  "Up to 20 computers · unlimited file transfer",
  "Parallel tasks: 2 · up to 30 minutes each",
  "Scheduled routines: up to 20",
  "500 Arc Credits / month · about 160 tasks",
]);
assert.ok(
  maxRows.findIndex((row) => row.includes("Credits")) >
    maxRows.findIndex((row) => row.includes("computers")),
  "Max leads with capacity, not Credits",
);
assert.deepEqual(planCardFeatures(max, catalog, zh).slice(1, 5), [
  "最多 100 台电脑 · 不限文件传输",
  "5 个任务同时运行 · 单次最长 60 分钟",
  "最多 100 个定时 Routine",
  "每月 3,000 Arc Credits · 约 1,000 次任务",
]);

// A plan without a published routine count leaves that line out rather than guessing.
assert.ok(
  !planCardFeatures({ ...max, routines: undefined }, catalog, en).some((row) =>
    row.includes("routines"),
  ),
);
// A capped Arc plan shows its Connect allowance instead of the full-speed line.
assert.equal(
  planCardFeatures({ ...max, connectToolCalls: 50000 }, catalog, en)[0],
  "50,000 Connect calls / month",
);
// Free and a Pro without Arc keep their own lists, without Credits.
assert.ok(!planCardFeatures(free, catalog, en).some((row) => row.includes("Credits")));
assert.ok(
  !planCardFeatures({ ...pro, monthlyCredits: 0, allHostedModels: false }, catalog, en).some(
    (row) => row.includes("Credits"),
  ),
);

assert.match(en(planDescriptionKey(max)), /many computers/);
assert.doesNotMatch(en(planDescriptionKey(max)), /Credits/);

console.log(
  "PASS: Pro and Max cards list the same capacity terms in order, Credits come with a rounded-down task estimate, and Free and Connect-only cards are unchanged",
);
