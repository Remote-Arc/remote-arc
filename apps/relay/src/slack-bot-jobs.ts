import { randomToken, sha256Hex } from './auth.js';
import { arcActive, arcMessages, arcRuntime, createArcConversation, submitArcMessage, wakeArcRun, type ArcRun } from './arc-chat.js';
import { seal, unseal } from './app-oauth.js';
import {arcAccountAccess} from './arc-trial.js';
import { markdownToSlack, fitSlackText } from './slack-format.js';
import { slackApi, slackDashboard, slackInstallation, slackJobContext, slackReady, slackStamp, SlackBotError, type SlackBotEnv, type SlackJob, type BotInstallation } from './slack-bot-common.js';

/** Quick answers arrive as a single message; slower ones show one notice first. */
export const SLACK_PROGRESS_AFTER_MS=15_000;
const encodeSlack=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const slackLink=(url:string,label:string)=>'<'+encodeSlack(url)+'|'+label+'>';
const chinese=(text:string)=>/[㐀-鿿]/u.test(text);
const timeAfter=(seconds:number)=>new Date(Date.now()+seconds*1000).toISOString();
const plainText={parse:'none',link_names:false,unfurl_links:false,unfurl_media:false};
const notices={
 progress:(zh:boolean,web:string)=>zh?'还在处理，完成后会直接在这里回复你。'+slackLink(web,'查看进度'):'Still working on it. I’ll reply here when it’s done. '+slackLink(web,'View progress'),
 connection:(zh:boolean,web:string)=>zh?'需要先在 Remote Arc 连接所需的账号，连接后会继续。'+slackLink(web,'去连接'):'Connect the required account in Remote Arc to continue this task. '+slackLink(web,'Connect account'),
};
async function saveJob(env:SlackBotEnv,job:SlackJob,status:string,values:{error?:string;delay?:number}={}){
 await env.DB.prepare('UPDATE slack_arc_events SET status=?1,last_error=?2,next_attempt_at=?3,updated_at=?4,lease=NULL,lease_until=NULL WHERE id=?5 AND lease=?6')
  .bind(status,values.error||null,timeAfter(values.delay||15),slackStamp(),job.id,job.lease).run();
}
async function linkedOwner(env:SlackBotEnv,job:SlackJob){
 return env.DB.prepare("SELECT user_id FROM slack_arc_links WHERE team_id=?1 AND slack_user_id=?2 AND status='active'").bind(job.team_id,job.slack_user_id).first<{user_id:string}>();
}
async function replyChannel(env:SlackBotEnv,job:SlackJob,installation:BotInstallation,fetcher:typeof fetch){
 // All inference results are sent privately. A channel mention never widens the
 // audience of the initiating user's connected Apps, computers or memories.
 if(job.reply_channel)return job.reply_channel;
 if(job.event_type==='message')return job.reply_channel=job.channel_id!;
 const opened=await slackApi(env,installation,'conversations.open',{users:job.slack_user_id},fetcher);
 if(typeof opened.channel?.id!=='string')throw new SlackBotError('slack_channel_unavailable');
 return job.reply_channel=opened.channel.id as string;
}
const threading=(job:SlackJob)=>job.event_type==='message'&&job.thread_ts?{thread_ts:job.thread_ts}:{};
async function nativeStatus(env:SlackBotEnv,job:SlackJob,installation:BotInstallation,status:string,fetcher:typeof fetch){
 if(job.event_type!=='message'||!job.source_ts||!job.channel_id)return;
 try{await slackApi(env,installation,'assistant.threads.setStatus',{channel_id:job.channel_id,thread_ts:job.thread_ts||job.source_ts,status},fetcher,1500);}
 catch{/* Cosmetic hint; the progress notice is the durable fallback. */}
}
/** The one final message for a job: an answer, a blocker or account instructions. */
async function deliver(env:SlackBotEnv,job:SlackJob,installation:BotInstallation,text:string,finalStatus:string,fetcher:typeof fetch,errorCode?:string){
 const channel=await replyChannel(env,job,installation,fetcher);
 const fresh=await slackInstallation(env,job.team_id);if(!fresh)throw new SlackBotError('slack_installation_revoked');
 if(job.user_id&&job.delivery_kind!=='account'){
  const owner=await linkedOwner(env,job);if(owner?.user_id!==job.user_id)throw new SlackBotError('slack_link_revoked');
 }
 const cipher=await seal(env,text,slackJobContext(job.id,'reply'));
 const claimed=await env.DB.prepare("UPDATE slack_arc_events SET status='replying',reply_channel=?1,reply_ciphertext=?2,updated_at=?3 WHERE id=?4 AND lease=?5 AND lease_until>?3 RETURNING id").bind(channel,cipher,slackStamp(),job.id,job.lease).first();
 if(!claimed)return;
 // A new message notifies the user; an edit would not. A known reply_ts only
 // survives a crash between posting and journalling, where an update is safe.
 const result=await slackApi(env,fresh,job.reply_ts?'chat.update':'chat.postMessage',{channel,...(job.reply_ts?{ts:job.reply_ts}:threading(job)),text,...plainText},fetcher);
 if(typeof result.ts!=='string')throw new SlackBotError('slack_delivery_unknown',0,true);
 job.reply_ts=result.ts;
 // Journal the message and its final state together so recovery never reposts it.
 await env.DB.prepare('UPDATE slack_arc_events SET reply_ts=?1,delivery_kind=?2,status=?3,last_error=?4,next_attempt_at=?5,updated_at=?6,lease=NULL,lease_until=NULL WHERE id=?7 AND lease=?8')
  .bind(result.ts,job.delivery_kind||'result',finalStatus,errorCode||null,timeAfter(15),slackStamp(),job.id,job.lease).run();
 if(job.progress_ts){
  try{await slackApi(env,fresh,'chat.delete',{channel,ts:job.progress_ts},fetcher,3000);}catch{/* The answer is delivered; a stale notice is harmless. */}
 }
 if(finalStatus==='delivered'||finalStatus==='blocked')await nativeStatus(env,job,installation,'',fetcher);
}
/** At most one interim notice per job, upgraded in place (progress → connection). */
async function notify(env:SlackBotEnv,job:SlackJob,installation:BotInstallation,kind:'progress'|'connection',text:string,fetcher:typeof fetch){
 if(job.progress_kind===kind||job.progress_ts==='')return;
 let channel:string;try{channel=await replyChannel(env,job,installation,fetcher);}catch{return;}
 if(job.progress_ts){
  try{await slackApi(env,installation,'chat.update',{channel,ts:job.progress_ts,text,...plainText},fetcher);}catch{return;}
  job.progress_kind=kind;
  await env.DB.prepare('UPDATE slack_arc_events SET progress_kind=?1 WHERE id=?2 AND lease=?3').bind(kind,job.id,job.lease).run();
  return;
 }
 // Claim before posting. If Slack's acknowledgement is lost the outcome stays
 // unknown ('') and is never retried, so a notice can never be duplicated.
 const claimed=await env.DB.prepare("UPDATE slack_arc_events SET progress_ts='',progress_kind=?1,reply_channel=?2,updated_at=?3 WHERE id=?4 AND lease=?5 AND lease_until>?3 AND progress_ts IS NULL RETURNING id").bind(kind,channel,slackStamp(),job.id,job.lease).first();
 if(!claimed)return;
 job.progress_ts='';job.progress_kind=kind;
 try{
  const result=await slackApi(env,installation,'chat.postMessage',{channel,...threading(job),text,...plainText},fetcher);
  if(typeof result.ts==='string'){job.progress_ts=result.ts;await env.DB.prepare('UPDATE slack_arc_events SET progress_ts=?1 WHERE id=?2 AND lease=?3').bind(result.ts,job.id,job.lease).run();}
 }catch{/* A notice is best effort; the final reply never depends on it. */}
}
const blocker=(code:string,zh=false)=>{
 const say=(en:string,cn:string)=>zh?cn:en;
 if(/ARC_TRIAL_REQUIRED/.test(code))return say('Start your Arc trial in Remote Arc before asking me to reason or run tasks.','请先在 Remote Arc 开启 Arc 试用，我才能帮你思考和执行任务。');
 if(/ARC_TRIAL_EXPIRED/.test(code))return say('Your Arc trial has ended. Choose an Arc plan to continue.','Arc 试用已结束，选择套餐后可以继续。');
 if(/CREDITS_EXHAUSTED/.test(code))return say('Your Arc Credits have run out, so this request has not started. Choose a plan or top up to continue.','你的 Arc Credits 已用完，这次请求没有开始。选择套餐或补充额度后可以继续。');
 if(/CREDIT|BUDGET|QUOTA|FUNDING|PAYMENT|PAID_MODEL/.test(code))return say('Your current Arc plan or allowance cannot run this request. Check your plan and credits in Remote Arc.','当前的 Arc 套餐或额度无法运行这次请求，请在 Remote Arc 查看套餐和 Credits。');
 if(/NOT_CONFIGURED|NOT_ALLOWED|NOT_ENABLED/.test(code))return say('Arc is currently unavailable for this account. Open Remote Arc to check availability.','此账号暂时无法使用 Arc，请打开 Remote Arc 查看。');
 return say('I could not start this request. Open Remote Arc to review your account and try again.','这次请求没能开始，请打开 Remote Arc 查看账号后再试。');
};
async function processJob(env:SlackBotEnv,job:SlackJob,fetcher:typeof fetch){
 const installation=await slackInstallation(env,job.team_id);if(!installation){await saveJob(env,job,'blocked',{error:'slack_installation_revoked'});return;}
 const input=await unseal<{text:string;kind:string}>(env,job.body_ciphertext,slackJobContext(job.id));
 const owner=await linkedOwner(env,job),userId=owner?.user_id;
 if(job.run_id&&job.user_id!==userId){await saveJob(env,job,'blocked',{error:'slack_link_revoked'});return;}
 if(!userId){
  const code=randomToken();await env.DB.prepare('INSERT INTO slack_arc_link_requests(code_hash,team_id,slack_user_id,event_id,expires_at) VALUES(?1,?2,?3,?4,?5)').bind(await sha256Hex(code),job.team_id,job.slack_user_id,job.id,timeAfter(600)).run();
  job.delivery_kind='link';
  await deliver(env,job,installation,'Connect your own Remote Arc account to continue this request:\n'+slackLink(slackDashboard(env)+'/slack/link?code='+code,'Connect your Remote Arc account')+'\nYour plan, credits and permissions apply. This link expires in 10 minutes.','awaiting_link',fetcher);return;
 }
 job.user_id=userId;
 await env.DB.prepare('UPDATE slack_arc_events SET user_id=?1 WHERE id=?2 AND lease=?3').bind(userId,job.id,job.lease).run();
 if(job.reply_ts&&(job.delivery_kind==='progress'||job.delivery_kind==='connection')){
  // Jobs acknowledged before notices had their own columns kept the receipt as
  // the reply. Treat it as the notice, so the answer still arrives as a new message.
  job.progress_ts=job.reply_ts;job.progress_kind=job.delivery_kind;job.reply_ts=null;job.delivery_kind=null;
  await env.DB.prepare('UPDATE slack_arc_events SET progress_ts=?1,progress_kind=?2,reply_ts=NULL,delivery_kind=NULL WHERE id=?3 AND lease=?4').bind(job.progress_ts,job.progress_kind,job.id,job.lease).run();
 }
 const key=await sha256Hex(JSON.stringify([job.team_id,job.slack_user_id,userId,job.channel_id,job.thread_ts||'dm'])),sessionId='slack-'+key.slice(0,48);
 if(/^(?:\/)?(?:stop|cancel|停止|取消)$/i.test(input.text.trim())){
  await env.DB.batch([
   env.DB.prepare("UPDATE arc_chat_runs SET status='cancelled',cancel_requested=1,updated_at=?1 WHERE user_id=?2 AND session_id=?3 AND status IN ('queued','thinking','working')").bind(slackStamp(),userId,sessionId),
   env.DB.prepare("UPDATE arc_app_connection_requests SET status='cancelled',updated_at=?1 WHERE user_id=?2 AND source_run_id IN (SELECT id FROM arc_chat_runs WHERE session_id=?3 AND user_id=?2) AND status='pending'").bind(slackStamp(),userId,sessionId),
  ]);job.delivery_kind='account';await deliver(env,job,installation,'Stopped further steps in this conversation. Any action already dispatched remains visible in Remote Arc.','delivered',fetcher);return;
 }
 if(/^(?:\/)?(?:unlink|disconnect|解除关联)$/i.test(input.text.trim())){
  await env.DB.batch([
   env.DB.prepare("UPDATE slack_arc_links SET status='revoked',updated_at=?1 WHERE team_id=?2 AND slack_user_id=?3 AND user_id=?4").bind(slackStamp(),job.team_id,job.slack_user_id,userId),
   env.DB.prepare("UPDATE arc_chat_runs SET status='cancelled',cancel_requested=1,updated_at=?1 WHERE user_id=?2 AND status IN ('queued','thinking','working') AND id IN (SELECT run_id FROM slack_arc_events WHERE team_id=?3 AND slack_user_id=?4 AND user_id=?2)").bind(slackStamp(),userId,job.team_id,job.slack_user_id),
  ]);job.delivery_kind='account';await deliver(env,job,installation,'Your Remote Arc account is disconnected from this Slack identity. Send another message when you want to link again.','delivered',fetcher);return;
 }
 if(!job.run_id&&Date.parse(job.created_at)<Date.now()-86400000){
  job.delivery_kind='blocker';await deliver(env,job,installation,'This request has expired. Send a new message to continue.','delivered',fetcher);return;
 }
 const zh=chinese(input.text),slow=Date.now()-Date.parse(job.created_at)>=SLACK_PROGRESS_AFTER_MS;
 const web=slackDashboard(env)+'/dashboard/agent/chat?session='+encodeURIComponent(sessionId);
 // Slack's own "is working" indicator is the immediate acknowledgement. No
 // message is posted up front: a quick answer arrives alone, as a new message.
 if(!job.run_id)await nativeStatus(env,job,installation,zh?'正在处理你的请求…':'is checking your request…',fetcher);
 if(!job.run_id){
  const admitted=await env.DB.prepare('SELECT id FROM arc_chat_runs WHERE user_id=?1 AND request_id=?2').bind(userId,'slack:'+job.id).first<{id:string}>();
  if(admitted){job.run_id=admitted.id;await env.DB.prepare('UPDATE slack_arc_events SET run_id=?1 WHERE id=?2 AND lease=?3').bind(admitted.id,job.id,job.lease).run();}
 }
 let started=false;
 if(!job.run_id){
  const earlier=await env.DB.prepare(`SELECT id FROM slack_arc_events WHERE team_id=?1 AND slack_user_id=?2 AND channel_id=?3 AND COALESCE(thread_ts,'')=COALESCE(?4,'') AND id<>?5
    AND status IN ('pending','processing','replying','waiting_run') AND (created_at<?6 OR (created_at=?6 AND id<?5)) LIMIT 1`).bind(job.team_id,job.slack_user_id,job.channel_id,job.thread_ts,job.id,job.created_at).first();
  if(earlier){if(slow)await notify(env,job,installation,'progress',notices.progress(zh,web),fetcher);await saveJob(env,job,'pending',{delay:15});return;}
  // Check that the initiating Slack member still exists; workspace installation
  // ownership provides no authority over the user's private Arc account.
  try{
   const member=await slackApi(env,installation,'users.info',{user:job.slack_user_id},fetcher);
   if(member.user?.deleted||member.user?.is_bot||member.user?.id!==job.slack_user_id)throw new SlackBotError('slack_user_inactive');
  }catch(error){
   if(!(error instanceof SlackBotError)||!['slack_user_not_found','slack_user_inactive','slack_missing_scope'].includes(error.code))throw error;
   job.delivery_kind='blocker';
   await deliver(env,job,installation,'I couldn’t verify your Slack workspace identity, so this request has not started. Check the Remote Arc Slack connection and try again.\n'+slackLink(slackDashboard(env)+'/apps','Check Slack connection'),'blocked',fetcher,error.code);
   return;
  }
  try{
   await createArcConversation(env,userId,sessionId,'Slack · '+input.text.slice(0,48));
   await env.DB.prepare('INSERT OR IGNORE INTO slack_arc_conversations(id,team_id,slack_user_id,user_id,channel_id,thread_key,session_id) VALUES(?1,?2,?3,?4,?5,?6,?7)').bind(key,job.team_id,job.slack_user_id,userId,job.channel_id,job.thread_ts||'dm',sessionId).run();
   const access=await arcAccountAccess(env,userId),preference=await env.DB.prepare('SELECT model_id FROM slack_arc_preferences WHERE user_id=?1').bind(userId).first<{model_id:string}>();
   const run=await submitArcMessage(env,userId,sessionId,{requestId:'slack:'+job.id,text:input.text,modelId:access.paid&&access.premium?preference?.model_id||'auto':'auto'});
   job.run_id=run.id;started=true;
   await env.DB.prepare('UPDATE slack_arc_events SET run_id=?1 WHERE id=?2 AND lease=?3').bind(run.id,job.id,job.lease).run();
  }catch(error){
   const code=error instanceof Error?error.message:'ARC_EXECUTION_FAILED';
   if(['CHAT_BUSY_OR_LIMIT_REACHED','CHAT_START_UNAVAILABLE'].includes(code)){if(slow)await notify(env,job,installation,'progress',notices.progress(zh,web),fetcher);await saveJob(env,job,'pending',{error:code,delay:15});return;}
   job.delivery_kind='blocker';await deliver(env,job,installation,blocker(code,chinese(input.text))+'\n'+slackLink(slackDashboard(env)+(/CREDIT|BUDGET|QUOTA|TRIAL|PAID/.test(code)?'/checkout':'/dashboard/agent/settings'),chinese(input.text)?'在 Remote Arc 中查看':'Open in Remote Arc'),'delivered',fetcher);return;
  }
 }
 const run=await env.DB.prepare('SELECT * FROM arc_chat_runs WHERE id=?1 AND user_id=?2').bind(job.run_id,userId).first<ArcRun>();
 if(!run)throw new SlackBotError('slack_run_unavailable');
 if(arcActive(run.status)){
  // submitArcMessage has already woken a run it just admitted.
  if(run.status==='queued'&&!started)await wakeArcRun(env,run.id);
  const waiting=await env.DB.prepare("SELECT id FROM arc_app_connection_requests WHERE source_run_id=?1 AND user_id=?2 AND status='pending' LIMIT 1").bind(run.id,userId).first();
  if(waiting)await notify(env,job,installation,'connection',notices.connection(zh,web),fetcher);
  else if(slow)await notify(env,job,installation,'progress',notices.progress(zh,web),fetcher);
  // The run's own completion warms this job; the short delay is only for the cron backstop.
  await saveJob(env,job,'waiting_run',{delay:2});
  return;
 }
 const journal=await arcMessages(env,userId,run.session_id,run.id),answer=journal.filter(message=>message.role==='assistant'&&message.text).at(-1)?.text;
 // A finished answer stands on its own in Slack. The dashboard link is kept only
 // for outcomes the user should review there.
 const review=slackLink(web,zh?'在 Remote Arc 中查看':'Open in Remote Arc');
 const text=run.status==='succeeded'&&answer?fitSlackText(markdownToSlack(answer),3400,zh?'（回答较长，完整内容请在 Remote Arc 查看）':'(Shortened here; the full answer is in Remote Arc.)'):(run.status==='cancelled'?(zh?'这次请求已停止。':'This request was stopped.'):run.status==='unknown'?(zh?'有一个操作可能已经完成，但我没能确认结果。重试前请先在 Remote Arc 中核对。':'An action may have completed, but I could not confirm its result. Review the task before retrying.'):blocker(run.error_code||'ARC_EXECUTION_FAILED',zh))+'\n\n'+review;
 job.delivery_kind='result';await deliver(env,job,installation,text,'delivered',fetcher);
}

