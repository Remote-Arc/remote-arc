import { randomToken, sha256Hex } from './auth.js';
import { arcActive, arcMessages, createArcConversation, submitArcMessage, wakeArcRun, type ArcRun } from './arc-chat.js';
import { seal, unseal } from './app-oauth.js';
import {arcAccountAccess} from './arc-trial.js';
import { slackApi, slackDashboard, slackInstallation, slackJobContext, slackReady, slackStamp, SlackBotError, type SlackBotEnv, type SlackJob, type BotInstallation } from './slack-bot-common.js';

const encodeSlack=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const timeAfter=(seconds:number)=>new Date(Date.now()+seconds*1000).toISOString();
async function saveJob(env:SlackBotEnv,job:SlackJob,status:string,values:{error?:string;delay?:number}={}){
 await env.DB.prepare('UPDATE slack_arc_events SET status=?1,last_error=?2,next_attempt_at=?3,updated_at=?4,lease=NULL,lease_until=NULL WHERE id=?5 AND lease=?6')
  .bind(status,values.error||null,timeAfter(values.delay||15),slackStamp(),job.id,job.lease).run();
}
async function linkedOwner(env:SlackBotEnv,job:SlackJob){
 return env.DB.prepare("SELECT user_id FROM slack_arc_links WHERE team_id=?1 AND slack_user_id=?2 AND status='active'").bind(job.team_id,job.slack_user_id).first<{user_id:string}>();
}
async function deliver(env:SlackBotEnv,job:SlackJob,installation:BotInstallation,text:string,finalStatus:string,fetcher:typeof fetch,errorCode?:string){
 // All inference results are sent privately. A channel mention never widens the
 // audience of the initiating user's connected Apps, computers or memories.
 if(!job.reply_channel){
  if(job.event_type==='message')job.reply_channel=job.channel_id;
  else{const opened=await slackApi(env,installation,'conversations.open',{users:job.slack_user_id},fetcher);if(typeof opened.channel?.id!=='string')throw new SlackBotError('slack_channel_unavailable');job.reply_channel=opened.channel.id;}
 }
 const fresh=await slackInstallation(env,job.team_id);if(!fresh)throw new SlackBotError('slack_installation_revoked');
 if(job.user_id&&job.delivery_kind!=='account'){
  const owner=await linkedOwner(env,job);if(owner?.user_id!==job.user_id)throw new SlackBotError('slack_link_revoked');
 }
 const cipher=await seal(env,text,slackJobContext(job.id,'reply'));
 const claimed=await env.DB.prepare("UPDATE slack_arc_events SET status='replying',reply_channel=?1,reply_ciphertext=?2,updated_at=?3 WHERE id=?4 AND lease=?5 AND lease_until>?3 RETURNING id").bind(job.reply_channel,cipher,slackStamp(),job.id,job.lease).first();
 if(!claimed)return;
 const method=job.reply_ts?'chat.update':'chat.postMessage';
 const result=await slackApi(env,fresh,method,{channel:job.reply_channel,...(job.reply_ts?{ts:job.reply_ts}:job.event_type==='message'&&job.thread_ts?{thread_ts:job.thread_ts}:{}),text,parse:'none',link_names:false,unfurl_links:false,unfurl_media:false},fetcher);
 if(typeof result.ts!=='string')throw new SlackBotError('slack_delivery_unknown',0,true);
 job.reply_ts=result.ts;
 await env.DB.prepare('UPDATE slack_arc_events SET reply_ts=?1,delivery_kind=?2 WHERE id=?3 AND lease=?4').bind(result.ts,job.delivery_kind||'result',job.id,job.lease).run();
 await saveJob(env,job,finalStatus,{error:errorCode});
}
const blocker=(code:string)=>{
 if(/ARC_TRIAL_REQUIRED/.test(code))return 'Start your Arc trial in Remote Arc before asking me to reason or run tasks.';
 if(/ARC_TRIAL_EXPIRED/.test(code))return 'Your Arc trial has ended. Choose an Arc plan to continue.';
 if(/CREDIT|BUDGET|FUNDING|PAYMENT|PAID_MODEL/.test(code))return 'Your current Arc plan or allowance cannot run this request. Check your plan and credits in Remote Arc.';
 if(/NOT_CONFIGURED|NOT_ALLOWED|NOT_ENABLED/.test(code))return 'Arc is currently unavailable for this account. Open Remote Arc to check availability.';
 return 'I could not start this request. Open Remote Arc to review your account and try again.';
};
async function processJob(env:SlackBotEnv,job:SlackJob,fetcher:typeof fetch){
 const installation=await slackInstallation(env,job.team_id);if(!installation){await saveJob(env,job,'blocked',{error:'slack_installation_revoked'});return;}
 const input=await unseal<{text:string;kind:string}>(env,job.body_ciphertext,slackJobContext(job.id));
 const owner=await linkedOwner(env,job),userId=owner?.user_id;
 if(job.run_id&&job.user_id!==userId){await saveJob(env,job,'blocked',{error:'slack_link_revoked'});return;}
 if(!userId){
  const code=randomToken();await env.DB.prepare('INSERT INTO slack_arc_link_requests(code_hash,team_id,slack_user_id,event_id,expires_at) VALUES(?1,?2,?3,?4,?5)').bind(await sha256Hex(code),job.team_id,job.slack_user_id,job.id,timeAfter(600)).run();
  job.delivery_kind='link';
  await deliver(env,job,installation,'Connect your own Remote Arc account to continue this request:\n<'+encodeSlack(slackDashboard(env)+'/slack/link?code='+code)+'|Connect your Remote Arc account>\nYour plan, credits and permissions apply. This link expires in 10 minutes.','awaiting_link',fetcher);return;
 }
 job.user_id=userId;
 await env.DB.prepare('UPDATE slack_arc_events SET user_id=?1 WHERE id=?2 AND lease=?3').bind(userId,job.id,job.lease).run();
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
 if(!job.run_id){
  const admitted=await env.DB.prepare('SELECT id FROM arc_chat_runs WHERE user_id=?1 AND request_id=?2').bind(userId,'slack:'+job.id).first<{id:string}>();
  if(admitted){job.run_id=admitted.id;await env.DB.prepare('UPDATE slack_arc_events SET run_id=?1 WHERE id=?2 AND lease=?3').bind(admitted.id,job.id,job.lease).run();}
 }
 if(!job.run_id){
  if(Date.parse(job.created_at)<Date.now()-86400000){await saveJob(env,job,'expired',{error:'slack_request_expired'});return;}
  const earlier=await env.DB.prepare(`SELECT id FROM slack_arc_events WHERE team_id=?1 AND slack_user_id=?2 AND channel_id=?3 AND COALESCE(thread_ts,'')=COALESCE(?4,'') AND id<>?5
    AND status IN ('pending','processing','replying','waiting_run') AND (created_at<?6 OR (created_at=?6 AND id<?5)) LIMIT 1`).bind(job.team_id,job.slack_user_id,job.channel_id,job.thread_ts,job.id,job.created_at).first();
  if(earlier){await saveJob(env,job,'pending',{delay:15});return;}
  // Check that the initiating Slack member still exists; workspace installation
  // ownership provides no authority over the user's private Arc account.
  try{
   const member=await slackApi(env,installation,'users.info',{user:job.slack_user_id},fetcher);
   if(member.user?.deleted||member.user?.is_bot||member.user?.id!==job.slack_user_id)throw new SlackBotError('slack_user_inactive');
  }catch(error){
   if(!(error instanceof SlackBotError)||!['slack_user_not_found','slack_user_inactive','slack_missing_scope'].includes(error.code))throw error;
   job.delivery_kind='blocker';
   await deliver(env,job,installation,'I couldn’t verify your Slack workspace identity, so this request has not started. Check the Remote Arc Slack connection and try again.\n<'+encodeSlack(slackDashboard(env)+'/apps')+'|Check Slack connection>','blocked',fetcher,error.code);
   return;
  }
  try{
   await createArcConversation(env,userId,sessionId,'Slack · '+input.text.slice(0,48));
   await env.DB.prepare('INSERT OR IGNORE INTO slack_arc_conversations(id,team_id,slack_user_id,user_id,channel_id,thread_key,session_id) VALUES(?1,?2,?3,?4,?5,?6,?7)').bind(key,job.team_id,job.slack_user_id,userId,job.channel_id,job.thread_ts||'dm',sessionId).run();
   const access=await arcAccountAccess(env,userId),preference=await env.DB.prepare('SELECT model_id FROM slack_arc_preferences WHERE user_id=?1').bind(userId).first<{model_id:string}>();
   const run=await submitArcMessage(env,userId,sessionId,{requestId:'slack:'+job.id,text:input.text,modelId:access.paid&&access.premium?preference?.model_id||'auto':'auto'});
   job.run_id=run.id;
   await env.DB.prepare('UPDATE slack_arc_events SET run_id=?1 WHERE id=?2 AND lease=?3').bind(run.id,job.id,job.lease).run();
  }catch(error){
   const code=error instanceof Error?error.message:'ARC_EXECUTION_FAILED';
   if(['CHAT_BUSY_OR_LIMIT_REACHED','CHAT_START_UNAVAILABLE'].includes(code)){await saveJob(env,job,'pending',{error:code,delay:15});return;}
   job.delivery_kind='blocker';await deliver(env,job,installation,blocker(code)+'\n'+slackDashboard(env)+'/dashboard/agent/settings','delivered',fetcher);return;
  }
 }
 const run=await env.DB.prepare('SELECT * FROM arc_chat_runs WHERE id=?1 AND user_id=?2').bind(job.run_id,userId).first<ArcRun>();
 if(!run)throw new SlackBotError('slack_run_unavailable');
 const web=slackDashboard(env)+'/dashboard/agent/chat?session='+encodeURIComponent(run.session_id);
 if(arcActive(run.status)){
  if(run.status==='queued')await wakeArcRun(env,run.id);
  const waiting=await env.DB.prepare("SELECT id FROM arc_app_connection_requests WHERE source_run_id=?1 AND user_id=?2 AND status='pending' LIMIT 1").bind(run.id,userId).first();
  if(!job.reply_ts||waiting&&job.delivery_kind!=='connection'){
   job.delivery_kind=waiting?'connection':'progress';await deliver(env,job,installation,(waiting?'Connect the required account in Remote Arc to continue this task.':'I’m working on your request. You can follow the task in Remote Arc.')+'\n'+web,'waiting_run',fetcher);
  }else await saveJob(env,job,'waiting_run');
  return;
 }
 const journal=await arcMessages(env,userId,run.session_id,run.id),answer=journal.filter(message=>message.role==='assistant'&&message.text).at(-1)?.text;
 const text=run.status==='succeeded'&&answer?encodeSlack(answer).slice(0,3400):run.status==='cancelled'?'This request was stopped.':run.status==='unknown'?'An action may have completed, but I could not confirm its result. Review the task before retrying.':blocker(run.error_code||'ARC_EXECUTION_FAILED');
 job.delivery_kind='result';await deliver(env,job,installation,text+'\n\n'+web,'delivered',fetcher);
}

/** Bounded durable queue; ingress and Arc completion warm it, cron recovers it. */
export async function runSlackJobs(env:SlackBotEnv,options:{runId?:string;fetcher?:typeof fetch;limit?:number}={}){
 if(!slackReady(env))return;
 const now=slackStamp();
 // An unacknowledged first post is never blindly repeated. Updating an already
 // known Slack message is idempotent and safe to recover after a crash.
 await env.DB.prepare("UPDATE slack_arc_events SET status=CASE WHEN reply_ts IS NULL THEN 'unknown' ELSE 'waiting_run' END,last_error='slack_delivery_interrupted',lease=NULL,lease_until=NULL WHERE status='replying' AND lease_until<=?1").bind(now).run();
 const rows=(await env.DB.prepare(`SELECT e.* FROM slack_arc_events e WHERE e.status IN ('pending','processing','waiting_run') AND (e.lease_until IS NULL OR e.lease_until<=?1) AND (e.next_attempt_at<=?1 OR ?2 IS NOT NULL)
  AND (?2 IS NULL OR e.run_id=?2) ORDER BY e.created_at,e.id LIMIT ?3`).bind(now,options.runId||null,Math.min(10,options.limit||5)).all<SlackJob>()).results;
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
