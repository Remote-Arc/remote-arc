import assert from "node:assert/strict";
import { waitForProductionCi } from "./wait-production-ci.mjs";
const sha = "a".repeat(40), repository = "Remote-Arc/remote-arc";
const run = (overrides = {}) => ({ id: 123, head_sha: sha, head_branch: "master", event: "push", status: "completed", conclusion: "success", ...overrides });
function fixture(responses, extra = {}) {
  let index = 0, elapsed = 0, waits = 0;
  return { options: {sha,repository,getMaster:async()=>sha,
    listRuns:async()=>({workflow_runs:responses[Math.min(index++,responses.length-1)]}),
    now:()=>elapsed, wait:async ms=>{elapsed+=ms;waits++;},timeoutMs:100,pollMs:20,log:()=>{},...extra},
    waits:()=>waits };
}
let f=fixture([[],[run({status:"queued",conclusion:null})],[run({status:"in_progress",conclusion:null})],[run()]]);
assert.equal(await waitForProductionCi(f.options),123);assert.equal(f.waits(),3);
for(const conclusion of ["failure","cancelled","timed_out","skipped","neutral","action_required"]) {
 f=fixture([[run({conclusion})]]);
 await assert.rejects(waitForProductionCi(f.options),/CI failed/);assert.equal(f.waits(),0);
}
f=fixture([[run({id:122}),run({id:123,status:"in_progress",conclusion:null})],[run()]]);
assert.equal(await waitForProductionCi(f.options),123);assert.equal(f.waits(),1,"latest run must finish even if an older run was green");
f=fixture([[run({event:"pull_request"}),run({head_sha:"b".repeat(40)}),run({head_branch:"feature"})]]);
await assert.rejects(waitForProductionCi(f.options),/Timed out/);
f=fixture([[run({status:"in_progress",conclusion:null})]],{getMaster:async()=>"b".repeat(40)});
await assert.rejects(waitForProductionCi(f.options),/Master advanced/);
let reads=0;
f=fixture([[run()]],{getMaster:async()=>++reads===1?sha:"b".repeat(40)});
await assert.rejects(waitForProductionCi(f.options),/Master advanced/);
f=fixture([[]],{listRuns:async()=>({error:"unavailable"})});
await assert.rejects(waitForProductionCi(f.options),/Malformed/);
f=fixture([[run({status:"invented"})]]);
await assert.rejects(waitForProductionCi(f.options),/Unknown CI/);
f=fixture([[]],{listRuns:async()=>{throw new Error("API access denied");}});
await assert.rejects(waitForProductionCi(f.options),/API access denied/);
await assert.rejects(waitForProductionCi({...fixture([[]]).options,sha:"short"}),/full deployment SHA/);
console.log("PASS: exact-SHA CI waiting, latest-run selection, failure/timeout/API rejection and stale-master fences");
