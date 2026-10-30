import {arcDispatchContext,type ArcDispatchData} from './arc-dispatch-context.js';
import type {ArcWorkingContext} from './arc-working-context.js';
import {unseal} from '../apps/app-oauth.js';
import {arcContext,arcMessages,ArcError,type ArcEnv,type ArcRun,type ArcMessageBody} from './arc-chat.js';
import {APP_OPERATIONS} from '../apps/app-catalog.js';
import {readArcEmployee} from './arc-teams.js';
import {sha256Hex} from '../auth/auth.js';
import {arcRoom,arcRoomMessages,roomEmployees} from './arc-team-rooms.js';
import type {ArcEmployeeProfile,ArcEmployeeScope} from '@remotearc/protocol';

type Assignment={employee_id:string;profile_version:number;turn_id:string;delivery_id:string;room_id:string;source_message_id:string;user_message_id:string;depth:number;turn_created_at:string};
export type EmployeeExecution={workingContext?:ArcWorkingContext;inputAttachments?:ArcMessageBody['attachments'];inputLocation?:ArcMessageBody['location'];assignment:Assignment;identity:Pick<ArcEmployeeProfile,'name'|'responsibility'|'instructions'> & {id:string;version:number};scope:ArcEmployeeScope;objective:string;sourceMessage:string;peers:{id:string;name:string;responsibility:string}[];history:Awaited<ReturnType<typeof arcMessages>>};
const intersection=(left:string[],right:string[])=>left.filter(value=>right.includes(value));
async function message(env:ArcEnv,userId:string,messageId:string){const row=await env.DB.prepare('SELECT body_ciphertext FROM arc_chat_messages WHERE id=?1 AND user_id=?2').bind(messageId,userId).first<{body_ciphertext:string}>();if(!row)throw new ArcError('ARC_EMPLOYEE_SOURCE_UNAVAILABLE',409);return unseal<ArcMessageBody>(env,row.body_ciphertext,arcContext(userId,messageId));}
export async function arcEmployeeExecution(env:ArcEnv,run:ArcRun):Promise<EmployeeExecution|undefined>{
 if(!run.id||!run.session_id)return undefined;
 const assignment=await env.DB.prepare(`SELECT e.employee_id,e.profile_version,e.turn_id,e.delivery_id,d.room_id,d.source_message_id,d.depth,t.user_message_id,t.created_at turn_created_at FROM arc_employee_runs e JOIN arc_room_deliveries d ON d.id=e.delivery_id JOIN arc_room_turns t ON t.id=e.turn_id WHERE e.run_id=?1 AND d.user_id=?2 AND d.room_id=?3 AND t.status IN ('queued','working') AND d.status='claimed'`).bind(run.id,run.user_id,run.session_id).first<Assignment>();
 if(!assignment){if(await env.DB.prepare('SELECT run_id FROM arc_employee_runs WHERE run_id=?1').bind(run.id).first()||await env.DB.prepare('SELECT session_id FROM arc_team_rooms WHERE session_id=?1 AND user_id=?2').bind(run.session_id,run.user_id).first())throw new ArcError('ARC_EMPLOYEE_ASSIGNMENT_ENDED',409);return undefined;}
 const room=await arcRoom(env,run.user_id,assignment.room_id),members=await roomEmployees(env,room),current=members.find(member=>member.id===assignment.employee_id);if(!current)throw new ArcError('ARC_EMPLOYEE_ACCESS_REVOKED',403);
 const version=await env.DB.prepare('SELECT profile_ciphertext FROM arc_employee_versions WHERE employee_id=?1 AND version=?2 AND user_id=?3').bind(current.id,assignment.profile_version,run.user_id).first<{profile_ciphertext:string}>();if(!version)throw new ArcError('ARC_EMPLOYEE_VERSION_UNAVAILABLE',409);
 const frozen=await unseal<ArcEmployeeProfile>(env,version.profile_ciphertext,`arc-team:${run.user_id}:employee:${current.id}:${assignment.profile_version}`),rank={none:0,read:1,write:2},mode=rank[current.scope.appMode]<rank[frozen.scope.appMode]?current.scope.appMode:frozen.scope.appMode;
 const scope:ArcEmployeeScope={appMode:mode,connectionIds:mode==='none'?[]:intersection(frozen.scope.connectionIds,current.scope.connectionIds),deviceIds:intersection(frozen.scope.deviceIds,current.scope.deviceIds),deviceTools:intersection(frozen.scope.deviceTools,current.scope.deviceTools),skillIds:intersection(frozen.scope.skillIds,current.scope.skillIds),delegationTeamIds:intersection(frozen.scope.delegationTeamIds||[],current.scope.delegationTeamIds||[])};
 const dispatch=await env.DB.prepare('SELECT d.id,d.target_kind,d.target_id,d.input_ciphertext FROM arc_room_turns t JOIN arc_dispatches d ON d.id=t.source_dispatch_id WHERE t.id=?1 AND d.user_id=?2').bind(assignment.turn_id,run.user_id).first<{id:string;target_kind:string;target_id:string;input_ciphertext:string}>();
 const delegated=dispatch?await unseal<ArcDispatchData>(env,dispatch.input_ciphertext,arcDispatchContext(run.user_id,dispatch.id)):null;
 const clamp=(inherited:ArcEmployeeScope)=>{if(rank[inherited.appMode]<rank[scope.appMode])scope.appMode=inherited.appMode;for(const key of ['connectionIds','deviceIds','deviceTools','skillIds','delegationTeamIds'] as const)scope[key]=intersection(scope[key]||[],inherited[key]||[]);if(scope.appMode==='none')scope.connectionIds=[];};
 let ancestor=dispatch;const visited=new Set<string>();
 while(ancestor){if(visited.has(ancestor.id)||visited.size>=8)throw new ArcError('ARC_DISPATCH_AUTHORITY_INVALID',403);visited.add(ancestor.id);const authority=await unseal<ArcDispatchData>(env,ancestor.input_ciphertext,arcDispatchContext(run.user_id,ancestor.id));if(authority.scope)clamp(authority.scope);
  if(authority.sourceEmployeeId){const sourceEmployee=await readArcEmployee(env,run.user_id,authority.sourceEmployeeId);if(sourceEmployee.status!=='active'||ancestor.target_kind==='team'&&!sourceEmployee.scope.delegationTeamIds?.includes(ancestor.target_id))throw new ArcError('ARC_DISPATCH_AUTHORITY_REVOKED',403);clamp(sourceEmployee.scope);}
  if(authority.parentId){const parent=await env.DB.prepare('SELECT id,target_kind,target_id,input_ciphertext FROM arc_dispatches WHERE id=?1 AND user_id=?2').bind(authority.parentId,run.user_id).first<NonNullable<typeof ancestor>>();if(!parent)throw new ArcError('ARC_DISPATCH_AUTHORITY_INVALID',403);ancestor=parent;}else ancestor=null;
 }
 let inputSource:ArcMessageBody|undefined;if(delegated){const original=await env.DB.prepare('SELECT source_message_id FROM arc_dispatches WHERE id=?1 AND user_id=?2').bind(delegated.rootId,run.user_id).first<{source_message_id:string}>();if(!original)throw new ArcError('ARC_EMPLOYEE_SOURCE_UNAVAILABLE',409);inputSource=await message(env,run.user_id,original.source_message_id);}
 const [root,source,history]=await Promise.all([message(env,run.user_id,assignment.user_message_id),message(env,run.user_id,assignment.source_message_id),arcRoomMessages(env,run.user_id,run.session_id).then(page=>page.messages)]);
 // New user turns are queued separately and must not replace an active goal.
 const allowedUsers=new Set((await env.DB.prepare('SELECT user_message_id FROM arc_room_turns WHERE room_id=?1 AND rowid<=(SELECT rowid FROM arc_room_turns WHERE id=?2)').bind(run.session_id,assignment.turn_id).all<{user_message_id:string}>()).results.map(row=>row.user_message_id));
 const visible=history.filter(item=>item.role!=='user'||allowedUsers.has(item.id));
 return{workingContext:delegated?.workingContext,inputAttachments:inputSource?.attachments,inputLocation:inputSource?.location,assignment,identity:{id:current.id,version:assignment.profile_version,name:frozen.name,responsibility:frozen.responsibility,instructions:frozen.instructions},scope,objective:root.text,sourceMessage:source.tool==='message_employee'?String((source.arguments as {message?:string})?.message||source.text):delegated?.instructions||source.text,peers:members.filter(member=>member.id!==current.id).map(member=>({id:member.id,name:member.name,responsibility:member.responsibility})),history:visible};
}
export function employeeToolError(execution:EmployeeExecution|undefined,tool:string,args:Record<string,any>){
 if(!execution)return tool==='message_employee'?{code:'ARC_EMPLOYEE_CONVERSATION_REQUIRED',dispatched:false}:null;
 const scope=execution.scope;
 let allowed=['list_teammates','list_apps','list_devices','list_skills','describe_app','select_device','web_search','get_weather'].includes(tool);
 if(tool==='read_skill'||tool==='read_skill_resource')allowed=scope.skillIds.includes(args.id);
 if(tool==='prepare_skill')allowed=scope.skillIds.includes(args.id)&&scope.deviceIds.includes(args.deviceId)&&scope.deviceTools.includes('write_file');
 if(tool==='read_inbox')allowed=scope.appMode!=='none'&&scope.connectionIds.includes(args.connectionId);
 if(tool==='call_app'){const action=APP_OPERATIONS.find(action=>action.name===args.operation);allowed=scope.appMode!=='none'&&scope.connectionIds.includes(args.connectionId)&&Boolean(action)&&(action?.permission!=='write'||scope.appMode==='write');}
 if(tool==='device_tool')allowed=scope.deviceIds.includes(args.deviceId)&&scope.deviceTools.includes(args.tool);
 if(tool==='select_device')allowed=scope.deviceIds.length>0&&Array.isArray(args.requiredTools)&&args.requiredTools.every((tool:string)=>scope.deviceTools.includes(tool));
 if(tool==='delegate_work')allowed=args.targetKind==='employee'?execution.peers.some(peer=>peer.id===args.targetId):scope.delegationTeamIds?.includes(args.targetId)===true;
 if(tool==='message_employee')allowed=execution.assignment.depth<8&&execution.peers.some(peer=>peer.id===args.employeeId);
 return allowed?null:{code:'ARC_EMPLOYEE_SCOPE',dispatched:false,guidance:'This employee can use only assigned current resources and room members. Do not use the owner’s private memory, other accounts, schedules or another room. Ask the user to update the employee’s access if needed.'};
}
export function employeeObservation(execution:EmployeeExecution|undefined,tool:string,result:any){
 if(!execution)return result;
 if(tool==='list_devices'&&Array.isArray(result))return result.filter(device=>execution.scope.deviceIds.includes(device.id));
 if(tool==='list_apps'&&result&&typeof result==='object')return{...result,connections:Array.isArray(result.connections)?result.connections.filter((connection:any)=>execution.scope.connectionIds.includes(connection.id)):[]};
 if(tool==='list_skills'&&result&&typeof result==='object')return{...result,skills:Array.isArray(result.skills)?result.skills.filter((skill:any)=>execution.scope.skillIds.includes(skill.id)):[]};
 return result;
}
/** A public room message wakes only its addressed colleague. No model polling. */
export async function messageArcEmployee(env:ArcEnv,run:ArcRun,args:{employeeId:string;message:string}){
 const execution=await arcEmployeeExecution(env,run),error=employeeToolError(execution,'message_employee',args);if(!execution||error)throw new ArcError('ARC_EMPLOYEE_SCOPE',403);
 const {assignment}=execution,id='handoff-'+await sha256Hex(JSON.stringify([run.id,args.employeeId,args.message])),sourceId=run.id+':'+run.step+':tool',at=new Date().toISOString();
 await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO arc_room_deliveries(id,user_id,turn_id,room_id,source_message_id,employee_id,depth,status,created_at,updated_at) SELECT ?1,?2,?3,?4,?5,?6,?7,'queued',?8,?8 WHERE (SELECT COUNT(*) FROM arc_room_deliveries WHERE turn_id=?3)<40 AND EXISTS(SELECT 1 FROM arc_room_turns WHERE id=?3 AND user_id=?2 AND status='working') AND EXISTS(SELECT 1 FROM arc_room_members WHERE room_id=?4 AND employee_id=?6 AND user_id=?2)`).bind(id,run.user_id,assignment.turn_id,run.session_id,sourceId,args.employeeId,assignment.depth+1,at),
 ]);
 const saved=await env.DB.prepare('SELECT id FROM arc_room_deliveries WHERE id=?1 AND user_id=?2').bind(id,run.user_id).first();return saved?{queued:true,employeeId:args.employeeId,message:args.message}:{queued:false,code:'ARC_TEAM_DISCUSSION_LIMIT',guidance:'This turn reached its handoff limit. Return the actual work and remaining handoff to the user.'};
}
