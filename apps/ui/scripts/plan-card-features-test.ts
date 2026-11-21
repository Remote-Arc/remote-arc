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
// The checklist lines as text; a note in small print is checked where it matters.
const rows = (...args: Parameters<typeof planCardFeatures>) =>
  planCardFeatures(...args).map((row) => row.text);

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

const proRows = rows(pro, catalog, en),
  maxRows = rows(max, catalog, en);
assert.deepEqual(maxRows, [
  "No call cap · file edits, commands and Apps never pause",
  "Scheduled routines: up to 100",
  "Up to 100 computers · unlimited data transfer",
  "Parallel tasks: 5 · up to 60 minutes each",
  "3,000 Arc Credits / month · about 1,000 tasks",
  "Terminal, files, browser, Fleet and connected Apps",
  "Computer use: AI sees the screen and uses mouse and keyboard on your Windows and Linux computers",
  "Your own ChatGPT, Claude or Codex, or Arc with Auto and named models",
]);
// Pro lists the same terms in the same order, so each line compares with Max's.
assert.equal(proRows.length, maxRows.length);
assert.deepEqual(proRows.slice(1, 5), [
  "Scheduled routines: up to 20",
  "Up to 20 computers · unlimited data transfer",
  "Parallel tasks: 2 · up to 30 minutes each",
  "500 Arc Credits / month · about 160 tasks",
]);
assert.ok(
  maxRows.findIndex((row) => row.includes("Credits")) >
    maxRows.findIndex((row) => row.includes("computers")),
  "Max leads with capacity, not Credits",
);
assert.deepEqual(rows(max, catalog, zh).slice(1, 5), [
  "最多 100 个定时 Routine",
  "最多 100 台电脑 · 不限数据传输流量",
  "5 个任务同时运行 · 单次最长 60 分钟",
  "每月 3,000 Arc Credits · 约 1,000 次任务",
]);

// A plan whose version turns fleet_run off does not claim Fleet; the line stays in place.
const proWithoutFleet = rows({ ...pro, fleetRun: false }, catalog, en);
assert.equal(proWithoutFleet.length, maxRows.length);
assert.equal(proWithoutFleet[5], "Terminal, files, browser and connected Apps");
assert.equal(rows({ ...pro, fleetRun: false }, catalog, zh)[5], "终端、文件、浏览器与已连接应用");

// A plan without a published routine count leaves that line out rather than guessing.
assert.ok(
  !rows({ ...max, routines: undefined }, catalog, en).some((row) => row.includes("routines")),
);
// A capped Arc plan shows its Connect allowance instead of the full-speed line.
assert.equal(
  rows({ ...max, connectToolCalls: 50000 }, catalog, en)[0],
  "50,000 Connect calls / month",
);
// A Free write cap is stated in small print under the calls line, and only where the
// plan sets one.
assert.deepEqual(planCardFeatures({ ...free, connectWriteCalls: 5000 }, catalog, en)[0], {
  text: "10,000 Connect calls / month",
  note: "Up to 5,000 of them can change files, run commands or act in Apps; reading is never capped by this.",
});
assert.equal(
  planCardFeatures({ ...free, connectWriteCalls: 5000 }, catalog, zh)[0].note,
  "其中改文件、执行命令和应用操作最多 5,000 次；读取不受这个上限影响。",
);
assert.deepEqual(planCardFeatures(free, catalog, en)[0], { text: "10,000 Connect calls / month" });
assert.equal(rows(free, catalog, en)[3], "2 GB data transfer / month");
// Every plan includes computer use, Free too.
for (const plan of [free, pro, max])
  assert.ok(
    rows(plan, catalog, en).some((row) => row.startsWith("Computer use:")) &&
      rows(plan, catalog, zh).some((row) => row.startsWith("Computer Use：")),
    plan.label + " lists computer use",
  );

// The hosted models line names the families the relay reports as live, so a newly
// configured provider shows up without a UI change; with none it keeps the generic line.
const families = (hostedModelFamilies: string[]) => ({ ...catalog, hostedModelFamilies });
assert.equal(
  rows(max, families(["GPT"]), en).at(-1),
  "Your own ChatGPT, Claude or Codex, or Arc with Auto and GPT models",
);
assert.equal(
  rows(max, families(["GPT", "Claude"]), en).at(-1),
  "Your own ChatGPT, Claude or Codex, or Arc with Auto and GPT and Claude models",
);
assert.equal(
  rows(max, families(["GPT", "Claude", "Gemini"]), zh).at(-1),
  "使用你自己的 ChatGPT、Claude 或 Codex，或使用 Arc（Auto 与 GPT、Claude 和 Gemini 模型）",
);
assert.equal(rows(max, families([]), en).at(-1), maxRows.at(-1));

// Background commands at once follow the computers line (on Arc cards, the
// parallel tasks line after it) on every card, with no
// limit said plainly; a catalog from before the term leaves the line out.
{
  const at = (rowsOf: string[]) => rowsOf.findIndex((row) => row.startsWith("Background commands"));
  const freeRows = rows({ ...free, backgroundTasks: 1 }, catalog, en);
  assert.equal(freeRows[at(freeRows)], "Background commands at once: 1 · across your computers");
  assert.equal(freeRows[at(freeRows) - 1], "Up to 2 computers");
  const maxBg = rows({ ...max, backgroundTasks: 20 }, catalog, en);
  assert.equal(maxBg[at(maxBg) - 1], "Parallel tasks: 5 · up to 60 minutes each");
  assert.equal(maxBg.length, maxRows.length + 1);
  assert.equal(
    rows({ ...pro, backgroundTasks: null }, catalog, en).find((row) =>
      row.startsWith("Background"),
    ),
    "Background commands at once: no limit",
  );
  assert.equal(
    rows(
      { ...pro, monthlyCredits: 0, allHostedModels: false, backgroundTasks: 5 },
      catalog,
      zh,
    ).find((row) => row.startsWith("同时运行的后台命令")),
    "同时运行的后台命令：5 个 · 所有电脑合计",
  );
  assert.equal(at(rows(free, catalog, en)), -1, "no term, no line");
}

// Free and a Pro without Arc keep their own lists, without Credits.
assert.ok(!rows(free, catalog, en).some((row) => row.includes("Credits")));
assert.ok(
  !rows({ ...pro, monthlyCredits: 0, allHostedModels: false }, catalog, en).some((row) =>
    row.includes("Credits"),
  ),
);

assert.match(en(planDescriptionKey(max)), /many computers/);
assert.doesNotMatch(en(planDescriptionKey(max)), /Credits/);

console.log(
  "PASS: Pro and Max cards list the same capacity terms in order, Credits come with a rounded-down task estimate, the hosted models line names the live model families from the catalog, Free states its write cap in small print under the calls line, transfer reads as data transfer, and Free and Connect-only cards keep their own lists",
);
