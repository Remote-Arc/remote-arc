import assert from 'node:assert/strict';
import {appScopes} from '../src/apps/app-catalog.js';
import {createWorkerFixture,AGENT} from './worker-fixture.js';
import {seal} from '../src/apps/app-oauth.js';
import {callApp} from '../src/apps/apps.js';
import {purgeExpiredGoogleAppContent,googleAppContentCutoff} from '../src/apps/app-retention.js';
import {GOOGLE_APP_DATA_POLICY} from '../src/apps/google-app-policy.js';
import {handleAdminServiceRequest} from '../src/admin/admin-service.js';
import {ADMIN} from './worker-fixture.js';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {registrationPack} from './apps-registration.js';

const scope='https://www.googleapis.com/auth/';
assert.equal(googleAppContentCutoff('2026-11-02T12:00:00.000Z'),'2026-10-26T12:00:00.000Z','retention is exactly seven days');
const pack=registrationPack('https://mcp.remotearc.app');
assert.equal(pack.google.beta.providers.length,5);assert(pack.google.beta.declaredScopes.includes(scope+'gmail.readonly'));assert(pack.google.beta.declaredScopes.includes(scope+'gmail.modify'));
assert(!pack.google.beta.declaredScopes.includes(scope+'presentations'));
for(const [provider,read,write] of [
  ['gmail','gmail.readonly','gmail.modify'],
  ['google_docs','documents.readonly','documents'],
  ['google_sheets','spreadsheets.readonly','spreadsheets'],
  ['google_slides','presentations.readonly','presentations'],
  ['google_search_console','webmasters.readonly','webmasters'],
] as const){
  assert(appScopes(provider,['read']).includes(scope+read));
  const requested=appScopes(provider,['read','write']);
  assert(requested.includes(scope+write));
  assert(!requested.includes(scope+read),provider+': write authorization must omit the redundant read-only scope');
}
for(const provider of ['google_calendar','google_analytics','google_drive'] as const){
  const requested=appScopes(provider,['read','write']);
  assert(requested.includes(scope+({google_calendar:'calendar.readonly',google_analytics:'analytics.readonly',google_drive:'drive.readonly'}[provider])));
}
console.log('PASS: Google scope minimization preserves read-only connections and independent grants.');

const f=createWorkerFixture();
f.addUser('google-owner');f.addUser('another-owner');
f.env.APP_TOKEN_KEY=Buffer.alloc(32,9).toString('base64');
const connectionId=crypto.randomUUID(),callId=crypto.randomUUID();
const token=await seal(f.env as any,{accessToken:'test-token',refreshToken:'test-refresh',scopes:appScopes('gmail',['read','write']),expiresAt:null},'app-token:google-owner:gmail:'+connectionId);
f.sql.prepare("INSERT INTO app_connections(id,user_id,provider,account_id,account_label,status,permissions_json,scopes_json,token_ciphertext,created_at,updated_at) VALUES(?,?, 'gmail','google-account','owner@example.test','active','[\"read\",\"write\"]',?,?,?,?)")
 .run(connectionId,'google-owner',JSON.stringify(appScopes('gmail',['read','write'])),token,f.now,f.now);
f.sql.prepare("INSERT INTO app_calls(id,user_id,connection_id,connection_generation,operation,permission,request_id,input_hash,arguments_ciphertext,result_ciphertext,status,expires_at,created_at,updated_at) VALUES(?,?,?,1,'messages.get','read','privacy-test-request','hash','private-arguments','private-result','succeeded',?,?,?)")
 .run(callId,'google-owner',connectionId,f.now,f.now,f.now);
const ownerCookie=await f.sessionCookie('google-owner');
const erase=(cookie=ownerCookie,origin=AGENT,body:unknown={confirm:true})=>f.call(AGENT+'/api/apps/connections/'+connectionId+'/data-deletion',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)});
assert.equal((await erase('')).status,401);
assert.equal((await erase(await f.sessionCookie('another-owner'))).status,404);
assert.equal((await erase(ownerCookie,'https://evil.test')).status,403);
assert.equal((await erase(ownerCookie,AGENT,{confirm:false})).status,400);
assert.equal(f.sql.prepare('SELECT arguments_ciphertext FROM app_calls WHERE id=?').get(callId)?.arguments_ciphertext,'private-arguments');
assert.equal((await erase()).status,200,'owner must be able to erase saved Google call contents');
const deleted=f.sql.prepare('SELECT * FROM app_calls WHERE id=?').get(callId)!;
assert.equal(deleted.arguments_ciphertext,'');assert.equal(deleted.result_ciphertext,null);assert.equal(deleted.status,'succeeded');assert(deleted.content_purged_at);
assert.equal(deleted.input_hash,'hash');assert.equal(deleted.request_id,'privacy-test-request');
assert.equal(f.sql.prepare('SELECT token_ciphertext FROM app_connections WHERE id=?').get(connectionId)?.token_ciphertext,token);
assert.equal((await (await erase()).json() as any).deleted,0,'deletion is safe to repeat');

