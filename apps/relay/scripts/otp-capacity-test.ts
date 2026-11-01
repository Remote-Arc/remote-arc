import assert from 'node:assert/strict';
import {createWorkerFixture,MCP,ADMIN} from './worker-fixture.js';
import {followupEmailBudget} from '../src/followups/followup-budget.js';
import {dispatchFollowup} from '../src/followups/followup-delivery.js';
import {emailAccountCapacity,purgeEmailCapacity} from '../src/platform/email-capacity.js';

const fixture=createWorkerFixture(),{sql,env,call,addUser,sessionCookie}=fixture;
Object.assign(env,{RESEND_API_KEY:'fixture-otp-resend',SENDPULSE_API_KEY:'fixture-otp-sendpulse',EMAIL_AUTH_SECRET:'fixture-auth-secret',ALLOW_SIGNUPS:'1',FOLLOWUP_EMAIL_PROVIDER:'resend'});
addUser('admin','admin');addUser('seed');const cookie=await sessionCookie('admin');
const typed=()=>env as any;
const form=(path:string,values:Record<string,string>)=>call(MCP+path,{method:'POST',headers:{origin:MCP,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values)});
let nextEmail=0;
const requestOtp=()=>form('/auth/email/request',{email:'capacity-'+nextEmail+++'@example.test'});
const seedOtp=(provider:string,units:number,age=0)=>sql.prepare('INSERT INTO email_otp_deliveries(id,provider,status,attempted_at,units) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),provider,'sent',new Date(Date.now()-age).toISOString(),units);
function seedFollowups(count:number,provider='resend'){
 for(let n=0;n<count;n++)sql.prepare('INSERT INTO user_followup_messages(id,user_id,actor_id,template_id,locale,recipient_email,subject,body,status,created_at,sent_at,delivery_provider) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),'seed','admin','experience','en','seed@example.test','Earlier follow-up','Existing follow-up body','sent',fixture.now,fixture.now,provider);
}
const reset=()=>{sql.exec('DELETE FROM email_otp_deliveries; DELETE FROM user_followup_messages');};
type Sent={provider:string;code:string;email:string;from:string};let sent:Sent[]=[];
let rejectResend=false,rejectSendPulse=false,uncertain:'timeout'|'malformed'|'server'|null=null,uncertainProvider:string|null=null;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
 assert.equal(init?.method,'POST');assert(init?.signal);
 const provider=String(url)==='https://api.resend.com/emails'?'resend':'sendpulse';
 assert.equal(String(url),provider==='resend'?'https://api.resend.com/emails':'https://api.sendpulse.com/smtp/emails');
 assert.equal(new Headers(init?.headers).get('authorization'),'Bearer fixture-otp-'+provider);
 const payload=JSON.parse(String(init?.body)),message=provider==='resend'?payload:payload.email;
 const text=String(message.text),code=text.match(/\b[0-9]{6}\b/)?.[0]||'';
 const from=provider==='resend'?message.from:message.from.email;
 if(code){assert.match(text,/one-time Remote Arc code/);assert(!message.reply_to,'OTP never inherits the support reply mailbox');}
 sent.push({provider,code,email:provider==='resend'?message.to[0]:message.to[0].email,from});
 if(provider==='resend'&&rejectResend)return Response.json({error:'quota exceeded'},{status:429});
 if(provider==='sendpulse'&&rejectSendPulse)return Response.json({result:false});
 const mode=!uncertainProvider||uncertainProvider===provider?uncertain:null;
 if(mode==='timeout')throw Error('private-provider-error');
 if(mode==='malformed')return Response.json({accepted:true});
 if(mode==='server')return Response.json({error:'private-provider-error'},{status:503});
 return provider==='resend'?Response.json({id:'resend-fixture'}):Response.json({result:true,id:'sendpulse-fixture'});
};
try{
 // Forty is a reservation floor, not an OTP ceiling. Unused follow-up slots
 // expand OTP capacity automatically without changing plans or buying credits.
 seedFollowups(20);seedOtp('resend',40);
 assert.equal((await requestOtp()).status,200);assert.equal(sent.at(-1)?.provider,'resend');
 let budget=await followupEmailBudget(typed());assert.equal(budget.otpUsage.daily,41);assert.equal(budget.remaining,39);
 seedOtp('resend',39);budget=await followupEmailBudget(typed());assert.equal(budget.remaining,0,'OTP use shrinks the follow-up share');
 // Primary account is full: borrow SendPulse's marketing allocation, including
 // capacity beyond its ten reserved hourly OTP slots.
 seedOtp('sendpulse',10);sent=[];
 assert.equal((await requestOtp()).status,200);assert.deepEqual(sent.map(item=>item.provider),['sendpulse']);
 assert.equal(sent[0].from,'login@remotearc.app');
 assert.equal((await emailAccountCapacity(typed(),'sendpulse')).hourly.otp,11);
 const verified=await form('/auth/email/verify',{email:sent[0].email,code:sent[0].code});assert.equal(verified.status,303,'A borrowed-capacity OTP completes real sign-up');

 reset();sent=[];rejectResend=true;
 assert.equal((await requestOtp()).status,200);
 assert.deepEqual(sent.map(item=>item.provider),['resend','sendpulse']);assert.equal(sent[0].code,sent[1].code,'Confirmed rejection fallback keeps the same code');
 assert.deepEqual(sql.prepare('SELECT provider,status FROM email_otp_deliveries ORDER BY rowid').all().map(row=>({...row})),[{provider:'resend',status:'failed'},{provider:'sendpulse',status:'sent'}]);
 rejectResend=false;

 const ledger=()=>sql.prepare('SELECT provider,status FROM email_otp_deliveries ORDER BY rowid').all().map(row=>({...row}));
 const verifySent=async(message:string)=>assert.equal((await form('/auth/email/verify',{email:sent[0].email,code:sent[0].code})).status,303,message);
 // An outage on the first account must not strand sign-in. A duplicate repeats
 // the same code, so it is safe to try the second account.
 for(const mode of ['timeout','malformed','server'] as const){
  reset();sent=[];uncertain=mode;uncertainProvider='resend';
  assert.equal((await requestOtp()).status,200);
  assert.deepEqual(sent.map(item=>item.provider),['resend','sendpulse']);assert.equal(sent[0].code,sent[1].code,'Uncertain fallback keeps the same code');
  assert.deepEqual(ledger(),[{provider:'resend',status:'unknown'},{provider:'sendpulse',status:'sent'}]);
  await verifySent('The fallback code signs in');
 }
 // Neither account confirmed: the code may have arrived, so it stays valid.
 for(const mode of ['timeout','malformed','server'] as const){
  reset();sent=[];uncertain=mode;uncertainProvider=null;
  assert.equal((await requestOtp()).status,200);assert.deepEqual(sent.map(item=>item.provider),['resend','sendpulse']);
  assert.deepEqual(ledger(),[{provider:'resend',status:'unknown'},{provider:'sendpulse',status:'unknown'}]);
  assert.equal((await form('/auth/email/request',{email:sent[0].email})).status,200);assert.equal(sent.length,2,'Mailbox cooldown survives uncertainty');
  await verifySent('The possibly delivered code stays valid');
 }
 // A later rejection, a full account or a ledger outage cannot undo an earlier
 // send that may have arrived.
 uncertain='server';uncertainProvider='resend';
 reset();sent=[];rejectSendPulse=true;
 assert.equal((await requestOtp()).status,200);rejectSendPulse=false;
 assert.deepEqual(ledger(),[{provider:'resend',status:'unknown'},{provider:'sendpulse',status:'failed'}]);
 await verifySent('A second-account rejection keeps the first uncertain code');
 reset();seedOtp('sendpulse',50);sent=[];
 assert.equal((await requestOtp()).status,200);assert.deepEqual(sent.map(item=>item.provider),['resend']);
 await verifySent('A full second account keeps the first uncertain code');
 reset();sent=[];
 sql.exec("CREATE TRIGGER otp_ledger_down BEFORE INSERT ON email_otp_deliveries WHEN NEW.provider='sendpulse' BEGIN SELECT RAISE(ABORT,'fixture ledger outage'); END");
 assert.equal((await requestOtp()).status,200);sql.exec('DROP TRIGGER otp_ledger_down');
 assert.deepEqual(sent.map(item=>item.provider),['resend']);
 await verifySent('A second-account ledger outage keeps the first uncertain code');
 uncertain=null;uncertainProvider=null;
 // Daily, hourly and monthly caps are real account caps, shared with follow-ups.
 reset();sent=[];seedOtp('resend',100);seedOtp('sendpulse',50);
 assert.equal((await requestOtp()).status,503);assert.equal(sent.length,0);
 reset();seedOtp('resend',3000,2*86400000);seedOtp('sendpulse',12000,2*86400000);
 assert.equal((await requestOtp()).status,503);assert.equal(sent.length,0,'A new day cannot bypass a monthly ceiling');
 reset();seedFollowups(100);seedOtp('sendpulse',50);
 assert.equal((await requestOtp()).status,503);assert.equal(sent.length,0,'Already sent follow-ups count against OTP account capacity');

 reset();seedOtp('resend',99);env.SENDPULSE_HOURLY_EMAIL_LIMIT='0';sent=[];
 const concurrent=await Promise.all([requestOtp(),requestOtp()]);
 assert.deepEqual(concurrent.map(response=>response.status).sort(),[200,503]);assert.equal(sent.length,1,'Concurrent OTP requests reserve the last slot once');
 delete env.SENDPULSE_HOURLY_EMAIL_LIMIT;
 // Shared accounting also protects concurrent marketing claims, even after
 // OTP has borrowed most of the account's daily allowance.
 reset();seedOtp('resend',80);seedFollowups(19);sent=[];
 const ids=[];
 for(const userId of ['marketing-one','marketing-two']){
  addUser(userId);const id=crypto.randomUUID();ids.push(id);
  const response=await call(ADMIN+'/api/admin/followups/drafts',{method:'POST',headers:{cookie,origin:ADMIN,'content-type':'application/json'},body:JSON.stringify({id,userId,templateId:'experience',locale:'en',subject:'Support follow-up',body:'Hello, please tell us how your Remote Arc setup is going.'})});assert.equal(response.status,201);
 }
 const marketing=await Promise.all(ids.map(id=>dispatchFollowup(typed(),id)));
 assert.deepEqual(marketing.map(response=>response.status).sort(),[200,429]);assert.equal(sent.length,1);
 assert.equal((await emailAccountCapacity(typed(),'resend')).daily.remaining,0);
 reset();sent=[];delete env.RESEND_API_KEY;
 assert.equal((await requestOtp()).status,200);assert.deepEqual(sent.map(item=>item.provider),['sendpulse'],'A configured fallback can keep OTP available without the primary key');
 env.RESEND_API_KEY='fixture-otp-resend';
 seedOtp('resend',5,33*86400000);seedOtp('resend',7,30*86400000);await purgeEmailCapacity(typed());
 assert.equal(sql.prepare("SELECT SUM(units) n FROM email_otp_deliveries WHERE provider='resend'").get()?.n,7,'Cleanup keeps every row still needed for the monthly ceiling');
 console.log('PASS: OTP borrows follow-up allocations above reserve floors, automatically spills to SendPulse, finishes signup, uses one code across rejected and uncertain sends, keeps possibly delivered codes valid, and enforces shared daily/monthly/hourly quotas under concurrent OTP and marketing requests. No real emails or paid capacity.');
}finally{await Promise.all(fixture.pending);globalThis.fetch=originalFetch;sql.close();}
