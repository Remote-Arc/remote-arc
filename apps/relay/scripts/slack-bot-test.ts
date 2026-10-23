import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {sha256Hex} from '../src/auth.js';
import {seal} from '../src/app-oauth.js';
import {arcMessages,type ArcRun} from '../src/arc-chat.js';
import {ARC_MODELS} from '../src/arc-chat-model.js';
import {runArcStep} from '../src/arc-chat-runtime.js';
import {activateArcTrial} from '../src/arc-trial.js';
import {assignBillingPlan} from '../src/billing-ledger.js';
import {handleSlackEvents} from '../src/slack-bot-events.js';
import {handleSlackBotAccount} from '../src/slack-bot-install.js';
import {runSlackJobs} from '../src/slack-bot-jobs.js';
import {SLACK_BOT_SCOPES,slackTokenContext,type SlackBotEnv} from '../src/slack-bot-common.js';

const sql=new DatabaseSync(':memory:');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
const db={prepare(query:string){const stmt=sql.prepare(query);const bind=(args:any[])=>({async first(){return stmt.get(...args)||null},async all(){return{results:stmt.all(...args)}},async run(){return this.sync()},sync(){const value=stmt.run(...args);return{success:true,meta:{changes:Number(value.changes)}}}});return{...bind([]),bind(...args:any[]){assert(!args.includes(undefined),query);return bind(args)}}},async batch(statements:any[]){sql.exec('BEGIN');try{const values=statements.map(statement=>statement.sync());sql.exec('COMMIT');return values}catch(error){sql.exec('ROLLBACK');throw error}}} as any;
const origin='https://mcp.remotearc.app',now=new Date().toISOString(),future=new Date(Date.now()+86400000).toISOString();
for(const id of ['owner','other','unfunded']){
 sql.prepare('INSERT INTO users(id,google_sub,email,created_at) VALUES(?,?,?,?)').run(id,id,id+'@example.invalid',now);
 sql.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(await sha256Hex('test-'+id),id,future,now);
 sql.prepare('INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at) VALUES(?,?,?,?,?,?)').run('device-'+id,id,'Computer '+id,'linux','fixture-'+id,now);
}
let wakes=0,models=0;
const decisions:unknown[]=[];
const env={DB:db,PUBLIC_ORIGIN:origin,APP_ORIGIN:origin,DASHBOARD_ORIGIN:origin,APP_TOKEN_KEY:Buffer.alloc(32,3).toString('base64'),APP_SLACK_SIGNING_SECRET:'fixture-signing-secret',APP_SLACK_CLIENT_ID:'fixture-client',APP_SLACK_CLIENT_SECRET:'fixture-secret',SLACK_BOT_ENABLED:'1',ENABLE_APPS:'1',ARC_PLATFORM_ENABLED:'1',REGISTRY:{getByName:()=>({fetch:async()=>Response.json([])})},ARC_RUNTIME:{getByName:()=>({fetch:async()=>{wakes++;return Response.json({started:true})}})},MODEL_GATEWAY:{DB:db,enabled:true,models:ARC_MODELS,adapters:{openai:async()=>{models++;assert(decisions.length,'No expected model decision');return{value:decisions.shift(),usage:{inputTokens:100,outputTokens:50,cachedInputTokens:0,cacheWriteTokens:0,reasoningTokens:0},providerRequestId:'fixture'}}}}} as unknown as SlackBotEnv;
await activateArcTrial(env,'owner');await activateArcTrial(env,'other');
const calls:{method:string;body:any}[]=[];
let messageNumber=0,failPost=false,ratePost=false,failUpdate=false;
const fetcher:typeof fetch=async(input,init)=>{
 const method=new URL(String(input)).pathname.split('/').at(-1)!;
 if(method==='oauth.v2.access')return Response.json({ok:true,app_id:'AAPP123',team:{id:'TTEAM123',name:'External workspace'},bot_user_id:'UBOT123',access_token:'fixture-bot-token',scope:SLACK_BOT_SCOPES.join(',')});
 const body=JSON.parse(String(init?.body||'{}'));calls.push({method,body});
 if(method==='users.info')return Response.json({ok:true,user:{id:body.user,team_id:'TTEAM123',deleted:false,is_bot:false}});
 if(method==='conversations.open')return Response.json({ok:true,channel:{id:'D'+body.users.slice(1)}});
 if(method==='chat.postMessage'){
  if(failPost){failPost=false;throw Error('simulated transport loss');}
  if(ratePost){ratePost=false;return Response.json({ok:false,error:'ratelimited'},{status:429,headers:{'retry-after':'1'}});}
  return Response.json({ok:true,channel:body.channel,ts:'1700000000.'+String(++messageNumber).padStart(6,'0')});
 }
 if(method==='chat.update'){if(failUpdate){failUpdate=false;throw Error('simulated lost update acknowledgement');}return Response.json({ok:true,channel:body.channel,ts:body.ts});}
 throw Error('Unexpected provider request '+method);
};
const account=(path:string,method='GET',user='owner',body?:unknown,requestOrigin=origin)=>new Request(origin+path,{method,headers:{cookie:'rl_session=test-'+user,origin:requestOrigin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const botAccount=(path:string,method='GET',user='owner',body?:unknown)=>handleSlackBotAccount(account(path,method,user,body),env,fetcher);
async function signed(input:unknown,at=Math.floor(Date.now()/1000),secret=env.APP_SLACK_SIGNING_SECRET!){
 const raw=JSON.stringify(input),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const digest=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('v0:'+at+':'+raw)))).map(value=>value.toString(16).padStart(2,'0')).join('');
 return new Request(origin+'/api/slack/events',{method:'POST',headers:{'content-type':'application/json','x-slack-request-timestamp':String(at),'x-slack-signature':'v0='+digest},body:raw});
}
let eventNumber=0;
const event=(user='UOWNER',text='Hello Remote Arc',extra:Record<string,unknown>={})=>({type:'event_callback',team_id:'TTEAM123',api_app_id:'AAPP123',event_id:'EvTEST'+String(++eventNumber).padStart(5,'0'),event:{type:'message',channel_type:'im',user,channel:'D'+user.slice(1),ts:'1700000000.'+String(eventNumber).padStart(6,'0'),text,...extra}});
const enqueue=async(input:ReturnType<typeof event>)=>{assert.equal((await handleSlackEvents(await signed(input),env)).status,200);return input.team_id+':'+input.event_id};
const row=(id:string)=>sql.prepare('SELECT * FROM slack_arc_events WHERE id=?').get(id) as any;
const ready=(id?:string)=>id?sql.prepare("UPDATE slack_arc_events SET next_attempt_at='2000-01-01T00:00:00.000Z',lease=NULL,lease_until=NULL WHERE id=?").run(id):sql.prepare("UPDATE slack_arc_events SET next_attempt_at='2000-01-01T00:00:00.000Z',lease=NULL,lease_until=NULL WHERE status IN ('pending','waiting_run')").run();
const reply=(text:string)=>({decision:'reply',tool:'none',arguments_json:'{}',message:text});
async function linkUser(user:string,arcUser:string,text='Hello'){
 const id=await enqueue(event(user,text));await runSlackJobs(env,{fetcher});
 const message=calls.filter(call=>call.method==='chat.postMessage').at(-1)!.body;
  assert.equal(message.channel,'D'+user.slice(1));const code=message.text.match(/code=([\w-]+)/)?.[1];assert(code);
  assert.match(message.text,/<https:\/\/[^\s<>|]+\/slack\/link\?code=[a-f0-9]{64}\|Connect your Remote Arc account>/,'Account linking remains clickable with parse:none');
 assert.equal(row(id).status,'awaiting_link');assert.equal(row(id).run_id,null);
  const page=await botAccount('/slack/link?code='+code,'GET',arcUser);assert((await page.text()).includes(arcUser+'@example.invalid'));
  assert.equal(page.headers.get('referrer-policy'),'same-origin');
 const forged=await handleSlackBotAccount(account('/slack/link?code='+code,'POST',arcUser,{},'https://evil.example'),env,fetcher);assert.equal(forged.status,403);
 assert.equal((await botAccount('/slack/link?code='+code,'POST',arcUser,{})).status,200);
 return id;
}

