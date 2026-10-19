import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fundingActivationSql,activateOpenAi} from '../../../scripts/activate-openai.mjs';
import {reserveBilling,settleBilling,type BillingReservationInput} from '../src/billing-ledger.js';
import {fundingOverview,updateFunding} from '../src/arc-funding.js';
import {activateArcTrial,publicArcAccess} from '../src/arc-trial.js';
import {arcModelAccess,prepareArcBudget} from '../src/arc-chat-model.js';
import {creditBalance} from '../src/arc-credits.js';
import {handleAdminPayments} from '../src/admin-payments.js';
import {sha256Hex} from '../src/auth.js';
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())sql.exec(fs.readFileSync('migrations/'+name,'utf8'));
const db={prepare(query:string){const statement=sql.prepare(query);const bound=(args:unknown[])=>({async first(){return statement.get(...args)||null;},async all(){return{results:statement.all(...args)};},async run(){return this.runSync();},runSync(){const result=statement.run(...args);return{success:true,meta:{changes:Number(result.changes)}};}});return{...bound([]),bind(...args:unknown[]){return bound(args);}};},async batch(statements:Array<{runSync:()=>unknown}>){sql.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.runSync());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
const now=new Date().toISOString(),day=now.slice(0,10),env={DB:db,ARC_PLATFORM_ENABLED:'1',OPENAI_API_KEY:'fixture',ANTHROPIC_API_KEY:'fixture',OPENROUTER_API_KEY:'fixture'};
for(const id of ['admin','one','two','three','four','five']){
 sql.prepare('INSERT INTO users(id,google_sub,email,role,created_at) VALUES(?,?,?,?,?)').run(id,id,id+'@example.invalid',id==='admin'?'admin':'user',now);
 sql.prepare(`INSERT INTO automations(id,user_id,name,kind,action_json,created_at,updated_at) VALUES(?,?,?,'goal_loop','{}',?,?)`).run('task:'+id,id,id,now,now);
}
sql.exec(fundingActivationSql);
sql.prepare('UPDATE arc_funding_policy SET enabled=1,total_micros=100000,daily_micros=80000').run();
for(const id of ['one','two','three','four','five'])await activateArcTrial(env,id);
assert.equal((await creditBalance(db,'one')).available,50,'Public trial pins the D1 50-Credit launch version');
assert.equal((await publicArcAccess(env,'one')).trialDays,14);
assert((await arcModelAccess(env,'one','personal:one','auto')).access.allowed);
for(const model of ['gpt-6-luna','gpt-6.1-sol','claude-sonnet-5-5'])await assert.rejects(()=>arcModelAccess(env,'one','personal:one',model),/PAID_MODEL_REQUIRED|MODEL_NOT_ALLOWED/);
const inputs:BillingReservationInput[]=[];
for(const id of ['one','two','three','four','five']){
 const prepared=await prepareArcBudget(env,id,'personal:'+id,'task:'+id,'auto');
 inputs.push({userId:id,organizationId:'personal:'+id,taskId:'task:'+id,runId:'run:'+id,operationId:'first',lane:'arc_hosted',provider:'openai',modelId:'arc-auto',authorizationId:prepared.gateway.paidGrantId!,maximum:{credits:1,costMicros:40000,neurons:0}});
}
const contenders=await Promise.allSettled(inputs.map(input=>reserveBilling(db,input)));
assert.equal(contenders.filter(r=>r.status==='fulfilled').length,2,'Atomic shared daily cap must hold under parallel reservations');
const winners=contenders.flatMap((r,i)=>r.status==='fulfilled'?[{...r.value,input:inputs[i]!}]:[]);
await settleBilling(db,winners[0]!.input,winners[0]!.id,{status:'completed',actual:{credits:1,costMicros:10000,neurons:0}});
await settleBilling(db,winners[1]!.input,winners[1]!.id,{status:'unknown'});
const third={...inputs[2]!,operationId:'smaller',maximum:{credits:1,costMicros:20000,neurons:0}};
await reserveBilling(db,third);
assert.equal((await fundingOverview(db)).reserved,60000,'Unknown calls retain their full reserve');
assert.equal((await reserveBilling(db,third)).dispatchAllowed,false,'Retry remains idempotent even near a shared cap');
await assert.rejects(()=>reserveBilling(db,{...inputs[3]!,operationId:'over-daily',maximum:{credits:1,costMicros:10001,neurons:0}}),/ARC_FUNDING/);
const tomorrow=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString();
// Seed tomorrow's normal per-user budgets/grant so only the cumulative cap is under test.
sql.prepare(`INSERT INTO billing_budgets SELECT scope_type,scope_id,lane,metric,?,limit_units,0,0,? FROM billing_budgets WHERE period_key=?`).run(tomorrow.slice(0,10),tomorrow,day);
sql.prepare('UPDATE billing_model_grants SET expires_at=?').run(new Date(Date.parse(tomorrow)+86400000).toISOString());
await reserveBilling(db,{...inputs[3]!,operationId:'tomorrow',maximum:{credits:1,costMicros:30000,neurons:0}},tomorrow);
await assert.rejects(()=>reserveBilling(db,{...inputs[4]!,operationId:'over-lifetime',maximum:{credits:1,costMicros:1,neurons:0}},tomorrow),/ARC_FUNDING/);
let overview=await fundingOverview(db);assert.equal(overview.spent+overview.reserved,100000);
await assert.rejects(()=>activateArcTrial(env,'admin'),/ARC_FUNDING/,'Do not start a trial clock after funding is exhausted');
await assert.rejects(()=>updateFunding(db,'admin',{revision:overview.revision,enabled:true,totalMicros:99999,dailyMicros:80000}),/BELOW_COMMITTED/);
overview=await updateFunding(db,'admin',{revision:overview.revision,enabled:false,totalMicros:100000,dailyMicros:80000});
await assert.rejects(()=>activateArcTrial(env,'admin'),/ARC_FUNDING/);
await assert.rejects(()=>updateFunding(db,'admin',{revision:overview.revision-1,enabled:true,totalMicros:100000,dailyMicros:80000}),/CHANGED/);
const start=sql.prepare('SELECT started_at FROM arc_funding_policy').get()!.started_at;
sql.exec(fundingActivationSql);assert.equal(sql.prepare('SELECT started_at FROM arc_funding_policy').get()!.started_at,start);
assert.equal(sql.prepare('SELECT revision FROM arc_commercial_heads WHERE product_id=\'arc-trial-v1\' AND mode=\'live\'').get()!.revision,2,'Reactivation preserves trial terms and version');
assert.throws(()=>sql.prepare('UPDATE arc_funding_policy SET started_at=?').run(tomorrow),/IMMUTABLE/);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM arc_funding_audit WHERE actor_id=\'admin\'').get()!.n,1,'Rejected and stale updates cannot write successful audit records');
sql.prepare(`INSERT INTO billing_plan_assignments(id,plan_id,subject_type,subject_id,expires_at,created_at,commercial_version_id) VALUES('paid','arc-plus-v1','user','five',?,?,'seed:live:arc-plus-v1')`).run(new Date(Date.now()+86400000).toISOString(),now);
sql.prepare('UPDATE arc_funding_policy SET enabled=1,total_micros=1000000,daily_micros=1000000').run();
assert.equal((await arcModelAccess(env,'five','personal:five','gpt-6.1-sol')).premium,true,'Plus unlocks configured manual models');
await assert.rejects(()=>reserveBilling(db,{...inputs[0]!,operationId:'forged-premium',modelId:'gpt-6.1-sol',maximum:{credits:1,costMicros:1,neurons:0}}),/ARC_FUNDING/,'An existing Auto grant cannot authorize an unpaid premium reservation');
for(const user of ['admin','one'])sql.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(await sha256Hex('funding-'+user),user,new Date(Date.now()+3600000).toISOString(),now);
const origin='https://admin.remotearc.app',adminEnv={...env,PUBLIC_ORIGIN:'https://mcp.remotearc.app',ADMIN_ORIGIN:origin};
const request=(user:string,method='GET',requestOrigin=origin)=>new Request(origin+'/api/admin/payments'+(method==='POST'?'/funding':''),{method,headers:{cookie:'rl_session=funding-'+user,origin:requestOrigin,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify({revision:1,enabled:false,totalMicros:1,dailyMicros:1})}:{})});
assert.equal((await handleAdminPayments(request('one'),adminEnv)).status,403);
assert.equal((await handleAdminPayments(request('one','POST'),adminEnv)).status,403);
assert.equal((await handleAdminPayments(request('admin','POST','https://evil.invalid'),adminEnv)).status,403);
const dashboard=await handleAdminPayments(request('admin'),adminEnv);assert.equal(dashboard.status,200);
const overviewResponse=await dashboard.json() as any;assert.equal(overviewResponse.funding.trials.total,5);assert(overviewResponse.funding.usage.some((r:any)=>r.model_id==='arc-auto'));
const launchEnv={GITHUB_ACTIONS:'true',GITHUB_REF:'refs/heads/master',GITHUB_ACTOR:'yaohuangguan',OPENAI_API_KEY:'test-model-key',CLOUDFLARE_API_TOKEN:'test-worker-token',CLOUDFLARE_D1_API_TOKEN:'test-database-token'};
const trace:string[]=[];
const activationFetch=async(url:string,init?:RequestInit)=>{
 const auth=new Headers(init?.headers).get('authorization');
 if(url==='https://api.openai.com/v1/responses'){
  assert.equal(auth,'Bearer test-model-key');const body=JSON.parse(init!.body as string);assert.equal(body.model,'gpt-6-luna');assert.equal(body.store,false);assert.equal(body.max_output_tokens,256);assert.equal(body.text.format.strict,true);trace.push('model');
  return Response.json({status:'completed',output_text:'{"ready":true}',usage:{input_tokens:20,output_tokens:10}});
 }
 if(url.includes('/d1/database/')){assert.equal(auth,'Bearer test-database-token');sql.exec(JSON.parse(init!.body as string).sql);trace.push('d1');return Response.json({success:true,result:[{success:true}]});}
 if(url.endsWith('/secrets')){assert.equal(auth,'Bearer test-worker-token');assert.equal(sql.prepare('SELECT enabled FROM arc_funding_policy').get()!.enabled,0,'Keep inference paused during secret writes');trace.push('secret');return Response.json({success:true,result:{}});}
 assert.equal(url,'https://agent.remotearc.app/api/runtime-config');assert.equal(auth,null,'Provider and Cloudflare tokens must not reach the application host');trace.push('runtime');return Response.json({arcAvailable:true});
};
await assert.rejects(()=>activateOpenAi({...launchEnv,GITHUB_REF:'refs/heads/feature'},activationFetch),/Protected/);assert.equal(trace.length,0);
await activateOpenAi(launchEnv,activationFetch);assert.deepEqual(trace,['model','d1','secret','secret','runtime','d1']);
await assert.rejects(()=>activateOpenAi(launchEnv,async(url:string,init?:RequestInit)=>url.includes('runtime-config')?Response.json({arcAvailable:false}):activationFetch(url,init),async()=>{}),/readiness/);
assert.equal(sql.prepare('SELECT enabled FROM arc_funding_policy').get()!.enabled,0,'Failed readiness must leave funding paused');
console.log('PASS: public 14-day Auto-only trial, pinned Credits, paid manual models, atomic daily/lifetime funding, unknown holds, idempotency, pause, CAS/audit and restart persistence');
