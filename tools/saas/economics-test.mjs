import assert from "node:assert/strict";
import { economics } from "./economics.mjs";
const report = economics();
assert(report.plans.every((p) => p.meetsTarget));
assert(report.plans.every((p) => p.firstMonthContributionMargin >= 0.7));
assert.equal(report.trial.modelCeiling, 0.4);
assert(Math.abs(report.models.find((m) => m.id === "arc-auto").exampleCredits - 0.65) < 1e-10);
assert.equal(report.models.find((m) => m.id === "gpt-6-astra").exampleCredits, 65);
assert.equal(
  report.models.find((m) => m.id === "gpt-6.1-terra").exampleCredits,
  6.5,
  "8K uncached input + 1K output costs $0.013 / 6.5 Credits on Terra",
);
assert(
  economics({ platformAppsPerAccount: 20 })
    .plans.filter((p) => p.allHostedModels)
    .every((p) => !p.meetsTarget),
);
const connect = report.plans.find((p) => p.id === "connect-unlimited-v1");
assert.equal(connect.costs.model, 0, "Connect Unlimited carries no hosted model cost");
assert.equal(
  connect.trialAcquisition,
  0,
  "The Arc trial is open to every account, so it is not an incremental Connect cost",
);
assert.equal(
  connect.costs.devices,
  25 * report.assumptions.hostingPerDevice,
  "Unlimited devices are stressed at a heavy 25-computer fleet",
);
const heavy = economics({
  unlimitedDevicesPerAccount: 100,
  expectedConnectCalls: 100000,
}).plans.find((p) => p.id === "connect-unlimited-v1");
assert(
  heavy.margin > 0 && !heavy.meetsTarget,
  "100 computers and 100k calls stay contribution-positive but below target: fair-use rate limits matter",
);
// A proposed offer is checked against the same assumptions before it is published:
// Connect Unlimited with 1,000 monthly Credits and hosted models at US$19.
const bundle = { id: "connect-unlimited-v1", monthlyCredits: 1000, allHostedModels: true },
  bundled = economics({ plans: [bundle] }).plans.find((p) => p.id === "connect-unlimited-v1");
assert.equal(bundled.costs.model, 2, "1,000 Credits fund at most US$2 of model cost");
assert.equal(bundled.costs.platformApps, report.assumptions.platformAppsPerAccount);
assert.equal(bundled.trialAcquisition, report.trial.modelAcquisitionCostPerConverted);
assert(Math.abs(bundled.total - (connect.total + 2 + 0.49)) < 1e-9);
assert.equal(
  bundled.meetsTarget,
  false,
  "At full utilization and the default assumptions, US$19 with 1,000 Credits is below the 70% target",
);
assert.equal(
  economics({ plans: [{ ...bundle, monthlyPriceCents: 3900 }] }).plans.find(
    (p) => p.id === "connect-unlimited-v1",
  ).meetsTarget,
  true,
);
assert.equal(
  economics({ topups: [{ id: "arc-topup-500-v1", credits: 1000 }] }).topups[0].credits,
  1000,
);
assert.deepEqual(
  report.plans.map((p) => p.monthlyCredits),
  economics({}).plans.map((p) => p.monthlyCredits),
  "Without a proposal the bootstrap catalog is used",
);
assert.throws(() => economics({ plans: [{ id: "arc-ultra-v1" }] }), /Unknown offer/);
assert.throws(() => economics({ plans: [{ ...bundle, priceCents: 1 }] }), /Unknown plan field/);
assert.throws(() => economics({ plans: [{ ...bundle, monthlyCredits: -1 }] }));
assert.throws(() => economics({ hostingPerToolCall: -1 }));
assert.throws(() => economics({ targetMargin: 1 }));
assert.throws(() => economics({ trialConversion: 0 }));
console.log(
  "SaaS economics: full utilization, Connect Unlimited device/call stress, model weighting, trial acquisition cost and margin stress cases passed.",
);
