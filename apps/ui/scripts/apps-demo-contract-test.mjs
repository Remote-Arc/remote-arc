import assert from "node:assert/strict";
import {APP_WORKFLOW_EXAMPLES} from "../src/app-workflow-examples.ts";
import {APP_CATALOG,appOperation} from "../../relay/src/app-catalog.ts";
import {appCallSchema} from "../../relay/src/apps.ts";
import {appDiscoverySchema} from "../../relay/src/app-discovery.ts";
import {quoteAppOperation} from "../../relay/src/app-connection-policy.ts";
assert.deepEqual(APP_WORKFLOW_EXAMPLES.map(example=>example.id),["release","video","knowledge"]);
for(const example of APP_WORKFLOW_EXAMPLES){
 assert(example.request[0]&&example.request[1]&&example.result[0]&&example.result[1]);
 assert(example.brands.every(brand=>Object.values(APP_CATALOG).some(provider=>provider.brand===brand.brand)));
 let writes=0;
 for(const trace of example.traces){
  assert(!JSON.stringify(trace.input).includes("credential"));
  if(trace.tool==="list_apps"){appDiscoverySchema.parse(trace.input);continue;}
  const input=appCallSchema.parse(trace.input),operation=appOperation(trace.provider,input.operation);
  const args=operation.schema.parse(input.arguments);
  if(trace.provider==="github"&&operation.name==="pulls.list")assert.equal(new URL(operation.request(args).url).searchParams.get("state"),"closed");
  if(operation.permission==="write"){
   writes++;assert.match(trace.output[0],/pending_approval/);assert.match(trace.output[1],/审批/);
  }
  if(trace.provider==="runway"&&operation.name==="videos.generate"){
   const quote=quoteAppOperation(operation,args);assert.equal(quote.estimatedUnits,60);assert.equal(quote.maximumApprovedUnits,60);
   assert.match(example.result[0],/No video has been generated/);
  }
 }
 assert.equal(writes,1,"One final reviewed write per example; the demo never silently executes it.");
}
console.log("PASS: every public App demo call validates against actual backend operation and discovery schemas; reviewed writes and Runway cost estimate agree.");
