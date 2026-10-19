import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";
import {reserveBilling,settleBilling,setBillingLimit,grantPaidModel,configureFreeAiPool,getBillingUsage,getAdminBillingUsage,defineBillingPlan,assignBillingPlan,getBillingEntitlements,type BillingReservationInput} from "../src/billing-ledger.js";
import {runModelGateway,DEFAULT_AUTO_MODEL,resolveModelGateway,type ModelGatewayBinding} from "../src/model-gateway.js";
import {openAiAdapter,anthropicAdapter,openRouterAdapter,workersAiAdapter,ModelProviderError,type ModelDefinition,type ModelUsage} from "../src/model-provider-adapters.js";
import {planAgentTurn,agentPlannerConfigured} from "../src/agent-planner.js";

const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),sql=new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
for(const name of fs.readdirSync(path.join(dir,"migrations")).filter(n=>n.endsWith(".sql")).sort())sql.exec(fs.readFileSync(path.join(dir,"migrations",name),"utf8"));
const db={
  prepare(query:string){
    const statement=sql.prepare(query);
    const bound=(args:unknown[])=>({
      async first(){return statement.get(...args)||null;},
      async all(){return {results:statement.all(...args)};},
      async run(){return this.runSync();},
      runSync(){const r=statement.run(...args);return {success:true,meta:{changes:Number(r.changes)}};},
    });
    return {...bound([]),bind(...args:unknown[]){assert(!args.includes(undefined),query);return bound(args);}};
  },
  async batch(statements:Array<{runSync:()=>unknown}>){
    sql.exec("BEGIN IMMEDIATE");try{const r=statements.map(s=>s.runSync());sql.exec("COMMIT");return r;}
    catch(e){sql.exec("ROLLBACK");throw e;}
  },
} as unknown as D1Database;
const now=new Date().toISOString(),day=now.slice(0,10),future=new Date(Date.now()+3600000).toISOString();
for(const id of ["admin","owner","other"])sql.prepare("INSERT INTO users(id,google_sub,email,role,created_at) VALUES(?,?,?,?,?)").run(id,id,id+"@test.invalid",id==="admin"?"admin":"user",now);
for(const [id,user] of [["task","owner"],["foreign","other"]])sql.prepare("INSERT INTO automations(id,user_id,name,kind,action_json,created_at,updated_at) VALUES(?,?,?,'goal_loop','{}',?,?)").run(id,user,id,now,now);
const context={userId:"owner",organizationId:"personal:owner",taskId:"task",runId:"run",operationId:"one",lane:"arc_hosted" as const};
let operation=0;
const input=(extra:Partial<BillingReservationInput>={}):BillingReservationInput=>({...context,operationId:"op-"+(++operation),provider:"workers_ai",modelId:"workers-auto",authorizationId:"pool",maximum:{credits:1,costMicros:0,neurons:100},...extra});
async function reset(limit=500){
  sql.exec("DELETE FROM billing_events;DELETE FROM billing_reservations;DELETE FROM billing_budgets;DELETE FROM billing_model_grants;DELETE FROM billing_free_ai_pools;");
  for(const [scope_type,scope_id] of [["global","platform"],["organization","personal:owner"],["user","owner"],["task","task"]])
    for(const [metric,maximum] of [["credits",limit],["cost_micros",100000000],["neurons",9000]] as const)
      await setBillingLimit(db,"admin",{scope_type,scope_id,lane:"arc_hosted",metric,period_key:day,limit:maximum});
  await configureFreeAiPool(db,"admin",{id:"pool",period:day,mode:"dedicated_account",managedPoolAssertion:true,freeNeurons:10000,outsideUsedNeurons:1000});
}
const counts=()=>({...sql.prepare("SELECT SUM(spent_units) AS spent,SUM(reserved_units) AS reserved FROM billing_budgets WHERE metric='credits'").get()}) as {spent:number;reserved:number};
const deny=async(fn:()=>unknown,pattern=/BILLING_/)=>assert.rejects(async()=>fn(),pattern);
await reset(1);
const contenders=await Promise.allSettled(Array.from({length:12},()=>reserveBilling(db,input())));
assert.equal(contenders.filter(x=>x.status==="fulfilled").length,1,"one credit must permit one inference across concurrent requests");
assert.deepEqual(counts(),{spent:0,reserved:4});
const winner=(contenders.find(x=>x.status==="fulfilled") as PromiseFulfilledResult<{id:string}>).value;
await settleBilling(db,context,winner.id,{status:"unknown"});
assert.deepEqual(counts(),{spent:0,reserved:4},"unknown requests cannot free retry budget");
await settleBilling(db,context,winner.id,{status:"completed",actual:{credits:1,costMicros:0,neurons:5}});
assert.deepEqual(counts(),{spent:4,reserved:0});
await settleBilling(db,context,winner.id,{status:"completed",actual:{credits:1,costMicros:0,neurons:5}});
assert.deepEqual(counts(),{spent:4,reserved:0},"duplicate settlement never double bills");
await deny(()=>settleBilling(db,context,winner.id,{status:"failed",actual:{credits:0,costMicros:0,neurons:0}}),/SETTLEMENT_CONFLICT/);
await deny(()=>settleBilling(db,{userId:"other",organizationId:"personal:other"},winner.id,{status:"unknown"}),/NOT_FOUND/);
await deny(()=>setBillingLimit(db,"owner",{scope_type:"user",scope_id:"owner",lane:"arc_hosted",metric:"credits",period_key:day,limit:100}),/ADMIN_REQUIRED/);
await deny(()=>setBillingLimit(db,"admin",{scope_type:"user",scope_id:"owner",lane:"arc_hosted",metric:"credits",period_key:day,limit:0}),/BELOW_COMMITTED/);
await deny(()=>getAdminBillingUsage(db,"owner"),/ADMIN_REQUIRED/);
assert.equal((await getAdminBillingUsage(db,"admin")).reservations.length,1);
assert((await getBillingUsage(db,context)).every((r:unknown)=>!JSON.stringify(r).includes('"scope_type":"global"')));
await deny(()=>getBillingUsage(db,{userId:"other",organizationId:"personal:owner"}),/MEMBERSHIP/);
await reset();
const idem=input(),first=await reserveBilling(db,idem);
assert.equal((await reserveBilling(db,idem)).dispatchAllowed,false);
await deny(()=>reserveBilling(db,{...idem,modelId:"other-model"}),/IDEMPOTENCY_CONFLICT/);
await deny(()=>reserveBilling(db,input({taskId:"foreign"})),/UNAVAILABLE/);
await deny(()=>reserveBilling(db,input({organizationId:"personal:other"})),/UNAVAILABLE/);
await deny(()=>reserveBilling(db,input({maximum:{credits:1.5,costMicros:0,neurons:1}})),/INVALID_UNITS/);
await deny(()=>reserveBilling(db,input({runId:""})),/INVALID_CONTEXT/);
await deny(()=>reserveBilling(db,input({lane:"connect"})),/UNAVAILABLE/);
await deny(()=>settleBilling(db,context,first.id,{status:"completed",actual:{credits:1,costMicros:0,neurons:101}}),/EXCEEDED/);
assert.equal(sql.prepare("SELECT status FROM billing_reservations WHERE id=?").get(first.id)?.status,"unknown");
assert.equal(counts().reserved,4);
sql.prepare("UPDATE billing_free_ai_pools SET enabled=0").run();
await deny(()=>reserveBilling(db,input()),/UNAVAILABLE/);
sql.prepare("UPDATE billing_free_ai_pools SET enabled=1,verified_at='2000-01-01'").run();
await deny(()=>reserveBilling(db,input()),/UNAVAILABLE/);
await deny(()=>configureFreeAiPool(db,"admin",{id:"bad",period:day,mode:"dedicated_account",managedPoolAssertion:false,freeNeurons:10000,outsideUsedNeurons:0}),/UNVERIFIED/);
await deny(()=>setBillingLimit(db,"admin",{scope_type:"bad",scope_id:"x",lane:"arc_hosted",metric:"credits",period_key:day,limit:10}),/INVALID_LIMIT/);
await reset();
await grantPaidModel(db,"admin",{id:"paid",userId:"owner",organizationId:"personal:owner",provider:"openai",maxCostMicros:1000000,expiresAt:future});
const paid=input({provider:"openai",modelId:"openai-test",authorizationId:"paid",maximum:{credits:1,costMicros:1000,neurons:0}});
const paidReservation=await reserveBilling(db,paid);
await settleBilling(db,context,paidReservation.id,{status:"failed",actual:{credits:1,costMicros:100,neurons:0}});
sql.prepare("UPDATE billing_model_grants SET revoked_at=?").run(now);
await deny(()=>reserveBilling(db,{...paid,operationId:"revoked"}),/UNAVAILABLE/);
await deny(()=>grantPaidModel(db,"admin",{id:"bad",userId:"owner",organizationId:"personal:other",provider:"openai",maxCostMicros:1,expiresAt:future}),/MEMBERSHIP/);
await deny(()=>grantPaidModel(db,"admin",{id:"bad",userId:"owner",organizationId:"personal:owner",provider:"openai",maxCostMicros:0,expiresAt:future}),/INVALID_GRANT/);