async function seedConnection(userId:string,provider:'gmail'|'github'='gmail'){
  const id=crypto.randomUUID();const scopes=appScopes(provider,['read','write']);
  const encrypted=await seal(f.env as any,{accessToken:'private-provider-canary',expiresAt:null,scopes},'app-token:'+userId+':'+provider+':'+id);
  f.sql.prepare("INSERT INTO app_connections(id,user_id,provider,account_id,account_label,status,permissions_json,scopes_json,token_ciphertext,created_at,updated_at,connection_metadata_json) VALUES(?,?,?,?,?,'active','[\"read\",\"write\"]',?,?,?,?,?)")
    .run(id,userId,provider,id,'Private test account',JSON.stringify(scopes),encrypted,f.now,f.now,JSON.stringify({googleDataConsent:{version:GOOGLE_APP_DATA_POLICY.version,acceptedAt:f.now}}));
  return id;
}
function seedCall(id:string,userId:string,created:string,status='succeeded',permission='read'){
  const call=crypto.randomUUID();
  f.sql.prepare("INSERT INTO app_calls(id,user_id,connection_id,connection_generation,operation,permission,request_id,input_hash,arguments_ciphertext,result_ciphertext,review_ciphertext,status,expires_at,created_at,updated_at) VALUES(?,?,?,1,'messages.get',?,?, 'hash','encrypted-input','encrypted-output','encrypted-review',?,?,?,?)")
   .run(call,userId,id,permission,call,status,f.now,created,created);
  return call;
}
const retained=await seedConnection('google-owner'),other=await seedConnection('another-owner'),nongoogle=await seedConnection('google-owner','github');
const cutoff=googleAppContentCutoff(f.now),prior=new Date(Date.parse(cutoff)-1).toISOString(),after=new Date(Date.parse(cutoff)+1).toISOString();
const old=seedCall(retained,'google-owner',prior),boundary=seedCall(retained,'google-owner',cutoff),recent=seedCall(retained,'google-owner',after),foreign=seedCall(other,'another-owner',f.now),github=seedCall(nongoogle,'google-owner',prior);
const oldRunning=seedCall(retained,'google-owner',prior,'running','write'),oldWaiting=seedCall(retained,'google-owner',prior,'approved','write');
assert.equal((await purgeExpiredGoogleAppContent(f.env as any,f.now)).purged,4);
assert.equal(f.sql.prepare('SELECT status FROM app_calls WHERE id=?').get(oldRunning)?.status,'unknown');assert.equal(f.sql.prepare('SELECT status FROM app_calls WHERE id=?').get(oldWaiting)?.status,'cancelled');
for(const id of [old,boundary]){const row=f.sql.prepare('SELECT * FROM app_calls WHERE id=?').get(id)!;assert.equal(row.arguments_ciphertext,'');assert.equal(row.result_ciphertext,null);assert.equal(row.review_ciphertext,null);assert.equal(row.status,'succeeded');assert.equal(row.content_purged_at,f.now);}
for(const id of [recent,foreign,github])assert.equal(f.sql.prepare('SELECT arguments_ciphertext FROM app_calls WHERE id=?').get(id)?.arguments_ciphertext,'encrypted-input');
for(let i=0;i<105;i++)seedCall(retained,'google-owner',prior);
assert.equal((await purgeExpiredGoogleAppContent(f.env as any,f.now)).purged,100);
assert.equal((await purgeExpiredGoogleAppContent(f.env as any,f.now)).purged,5);