// Install is a workspace capability, not a grant of the installer's Arc account.
assert.equal((await handleSlackBotAccount(new Request(origin+'/api/slack/status'),env)).status,401);
const install=await botAccount('/api/slack/install','POST','owner',{}),auth=new URL((await install.json() as any).authorizationUrl);
assert.equal(auth.searchParams.has('team'),false);assert.equal(auth.searchParams.has('user_scope'),false);assert.equal(auth.searchParams.get('scope'),SLACK_BOT_SCOPES.join(','));
const callback='/api/slack/oauth/callback?code=fixture-code&state='+auth.searchParams.get('state');assert.equal((await botAccount(callback)).status,303);assert.equal((await botAccount(callback)).status,400);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM slack_arc_links').get()?.n,0);
// Trial users cannot opt into a named model; Plus and Pro can configure their
// own preference. Execution still rechecks provider grants and wallet budgets.
assert.equal((await botAccount('/api/slack/settings','POST','owner',{modelId:'gpt-6.1-sol'})).status,403);
assert.equal((await botAccount('/api/slack/settings','POST','owner',{modelId:'auto'})).status,200);
assert.equal((await (await botAccount('/api/slack/status')).json() as any).canSelectModel,false);
sql.prepare("UPDATE users SET role='admin' WHERE id='unfunded'").run();
for(const plan of ['arc-plus-v1','arc-pro-v1']){
 await assignBillingPlan(db,'unfunded',{id:'fixture-'+plan,planId:plan,subjectType:'user',subjectId:'other',expiresAt:future});
 assert.equal((await botAccount('/api/slack/settings','POST','other',{modelId:'gpt-6.1-sol'})).status,200);
 assert.equal((await (await botAccount('/api/slack/status','GET','other')).json() as any).modelId,'gpt-6.1-sol');
 sql.prepare('DELETE FROM billing_plan_assignments WHERE id=?').run('fixture-'+plan);
}
assert.equal((await (await botAccount('/api/slack/status','GET','other')).json() as any).modelId,'auto','Downgrade uses Auto without losing the saved paid preference');
assert.equal((await (await botAccount('/api/slack/status')).json() as any).modelId,'auto','Another account cannot change this account model');
// Authentication and request shape are checked before any queue record or model.
assert.equal((await handleSlackEvents(await signed({type:'url_verification',challenge:'verify-me'}),env)).status,200);
assert.equal((await handleSlackEvents(await signed(event(),Math.floor(Date.now()/1000),'wrong-secret'),env)).status,401);
assert.equal((await handleSlackEvents(await signed(event(),Math.floor(Date.now()/1000)-301),env)).status,401);
for(const extra of [{subtype:'message_changed'},{bot_id:'BBOT'},{user:'UBOT123'},{type:'message',channel_type:'channel'}])await enqueue(event('UOWNER','ignore',extra));
assert.equal(sql.prepare('SELECT COUNT(*) n FROM slack_arc_events').get()?.n,0);
const wrongApp=event();wrongApp.api_app_id='AOTHER';await enqueue(wrongApp);assert.equal(sql.prepare('SELECT COUNT(*) n FROM slack_arc_events').get()?.n,0);