const usage:ModelUsage={inputTokens:20,outputTokens:10,cachedInputTokens:0,cacheWriteTokens:0,reasoningTokens:0};
const raw={decision:"complete",tool:"none",arguments_json:"{}",decision_summary:"Done",memory:"Observed result",completion_evidence:"A verified observation"};
const paidDefinition:ModelDefinition={id:"openai-test",provider:"openai",model:"server-configured-model",maxOutputTokens:4096,inputMicrosPerMillion:1000000,outputMicrosPerMillion:2000000};
let attempts=0;
const gateway:ModelGatewayBinding={DB:db,enabled:true,models:[DEFAULT_AUTO_MODEL,paidDefinition],autoModelId:"workers-auto",freePoolId:"pool",paidGrantId:"paid",adapters:{
  workers_ai:async()=>{attempts++;return {value:raw,usage,providerRequestId:"fake"};},
  openai:async()=>{attempts++;return {value:raw,usage,providerRequestId:"fake-paid"};},
}};
const req=(extra:Record<string,unknown>={})=>({context:{...context,operationId:"model-"+(++operation)},system:"Return one authorized decision.",user:"Read a report",schema:{type:"object"},maxOutputTokens:100,...extra});
const validate=(v:unknown)=>{assert(v&&typeof v==="object");return v;};
await reset();
const auto=await runModelGateway(gateway,req(),validate);
assert.equal(auto.provider,"workers_ai");assert.equal(attempts,1);
assert.equal((await getAdminBillingUsage(db,"admin")).reservations.length,1);
await deny(()=>runModelGateway({...gateway,freePoolId:undefined},req(),validate),/FREE_POOL_NOT_VERIFIED/);
await deny(()=>runModelGateway({...gateway,enabled:false},req(),validate),/DISABLED/);
await deny(()=>runModelGateway(gateway,req({modelId:"not-allowed"}),validate),/NOT_ALLOWED/);
await deny(()=>runModelGateway({...gateway,autoModelId:"openai-test"},req(),validate),/AUTO_REQUIRES/);
await deny(()=>runModelGateway({...gateway,adapters:{}},req(),validate),/NOT_CONFIGURED/);
await deny(()=>runModelGateway(gateway,req({maxOutputTokens:50000}),validate),/INVALID/);
await deny(()=>runModelGateway(gateway,req({user:"x".repeat(64001)}),validate),/TOO_LARGE/);
await deny(()=>runModelGateway(gateway,req({timeoutMs:0}),validate),/INVALID/);
await deny(()=>runModelGateway(gateway,req({context:{...context,lane:"connect"}}),validate),/LANE/);
await deny(()=>runModelGateway({...gateway,paidGrantId:undefined},req({modelId:"openai-test"}),validate),/NOT_AUTHORIZED/);
await deny(()=>runModelGateway(gateway,req({modelId:"openai-test"}),validate),/UNAVAILABLE/);
await grantPaidModel(db,"admin",{id:"paid",userId:"owner",organizationId:"personal:owner",provider:"openai",maxCostMicros:1000000,expiresAt:future});
assert.equal((await runModelGateway(gateway,req({modelId:"openai-test"}),validate)).provider,"openai");
const duplicate=req();
await runModelGateway(gateway,duplicate,validate);
await deny(()=>runModelGateway(gateway,duplicate,validate),/ALREADY_DISPATCHED/);
const beforeTimeout=attempts;
await deny(()=>runModelGateway({...gateway,adapters:{workers_ai:async()=>{attempts++;return new Promise(()=>{});}}},req({timeoutMs:5}),validate),/TIMEOUT/);
assert.equal(attempts,beforeTimeout+1,"no paid fallback on timeout");
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM billing_reservations WHERE status='unknown'").get()?.n,1);
await deny(()=>runModelGateway(gateway,req(),()=>{throw Error("malformed decision");}),/DECISION/);
await deny(()=>runModelGateway({...gateway,models:[{...DEFAULT_AUTO_MODEL,inputNeuronsPerMillion:undefined}]},req(),validate),/NOT_FREE/);
await deny(()=>runModelGateway({...gateway,models:[{...DEFAULT_AUTO_MODEL,maxOutputTokens:-1}]},req(),validate),/CONFIGURATION/);
assert.equal(resolveModelGateway({DB:db,OPENAI_API_KEY:"unused"}),undefined,"keys alone never enable paid inference");
assert.throws(()=>resolveModelGateway({DB:db,MODEL_GATEWAY_ENABLED:"1",MODEL_GATEWAY_MODELS:"{}"}),/CONFIGURATION/);
assert.throws(()=>resolveModelGateway({DB:db,MODEL_GATEWAY_ENABLED:"1",MODEL_GATEWAY_LOCAL_TEST_ENDPOINT:"https://attacker.invalid"}),/TEST_ENDPOINT/);
assert(resolveModelGateway({DB:db,MODEL_GATEWAY_ENABLED:"1",MODEL_GATEWAY_FREE_POOL_ID:"pool",AI:{run:async()=>({})}})?.adapters.workers_ai);
assert.equal(agentPlannerConfigured({OPENAI_API_KEY:"unused"}),false);
await assert.rejects(()=>planAgentTurn({OPENAI_API_KEY:"unused"},{objective:"x",successCriteria:"x",iteration:1,maxIterations:2,allowedTools:["read_file"],memory:"",observation:""}),/Model Gateway/);
const planned=await planAgentTurn({MODEL_GATEWAY:gateway},{objective:"Report",successCriteria:"Evidence",iteration:1,maxIterations:2,allowedTools:["read_file"],memory:"",observation:"",billing:{...context,operationId:"planner-direct"}});
assert.equal(planned.decision,"complete");

