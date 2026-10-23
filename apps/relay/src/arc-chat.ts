import {readCommunityResource} from './arc-community-skills.js';
import {arcDispatchProgress} from './arc-dispatch-progress.js';
import {arcChatHistory} from './arc-chat-history.js';
import {listArcAppConnections,handleArcAppConnection,cancelArcAppConnections} from './arc-app-connections.js';
import {handleArcAttachments,readArcAttachment,arcLocationSchema} from './arc-attachments.js';
import type {ArcAttachment,ArcLocation} from '@remotearc/protocol';
import {listArcSkills,saveArcSkill,readArcSkill,removeArcSkill,arcSkillInput} from './arc-skills.js';
import { getSessionUser, sha256Hex } from './auth.js';
import { isTrustedDashboardMutation } from './dashboard-origin.js';
import { seal, unseal } from './app-oauth.js';
import type { AppEnv } from './app-catalog.js';
import type { DeviceCallEnv } from './device-call.js';
import { arcGateway, arcAutoId, arcModelAccess, arcDeploymentReady, type ArcModelEnv } from './arc-chat-model.js';
import {listArcWork,arcSessionWork} from './arc-work.js';
import {activateArcTrial,publicArcAccess} from './arc-trial.js';
import {currentArcPlan} from './arc-plan.js';
import {arcMemoryInput,listArcMemory,rememberArcFact,removeArcMemory,configureArcMemory,editArcMemory} from './arc-memory.js';
import type {ArcEmployeeAvatar,ArcVerification} from '@remotearc/protocol';
import {arcVerificationSchema,validateArcVerification,arcReceipt,type ArcProof} from './arc-verification.js';

export type ArcEnv = AppEnv & DeviceCallEnv & ArcModelEnv & { ARC_RUNTIME?:DurableObjectNamespace; ARC_RUNTIME_LOCATION_HINT?:string };
const runtimeLocations=new Set<string>(['wnam','enam','sam','weur','eeur','apac','apac-ne','apac-se','oc','afr','me']);
/**
 * A runtime object makes dozens of sequential D1 queries per Arc step, so it
 * must live beside the D1 primary (Oceania), not beside whoever first woke it.
 * Slack ingress and cron arrive from North America; without a hint every query
 * crossed the Pacific and each step paid ~7s before the model was even called.
 * The hint only applies when an object is first created.
 */