const first=await linkUser('UOWNER','owner','Find my computers');assert.equal(models,0);
await runSlackJobs(env,{fetcher});const ownerRun=row(first).run_id;assert(ownerRun);assert.equal(row(first).user_id,'owner');assert.equal(row(first).status,'waiting_run');
decisions.push({decision:'tool',tool:'list_devices',arguments_json:'{}',message:'Checking your computers'},reply('Found your own computer.'));
assert.equal(await runArcStep(env,ownerRun),true,JSON.stringify(sql.prepare('SELECT status,error_code FROM arc_chat_runs WHERE id=?').get(ownerRun)));assert.equal(await runArcStep(env,ownerRun),false);
const journal=await arcMessages(env,'owner',(sql.prepare('SELECT session_id FROM arc_chat_runs WHERE id=?').get(ownerRun) as any).session_id,ownerRun);
assert(JSON.stringify(journal).includes('Computer owner'));assert(!JSON.stringify(journal).includes('Computer other'));
await runSlackJobs(env,{runId:ownerRun,fetcher});assert.equal(row(first).status,'delivered');assert(calls.some(call=>call.method==='chat.update'&&call.body.channel==='DOWNER'&&call.body.text.includes('Found your own computer.')));
assert.equal((sql.prepare('SELECT COUNT(*) n FROM billing_reservations WHERE user_id=?').get('owner') as any).n,2);
const beforeDuplicate=models;await handleSlackEvents(await signed({type:'event_callback',team_id:'TTEAM123',api_app_id:'AAPP123',event_id:first.split(':')[1],event:{type:'message',channel_type:'im',user:'UOWNER',channel:'DOWNER',ts:'1700000000.000001',text:'Find my computers'}}),env);await runSlackJobs(env,{fetcher});assert.equal(models,beforeDuplicate);

