import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {businessAnalytics,handleBusinessAnalytics} from '../src/business-analytics.js';
import {startBusinessFlow,advanceBusinessFlow,recordBusinessActivity,recordDeviceOnline,linkBusinessReceipt} from '../src/business-tracking.js';
import {handleEmailCodeRequest,handleEmailCodeVerify} from '../src/email-auth.js';
import {handleDeviceStart,handlePairingApprove,handleDeviceToken} from '../src/device.js';
import {sha256Hex,handleGoogleLogin,handleGoogleCallback} from '../src/auth.js';
import {adminApiMethods} from '../src/admin-service.js';

const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
const db={prepare(query:string){const stmt=sql.prepare(query);const bound=(args:any[])=>({async first(){return stmt.get(...args)||null;},async all(){return{results:stmt.all(...args)};},async run(){return this.runSync();},runSync(){const result=stmt.run(...args);return{success:true,meta:{changes:Number(result.changes)}};}});return{...bound([]),bind(...args:any[]){assert(!args.includes(undefined),query);return bound(args);}};},async batch(statements:Array<{runSync:()=>unknown}>){sql.exec('BEGIN');try{const results=statements.map(item=>item.runSync());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}} as unknown as D1Database;
const env={DB:db,PUBLIC_ORIGIN:'https://mcp.remotearc.app',ADMIN_ORIGIN:'https://admin.remotearc.app',RESEND_API_KEY:'fixture-only',EMAIL_AUTH_SECRET:'fixture-only',ALLOW_SIGNUPS:'1'} as any;
const now=new Date('2026-10-27T12:00:00.000Z');
function user(id:string,created:string,role='user'){sql.prepare('INSERT INTO users(id,google_sub,email,role,created_at) VALUES(?,?,?,?,?)').run(id,id,id+'@example.invalid',role,created);}
user('alpha','2026-10-18T09:00:00.000Z');user('beta','2026-10-18T09:00:00.000Z');
user('gamma','2026-10-26T09:00:00.000Z');user('delta','2026-10-27T09:00:00.000Z');
user('older','2026-09-20T09:00:00.000Z');user('admin','2026-09-01T09:00:00.000Z','admin');
user('reviewer-openai-v1','2026-10-27T09:00:00.000Z');
sql.prepare("UPDATE business_metrics_state SET value='2026-09-01T00:00:00.000Z' WHERE key='activity_complete_from'").run();
for(const [id,at] of [['alpha','2026-10-19T09:00:00.000Z'],['beta','2026-10-25T09:00:00.000Z'],['gamma','2026-10-27T09:00:00.000Z'],['older','2026-10-20T09:00:00.000Z']]){await recordBusinessActivity(env,id!,at);await recordBusinessActivity(env,id!,at);}
assert.equal(sql.prepare('SELECT COUNT(*) n FROM business_activity_days').get()?.n,4,'Repeated use in the same day is one retained account');

for(const id of ['email-a','email-b','email-c','email-pending']){
 await startBusinessFlow(env,{id,scene:'email_login',at:'2026-10-23T09:00:00.000Z',expiresAt:id==='email-pending'?'2026-10-28T09:00:00.000Z':'2026-10-23T09:10:00.000Z'});
 await advanceBusinessFlow(env,id,'email_login','delivered',{at:'2026-10-23T09:01:00.000Z'});
}
for(const id of ['email-a','email-b'])for(const [index,step] of ['verification','verified','completed'].entries())await advanceBusinessFlow(env,id,'email_login',step,{userId:'alpha',at:`2026-10-23T09:0${index+2}:00.000Z`});
await advanceBusinessFlow(env,'email-a','email_login','completed',{at:'2026-10-23T09:08:00.000Z'});
await advanceBusinessFlow(env,'forged-unknown','email_login','completed',{userId:'alpha'});
assert.equal(sql.prepare("SELECT COUNT(*) n FROM business_flow_attempts WHERE scene='email_login'").get()?.n,4,'Repeated callbacks and unknown completion IDs never create extra attempts');

for(const id of ['device-a','device-b','device-c'])await startBusinessFlow(env,{id,scene:'device_pairing',at:'2026-10-23T09:00:00.000Z',expiresAt:'2026-10-23T09:10:00.000Z'});
for(const id of ['device-a','device-b'])await advanceBusinessFlow(env,id,'device_pairing','approved',{userId:'alpha',deviceId:id,at:'2026-10-23T09:01:00.000Z'});
await advanceBusinessFlow(env,'device-a','device_pairing','online',{at:'2026-10-23T09:03:00.000Z'});

function event(userId:string,journey:string,name:string,at:string){sql.prepare(`INSERT INTO product_events(id,occurred_at,domain,name,source,outcome,user_id,journey_id,trace_id) VALUES(?,?,'billing',?,'browser','accepted',?,?,?)`).run(crypto.randomUUID(),at,name,userId,journey,crypto.randomUUID());}
const ja=crypto.randomUUID(),jb=crypto.randomUUID();
event('alpha',ja,'billing.checkout.viewed','2026-10-23T08:00:00.000Z');event('alpha',ja,'billing.checkout.viewed','2026-10-23T08:02:00.000Z');
event('beta',jb,'billing.checkout.viewed','2026-10-23T08:00:00.000Z');event('beta',jb,'billing.payment.completed_client','2026-10-23T08:05:00.000Z');
function checkout(id:string,userId:string,journey:string|null,status='open',mode='live',created='2026-10-23T08:03:00.000Z'){
 sql.prepare(`INSERT INTO arc_billing_checkouts(id,user_id,product_id,kind,session_id,status,expires_at,created_at,commercial_version_id,journey_id) VALUES(?,?,'arc-topup-500-v1','payment',?,?,?,?,'seed:'||?||':arc-topup-500-v1',?)`).run(id,userId,'cs_'+id,status,'2026-10-28T09:00:00.000Z',created,mode,journey);
}
function receipt(id:string,userId:string,mode='live',at='2026-10-23T08:04:00.000Z'){
 sql.prepare(`INSERT INTO arc_payment_receipts(id,provider,event_id,user_id,product_id,state,amount_cents,currency,verified_at,payload_hash,commercial_version_id) VALUES(?,'stripe',?,?,'arc-topup-500-v1','paid',1000,'usd',?,'fixture','seed:'||?||':arc-topup-500-v1')`).run(id,'evt_'+id,userId,at,mode);
}
checkout('paid','alpha',ja,'complete');receipt('receipt-paid','alpha');await linkBusinessReceipt(env,'paid','receipt-paid','alpha','arc-topup-500-v1');
sql.prepare("UPDATE arc_billing_checkouts SET completed_at='2026-10-23T08:05:00.000Z' WHERE id='paid'").run();
checkout('waiting','beta',jb);checkout('unattributed','gamma',null,'complete','live','2026-10-26T10:00:00.000Z');
checkout('test-mode','gamma',null,'complete','test','2026-10-26T10:00:00.000Z');receipt('receipt-test','gamma','test','2026-10-26T10:05:00.000Z');
await linkBusinessReceipt(env,'waiting','receipt-paid','beta','arc-topup-500-v1');
assert.equal(sql.prepare("SELECT receipt_id FROM arc_billing_checkouts WHERE id='waiting'").get()?.receipt_id,null,'A receipt cannot be attributed to a different account');

sql.prepare("INSERT INTO arc_chat_sessions(id,user_id,organization_id,title_ciphertext,created_at,updated_at) VALUES('chat','alpha','personal:alpha','fixture','2026-10-23T09:00:00.000Z','2026-10-23T09:00:00.000Z')").run();
for(const [index,status] of ['succeeded','failed','cancelled','working','unknown'].entries())sql.prepare(`INSERT INTO arc_chat_runs(id,session_id,user_id,request_id,input_hash,model_id,status,max_tokens,max_steps,deadline,created_at,updated_at) VALUES(?,'chat','alpha',?,'fixture','auto',?,1000,4,'2026-10-28T09:00:00.000Z','2026-10-23T09:00:00.000Z','2026-10-23T09:05:00.000Z')`).run('run-'+index,'request-'+index,status);

const data=await businessAnalytics(db,7,now),scene=(id:string)=>data.scenes.find(item=>item.id===id)!;
assert.equal(data.summary?.newUsers,2,'Reviewer demo account is not real acquisition');
assert.equal(scene('login').total,4);assert.equal(scene('login').completed,2);assert.equal(scene('login').rate,.5);
assert.equal(scene('login').pending,1);assert.equal(scene('login').unfinished,1);
assert.deepEqual(scene('devices').steps.map((step:any)=>step.count),[3,2,1]);assert.equal(scene('devices').rate,1/3);
assert.deepEqual(scene('payment').steps.map((step:any)=>step.count),[2,2,1,1],'Browser payment-return signals do not prove collection or access');
assert.equal(scene('payment').orders.total,3,'Unattributed real orders remain in the order denominator; test orders do not');
assert.equal(scene('payment').orders.fulfilled,2);assert.equal(scene('payment').orders.unattributed,1);
assert.equal(data.summary?.payingUsers,1,'Test-mode receipts are excluded from paying users and money');
assert.equal(data.summary?.paidCents,1000);
assert.equal(scene('tasks').total,5);assert.equal(scene('tasks').completed,1);assert.equal(scene('tasks').rate,.2);
const cohort=data.cohorts.find(row=>row.day==='2026-10-18')!;
assert.equal(cohort.users,2);assert.equal(cohort.cells[0]!.rate,.5);assert.equal(cohort.cells[1]!.rate,.5);assert.equal(cohort.cells[2]!.status,'observing');
assert.equal(data.cohorts.find(row=>row.day==='2026-10-26')!.cells[0]!.status,'observing','An unfinished current return day is not zero retention');
assert.equal(data.retention.find(cell=>cell.day===30)!.rate,.5,'Only mature, completely observed cohorts enter D30');
sql.prepare("UPDATE business_metrics_state SET value='2026-10-26T00:00:00.000Z' WHERE key='activity_complete_from'").run();
const partial=await businessAnalytics(db,7,now);
assert.equal(partial.cohorts.find(row=>row.day==='2026-10-18')!.cells[0]!.status,'not_collected');
assert.equal(partial.retention.find(cell=>cell.day===30)!.rate,null,'Historical absence before collection is unknown, not churn');
const empty=await businessAnalytics(db,1,new Date('2027-10-27T12:00:00.000Z'));
assert.equal(empty.scenes[0]!.rate,null,'No attempts means no rate, never 0% or 100%');
await (async()=>{
 user('deleted-user','2026-10-18T09:00:00.000Z');
 await recordBusinessActivity(env,'deleted-user','2026-10-25T09:00:00.000Z');
 sql.prepare("DELETE FROM users WHERE id='deleted-user'").run();
 const retained=sql.prepare("SELECT COUNT(*) n,SUM(returned_d7) returned FROM business_cohort_users WHERE substr(registered_at,1,10)='2026-10-18'").get();
 assert.equal(retained?.n,3,'Deleted users remain in the original cohort denominator');
 assert.equal(retained?.returned,2,'Anonymous retention evidence survives deletion without identity');
 assert.equal(sql.prepare("SELECT user_id FROM business_cohort_users WHERE user_id IS NULL").get()?.user_id,null);
})();
// Historical comparisons cannot learn from a completion that happened later.
await startBusinessFlow(env,{id:'prior-login',scene:'email_login',at:'2026-10-16T09:00:00.000Z',expiresAt:'2026-10-16T09:10:00.000Z'});
for(const step of ['delivered','verification'])await advanceBusinessFlow(env,'prior-login','email_login',step,{at:'2026-10-16T09:01:00.000Z'});
for(const step of ['verified','completed'])await advanceBusinessFlow(env,'prior-login','email_login',step,{at:'2026-10-23T09:01:00.000Z'});
checkout('prior-paid','alpha',null,'complete','live','2026-10-17T08:03:00.000Z');receipt('prior-receipt','alpha','live','2026-10-24T08:04:00.000Z');
await linkBusinessReceipt(env,'prior-paid','prior-receipt','alpha','arc-topup-500-v1');
sql.prepare("UPDATE arc_billing_checkouts SET completed_at='2026-10-24T08:05:00.000Z' WHERE id='prior-paid'").run();
sql.prepare(`INSERT INTO arc_chat_runs(id,session_id,user_id,request_id,input_hash,model_id,status,max_tokens,max_steps,deadline,created_at,updated_at) VALUES('prior-run','chat','alpha','prior-request','fixture','auto','succeeded',1000,4,'2026-10-28T09:00:00.000Z','2026-10-17T09:00:00.000Z','2026-10-24T09:05:00.000Z')`).run();
const bounded=await businessAnalytics(db,7,now);
assert.equal(bounded.previous.scenes.find(item=>item.id==='login')!.completed,0);
assert.equal(bounded.previous.scenes.find(item=>item.id==='tasks')!.completed,0);
assert.equal(bounded.previous.scenes.find(item=>item.id==='payment')!.orders.paid,0);

// The actual auth and pairing handlers must feed the analytics, not just a fixture API.
const fetchBefore=globalThis.fetch;let otp='';
const completedLoginsBefore=Number(sql.prepare("SELECT COUNT(*) n FROM business_flow_attempts WHERE scene='email_login' AND succeeded_at IS NOT NULL").get()?.n);
globalThis.fetch=async(_input,init)=>{const payload=JSON.parse(String(init?.body||'{}'));otp=payload.text?.match(/\b[0-9]{6}\b/)?.[0]||'';return Response.json({id:'fixture-email'});};
const form=(path:string,values:Record<string,string>)=>new Request(env.PUBLIC_ORIGIN+path,{method:'POST',headers:{origin:env.PUBLIC_ORIGIN,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values)});
try{
 assert.equal((await handleEmailCodeRequest(form('/auth/email/request',{email:'new-owner@example.invalid'}),env)).status,200);
 assert.match(otp,/^[0-9]{6}$/);
 const wrong=otp==='000000'?'111111':'000000';
 await handleEmailCodeVerify(form('/auth/email/verify',{email:'new-owner@example.invalid',code:wrong}),env);
 const beforeVerify=sql.prepare("SELECT COUNT(*) n FROM business_flow_attempts WHERE scene='email_login'").get()?.n;
 assert.equal((await handleEmailCodeVerify(form('/auth/email/verify',{email:'new-owner@example.invalid',code:otp}),env)).status,303);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM business_flow_attempts WHERE scene='email_login'").get()?.n,beforeVerify,'Wrong-code retries share a single real login attempt');
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM business_flow_attempts WHERE scene='email_login' AND succeeded_at IS NOT NULL").get()?.n,completedLoginsBefore+1);
}finally{globalThis.fetch=fetchBefore;}
env.GOOGLE_CLIENT_ID='fixture-client';env.GOOGLE_CLIENT_SECRET='fixture-secret';
globalThis.fetch=async input=>String(input).includes('/token')?Response.json({access_token:'fixture-token'}):Response.json({sub:'google-alpha',email:'alpha@example.invalid',email_verified:true});
try{
 const start=await handleGoogleLogin(new Request(env.PUBLIC_ORIGIN+'/auth/google'),env),state=new URL(start.headers.get('location')!).searchParams.get('state');
 const signedIn=await handleGoogleCallback(new Request(env.PUBLIC_ORIGIN+'/auth/google/callback?state='+state+'&code=fixture'),env);
 assert.equal(signedIn.status,302);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM business_flow_attempts WHERE scene='google_login' AND succeeded_at IS NOT NULL").get()?.n,1,'A real Google callback must create the canonical login completion');
}finally{globalThis.fetch=fetchBefore;}
const token='admin-fixture';sql.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(await sha256Hex(token),'admin',new Date().toISOString(),'2027-12-01T00:00:00.000Z');
const pairing=await (await handleDeviceStart(new Request(env.PUBLIC_ORIGIN+'/api/device/start',{method:'POST',body:JSON.stringify({device_name:'Fixture computer',platform:'win32'})}),env)).json() as any;
const request=(path:string,body:object)=>new Request(env.PUBLIC_ORIGIN+path,{method:'POST',headers:{cookie:'rl_session='+token,'content-type':'application/json'},body:JSON.stringify(body)});
assert.equal((await handleDeviceToken(request('/api/device/token',{device_code:pairing.device_code,device_secret:pairing.device_secret}),env)).status,428);
const paired=await (await handlePairingApprove(request('/api/pairing/approve',{user_code:pairing.user_code}),env)).json() as any;
assert(paired.device?.id);await handleDeviceToken(request('/api/device/token',{device_code:pairing.device_code,device_secret:pairing.device_secret}),env);
assert.equal(sql.prepare('SELECT succeeded_at FROM business_flow_attempts WHERE device_id=?').get(paired.device.id)?.succeeded_at,null,'Approval and credentials alone do not count as connected');
await recordDeviceOnline(env,paired.device.id,'admin');await recordDeviceOnline(env,paired.device.id,'admin');
assert(sql.prepare('SELECT succeeded_at FROM business_flow_attempts WHERE device_id=?').get(paired.device.id)?.succeeded_at);
const adminRequest=(query='',cookie='')=>new Request('https://admin.remotearc.app/api/admin/analytics'+query,{headers:{cookie}});
assert.equal((await handleBusinessAnalytics(adminRequest(),env)).status,401);
assert.deepEqual(adminApiMethods('/api/admin/analytics'),['GET']);
const response=await handleBusinessAnalytics(adminRequest('?days=7','rl_session='+token),env);assert.equal(response.status,200);assert.match(response.headers.get('cache-control')||'',/no-store/);
assert.equal((await handleBusinessAnalytics(adminRequest('?days=365','rl_session='+token),env)).status,400);
const publicResponse=await handleBusinessAnalytics(new Request('https://mcp.remotearc.app/api/admin/analytics',{headers:{cookie:'rl_session='+token}}),env);assert.equal(publicResponse.status,404);
sql.close();console.log('PASS: real SQL business funnels, repeat deduplication, live payment attribution, task outcomes, D1/D7/D30 cohort maturity, missing history, actual login/pairing handlers and admin access');