/** Bounded durable queue; ingress and Arc completion warm it, cron recovers it. */
export async function runSlackJobs(env:SlackBotEnv,options:{runId?:string;eventId?:string;fetcher?:typeof fetch;limit?:number}={}){
 if(!slackReady(env))return;
 const now=slackStamp();
 // An unacknowledged first post is never blindly repeated. Updating an already
 // known Slack message is idempotent and safe to recover after a crash.
 await env.DB.prepare("UPDATE slack_arc_events SET status=CASE WHEN reply_ts IS NULL THEN 'unknown' ELSE 'waiting_run' END,last_error='slack_delivery_interrupted',lease=NULL,lease_until=NULL WHERE status='replying' AND lease_until<=?1").bind(now).run();
 // A targeted wake (a run finishing, an event's own runtime) is due by definition;
 // only the cron sweep waits for next_attempt_at.
 const rows=(await env.DB.prepare(`SELECT e.* FROM slack_arc_events e WHERE e.status IN ('pending','processing','waiting_run') AND (e.lease_until IS NULL OR e.lease_until<=?1) AND (e.next_attempt_at<=?1 OR ?2 IS NOT NULL OR ?4 IS NOT NULL)
  AND (?2 IS NULL OR e.run_id=?2) AND (?4 IS NULL OR e.id=?4) ORDER BY e.created_at,e.id LIMIT ?3`).bind(now,options.runId||null,Math.min(10,options.limit||5),options.eventId||null).all<SlackJob>()).results;
 for(const row of rows){
  const lease=randomToken(16),claimed=await env.DB.prepare("UPDATE slack_arc_events SET status='processing',lease=?1,lease_until=?2,attempts=attempts+1,updated_at=?3 WHERE id=?4 AND status IN ('pending','processing','waiting_run') AND (lease_until IS NULL OR lease_until<=?3) RETURNING id").bind(lease,timeAfter(90),slackStamp(),row.id).first();
  if(!claimed)continue;const job={...row,lease};
  try{await processJob(env,job,options.fetcher||fetch);}
  catch(error){
   const known=error instanceof SlackBotError;
   if(known&&error.retryAfter){await saveJob(env,job,job.run_id?'waiting_run':'pending',{error:error.code,delay:error.retryAfter});continue;}
   // Failure during a known-message update can safely retry; an uncertain
   // first post must retain its journal without duplicating an external write.
   await saveJob(env,job,known&&error.uncertain&&job.reply_ts?'waiting_run':known&&error.uncertain?'unknown':'blocked',{error:known?error.code:'slack_processing_failed',delay:30});
  }
 }
 await env.DB.prepare('DELETE FROM slack_arc_link_requests WHERE expires_at<=?1').bind(now).run();
 await env.DB.prepare("DELETE FROM slack_arc_events WHERE id IN (SELECT id FROM slack_arc_events WHERE status IN ('delivered','awaiting_link','unknown','blocked','expired') AND updated_at<?1 LIMIT 100)").bind(new Date(Date.now()-30*86400000).toISOString()).run();
}

