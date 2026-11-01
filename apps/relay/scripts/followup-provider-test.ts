import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createWorkerFixture,ADMIN,MCP} from './worker-fixture.js';
import {emailSender,followupEmailSender} from '../src/platform/email-sender.js';
import {followupEmailBudget} from '../src/followups/followup-budget.js';
import {handleEmailCodeRequest} from '../src/auth/email-auth.js';
import {runFollowupBatches} from '../src/followups/followup-batches.js';
import {DEFAULT_FOLLOWUP_DESIGN} from '../../../packages/protocol/src/followup-email.js';

// Apply the additive migration over real pre-existing schema and delivery rows.
const upgrade=new DatabaseSync(':memory:');
const migrations=fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();
for(const name of migrations.filter(name=>!name.startsWith('0073_')))upgrade.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
upgrade.exec("INSERT INTO users(id,google_sub,email,role,created_at) VALUES('legacy','legacy','legacy@example.test','admin','2026-01-01')");
for(const status of ['sent','unknown','draft'])upgrade.prepare('INSERT INTO user_followup_messages(id,user_id,actor_id,template_id,locale,recipient_email,subject,body,status,created_at,sent_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(status,'legacy','legacy','experience','en','legacy@example.test','Existing subject','Existing body',status,'2026-01-01',status==='sent'?'2026-01-02':null);
const upgradeNow=new Date().toISOString();
upgrade.prepare('INSERT INTO email_login_challenges(email,code_hash,return_to,requested_at,expires_at,window_start,daily_count) VALUES(?,?,?,?,?,?,?)').run('legacy@example.test','fixture-hash','/dashboard',upgradeNow,upgradeNow,upgradeNow,3);
upgrade.exec(fs.readFileSync(new URL('../migrations/0073_followup_delivery_providers.sql',import.meta.url),'utf8'));
assert.deepEqual(upgrade.prepare('SELECT delivery_provider,delivery_attempted_at,subject FROM user_followup_messages').all().map(row=>({...row})),Array.from({length:3},()=>({delivery_provider:'resend',delivery_attempted_at:null,subject:'Existing subject'})));
assert.equal(upgrade.prepare('SELECT COUNT(*) n FROM user_followup_messages').get()?.n,3);
assert.deepEqual({...upgrade.prepare('SELECT provider,status,units FROM email_otp_deliveries').get()},{provider:'resend',status:'unknown',units:3},'Retained pre-migration OTP requests count against shared capacity');upgrade.close();

const fixture=createWorkerFixture(),{sql,env,addUser,sessionCookie,call}=fixture;
Object.assign(env,{RESEND_API_KEY:'fixture-otp-key',SENDPULSE_API_KEY:'fixture-followup-key',FOLLOWUP_EMAIL_PROVIDER:'sendpulse',EMAIL_AUTH_SECRET:'fixture-auth-secret',ALLOW_SIGNUPS:'1'});
addUser('admin','admin');
const cookie=await sessionCookie('admin');
const api=(path='',method='GET',body?:unknown)=>call(ADMIN+'/api/admin/followups'+path,{method,headers:{cookie,origin:ADMIN,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const decode=async(response:Response,status=200)=>{const value=await response.json() as any;assert.equal(response.status,status,JSON.stringify(value));return value;};
let nextUser=0;
async function draft(){const userId='recipient-'+nextUser++;addUser(userId);const id=crypto.randomUUID();await decode(await api('/drafts','POST',{id,userId,templateId:'experience',locale:'zh',subject:'一次产品回访',body:'你好，想了解你使用 Remote Arc 的情况。欢迎回复这封邮件。'}),201);return id;}
const typed=()=>env as any;
const originalFetch=globalThis.fetch;
const deliveries:{url:string;body:any}[]=[];
const successfulFetch:typeof fetch=async(url,init)=>{
 const endpoint=String(url),body=JSON.parse(String(init?.body));
 assert.equal(init?.method,'POST');
 if(endpoint==='https://api.sendpulse.com/smtp/emails'){
  assert.equal(new Headers(init?.headers).get('authorization'),'Bearer fixture-followup-key');
  assert(init?.signal,'Delivery has a deadline');
  assert.deepEqual(body.email.from,{name:'Remote Arc',email:'support@remotearc.app'});
  assert.deepEqual(body.email.reply_to,{email:'support@remotearc.app'});
  assert.equal(body.email.to.length,1);assert(!body.email.cc&&!body.email.bcc);
  const html=Buffer.from(body.email.html,'base64').toString('utf8');
  const saved=sql.prepare('SELECT html_body,text_body FROM user_followup_messages WHERE recipient_email=? ORDER BY created_at DESC LIMIT 1').get(body.email.to[0].email)!;
  assert.equal(html,saved.html_body,'SendPulse receives the reviewed Unicode HTML without rewriting it');assert.equal(body.email.text,saved.text_body);
  assert(body.email.text.includes('/email/follow-up/unsubscribe?token='));
  deliveries.push({url:endpoint,body});return Response.json({result:true,id:'sendpulse-'+deliveries.length});
 }
 assert.equal(endpoint,'https://api.resend.com/emails','No unexpected provider or fallback');
 assert.equal(new Headers(init?.headers).get('authorization'),'Bearer fixture-otp-key');
 assert.equal(body.from,'Remote Arc <login@remotearc.app>');assert.match(body.text,/one-time Remote Arc code/);
 deliveries.push({url:endpoint,body});return Response.json({id:'otp-fixture'});
};
globalThis.fetch=successfulFetch;
try{
 assert.equal(followupEmailSender(typed())?.provider,'sendpulse');
 assert.equal(emailSender(typed())?.apiKey,'fixture-otp-key','OTP always selects Resend');
 assert.equal(followupEmailSender({...typed(),FOLLOWUP_EMAIL_PROVIDER:'typo'}),null);
 assert.equal(followupEmailSender({...typed(),SENDPULSE_API_KEY:'  '}),null,'Missing SendPulse credentials never borrow the OTP key');
 assert.equal(followupEmailSender({...typed(),RESEND_API_KEY:undefined})?.provider,'sendpulse','Follow-ups do not depend on OTP credentials');
 assert.equal(followupEmailSender({...typed(),FOLLOWUP_FROM:'invalid sender'}),null);
 assert.equal(followupEmailSender({...typed(),FOLLOWUP_REPLY_TO:'support@example.test\r\nBcc: other@example.test'}),null);
 const initial=await decode(await api());assert.equal(initial.emailBudget.provider,'sendpulse');assert.equal(initial.emailBudget.hourly.limit,50);assert.equal(initial.emailBudget.monthly.limit,12000);
 const first=await draft();await decode(await api('/'+first+'/send','POST',{}));
 assert.equal(sql.prepare('SELECT delivery_provider FROM user_followup_messages WHERE id=?').get(first)?.delivery_provider,'sendpulse');
 await decode(await api('/'+first+'/send','POST',{}));assert.equal(deliveries.length,1,'Sent drafts never dispatch again');
 const second=await draft();
 for(const patch of [{SENDPULSE_API_KEY:''},{FOLLOWUP_EMAIL_PROVIDER:'unknown'}]){
  const saved={SENDPULSE_API_KEY:env.SENDPULSE_API_KEY,FOLLOWUP_EMAIL_PROVIDER:env.FOLLOWUP_EMAIL_PROVIDER};
  Object.assign(env,patch);
  await decode(await api('/'+second+'/send','POST',{}),503);
  assert.equal(sql.prepare('SELECT status FROM user_followup_messages WHERE id=?').get(second)?.status,'draft');
  Object.assign(env,saved);
 }
 Object.assign(env,{FOLLOWUP_HOURLY_EMAIL_LIMIT:'1'});
 await decode(await api('/'+second+'/send','POST',{}),429);
 assert.equal(sql.prepare('SELECT status FROM user_followup_messages WHERE id=?').get(second)?.status,'draft');
 assert.equal(deliveries.length,1);
 const otp=await handleEmailCodeRequest(new Request(MCP+'/auth/email/request',{method:'POST',headers:{origin:MCP,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'signup@example.test'})}),typed());
 assert.equal(otp.status,200);assert.equal(deliveries.at(-1)?.url,'https://api.resend.com/emails','OTP still sends after follow-up capacity is exhausted');
 // Every provider keeps independent hourly/daily/monthly usage.
 const resendBudget=await followupEmailBudget({...typed(),FOLLOWUP_EMAIL_PROVIDER:'resend'});
 assert.equal(resendBudget.used,0);assert.equal(resendBudget.limit,60);assert.equal(resendBudget.monthly.limit,1800);
 for(const invalid of ['', '-1', '1.5', 'NaN','1000001']){
  const budget=await followupEmailBudget({...typed(),FOLLOWUP_DAILY_EMAIL_LIMIT:invalid,FOLLOWUP_HOURLY_EMAIL_LIMIT:invalid,FOLLOWUP_MONTHLY_EMAIL_LIMIT:invalid});
  assert.equal(budget.limit,400);assert.equal(budget.hourly.limit,50);assert.equal(budget.monthly.limit,12000);
 }
 // Atomic quota claim: different users race for exactly one available slot.
 env.FOLLOWUP_HOURLY_EMAIL_LIMIT='2';const third=await draft();
 const results=await Promise.all([api('/'+second+'/send','POST',{}),api('/'+third+'/send','POST',{})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);
 assert.equal(deliveries.filter(d=>d.url.includes('sendpulse')).length,2);
 const waiting=sql.prepare("SELECT id FROM user_followup_messages WHERE status='draft' LIMIT 1").get()!.id as string;
 delete env.FOLLOWUP_HOURLY_EMAIL_LIMIT;env.FOLLOWUP_MONTHLY_EMAIL_LIMIT='2';
 assert.equal((await decode(await api('/'+waiting+'/send','POST',{}),429)).error,'monthly_email_budget_reached');
 delete env.FOLLOWUP_MONTHLY_EMAIL_LIMIT;
 // Delivery uncertainty counts against quota even when its draft was old.
 sql.prepare("UPDATE user_followup_messages SET created_at='2020-01-01T00:00:00.000Z' WHERE id=?").run(waiting);
 globalThis.fetch=async url=>{assert.equal(String(url),'https://api.sendpulse.com/smtp/emails');throw new Error('fixture private upstream error');};
 const uncertain=await decode(await api('/'+waiting+'/send','POST',{}),502);assert.equal(uncertain.status,'unknown');
 assert.equal((await followupEmailBudget(typed())).used,3);
 await decode(await api('/'+waiting+'/send','POST',{}));
 assert(!JSON.stringify(uncertain).includes('fixture private'));
 // A malformed successful response might already have sent: never retry it.
 const malformed=await draft();globalThis.fetch=async()=>Response.json({result:true});
 assert.equal((await decode(await api('/'+malformed+'/send','POST',{}),502)).status,'unknown');
 // Rejected sends keep safe errors and cannot fall back to the OTP provider.
 const rejected=await draft();let rejectedCalls=0;
 globalThis.fetch=async url=>{assert.equal(String(url),'https://api.sendpulse.com/smtp/emails');rejectedCalls++;return Response.json({error:'fixture-followup-key'},{status:401});};
 const failure=await decode(await api('/'+rejected+'/send','POST',{}),502);assert.equal(failure.status,'failed');assert.equal(failure.errorCode,'provider_401');assert.equal(rejectedCalls,1);assert(!JSON.stringify(failure).includes('fixture-followup-key'));
 for(const [response,expected] of [[Response.json({result:false}),'failed'],[new Response('not JSON'),'unknown'],[Response.json({error:'upstream'},{status:503}),'unknown']] as const){
  const id=await draft();let calls=0;globalThis.fetch=async()=>{calls++;return response;};
  assert.equal((await decode(await api('/'+id+'/send','POST',{}),502)).status,expected);assert.equal(calls,1);
 }
 // Queued batches wait on capacity and refuse a provider change after review.
 addUser('batch-recipient');
 const batch=await decode(await api('/batches','POST',{id:crypto.randomUUID(),title:'Provider snapshot',userIds:['batch-recipient'],templateId:'experience',locale:'en',subject:'Product follow-up',body:'Hello, please tell us about your Remote Arc experience.',design:DEFAULT_FOLLOWUP_DESIGN}),201);
 env.FOLLOWUP_EMAIL_PROVIDER='resend';
 assert.equal((await decode(await api('/batches/'+batch.batch.id+'/queue','POST',{}),409)).error,'sender_changed');
 env.FOLLOWUP_EMAIL_PROVIDER='sendpulse';env.FOLLOWUP_HOURLY_EMAIL_LIMIT='0';
 await decode(await api('/batches/'+batch.batch.id+'/queue','POST',{}),202);
 await Promise.all(fixture.pending.splice(0));
 await runFollowupBatches(typed(),{pause:async()=>{}});
 assert.equal((await decode(await api('/batches/'+batch.batch.id))).recipients[0].status,'pending');
 delete env.FOLLOWUP_HOURLY_EMAIL_LIMIT;globalThis.fetch=successfulFetch;
 await runFollowupBatches(typed(),{pause:async()=>{}});
 assert.equal((await decode(await api('/batches/'+batch.batch.id))).recipients[0].status,'sent','Queued SendPulse batches resume after capacity returns');
 // A 31-day-old legacy Resend send has aged out; a recent legacy unknown counts.
 sql.prepare("UPDATE user_followup_messages SET delivery_provider='resend',delivery_attempted_at=NULL,created_at=? WHERE id=?").run(new Date(Date.now()-2*3600000).toISOString(),waiting);
 assert.equal((await followupEmailBudget({...typed(),FOLLOWUP_EMAIL_PROVIDER:'resend'})).used,1);
 const realNow=Date.now,fixedNow=realNow();
 try{
  Date.now=()=>fixedNow;
  for(const [age,daily,hourly,monthly] of [[3600000,1,0,1],[86400000,0,0,1],[31*86400000,0,0,0]] as const){
   sql.prepare('UPDATE user_followup_messages SET created_at=? WHERE id=?').run(new Date(fixedNow-age).toISOString(),waiting);
   const budget=await followupEmailBudget({...typed(),FOLLOWUP_EMAIL_PROVIDER:'resend'});
   assert.deepEqual([budget.used,budget.hourly.used,budget.monthly.used],[daily,hourly,monthly]);
  }
 }finally{Date.now=realNow;}
 console.log('PASS: SendPulse/Resend isolation, OTP after follow-up exhaustion, exact Unicode snapshots, independent rolling quotas, concurrent claims, old-draft uncertainty, no provider fallback, safe errors and batch provider review. No real emails sent.');
}finally{await Promise.all(fixture.pending);globalThis.fetch=originalFetch;sql.close();}