function response(value:unknown,status=200){return Response.json(value,{status});}
let body:Record<string,unknown>={},target="";
const providerReq={definition:paidDefinition,system:"system",user:"user",schema:{type:"object"},maxOutputTokens:100,signal:new AbortController().signal};
const open=openAiAdapter("test-only-key",async(url,init)=>{target=String(url);body=JSON.parse(String(init?.body));assert.equal((init?.headers as Record<string,string>).authorization,"Bearer test-only-key");return response({status:"completed",id:"open-1",usage:{input_tokens:20,output_tokens:10,input_tokens_details:{cached_tokens:2},output_tokens_details:{reasoning_tokens:3}},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(raw)}]}]});});
const opened=await open(providerReq);assert.equal(target,"https://api.openai.com/v1/responses");assert.equal(body.store,false);assert.equal(opened.usage.cachedInputTokens,2);assert.deepEqual(opened.value,raw);
const claude=anthropicAdapter("test-only-key",async(url,init)=>{target=String(url);body=JSON.parse(String(init?.body));assert.equal((init?.headers as Record<string,string>)["anthropic-version"],"2023-06-01");return response({id:"claude-1",stop_reason:"tool_use",usage:{input_tokens:20,output_tokens:10,cache_read_input_tokens:2,cache_creation_input_tokens:1},content:[{type:"tool_use",name:"submit_agent_decision",input:raw}]});});
assert.deepEqual((await claude({...providerReq,definition:{...paidDefinition,provider:"anthropic"}})).value,raw);assert.equal(target,"https://api.anthropic.com/v1/messages");assert.equal((body.tool_choice as {name:string}).name,"submit_agent_decision");
let routerAttempts=0;
const routerRequest={...providerReq,definition:{...paidDefinition,provider:'openrouter' as const,model:'minimax/minimax-m3'}};
const routerPayload={id:'router-fixture',usage:{prompt_tokens:20,completion_tokens:10,prompt_tokens_details:{cached_tokens:2},completion_tokens_details:{reasoning_tokens:3}},choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}]};
const routed=await openRouterAdapter('test-router-key',async(url,init)=>{routerAttempts++;assert.equal(String(url),'https://openrouter.ai/api/v1/chat/completions');const sent=JSON.parse(String(init?.body));assert.equal(sent.model,'minimax/minimax-m3');assert.equal(sent.provider.allow_fallbacks,false);assert.equal(sent.provider.require_parameters,true);assert.equal(sent.provider.data_collection,'deny');assert.deepEqual(sent.provider.max_price,{prompt:paidDefinition.inputMicrosPerMillion/1000000,completion:paidDefinition.outputMicrosPerMillion/1000000});assert.equal(sent.response_format.json_schema.strict,true);return response(routerPayload);})(routerRequest);
assert.equal(routerAttempts,1);assert.deepEqual(routed.value,raw);assert.equal(routed.usage.cachedInputTokens,2);assert.equal(routed.usage.reasoningTokens,3);
await assert.rejects(()=>openRouterAdapter('key',async()=>response({...routerPayload,choices:[{finish_reason:'length',message:{content:'{}'}}]}))(routerRequest),/INCOMPLETE/);
await assert.rejects(()=>openRouterAdapter('key',async()=>response({...routerPayload,usage:undefined}))(routerRequest),/USAGE/);
await assert.rejects(()=>openRouterAdapter('key',async()=>response({...routerPayload,choices:[{finish_reason:'stop',message:{refusal:'declined',content:'{}'}}]}))(routerRequest),/REFUSED/);
assert(resolveModelGateway({DB:db,MODEL_GATEWAY_ENABLED:'1',OPENROUTER_API_KEY:'fixture'})?.adapters.openrouter);
const modernClaude=anthropicAdapter('test-only-key',async(_url,init)=>{const sent=JSON.parse(String(init?.body));assert.equal(sent.tool_choice,undefined);assert.equal(sent.tools,undefined);assert.equal(sent.output_config.format.type,'json_schema');assert.deepEqual(sent.output_config.format.schema,providerReq.schema);return response({id:'modern-claude',stop_reason:'end_turn',usage:{input_tokens:20,output_tokens:10,cache_read_input_tokens:2,cache_creation_input_tokens:1},content:[{type:'thinking',thinking:'internal'},{type:'text',text:JSON.stringify(raw)}]});});
const modern=await modernClaude({...providerReq,definition:{...paidDefinition,provider:'anthropic',model:'claude-sonnet-5-5',structuredOutput:true}});assert.deepEqual(modern.value,raw);assert.equal(modern.usage.reasoningTokens,0);
await assert.rejects(()=>anthropicAdapter('key',async()=>response({stop_reason:'max_tokens',usage:{input_tokens:20,output_tokens:10},content:[]}))({...providerReq,definition:{...paidDefinition,provider:'anthropic',structuredOutput:true}}),/INCOMPLETE/);
assert.deepEqual((await workersAiAdapter({run:async()=>({response:JSON.stringify(raw),usage:{prompt_tokens:20,completion_tokens:10}})})({...providerReq,definition:DEFAULT_AUTO_MODEL})).value,raw);
assert.deepEqual((await workersAiAdapter({run:async()=>({choices:[{finish_reason:"stop",message:{content:JSON.stringify(raw)}}],usage:{prompt_tokens:20,completion_tokens:10}})})({...providerReq,definition:DEFAULT_AUTO_MODEL})).value,raw);
for(const [payload,expected] of [
  [{status:"incomplete",usage:{input_tokens:1,output_tokens:1}},/INCOMPLETE/],
  [{status:"completed",usage:{input_tokens:1,output_tokens:1},output:[{type:"message",content:[{type:"refusal"}]}]},/REFUSED/],
  [{status:"completed",usage:{input_tokens:1,output_tokens:1},output_text:"invalid"},/INVALID_JSON/],
  [{status:"completed",usage:{input_tokens:1,output_tokens:1},output_text:""},/INVALID_JSON/],
  [{status:"completed",output_text:"{}"},/USAGE/],
] as const)await assert.rejects(()=>openAiAdapter("key",async()=>response(payload))(providerReq),expected);
for(const [status,expected] of [[429,/QUOTA/],[403,/AUTH/],[500,/PROVIDER/]] as const)await assert.rejects(()=>openAiAdapter("key",async()=>response({secret:"never echo"},status))(providerReq),expected);
await assert.rejects(()=>openAiAdapter("",async()=>response({}))(providerReq),/CONFIGURED/);
await assert.rejects(()=>anthropicAdapter("",async()=>response({}))(providerReq),/CONFIGURED/);
await assert.rejects(()=>openAiAdapter("key",async()=>{throw Error("secret");})(providerReq),/TRANSPORT/);
await assert.rejects(()=>openAiAdapter("key",async()=>new Response("invalid"))(providerReq),/INVALID_RESPONSE/);
await assert.rejects(()=>anthropicAdapter("key",async()=>response({stop_reason:"max_tokens",usage:{input_tokens:1,output_tokens:1}}))(providerReq),/INCOMPLETE/);
await assert.rejects(()=>anthropicAdapter("key",async()=>response({stop_reason:"tool_use",usage:{input_tokens:1,output_tokens:1},content:[{type:"tool_use",name:"wrong",input:{}}]}))(providerReq),/INVALID_TOOL/);
await assert.rejects(()=>workersAiAdapter({run:async()=>{throw Error("secret");}})(providerReq),/TRANSPORT/);
await assert.rejects(()=>workersAiAdapter({run:async()=>({errors:[{message:"secret"}]})})(providerReq),/PROVIDER/);
await assert.rejects(()=>workersAiAdapter({run:async()=>({response:[],usage:{input_tokens:1,output_tokens:1}})})(providerReq),/EMPTY/);
await assert.rejects(()=>workersAiAdapter({run:async()=>({choices:[{finish_reason:"length"}],usage:{input_tokens:1,output_tokens:1}})})(providerReq),/INCOMPLETE/);
const aborted=new AbortController();aborted.abort();
await assert.rejects(()=>workersAiAdapter({run:async()=>({})})({...providerReq,signal:aborted.signal}),/TIMEOUT/);
await assert.rejects(()=>openAiAdapter("key",async()=>{throw Error("secret");})({...providerReq,signal:aborted.signal}),/TIMEOUT/);