const second=await linkUser('UOTHER','other','Hello from another account');await runSlackJobs(env,{fetcher});assert.equal(row(second).user_id,'other');const otherRun=row(second).run_id;
decisions.push(reply('Private response for the other account.'));await runArcStep(env,otherRun);await runSlackJobs(env,{runId:otherRun,fetcher});assert.equal(row(second).status,'delivered');
assert(calls.some(call=>call.method==='chat.update'&&call.body.channel==='DOTHER'&&call.body.text.includes('Private response for the other account.')));
assert.notEqual((sql.prepare('SELECT session_id FROM arc_chat_runs WHERE id=?').get(ownerRun) as any).session_id,(sql.prepare('SELECT session_id FROM arc_chat_runs WHERE id=?').get(otherRun) as any).session_id);

// A shared thread never joins two principals or publishes personal results.
const mentionIds=[];
for(const user of ['UOWNER','UOTHER']){const id=await enqueue(event(user,'<@UBOT123> My private account data',{type:'app_mention',channel:'CGENERAL',channel_type:'channel',thread_ts:'1700000000.000001'}));await runSlackJobs(env,{fetcher});mentionIds.push(id);decisions.push(reply('Private data for '+user));await runArcStep(env,row(id).run_id);await runSlackJobs(env,{runId:row(id).run_id,fetcher});}
assert.notEqual((sql.prepare('SELECT session_id FROM arc_chat_runs WHERE id=?').get(row(mentionIds[0]!).run_id) as any).session_id,(sql.prepare('SELECT session_id FROM arc_chat_runs WHERE id=?').get(row(mentionIds[1]!).run_id) as any).session_id);
assert(!calls.some(call=>['chat.postMessage','chat.update'].includes(call.method)&&call.body.channel==='CGENERAL'));

// A fresh worker recovers the same admitted run without a second input or spend.
const recovered=await enqueue(event('UOWNER','Recover this request'));await runSlackJobs(env,{fetcher});const recoveredRun=row(recovered).run_id;
sql.prepare("UPDATE slack_arc_events SET run_id=NULL,status='processing',lease='dead-worker',lease_until='2000-01-01',next_attempt_at='2000-01-01' WHERE id=?").run(recovered);
await runSlackJobs(env,{fetcher});assert.equal(row(recovered).run_id,recoveredRun);assert.equal((sql.prepare('SELECT COUNT(*) n FROM arc_chat_runs WHERE request_id=?').get('slack:'+recovered) as any).n,1);
decisions.push(reply('Recovered without replay.'));await runArcStep(env,recoveredRun);failUpdate=true;await runSlackJobs(env,{runId:recoveredRun,fetcher});assert.equal(row(recovered).status,'waiting_run');await runSlackJobs(env,{runId:recoveredRun,fetcher});assert.equal(row(recovered).status,'delivered');

