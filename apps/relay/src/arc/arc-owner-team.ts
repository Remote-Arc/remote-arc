import {z} from 'zod';
import {ArcError,arcContext,type ArcEnv,type ArcRun} from './arc-chat.js';
import {unseal} from '../apps/app-oauth.js';
import {sha256Hex} from '../auth/auth.js';
import {saveArcTeam} from './arc-teams.js';
export const arcCreateTeamInput=z.object({name:z.string().trim().min(1).max(80),purpose:z.string().trim().max(1000),employeeIds:z.array(z.uuid()).min(1).max(20),coordinatorId:z.uuid().nullable().optional()}).strict();
/** Owner chat only; saves an owned membership without adding any resource access. */
export async function createArcOwnerTeam(env:ArcEnv,run:ArcRun,raw:unknown){
 const input=arcCreateTeamInput.parse(raw),at=new Date().toISOString();
 const allowed=await env.DB.prepare("SELECT r.id FROM arc_chat_runs r JOIN arc_chat_sessions s ON s.id=r.session_id WHERE r.id=?1 AND r.user_id=?2 AND r.step=?3 AND r.automation_id IS NULL AND r.cancel_requested=0 AND r.status IN ('queued','thinking','working') AND r.deadline>?4 AND s.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM arc_employee_runs WHERE run_id=r.id) AND NOT EXISTS(SELECT 1 FROM arc_team_rooms WHERE session_id=r.session_id)").bind(run.id,run.user_id,run.step,at).first();
 if(!allowed)return{code:'ARC_TEAM_OWNER_CHAT_REQUIRED',dispatched:false};
 const rows=(await env.DB.prepare("SELECT id,body_ciphertext FROM arc_chat_messages WHERE session_id=?1 AND user_id=?2 AND role='user' AND created_at<=?3 ORDER BY created_at DESC,id DESC LIMIT 4").bind(run.session_id,run.user_id,at).all<{id:string;body_ciphertext:string}>()).results;
 const messages=await Promise.all(rows.map(async row=>(await unseal<{text:string}>(env,row.body_ciphertext,arcContext(run.user_id,row.id))).text));
 const latest=messages[0]||'';
 if(/\b(?:draft|preview|do not create|don't create)\b|(?:不要|别|暂不).{0,10}(?:创建|添加|组建|建)|先.{0,12}(?:草稿|预览|方案)/i.test(latest)||!messages.some(text=>/\b(?:create|build|add|organize|set up)\b.{0,100}\b(?:teams?|teammates?)\b|(?:创建|新增|添加|组建|招募|帮我建|组|建.{0,8}(?:个|位)).{0,100}(?:队伍|队友|员工|团队)/i.test(text)))return{code:'ARC_TEAM_CREATION_NOT_REQUESTED',dispatched:false,guidance:'No team was created. Respect previews or negative instructions; continue the current user goal.'};
 const profile={...input,employeeIds:[...input.employeeIds].sort(),coordinatorId:input.coordinatorId??null},hash=await sha256Hex(run.id+':'+JSON.stringify(profile)),id=hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-8'+hash.slice(17,20)+'-'+hash.slice(20,32);
 const team=await saveArcTeam(env,run.user_id,id,profile,undefined,{id:run.id,step:run.step});if(!team)throw new ArcError('ARC_TEAM_OBJECT_NOT_FOUND',404);
 return{team,created:true,requiresUserConfirmation:false,guidance:'The requested team exists. Keep working in this owner chat. If the user also asked for discussion or execution, use delegate_work with this team ID and the actual goal now. Results return to this conversation. Creating a saved team does not itself start paid work or grant access.'};
}
