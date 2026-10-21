import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleArcChat,arcMessages,type ArcEnv,type ArcRun} from '../src/arc-chat.js';
import {runArcStep} from '../src/arc-chat-runtime.js';
import {ARC_MODELS} from '../src/arc-chat-model.js';
import {handleApps} from '../src/apps.js';
import {sha256Hex} from '../src/auth.js';
import {arcTaskState,prepareArcAppAction} from '../src/arc-task-state.js';
import {APP_PROVIDERS} from '../src/app-catalog.js';
import {requestArcAppConnection} from '../src/arc-app-connections.js';

const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const file of fs.readdirSync('migrations').filter(file=>file.endsWith('.sql')).sort())sql.exec(fs.readFileSync('migrations/'+file,'utf8'));
const db={prepare(query:string){const statement=sql.prepare(query),bound=(args:any[])=>({async first(){return statement.get(...args)||null;},async all(){return{results:statement.all(...args)};},async run(){return this.runSync();},runSync(){const result=statement.run(...args);return{success:true,meta:{changes:Number(result.changes)}};}});return{...bound([]),bind(...args:any[]){assert(!args.includes(undefined),query);return bound(args);}};},async batch(statements:any[]){sql.exec('BEGIN IMMEDIATE');try{const results=statements.map(statement=>statement.runSync());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}} as unknown as D1Database;
const origin='https://agent.remotearc.app',at=new Date().toISOString(),future=new Date(Date.now()+86400000).toISOString();
for(const user of ['owner','other']){sql.prepare("INSERT INTO users(id,google_sub,email,role,created_at) VALUES(?,?,?,'user',?)").run(user,user,user+'@example.invalid',at);sql.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(await sha256Hex('session-'+user),user,future,at);}
let models=0,wakes=0,writes=0,reads=0,archived=false;const decisions:any[]=[];
const env={DB:db,PUBLIC_ORIGIN:origin,APP_ORIGIN:origin,DASHBOARD_ORIGIN:origin,ENABLE_APPS:'1',APP_TOKEN_KEY:Buffer.alloc(32,2).toString('base64'),APP_NOTION_CLIENT_ID:'client',APP_NOTION_CLIENT_SECRET:'secret',APP_GOOGLE_CLIENT_ID:'google-client',APP_GOOGLE_CLIENT_SECRET:'google-secret',ARC_CHAT_ENABLED:'1',ARC_RUNTIME:{getByName:()=>({fetch:async()=>{wakes++;return Response.json({queued:true});}})},MODEL_GATEWAY:{DB:db,enabled:true,models:ARC_MODELS,adapters:{openai:async()=>{models++;assert(decisions.length,'Unexpected model inference');return{value:decisions.shift(),usage:{inputTokens:100,outputTokens:100,cachedInputTokens:0,cacheWriteTokens:0,reasoningTokens:0},providerRequestId:'fixture'};}}}} as unknown as ArcEnv;
const request=(path:string,method='GET',body?:unknown,user='owner',requestOrigin=origin)=>new Request(origin+path,{method,headers:{cookie:'rl_session=session-'+user,origin:requestOrigin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const api=(path:string,method='GET',body?:unknown,user='owner')=>handleArcChat(request('/api/arc/'+path,method,body,user),env);
async function json(response:Response,status=200){const value=await response.json() as any;assert.equal(response.status,status,JSON.stringify(value));return value;}
const tool=(name:string,args:unknown)=>({decision:'tool',tool:name,arguments_json:JSON.stringify(args),message:'正在处理你的请求。'}),reply=(text:string)=>({decision:'reply',tool:'none',arguments_json:'{}',message:text});
const row=(id:string)=>sql.prepare('SELECT * FROM arc_chat_runs WHERE id=?').get(id) as ArcRun;
async function start(text:string){const session=(await json(await api('sessions','POST',{}),201)).id;const value=await json(await api('sessions/'+session+'/messages','POST',{text,requestId:crypto.randomUUID()}),202);return{session,run:value.run.id};}
async function waiting(provider:string,operation?:string){const target=await start('使用 '+provider+' 帮我整理资料。');decisions.push(tool('connect_app',{provider,...(operation?{operation}:{})}));assert.equal(await runArcStep(env,target.run),false);const snapshot=await json(await api('sessions/'+target.session));assert.equal(snapshot.runs[0].status,'waiting_connection');assert.equal(snapshot.appConnections.length,1);return{...target,card:snapshot.appConnections[0]};}
const pageId='11111111-1111-4111-8111-111111111111';
const provider:typeof fetch=async(input,init={})=>{
 const url=String(input);
 if(url==='https://api.notion.com/v1/oauth/token')return Response.json({access_token:'private-notion-token'});
 if(url==='https://api.notion.com/v1/users/me')return Response.json({id:'bot',bot:{workspace_id:'workspace',workspace_name:'Work'}});
 if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'google-partial',scope:'openid email https://www.googleapis.com/auth/presentations.readonly'});
 if(url==='https://www.googleapis.com/oauth2/v3/userinfo')return Response.json({sub:'google-user',email:'owner@example.invalid'});
 if(url==='https://api.notion.com/v1/search'){assert.equal(init.method,'POST');assert.equal(JSON.parse(String(init.body)).query,'周报');return Response.json({results:[{id:pageId,object:'page',url:'https://www.notion.so/'+pageId,properties:{title:{title:[{plain_text:'周报'}]}}}]});}
 if(url==='https://api.notion.com/v1/pages/'+pageId){if(init.method==='PATCH'){assert.deepEqual(JSON.parse(String(init.body)),{in_trash:true});writes++;archived=true;}else reads++;return Response.json({id:pageId,in_trash:archived,url:'https://www.notion.so/'+pageId,properties:{title:{title:[{plain_text:'周报'}]}}});}
 throw Error('Unexpected provider call '+url);
};
async function authorize(target:any,providerId:string){return json(await handleApps(request('/api/apps/authorize','POST',{provider:providerId,chatRequestId:target.card.id}),env,provider));}
async function callback(target:any,providerId:string,error=false){const auth=await authorize(target,providerId),state=new URL(auth.authorizationUrl).searchParams.get('state');return handleApps(request('/api/apps/oauth/'+providerId+'/callback?state='+state+(error?'&error=access_denied':'&code=fixture')),env,provider);}
const previousFetch=globalThis.fetch;globalThis.fetch=provider;
try{
 await json(await api('trial','POST',{confirm:true}));
 const goal=await start('把 Notion 中名为“周报”的页面归档。');
 decisions.push(tool('connect_app',{provider:'notion',operation:'pages.archive'}));assert.equal(await runArcStep(env,goal.run),false);
 const snapshot=await json(await api('sessions/'+goal.session)),card=snapshot.appConnections[0];assert.equal(snapshot.runs[0].status,'waiting_connection');assert.equal(card.name,'Notion');assert(card.configured);
 const pausedModels=models,pausedWakes=wakes,pausedStep=row(goal.run).step,pausedTokens=row(goal.run).tokens_used;
 await runArcStep(env,goal.run);assert.equal(models,pausedModels,'Waiting for account consent makes no model request');assert.equal(writes,0);
 await json(await api('app-connections/'+card.id,'GET',undefined,'other'),404);
 for(const body of ['{','x'.repeat(1001),JSON.stringify({action:'cancel',extra:true})])await json(await handleArcChat(new Request(origin+'/api/arc/app-connections/'+card.id,{method:'POST',headers:{cookie:'rl_session=session-owner',origin,'content-type':'application/json'},body}),env),400);
 assert.equal((await api('app-connections/'+card.id)).headers.get('cache-control'),'private, no-store');
 env.ENABLE_APPS='0';assert.equal((await json(await api('app-connections/'+card.id))).request.configured,false);env.ENABLE_APPS='1';
 const deniedOrigin=await handleArcChat(request('/api/arc/app-connections/'+card.id,'POST',{action:'cancel'},'owner','https://evil.invalid'),env);assert.equal(deniedOrigin.status,403);
 await json(await api('app-connections/'+card.id,'POST',{action:'resume',connectionId:'foreign'}),409);
 const correction=arcTaskState([],goal.run,APP_PROVIDERS.map(provider=>({provider})));assert.equal(correction.availableActions.length,70);assert(correction.availableActions.some(action=>action.provider==='notion'&&action.operation==='search'));assert.equal(arcTaskState([],goal.run,[]).availableActions.length,0);
 const completed=await callback({...goal,card},'notion');assert.equal(completed.status,303);assert.equal(new URL(completed.headers.get('location')!).searchParams.get('session'),goal.session);
 assert.equal(wakes,pausedWakes+1,'OAuth completion automatically wakes the same run');assert.equal(row(goal.run).step,pausedStep);assert.equal(row(goal.run).tokens_used,pausedTokens);
 const notionConnection=sql.prepare("SELECT id FROM app_connections WHERE provider='notion' AND user_id='owner'").get()!.id as string;
 const invalid=await prepareArcAppAction(env,'owner','call_app',{connectionId:notionConnection,operation:'pages.archive',arguments:{}});assert(invalid?.error&&'resourceLookup' in invalid.error);assert.equal((invalid as any).error.resourceLookup[0].operation,'search');
 decisions.push(tool('call_app',{connectionId:notionConnection,operation:'search',arguments:{query:'周报'}}),tool('call_app',{connectionId:notionConnection,operation:'pages.get',arguments:{pageId}}),tool('call_app',{connectionId:notionConnection,operation:'pages.archive',arguments:{pageId}}),tool('call_app',{connectionId:notionConnection,operation:'pages.get',arguments:{pageId}}),reply('已将 Notion 中的“周报”归档。'));
 while(await runArcStep(env,goal.run)){}
 assert.equal(row(goal.run).status,'succeeded');assert.equal(writes,1);assert.equal(reads,2);
 const history=await arcMessages(env,'owner',goal.session);assert.equal(history.filter(message=>message.role==='user').length,1,'The user describes the goal once; authorization adds no fake user command');assert(history.at(-1)!.text.includes('周报'));assert(!JSON.stringify(history).includes('private-notion-token'));
 await json(await api('app-connections/'+card.id,'POST',{action:'resume',connectionId:notionConnection}));await runArcStep(env,goal.run);assert.equal(writes,1,'Repeated callbacks cannot replay an acknowledged write');
 const connected=await start('继续使用 Notion。');decisions.push(tool('connect_app',{provider:'notion'}),reply('Notion 已连接。'));while(await runArcStep(env,connected.run)){}assert.equal((await json(await api('sessions/'+connected.session))).appConnections.length,0,'Connected apps do not prompt for setup again');
 const denied=await waiting('google_slides','presentations.create');const denial=await callback(denied,'google_slides',true);assert.equal(denial.status,303);assert.equal(new URL(denial.headers.get('location')!).searchParams.get('connection'),'retry');assert.equal(row(denied.run).step,1);assert.equal((await json(await api('sessions/'+denied.session))).runs[0].status,'waiting_connection');
 const partial=await callback(denied,'google_slides');assert.equal(partial.status,303);assert.equal(new URL(partial.headers.get('location')!).searchParams.get('connection'),'retry','Partial grants return to the same chat without continuing a write');
 const googleConnection=sql.prepare("SELECT id FROM app_connections WHERE provider='google_slides'").get()!.id as string;
 const needsAccess=await prepareArcAppAction(env,'owner','call_app',{connectionId:googleConnection,operation:'presentations.create',arguments:{title:'Report'}});assert.equal((needsAccess as any).error.requiresConnection,true);
 const unconfigured=await waiting('dropbox');assert.equal(unconfigured.card.configured,false);const expired=await waiting('asana');sql.prepare("UPDATE arc_app_connection_requests SET expires_at='2000-01-01' WHERE id=?").run(expired.card.id);assert.equal((await json(await api('app-connections/'+expired.card.id))).request.status,'expired');assert.equal((await json(await api('app-connections/'+expired.card.id,'POST',{action:'renew'}))).request.status,'pending');
 const beforeChange=models;const changed=await json(await api('sessions/'+unconfigured.session+'/messages','POST',{text:'改为只解释怎么整理资料。',requestId:crypto.randomUUID()}),202);assert.equal(row(unconfigured.run).status,'cancelled');assert.equal(sql.prepare('SELECT status FROM arc_app_connection_requests WHERE id=?').get(unconfigured.card.id)!.status,'cancelled');assert.equal(models,beforeChange);decisions.push(reply('可以按项目和日期整理资料。'));while(await runArcStep(env,changed.run.id)){}
 const cancel=await waiting('airtable');await json(await api('app-connections/'+cancel.card.id,'POST',{action:'cancel'}));assert.equal(row(cancel.run).status,'cancelled');assert.equal(row(cancel.run).cancel_requested,1);await json(await api('app-connections/'+cancel.card.id,'POST',{action:'renew'}),409);
 const reconnect=await start('重新授权 Notion 的页面访问。');decisions.push(tool('connect_app',{provider:'notion',reconnect:true}));assert.equal(await runArcStep(env,reconnect.run),false);assert.equal((await json(await api('sessions/'+reconnect.session))).appConnections.length,1);await json(await api('sessions/'+reconnect.session+'/cancel','POST',{runId:reconnect.run}));assert.equal(sql.prepare('SELECT status FROM arc_app_connection_requests WHERE source_run_id=?').get(reconnect.run)!.status,'cancelled');
 assert.equal((await requestArcAppConnection(env,{...row(cancel.run),automation_id:'schedule'} as ArcRun,{provider:'notion'}) as any).dispatched,false);
 console.log('PASS: one natural-language goal → inline connection → same-run OAuth resume → search/read/write/read-back; no pasted commands, user IDs, extra model calls while waiting, repeated writes, scope upgrades, CSRF or cross-owner access. Providers and inference are scripted.');
}finally{globalThis.fetch=previousFetch;sql.close();}
