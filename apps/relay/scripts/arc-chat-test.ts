import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {handleArcChat,arcMessages,arcContext,type ArcEnv,type ArcRun} from '../src/arc-chat.js';
import {runArcStep,validateArcDecision,executeArcTool} from '../src/arc-chat-runtime.js';
import {ARC_MODELS,prepareArcBudget} from '../src/arc-chat-model.js';
import {nextArcOccurrence,arcScheduleSchema,createArcWork,manageArcWork} from '../src/arc-work.js';
import {runAutomationTick} from '../src/automations.js';
import {sha256Hex} from '../src/auth.js';
import {activateArcTrial,arcAccountAccess} from '../src/arc-trial.js';
import {reserveBilling,settleBilling} from '../src/billing-ledger.js';
import {seal} from '../src/app-oauth.js';

const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const name of fs.readdirSync(path.join(dir,'migrations')).filter(n=>n.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(dir,'migrations',name),'utf8'));
const db={prepare(query:string){const statement=sql.prepare(query);const bound=(args:unknown[])=>({async first(){return statement.get(...args)||null;},async all(){return{results:statement.all(...args)};},async run(){return this.runSync();},runSync(){const r=statement.run(...args);return{success:true,meta:{changes:Number(r.changes)}};}});return{...bound([]),bind(...args:unknown[]){assert(!args.includes(undefined),query);return bound(args);}};},async batch(statements:Array<{runSync:()=>unknown}>){sql.exec('BEGIN IMMEDIATE');try{const values=statements.map(s=>s.runSync());sql.exec('COMMIT');return values;}catch(e){sql.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
const now=new Date().toISOString(),future=new Date(Date.now()+3600000).toISOString(),origin='https://mcp.remotearc.app';
for(const id of ['owner','other']){sql.prepare("INSERT INTO users(id,google_sub,email,role,created_at) VALUES(?,?,?,'user',?)").run(id,id,id+'@example.invalid',now);sql.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(await sha256Hex('test-'+id),id,future,now);}
let wakes=0,models=0;const decisions:unknown[]=[];
const env={DB:db,PUBLIC_ORIGIN:origin,APP_ORIGIN:origin,APP_TOKEN_KEY:Buffer.alloc(32,9).toString('base64'),ENABLE_APPS:'1',ARC_CHAT_ENABLED:'1',ARC_CREDITS_ENABLED:process.env.ARC_CREDITS_ENABLED,ARC_RUNTIME:{getByName:()=>({fetch:async()=>{wakes++;return Response.json({started:true});}})},MODEL_GATEWAY:{DB:db,enabled:true,models:ARC_MODELS,adapters:{openai:async()=>{models++;assert(decisions.length,'No expected model decision');return{value:decisions.shift(),usage:{inputTokens:100,outputTokens:100,cachedInputTokens:0,cacheWriteTokens:0,reasoningTokens:0},providerRequestId:'fixture'};}}}} as unknown as ArcEnv;
const req=(route:string,method='GET',body?:unknown,user='owner',extra:Record<string,string>={})=>new Request(origin+'/api/arc/'+route,{method,headers:{cookie:'rl_session=test-'+user,origin,'content-type':'application/json',...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
const api=(route:string,method='GET',body?:unknown,user='owner',extra?:Record<string,string>)=>handleArcChat(req(route,method,body,user,extra),env);
const decode=async(r:Response,expected=200)=>{const value=await r.json() as any;assert.equal(r.status,expected,JSON.stringify(value));return value;};
const reply=(message:string)=>({decision:'reply',tool:'none',arguments_json:'{}',message});
const tool=(name:string,args:unknown)=>({decision:'tool',tool:name,arguments_json:JSON.stringify(args),message:'Working on your request.'});
const create=async()=> (await decode(await api('sessions','POST',{}),201)).id as string;
const send=async(id:string,text:string,requestId=crypto.randomUUID())=>decode(await api('sessions/'+id+'/messages','POST',{text,requestId}),202);
const row=(id:string)=>sql.prepare('SELECT * FROM arc_chat_runs WHERE id=?').get(id) as ArcRun;

assert.equal((await handleArcChat(new Request(origin+'/api/arc/status'),env)).status,401);
assert.equal((await decode(await handleArcChat(req('status'),{...env,ARC_CHAT_ENABLED:undefined}))).enabled,false);
assert.equal((await decode(await api('status'))).enabled,true);
assert.equal((await api('sessions','POST',{},'owner',{origin:'https://evil.invalid'})).status,403);
assert.equal((await api('sessions','POST',{},'owner',{'content-type':'text/plain'})).status,415);
assert.equal((await api('sessions','POST',{})).status,402,'An account must activate its trial or have paid access');
assert.equal((await api('trial','POST',{confirm:true},'owner',{origin:'https://evil.invalid'})).status,403);
assert.equal((await api('trial','POST',{})).status,400);
assert.equal((await handleArcChat(req('trial','POST',{confirm:true}),{...env,ARC_CHAT_ENABLED:undefined})).status,503,'Do not start the clock before platform setup is complete');
await decode(await api('trial','POST',{confirm:true}));
const claimed=sql.prepare('SELECT * FROM arc_trials WHERE user_id=?').get('owner') as any;
assert.equal(Date.parse(claimed.expires_at)-Date.parse(claimed.started_at),14*86400000);
await Promise.all(Array.from({length:8},()=>api('trial','POST',{confirm:true})));
assert.equal(sql.prepare('SELECT expires_at FROM arc_trials WHERE user_id=?').get('owner')?.expires_at,claimed.expires_at,'Retries never restart or extend the trial');
assert.equal((await arcAccountAccess(env,'other')).allowed,false);
assert.equal((await api('sessions','POST',{modelId:'unlisted'})).status,503);
const id=await create();
assert.equal((await api('sessions/'+id,'GET',undefined,'other')).status,404);
assert.equal((await api('sessions/'+id+'/messages','POST',{text:'x'.repeat(6001),requestId:'too-long'})).status,400);
assert.equal((await api('sessions/'+id+'/messages','POST',{text:'x'.repeat(21000),requestId:'huge'})).status,413);
const requestId=crypto.randomUUID(),sent=await send(id,'Hello Arc',requestId),run=sent.run;
const repeat=await send(id,'Hello Arc',requestId);assert.equal(repeat.run.id,run.id);
assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM arc_chat_messages WHERE session_id=?').get(id)?.count,1);
assert.equal((await api('sessions/'+id+'/messages','POST',{text:'Changed',requestId})).status,409);
assert.equal((await api('sessions/'+id+'/messages','POST',{text:'Concurrent',requestId:crypto.randomUUID()})).status,409);
decisions.push(reply('Hello. What would you like to get done?'));
assert.equal(await runArcStep(env,run.id),false);assert.equal(row(run.id).status,'succeeded');
const snapshot=await decode(await api('sessions/'+id));assert.equal(snapshot.messages.at(-1).text,'Hello. What would you like to get done?');
const ciphertext=JSON.stringify(sql.prepare('SELECT * FROM arc_chat_messages WHERE role=?').get('user'));assert(!ciphertext.includes('Hello Arc'));
assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM billing_reservations WHERE status='completed'").get()?.count,1);
const again=await send(id,'Continue the conversation');decisions.push(reply('Your earlier request was Hello Arc.'));await runArcStep(env,again.run.id);assert.equal((await arcMessages(env,'owner',id)).filter(m=>m.role==='user').length,2);

const cancelled=await send(id,'Stop this');await decode(await api('sessions/'+id+'/cancel','POST',{runId:cancelled.run.id}));const beforeCancel=models;assert.equal(await runArcStep(env,cancelled.run.id),false);assert.equal(models,beforeCancel);
const timed=await send(id,'Expired work');sql.prepare("UPDATE arc_chat_runs SET deadline='2000-01-01' WHERE id=?").run(timed.run.id);await runArcStep(env,timed.run.id);assert.equal(row(timed.run.id).error_code,'ARC_TIME_LIMIT');
const interrupted=await send(id,'Do not replay');sql.prepare("INSERT INTO arc_chat_steps(run_id,step,status,created_at,updated_at) VALUES(?,0,'dispatching',?,?)").run(interrupted.run.id,now,now);assert.equal(await runArcStep(env,interrupted.run.id),false);assert.equal(row(interrupted.run.id).status,'unknown');
// Closing the release gate must also stop a decision saved before the switch.
const gated=await send(id,'Previously planned external write');
const savedDecision=await seal(env,tool('call_app',{connectionId:'saved',operation:'issues.create',arguments:{}}),arcContext('owner',`${gated.run.id}:0:decision`));
sql.prepare("INSERT INTO arc_chat_steps(run_id,step,status,decision_ciphertext,created_at,updated_at) VALUES(?,0,'model_complete',?,?,?)").run(gated.run.id,savedDecision,now,now);
let gatedDispatches=0;const beforeGate=models;
await runArcStep({...env,ARC_CHAT_ENABLED:'0'},gated.run.id,{executeTool:async()=>{gatedDispatches++;return {};}});
assert.equal(row(gated.run.id).error_code,'ARC_NOT_CONFIGURED');assert.equal(gatedDispatches,0);assert.equal(models,beforeGate);
assert.equal((await handleArcChat(req('sessions','POST',{}),{...env,ARC_CHAT_ENABLED:'0'})).status,503);
assert.equal((await handleArcChat(req('sessions/'+id+'/messages','POST',{text:'blocked',requestId:crypto.randomUUID()}),{...env,ARC_CHAT_ENABLED:'0'})).status,503);
assert.equal((await handleArcChat(req('sessions/'+id),{...env,ARC_CHAT_ENABLED:'0'})).status,200,'Existing results remain readable');
const steps=await send(id,'Bound steps');sql.prepare('UPDATE arc_chat_runs SET step=8 WHERE id=?').run(steps.run.id);await runArcStep(env,steps.run.id);assert.equal(row(steps.run.id).error_code,'ARC_STEP_LIMIT');
const tokens=await send(id,'Bound tokens');sql.prepare('UPDATE arc_chat_runs SET max_tokens=100 WHERE id=?').run(tokens.run.id);await runArcStep(env,tokens.run.id);assert.equal(row(tokens.run.id).error_code,'ARC_TOKEN_LIMIT');
assert.throws(()=>validateArcDecision({decision:'reply',tool:'call_app',arguments_json:'{}',message:'x'}));assert.throws(()=>validateArcDecision({...reply('x'),arguments_json:'[]'}));

// Real app dispatcher, encrypted connection and mocked provider HTTP, then an
// evidence-based assistant reply through the same paid-reservation gateway.
const connectionId=crypto.randomUUID();sql.prepare(`INSERT INTO app_connections(id,user_id,provider,account_id,account_label,status,permissions_json,scopes_json,token_ciphertext,created_at,updated_at) VALUES(?,'owner','github','fixture','Fixture','active','["read","write"]','["repo"]',?,?,?)`).run(connectionId,await seal(env,{accessToken:'fixture-credential',scopes:['repo'],expiresAt:null},`app-token:owner:github:${connectionId}`),now,now);
const nativeFetch=globalThis.fetch;let appDispatches=0;
globalThis.fetch=(async(url,init)=>{assert.equal(new URL(String(url)).hostname,'api.github.com');assert.equal(init?.method,'POST');appDispatches++;return Response.json({id:42,title:'Created task',html_url:'https://github.com/example/repo/issues/42'});}) as typeof fetch;
try{
 const task=await send(id,'Create an issue for the release');decisions.push(tool('call_app',{connectionId,operation:'issues.create',arguments:{repo:'example/repo',title:'Created task',body:'Requested by the user'}}),reply('Created issue #42.'));
 assert.equal(await runArcStep(env,task.run.id),true);assert.equal(appDispatches,1);assert.equal(await runArcStep(env,task.run.id),false);assert.equal(row(task.run.id).status,'succeeded');
 assert.equal((await arcMessages(env,'owner',id)).filter(m=>m.run_id===task.run.id&&m.role==='tool')[0]?.status,'completed');
 assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM app_calls WHERE status='pending_approval'").get()?.count,0);
 await runArcStep(env,task.run.id);assert.equal(appDispatches,1);
}finally{globalThis.fetch=nativeFetch;}

const unknown=await send(id,'Uncertain external write');decisions.push(tool('call_app',{connectionId,operation:'issues.create',arguments:{repo:'example/repo',title:'unknown',body:'unknown'}}));
let dispatches=0;await runArcStep(env,unknown.run.id,{executeTool:async()=>{dispatches++;throw new Error('ARC_TOOL_OUTCOME_UNKNOWN');}});assert.equal(row(unknown.run.id).status,'unknown');await runArcStep(env,unknown.run.id);assert.equal(dispatches,1);assert.equal((await arcMessages(env,'owner',id)).filter(m=>m.run_id===unknown.run.id&&m.role==='tool')[0]?.status,'unknown');

// Conversational delegation uses the existing leased scheduler, no forms.
const delegation=await send(id,'Save one task to inspect my apps');decisions.push(tool('create_task',{name:'Inspect connected apps',instructions:'Inspect connected apps and report actual status.',schedule:{type:'once'}}),reply('Task saved.'));
await runArcStep(env,delegation.run.id);await runArcStep(env,delegation.run.id);
let work=await decode(await api('work'));const saved=work.work[0];assert.equal(saved.kind,'task');assert.equal(saved.status,'waiting');
assert.equal((await api('work','GET',undefined,'other')).status,200);assert.equal((await decode(await api('work','GET',undefined,'other'))).work.length,0);
await assert.rejects(()=>manageArcWork(env,{...row(delegation.run.id),user_id:'other'},{action:'pause',id:saved.id}),/NOT_FOUND/);
await runAutomationTick(env,new Date(Date.now()+1000),saved.id);
const scheduled=sql.prepare('SELECT * FROM arc_chat_runs WHERE automation_id=?').get(saved.id) as ArcRun;assert(scheduled,'Scheduler creates a real persisted chat run');
const beforeSchedule=sql.prepare('SELECT COUNT(*) AS count FROM arc_chat_runs WHERE automation_id=?').get(saved.id)?.count;
decisions.push(reply('All connected apps were inspected.'));
await runArcStep(env,scheduled.id,{executeTool:async()=>({status:'completed'})});
sql.prepare("UPDATE automations SET next_run_at=?,lease_until=NULL,lease_token=NULL WHERE id=?").run(now,saved.id);
await runAutomationTick(env,new Date(Date.now()+1000),saved.id);assert.equal(sql.prepare('SELECT status FROM automations WHERE id=?').get(saved.id)?.status,'completed');assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM arc_chat_runs WHERE automation_id=?').get(saved.id)?.count,beforeSchedule);
await assert.rejects(()=>createArcWork(env,{...scheduled,step:2},{name:'Recursive',instructions:'loop',schedule:{type:'once'}},false),/RECURSIVE/);

const schedule=arcScheduleSchema.parse({type:'daily',time:'09:00',timezone:'Pacific/Auckland',weekdays:[1,2,3,4,5]});assert.equal(nextArcOccurrence(schedule,new Date('2026-10-16T21:00:00Z')),'2026-10-18T20:00:00.000Z');
assert.equal(nextArcOccurrence({type:'daily',time:'02:30',timezone:'America/New_York'},new Date('2026-03-07T08:00:00Z')),'2026-03-09T06:30:00.000Z','Skip nonexistent spring-forward local time');
assert.equal(nextArcOccurrence({type:'daily',time:'01:30',timezone:'America/New_York'},new Date('2026-11-01T05:30:00Z')),'2026-11-02T06:30:00.000Z','Fall-back does not duplicate a local occurrence');
assert.throws(()=>nextArcOccurrence({type:'daily',time:'09:00',timezone:'Bad/Zone'},new Date()),/TIMEZONE/);
// Existing administrator caps are never silently raised by a chat request.
const premium=await prepareArcBudget(env,'owner','personal:owner',id,'gpt-5.4');
sql.prepare('UPDATE billing_model_grants SET max_cost_micros=10000 WHERE id=?').run(premium.gateway.paidGrantId!);
const reservations=await Promise.allSettled(Array.from({length:3},(_,i)=>reserveBilling(db,{userId:'owner',organizationId:'personal:owner',taskId:id,runId:'trial-budget-test',operationId:'op-'+i,lane:'arc_hosted',provider:'openai',modelId:'gpt-5.4',authorizationId:premium.gateway.paidGrantId!,maximum:{credits:1,costMicros:4000,neurons:0}})));
assert.equal(reservations.filter(r=>r.status==='fulfilled').length,2,'Concurrent calls cannot exceed the lifetime premium trial allowance');
const reserved=(reservations.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<{id:string}>).value;
await settleBilling(db,{userId:'owner',organizationId:'personal:owner'},reserved.id,{status:'unknown'});
await assert.rejects(()=>reserveBilling(db,{userId:'owner',organizationId:'personal:owner',taskId:id,runId:'trial-budget-test',operationId:'unknown-retry',lane:'arc_hosted',provider:'openai',modelId:'gpt-5.4',authorizationId:premium.gateway.paidGrantId!,maximum:{credits:1,costMicros:4000,neurons:0}}),/BILLING_QUOTA/);
sql.prepare("UPDATE billing_budgets SET limit_units=spent_units+reserved_units+1 WHERE scope_type='user' AND scope_id='owner' AND metric='cost_micros'").run();const lowered=sql.prepare("SELECT limit_units FROM billing_budgets WHERE scope_type='user' AND scope_id='owner' AND metric='cost_micros'").get()?.limit_units;await prepareArcBudget(env,'owner','personal:owner',id,'auto');assert.equal(sql.prepare("SELECT limit_units FROM billing_budgets WHERE scope_type='user' AND scope_id='owner' AND metric='cost_micros'").get()?.limit_units,lowered);
sql.prepare("UPDATE arc_trials SET started_at='2000-01-01',expires_at='2000-01-15' WHERE user_id='owner'").run();
assert.equal((await api('sessions','POST',{})).status,402,'Expired trial blocks new paid inference');
assert.equal((await api('sessions/'+id)).status,200,'Expired trials can still read existing results');
await decode(await api('trial','POST',{confirm:true}));assert.equal((await arcAccountAccess(env,'owner')).status,'expired','An expired trial cannot be reclaimed');
await decode(await api('sessions/'+id,'DELETE'));assert.equal((await api('sessions/'+id)).status,404);assert(wakes>0);
console.log('Arc Chat: authenticated encrypted conversations, funded inference, direct Apps execution, quotas, idempotency, cancellation, durable tasks and DST schedules passed.');
