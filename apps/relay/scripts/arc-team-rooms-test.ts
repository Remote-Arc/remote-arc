import assert from 'node:assert/strict';
import {handleArcRooms,advanceArcRoom,arcRoomSnapshot} from '../src/arc-team-rooms.js';
import {saveArcEmployee,saveArcTeam} from '../src/arc-teams.js';
import {runArcStep,executeArcTool} from '../src/arc-chat-runtime.js';
import {arcEmployeeExecution,employeeToolError} from '../src/arc-team-execution.js';
import {activateArcTrial} from '../src/arc-trial.js';
import {seal} from '../src/app-oauth.js';
import {arcContext,handleArcChat,type ArcRun} from '../src/arc-chat.js';

/** Authenticated SQLite/API/runtime integration, scripted inference only. */
export async function testArcTeamRooms({sql,env}:any){
 const origin='https://agent.remotearc.app',adapter=env.MODEL_GATEWAY.adapters.openai,previousRuntime=env.ARC_RUNTIME,at=new Date().toISOString();let modelCalls=0,wakes=0;
 env.ARC_RUNTIME={getByName:()=>({fetch:async(url:string)=>{assert(['https://arc/start','https://arc/room'].includes(url));wakes++;return Response.json({queued:true});}})};
 const api=(path:string,method='GET',input?:unknown,user='owner',requestOrigin=origin)=>handleArcRooms(new Request(origin+'/api/arc/rooms'+path,{method,headers:{cookie:'rl_session='+user+'-session',origin:requestOrigin,'content-type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})}),env);
 const decode=async(response:Response,status=200)=>{const value=await response.json() as any;assert.equal(response.status,status,JSON.stringify(value));return value;};
 const base={responsibility:'Product design',instructions:'Answer as a helpful colleague. Share actual work in this room.',modelId:'auto',avatar:{kind:'initials' as const,color:'#446655'},scope:{appMode:'none' as const,connectionIds:[],deviceIds:[],deviceTools:[],skillIds:[]}};
 const alice=await saveArcEmployee(env,'owner',crypto.randomUUID(),{...base,name:'Alice'}),bob=await saveArcEmployee(env,'owner',crypto.randomUUID(),{...base,name:'Bob',responsibility:'Engineering'});
 const team=await saveArcTeam(env,'owner',crypto.randomUUID(),{name:'Launch',purpose:'Build a usable launch page',employeeIds:[alice.id,bob.id],coordinatorId:alice.id});
 const roomId=crypto.randomUUID(),roomInput={id:roomId,kind:'team',name:'Launch room',teamId:team.id,employeeIds:[alice.id,bob.id]};await decode(await api('','POST',roomInput),201);await decode(await api('','POST',roomInput),201);
 assert.equal(modelCalls,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM arc_team_rooms WHERE session_id=?').get(roomId).n,1);assert.equal((await api('/'+roomId,'GET',undefined,'other')).status,404);assert.equal((await api('','POST',{...roomInput,id:crypto.randomUUID()},'owner','https://attacker.invalid')).status,403);
 await decode(await api('','POST',{id:crypto.randomUUID(),kind:'direct',name:'Alice',employeeIds:[alice.id]}),201);
 assert.equal((await api('','POST',{id:crypto.randomUUID(),kind:'direct',name:'Invalid',employeeIds:[alice.id,bob.id]})).status,400);
 const beforeTrial=await api('/'+roomId+'/messages','POST',{requestId:crypto.randomUUID(),text:'Hi'});assert.equal(beforeTrial.status,402);
 await activateArcTrial(env,'owner');
 const privateConnection=crypto.randomUUID();sql.prepare(`INSERT INTO app_connections(id,user_id,provider,account_id,account_label,status,permissions_json,scopes_json,created_at,updated_at) VALUES(?,'owner','github','private-account','Private outside employee scope','active','["read","write"]','["repo"]',?,?)`).run(privateConnection,at,at);
 const requestId=crypto.randomUUID(),first=await decode(await api('/'+roomId+'/messages','POST',{requestId,text:'Create our launch plan together.'}),202);const repeat=await decode(await api('/'+roomId+'/messages','POST',{requestId,text:'Create our launch plan together.'}),202);assert.equal(first.turnId,repeat.turnId);assert.equal((await api('/'+roomId+'/messages','POST',{requestId,text:'Different goal.'})).status,409);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM arc_room_turns WHERE room_id=?').get(roomId).n,1);assert.equal(sql.prepare('SELECT COUNT(*) n FROM arc_room_deliveries WHERE room_id=?').get(roomId).n,2);
 const active=()=>sql.prepare("SELECT * FROM arc_chat_runs WHERE session_id=? AND status IN ('queued','thinking','working')").get(roomId) as ArcRun|undefined;
 const reply=(message:string)=>({decision:'reply',tool:'none',arguments_json:'{}',message});
 const tool=(name:string,args:any)=>({decision:'tool',tool:name,arguments_json:JSON.stringify(args),message:'Sharing work'});
 let privateDispatches=0,handoffs=0;const seenGoals:string[]=[],seenNames=new Set<string>();
 env.MODEL_GATEWAY.adapters.openai=async(request:any)=>{modelCalls++;const context=JSON.parse(request.user);assert.equal(context.memory.length,0);assert(!context.connectionIndex.some((connection:any)=>connection.id===privateConnection));assert(context.employeeIdentity);seenGoals.push(context.objective);seenNames.add(context.employeeIdentity.name);const history=context.taskState.completedActions as any[];let value;
  if(context.objective==='Create our launch plan together.'&&context.sourceMessage===context.objective&&!history.some(item=>item.tool==='message_employee')){handoffs++;value=tool('message_employee',{employeeId:context.roomPeers[0].id,message:'Review the contrast and implementation details.'});}
  else value=reply(context.employeeIdentity.name+': '+(context.sourceMessage.includes('contrast')?'Reviewed contrast and implementation details.':'Here is the launch plan.'));
  return{value,usage:{inputTokens:100,outputTokens:100,cachedInputTokens:0,cacheWriteTokens:0,reasoningTokens:0},providerRequestId:'team-room-fixture'};
 };
 try{
  await Promise.all([advanceArcRoom(env,roomId),advanceArcRoom(env,roomId)]);assert(active());assert.equal(sql.prepare("SELECT COUNT(*) n FROM arc_chat_runs WHERE session_id=? AND status IN ('queued','thinking','working')").get(roomId).n,1,'Concurrent queue workers cannot claim two employees in one room');
  const firstRun=active()!,second=await decode(await api('/'+roomId+'/messages','POST',{requestId:crypto.randomUUID(),text:'A separate follow-up question.',employeeIds:[bob.id]}),202);assert.notEqual(second.turnId,first.turnId);assert.equal(modelCalls,0,'Queued messages do not call models in the request handler');
  const assignment=await arcEmployeeExecution(env,firstRun);assert(assignment);assert.equal(assignment.objective,'Create our launch plan together.');assert(!assignment.history.some(message=>message.text==='A separate follow-up question.'));
  assert(employeeToolError(assignment,'call_app',{connectionId:privateConnection,operation:'issues.create'}));assert(employeeToolError(assignment,'remember',{content:'Private memory'}));assert(employeeToolError(assignment,'create_task',{name:'escape role scope'}));assert.equal(employeeToolError(assignment,'message_employee',{employeeId:assignment.peers[0].id}),null);
  const denied=await executeArcTool(env,firstRun,tool('call_app',{connectionId:privateConnection,operation:'issues.create',arguments:{repo:'private/repo',title:'Out of scope',body:'No'}}));assert.equal((denied as any).dispatched,false);privateDispatches++;
  const generic=await handleArcChat(new Request(origin+'/api/arc/sessions/'+roomId+'/messages',{method:'POST',headers:{cookie:'rl_session=owner-session',origin,'content-type':'application/json'},body:JSON.stringify({text:'Bypass role routing',requestId:crypto.randomUUID()})}),env);assert.equal(generic.status,409);
  let completed=0;for(let tick=0;tick<20;tick++){await advanceArcRoom(env,roomId);const run=active();if(!run)break;while(await runArcStep(env,run.id)){}const final=sql.prepare('SELECT status,error_code FROM arc_chat_runs WHERE id=?').get(run.id);assert.equal(final.status,'succeeded',JSON.stringify(final));completed++;}
  await advanceArcRoom(env,roomId);assert.equal(active(),undefined);assert.equal(completed,5,'Two root recipients, two visible targeted handoffs, one queued follow-up');assert.equal(handoffs,2);assert.equal(privateDispatches,1);assert.equal(seenNames.size,2);assert.equal(seenGoals.at(-1),'A separate follow-up question.');
  const snapshot=await arcRoomSnapshot(env,'owner',roomId);assert.equal(snapshot.messages.filter(message=>message.role==='user').length,2);assert(snapshot.messages.some(message=>message.tool==='message_employee'&&message.employeeId));assert(snapshot.messages.filter(message=>message.role==='assistant').every(message=>message.employeeId));assert(snapshot.turns.every((turn:any)=>turn.status==='completed'));assert(snapshot.deliveries.every((delivery:any)=>delivery.status==='completed'));assert(!JSON.stringify(sql.prepare('SELECT body_ciphertext FROM arc_chat_messages WHERE session_id=? LIMIT 1').get(roomId)).includes('launch plan'));
  const callsAtIdle=modelCalls;assert.equal(await advanceArcRoom(env,roomId),false);assert.equal(modelCalls,callsAtIdle);assert(wakes>0);
  // Current access can only narrow a frozen run, and archived employees stop.
  await decode(await api('/'+roomId+'/messages','POST',{requestId:crypto.randomUUID(),text:'Another check.',employeeIds:[alice.id]}),202);await advanceArcRoom(env,roomId);const guarded=active()!;
  const execution=await arcEmployeeExecution(env,guarded);assert(execution);assert.equal(execution.identity.version,alice.version);
  await saveArcEmployee(env,'owner',alice.id,{...base,name:'Alice renamed'},alice.version);const retained=await arcEmployeeExecution(env,guarded);assert.equal(retained?.identity.name,'Alice','An in-flight run retains its reviewed profile version');
  sql.prepare("UPDATE arc_employees SET status='archived' WHERE id=?").run(alice.id);const beforeRevoked=modelCalls;await runArcStep(env,guarded.id);assert.equal(modelCalls,beforeRevoked);assert.equal(sql.prepare('SELECT error_code FROM arc_chat_runs WHERE id=?').get(guarded.id).error_code,'ARC_EMPLOYEE_ACCESS_REVOKED');
  await decode(await api('/'+roomId+'/stop','POST',{}));assert.equal(await advanceArcRoom(env,roomId),false);
  assert.equal((await api('/'+roomId+'/resume','POST',{},'other')).status,404);
  console.log('PASS: durable direct/team rooms, independent profile/model identity, shared funded runs, targeted peer messages, FIFO queued follow-ups, current-scope isolation/revocation, encrypted visible history, idempotent claims and zero idle inference (scripted model, no fees)');
 }finally{env.MODEL_GATEWAY.adapters.openai=adapter;env.ARC_RUNTIME=previousRuntime;}
}