await defineBillingPlan(db,"admin",{id:"team-pilot",lane:"arc_hosted",features:["team_workspace","hosted_inference"]});
await defineBillingPlan(db,"admin",{id:"connect-pilot",lane:"connect",features:["apps"]});
await assignBillingPlan(db,"admin",{id:"team-assignment",planId:"team-pilot",subjectType:"organization",subjectId:"personal:owner",expiresAt:future});
await assignBillingPlan(db,"admin",{id:"connect-assignment",planId:"connect-pilot",subjectType:"user",subjectId:"owner",expiresAt:future});
assert.deepEqual((await getBillingEntitlements(db,context,"arc_hosted")).features,["hosted_inference","team_workspace"]);
assert.deepEqual((await getBillingEntitlements(db,context,"connect")).features,["apps"],"Hosted plans cannot enable Connect features");
await deny(()=>defineBillingPlan(db,"owner",{id:"bad",lane:"connect",features:["apps"]}),/ADMIN/);
await deny(()=>defineBillingPlan(db,"admin",{id:"bad",lane:"connect",features:["paid_models"]}),/INVALID_PLAN/);
await deny(()=>defineBillingPlan(db,"admin",{id:"bad",lane:"arc_hosted",features:["invented"]}),/INVALID_PLAN/);
await deny(()=>assignBillingPlan(db,"admin",{id:"bad",planId:"missing",subjectType:"user",subjectId:"owner",expiresAt:future}),/NOT_FOUND/);
await deny(()=>assignBillingPlan(db,"admin",{id:"bad",planId:"team-pilot",subjectType:"user",subjectId:"owner",expiresAt:"2000-01-01"}),/INVALID_PLAN/);
await deny(()=>getBillingEntitlements(db,{userId:"other",organizationId:"personal:owner"},"arc_hosted"),/MEMBERSHIP/);
await deny(()=>getBillingEntitlements(db,context,"invalid" as "connect"),/INVALID_PLAN/);
sql.prepare("UPDATE billing_plan_assignments SET revoked_at=? WHERE id='team-assignment'").run(now);
assert.deepEqual((await getBillingEntitlements(db,context,"arc_hosted")).features,[]);
await deny(()=>runModelGateway({...gateway,models:[{...DEFAULT_AUTO_MODEL,inputMicrosPerMillion:Number.MAX_SAFE_INTEGER}]},req(),validate),/BUDGET_INVALID/);
assert(resolveModelGateway({DB:db,MODEL_GATEWAY_ENABLED:"1",OPENAI_API_KEY:"test-key",ANTHROPIC_API_KEY:"test-key",MODEL_GATEWAY_LOCAL_TEST_ENDPOINT:"http://127.0.0.1:9999"})?.adapters.anthropic);

