import {z} from 'zod';
import {sha256Hex} from './auth.js';
import {seal,unseal} from './app-oauth.js';
import {arcContext,arcMessages,ArcError,type ArcEnv,type ArcRun,type ArcMessageBody} from './arc-chat.js';
import {arcEmployeeExecution,messageArcEmployee} from './arc-team-execution.js';
import {createArcRoom,enqueueArcRoomMessage} from './arc-team-rooms.js';
import {readArcEmployee,readArcTeam,teamEvent} from './arc-teams.js';
import {arcDispatchContext,type ArcDispatchData} from './arc-dispatch-context.js';

export const arcDelegateSchema=z.object({targetKind:z.enum(['employee','team']),targetId:z.uuid(),instructions:z.string().trim().min(1).max(4000)}).strict();
async function ownerChatUrl(env:ArcEnv,run:ArcRun,rootId?:string){const root=rootId?await env.DB.prepare('SELECT r.session_id FROM arc_dispatches d JOIN arc_chat_runs r ON r.id=d.source_run_id WHERE d.id=?1 AND d.user_id=?2 AND r.user_id=?2').bind(rootId,run.user_id).first<{session_id:string}>():null;return '/dashboard/agent/chat?session='+encodeURIComponent(root?.session_id||run.session_id);}
const uuid=(hash:string)=>hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-8'+hash.slice(17,20)+'-'+hash.slice(20,32);
/** The existing reasoning turn proposes a route; server policy decides authority. */
export async function arcTeammateDirectory(env:ArcEnv,run:ArcRun,query=''){
 const execution=await arcEmployeeExecution(env,run),term=query.trim().toLocaleLowerCase();
 const ids=(await env.DB.prepare("SELECT id FROM arc_employees WHERE user_id=?1 AND status='active' ORDER BY updated_at DESC LIMIT 100").bind(run.user_id).all<{id:string}>()).results;
 const teams=(await env.DB.prepare("SELECT id FROM arc_teams WHERE user_id=?1 AND status='active' ORDER BY updated_at DESC LIMIT 30").bind(run.user_id).all<{id:string}>()).results;
 const employees=await Promise.all(ids.filter(row=>!execution||execution.peers.some(peer=>peer.id===row.id)).map(row=>readArcEmployee(env,run.user_id,row.id)));
 const availableTeams=await Promise.all(teams.filter(row=>!execution||execution.scope.delegationTeamIds?.includes(row.id)).map(row=>readArcTeam(env,run.user_id,row.id)));
 const matches=(name:string,role:string)=>!term||(name+' '+role).toLocaleLowerCase().includes(term);
 return{employees:employees.filter(employee=>matches(employee.name,employee.responsibility)).slice(0,25).map(employee=>({id:employee.id,name:employee.name,responsibility:employee.responsibility,version:employee.version,modelId:employee.modelId,access:{apps:employee.scope.appMode,appCount:employee.scope.connectionIds.length,computerCount:employee.scope.deviceIds.length}})),teams:availableTeams.filter(team=>matches(team.name,team.purpose)).map(team=>({id:team.id,name:team.name,purpose:team.purpose,version:team.version,memberCount:team.employeeIds.length})),guidance:'Use an explicit user-selected recipient first. Otherwise select by the current outcome and actual role/capabilities. An unclear essential goal needs clarification. Routing never grants new resource access.'};
}
export async function delegateArcWork(env:ArcEnv,run:ArcRun,raw:unknown){
 const input=arcDelegateSchema.parse(raw),saved=await env.DB.prepare("SELECT id FROM arc_chat_runs WHERE id=?1 AND user_id=?2 AND session_id=?3 AND step=?4 AND cancel_requested=0 AND status IN ('queued','thinking','working') AND deadline>?5").bind(run.id,run.user_id,run.session_id,run.step,new Date().toISOString()).first();if(!saved)throw new ArcError('ARC_DISPATCH_SOURCE_ENDED',409);
 const execution=await arcEmployeeExecution(env,run);
 if(execution&&input.targetKind==='employee')return messageArcEmployee(env,run,{employeeId:input.targetId,message:input.instructions});
 if(execution&&!execution.scope.delegationTeamIds?.includes(input.targetId))throw new ArcError('ARC_DISPATCH_TEAM_PERMISSION_REQUIRED',403);
 const target=input.targetKind==='employee'?await readArcEmployee(env,run.user_id,input.targetId):await readArcTeam(env,run.user_id,input.targetId);if(target.status!=='active')throw new ArcError('ARC_DISPATCH_TARGET_ARCHIVED',409);
 const prior=await env.DB.prepare("SELECT id,root_id,room_id,turn_id FROM arc_dispatches WHERE source_run_id=?1 AND user_id=?2 AND target_kind=?3 AND target_id=?4 AND status IN ('queued','reported') LIMIT 1").bind(run.id,run.user_id,input.targetKind,input.targetId).first<{id:string;root_id:string;room_id:string;turn_id:string}>();
 if(prior)return{queued:true,alreadyAssigned:true,dispatchId:prior.id,roomId:prior.room_id,turnId:prior.turn_id,target:{kind:input.targetKind,id:target.id,name:target.name},url:await ownerChatUrl(env,run,prior.root_id),guidance:'This recipient already has this run’s user goal. Reuse the actual conversation; do not create another copy or claim the outcome is complete.'};
 const recipients=input.targetKind==='employee'?[target.id]:('employeeIds' in target?target.employeeIds:[]);if(!recipients.length)throw new ArcError('ARC_DISPATCH_TARGET_EMPTY',409);
 for(const id of recipients){const member=await readArcEmployee(env,run.user_id,id);if(member.status!=='active')throw new ArcError('ARC_DISPATCH_TARGET_ARCHIVED',409);}
 const sourceId=execution?.assignment.user_message_id||(await arcMessages(env,run.user_id,run.session_id,run.id)).find(message=>message.role==='user')?.id;if(!sourceId)throw new ArcError('ARC_DISPATCH_USER_SOURCE_REQUIRED',403);
 const sourceRow=await env.DB.prepare("SELECT body_ciphertext FROM arc_chat_messages WHERE id=?1 AND user_id=?2 AND role='user'").bind(sourceId,run.user_id).first<{body_ciphertext:string}>();if(!sourceRow)throw new ArcError('ARC_DISPATCH_USER_SOURCE_REQUIRED',403);
 const source=await unseal<ArcMessageBody>(env,sourceRow.body_ciphertext,arcContext(run.user_id,sourceId));
 if(!execution&&source.teammates?.length){const addressed=source.teammates.map(member=>member.id),actual=input.targetKind==='employee'?[target.id]:('employeeIds' in target?target.employeeIds:[]);if(input.targetKind==='employee'?!addressed.includes(target.id):actual.length!==addressed.length||actual.some(id=>!addressed.includes(id)))throw new ArcError('ARC_DISPATCH_RECIPIENT_MISMATCH',403);}
 const hash=await sha256Hex(JSON.stringify([run.user_id,run.id,run.step,input])),dispatchId='dispatch-'+await sha256Hex(run.id+':'+run.step),roomId=uuid(await sha256Hex(dispatchId+':room')),requestId=uuid(await sha256Hex(dispatchId+':message'));
 let inherited:ArcDispatchData|null=null,parentId:string|null=null;
 if(execution){const parent=await env.DB.prepare('SELECT d.id,d.input_ciphertext FROM arc_room_turns t JOIN arc_dispatches d ON d.id=t.source_dispatch_id WHERE t.id=?1 AND d.user_id=?2').bind(execution.assignment.turn_id,run.user_id).first<{id:string;input_ciphertext:string}>();if(parent){parentId=parent.id;inherited=await unseal<ArcDispatchData>(env,parent.input_ciphertext,arcDispatchContext(run.user_id,parent.id));}}
 const depth=Math.max(execution?.assignment.depth||0,inherited?.depth||0)+1;if(depth>8)throw new ArcError('ARC_DISPATCH_DEPTH_LIMIT',409);
 const data:ArcDispatchData={goal:source.text,instructions:input.instructions,sourceRunId:run.id,sourceMessageId:sourceId,sourceEmployeeId:execution?.identity.id||null,scope:execution?.scope||null,depth,rootId:inherited?.rootId||dispatchId,parentId},at=new Date().toISOString();
 await env.DB.prepare(`INSERT OR IGNORE INTO arc_dispatches(id,user_id,source_run_id,source_message_id,source_step,root_id,depth,target_kind,target_id,target_version,room_id,input_hash,input_ciphertext,status,created_at,updated_at) SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'prepared',?14,?14 WHERE (SELECT COUNT(*) FROM arc_dispatches WHERE user_id=?2 AND root_id=?6)<40 AND EXISTS(SELECT 1 FROM arc_chat_runs WHERE id=?3 AND user_id=?2 AND cancel_requested=0 AND status IN ('queued','thinking','working'))`).bind(dispatchId,run.user_id,run.id,sourceId,run.step,data.rootId,depth,input.targetKind,target.id,target.version,roomId,hash,await seal(env,data,arcDispatchContext(run.user_id,dispatchId)),at).run();
 const dispatch=await env.DB.prepare('SELECT input_hash,status,turn_id,target_version FROM arc_dispatches WHERE id=?1 AND user_id=?2').bind(dispatchId,run.user_id).first<{input_hash:string;status:string;turn_id:string|null;target_version:number}>();if(!dispatch)throw new ArcError('ARC_DISPATCH_DISCUSSION_LIMIT',409);if(dispatch.input_hash!==hash)throw new ArcError('ARC_DISPATCH_IDEMPOTENCY_CONFLICT',409);
 if(dispatch.status==='prepared'&&dispatch.target_version!==target.version)throw new ArcError('ARC_DISPATCH_TARGET_CHANGED',409);
 if(dispatch.status==='queued'||dispatch.status==='reported')return{queued:true,dispatchId,roomId,turnId:dispatch.turn_id,target:{kind:input.targetKind,id:target.id,name:target.name},url:await ownerChatUrl(env,run,data.rootId)};
 await createArcRoom(env,run.user_id,{id:roomId,kind:input.targetKind==='employee'?'direct':'team',name:target.name,...(input.targetKind==='team'?{teamId:target.id}:{}),employeeIds:recipients});
 const queued=await enqueueArcRoomMessage(env,run.user_id,roomId,{requestId,text:source.text},dispatchId);
 await env.DB.prepare("UPDATE arc_dispatches SET status='queued',turn_id=?1,updated_at=?2 WHERE id=?3 AND user_id=?4 AND input_hash=?5").bind(queued.turnId,new Date().toISOString(),dispatchId,run.user_id,hash).run();
 await teamEvent(env,run.user_id,'work.assigned',{sourceRunId:run.id,targetKind:input.targetKind,targetId:target.id,targetVersion:target.version,dispatchId,turnId:queued.turnId},{...(input.targetKind==='team'?{teamId:target.id}:{employeeId:target.id}),roomId,referenceId:dispatchId});
 return{queued:true,dispatchId,roomId,turnId:queued.turnId,target:{kind:input.targetKind,id:target.id,name:target.name},url:await ownerChatUrl(env,run,data.rootId),guidance:'Work is queued for the actual assigned teammate(s). Keep the user in this Arc Chat. Report current progress and later actual results here; do not claim the outcome is finished.'};
}
