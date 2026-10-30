import {z} from 'zod';
import type {ArcEmployeeDraft,ArcEmployeeProfile} from '@remotearc/protocol';
import {sha256Hex} from '../auth/auth.js';
import {seal,unseal} from '../apps/app-oauth.js';
import {ArcError,arcContext,type ArcEnv,type ArcRun} from './arc-chat.js';
import {employeeProfileSchema,saveArcEmployee,readArcEmployee} from './arc-teams.js';

export const arcEmployeeDraftInput=z.object({name:z.string().trim().min(1).max(80),responsibility:z.string().trim().min(1).max(500),instructions:z.string().trim().max(6000).optional(),modelId:z.string().min(1).max(100).optional(),emoji:z.string().min(1).max(16).optional(),draftOnly:z.boolean().optional()}).strict();
type DraftRow={id:string;user_id:string;source_run_id:string;input_ciphertext:string;input_hash:string;created_object_id:string|null;status:'pending'|'confirmed'|'cancelled';expires_at:string};
const context=(owner:string,id:string)=>`arc-employee-draft:${owner}:${id}`;
const objectId=(id:string)=>{const hash=id.replace('employee-draft-','');return hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-8'+hash.slice(17,20)+'-'+hash.slice(20,32);};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
async function rowFor(env:ArcEnv,owner:string,id:string){const row=await env.DB.prepare("SELECT d.* FROM arc_team_drafts d JOIN arc_chat_runs r ON r.id=d.source_run_id JOIN arc_chat_sessions s ON s.id=r.session_id WHERE d.id=?1 AND d.user_id=?2 AND d.kind='employee' AND s.user_id=?2 AND s.deleted_at IS NULL").bind(id,owner).first<DraftRow>();if(!row)throw new ArcError('ARC_EMPLOYEE_DRAFT_NOT_FOUND',404);return row;}
async function publicDraft(env:ArcEnv,row:DraftRow):Promise<ArcEmployeeDraft>{
 let profile=await unseal<ArcEmployeeProfile>(env,row.input_ciphertext,context(row.user_id,row.id));
 if(row.status==='confirmed'&&row.created_object_id){const employee=await readArcEmployee(env,row.user_id,row.created_object_id);profile={name:employee.name,responsibility:employee.responsibility,instructions:employee.instructions,modelId:employee.modelId,avatar:employee.avatar,scope:employee.scope};}
 return{id:row.id,sourceRunId:row.source_run_id,profile,status:row.status==='pending'&&Date.parse(row.expires_at)<=Date.now()?'expired':row.status,expiresAt:row.expires_at,employeeId:row.created_object_id};
}
/** Direct owner-chat requests create an identity with no resource access.
 * Explicit previews retain the editable draft flow. Neither starts inference. */
export async function draftArcEmployee(env:ArcEnv,run:ArcRun,raw:unknown){
 const input=arcEmployeeDraftInput.parse(raw),at=new Date().toISOString();
 const allowed=await env.DB.prepare("SELECT r.id FROM arc_chat_runs r JOIN arc_chat_sessions s ON s.id=r.session_id WHERE r.id=?1 AND r.user_id=?2 AND r.step=?3 AND r.automation_id IS NULL AND r.cancel_requested=0 AND r.status IN ('queued','thinking','working') AND r.deadline>?4 AND s.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM arc_employee_runs WHERE run_id=r.id) AND NOT EXISTS(SELECT 1 FROM arc_team_rooms WHERE session_id=r.session_id) AND EXISTS(SELECT 1 FROM arc_chat_messages WHERE run_id=r.id AND user_id=?2 AND role='user')").bind(run.id,run.user_id,run.step,at).first();
 if(!allowed)return{code:'ARC_EMPLOYEE_DRAFT_USER_CHAT_REQUIRED',dispatched:false};
 const requests=(await env.DB.prepare("SELECT body_ciphertext,id FROM arc_chat_messages WHERE session_id=?1 AND user_id=?2 AND role='user' AND created_at<=?3 ORDER BY created_at DESC,id DESC LIMIT 4").bind(run.session_id,run.user_id,at).all<{body_ciphertext:string;id:string}>()).results;
 const texts=await Promise.all(requests.map(async row=>(await unseal<{text:string}>(env,row.body_ciphertext,arcContext(run.user_id,row.id))).text));
 const creation=/(?:\b(?:create|add|hire|build|set up)\b.{0,100}\b(?:employees?|teammates?|team members?|designers?|developers?|teams?)\b|(?:创建|新增|添加|组建|招募|帮我建|建.{0,8}(?:个|位)).{0,100}(?:队友|员工|团队|设计|开发|商务|专家))/i;
 const latest=texts[0]||'',requested=creation.test(latest)||latest.length<80&&/(?:\b(?:four|three|two|4|3|2) teammates?\b|[一二三四五六七八九十\d]+个队友)/i.test(latest)&&texts.slice(1).some(text=>creation.test(text));
 const preview=input.draftOnly===true||/(?:\b(?:draft|preview|propose)\b|\b(?:do not|don't|never)\b.{0,40}\b(?:create|add|hire)\b|(?:不要|别|暂不).{0,10}(?:创建|添加|建)|先.{0,12}(?:草稿|预览|方案)|(?:只|仅).{0,8}(?:草稿|设计资料))/i.test(latest);
 const profile:ArcEmployeeProfile={name:input.name,responsibility:input.responsibility,instructions:input.instructions||'',modelId:input.modelId||'auto',avatar:input.emoji?{kind:'emoji',value:input.emoji,color:'#446655'}:{kind:'initials',color:'#446655'},scope:{appMode:'none',connectionIds:[],deviceIds:[],deviceTools:[],skillIds:[]}};
 const hash=await sha256Hex(JSON.stringify(profile)),id='employee-draft-'+await sha256Hex(run.id+':'+hash);
 await env.DB.prepare("INSERT OR IGNORE INTO arc_team_drafts(id,user_id,source_run_id,kind,input_ciphertext,input_hash,expires_at,created_at,updated_at) SELECT ?1,?2,?3,'employee',?4,?5,?6,?7,?7 WHERE (SELECT COUNT(*) FROM arc_team_drafts WHERE source_run_id=?3)<5 AND EXISTS(SELECT 1 FROM arc_chat_runs WHERE id=?3 AND user_id=?2 AND step=?8 AND status IN ('queued','thinking','working') AND cancel_requested=0 AND deadline>?7)").bind(id,run.user_id,run.id,await seal(env,profile,context(run.user_id,id)),hash,new Date(Date.now()+7*86400000).toISOString(),at,run.step).run();
 const row=await env.DB.prepare('SELECT * FROM arc_team_drafts WHERE id=?1 AND user_id=?2').bind(id,run.user_id).first<DraftRow>();
 if(!row)return{code:'ARC_EMPLOYEE_DRAFT_LIMIT',dispatched:false};
 if(requested&&!preview&&row.status!=='cancelled'){
  const employee=row.status==='confirmed'&&row.created_object_id?await readArcEmployee(env,run.user_id,row.created_object_id):await saveArcEmployee(env,run.user_id,objectId(id),profile,undefined,{draftId:id});
  const updated=await rowFor(env,run.user_id,id);
  return{draft:await publicDraft(env,updated),employee,created:true,requiresUserConfirmation:false,guidance:'The requested teammate is created. Report their name and responsibility. Do not propose or create the same teammate again. Keep working on the rest of the owner’s goal in this chat. If requested, organize the team and assign its work now. Saved profile/access settings are optional; no resource access was added by this creation.'};
 }
 return{draft:await publicDraft(env,row),created:false,requiresUserConfirmation:true,guidance:'An editable profile card is attached to this chat. Ask the user to review name, model, avatar and access and press Create employee. No employee or work exists until confirmation. Do not ask for a separate budget or deadline. Do not call this tool repeatedly for the same profile.'};
}
export async function listArcEmployeeDrafts(env:ArcEnv,owner:string,sessionId:string){const rows=(await env.DB.prepare("SELECT d.* FROM arc_team_drafts d JOIN arc_chat_runs r ON r.id=d.source_run_id WHERE r.session_id=?1 AND d.user_id=?2 AND d.kind='employee' ORDER BY d.created_at,d.id LIMIT 100").bind(sessionId,owner).all<DraftRow>()).results;return Promise.all(rows.map(row=>publicDraft(env,row)));}
export async function handleArcEmployeeDraft(request:Request,env:ArcEnv,owner:string){
 const id=new URL(request.url).pathname.match(/^\/api\/arc\/employee-drafts\/(employee-draft-[a-f0-9]{64})$/)?.[1];if(!id)return json({error:'not_found'},404);
 const row=await rowFor(env,owner,id);if(request.method==='GET')return json({draft:await publicDraft(env,row)});if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new ArcError('JSON_REQUIRED',415);
 const reader=request.body?.getReader();if(!reader)throw new ArcError('INVALID_REQUEST');const decoder=new TextDecoder();let size=0,body='';try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>180000){await reader.cancel();throw new ArcError('MESSAGE_TOO_LARGE',413);}body+=decoder.decode(chunk.value,{stream:true});}}finally{reader.releaseLock();}
 const input=z.discriminatedUnion('action',[z.object({action:z.literal('cancel')}).strict(),z.object({action:z.literal('confirm'),profile:employeeProfileSchema}).strict()]).parse(JSON.parse(body+decoder.decode()));
 if(input.action==='cancel'){if(row.status==='confirmed')throw new ArcError('ARC_EMPLOYEE_DRAFT_CONFIRMED',409);await env.DB.prepare("UPDATE arc_team_drafts SET status='cancelled',updated_at=?1 WHERE id=?2 AND user_id=?3 AND status='pending'").bind(new Date().toISOString(),id,owner).run();return json({draft:await publicDraft(env,await rowFor(env,owner,id))});}
 if(row.status==='cancelled'||row.status==='pending'&&Date.parse(row.expires_at)<=Date.now())throw new ArcError('ARC_EMPLOYEE_DRAFT_CLOSED',409);
 const employeeId=row.created_object_id||objectId(id),hash=await sha256Hex(JSON.stringify(input.profile));
 if(row.status==='confirmed'){const saved=await env.DB.prepare('SELECT creation_hash FROM arc_employees WHERE id=?1 AND user_id=?2').bind(employeeId,owner).first<{creation_hash:string}>();if(saved?.creation_hash!==hash)throw new ArcError('ARC_TEAM_IDEMPOTENCY_CONFLICT',409);return json({employee:await readArcEmployee(env,owner,employeeId),draft:await publicDraft(env,row)});}
 const employee=await saveArcEmployee(env,owner,employeeId,input.profile,undefined,{draftId:id});const updated=await rowFor(env,owner,id);if(updated.status!=='confirmed')throw new ArcError('ARC_EMPLOYEE_DRAFT_CHANGED',409);
 return json({employee,draft:await publicDraft(env,updated)});
}
