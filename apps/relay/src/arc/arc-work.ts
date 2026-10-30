import {z} from 'zod';
import {seal,unseal} from '../apps/app-oauth.js';
import {sha256Hex} from '../auth/auth.js';
import {requireArcAccess} from './arc-trial.js';
import {currentArcPlan} from './arc-plan.js';
import {arcContext,arcMessages,stamp,wakeArcRun,type ArcEnv,type ArcRun} from './arc-chat.js';
import type {AutomationRow,RuntimeState,AutomationStatus} from '../tasks/automations.js';

export const arcScheduleSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('once'),at:z.iso.datetime({offset:true}).optional()}).strict(),
 z.object({type:z.literal('interval'),everyMinutes:z.number().int().min(15).max(43200)}).strict(),
 z.object({type:z.literal('daily'),time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),timezone:z.string().min(1).max(100),weekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7).optional()}).strict(),
]);
type Schedule=z.infer<typeof arcScheduleSchema>;
type NativeWork={version:1;instructions:string;modelId:string;schedule:Schedule;originSessionId:string};
export function nativeArcWork(goal:string|null):NativeWork|null{
 try{const value=JSON.parse(goal||'null');return value?.type==='agent_goal'&&value?.native_arc?.version===1?value.native_arc:null;}catch{return null;}
}
/** Match local wall time, skipping DST gaps and using the first occurrence of
 * an ambiguous time. The saved UTC occurrence prevents duplicate fall-back runs. */