// Loss of a first Slack post is journalled and never blindly resent.
failPost=true;const uncertain=await enqueue(event('UUNLINKED','Link my account'));await runSlackJobs(env,{fetcher});assert.equal(row(uncertain).status,'unknown');const sentBefore=calls.filter(call=>call.method==='chat.postMessage').length;await runSlackJobs(env,{fetcher});assert.equal(calls.filter(call=>call.method==='chat.postMessage').length,sentBefore);
ratePost=true;const limited=await enqueue(event('URATELIMIT','Link my account'));await runSlackJobs(env,{fetcher});assert.equal(row(limited).status,'pending');ready(limited);await runSlackJobs(env,{fetcher});assert.equal(row(limited).status,'awaiting_link');

// Stop remains available after a plan expires, without a model call.
const enterpriseIdentity=await enqueue(event('WENTERPRISE','Link my Enterprise identity'));await runSlackJobs(env,{fetcher});assert.equal(row(enterpriseIdentity).status,'awaiting_link');
const stopped=await enqueue(event('UOWNER','Start a request I will stop'));await runSlackJobs(env,{fetcher});const stoppedRun=row(stopped).run_id;assert(stoppedRun);
sql.prepare("UPDATE arc_trials SET started_at='1999-01-01T00:00:00.000Z',expires_at='2000-01-01T00:00:00.000Z' WHERE user_id='owner'").run();
const beforeStop=models;const stop=await enqueue(event('UOWNER','stop'));await runSlackJobs(env,{fetcher});assert.equal(row(stop).status,'delivered',JSON.stringify(row(stop)));assert.equal((sql.prepare('SELECT status FROM arc_chat_runs WHERE id=?').get(stoppedRun) as any).status,'cancelled');assert.equal(models,beforeStop);
const expired=await enqueue(event('UOWNER','Paid reasoning after expiry'));ready();await runSlackJobs(env,{fetcher});assert.equal(row(expired).run_id,null);assert.equal(models,beforeStop);
assert(calls.filter(call=>call.method==='chat.postMessage').at(-1)?.body.text.includes('trial has ended'));
assert.equal((await botAccount('/api/slack/unlink','POST','other',{teamId:'TTEAM123',slackUserId:'UOWNER'})).status,200);assert.equal((sql.prepare('SELECT status FROM slack_arc_links WHERE slack_user_id=?').get('UOWNER') as any).status,'active');
await botAccount('/api/slack/unlink','POST','owner',{teamId:'TTEAM123',slackUserId:'UOWNER'});assert.equal((sql.prepare('SELECT status FROM slack_arc_links WHERE slack_user_id=?').get('UOWNER') as any).status,'revoked');
assert.equal((sql.prepare('SELECT status FROM slack_arc_links WHERE slack_user_id=?').get('UOTHER') as any).status,'active');

const uninstall=event();(uninstall as any).event={type:'app_uninstalled'};await enqueue(uninstall);assert.equal((sql.prepare('SELECT status FROM slack_bot_installations').get() as any).status,'revoked');assert.equal((sql.prepare('SELECT token_ciphertext FROM slack_bot_installations').get() as any).token_ciphertext,null);
assert(!JSON.stringify(sql.prepare('SELECT * FROM slack_arc_events').all()).includes('Find my computers'));
assert(wakes>0);
console.log('PASS: signed Slack ingress → durable queue → explicit per-user linking → existing Arc plan/budget/tool engine → private durable replies; account/thread isolation, retries, no-loop dedupe, restart, stop, expiry, unlink and uninstall. No real messages or provider charges.');
