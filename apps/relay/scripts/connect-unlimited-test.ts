import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {ARC_PLANS,CONNECT_FAIR_USE,CONNECT_UNLIMITED_PLAN_ID,accountPlanHasFeature} from '@remotearc/protocol';
import {processStripeEvent,handleBilling,type BillingEnv} from '../src/stripe-billing.js';
import {STRIPE_API_VERSION} from '../src/stripe-client.js';
import {commercialCatalog,planConfigSchema} from '../src/arc-commercial-config.js';
import {creditBalance} from '../src/arc-credits.js';
import {currentArcPlan} from '../src/arc-plan.js';
import {sha256Hex,getSessionUser} from '../src/auth.js';
import {getAccountPlan,planEntitlements,requireEntitledFeatures} from '../src/entitlements.js';
import {getMonthlyUsage,consumeToolCall} from '../src/usage.js';
import {handlePairingApprove} from '../src/device.js';
import {arcAccountAccess,requireArcAccess,activateArcTrial} from '../src/arc-trial.js';
import {requiredAutomationFeatures} from '../src/automations.js';

const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
const db={prepare(query:string){const stmt=sql.prepare(query);const bound=(args:any[])=>({async first(){return stmt.get(...args)||null;},async all(){return{results:stmt.all(...args)};},async run(){return this.runSync();},runSync(){const r=stmt.run(...args);return{success:true,meta:{changes:Number(r.changes)}};}});return{...bound([]),bind(...args:any[]){assert(!args.includes(undefined),query);return bound(args);}};},async batch(items:Array<{runSync:()=>unknown}>){sql.exec('BEGIN IMMEDIATE');try{const r=items.map(s=>s.runSync());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
const stamp=new Date().toISOString(),future=new Date(Date.now()+30*86400000).toISOString(),old=new Date(Date.now()-3*86400000).toISOString();
const start=Math.floor(Date.now()/1000)-60,end=start+30*86400;
// Realistic non-admin accounts on every tier, plus an operator.
for(const [user,role] of [['connect','user'],['free','user'],['plus','user'],['pro','user'],['trialist','user'],['operator','admin']] as const){
 sql.prepare('INSERT INTO users(id,google_sub,email,role,created_at) VALUES(?,?,?,?,?)').run(user,user,user+'@example.invalid',role,stamp);
 sql.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(await sha256Hex(user+'-session'),user,future,stamp);
}
for(const plan of ['arc-plus-v1','arc-pro-v1'])sql.prepare('INSERT INTO billing_plan_assignments(id,plan_id,subject_type,subject_id,expires_at,created_at,commercial_version_id) VALUES(?,?,?,?,?,?,?)').run('existing-'+plan,plan,'user',plan==='arc-plus-v1'?'plus':'pro',future,stamp,'seed:test:'+plan);
sql.prepare('INSERT INTO arc_billing_customers VALUES(?,?,?)').run('connect','cus_connect',stamp);
const base={DB:db,PUBLIC_ORIGIN:'https://mcp.remotearc.app',DASHBOARD_ORIGIN:'https://agent.remotearc.app',ARC_BILLING_ENABLED:'1',ARC_CREDITS_ENABLED:'1',ARC_BILLING_ALLOW_TEST_MODE:'1',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture'};
const env:BillingEnv={...base,ARC_CHAT_ENABLED:'1'},arcPaused:BillingEnv={...base,ARC_CHAT_ENABLED:'0'};

let refunded=false;const checkouts:URLSearchParams[]=[];
const connectPrice={id:'price_connect',lookup_key:'remote-arc:'+CONNECT_UNLIMITED_PLAN_ID,currency:'usd',unit_amount:1999,tax_behavior:'exclusive',active:true,recurring:{interval:'month',interval_count:1}};
const fixtures:Record<string,any>={
 ['/v1/prices?lookup_keys%5B%5D=remote-arc%3A'+CONNECT_UNLIMITED_PLAN_ID+'&active=true&limit=2']:{has_more:false,data:[connectPrice]},
 '/v1/prices/price_connect':connectPrice,
 '/v1/subscriptions?customer=cus_connect&status=all&limit=100':{has_more:false,data:[]},
 '/v1/invoices/in_connect':{id:'in_connect',customer:'cus_connect',livemode:false,status:'paid',currency:'usd',amount_remaining:0,amount_paid:1999,total:1999,total_excluding_tax:1999,subtotal_excluding_tax:1999,total_discount_amounts:[],post_payment_credit_notes_amount:0,billing_reason:'subscription_create',parent:{subscription_details:{subscription:'sub_connect'}}},
 '/v1/subscriptions/sub_connect':{id:'sub_connect',customer:'cus_connect',status:'active',cancel_at_period_end:false,items:{data:[{quantity:1,price:'price_connect'}]},schedule:null,metadata:{}},
 '/v1/invoices/in_connect/lines?limit=2':{has_more:false,data:[{quantity:1,amount:1999,pricing:{price_details:{price:'price_connect'}},period:{start,end}}]},
 '/v1/invoice_payments?invoice=in_connect&limit=2':{has_more:false,data:[{status:'paid',payment:{payment_intent:'pi_connect'}}]},
 '/v1/checkout/sessions?subscription=sub_connect&limit=2':{has_more:false,data:[{id:'cs_test_connect',metadata:{}}]},
 '/v1/payment_intents/pi_connect':{id:'pi_connect',status:'succeeded',currency:'usd',amount_received:1999,latest_charge:'ch_connect'},
};
const original=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const u=new URL(String(input));assert.equal(u.origin,'https://api.stripe.com');assert.equal(new Headers(init?.headers).get('stripe-version'),STRIPE_API_VERSION);
 if(init?.method==='POST'&&u.pathname==='/v1/checkout/sessions'){const body=new URLSearchParams(String(init.body));checkouts.push(body);return Response.json({id:'cs_test_connect',url:'https://checkout.stripe.com/c/pay/connect'});}
 assert.notEqual(init?.method,'POST','Unexpected provider mutation '+u.pathname);
 if(u.pathname==='/v1/charges/ch_connect')return Response.json({id:'ch_connect',payment_intent:'pi_connect',paid:true,amount_refunded:refunded?1999:0,disputed:false});
 const value=fixtures[u.pathname+u.search];assert(value,'Unexpected provider call '+u.pathname+u.search);return Response.json(value);
};
const request=(user:string,path:string,body?:unknown)=>new Request('https://agent.remotearc.app'+path,{method:body===undefined?'GET':'POST',headers:{origin:'https://agent.remotearc.app',cookie:'rl_session='+user+'-session',...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
const billing=async(user:string,path='',body?:unknown,target=env)=>{const response=await handleBilling(request(user,'/api/billing'+path,body),target);return{status:response.status,value:await response.json() as any};};
let seq=0;
async function pair(user:string,platform='linux'){
 const code='PAIR-'+String(++seq).padStart(5,'0');
 sql.prepare("INSERT INTO device_pairings(device_code_hash,device_secret_hash,user_code,device_name,platform,status,expires_at,created_at) VALUES(?,?,?,?,?,'pending',?,?)").run('code-'+seq,'secret-'+seq,code,'Computer '+seq,platform,future,stamp);
 const response=await handlePairingApprove(request(user,'/api/pairing/approve',{user_code:code}),env as any);
 return{status:response.status,value:await response.json() as any};
}
const computers=(user:string)=>Number(sql.prepare("SELECT COUNT(*) n FROM devices WHERE user_id=? AND revoked_at IS NULL AND platform<>'browser'").get(user)!.n);
const seedComputers=(user:string,count:number,createdAt:string)=>{for(let i=0;i<count;i++)sql.prepare('INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at) VALUES(?,?,?,?,?,?)').run(user+'-seed-'+createdAt+'-'+i,user,'Seeded','linux','seed-'+user+createdAt+i,createdAt);};

try{
 // Catalog: a distinct, versioned Connect-only plan; existing plans unchanged.
 const catalog=await commercialCatalog(env),connectPlan=catalog.plans.find(p=>p.id===CONNECT_UNLIMITED_PLAN_ID)!;
 assert.deepEqual([connectPlan.monthlyPriceCents,connectPlan.monthlyCredits,connectPlan.connectToolCalls,connectPlan.deviceLimit,connectPlan.allHostedModels],[1999,0,null,null,false]);
 assert.equal(connectPlan.versionId,'seed:test:'+CONNECT_UNLIMITED_PLAN_ID);
 assert.deepEqual(catalog.plans.filter(p=>p.id!==CONNECT_UNLIMITED_PLAN_ID).map(p=>[p.id,p.monthlyPriceCents,p.monthlyCredits,p.deviceLimit]),[['free',0,0,2],['arc-plus-v1',3900,1500,10],['arc-pro-v1',7900,5000,20]],'Existing customers keep their prices, Credits and device limits');
 assert.equal(sql.prepare("SELECT lane FROM billing_plans WHERE id=?").get(CONNECT_UNLIMITED_PLAN_ID)!.lane,'connect','Never on the arc_hosted lane');
 const config=ARC_PLANS.find(p=>p.id===CONNECT_UNLIMITED_PLAN_ID)!;
 assert(planConfigSchema.safeParse(config).success);
 for(const unsafe of [{allHostedModels:true},{monthlyCredits:100},{deviceLimit:10},{connectToolCalls:50000},{monthlyPriceCents:0}])assert(!planConfigSchema.safeParse({...config,...unsafe}).success,'Administrators cannot publish a Connect plan with '+JSON.stringify(unsafe));
 assert(!planConfigSchema.safeParse({...ARC_PLANS.find(p=>p.id==='arc-plus-v1')!,deviceLimit:null}).success,'Arc plans keep an explicit computer limit');

 // Checkout is sold while hosted Arc is paused; Arc plans are not.
 const checkout=await billing('connect','/checkout',{productId:CONNECT_UNLIMITED_PLAN_ID},arcPaused);
 assert.equal(checkout.status,200,JSON.stringify(checkout.value));assert.equal(checkout.value.url,'https://checkout.stripe.com/c/pay/connect');
 assert.equal(checkouts[0]!.get('line_items[0][price]'),'price_connect');assert.equal(checkouts[0]!.get('mode'),'subscription');
 assert.equal((await billing('connect','/checkout',{productId:'arc-plus-v1'},arcPaused)).value.error,'BILLING_NOT_CONFIGURED');

 // Verified subscription invoice: plan assignment only. No Credits, no model grants.
 await processStripeEvent(env,{id:'evt_connect_paid',type:'invoice.paid',livemode:false,data:{object:{id:'in_connect'}}},'connect-paid');
 assert.equal((await currentArcPlan(env,'connect')).id,CONNECT_UNLIMITED_PLAN_ID);
 assert.equal((await creditBalance(db,'connect')).available,0,'Connect Unlimited includes no Arc Credits');
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM billing_model_grants WHERE user_id='connect'").get()!.n,0,'No hosted model budget is granted');
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM arc_credit_lots WHERE user_id='connect'").get()!.n,0);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM arc_funding_paid_users WHERE user_id='connect'").get()!.n,0,'Connect revenue never joins the paid Arc funding pool');
 assert.equal(await getAccountPlan(env,'connect'),'connect');
 assert.equal((await getSessionUser(request('connect','/api/me'),env))?.plan,'connect');
 const overview=await billing('connect');
 assert.equal(overview.value.plan.id,CONNECT_UNLIMITED_PLAN_ID);assert.equal(overview.value.access.status,'excluded');assert.equal(overview.value.access.canUse,false);assert.equal(overview.value.connectEnabled,true);
 assert.equal((await billing('connect','/checkout',{productId:'arc-topup-500-v1'})).value.error,'BILLING_SUBSCRIPTION_REQUIRED','Credits top-ups need a hosted Arc plan');

 // Unlimited Connect calls: no monthly quota, every call still counted.
 sql.prepare('INSERT INTO user_monthly_usage(user_id,month_key,tool_calls,updated_at) VALUES(?,?,?,?)').run('connect',stamp.slice(0,7),250000,stamp);
 assert.deepEqual(await getMonthlyUsage(env,'connect'),{month:stamp.slice(0,7),used:250000,limit:null,remaining:null,unlimited:true});
 assert.equal((await consumeToolCall(env,'connect')).used,250001);
 assert.equal((await getMonthlyUsage(env,'free')).limit,10000,'Free keeps its 10,000-call allowance');

 // No hosted inference: Arc Chat/model gateway, trials and the hosted goal planner are all denied.
 await assert.rejects(()=>requireArcAccess(env,'connect'),/ARC_PLAN_EXCLUDES_HOSTED/);
 await assert.rejects(()=>activateArcTrial(env,'connect'),/ARC_PLAN_EXCLUDES_HOSTED/);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM arc_trials WHERE user_id='connect'").get()!.n,0,'No trial Credits through the back door');
 const connectFeatures=planEntitlements('connect');
 assert.throws(()=>requireEntitledFeatures(connectFeatures,requiredAutomationFeatures({kind:'agent_goal'} as any)),/PLAN_UPGRADE_REQUIRED|Plus is required/);
 requireEntitledFeatures(connectFeatures,requiredAutomationFeatures({kind:'agent_goal',agent_goal:{controller:'source'},schedule:{} ,keep_awake:true} as any));
 assert(accountPlanHasFeature('plus','hosted_planner')&&!accountPlanHasFeature('connect','hosted_planner')&&!accountPlanHasFeature('free','planned_agent_goals'));
 // A subscriber who activated a trial earlier loses hosted access on subscribing.
 await activateArcTrial(env,'trialist');assert.equal((await arcAccountAccess(env,'trialist')).active,true);
 sql.prepare('INSERT INTO billing_plan_assignments(id,plan_id,subject_type,subject_id,expires_at,created_at,commercial_version_id) VALUES(?,?,?,?,?,?,?)').run('trialist-connect',CONNECT_UNLIMITED_PLAN_ID,'user','trialist',future,stamp,'seed:test:'+CONNECT_UNLIMITED_PLAN_ID);
 const trialist=await arcAccountAccess(env,'trialist');assert.deepEqual([trialist.status,trialist.active,trialist.allowed],['excluded',false,false]);

 // Existing paid customers are unchanged.
 for(const user of ['plus','pro']){const access=await arcAccountAccess(env,user);assert.equal(access.paid,true);assert.equal(access.excluded,false);assert.equal(await getAccountPlan(env,user),'plus');}

 // Devices: 0 -> 10 -> 11 -> 100+ registered computers, each a separate credential.
 assert.equal(computers('connect'),0);
 for(let n=1;n<=11;n++)assert.equal((await pair('connect')).status,200,'Connect computer '+n);
 assert.equal(computers('connect'),11,'More than the Plus limit of 10');
 seedComputers('connect',95,old);assert.equal(computers('connect'),106);
 for(let n=12;n<=CONNECT_FAIR_USE.computerRegistrationsPerDay;n++)assert.equal((await pair('connect')).status,200);
 assert(computers('connect')>100);
 // Published fair use: new registrations per day, counting revoked ones.
 const limited=await pair('connect');assert.equal(limited.status,429);
 assert.deepEqual([limited.value.error,limited.value.limit,limited.value.window],['device_registration_rate_limited',CONNECT_FAIR_USE.computerRegistrationsPerDay,'24h']);
 sql.prepare("UPDATE devices SET revoked_at=? WHERE id=(SELECT id FROM devices WHERE user_id='connect' AND created_at>? LIMIT 1)").run(stamp,old);
 assert.equal((await pair('connect')).status,429,'Revoke and re-pair churn cannot bypass the daily rate');
 sql.prepare("UPDATE devices SET created_at=? WHERE user_id='connect'").run(old);
 assert.equal((await pair('connect')).status,200,'The rate window rolls; there is no total cap');
 const registered=computers('connect');
 // Browser Companion keeps its own separate installation allowance.
 assert.equal((await pair('connect','browser')).status,200);assert.equal(computers('connect'),registered);
 // Free 2 / Plus 10 / Pro 20 are preserved.
 for(const [user,limit] of [['free',2],['plus',10],['pro',20]] as const){
  for(let n=1;n<=limit;n++)assert.equal((await pair(user)).status,200,user+' computer '+n);
  const full=await pair(user);assert.equal(full.status,403);assert.deepEqual([full.value.error,full.value.limit],['device_limit_reached',limit]);
 }
 // Operators stay unlimited and are not subject to the subscriber fair-use rate.
 seedComputers('operator',CONNECT_FAIR_USE.computerRegistrationsPerDay+5,stamp);assert.equal((await pair('operator')).status,200);

 // Refund revokes the entitlement immediately: no hidden carry-over.
 refunded=true;await processStripeEvent(env,{id:'evt_connect_refund',type:'charge.refunded',livemode:false,data:{object:{id:'ch_connect'}}},'connect-refund');
 assert.equal((await currentArcPlan(env,'connect')).id,'free');assert.equal(await getAccountPlan(env,'connect'),'free');
 assert.equal((await getMonthlyUsage(env,'connect')).limit,10000);
 const downgraded=await pair('connect');assert.equal(downgraded.status,403);assert.deepEqual([downgraded.value.limit,downgraded.value.count],[2,registered]);
 assert.equal(computers('connect'),registered,'Already registered computers stay registered after a downgrade');
 assert.equal((await arcAccountAccess(env,'connect')).status,'eligible','After leaving Connect-only the account is an ordinary Free account again');
 console.log('PASS: Connect Unlimited catalog/schema, checkout while Arc paused, invoice without Credits or model grants, unlimited calls, Arc/trial/planner denial, 0/10/11/100+ computers, fair-use rate and churn, Free 2/Plus 10/Pro 20 unchanged, refund revocation');
}finally{globalThis.fetch=original;sql.close();}