export function arcRuntime(env:ArcEnv,name:string){
 if(!env.ARC_RUNTIME)throw new ArcError('ARC_NOT_CONFIGURED',503);
 const hint=env.ARC_RUNTIME_LOCATION_HINT||'oc';
 return env.ARC_RUNTIME.getByName(name,runtimeLocations.has(hint)?{locationHint:hint as DurableObjectLocationHint}:undefined);
}
export type ArcSession = {id:string;user_id:string;organization_id:string;title_ciphertext:string;model_id:string;created_at:string;updated_at:string;deleted_at:string|null;automation_id?:string|null};
export type ArcRun = {id:string;session_id:string;user_id:string;request_id:string;input_hash:string;model_id:string;automation_id:string|null;status:string;step:number;tokens_used:number;max_tokens:number;max_steps:number;deadline:string;cancel_requested:number;error_code:string|null;created_at:string;updated_at:string};
export type ArcMessageBody = {text:string;attachments?:ArcAttachment[];location?:ArcLocation;teammates?:{id:string;name:string;responsibility:string;avatar:ArcEmployeeAvatar}[];skills?:{id:string;name:string}[];apps?:{id:string;name:string;provider:string}[];tool?:string;arguments?:unknown;result?:unknown;status?:string;verification?:ArcVerification;proof?:ArcProof};
export const arcContext=(userId:string,id:string)=>`arc-chat:${userId}:${id}`;
export const stamp=()=>new Date().toISOString();
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
export class ArcError extends Error {constructor(readonly code:string,readonly status=400){super(code);}}
export const arcActive=(status:string)=>['queued','thinking','working'].includes(status);
export async function arcSession(env:ArcEnv,userId:string,id:string){
 const session=await env.DB.prepare('SELECT * FROM arc_chat_sessions WHERE id=?1 AND user_id=?2 AND deleted_at IS NULL').bind(id,userId).first<ArcSession>();
 if(!session)throw new ArcError('CHAT_NOT_FOUND',404);return session;
}
export async function appendArcMessage(env:ArcEnv,run:ArcRun,role:'assistant'|'tool',suffix:string,body:ArcMessageBody){
 const id=run.id+':'+suffix;
 await env.DB.prepare(`INSERT INTO arc_chat_messages(id,session_id,user_id,run_id,role,body_ciphertext,created_at) SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE EXISTS(SELECT 1 FROM arc_chat_sessions WHERE id=?2 AND user_id=?3 AND deleted_at IS NULL) ON CONFLICT(id) DO UPDATE SET body_ciphertext=excluded.body_ciphertext`).bind(id,run.session_id,run.user_id,run.id,role,await seal(env,body,arcContext(run.user_id,id)),stamp()).run();
}
export async function arcMessages(env:ArcEnv,userId:string,sessionId:string,runId?:string){
 const rows=(await env.DB.prepare(`SELECT id,role,body_ciphertext,created_at,run_id FROM (SELECT * FROM arc_chat_messages WHERE session_id=?1 AND user_id=?2 AND (?3 IS NULL OR run_id=?3) ORDER BY created_at DESC,id DESC LIMIT ?4) ORDER BY created_at,id`).bind(sessionId,userId,runId??null,runId?512:100).all<{id:string;role:string;body_ciphertext:string;created_at:string;run_id:string|null}>()).results;
 return Promise.all(rows.map(async({body_ciphertext,...row})=>({...row,...await unseal<ArcMessageBody>(env,body_ciphertext,arcContext(userId,row.id))})));
}
export const publicRun=(run:ArcRun)=>({id:run.id,status:run.status,step:run.step,tokensUsed:run.tokens_used,maxTokens:run.max_tokens,maxSteps:run.max_steps,deadline:run.deadline,error:run.error_code,createdAt:run.created_at});
async function snapshot(env:ArcEnv,userId:string,sessionId:string){
 const session=await arcSession(env,userId,sessionId);
 const runs=(await env.DB.prepare('SELECT * FROM arc_chat_runs WHERE session_id=?1 AND user_id=?2 ORDER BY created_at DESC LIMIT 20').bind(sessionId,userId).all<ArcRun>()).results;
 const page=await arcChatHistory(env,userId,sessionId),messages=page.messages;
 const appConnections=await listArcAppConnections(env,userId,sessionId);
 // A receipt must not disappear when later turns move its original scope out
 // of the 100-message chat window. Restore that run's own encrypted journal;
 // 512 exceeds the current maximum of 32 tool steps plus user/final messages.
 const publicRuns=await Promise.all(runs.map(async run=>{
  if(arcActive(run.status))return{...publicRun(run),...(appConnections.some(request=>request.sourceRunId===run.id&&['pending','expired'].includes(request.status))?{status:'waiting_connection'}:{})};
  const journal=messages.some(message=>message.run_id===run.id&&message.role==='user')?messages:await arcMessages(env,userId,sessionId,run.id);
  return {...publicRun(run),receipt:arcReceipt(run,journal)};
 }));
 const pendingDelegations=Boolean(await env.DB.prepare("SELECT d.id FROM arc_dispatches d JOIN arc_chat_runs r ON r.id=d.source_run_id WHERE r.session_id=?1 AND d.user_id=?2 AND d.status IN ('prepared','queued') LIMIT 1").bind(sessionId,userId).first());
 const employeeDrafts=await (await import('./arc-team-drafts.js')).listArcEmployeeDrafts(env,userId,sessionId);
 const delegations=await arcDispatchProgress(env,userId,sessionId);
 const work=await arcSessionWork(env,userId,sessionId);
 return{hasMore:page.hasMore,before:page.before,appConnections,employeeDrafts,pendingDelegations,delegations,work,session:{id:session.id,title:await unseal<string>(env,session.title_ciphertext,arcContext(userId,session.id)),modelId:session.model_id},messages,runs:publicRuns};
}
async function body(request:Request){
 if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')throw new ArcError('JSON_REQUIRED',415);
 if(Number(request.headers.get('content-length')||0)>20000)throw new ArcError('MESSAGE_TOO_LARGE',413);
 const reader=request.body?.getReader();if(!reader)throw new ArcError('INVALID_REQUEST');let size=0,text='';const decoder=new TextDecoder();
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>20000){await reader.cancel();throw new ArcError('MESSAGE_TOO_LARGE',413);}text+=decoder.decode(part.value,{stream:true});}}finally{reader.releaseLock();}
 try{const value=JSON.parse(text+decoder.decode());if(!value||typeof value!=='object'||Array.isArray(value))throw 0;return value as Record<string,unknown>;}catch{throw new ArcError('INVALID_REQUEST');}
}
const idValue=(value:unknown)=>{if(typeof value!=='string'||!/^[\w:.-]{1,160}$/.test(value))throw new ArcError('INVALID_REQUEST_ID');return value;};
export async function wakeArcRun(env:ArcEnv,runId:string){
 const result=await arcRuntime(env,runId).fetch('https://arc/start',{method:'POST',body:JSON.stringify({runId})});
 if(!result.ok)throw new ArcError('CHAT_START_UNAVAILABLE',503);
}
export async function handleArcChat(request:Request,env:ArcEnv):Promise<Response>{
 try{
  const user=await getSessionUser(request,env);if(!user)return json({error:'unauthorized'},401);
  if(!['GET','POST','DELETE'].includes(request.method))return json({error:'method_not_allowed'},405);
  if(request.method!=='GET'&&!isTrustedDashboardMutation(request,env))throw new ArcError('same_origin_required',403);
  const path=new URL(request.url).pathname,organizationId='personal:'+user.id,gateway=arcGateway(env);
  if(path.startsWith('/api/arc/app-connections/'))return await handleArcAppConnection(request,env,user.id);
  let vaultReady=false;try{vaultReady=atob(env.APP_TOKEN_KEY||'').length===32;}catch{/* Missing or invalid platform vault key. */}
   const auto=gateway?.models.find(m=>m.id===arcAutoId(env)),ready=Boolean(gateway&&env.ARC_RUNTIME&&vaultReady&&auto&&gateway.adapters[auto.provider]);
   const plan=await currentArcPlan(env,user.id),limits={maxSteps:plan.maxSteps,maxTokens:plan.maxTokens,maxSeconds:plan.maxSeconds,concurrentRuns:plan.concurrentRuns};
  if(path.startsWith('/api/arc/attachments')){const response=await handleArcAttachments(request,env,user.id);if(response)return response;}
  if(path==='/api/arc/status'&&request.method==='GET'){
   const access=await publicArcAccess(env,user.id);
   return json({enabled:ready,access,defaultModel:'auto',models:gateway?.models.filter(m=>m.provider!=='workers_ai').map(m=>m.id===arcAutoId(env)?{id:'auto',label:'Auto',provider:'arc',premium:false,configured:Boolean(gateway.adapters[m.provider]),requiresPaid:false}:{id:m.id,label:m.label||m.model,provider:m.provider,premium:true,configured:Boolean(gateway.adapters[m.provider]),requiresPaid:access.status!=='paid',inputCreditsPer1000:m.inputMicrosPerMillion/2000000,outputCreditsPer1000:m.outputMicrosPerMillion/2000000})||[],limits});
  }
  if(path==='/api/arc/trial'&&request.method==='POST'){
   if(!ready)throw new ArcError('ARC_NOT_CONFIGURED',503);
   const input=await body(request);if(input.confirm!==true||Object.keys(input).length!==1)throw new ArcError('TRIAL_CONFIRMATION_REQUIRED');
   await activateArcTrial(env,user.id);return json({access:await publicArcAccess(env,user.id)});
  }
  if(request.method==='POST'&&(path==='/api/arc/sessions'||path.endsWith('/messages'))&&!ready)throw new ArcError('ARC_NOT_CONFIGURED',503);
   if(path==='/api/arc/work'&&request.method==='GET')return json(await listArcWork(env,user.id));
  if(path==='/api/arc/memory'){
   if(request.method==='GET')return json(await listArcMemory(env,user.id));
   if(request.method==='POST'){
    const input=arcMemoryInput.safeParse(await body(request));if(!input.success)throw new ArcError('ARC_INVALID_MEMORY');
    try{return json(await rememberArcFact(env,user.id,input.data),201);}catch(error){if(error instanceof Error&&/^(ARC_MEMORY_DISABLED|ARC_MEMORY_LIMIT_OR_CHANGED)$/.test(error.message))throw new ArcError(error.message,409);throw error;}
   }
  }
  if(path==='/api/arc/memory/settings'&&request.method==='POST'){
   const input=await body(request);if(typeof input.enabled!=='boolean'||input.clear!==undefined&&typeof input.clear!=='boolean'||Object.keys(input).some(k=>!['enabled','clear'].includes(k)))throw new ArcError('ARC_INVALID_MEMORY');
   return json(await configureArcMemory(env,user.id,input.enabled,input.clear===true));
  }
  const memoryPath=path.match(/^\/api\/arc\/memory\/([\w:-]{1,160})$/);
  if(memoryPath&&request.method==='DELETE')return json(await removeArcMemory(env,user.id,memoryPath[1]!));
  if(memoryPath&&request.method==='POST'){
   const input=arcMemoryInput.safeParse(await body(request));if(!input.success)throw new ArcError('ARC_INVALID_MEMORY');
   try{return json(await editArcMemory(env,user.id,memoryPath[1]!,input.data));}catch(error){if(error instanceof Error&&/^(ARC_MEMORY_DUPLICATE|ARC_MEMORY_NOT_FOUND)$/.test(error.message))throw new ArcError(error.message,error.message==='ARC_MEMORY_NOT_FOUND'?404:409);throw error;}
  }
  if(path==='/api/arc/skills'){
   if(request.method==='GET')return json(await listArcSkills(env,user.id));
   if(request.method==='POST'){
    const input=arcSkillInput.safeParse(await body(request));if(!input.success)throw new ArcError('ARC_INVALID_SKILL');
    try{return json(await saveArcSkill(env,user.id,input.data),201);}catch(error){if(error instanceof Error&&error.message==='ARC_SKILL_LIMIT')throw new ArcError('ARC_SKILL_LIMIT',429);throw error;}
   }
  }
  const resourcePath=path.match(/^\/api\/arc\/skills\/([\w:-]{1,100})\/resources$/);if(resourcePath&&request.method==='GET'){const url=new URL(request.url);return json(readCommunityResource(resourcePath[1]!,url.searchParams.get('path')||'',Number(url.searchParams.get('offset')||'0')));}
  const skillPath=path.match(/^\/api\/arc\/skills\/([\w:-]{1,100})$/);
  if(skillPath){
   if(request.method==='DELETE')return json(await removeArcSkill(env,user.id,skillPath[1]!));
   if(request.method==='GET'){try{return json(await readArcSkill(env,user.id,skillPath[1]!));}catch(error){if(error instanceof Error&&error.message==='ARC_SKILL_NOT_FOUND')throw new ArcError('ARC_SKILL_NOT_FOUND',404);throw error;}}
  }
  if(path==='/api/arc/sessions'){
   if(request.method==='GET'){
     const rows=(await env.DB.prepare('SELECT * FROM arc_chat_sessions WHERE user_id=?1 AND deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM arc_team_rooms WHERE session_id=arc_chat_sessions.id) ORDER BY updated_at DESC LIMIT 100').bind(user.id).all<ArcSession&{automation_id:string|null}>()).results;
    return json({sessions:await Promise.all(rows.map(async row=>({id:row.id,title:await unseal<string>(env,row.title_ciphertext,arcContext(user.id,row.id)),modelId:row.model_id,updatedAt:row.updated_at,...(row.automation_id?{automationId:row.automation_id}:{})})))});
   }
   if(request.method==='POST'){
    const input=await body(request),id=crypto.randomUUID(),now=stamp(),model=typeof input.modelId==='string'?input.modelId:'auto';await arcModelAccess(env,user.id,organizationId,model);
     const inserted=await env.DB.prepare(`INSERT INTO arc_chat_sessions(id,user_id,organization_id,title_ciphertext,model_id,created_at,updated_at) SELECT ?1,?2,?3,?4,?5,?6,?6 WHERE (SELECT COUNT(*) FROM arc_chat_sessions WHERE user_id=?2 AND deleted_at IS NULL AND automation_id IS NULL)<100 RETURNING id`).bind(id,user.id,organizationId,await seal(env,'New chat',arcContext(user.id,id)),model,now).first();
    if(!inserted)throw new ArcError('CHAT_LIMIT_REACHED',429);return json({id},201);
   }
  }
  const match=path.match(/^\/api\/arc\/sessions\/([\w-]+)(?:\/(messages|cancel|history))?$/);
  if(!match)throw new ArcError('not_found',404);const sessionId=match[1]!,session=await arcSession(env,user.id,sessionId);
  if(!match[2]&&request.method==='GET')return json(await snapshot(env,user.id,sessionId));
  if(match[2]==='history'&&request.method==='GET'){const before=new URL(request.url).searchParams.get('before');if(!before||before.length>200)throw new ArcError('INVALID_HISTORY_CURSOR');return json(await arcChatHistory(env,user.id,sessionId,before));}
  if(!match[2]&&request.method==='DELETE'){
   if(session.automation_id)throw new ArcError('CHAT_TASK_MANAGEMENT_REQUIRED',409);
   const now=stamp();await env.DB.batch([env.DB.prepare('DELETE FROM arc_attachments WHERE session_id=?1 AND user_id=?2').bind(sessionId,user.id),env.DB.prepare('UPDATE arc_chat_sessions SET deleted_at=?1 WHERE id=?2 AND user_id=?3').bind(now,sessionId,user.id),env.DB.prepare("UPDATE arc_chat_runs SET cancel_requested=1,status='cancelled',updated_at=?1 WHERE session_id=?2 AND user_id=?3 AND status IN ('queued','thinking','working')").bind(now,sessionId,user.id)]);return json({deleted:true});
  }
  if(match[2]==='cancel'&&request.method==='POST'){
   const input=await body(request);await env.DB.prepare("UPDATE arc_chat_runs SET cancel_requested=1,status='cancelled',updated_at=?1 WHERE id=?2 AND session_id=?3 AND user_id=?4 AND status IN ('queued','thinking','working')").bind(stamp(),idValue(input.runId),sessionId,user.id).run();await env.DB.prepare("UPDATE arc_app_connection_requests SET status='cancelled',updated_at=?1 WHERE source_run_id=?2 AND user_id=?3 AND status='pending' AND EXISTS(SELECT 1 FROM arc_chat_runs WHERE id=?2 AND session_id=?4 AND user_id=?3 AND cancel_requested=1)").bind(stamp(),idValue(input.runId),user.id,sessionId).run();return json(await snapshot(env,user.id,sessionId));
  }
  if(match[2]==='messages'&&request.method==='POST'){
   const run=await submitArcMessage(env,user.id,sessionId,await body(request));return json({run:publicRun(run)},202);
  }
  throw new ArcError('method_not_allowed',405);
 }catch(error){
  const code=error instanceof ArcError?error.code:error instanceof Error&&/^(ARC_|MODEL_|PAID_|BILLING_|app_vault_)/.test(error.message)?error.message:'CHAT_UNAVAILABLE';
  return json({error:code},error instanceof ArcError?error.status:/^(PAID_MODEL|ARC_TRIAL)/.test(code)?402:503);
 }
}

