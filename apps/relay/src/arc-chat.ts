import { getSessionUser, sha256Hex } from './auth.js';
import { isTrustedDashboardMutation } from './dashboard-origin.js';
import { seal, unseal } from './app-oauth.js';
import type { AppEnv } from './app-catalog.js';
import type { DeviceCallEnv } from './device-call.js';
import { arcGateway, arcAutoId, arcModelAccess, type ArcModelEnv } from './arc-chat-model.js';
import {listArcWork} from './arc-work.js';
import {activateArcTrial,publicArcAccess} from './arc-trial.js';
import {currentArcPlan} from './arc-plan.js';

export type ArcEnv = AppEnv & DeviceCallEnv & ArcModelEnv & { ARC_RUNTIME?:DurableObjectNamespace };
export type ArcSession = {id:string;user_id:string;organization_id:string;title_ciphertext:string;model_id:string;created_at:string;updated_at:string;deleted_at:string|null};
export type ArcRun = {id:string;session_id:string;user_id:string;request_id:string;input_hash:string;model_id:string;automation_id:string|null;status:string;step:number;tokens_used:number;max_tokens:number;max_steps:number;deadline:string;cancel_requested:number;error_code:string|null;created_at:string;updated_at:string};
export type ArcMessageBody = {text:string;tool?:string;arguments?:unknown;result?:unknown;status?:string};
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
 await env.DB.prepare(`INSERT INTO arc_chat_messages(id,session_id,user_id,run_id,role,body_ciphertext,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(id) DO UPDATE SET body_ciphertext=excluded.body_ciphertext`).bind(id,run.session_id,run.user_id,run.id,role,await seal(env,body,arcContext(run.user_id,id)),stamp()).run();
}
export async function arcMessages(env:ArcEnv,userId:string,sessionId:string){
 const rows=(await env.DB.prepare(`SELECT id,role,body_ciphertext,created_at,run_id FROM (SELECT * FROM arc_chat_messages WHERE session_id=?1 AND user_id=?2 ORDER BY created_at DESC,id DESC LIMIT 100) ORDER BY created_at,id`).bind(sessionId,userId).all<{id:string;role:string;body_ciphertext:string;created_at:string;run_id:string|null}>()).results;
 return Promise.all(rows.map(async({body_ciphertext,...row})=>({...row,...await unseal<ArcMessageBody>(env,body_ciphertext,arcContext(userId,row.id))})));
}
export const publicRun=(run:ArcRun)=>({id:run.id,status:run.status,step:run.step,tokensUsed:run.tokens_used,maxTokens:run.max_tokens,maxSteps:run.max_steps,deadline:run.deadline,error:run.error_code,createdAt:run.created_at});
async function snapshot(env:ArcEnv,userId:string,sessionId:string){
 const session=await arcSession(env,userId,sessionId);
 const runs=(await env.DB.prepare('SELECT * FROM arc_chat_runs WHERE session_id=?1 AND user_id=?2 ORDER BY created_at DESC LIMIT 20').bind(sessionId,userId).all<ArcRun>()).results;
 return{session:{id:session.id,title:await unseal<string>(env,session.title_ciphertext,arcContext(userId,session.id)),modelId:session.model_id},messages:await arcMessages(env,userId,sessionId),runs:runs.map(publicRun)};
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
 if(!env.ARC_RUNTIME)throw new ArcError('ARC_NOT_CONFIGURED',503);
 const result=await env.ARC_RUNTIME.getByName(runId).fetch('https://arc/start',{method:'POST',body:JSON.stringify({runId})});
 if(!result.ok)throw new ArcError('CHAT_START_UNAVAILABLE',503);
}
export async function handleArcChat(request:Request,env:ArcEnv):Promise<Response>{
 try{
  const user=await getSessionUser(request,env);if(!user)return json({error:'unauthorized'},401);
  if(!['GET','POST','DELETE'].includes(request.method))return json({error:'method_not_allowed'},405);
  if(request.method!=='GET'&&!isTrustedDashboardMutation(request,env))throw new ArcError('same_origin_required',403);
  const path=new URL(request.url).pathname,organizationId='personal:'+user.id,gateway=arcGateway(env);
  let vaultReady=false;try{vaultReady=atob(env.APP_TOKEN_KEY||'').length===32;}catch{/* Missing or invalid platform vault key. */}
   const auto=gateway?.models.find(m=>m.id===arcAutoId(env)),ready=Boolean(gateway&&env.ARC_RUNTIME&&vaultReady&&auto&&gateway.adapters[auto.provider]);
   const plan=await currentArcPlan(env.DB,user.id),limits={maxSteps:plan.maxSteps,maxTokens:plan.maxTokens,maxSeconds:plan.maxSeconds,concurrentRuns:plan.concurrentRuns};
  if(path==='/api/arc/status'&&request.method==='GET')return json({enabled:ready,access:await publicArcAccess(env,user.id),defaultModel:'auto',models:gateway?.models.filter(m=>m.provider!=='workers_ai').map(m=>({id:m.id===arcAutoId(env)?'auto':m.id,label:m.id===arcAutoId(env)?'Auto':m.model,provider:m.provider,premium:m.id!==arcAutoId(env),configured:Boolean(gateway.adapters[m.provider])}))||[],limits});
  if(path==='/api/arc/trial'&&request.method==='POST'){
   if(!ready)throw new ArcError('ARC_NOT_CONFIGURED',503);
   const input=await body(request);if(input.confirm!==true||Object.keys(input).length!==1)throw new ArcError('TRIAL_CONFIRMATION_REQUIRED');
   await activateArcTrial(env,user.id);return json({access:await publicArcAccess(env,user.id)});
  }
  if(request.method==='POST'&&(path==='/api/arc/sessions'||path.endsWith('/messages'))&&!ready)throw new ArcError('ARC_NOT_CONFIGURED',503);
   if(path==='/api/arc/work'&&request.method==='GET')return json(await listArcWork(env,user.id));
  if(path==='/api/arc/sessions'){
   if(request.method==='GET'){
     const rows=(await env.DB.prepare('SELECT * FROM arc_chat_sessions WHERE user_id=?1 AND deleted_at IS NULL AND automation_id IS NULL ORDER BY updated_at DESC LIMIT 100').bind(user.id).all<ArcSession>()).results;
    return json({sessions:await Promise.all(rows.map(async row=>({id:row.id,title:await unseal<string>(env,row.title_ciphertext,arcContext(user.id,row.id)),modelId:row.model_id,updatedAt:row.updated_at})))});
   }
   if(request.method==='POST'){
    const input=await body(request),id=crypto.randomUUID(),now=stamp(),model=typeof input.modelId==='string'?input.modelId:'auto';await arcModelAccess(env,user.id,organizationId,model);
     const inserted=await env.DB.prepare(`INSERT INTO arc_chat_sessions(id,user_id,organization_id,title_ciphertext,model_id,created_at,updated_at) SELECT ?1,?2,?3,?4,?5,?6,?6 WHERE (SELECT COUNT(*) FROM arc_chat_sessions WHERE user_id=?2 AND deleted_at IS NULL AND automation_id IS NULL)<100 RETURNING id`).bind(id,user.id,organizationId,await seal(env,'New chat',arcContext(user.id,id)),model,now).first();
    if(!inserted)throw new ArcError('CHAT_LIMIT_REACHED',429);return json({id},201);
   }
  }
  const match=path.match(/^\/api\/arc\/sessions\/([\w-]+)(?:\/(messages|cancel))?$/);
  if(!match)throw new ArcError('not_found',404);const sessionId=match[1]!,session=await arcSession(env,user.id,sessionId);
  if(!match[2]&&request.method==='GET')return json(await snapshot(env,user.id,sessionId));
  if(!match[2]&&request.method==='DELETE'){
   const now=stamp();await env.DB.batch([env.DB.prepare('UPDATE arc_chat_sessions SET deleted_at=?1 WHERE id=?2 AND user_id=?3').bind(now,sessionId,user.id),env.DB.prepare("UPDATE arc_chat_runs SET cancel_requested=1,status='cancelled',updated_at=?1 WHERE session_id=?2 AND user_id=?3 AND status IN ('queued','thinking','working')").bind(now,sessionId,user.id)]);return json({deleted:true});
  }
  if(match[2]==='cancel'&&request.method==='POST'){
   const input=await body(request);await env.DB.prepare("UPDATE arc_chat_runs SET cancel_requested=1,status='cancelled',updated_at=?1 WHERE id=?2 AND session_id=?3 AND user_id=?4 AND status IN ('queued','thinking','working')").bind(stamp(),idValue(input.runId),sessionId,user.id).run();return json(await snapshot(env,user.id,sessionId));
  }
  if(match[2]==='messages'&&request.method==='POST'){
   const input=await body(request),requestId=idValue(input.requestId),text=typeof input.text==='string'?input.text.trim():'';
   if(!text||text.length>6000)throw new ArcError('INVALID_MESSAGE');const model=typeof input.modelId==='string'?input.modelId:session.model_id;
   await arcModelAccess(env,user.id,organizationId,model);
   const hash=await sha256Hex(JSON.stringify([sessionId,text,model]));let run=await env.DB.prepare('SELECT * FROM arc_chat_runs WHERE user_id=?1 AND request_id=?2').bind(user.id,requestId).first<ArcRun>();
   if(run&&run.input_hash!==hash)throw new ArcError('REQUEST_ID_CONFLICT',409);
   if(!run){
    const id=crypto.randomUUID(),now=stamp();
    await env.DB.batch([
       env.DB.prepare(`INSERT INTO arc_chat_runs(id,session_id,user_id,request_id,input_hash,model_id,status,max_tokens,max_steps,deadline,created_at,updated_at) SELECT ?1,?2,?3,?4,?5,?6,'queued',?9,?10,?7,?8,?8 WHERE EXISTS(SELECT 1 FROM arc_chat_sessions WHERE id=?2 AND user_id=?3 AND deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM arc_chat_runs WHERE session_id=?2 AND status IN ('queued','thinking','working')) AND (SELECT COUNT(*) FROM arc_chat_runs WHERE user_id=?3 AND status IN ('queued','thinking','working'))<?11 AND (SELECT COUNT(*) FROM arc_chat_messages WHERE session_id=?2)<200 ON CONFLICT(user_id,request_id) DO NOTHING`).bind(id,sessionId,user.id,requestId,hash,model,new Date(Date.now()+limits.maxSeconds*1000).toISOString(),now,limits.maxTokens,limits.maxSteps,limits.concurrentRuns),
     env.DB.prepare(`INSERT OR IGNORE INTO arc_chat_messages(id,session_id,user_id,run_id,role,body_ciphertext,created_at) SELECT ?1,?2,?3,?4,'user',?5,?6 WHERE EXISTS(SELECT 1 FROM arc_chat_runs WHERE id=?4)`).bind(id+':user',sessionId,user.id,id,await seal(env,{text},arcContext(user.id,id+':user')),now),
     env.DB.prepare(`UPDATE arc_chat_sessions SET title_ciphertext=CASE WHEN (SELECT COUNT(*) FROM arc_chat_messages WHERE session_id=?1 AND role='user')=1 THEN ?2 ELSE title_ciphertext END,model_id=?3,updated_at=?4 WHERE id=?1 AND EXISTS(SELECT 1 FROM arc_chat_runs WHERE id=?5)`).bind(sessionId,await seal(env,text.slice(0,64),arcContext(user.id,sessionId)),model,now,id),
    ]);
    run=await env.DB.prepare('SELECT * FROM arc_chat_runs WHERE user_id=?1 AND request_id=?2').bind(user.id,requestId).first<ArcRun>();
    if(!run)throw new ArcError('CHAT_BUSY_OR_LIMIT_REACHED',409);
   }
   if(run.status==='queued')await wakeArcRun(env,run.id);return json({run:publicRun(run)},202);
  }
  throw new ArcError('method_not_allowed',405);
 }catch(error){
  const code=error instanceof ArcError?error.code:error instanceof Error&&/^(ARC_|MODEL_|PAID_|BILLING_|app_vault_)/.test(error.message)?error.message:'CHAT_UNAVAILABLE';
  return json({error:code},error instanceof ArcError?error.status:/^(PAID_MODEL|ARC_TRIAL)/.test(code)?402:503);
 }
}
