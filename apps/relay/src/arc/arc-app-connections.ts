import {z} from 'zod';
import {APP_CATALOG,APP_OPERATIONS,providerSchema,appOperation,type AppProvider} from '../apps/app-catalog.js';
import {appConfigured} from '../apps/app-auth-adapters.js';
import {validateAppAccess} from '../apps/apps.js';
import {sha256Hex} from '../auth/auth.js';
import {ArcError,arcSession,appendArcMessage,wakeArcRun,type ArcEnv,type ArcRun} from './arc-chat.js';
import type {ArcAppConnectionRequest} from '@remotearc/protocol';

export const arcConnectAppInput=z.object({provider:providerSchema,operation:z.string().min(1).max(150).optional(),reconnect:z.boolean().optional()}).strict();
type Row={id:string;user_id:string;source_run_id:string;source_step:number;provider:AppProvider;required_operation:string|null;status:'pending'|'resumed'|'cancelled';connection_id:string|null;remaining_ms:number;expires_at:string;session_id:string};
const now=()=>new Date().toISOString();
const response=(data:unknown)=>Response.json(data,{headers:{'cache-control':'private, no-store'}});
async function owned(env:ArcEnv,owner:string,id:string){
 const row=await env.DB.prepare(`SELECT q.*,r.session_id FROM arc_app_connection_requests q JOIN arc_chat_runs r ON r.id=q.source_run_id JOIN arc_chat_sessions s ON s.id=r.session_id WHERE q.id=?1 AND q.user_id=?2 AND r.user_id=?2 AND s.user_id=?2 AND s.deleted_at IS NULL`).bind(id,owner).first<Row>();
 if(!row)throw new ArcError('ARC_APP_CONNECTION_NOT_FOUND',404);return row;
}
async function publicRequest(env:ArcEnv,row:Row):Promise<ArcAppConnectionRequest>{
 const app=APP_CATALOG[row.provider];
 return{id:row.id,sourceRunId:row.source_run_id,provider:row.provider,name:app.name,brand:app.brand,auth:app.auth||'oauth',configured:env.ENABLE_APPS==='1'&&appConfigured(env,row.provider),status:row.status==='pending'&&Date.parse(row.expires_at)<=Date.now()?'expired':row.status,expiresAt:row.expires_at};
}
export async function listArcAppConnections(env:ArcEnv,owner:string,sessionId:string){
 const rows=(await env.DB.prepare(`SELECT q.*,r.session_id FROM arc_app_connection_requests q JOIN arc_chat_runs r ON r.id=q.source_run_id WHERE r.session_id=?1 AND q.user_id=?2 ORDER BY q.created_at DESC,q.id DESC LIMIT 50`).bind(sessionId,owner).all<Row>()).results;
 return Promise.all(rows.map(row=>publicRequest(env,row)));
}
export async function requestArcAppConnection(env:ArcEnv,run:ArcRun,raw:unknown){
 const input=arcConnectAppInput.parse(raw);if(input.operation)appOperation(input.provider,input.operation);
 const requiredOperation=input.operation||APP_OPERATIONS.find(operation=>operation.provider===input.provider&&operation.permission==='read')!.name;
 // Account consent belongs to the owner in this chat. A schedule, teammate or
 // tool result cannot ask for new access on the owner's behalf.
 const source=await env.DB.prepare(`SELECT r.id FROM arc_chat_runs r JOIN arc_chat_sessions s ON s.id=r.session_id WHERE r.id=?1 AND r.user_id=?2 AND r.step=?3 AND r.automation_id IS NULL AND r.cancel_requested=0 AND r.status IN ('queued','thinking','working') AND s.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM arc_employee_runs WHERE run_id=r.id) AND NOT EXISTS(SELECT 1 FROM arc_team_rooms WHERE session_id=r.session_id) AND EXISTS(SELECT 1 FROM arc_chat_messages WHERE run_id=r.id AND user_id=?2 AND role='user')`).bind(run.id,run.user_id,run.step).first();
 if(!source)return{code:'ARC_APP_CONNECTION_OWNER_CHAT_REQUIRED',dispatched:false};
 const connections=(await env.DB.prepare("SELECT id FROM app_connections WHERE user_id=?1 AND provider=?2 AND status='active' ORDER BY updated_at DESC LIMIT 25").bind(run.user_id,input.provider).all<{id:string}>()).results;
 if(!input.reconnect)for(const connection of connections){try{await validateAppAccess(env,run.user_id,connection.id,requiredOperation);return{connected:true,provider:input.provider,connectionId:connection.id,guidance:'The account is already connected. Continue the original request with this account; no setup or copied instructions are needed.'};}catch{/* Existing partial grants may need explicit reauthorization. */}}
 const id='app-connect-'+await sha256Hex(run.id+':'+run.step),at=now();
 await env.DB.prepare(`INSERT OR IGNORE INTO arc_app_connection_requests(id,user_id,source_run_id,source_step,provider,required_operation,remaining_ms,expires_at,created_at,updated_at) SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?9 WHERE EXISTS(SELECT 1 FROM arc_chat_runs WHERE id=?3 AND user_id=?2 AND step=?4 AND status IN ('queued','thinking','working') AND cancel_requested=0 AND deadline>?9)`).bind(id,run.user_id,run.id,run.step,input.provider,requiredOperation,Math.max(1000,Date.parse(run.deadline)-Date.now()),new Date(Date.now()+86400000).toISOString(),at).run();
 const row=await owned(env,run.user_id,id);
 return{waitingForConnection:true,connectionRequest:await publicRequest(env,row),guidance:'A connection card is shown in this chat. Wait for the user to connect; the same task will resume automatically. Do not ask for credentials, commands or another description of the task.'};
}
export async function chatConnectionReturn(env:ArcEnv,owner:string,id:string,provider:AppProvider){
 const row=await owned(env,owner,id);
 if(row.provider!==provider||row.status!=='pending'||Date.parse(row.expires_at)<=Date.now())throw new ArcError('ARC_APP_CONNECTION_CLOSED',409);
 const run=await env.DB.prepare("SELECT id FROM arc_chat_runs WHERE id=?1 AND user_id=?2 AND step=?3 AND status='queued' AND cancel_requested=0").bind(row.source_run_id,owner,row.source_step+1).first();
 if(!run)throw new ArcError('ARC_APP_CONNECTION_CLOSED',409);
 return{sessionId:row.session_id,requestId:row.id};
}
export const chatConnectionUrl=(env:ArcEnv,sessionId:string)=>`${env.DASHBOARD_ORIGIN||env.APP_ORIGIN||env.PUBLIC_ORIGIN}/dashboard/agent/chat?session=${encodeURIComponent(sessionId)}`;
export async function arcAppConnectionDestination(env:ArcEnv,owner:string,id:string){return chatConnectionUrl(env,(await owned(env,owner,id)).session_id);}
export async function resumeArcAppConnection(env:ArcEnv,owner:string,id:string,connectionId:string){
 const row=await owned(env,owner,id);
 const connection=await env.DB.prepare("SELECT id FROM app_connections WHERE id=?1 AND user_id=?2 AND provider=?3 AND status='active'").bind(connectionId,owner,row.provider).first();
 if(!connection)throw new ArcError('ARC_APP_CONNECTION_REQUIRED',409);
 if(row.required_operation)await validateAppAccess(env,owner,connectionId,row.required_operation);
 if(row.status==='cancelled'||row.status==='pending'&&Date.parse(row.expires_at)<=Date.now())throw new ArcError('ARC_APP_CONNECTION_CLOSED',409);
 if(row.status==='pending'){
  const deadline=new Date(Date.now()+row.remaining_ms).toISOString(),at=now();
  const results=await env.DB.batch([
   env.DB.prepare(`UPDATE arc_chat_runs SET deadline=?1,updated_at=?2 WHERE id=?3 AND user_id=?4 AND step=?5 AND status='queued' AND cancel_requested=0 AND EXISTS(SELECT 1 FROM arc_app_connection_requests WHERE id=?6 AND status='pending') AND EXISTS(SELECT 1 FROM arc_chat_sessions WHERE id=arc_chat_runs.session_id AND deleted_at IS NULL)`).bind(deadline,at,row.source_run_id,owner,row.source_step+1,id),
   env.DB.prepare(`UPDATE arc_app_connection_requests SET status='resumed',connection_id=?1,updated_at=?2 WHERE id=?3 AND user_id=?4 AND status='pending' AND EXISTS(SELECT 1 FROM arc_chat_runs WHERE id=source_run_id AND status='queued' AND cancel_requested=0 AND step=?5 AND deadline=?6)`).bind(connectionId,at,id,owner,row.source_step+1,deadline),
  ]);
  if(!results[0]?.meta.changes){const current=await owned(env,owner,id);if(current.status!=='resumed')throw new ArcError('ARC_APP_CONNECTION_CLOSED',409);}
 }
 const updated=await owned(env,owner,id);if(updated.status!=='resumed')throw new ArcError('ARC_APP_CONNECTION_CLOSED',409);
 const run=await env.DB.prepare('SELECT * FROM arc_chat_runs WHERE id=?1 AND user_id=?2').bind(row.source_run_id,owner).first<ArcRun>();
 if(!run||run.cancel_requested||run.status==='cancelled')throw new ArcError('ARC_APP_CONNECTION_CLOSED',409);
 await appendArcMessage(env,run,'tool','app-connected:'+id,{text:'Account connected',tool:'connect_app',arguments:{provider:row.provider},status:'completed',result:{connected:true,provider:row.provider,connectionId:updated.connection_id}});
 if(['queued','thinking','working'].includes(run.status))await wakeArcRun(env,run.id);
 return{resumed:true,sessionId:row.session_id,runId:row.source_run_id};
}
export async function cancelArcAppConnections(env:ArcEnv,owner:string,sessionId:string){
 const at=now();await env.DB.batch([
  env.DB.prepare(`UPDATE arc_chat_runs SET status='cancelled',cancel_requested=1,updated_at=?1 WHERE session_id=?2 AND user_id=?3 AND EXISTS(SELECT 1 FROM arc_app_connection_requests WHERE source_run_id=arc_chat_runs.id AND status='pending')`).bind(at,sessionId,owner),
  env.DB.prepare(`UPDATE arc_app_connection_requests SET status='cancelled',updated_at=?1 WHERE user_id=?2 AND status='pending' AND source_run_id IN (SELECT id FROM arc_chat_runs WHERE session_id=?3 AND user_id=?2)`).bind(at,owner,sessionId),
 ]);
}
export async function handleArcAppConnection(request:Request,env:ArcEnv,owner:string){
 const id=new URL(request.url).pathname.match(/^\/api\/arc\/app-connections\/(app-connect-[a-f0-9]{64})$/)?.[1];if(!id)return Response.json({error:'not_found'},{status:404});
 const row=await owned(env,owner,id);await arcSession(env,owner,row.session_id);
 if(request.method==='GET')return response({request:await publicRequest(env,row)});
 if(request.method!=='POST')throw new ArcError('method_not_allowed',405);
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new ArcError('JSON_REQUIRED',415);
 const reader=request.body?.getReader();if(!reader)throw new ArcError('INVALID_REQUEST');let text='',size=0;const decoder=new TextDecoder();
 try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>1000){await reader.cancel();throw new ArcError('INVALID_REQUEST');}text+=decoder.decode(chunk.value,{stream:true});}}finally{reader.releaseLock();}text+=decoder.decode();
 let value:unknown;try{value=JSON.parse(text);}catch{throw new ArcError('INVALID_REQUEST');}
 const parsed=z.discriminatedUnion('action',[z.object({action:z.literal('resume'),connectionId:z.string().min(1).max(160)}).strict(),z.object({action:z.literal('cancel')}).strict(),z.object({action:z.literal('renew')}).strict()]).safeParse(value);if(!parsed.success)throw new ArcError('INVALID_REQUEST');const input=parsed.data;
 if(input.action==='renew'){
  const result=await env.DB.prepare(`UPDATE arc_app_connection_requests SET expires_at=?1,updated_at=?2 WHERE id=?3 AND user_id=?4 AND status='pending' AND EXISTS(SELECT 1 FROM arc_chat_runs WHERE id=source_run_id AND status='queued' AND cancel_requested=0 AND step=source_step+1)`).bind(new Date(Date.now()+86400000).toISOString(),now(),id,owner).run();
  if(!result.meta.changes)throw new ArcError('ARC_APP_CONNECTION_CLOSED',409);return response({request:await publicRequest(env,await owned(env,owner,id))});
 }
 if(input.action==='cancel'){if(row.status==='pending')await cancelArcAppConnections(env,owner,row.session_id);return response({cancelled:true});}
 return response(await resumeArcAppConnection(env,owner,id,input.connectionId));
}
