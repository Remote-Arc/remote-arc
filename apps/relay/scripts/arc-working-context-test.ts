import assert from 'node:assert/strict';
import {handleArcChat,arcContext,type ArcRun} from '../src/arc/arc-chat.js';
import {arcWorkingContext,arcTeammateIndex,readArcContext,projectMatches} from '../src/arc/arc-working-context.js';
import {seal} from '../src/apps/app-oauth.js';
import {appScopes} from '../src/apps/app-catalog.js';
import {employeeToolError} from '../src/arc/arc-team-execution.js';
import {arcExecutionPrompt} from '../src/arc/arc-chat-runtime.js';
import {executeArcTool} from '../src/arc/arc-chat-runtime.js';

/** Real encrypted storage, authorization, App gateway and HTTP fixture reads.
 * No assertion here pretends that scripted inference proves model quality. */
export async function testArcWorkingContext({sql,env}:any){
 env={...env,ARC_RUNTIME:{getByName:()=>({fetch:async()=>Response.json({queued:true})})}};
 sql.prepare("UPDATE arc_chat_runs SET status='cancelled',cancel_requested=1 WHERE user_id='owner' AND status IN ('queued','thinking','working')").run();
 const origin='https://agent.remotearc.app',api=(path:string,method='GET',value?:unknown,user='owner')=>handleArcChat(new Request(origin+'/api/arc/'+path,{method,headers:{cookie:'rl_session='+user+'-session',origin,'content-type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)})}),env);
 const created=await api('sessions','POST',{}),{id:session}=await created.json() as any;assert.equal(created.status,201);
 const add=async(id:string,role:string,text:string,time:number,extra={})=>sql.prepare('INSERT INTO arc_chat_messages(id,session_id,user_id,role,body_ciphertext,created_at) VALUES(?,?,\'owner\',?,?,?)').run(id,session,role,await seal(env,{text,...extra},arcContext('owner',id)),new Date(time).toISOString());
 const start=Date.now()-600000;
 await add('context-original','user','We are building Cedar Mesh, abbreviated CM. Recruit colleagues and discuss its next direction.',start);
 await add('context-project-read','tool','Read project background',start+1,{tool:'call_app',status:'completed',arguments:{operation:'contents.read',repo:'owner/cedar-mesh',path:'README.md'},result:{name:'Cedar Mesh',description:'Shared agent workspace',html_url:'https://github.com/owner/cedar-mesh'}});
 for(let i=0;i<260;i++)await add('context-history-'+i,i%8===0?'user':'assistant','Unrelated history '+i,start+100+i);
 const sent=await api('sessions/'+session+'/messages','POST',{text:'Start the discussion now.',requestId:crypto.randomUUID()}),payload=await sent.json() as any;
 assert.equal(sent.status,202,JSON.stringify(payload));
 const run=sql.prepare('SELECT * FROM arc_chat_runs WHERE id=?').get(payload.run.id) as ArcRun;
 try{
  const brief=await arcWorkingContext(env,run,'Start the discussion now.');
  assert(brief.userRequests.some(item=>item.id==='context-original'&&item.text.includes('Cedar Mesh')),'Keep original project goals after more than 200 messages');
  const deep=await arcWorkingContext(env,run,'Cedar Mesh',true);assert(deep.evidence.some(item=>item.result.includes('Shared agent workspace')),'Retrieve sourced evidence outside the recent window');
  const snapshot=await (await api('sessions/'+session)).json() as any;assert(snapshot.hasMore);assert.equal(snapshot.messages.length,100);
  const all=[...snapshot.messages];let cursor=snapshot.before,more=snapshot.hasMore;
  while(more){const response=await api('sessions/'+session+'/history?before='+encodeURIComponent(cursor)),page=await response.json() as any;assert.equal(response.status,200);all.unshift(...page.messages);more=page.hasMore;cursor=page.before;}
  assert.equal(all.length,263);assert.equal(new Set(all.map(message=>message.id)).size,263);assert.equal(all[0].id,'context-original');
  assert.equal((await api('sessions/'+session+'/history?before=dispatch-project-anchor')).status,404,'A history cursor cannot point into another chat');
  assert.equal((await api('sessions/'+session+'/history?before='+encodeURIComponent(snapshot.before),'GET',undefined,'other')).status,404);
  assert(brief.coverage.hasOlderMessages&&brief.coverage.nextBefore);const olderContext=await arcWorkingContext(env,run,'Cedar Mesh',true,brief.coverage.nextBefore);assert(olderContext.evidence.some(item=>item.result.includes('Shared agent workspace')));
  await assert.rejects(()=>arcWorkingContext(env,run,'Cedar Mesh',true,'dispatch-project-anchor'),/ARC_HISTORY_CURSOR_NOT_FOUND/);
  await assert.rejects(()=>arcWorkingContext(env,{...run,user_id:'other'},'Cedar'),/CHAT_NOT_FOUND/);
  const roster=await arcTeammateIndex(env,'owner');assert(roster.length>=3);assert(!roster.some(item=>item.name==='Private'));assert(!JSON.stringify(roster).includes('instructions'));
  const large=arcExecutionPrompt({objective:'Continue the project',messages:[],memory:[],deviceIndex:[],workingContext:{...deep,priorAnswers:[{id:'large',text:'Earlier sourced project context '.repeat(4500)}]}},10000,true);
  assert(large&&JSON.parse(large.user).workingContext.userRequests.some((item:any)=>item.text.includes('Cedar Mesh')),'Compaction keeps the original project anchor');
  for(const [query,name] of [['CM','cedar-mesh'],['RA','RemoteArc'],['AP','AtlasPlanner'],['AB','alpha_beta']])assert(projectMatches(query,{name}));
  assert(!projectMatches('RA',{name:'Research notes'}),'Initials must be derived from observed names, not invented expansions');
  const connections:string[]=[],requests:{url:string;method:string}[]=[];
  const fixtureEnv={...env,ENABLE_APPS:'1'};
  const connect=async(provider:string,user='owner')=>{
   const id=crypto.randomUUID(),at=new Date().toISOString();connections.push(id);
   sql.prepare(`INSERT INTO app_connections(id,user_id,provider,account_id,account_label,status,permissions_json,scopes_json,token_ciphertext,created_at,updated_at) VALUES(?,?,?,?,?,'active','["read"]',?,?,?,?)`).run(id,user,provider,id,'Context fixture',JSON.stringify(appScopes(provider as any,['read'])),await seal(env,{accessToken:'context-fixture-not-a-secret'},`app-token:${user}:${provider}:${id}`),at,at);return id;
  };
  try{
   const github=await connect('github'),vercel=await connect('vercel'),foreign=await connect('github','other');
   const fetcher:typeof fetch=async(url,init)=>{
    const target=String(url),method=init?.method||'GET';requests.push({url:target,method});assert.equal(method,'GET');
    if(target.includes('api.vercel.com'))return Response.json({error:'unavailable'},{status:503});
    if(target.includes('/user/repos'))return Response.json([{id:1,name:'RemoteArc',full_name:'owner/RemoteArc',description:'A workspace for coordinated agents',html_url:'https://github.com/owner/RemoteArc'}]);
    if(target.endsWith('/contents/'))return Response.json([{name:'README.md',path:'README.md',type:'file',html_url:'https://github.com/owner/RemoteArc/blob/main/README.md'}]);
    if(target.endsWith('/contents/README.md'))return Response.json({encoding:'base64',content:Buffer.from('# RemoteArc\nRA is our shared workspace for agents.').toString('base64'),html_url:'https://github.com/owner/RemoteArc/blob/main/README.md'});
    throw Error('Unexpected context request '+target);
   };
   const result=await readArcContext(fixtureEnv,run,{query:'RA'},fetcher),text=JSON.stringify(result);
   assert(text.includes('RA is our shared workspace for agents.')&&text.includes('https://github.com/owner/RemoteArc/blob/main/README.md'));
   assert(result.sources?.some(source=>source.connectionId===vercel&&source.status==='unavailable'),'One unavailable App cannot discard another source');
   assert(!result.sources?.some(source=>source.connectionId===foreign),'Do not scan another owner’s account');
   assert.equal(sql.prepare("SELECT COUNT(*) n FROM app_calls WHERE connection_id=? AND permission='read' AND status='succeeded'").get(github).n,3,'All content reads use the ordinary authorized App gateway');
   const originalFetch=globalThis.fetch;globalThis.fetch=fetcher;
   try{const direct=await executeArcTool(fixtureEnv,run,{decision:'tool',tool:'call_app',arguments_json:JSON.stringify({connectionId:github,operation:'contents.read',arguments:{repo:'owner/RemoteArc',path:'README.md'}}),message:'Read actual project text'}) as any;assert.equal(direct.result.encoding,'utf-8');assert(direct.result.content.includes('RA is our shared workspace for agents.'));assert(direct.untrustedData);}finally{globalThis.fetch=originalFetch;}
   assert(!requests.some(request=>request.url.endsWith('/user')),'Use connected credentials directly, without an identity-only detour');
   const count=requests.length;await readArcContext(fixtureEnv,run,{query:'CM',includeApps:false},fetcher);assert.equal(requests.length,count);
   const denied=employeeToolError({scope:{appMode:'none',connectionIds:[],deviceIds:[],deviceTools:[],skillIds:[]}} as any,'read_context',{query:'RA'});assert(denied,'A child cannot use the owner’s project discovery tool');
   sql.prepare('UPDATE arc_chat_runs SET cancel_requested=1 WHERE id=?').run(run.id);const stopped=await readArcContext(fixtureEnv,run,{query:'RA'},fetcher);assert.equal(requests.length,count);assert(stopped.sources?.every(source=>source.status==='unavailable'));
  }finally{for(const id of connections){sql.prepare('DELETE FROM app_calls WHERE connection_id=?').run(id);sql.prepare('DELETE FROM app_connections WHERE id=?').run(id);}}
 }finally{sql.prepare("UPDATE arc_chat_runs SET status='cancelled' WHERE id=?").run(run.id);}
 console.log('PASS: >200-message continuity, original goal anchors, deep sourced retrieval, context compaction, live owned roster, generic acronym candidates, multi-App reads/partial failures, source links, cancellation and employee isolation (synthetic providers, no model)');
}
