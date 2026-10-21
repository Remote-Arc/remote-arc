import {unseal} from './app-oauth.js';
import {arcContext,type ArcEnv,type ArcMessageBody} from './arc-chat.js';
import type {ArcDelegationProgress,ArcEmployeeProfile} from '@remotearc/protocol';

/** Owner-scoped projection of actual delivery/run state; never model polling. */
export async function arcDispatchProgress(env:ArcEnv,userId:string,sessionId:string):Promise<ArcDelegationProgress[]>{
 const dispatches=(await env.DB.prepare(`SELECT d.id,d.source_run_id,d.status,t.status turn_status,d.updated_at FROM arc_dispatches d JOIN arc_chat_runs r ON r.id=d.source_run_id LEFT JOIN arc_room_turns t ON t.id=d.turn_id AND t.user_id=?2 WHERE r.session_id=?1 AND r.user_id=?2 AND d.user_id=?2 ORDER BY d.created_at DESC,d.id DESC LIMIT 40`).bind(sessionId,userId).all<{id:string;source_run_id:string;status:string;turn_status:string|null;updated_at:string}>()).results;
 if(!dispatches.length)return[];
 const members=(await env.DB.prepare(`SELECT d.root_id,d.id dispatch_id,c.id,c.employee_id,c.status delivery_status,r.status run_status,r.step,COALESCE(r.updated_at,c.updated_at) updated_at,COALESCE(v.profile_ciphertext,e.profile_ciphertext) profile_ciphertext,COALESCE(er.profile_version,e.version) profile_version,m.id message_id,m.body_ciphertext FROM arc_dispatches d JOIN arc_room_deliveries c ON c.turn_id=d.turn_id AND c.user_id=?2 JOIN arc_employees e ON e.id=c.employee_id AND e.user_id=?2 LEFT JOIN arc_chat_runs r ON r.id=c.run_id AND r.user_id=?2 LEFT JOIN arc_employee_runs er ON er.run_id=c.run_id LEFT JOIN arc_employee_versions v ON v.employee_id=er.employee_id AND v.version=er.profile_version AND v.user_id=?2 LEFT JOIN arc_chat_messages m ON m.id=(SELECT id FROM arc_chat_messages WHERE run_id=c.run_id AND user_id=?2 AND role='tool' ORDER BY created_at DESC,id DESC LIMIT 1) WHERE d.user_id=?2 AND d.root_id IN (SELECT root.id FROM arc_dispatches root JOIN arc_chat_runs sr ON sr.id=root.source_run_id WHERE sr.session_id=?1 AND sr.user_id=?2 AND root.user_id=?2) ORDER BY c.created_at,c.id LIMIT 200`).bind(sessionId,userId).all<any>()).results;
 const decoded=await Promise.all(members.map(async row=>{
  const profile=await unseal<ArcEmployeeProfile>(env,row.profile_ciphertext,`arc-team:${userId}:employee:${row.employee_id}:${row.profile_version}`);
  const activity=row.message_id?await unseal<ArcMessageBody>(env,row.body_ciphertext,arcContext(userId,row.message_id)):null;
  const state=row.run_status||row.delivery_status,status:ArcDelegationProgress['members'][number]['status']=['succeeded','completed'].includes(state)?'completed':['failed','unknown','cancelled'].includes(state)?state:['thinking','working','claimed'].includes(state)?'working':'queued';
  return{rootId:row.root_id,dispatchId:row.dispatch_id,id:row.id,employeeId:row.employee_id,name:profile.name,avatar:profile.avatar,status,step:row.step||0,activity:activity?.text?.slice(0,180)||'',updatedAt:row.updated_at};
 }));
 return dispatches.map(dispatch=>{
  const assigned=decoded.filter(member=>member.rootId===dispatch.id||member.dispatchId===dispatch.id).map(({rootId,dispatchId,...member})=>member);
  const status:ArcDelegationProgress['status']=dispatch.turn_status==='paused'?'paused':dispatch.turn_status==='cancelled'?'cancelled':assigned.some(member=>member.status==='working')?'working':assigned.some(member=>member.status==='queued')||dispatch.status==='prepared'?'queued':dispatch.turn_status==='unknown'||assigned.some(member=>member.status==='unknown')?'unknown':assigned.some(member=>member.status==='failed')?'failed':assigned.length>0&&assigned.every(member=>member.status==='cancelled')?'cancelled':dispatch.status==='reported'||dispatch.turn_status==='completed'?'completed':'working';
  return{id:dispatch.id,sourceRunId:dispatch.source_run_id,status,members:assigned,updatedAt:dispatch.updated_at};
 });
}