/** Shared, identity-explicit admission for web chat and verified channel adapters. */
export async function createArcConversation(env:ArcEnv,userId:string,id:string=crypto.randomUUID(),title='New chat'){
 if(!arcDeploymentReady(env))throw new ArcError('ARC_NOT_CONFIGURED',503);
 await arcModelAccess(env,userId,'personal:'+userId,'auto');
 const time=stamp();
 await env.DB.prepare(`INSERT OR IGNORE INTO arc_chat_sessions(id,user_id,organization_id,title_ciphertext,model_id,created_at,updated_at)
 SELECT ?1,?2,?3,?4,'auto',?5,?5 WHERE (SELECT COUNT(*) FROM arc_chat_sessions WHERE user_id=?2 AND deleted_at IS NULL AND automation_id IS NULL)<100`)
 .bind(id,userId,'personal:'+userId,await seal(env,title.slice(0,64),arcContext(userId,id)),time).run();
 return arcSession(env,userId,id);
}
export async function submitArcMessage(env:ArcEnv,userId:string,sessionId:string,input:Record<string,unknown>):Promise<ArcRun>{
 const session=await arcSession(env,userId,sessionId),organizationId='personal:'+userId;
 const plan=await currentArcPlan(env,userId),limits={maxSteps:plan.maxSteps,maxTokens:plan.maxTokens,maxSeconds:plan.maxSeconds,concurrentRuns:plan.concurrentRuns};
   if(await env.DB.prepare('SELECT session_id FROM arc_team_rooms WHERE session_id=?1 AND user_id=?2').bind(sessionId,userId).first())throw new ArcError('ARC_ROOM_QUEUE_REQUIRED',409);
   const requestId=idValue(input.requestId),text=typeof input.text==='string'?input.text.trim():'';
   if(input.skillIds!==undefined&&(!Array.isArray(input.skillIds)||input.skillIds.length>3||input.skillIds.some((id:unknown)=>typeof id!=='string'||!/^[\w:-]{1,100}$/.test(id))))throw new ArcError('INVALID_SKILL_REFERENCES');
   const skillIds=[...new Set((input.skillIds||[]) as string[])];
   if(input.appIds!==undefined&&(!Array.isArray(input.appIds)||input.appIds.length>5||input.appIds.some((id:unknown)=>typeof id!=='string'||!/^[-\w:]{1,160}$/.test(id))))throw new ArcError('INVALID_APP_REFERENCES');
   const appIds=[...new Set((input.appIds||[]) as string[])];
   if(input.employeeIds!==undefined&&(!Array.isArray(input.employeeIds)||input.employeeIds.length>8||input.employeeIds.some((id:unknown)=>typeof id!=='string'||!/^[-\w]{1,100}$/.test(id))))throw new ArcError('INVALID_TEAMMATE_REFERENCES');
   const employeeIds=[...new Set((input.employeeIds||[]) as string[])];
   if(input.attachmentIds!==undefined&&(!Array.isArray(input.attachmentIds)||input.attachmentIds.length>3||input.attachmentIds.some((id:unknown)=>typeof id!=='string'||!/^[-\w]{1,100}$/.test(id))))throw new ArcError('INVALID_ATTACHMENT_REFERENCES');
   const attachmentIds=[...new Set((input.attachmentIds||[]) as string[])],parsedLocation=input.location===undefined?undefined:arcLocationSchema.safeParse(input.location);if(parsedLocation&&!parsedLocation.success)throw new ArcError('INVALID_LOCATION');const location=parsedLocation?.success?parsedLocation.data:undefined;
   const verificationInput=input.verification===undefined?undefined:arcVerificationSchema.safeParse(input.verification);
   if(verificationInput&&!verificationInput.success)throw new ArcError('ARC_INVALID_VERIFICATION');
   const verification=verificationInput?.success?verificationInput.data:undefined;
   if(!text||text.length>6000)throw new ArcError('INVALID_MESSAGE');const model=typeof input.modelId==='string'?input.modelId:session.model_id;
   await arcModelAccess(env,userId,organizationId,model);
   const hashInput=verification?[sessionId,text,model,skillIds,verification]:skillIds.length?[sessionId,text,model,skillIds]:[sessionId,text,model];const hash=await sha256Hex(JSON.stringify(attachmentIds.length||location?[employeeIds.length?[...(appIds.length?[...hashInput,appIds]:hashInput),employeeIds]:appIds.length?[...hashInput,appIds]:hashInput,attachmentIds,location||null]:employeeIds.length?[...(appIds.length?[...hashInput,appIds]:hashInput),employeeIds]:appIds.length?[...hashInput,appIds]:hashInput));let run=await env.DB.prepare('SELECT * FROM arc_chat_runs WHERE user_id=?1 AND request_id=?2').bind(userId,requestId).first<ArcRun>();
   if(run&&run.input_hash!==hash)throw new ArcError('REQUEST_ID_CONFLICT',409);
   if(!run){
    if(verification)try{await validateArcVerification(env,userId,verification);}catch{throw new ArcError('ARC_VERIFICATION_CONNECTION_REQUIRED',403);}
    const skills=await Promise.all(skillIds.map(async id=>{try{const skill=await readArcSkill(env,userId,id);return{id:skill.id,name:skill.name};}catch{throw new ArcError('ARC_SKILL_NOT_FOUND',404);}}));
    const apps=await Promise.all(appIds.map(async id=>{const app=await env.DB.prepare("SELECT id,provider,account_label FROM app_connections WHERE id=?1 AND user_id=?2 AND status='active'").bind(id,userId).first<{id:string;provider:string;account_label:string|null}>();if(!app)throw new ArcError('ARC_APP_NOT_FOUND',404);return{id:app.id,provider:app.provider,name:app.account_label?app.provider+' · '+app.account_label:app.provider};}));
    const teammates=await Promise.all(employeeIds.map(async id=>{const {readArcEmployee}=await import('./arc-teams.js'),employee=await readArcEmployee(env,userId,id);if(employee.status!=='active')throw new ArcError('ARC_TEAM_MEMBER_ARCHIVED',409);return{id:employee.id,name:employee.name,responsibility:employee.responsibility,avatar:employee.avatar};}));
    const attachments=await Promise.all(attachmentIds.map(async id=>{const {meta}=await readArcAttachment(env,userId,id,sessionId);const {text,...publicMeta}=meta;return publicMeta;}));
    await cancelArcAppConnections(env,userId,sessionId);
    const id=crypto.randomUUID(),now=stamp();
    await env.DB.batch([
       env.DB.prepare(`INSERT INTO arc_chat_runs(id,session_id,user_id,request_id,input_hash,model_id,status,max_tokens,max_steps,deadline,created_at,updated_at) SELECT ?1,?2,?3,?4,?5,?6,'queued',?9,?10,?7,?8,?8 WHERE EXISTS(SELECT 1 FROM arc_chat_sessions WHERE id=?2 AND user_id=?3 AND deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM arc_chat_runs WHERE session_id=?2 AND status IN ('queued','thinking','working')) AND (SELECT COUNT(*) FROM arc_chat_runs r WHERE user_id=?3 AND status IN ('queued','thinking','working') AND NOT EXISTS(SELECT 1 FROM arc_app_connection_requests q WHERE q.source_run_id=r.id AND q.status='pending'))<?11 AND NOT EXISTS(SELECT 1 FROM json_each(?12) a LEFT JOIN arc_attachments f ON f.id=a.value AND f.user_id=?3 WHERE f.id IS NULL OR f.expires_at<=?8 OR (f.session_id IS NOT NULL AND f.session_id<>?2)) ON CONFLICT(user_id,request_id) DO NOTHING`).bind(id,sessionId,userId,requestId,hash,model,new Date(Date.now()+limits.maxSeconds*1000).toISOString(),now,limits.maxTokens,limits.maxSteps,limits.concurrentRuns,JSON.stringify(attachmentIds)),
     env.DB.prepare(`INSERT OR IGNORE INTO arc_chat_messages(id,session_id,user_id,run_id,role,body_ciphertext,created_at) SELECT ?1,?2,?3,?4,'user',?5,?6 WHERE EXISTS(SELECT 1 FROM arc_chat_runs WHERE id=?4)`).bind(id+':user',sessionId,userId,id,await seal(env,{text,...(attachments.length?{attachments}:{}),...(location?{location}:{}),...(teammates.length?{teammates}:{}),...(apps.length?{apps}:{}),...(skills.length?{skills}:{}),...(verification?{verification}:{})},arcContext(userId,id+':user')),now),
     env.DB.prepare(`UPDATE arc_chat_sessions SET title_ciphertext=CASE WHEN (SELECT COUNT(*) FROM arc_chat_messages WHERE session_id=?1 AND role='user')=1 THEN ?2 ELSE title_ciphertext END,model_id=?3,updated_at=?4 WHERE id=?1 AND EXISTS(SELECT 1 FROM arc_chat_runs WHERE id=?5)`).bind(sessionId,await seal(env,text.slice(0,64),arcContext(userId,sessionId)),model,now,id),
     ...attachmentIds.map(attachmentId=>env.DB.prepare("UPDATE arc_attachments SET session_id=?1,expires_at=?2 WHERE id=?3 AND user_id=?4 AND (session_id IS NULL OR session_id=?1) AND EXISTS(SELECT 1 FROM arc_chat_runs WHERE id=?5)").bind(sessionId,new Date(Date.now()+30*86400000).toISOString(),attachmentId,userId,id)),
    ]);
    run=await env.DB.prepare('SELECT * FROM arc_chat_runs WHERE user_id=?1 AND request_id=?2').bind(userId,requestId).first<ArcRun>();
    if(!run)throw new ArcError('CHAT_BUSY_OR_LIMIT_REACHED',409);
   }
   if(run.status==='queued')await wakeArcRun(env,run.id);return run;
}
