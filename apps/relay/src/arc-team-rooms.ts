import {z} from 'zod';
import {syncArcDispatchReports} from './arc-dispatch-reports.js';
import {arcDispatchContext,type ArcDispatchData} from './arc-dispatch-context.js';
import {getSessionUser,sha256Hex} from './auth.js';
import {isTrustedDashboardMutation} from './dashboard-origin.js';
import {seal,unseal} from './app-oauth.js';
import {arcContext,arcRuntime,arcSession,arcMessages,publicRun,stamp,wakeArcRun,ArcError,type ArcEnv,type ArcRun} from './arc-chat.js';
import {arcModelAccess} from './arc-chat-model.js';
import {currentArcPlan} from './arc-plan.js';
import {readArcEmployee,readArcTeam} from './arc-teams.js';
import type {ArcEmployee,ArcTeamRoom} from '@remotearc/protocol';

const id=z.uuid(),json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
type RoomRow={session_id:string;user_id:string;organization_id:string;kind:ArcTeamRoom['kind'];team_id:string|null;name_ciphertext:string;creation_hash:string;created_at:string;updated_at:string};
type Delivery={id:string;user_id:string;turn_id:string;room_id:string;source_message_id:string;employee_id:string;run_id:string|null;depth:number;status:string;created_at:string};
const active="('queued','thinking','working')";
export async function arcRoom(env:ArcEnv,userId:string,roomId:string){
 await arcSession(env,userId,roomId);const row=await env.DB.prepare('SELECT * FROM arc_team_rooms WHERE session_id=?1 AND user_id=?2').bind(roomId,userId).first<RoomRow>();if(!row)throw new ArcError('ARC_ROOM_NOT_FOUND',404);return row;
}
export async function roomEmployees(env:ArcEnv,room:RoomRow){
 const members=(await env.DB.prepare('SELECT employee_id FROM arc_room_members WHERE room_id=?1 AND user_id=?2 ORDER BY employee_id').bind(room.session_id,room.user_id).all<{employee_id:string}>()).results;
 const team=room.team_id?await readArcTeam(env,room.user_id,room.team_id):null;
 return (await Promise.all(members.map(member=>readArcEmployee(env,room.user_id,member.employee_id)))).filter(employee=>employee.status==='active'&&(!team||team.status==='active'&&team.employeeIds.includes(employee.id)));
}
async function publicRoom(env:ArcEnv,row:RoomRow):Promise<ArcTeamRoom>{return{id:row.session_id,kind:row.kind,name:await unseal<string>(env,row.name_ciphertext,arcContext(row.user_id,row.session_id)),teamId:row.team_id,employeeIds:(await roomEmployees(env,row)).map(employee=>employee.id),createdAt:row.created_at,updatedAt:row.updated_at};}
export async function createArcRoom(env:ArcEnv,userId:string,raw:unknown){
 const input=z.object({id,kind:z.enum(['direct','team','group']),name:z.string().trim().min(1).max(100),teamId:id.optional(),employeeIds:z.array(id).min(1).max(20)}).strict().parse(raw);
 if(new Set(input.employeeIds).size!==input.employeeIds.length||input.kind==='direct'&&input.employeeIds.length!==1||Boolean(input.teamId)!==(input.kind==='team'))throw new ArcError('ARC_ROOM_MEMBERS_INVALID');
 if(input.teamId){const team=await readArcTeam(env,userId,input.teamId);if(team.status!=='active'||input.employeeIds.some(id=>!team.employeeIds.includes(id)))throw new ArcError('ARC_ROOM_MEMBERS_INVALID');}
 const employees=await Promise.all(input.employeeIds.map(id=>readArcEmployee(env,userId,id)));if(employees.some(employee=>employee.status!=='active'))throw new ArcError('ARC_ROOM_MEMBER_ARCHIVED',409);
 const at=stamp(),hash=await sha256Hex(JSON.stringify(input)),cipher=await seal(env,input.name,arcContext(userId,input.id));
 const previous=await env.DB.prepare('SELECT creation_hash FROM arc_team_rooms WHERE session_id=?1 AND user_id=?2').bind(input.id,userId).first<{creation_hash:string}>();if(previous){if(previous.creation_hash!==hash)throw new ArcError('REQUEST_ID_CONFLICT',409);return publicRoom(env,await arcRoom(env,userId,input.id));}
 await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO arc_chat_sessions(id,user_id,organization_id,title_ciphertext,model_id,created_at,updated_at) SELECT ?1,?2,?3,?4,'auto',?5,?5 WHERE EXISTS(SELECT 1 FROM organization_members WHERE organization_id=?3 AND user_id=?2 AND status='active') AND (SELECT COUNT(*) FROM arc_team_rooms r JOIN arc_chat_sessions s ON s.id=r.session_id WHERE r.user_id=?2 AND s.deleted_at IS NULL)<100`).bind(input.id,userId,'personal:'+userId,cipher,at),
  env.DB.prepare(`INSERT OR IGNORE INTO arc_team_rooms(session_id,user_id,organization_id,kind,team_id,name_ciphertext,creation_hash,created_at,updated_at) SELECT ?1,?2,organization_id,?3,?4,?5,?6,?7,?7 FROM arc_chat_sessions WHERE id=?1 AND user_id=?2 AND title_ciphertext=?5`).bind(input.id,userId,input.kind,input.teamId||null,cipher,hash,at),
  ...input.employeeIds.map(employeeId=>env.DB.prepare(`INSERT OR IGNORE INTO arc_room_members(room_id,employee_id,user_id) SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM arc_team_rooms WHERE session_id=?1 AND user_id=?3 AND creation_hash=?4) AND EXISTS(SELECT 1 FROM arc_employees WHERE id=?2 AND user_id=?3 AND status='active')`).bind(input.id,employeeId,userId,hash)),
 ]);
 const row=await arcRoom(env,userId,input.id);if(row.creation_hash!==hash)throw new ArcError('REQUEST_ID_CONFLICT',409);return publicRoom(env,row);
}
export async function wakeArcRoom(env:ArcEnv,roomId:string){const response=await arcRuntime(env,'room-'+roomId).fetch('https://arc/room',{method:'POST',body:JSON.stringify({roomId})});if(!response.ok)throw new ArcError('ARC_ROOM_START_UNAVAILABLE',503);}
export async function enqueueArcRoomMessage(env:ArcEnv,userId:string,roomId:string,raw:unknown,sourceDispatchId?:string){
 let delegation:ArcDispatchData|null=null;
 if(sourceDispatchId){const record=await env.DB.prepare('SELECT input_ciphertext FROM arc_dispatches WHERE id=?1 AND user_id=?2 AND room_id=?3').bind(sourceDispatchId,userId,roomId).first<{input_ciphertext:string}>();if(!record)throw new ArcError('ARC_DISPATCH_AUTHORITY_REQUIRED',403);delegation=await unseal<ArcDispatchData>(env,record.input_ciphertext,arcDispatchContext(userId,sourceDispatchId));}
 const input=z.object({requestId:id,text:z.string().trim().min(1).max(6000),employeeIds:z.array(id).min(1).max(20).optional(),audience:z.enum(['auto','all']).optional()}).strict().parse(raw),room=await arcRoom(env,userId,roomId),members=await roomEmployees(env,room),team=room.team_id?await readArcTeam(env,userId,room.team_id):null,first=members.find(member=>member.id===team?.coordinatorId)||members[0],recipients=input.employeeIds||(input.audience==='auto'&&first?[first.id]:members.map(member=>member.id));
 if(delegation&&input.text!==delegation.goal)throw new ArcError('ARC_DISPATCH_AUTHORITY_MISMATCH',403);
 if(!recipients.length||new Set(recipients).size!==recipients.length||recipients.some(id=>!members.some(member=>member.id===id)))throw new ArcError('ARC_ROOM_MEMBERS_INVALID');
 for(const member of members.filter(member=>recipients.includes(member.id)))await arcModelAccess(env,userId,room.organization_id,member.modelId);
 const hash=await sha256Hex(JSON.stringify([roomId,input.text,[...recipients].sort()])),previous=await env.DB.prepare('SELECT id,input_hash,room_id FROM arc_room_turns WHERE user_id=?1 AND request_id=?2').bind(userId,input.requestId).first<{id:string;input_hash:string;room_id:string}>();
 if(previous){if(previous.input_hash!==hash||previous.room_id!==roomId)throw new ArcError('REQUEST_ID_CONFLICT',409);await wakeArcRoom(env,roomId);return{turnId:previous.id,queued:true};}
 const turnId=crypto.randomUUID(),messageId='room-'+turnId+':user',at=stamp();
 await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO arc_chat_messages(id,session_id,user_id,run_id,role,body_ciphertext,created_at) SELECT ?1,?2,?3,NULL,'user',?4,?5 WHERE NOT EXISTS(SELECT 1 FROM arc_room_turns WHERE user_id=?3 AND request_id=?6) AND (SELECT COUNT(*) FROM arc_room_turns WHERE room_id=?2 AND status IN ('queued','working'))<100`).bind(messageId,roomId,userId,await seal(env,{text:input.text,recipients:members.filter(member=>recipients.includes(member.id)).map(member=>({id:member.id,name:member.name})),audience:input.audience||'all',...(sourceDispatchId?{delegatedFrom:{dispatchId:sourceDispatchId,sourceRunId:delegation!.sourceRunId}}:{})},arcContext(userId,messageId)),at,input.requestId),
  env.DB.prepare(`INSERT OR IGNORE INTO arc_room_turns(id,user_id,room_id,request_id,input_hash,user_message_id,status,created_at,updated_at,source_dispatch_id) SELECT ?1,?2,?3,?4,?5,?6,'queued',?7,?7,?8 WHERE EXISTS(SELECT 1 FROM arc_chat_messages WHERE id=?6 AND user_id=?2)`).bind(turnId,userId,roomId,input.requestId,hash,messageId,at,sourceDispatchId||null),
  ...recipients.map(employeeId=>env.DB.prepare(`INSERT OR IGNORE INTO arc_room_deliveries(id,user_id,turn_id,room_id,source_message_id,employee_id,depth,status,created_at,updated_at) SELECT ?1,?2,?3,?4,?5,?6,?8,'queued',?7,?7 WHERE EXISTS(SELECT 1 FROM arc_room_turns WHERE id=?3 AND user_id=?2)`).bind(crypto.randomUUID(),userId,turnId,roomId,messageId,employeeId,at,delegation?.depth||0)),
  env.DB.prepare('UPDATE arc_team_rooms SET updated_at=?1 WHERE session_id=?2 AND user_id=?3 AND EXISTS(SELECT 1 FROM arc_room_turns WHERE id=?4)').bind(at,roomId,userId,turnId),
 ]);
 const saved=await env.DB.prepare('SELECT id,input_hash FROM arc_room_turns WHERE user_id=?1 AND request_id=?2').bind(userId,input.requestId).first<{id:string;input_hash:string}>();if(!saved)throw new ArcError('ARC_ROOM_QUEUE_FULL',429);if(saved.input_hash!==hash)throw new ArcError('REQUEST_ID_CONFLICT',409);
 await wakeArcRoom(env,roomId);return{turnId:saved.id,queued:true};
}
/** Durable queue advancement does not itself call a model. Only claimed runs do. */
export async function advanceArcRoom(env:ArcEnv,roomId:string):Promise<boolean>{
 const room=await env.DB.prepare('SELECT r.* FROM arc_team_rooms r JOIN arc_chat_sessions s ON s.id=r.session_id WHERE r.session_id=?1 AND s.deleted_at IS NULL').bind(roomId).first<RoomRow>();if(!room)return false;
 const at=stamp();
 await env.DB.batch([
  env.DB.prepare(`UPDATE arc_room_deliveries SET status=CASE WHEN (SELECT status FROM arc_chat_runs WHERE id=run_id)='succeeded' THEN 'completed' WHEN (SELECT status FROM arc_chat_runs WHERE id=run_id)='cancelled' THEN 'cancelled' ELSE 'failed' END,updated_at=?1 WHERE room_id=?2 AND status='claimed' AND EXISTS(SELECT 1 FROM arc_chat_runs WHERE id=run_id AND status NOT IN ${active})`).bind(at,roomId),
  env.DB.prepare(`UPDATE arc_room_turns SET status='completed',updated_at=?1 WHERE room_id=?2 AND status IN ('queued','working') AND NOT EXISTS(SELECT 1 FROM arc_room_deliveries WHERE turn_id=arc_room_turns.id AND status IN ('queued','claimed'))`).bind(at,roomId),
 ]);
 const pendingAssignments=await syncArcDispatchReports(env,roomId);
 const running=await env.DB.prepare(`SELECT id,status FROM arc_chat_runs WHERE session_id=?1 AND status IN ${active}`).bind(roomId).first<{id:string;status:string}>();if(running){if(running.status==='queued')await wakeArcRun(env,running.id);return true;}
 const delivery=await env.DB.prepare(`SELECT d.* FROM arc_room_deliveries d JOIN arc_room_turns t ON t.id=d.turn_id WHERE d.room_id=?1 AND d.status='queued' AND t.status IN ('queued','working') ORDER BY t.rowid,d.rowid LIMIT 1`).bind(roomId).first<Delivery>();if(!delivery)return pendingAssignments;
 const members=await roomEmployees(env,room),employee=members.find(member=>member.id===delivery.employee_id);
 if(!employee){await env.DB.prepare("UPDATE arc_room_deliveries SET status='cancelled',updated_at=?1 WHERE id=?2 AND status='queued'").bind(at,delivery.id).run();return true;}
 try{await arcModelAccess(env,room.user_id,room.organization_id,employee.modelId);}catch{await env.DB.prepare("UPDATE arc_room_turns SET status='paused',updated_at=?1 WHERE id=?2 AND status IN ('queued','working')").bind(at,delivery.turn_id).run();return true;}
 const plan=await currentArcPlan(env,room.user_id),runId='team-'+delivery.id;
 await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO arc_chat_runs(id,session_id,user_id,request_id,input_hash,model_id,status,max_tokens,max_steps,deadline,created_at,updated_at) SELECT ?1,?2,?3,?4,?4,?5,'queued',?6,?7,?8,?9,?9 WHERE EXISTS(SELECT 1 FROM arc_room_deliveries WHERE id=?4 AND user_id=?3 AND status='queued') AND EXISTS(SELECT 1 FROM arc_employees WHERE id=?10 AND user_id=?3 AND status='active' AND version=?11) AND NOT EXISTS(SELECT 1 FROM arc_chat_runs WHERE session_id=?2 AND status IN ${active}) AND (SELECT COUNT(*) FROM arc_chat_runs WHERE user_id=?3 AND status IN ${active})<?12`).bind(runId,roomId,room.user_id,delivery.id,employee.modelId,plan.maxTokens,plan.maxSteps,new Date(Date.now()+plan.maxSeconds*1000).toISOString(),at,employee.id,employee.version,plan.concurrentRuns),
  env.DB.prepare(`INSERT OR IGNORE INTO arc_employee_runs(run_id,employee_id,profile_version,turn_id,delivery_id) SELECT ?1,?2,?3,?4,?5 WHERE EXISTS(SELECT 1 FROM arc_chat_runs WHERE id=?1 AND user_id=?6)`).bind(runId,employee.id,employee.version,delivery.turn_id,delivery.id,room.user_id),
  env.DB.prepare(`UPDATE arc_room_deliveries SET status='claimed',run_id=?1,updated_at=?2 WHERE id=?3 AND status='queued' AND EXISTS(SELECT 1 FROM arc_employee_runs WHERE run_id=?1 AND delivery_id=?3)`).bind(runId,at,delivery.id),
  env.DB.prepare(`UPDATE arc_room_turns SET status='working',updated_at=?1 WHERE id=?2 AND status='queued' AND EXISTS(SELECT 1 FROM arc_room_deliveries WHERE id=?3 AND status='claimed')`).bind(at,delivery.turn_id,delivery.id),
 ]);
 const run=await env.DB.prepare('SELECT status FROM arc_chat_runs WHERE id=?1').bind(runId).first<{status:string}>();if(run?.status==='queued')await wakeArcRun(env,runId);return true;
}
export async function arcRoomMessages(env:ArcEnv,userId:string,roomId:string,before?:string){
 await arcRoom(env,userId,roomId);
 const cursor=before?await env.DB.prepare('SELECT id,created_at FROM arc_chat_messages WHERE id=?1 AND user_id=?2 AND session_id=?3').bind(before,userId,roomId).first<{id:string;created_at:string}>():null;if(before&&!cursor)throw new ArcError('ARC_ROOM_MESSAGE_NOT_FOUND',404);
 const rows=(await env.DB.prepare(`SELECT m.id,m.role,m.run_id,m.created_at,m.body_ciphertext,e.employee_id,e.profile_version,v.profile_ciphertext FROM arc_chat_messages m LEFT JOIN arc_employee_runs e ON e.run_id=m.run_id LEFT JOIN arc_employee_versions v ON v.employee_id=e.employee_id AND v.version=e.profile_version AND v.user_id=m.user_id WHERE m.session_id=?1 AND m.user_id=?2 AND (?3 IS NULL OR m.created_at<?3 OR (m.created_at=?3 AND m.id<?4)) ORDER BY m.created_at DESC,m.id DESC LIMIT 101`).bind(roomId,userId,cursor?.created_at||null,cursor?.id||null).all<{id:string;role:string;run_id:string|null;created_at:string;body_ciphertext:string;employee_id:string|null;profile_version:number|null;profile_ciphertext:string|null}>()).results;
 const messages=await Promise.all(rows.slice(0,100).reverse().map(async row=>{const value=row.profile_ciphertext?await unseal<ArcEmployee>(env,row.profile_ciphertext,`arc-team:${userId}:employee:${row.employee_id}:${row.profile_version}`):null;return{id:row.id,role:row.role,run_id:row.run_id,created_at:row.created_at,...await unseal<import('./arc-chat.js').ArcMessageBody>(env,row.body_ciphertext,arcContext(userId,row.id)),employeeId:row.employee_id,speaker:value?{id:row.employee_id,name:value.name,avatar:value.avatar,version:row.profile_version}:null};}));
 return{messages,hasMore:rows.length>100,before:messages[0]?.id||null};
}
export async function arcRoomSnapshot(env:ArcEnv,userId:string,roomId:string){
 const room=await arcRoom(env,userId,roomId),history=await arcRoomMessages(env,userId,roomId),runs=(await env.DB.prepare('SELECT r.*,e.employee_id,e.profile_version FROM arc_chat_runs r JOIN arc_employee_runs e ON e.run_id=r.id WHERE r.session_id=?1 AND r.user_id=?2 ORDER BY r.created_at DESC LIMIT 100').bind(roomId,userId).all<ArcRun&{employee_id:string;profile_version:number}>()).results;
 const turns=(await env.DB.prepare('SELECT id,status,created_at FROM arc_room_turns WHERE room_id=?1 AND user_id=?2 ORDER BY created_at DESC,id DESC LIMIT 100').bind(roomId,userId).all()).results;
 const deliveries=(await env.DB.prepare('SELECT id,turn_id,employee_id,run_id,status FROM arc_room_deliveries WHERE room_id=?1 AND user_id=?2 ORDER BY created_at DESC,id DESC LIMIT 300').bind(roomId,userId).all()).results;
 return{room:await publicRoom(env,room),employees:await roomEmployees(env,room),...history,runs:runs.map(run=>({...publicRun(run),employeeId:run.employee_id,profileVersion:run.profile_version})),turns,deliveries};
}
async function body(request:Request){if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')throw new ArcError('JSON_REQUIRED',415);if(Number(request.headers.get('content-length')||0)>24000)throw new ArcError('MESSAGE_TOO_LARGE',413);const reader=request.body?.getReader();if(!reader)throw new ArcError('INVALID_REQUEST');let size=0,text='';const decoder=new TextDecoder();try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>24000){await reader.cancel();throw new ArcError('MESSAGE_TOO_LARGE',413);}text+=decoder.decode(value,{stream:true});}}finally{reader.releaseLock();}return JSON.parse(text+decoder.decode());}
export async function handleArcRooms(request:Request,env:ArcEnv){try{
 const user=await getSessionUser(request,env);if(!user)return json({error:'unauthorized'},401);if(request.method!=='GET'&&!isTrustedDashboardMutation(request,env))throw new ArcError('same_origin_required',403);
 const url=new URL(request.url),match=url.pathname.match(/^\/api\/arc\/rooms(?:\/([\w-]+)(?:\/(messages|resume|stop))?)?$/);if(!match)throw new ArcError('not_found',404);
 const roomId=match[1],action=match[2];
 if(!roomId&&request.method==='GET'){const rows=(await env.DB.prepare('SELECT r.* FROM arc_team_rooms r JOIN arc_chat_sessions s ON s.id=r.session_id WHERE r.user_id=?1 AND s.deleted_at IS NULL ORDER BY r.updated_at DESC,r.session_id DESC LIMIT 100').bind(user.id).all<RoomRow>()).results;return json({rooms:await Promise.all(rows.map(row=>publicRoom(env,row)))});}
 if(!roomId&&request.method==='POST')return json({room:await createArcRoom(env,user.id,await body(request))},201);
 if(!roomId)throw new ArcError('method_not_allowed',405);await arcRoom(env,user.id,roomId);
 if(!action&&request.method==='GET')return json(await arcRoomSnapshot(env,user.id,roomId));
 if(action==='messages'&&request.method==='GET')return json(await arcRoomMessages(env,user.id,roomId,url.searchParams.get('before')||undefined));
 if(action==='messages'&&request.method==='POST')return json(await enqueueArcRoomMessage(env,user.id,roomId,await body(request)),202);
 if(action==='resume'&&request.method==='POST'){await env.DB.prepare("UPDATE arc_room_turns SET status='queued',updated_at=?1 WHERE room_id=?2 AND user_id=?3 AND status='paused'").bind(stamp(),roomId,user.id).run();await wakeArcRoom(env,roomId);return json({queued:true});}
 if(action==='stop'&&request.method==='POST'){const at=stamp();await env.DB.batch([env.DB.prepare(`UPDATE arc_chat_runs SET status='cancelled',cancel_requested=1,updated_at=?1 WHERE session_id=?2 AND user_id=?3 AND status IN ${active}`).bind(at,roomId,user.id),env.DB.prepare("UPDATE arc_room_turns SET status='cancelled',updated_at=?1 WHERE room_id=?2 AND user_id=?3 AND status IN ('queued','working','paused')").bind(at,roomId,user.id),env.DB.prepare("UPDATE arc_room_deliveries SET status='cancelled',updated_at=?1 WHERE room_id=?2 AND user_id=?3 AND status IN ('queued','claimed')").bind(at,roomId,user.id)]);return json({stopped:true});}
 throw new ArcError('method_not_allowed',405);
 }catch(error){const code=error instanceof ArcError?error.code:error instanceof z.ZodError||error instanceof SyntaxError?'ARC_ROOM_INPUT_INVALID':error instanceof Error&&/^(ARC_|PAID_|MODEL_|BILLING_)/.test(error.message)?error.message:'ARC_ROOMS_UNAVAILABLE';return json({error:code},error instanceof ArcError?error.status:code==='ARC_ROOM_INPUT_INVALID'?400:/^(ARC_TRIAL|PAID_)/.test(code)?402:503);}}
