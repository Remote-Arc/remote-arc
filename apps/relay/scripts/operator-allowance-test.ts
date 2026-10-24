import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {mock} from 'node:test';
import {creditBalance} from '../src/arc-credits.js';
import {arcAccountAccess} from '../src/arc-trial.js';
import {ensureOperatorAllowance} from '../src/operator-allowance.js';
import {grantArcCredits} from '../src/arc-credits.js';
import {reserveBilling} from '../src/billing-ledger.js';
import {prepareArcBudget} from '../src/arc-chat-model.js';
import {runModelGateway} from '../src/model-gateway.js';

const sql=new DatabaseSync(':memory:');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
const db={prepare(query:string){const stmt=sql.prepare(query);const bind=(args:any[])=>({async first(){return stmt.get(...args)||null},async all(){return{results:stmt.all(...args)}},async run(){return this.sync()},sync(){const value=stmt.run(...args);return{success:true,meta:{changes:Number(value.changes)}}}});return{...bind([]),bind(...args:any[]){assert(!args.includes(undefined),query);return bind(args)}}},async batch(statements:any[]){sql.exec('BEGIN');try{const values=statements.map(statement=>statement.sync());sql.exec('COMMIT');return values}catch(error){sql.exec('ROLLBACK');throw error}}} as any;
const now='2026-10-24T00:00:00.000Z';
sql.prepare("INSERT INTO users(id,google_sub,email,role,created_at) VALUES('operator','g-op','Operator@Example.invalid','admin',?)").run(now);
sql.prepare("INSERT INTO users(id,google_sub,email,role,created_at) VALUES('member','g-m','member@example.invalid','user',?)").run(now);
for(const id of ['operator','member'])sql.prepare("INSERT OR IGNORE INTO organization_members(organization_id,user_id,role,status,created_at) VALUES(?,?,'owner','active',?)").run('personal:'+id,id,now);
const env={DB:db,ARC_PLATFORM_ENABLED:'1',OPENAI_API_KEY:'fixture',ANTHROPIC_API_KEY:'fixture',OPENROUTER_API_KEY:'fixture',OPERATOR_EMAIL:'operator@example.invalid',OPERATOR_MONTHLY_CREDITS:'5000'} as any;

// Disabled cases never grant anything.
assert.equal(await ensureOperatorAllowance({...env,OPERATOR_EMAIL:''},now),null);
assert.equal(await ensureOperatorAllowance({...env,ARC_PLATFORM_ENABLED:'0'},now),null);
assert.equal(await ensureOperatorAllowance({...env,OPERATOR_EMAIL:'member@example.invalid'},now),null,'A non-admin account never receives the operator allowance');
assert.equal(await ensureOperatorAllowance({...env,OPERATOR_MONTHLY_CREDITS:'1000000'},now),null,'An implausible allowance is refused rather than granted');
assert.equal((sql.prepare('SELECT COUNT(*) n FROM arc_credit_lots').get() as any).n,0);

// One bounded lot and a Pro plan per month, idempotent across cron ticks.
const first=await ensureOperatorAllowance(env,now);assert(first);
await ensureOperatorAllowance(env,'2026-10-24T00:05:00.000Z');await ensureOperatorAllowance(env,'2026-10-31T23:55:00.000Z');
const lots=sql.prepare("SELECT source,granted_units,starts_at,expires_at,actor_id FROM arc_credit_lots WHERE user_id='operator'").all() as any[];
assert.equal(lots.length,1);assert.deepEqual({...lots[0]},{source:'promotion',granted_units:5_000_000,starts_at:'2026-10-01T00:00:00.000Z',expires_at:'2026-11-01T00:00:00.000Z',actor_id:'operator'});
assert.equal((await creditBalance(db,'operator',now)).available,5000);
const plans=sql.prepare("SELECT plan_id,expires_at FROM billing_plan_assignments WHERE subject_id='operator'").all() as any[];
assert.equal(plans.length,1);assert.equal(plans[0].plan_id,'arc-pro-v1');
assert.equal((await arcAccountAccess(env,'operator',now)).paid,true,'The operator uses Arc on the paid path');