await reset();
for(const provider of ['openai','anthropic','openrouter'] as const){
 await grantPaidModel(db,'admin',{id:'cache-'+provider,userId:'owner',organizationId:'personal:owner',provider,maxCostMicros:1000000,expiresAt:future});
 const definition:ModelDefinition={...paidDefinition,provider,cachedInputMicrosPerMillion:100000,cacheWriteMicrosPerMillion:2000000,cacheWrite5mMicrosPerMillion:1250000};
 const observed:ModelUsage={inputTokens:provider==='anthropic'?70:100,outputTokens:5,cachedInputTokens:20,cacheWriteTokens:10,reasoningTokens:2,...(provider==='anthropic'?{cacheWrite5mTokens:6,cacheWrite1hTokens:4}:{})};
 const settled=await runModelGateway({...gateway,models:[definition],paidGrantId:'cache-'+provider,adapters:{[provider]:async()=>({value:raw,usage:observed,providerRequestId:'cache-fixture'})}},req({modelId:definition.id}),validate);
 const actual=JSON.parse(sql.prepare('SELECT settlement_json FROM billing_reservations WHERE id=?').get(settled.reservationId)!.settlement_json as string).actual;
 assert.equal(actual.costMicros,provider==='anthropic'?98:102,'Cache reads, cache write TTLs and reasoning must be rated exactly once');
}
console.log("Model/Billing foundation: real SQLite atomic caps, concurrency, grants, tenant isolation, unknown reservation retention, four mocked provider contracts and exact cache accounting passed.");
sql.close();
