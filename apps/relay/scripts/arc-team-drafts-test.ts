import assert from 'node:assert/strict';
import {handleArcTeams} from '../src/arc-teams.js';
import {handleArcChat,type ArcRun} from '../src/arc-chat.js';
import {draftArcEmployee,listArcEmployeeDrafts} from '../src/arc-team-drafts.js';
import {runArcStep} from '../src/arc-chat-runtime.js';
export async function testArcEmployeeDrafts({sql,env}:any){
 const origin='https://agent.remotearc.app',runtime=env.ARC_RUNTIME,adapter=env.MODEL_GATEWAY.adapters.openai;let modelCalls=0;
 const headers=(user='owner',requestOrigin=origin)=>({cookie:'rl_session='+user+'-session',origin:requestOrigin,'content-type':'application/json'});
 const chat=(path:string,method='GET',input?:unknown)=>handleArcChat(new Request(origin+'/api/arc/'+path,{method,headers:headers(),...(input===undefined?{}:{body:JSON.stringify(input)})}),env);
 const api=(id:string,input?:unknown,user='owner',requestOrigin=origin)=>handleArcTeams(new Request(origin+'/api/arc/employee-drafts/'+id,{method:input===undefined?'GET':'POST',headers:headers(user,requestOrigin),...(input===undefined?{}:{body:JSON.stringify(input)})}),env);
 const decode=async(response:Response,status=200)=>{const value=await response.json() as any;assert.equal(response.status,status,JSON.stringify(value));return value;};
 env.ARC_RUNTIME={getByName:()=>({fetch:async()=>Response.json({queued:true})})};
 try{
  sql.exec("UPDATE arc_chat_runs SET status='cancelled' WHERE status IN ('queued','thinking','working')");
  const session=(await decode(await chat('sessions','POST',{}),201)).id,source=(await decode(await chat('sessions/'+session+'/messages','POST',{text:'Draft an AI designer profile called Alice for our team. Do not create it yet.',requestId:crypto.randomUUID()}),202)).run;
  const run=()=>sql.prepare('SELECT * FROM arc_chat_runs WHERE id=?').get(source.id) as ArcRun;
  const count=()=>sql.prepare("SELECT COUNT(*) n FROM arc_employees WHERE user_id='owner'").get().n,before=count();
  env.MODEL_GATEWAY.adapters.openai=async(request:any)=>{modelCalls++;const user=JSON.parse(request.user),observed=user.messages.some((message:any)=>message.tool==='prepare_employee');return{value:observed?{decision:'reply',tool:'none',arguments_json:'{}',message:'Your designer profile is ready to review and create.'}:{decision:'tool',tool:'prepare_employee',arguments_json:JSON.stringify({name:'Alice',responsibility:'Product designer',emoji:'🎨'}),message:'Preparing an employee profile'},usage:{inputTokens:100,outputTokens:50,cachedInputTokens:0,cacheWriteTokens:0,reasoningTokens:0},providerRequestId:'draft-fixture-'+modelCalls};};
  await runArcStep(env,source.id);assert.equal(count(),before,'Preparing a card never creates an employee');
  let drafts=await listArcEmployeeDrafts(env,'owner',session);assert.equal(drafts.length,1);assert.equal(drafts[0].status,'pending');assert.deepEqual(drafts[0].profile.scope,{appMode:'none',connectionIds:[],deviceIds:[],deviceTools:[],skillIds:[]});const draft=drafts[0];
  await draftArcEmployee(env,run(),{name:'Alice',responsibility:'Product designer',emoji:'🎨'});assert.equal((await listArcEmployeeDrafts(env,'owner',session)).length,1,'A repeated proposal in the run uses the same draft');
  await runArcStep(env,source.id);assert.equal(modelCalls,2);const snapshot=await decode(await chat('sessions/'+session));assert.equal(snapshot.employeeDrafts[0].id,draft.id,'The editable card survives a completed run/reload');
  assert.equal((await api(draft.id,undefined,'other')).status,404);assert.equal((await api(draft.id,{action:'confirm',profile:draft.profile},'owner','https://untrusted.invalid')).status,403);
  assert.equal((await api(draft.id,{action:'confirm',profile:{...draft.profile,scope:{...draft.profile.scope,appMode:'write',connectionIds:['foreign-account']}}})).status,403);assert.equal(count(),before);
  const edited={...draft.profile,name:'Avery',responsibility:'Design and accessibility',instructions:'Explain design decisions clearly.'};
  const concurrent=await Promise.all([api(draft.id,{action:'confirm',profile:edited}),api(draft.id,{action:'confirm',profile:{...edited,name:'A competing profile'}})]);assert.deepEqual(concurrent.map(item=>item.status).sort(),[200,409]);const created=await decode(await api(draft.id));assert.equal(created.draft.status,'confirmed');assert.equal(created.draft.profile.name,'Avery');assert.equal(count(),before+1);const employeeId=created.draft.employeeId;
  const replay=await decode(await api(draft.id,{action:'confirm',profile:edited}));assert.equal(replay.employee.id,employeeId);assert.equal(count(),before+1);assert.equal(modelCalls,2,'Confirmation, cancellation and replay are model-free');assert.equal(sql.prepare("SELECT COUNT(*) n FROM arc_team_events WHERE employee_id=? AND event_type='employee.created'").get(employeeId).n,1);
  const fixtureRun={...run(),status:'queued'};sql.prepare("UPDATE arc_chat_runs SET status='queued',deadline=? WHERE id=?").run(new Date(Date.now()+600000).toISOString(),source.id);
  const make=async(name:string)=>{const value=await draftArcEmployee(env,fixtureRun,{name,responsibility:'Development'});assert('draft' in value);return value.draft!;};
  const cancelled=await make('Cancelled');await decode(await api(cancelled.id,{action:'cancel'}));assert.equal((await api(cancelled.id,{action:'confirm',profile:cancelled.profile})).status,409);
  const expired=await make('Expired');sql.prepare('UPDATE arc_team_drafts SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',expired.id);assert.equal((await decode(await api(expired.id))).draft.status,'expired');assert.equal((await api(expired.id,{action:'confirm',profile:expired.profile})).status,409);
  const racing=await make('Cancel race');await Promise.all([api(racing.id,{action:'confirm',profile:racing.profile}),api(racing.id,{action:'cancel'})]);const result=(await decode(await api(racing.id))).draft,exists=sql.prepare("SELECT COUNT(*) n FROM arc_employees WHERE user_id='owner' AND id=?").get(result.employeeId||'missing').n;assert.equal(exists,result.status==='confirmed'?1:0,'Confirm/cancel cannot create an employee behind a cancelled card');
  sql.prepare("UPDATE arc_chat_sessions SET deleted_at=? WHERE id=?").run(new Date().toISOString(),session);assert.equal((await api(draft.id)).status,404);assert.equal((await draftArcEmployee(env,fixtureRun,{name:'Hidden',responsibility:'Hidden'})).dispatched,false);
  sql.prepare("UPDATE arc_chat_runs SET status='cancelled' WHERE status IN ('queued','thinking','working')").run();
  const directSession=(await decode(await chat('sessions','POST',{}),201)).id,direct=(await decode(await chat('sessions/'+directSession+'/messages','POST',{text:'帮我建四个队友：开发、设计、商务和领域专家。',requestId:crypto.randomUUID()}),202)).run;
  const directRun=()=>sql.prepare('SELECT * FROM arc_chat_runs WHERE id=?').get(direct.id) as ArcRun;
  const base=count();
  for(const name of ['开发队友','设计队友','商务队友','领域专家']){
   const result=await draftArcEmployee(env,directRun(),{name,responsibility:name});assert.equal(result.created,true);assert.equal(result.requiresUserConfirmation,false);assert.equal(result.draft?.status,'confirmed');
   const retry=await draftArcEmployee(env,directRun(),{name,responsibility:name});assert.equal(retry.draft?.employeeId,result.draft?.employeeId);
  }
  assert.equal(count(),base+4,'An explicit request creates all four teammates without another review or duplicate on retry');
  assert((await listArcEmployeeDrafts(env,'owner',directSession)).every(draft=>draft.status==='confirmed'&&draft.profile.scope.connectionIds.length===0&&draft.profile.scope.deviceIds.length===0));
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM arc_employee_runs WHERE run_id=?').get(direct.id).n,0,'Creating identities never starts employee work');
  assert.equal(modelCalls,2);console.log('PASS: chat employee draft via scripted runtime, durable editable card, explicit model-free confirmation, owned current access, CSRF, atomic confirm/cancel/CAS, lost-ack replay, cancellation/expiry/deleted-source fences and zero paid calls');
 }finally{env.ARC_RUNTIME=runtime;env.MODEL_GATEWAY.adapters.openai=adapter;}
}