// An operator's Pro plan must work for a manually selected model, like a
// paid subscription. Its provider authority expires with the bounded Credit lot.
const grants=sql.prepare("SELECT provider,max_cost_micros,expires_at,granted_by_user_id FROM billing_model_grants WHERE user_id='operator' ORDER BY provider").all() as any[];
assert.equal(grants.length,3,'Operator provisioning must include all three paid provider authorities');
for(const grant of grants){assert.equal(grant.max_cost_micros,10_000_000);assert.equal(grant.expires_at,'2026-11-01T00:00:00.000Z');assert.equal(grant.granted_by_user_id,'operator');}
assert.deepEqual(grants.map(g=>g.provider),['anthropic','openai','openrouter']);
sql.prepare("INSERT INTO automations(id,user_id,name,kind,action_json,created_at,updated_at) VALUES('operator-task','operator','Fixture task','goal_loop','{}',?,?)").run(now,now);
mock.timers.enable({apis:['Date'],now:Date.parse(now)});
try{
 for(const selected of ['gpt-6-luna','claude-haiku-5-5','minimax-m3']){
  const prepared=await prepareArcBudget(env,'operator','personal:operator','operator-task',selected);
  assert.match(prepared.gateway.paidGrantId!,/^operator:operator:2026-10:/);
  let attempts=0;
  const result=await runModelGateway({...prepared.gateway,adapters:{[prepared.definition.provider]:async()=>{attempts++;return{value:{ready:true},usage:{inputTokens:20,outputTokens:10,cachedInputTokens:0,cacheWriteTokens:0,reasoningTokens:0}};}}},{context:{userId:'operator',organizationId:'personal:operator',taskId:'operator-task',runId:'selected-'+selected,operationId:'model',lane:'arc_hosted'},modelId:selected,system:'Return fixture readiness.',user:'Check readiness.',schema:{type:'object',properties:{ready:{type:'boolean'}},required:['ready'],additionalProperties:false},maxOutputTokens:64},value=>{assert.deepEqual(value,{ready:true});return value;});
  assert.equal(attempts,1,'A manually selected operator model reaches the provider once');
  assert.equal(result.modelId,selected);
  assert.equal((sql.prepare('SELECT status FROM billing_reservations WHERE id=?').get(result.reservationId) as any).status,'completed');
 }
 // Repeated cron provisioning cannot revive explicitly revoked provider access.
 sql.prepare("UPDATE billing_model_grants SET revoked_at=? WHERE id='operator:operator:2026-10:openai'").run(now);
 await ensureOperatorAllowance(env,now);
 assert.equal((sql.prepare("SELECT revoked_at FROM billing_model_grants WHERE id='operator:operator:2026-10:openai'").get() as any).revoked_at,now);
 await assert.rejects(()=>prepareArcBudget(env,'operator','personal:operator','operator-task','gpt-6-luna'),/PAID_MODEL_NOT_AUTHORIZED/);
}finally{mock.timers.reset();}

// A new month adds one more lot and renews the plan before it lapses.
await ensureOperatorAllowance(env,'2026-11-01T00:00:00.000Z');await ensureOperatorAllowance(env,'2026-11-01T00:05:00.000Z');
assert.equal((sql.prepare("SELECT COUNT(*) n FROM arc_credit_lots WHERE user_id='operator'").get() as any).n,2);
assert.equal((sql.prepare("SELECT COUNT(*) n FROM billing_model_grants WHERE user_id='operator'").get() as any).n,6,'A new month creates a new bounded provider grant for each provider');
assert.equal((await creditBalance(db,'operator','2026-11-01T00:05:00.000Z')).available,5000,'Last month\'s Credits do not accumulate');
assert.equal((sql.prepare("SELECT COUNT(*) n FROM billing_plan_assignments WHERE subject_id='operator'").get() as any).n,2);
assert.equal((sql.prepare("SELECT COUNT(*) n FROM arc_credit_lots WHERE user_id='member'").get() as any).n,0);
// A wallet that cannot cover a step's worst case is named as exhausted Credits,
// not a generic quota failure.
await grantArcCredits(db,{userId:'member',source:'promotion',sourceRef:'fixture-small',units:3000,startsAt:now,expiresAt:'2027-01-01T00:00:00.000Z',reason:'Small fixture lot',actorId:'operator'},now);
const reserve=(costMicros:number)=>reserveBilling(db,{userId:'member',organizationId:'personal:member',taskId:'task',runId:'run',operationId:'op-'+costMicros,lane:'arc_hosted',provider:'openai',modelId:'arc-auto',authorizationId:'none',maximum:{credits:1,costMicros,neurons:0},creditWallet:true},'2026-10-24T01:00:00.000Z');
await assert.rejects(()=>reserve(8000),/BILLING_CREDITS_EXHAUSTED/);
await assert.rejects(()=>reserve(2000),/BILLING_QUOTA_OR_AUTHORITY_UNAVAILABLE/,'An affordable step denied for another reason keeps the general code');
console.log('PASS: operator allowance is admin-only, bounded, monthly, idempotent, audited, and keeps manually selected models on the paid Pro path with Credit-backed, expiring, revocation-safe provider grants.');