Object.assign(f.env,{APP_GOOGLE_CLIENT_ID:'fixture-client',APP_GOOGLE_CLIENT_SECRET:'fixture-secret'});
const identity={userId:'google-owner',scope:'apps:read apps:write'};
let reads=0,writes=0;
const provider:typeof fetch=async(input,init)=>{assert(String(input).startsWith('https://gmail.googleapis.com/gmail/v1/users/me/'));if(init?.method==='POST')writes++;else reads++;return Response.json({id:'test-result',text:'private-message-result-canary'});};
const query={connectionId:retained,operation:'messages.get',arguments:{id:'message-fixture'},requestId:'read-retention-fixture'};
const first=await callApp(f.env as any,identity,query,provider);assert.equal(first.status,'succeeded');
assert.equal((await callApp(f.env as any,identity,query,provider) as any).replayed,true);assert.equal(reads,1);
f.sql.prepare('UPDATE app_calls SET created_at=? WHERE id=?').run(prior,first.callId);
const expired=await callApp(f.env as any,identity,query,provider);
assert.equal((expired as any).contentExpired,true);assert(!JSON.stringify(expired).includes('private-message-result-canary'));assert.equal(reads,1);
const write={connectionId:retained,operation:'drafts.create',arguments:{to:['test@example.test'],subject:'A fixture',body:'private-draft-canary'},requestId:'write-retention-fixture'};
const sent=await callApp(f.env as any,identity,write,provider);assert.equal(sent.status,'succeeded');assert.equal(writes,1);
f.sql.prepare('UPDATE app_calls SET created_at=? WHERE id=?').run(prior,sent.callId);
assert.equal((await callApp(f.env as any,identity,write,provider) as any).contentExpired,true);assert.equal(writes,1,'expired receipts never dispatch a write again');

let release!:(response:Response)=>void,dispatched!:()=>void;
const started=new Promise<void>(resolve=>{dispatched=resolve;});
const running=callApp(f.env as any,identity,{...write,requestId:'inflight-retention-fixture'},async()=>{writes++;dispatched();return new Promise<Response>(resolve=>{release=resolve;});});
await started;
assert.equal((await f.call(AGENT+'/api/apps/connections/'+retained+'/data-deletion',{method:'POST',headers:{cookie:ownerCookie,origin:AGENT,'content-type':'application/json'},body:JSON.stringify({confirm:true})})).status,200);
release(Response.json({id:'late-write',text:'late-private-result-canary'}));
const fenced=await running;assert.equal(fenced.status,'unknown');assert(!JSON.stringify(fenced).includes('late-private-result-canary'));
const receipt=f.sql.prepare("SELECT * FROM app_calls WHERE request_id='inflight-retention-fixture'").get()!;
assert.equal(receipt.status,'unknown');assert.equal(receipt.result_ciphertext,null);assert(receipt.content_purged_at);
assert.equal(f.sql.prepare('SELECT arguments_ciphertext FROM app_calls WHERE id=?').get(foreign)?.arguments_ciphertext,'encrypted-input');

f.addUser('beta-applicant');f.addUser('beta-operator','admin');
const applicantCookie=await f.sessionCookie('beta-applicant'),operatorCookie=await f.sessionCookie('beta-operator');
const api=(path:string,body:unknown,cookie=applicantCookie,origin=AGENT)=>f.call(AGENT+'/api/apps/'+path,{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)});
const auth={provider:'gmail',permissions:['read','write'],dataConsent:GOOGLE_APP_DATA_POLICY.version};
assert.equal((await api('authorize',auth)).status,403);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM app_oauth_states').get()?.n,0);
const application={googleEmail:'Tester@Example.test',providers:['gmail'],useCase:'private-use-case-canary',betaTerms:true};
assert.equal((await api('google-beta',application,'')).status,401);
assert.equal((await api('google-beta',application,applicantCookie,'https://evil.test')).status,403);
assert.equal((await api('google-beta',{...application,betaTerms:false})).status,400);
assert.equal((await api('google-beta',{...application,providers:['github']})).status,400);
assert.equal((await api('google-beta',{...application,status:'approved'})).status,400);
assert.equal((await api('google-beta',{...application,useCase:'x'.repeat(9000)})).status,400);
assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM support_threads').get()?.n,0);
const previousFetch=globalThis.fetch;
try{globalThis.fetch=async()=>{throw Error('Beta applications must never send email or call a provider');};
  const results=await Promise.all([api('google-beta',application),api('google-beta',application)]);
  for(const result of results)assert.equal(result.status,200);
}finally{globalThis.fetch=previousFetch;}
assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM google_app_beta_requests').get()?.n,1);
assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM support_threads').get()?.n,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM support_messages').get()?.n,1);
const beta=f.sql.prepare('SELECT * FROM google_app_beta_requests').get()!;assert.equal(beta.google_email,'tester@example.test');assert.equal(beta.status,'pending');
assert(!JSON.stringify(f.sql.prepare('SELECT * FROM support_messages').all()).includes('private-use-case-canary'));
const review=(body:unknown,cookie=operatorCookie,origin=ADMIN)=>handleAdminServiceRequest(new Request(ADMIN+'/api/admin/support-inbox/'+beta.support_thread_id+'/google-beta',{method:'PATCH',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)}),f.env as any);
assert.equal((await review({decision:'approve',googleTestUserAdded:true},applicantCookie)).status,403);
assert.equal((await review({decision:'approve',googleTestUserAdded:true},operatorCookie,'https://evil.test')).status,403);
assert.equal((await review({decision:'approve'})).status,400);
assert.equal((await review({decision:'approve',googleTestUserAdded:true})).status,200);
assert.equal(f.sql.prepare('SELECT reviewed_by FROM google_app_beta_requests').get()?.reviewed_by,'beta-operator');
assert.equal((await review({decision:'approve',googleTestUserAdded:true})).status,409);
assert.equal((await api('authorize',{provider:'gmail'})).status,403,'a Beta approval does not replace data-use consent');
assert.equal((await api('authorize',{...auth,dataConsent:'old-policy'})).status,400);
assert.equal((await api('authorize',{...auth,provider:'google_drive'})).status,200,'an invited user can separately consent to another pilot App');
assert.equal((await api('authorize',auth)).status,200);
const state=await (await f.call(AGENT+'/api/apps',{headers:{cookie:applicantCookie}})).json() as any;
assert.equal(state.googleBeta.request.status,'approved');assert.equal(state.apps.find((app:any)=>app.provider==='gmail').requiresBetaApproval,false);
assert(!JSON.stringify(state).includes('private-use-case-canary'));assert(!JSON.stringify(state).includes('private-provider-canary'));
const staleApproval=seedCall(other,'another-owner',prior,'unknown','write');
f.sql.prepare("UPDATE app_calls SET operation='drafts.create',arguments_ciphertext=?,review_ciphertext=NULL WHERE id=?")
 .run(await seal(f.env as any,{body:'expired-approval-canary'},'app-call:another-owner:'+staleApproval+':arguments'),staleApproval);
