import assert from 'node:assert/strict';
import {economics} from './economics.mjs';
const report=economics();assert(report.plans.every(p=>p.meetsTarget));assert(report.plans.every(p=>p.firstMonthContributionMargin>=.70));assert.equal(report.trial.modelCeiling,.4);
assert(Math.abs(report.models.find(m=>m.id==='arc-auto').exampleCredits-.65)<1e-10);
assert.equal(report.models.find(m=>m.id==='gpt-6-astra').exampleCredits,65);
assert(economics({platformAppsPerAccount:20}).plans.every(p=>!p.meetsTarget));
assert.throws(()=>economics({hostingPerToolCall:-1}));assert.throws(()=>economics({targetMargin:1}));assert.throws(()=>economics({trialConversion:0}));
console.log('SaaS economics: full utilization, model weighting, trial acquisition cost and margin stress cases passed.');