export function nextArcOccurrence(schedule:Schedule,after:Date):string|null{
 if(schedule.type==='once')return schedule.at?new Date(Math.max(Date.parse(schedule.at),after.getTime())).toISOString():after.toISOString();
 if(schedule.type==='interval')return new Date(after.getTime()+schedule.everyMinutes*60000).toISOString();
 let formatter:Intl.DateTimeFormat;
 try{formatter=new Intl.DateTimeFormat('en-GB',{timeZone:schedule.timezone,hour:'2-digit',minute:'2-digit',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hourCycle:'h23'});}catch{throw new Error('ARC_INVALID_TIMEZONE');}
 const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 const parts=(at:Date)=>Object.fromEntries(formatter.formatToParts(at).map(p=>[p.type,p.value]));
 const previous=parts(after),previousDate=[previous.year,previous.month,previous.day].join('-');
 for(let ms=Math.floor(after.getTime()/60000)*60000+60000,end=ms+9*86400000;ms<=end;ms+=60000){
  const p=parts(new Date(ms));
  if(`${p.hour}:${p.minute}`!==schedule.time||schedule.weekdays&&!schedule.weekdays.includes(weekdays.indexOf(p.weekday!)))continue;
  const date=[p.year,p.month,p.day].join('-');
  // An occurrence at this local time has already passed on this date.
  if(date===previousDate&&`${previous.hour}:${previous.minute}`>=schedule.time)continue;
  return new Date(ms).toISOString();
 }
 throw new Error('ARC_INVALID_SCHEDULE');
}
export async function createArcWork(env:ArcEnv,run:ArcRun,args:unknown,routine:boolean){
 const input=z.object({name:z.string().trim().min(1).max(100),instructions:z.string().trim().min(1).max(6000),schedule:arcScheduleSchema}).strict().parse(args);
 if(routine===(input.schedule.type==='once'))throw new Error('ARC_INVALID_SCHEDULE');
 if(run.automation_id)return{code:'ARC_SCHEDULE_ALREADY_RUNNING',dispatched:false,automationId:run.automation_id,guidance:'This is an occurrence of an already saved task. Execute its instructions now using the connected tools, then deliver the actual result. Do not create another task or schedule.'};
 await requireArcAccess(env,run.user_id);
  const plan=await currentArcPlan(env,run.user_id);
 const id='arc-'+(await sha256Hex(`${run.id}:${run.step}`)).slice(0,32),now=stamp(),next=nextArcOccurrence(input.schedule,new Date(now));
 const native:NativeWork={version:1,instructions:await seal(env,input.instructions,`arc-work:${run.user_id}:${id}`),modelId:run.model_id,schedule:input.schedule,originSessionId:run.session_id};
 const goal={type:'agent_goal',controller:'source',controller_client_id:'arc-native',objective:input.name,success_criteria:'Report verified results in the task conversation.',allowed_tools:[],max_iterations:8,native_arc:native};
 const trigger=routine?{type:'interval',every_seconds:input.schedule.type==='interval'?input.schedule.everyMinutes*60:86400}:{type:'at',at:next};
  await env.DB.prepare(`INSERT OR IGNORE INTO automations(id,user_id,name,kind,status,device_id,trigger_json,action_json,goal_json,state_json,interval_seconds,next_run_at,max_runs,run_count,created_at,updated_at) SELECT ?1,?2,?3,'goal_loop','waiting',NULL,?4,'{"steps":[]}',?5,'{}',60,?6,?7,0,?8,?8 WHERE (SELECT COUNT(*) FROM automations WHERE user_id=?2 AND status NOT IN ('completed','cancelled','failed','expired'))<50 AND (?9=0 OR (SELECT COUNT(*) FROM automations WHERE user_id=?2 AND status NOT IN ('completed','cancelled','failed','expired') AND json_extract(goal_json,'$.native_arc.schedule.type') IN ('interval','daily'))<?10)`).bind(id,run.user_id,input.name,JSON.stringify(trigger),JSON.stringify(goal),next,routine?10000:1,now,Number(routine),plan.routines).run();
 const row=await env.DB.prepare('SELECT id FROM automations WHERE id=?1 AND user_id=?2').bind(id,run.user_id).first();
 if(!row)throw new Error('ARC_WORK_LIMIT_REACHED');
 // A saved task has a conversation immediately, before its first scheduled occurrence.
 await env.DB.prepare(`INSERT OR IGNORE INTO arc_chat_sessions(id,user_id,organization_id,title_ciphertext,model_id,created_at,updated_at,automation_id) VALUES(?1,?2,?3,?4,?5,?6,?6,?1)`).bind(id,run.user_id,'personal:'+run.user_id,await seal(env,input.name,arcContext(run.user_id,id)),run.model_id,now).run();
 return{id,name:input.name,kind:routine?'routine':'task',nextRunAt:next,schedule:input.schedule,status:'waiting',conversationId:id};
}
export async function manageArcWork(env:ArcEnv,run:ArcRun,args:unknown){
 const input=z.object({action:z.enum(['list','pause','resume','cancel','update']),id:z.string().max(160).optional(),instructions:z.string().trim().min(1).max(6000).optional(),schedule:arcScheduleSchema.optional()}).strict().parse(args);
 if(input.action==='list'){const result=await listArcWork(env,run.user_id);return{work:result.work,runs:result.runs.filter(item=>item.id!==run.id).slice(0,10),currentRunExcluded:true};}
 if(run.automation_id)return{code:'ARC_SCHEDULE_MANAGEMENT_USER_CHAT_REQUIRED',dispatched:false,guidance:'Execute this occurrence now. Schedule changes belong in the owner conversation; do not change or recreate a schedule during its execution.'};
 const row=await env.DB.prepare('SELECT * FROM automations WHERE id=?1 AND user_id=?2').bind(input.id||'',run.user_id).first<AutomationRow>(),work=row&&nativeArcWork(row.goal_json);
 if(!row||!work)throw new Error('ARC_WORK_NOT_FOUND');
 if(['completed','cancelled','expired'].includes(row.status))throw new Error('ARC_WORK_FINISHED');
 if(input.action==='update'){
  if(row.status==='running'||(row.lease_until&&row.lease_until>stamp()))throw new Error('ARC_WORK_BUSY');
  if(!input.instructions&&!input.schedule)throw new Error('ARC_INVALID_ARGUMENTS');
  if(input.schedule&&(input.schedule.type==='once')!==(work.schedule.type==='once'))throw new Error('ARC_INVALID_SCHEDULE');
  if(input.instructions)work.instructions=await seal(env,input.instructions,`arc-work:${run.user_id}:${row.id}`);
  if(input.schedule)work.schedule=input.schedule;
 }
 const goal=JSON.parse(row.goal_json!);goal.native_arc=work;
 const status=input.action==='cancel'?'cancelled':input.action==='pause'?'paused':input.action==='resume'?'waiting':row.status;
 const next=['paused','cancelled'].includes(status)?null:input.action==='resume'||input.schedule?nextArcOccurrence(work.schedule,new Date()):row.next_run_at;
 const now=stamp();
 const result=await env.DB.batch([
  env.DB.prepare(`UPDATE automations SET status=?1,next_run_at=?2,goal_json=?3,lease_token=NULL,lease_until=NULL,revision=revision+1,updated_at=?4 WHERE id=?5 AND user_id=?6 AND revision=?7 RETURNING id`).bind(status,next,JSON.stringify(goal),now,row.id,run.user_id,row.revision),
  env.DB.prepare(`UPDATE arc_chat_runs SET cancel_requested=1,status='cancelled',updated_at=?1 WHERE automation_id=?2 AND user_id=?3 AND status IN ('queued','thinking','working') AND EXISTS(SELECT 1 FROM automations WHERE id=?2 AND status IN ('paused','cancelled'))`).bind(now,row.id,run.user_id),
 ]);
 if(!result[0]?.meta.changes)throw new Error('ARC_WORK_CHANGED');
 return{id:row.id,status,nextRunAt:next};
}
export async function arcSessionWork(env:ArcEnv,userId:string,sessionId?:string){
 const rows=(await env.DB.prepare(`SELECT a.*,s.id conversation_id,r.id latest_run_id,r.status latest_run_status,r.error_code latest_run_error,r.created_at latest_run_at FROM automations a LEFT JOIN arc_chat_sessions s ON s.id=a.id AND s.user_id=a.user_id AND s.deleted_at IS NULL LEFT JOIN arc_chat_runs r ON r.id=(SELECT id FROM arc_chat_runs WHERE automation_id=a.id AND user_id=a.user_id ORDER BY created_at DESC,id DESC LIMIT 1) WHERE a.user_id=?1 AND json_extract(a.goal_json,'$.native_arc.version')=1 AND (?2 IS NULL OR a.id=?2 OR json_extract(a.goal_json,'$.native_arc.originSessionId')=?2) ORDER BY a.updated_at DESC LIMIT 100`).bind(userId,sessionId??null).all<AutomationRow&{conversation_id:string|null;latest_run_id:string|null;latest_run_status:string|null;latest_run_error:string|null;latest_run_at:string|null}>()).results;
 return rows.map(row=>{const native=nativeArcWork(row.goal_json)!;return{id:row.id,name:row.name,status:row.status,kind:native.schedule.type==='once'?'task':'routine',schedule:native.schedule,nextRunAt:row.next_run_at,runCount:row.run_count,error:row.last_error,conversationId:row.conversation_id,originSessionId:native.originSessionId,updatedAt:row.updated_at,latestRun:row.latest_run_id?{id:row.latest_run_id,status:row.latest_run_status,error:row.latest_run_error,createdAt:row.latest_run_at}:null};});
}
export async function listArcWork(env:ArcEnv,userId:string){
 const work=await arcSessionWork(env,userId);
 const runs=(await env.DB.prepare(`SELECT r.id,r.session_id,r.status,r.step,r.tokens_used,r.error_code,r.created_at,r.automation_id,s.title_ciphertext FROM arc_chat_runs r JOIN arc_chat_sessions s ON s.id=r.session_id AND s.user_id=r.user_id AND s.deleted_at IS NULL WHERE r.user_id=?1 AND NOT EXISTS(SELECT 1 FROM arc_team_rooms WHERE session_id=r.session_id) ORDER BY r.created_at DESC LIMIT 100`).bind(userId).all<{id:string;session_id:string;title_ciphertext:string}>()).results;
 return{work,runs:await Promise.all(runs.map(async({title_ciphertext,...run})=>({...run,title:await unseal<string>(env,title_ciphertext,arcContext(userId,run.session_id))})))};
}
type Save=(status:AutomationStatus,next:string|null,error:string|null,done?:boolean)=>Promise<void>;
/** Uses the existing scheduler lease and run journal. Each cycle has exactly one
 * persisted chat run; a lost alarm or response never starts a second cycle. */