/**
 * One pass for a single event, as its runtime object runs it. Returns when the
 * event next needs attention (epoch ms), or null once nothing is left to do here.
 */
export async function driveSlackEvent(env:SlackBotEnv,eventId:string,fetcher?:typeof fetch):Promise<number|null>{
 await runSlackJobs(env,{eventId,limit:1,fetcher});
 const job=await env.DB.prepare('SELECT e.status,e.next_attempt_at,e.lease_until,e.created_at,e.progress_ts,r.status run_status FROM slack_arc_events e LEFT JOIN arc_chat_runs r ON r.id=e.run_id WHERE e.id=?1')
  .bind(eventId).first<{status:string;next_attempt_at:string;lease_until:string|null;created_at:string;progress_ts:string|null;run_status:string|null}>();
 if(!job)return null;
 const now=Date.now(),progressAt=job.progress_ts===null?Date.parse(job.created_at)+SLACK_PROGRESS_AFTER_MS:Infinity;
 // Another worker holds the lease; look again once it is due or the notice is.
 if(job.status==='processing'||job.status==='replying')return Math.max(now+2000,Math.min(Date.parse(job.lease_until||'')||now,progressAt));
 if(job.status==='pending')return Math.max(now+1000,Math.min(Date.parse(job.next_attempt_at),progressAt));
 if(job.status!=='waiting_run')return null;
 // The run's own completion delivers the answer. This only covers a completion
 // that raced with this pass's lease, and the progress notice of a slow run.
 if(job.run_status&&!arcActive(job.run_status))return Math.max(now+1000,Date.parse(job.next_attempt_at));
 return progressAt===Infinity?null:Math.max(now,progressAt);
}

/**
 * Process an event beside the D1 primary. Slack calls in from North America and
 * a pass makes ~20 sequential queries, which cost ~10s per message when they ran
 * in the ingress isolate. Processing inline remains the fallback.
 */
export async function wakeSlackJob(env:SlackBotEnv,eventId:string,fetcher?:typeof fetch){
 if(env.ARC_RUNTIME)try{
  const response=await arcRuntime(env,'slack-'+eventId).fetch('https://arc/slack',{method:'POST',body:JSON.stringify({eventId})});
  if(response.ok)return;
 }catch{/* Fall back to processing in this isolate. */}
 await runSlackJobs(env,{eventId,limit:1,fetcher});
}