const approvals=await f.call(AGENT+'/api/apps/approvals',{headers:{cookie:await f.sessionCookie('another-owner')}});
assert.equal(approvals.status,200);
assert(!JSON.stringify(await approvals.json()).includes('expired-approval-canary'),'expired content must not appear in the approval queue before cleanup runs');
const consentResponse=await f.call(AGENT+'/api/apps/connections/'+connectionId+'/data-consent',{method:'POST',headers:{cookie:ownerCookie,origin:AGENT,'content-type':'application/json'},body:JSON.stringify({dataConsent:GOOGLE_APP_DATA_POLICY.version})});
assert.equal(consentResponse.status,200);const consented=(await consentResponse.json() as any).connection;
assert.equal(consented.dataConsentRequired,false);assert.deepEqual(consented.settings,{},'consent audit metadata must not be submitted as provider settings');
assert.equal(f.sql.prepare('SELECT token_ciphertext FROM app_connections WHERE id=?').get(connectionId)?.token_ciphertext,token,'consent must not replace provider credentials');
assert.equal(state.apps.find((app:any)=>app.provider==='google_slides').configured,false,'unenabled Google services are not advertised as ready in the pilot');
const upgraded=new DatabaseSync(':memory:');upgraded.exec('PRAGMA foreign_keys=ON');
const migrations=new URL('../migrations/',import.meta.url);
for(const file of fs.readdirSync(migrations).filter(file=>file.endsWith('.sql')&&!file.startsWith('0076_')).sort())upgraded.exec(fs.readFileSync(new URL(file,migrations),'utf8'));
upgraded.prepare("INSERT INTO users(id,google_sub,email,created_at) VALUES('old-user','old-sub','old@example.test',?)").run(f.now);
upgraded.prepare("INSERT INTO app_connections(id,user_id,provider,account_id,account_label,status,permissions_json,scopes_json,created_at,updated_at) VALUES('old-connection','old-user','gmail','old-account','Old account','active','[]','[]',?,?)").run(f.now,f.now);
upgraded.prepare("INSERT INTO app_calls(id,user_id,connection_id,connection_generation,operation,permission,request_id,input_hash,arguments_ciphertext,status,expires_at,created_at,updated_at) VALUES('old-call','old-user','old-connection',1,'messages.get','read','old-request','old-hash','preserved-ciphertext','succeeded',?,?,?)").run(f.now,f.now,f.now);
upgraded.exec(fs.readFileSync(new URL('0076_apps_beta_and_retention.sql',migrations),'utf8'));
assert.equal(upgraded.prepare("SELECT arguments_ciphertext FROM app_calls WHERE id='old-call'").get()?.arguments_ciphertext,'preserved-ciphertext');assert.equal(upgraded.prepare("SELECT content_purged_at FROM app_calls WHERE id='old-call'").get()?.content_purged_at,null);upgraded.close();
console.log('PASS: real Worker/SQLite Beta admission, encrypted inbox submissions, contextual consent, ownership/CSRF, seven-day boundaries, bounded cleanup, early deletion and in-flight/idempotency fences.');