export async function tickNativeArcWork(env:ArcEnv,task:AutomationRow,state:RuntimeState,save:Save,finish:(status:string,error:string|null)=>Promise<void>){
 const work=nativeArcWork(task.goal_json)!;
 const runId=state.run_id!;let run=await env.DB.prepare('SELECT * FROM arc_chat_runs WHERE id=?1 AND user_id=?2').bind(runId,task.user_id).first<ArcRun>();
 if(!run){
   await requireArcAccess(env,task.user_id);const plan=await currentArcPlan(env,task.user_id);
  const now=stamp(),messageId=runId+':user',text=await unseal<string>(env,work.instructions,`arc-work:${task.user_id}:${task.id}`);
  const guard=`EXISTS(SELECT 1 FROM automations WHERE id=?9 AND user_id=?2 AND lease_token=?10 AND lease_until>?5 AND status IN ('waiting','running'))`;
  await env.DB.batch([
   env.DB.prepare(`INSERT OR IGNORE INTO arc_chat_sessions(id,user_id,organization_id,title_ciphertext,model_id,created_at,updated_at,automation_id) SELECT ?1,?2,?3,?4,?6,?5,?5,?9 WHERE ${guard}`).bind(task.id,task.user_id,'personal:'+task.user_id,await seal(env,task.name,arcContext(task.user_id,task.id)),now,work.modelId,null,null,task.id,task.lease_token),
    env.DB.prepare(`INSERT OR IGNORE INTO arc_chat_runs(id,session_id,user_id,request_id,input_hash,model_id,status,max_tokens,max_steps,deadline,created_at,updated_at,automation_id) SELECT ?1,?3,?2,?4,?6,?7,'queued',?11,?12,?8,?5,?5,?9 WHERE ${guard} AND (SELECT COUNT(*) FROM arc_chat_runs WHERE user_id=?2 AND status IN ('queued','thinking','working'))<?13`).bind(runId,task.user_id,task.id,'work-'+runId,now,await sha256Hex(text),work.modelId,new Date(Date.now()+plan.maxSeconds*1000).toISOString(),task.id,task.lease_token,plan.maxTokens,plan.maxSteps,plan.concurrentRuns),
   env.DB.prepare(`INSERT OR IGNORE INTO arc_chat_messages(id,session_id,user_id,run_id,role,body_ciphertext,created_at) SELECT ?1,?2,?3,?4,'user',?5,?6 WHERE EXISTS(SELECT 1 FROM arc_chat_runs WHERE id=?4)`).bind(messageId,task.id,task.user_id,runId,await seal(env,{text},arcContext(task.user_id,messageId)),now),
  ]);
  run=await env.DB.prepare('SELECT * FROM arc_chat_runs WHERE id=?1 AND user_id=?2').bind(runId,task.user_id).first<ArcRun>();
  if(!run){await save('waiting',new Date(Date.now()+60000).toISOString(),null);return;}
 }
 if(['queued','thinking','working'].includes(run.status)){
  if(Date.parse(run.deadline)<=Date.now()){
   await env.DB.prepare(`UPDATE arc_chat_runs SET status='unknown',error_code='ARC_INTERRUPTED_CHECK_RESULTS',updated_at=?1 WHERE id=?2 AND status IN ('queued','thinking','working')`).bind(stamp(),runId).run();
  }else{
   await wakeArcRun(env,runId);await save('running',new Date(Date.now()+60000).toISOString(),null);return;
  }
 }
 run=(await env.DB.prepare('SELECT * FROM arc_chat_runs WHERE id=?1').bind(runId).first<ArcRun>())!;
 const succeeded=run.status==='succeeded',summary=(await arcMessages(env,task.user_id,task.id)).filter(m=>m.run_id===runId&&m.role==='assistant').at(-1)?.text||'';
 await env.DB.prepare('UPDATE automation_runs SET output_summary=?1 WHERE id=?2 AND user_id=?3').bind(summary.slice(0,6000),runId,task.user_id).run();
 await finish(succeeded?'completed':'failed',succeeded?null:run.error_code||'ARC_EXECUTION_FAILED');state.run_id=undefined;
 const repeat=succeeded&&work.schedule.type!=='once'&&task.run_count+1<task.max_runs;
 await save(repeat?'waiting':succeeded?'completed':'paused',repeat?nextArcOccurrence(work.schedule,new Date()):null,succeeded?null:run.error_code||'ARC_EXECUTION_FAILED',true);
}
