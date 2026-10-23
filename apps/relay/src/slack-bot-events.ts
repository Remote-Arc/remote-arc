import { seal } from './app-oauth.js';
import { slackInstallation, slackJobContext, slackReadBody, slackReady, slackStamp, verifySlackSignature, type SlackBotEnv } from './slack-bot-common.js';
import { runSlackJobs } from './slack-bot-jobs.js';

const identifier=(value:unknown,prefix:string)=>typeof value==='string'&&new RegExp('^'+prefix+'[A-Z0-9]{2,40}$').test(value);
export async function handleSlackEvents(request:Request,env:SlackBotEnv,ctx?:Pick<ExecutionContext,'waitUntil'>){
 if(!slackReady(env))return Response.json({error:'slack_bot_not_configured'},{status:503});
 let raw:string;try{raw=await slackReadBody(request);}catch{return Response.json({error:'invalid_request'},{status:400});}
 if(!await verifySlackSignature(request,raw,env.APP_SLACK_SIGNING_SECRET!))return Response.json({error:'invalid_signature'},{status:401});
 let input:any;try{input=JSON.parse(raw);}catch{return Response.json({error:'invalid_request'},{status:400});}
 if(input.type==='url_verification'&&typeof input.challenge==='string'&&input.challenge.length<1000)return Response.json({challenge:input.challenge});
 if(input.type!=='event_callback'||!identifier(input.team_id,'T')||!identifier(input.api_app_id,'A')||typeof input.event_id!=='string'||!/^Ev[A-Za-z0-9]{2,80}$/.test(input.event_id))return Response.json({ok:true});
 const installation=await slackInstallation(env,input.team_id);if(!installation||installation.app_id!==input.api_app_id)return Response.json({ok:true});
 const event=input.event;
 if(event?.type==='app_uninstalled'||event?.type==='tokens_revoked'&&Array.isArray(event.tokens?.bot)&&event.tokens.bot.includes(installation.bot_user_id)){
  await env.DB.batch([
   env.DB.prepare("UPDATE slack_bot_installations SET status='revoked',token_ciphertext=NULL,generation=generation+1,updated_at=?1 WHERE team_id=?2 AND app_id=?3").bind(slackStamp(),input.team_id,input.api_app_id),
   env.DB.prepare("UPDATE arc_chat_runs SET status='cancelled',cancel_requested=1,updated_at=?1 WHERE status IN ('queued','thinking','working') AND id IN (SELECT run_id FROM slack_arc_events WHERE team_id=?2)").bind(slackStamp(),input.team_id),
  ]);return Response.json({ok:true});
 }
 // Only explicit mentions and ordinary human DMs are an instruction entrance.
 // Never consume arbitrary channel history, edits, bot replies or file events.
 if(!event||event.bot_id||event.subtype||event.user===installation.bot_user_id||!identifier(event.user,'[UW]')||!identifier(event.channel,'[CDG]')||typeof event.text!=='string'||event.text.length>6000||!/^\d{10,16}\.\d{1,6}$/.test(event.ts||''))return Response.json({ok:true});
 if(event.type!=='app_mention'&&!(event.type==='message'&&event.channel_type==='im'))return Response.json({ok:true});
 if(event.thread_ts!==undefined&&!/^\d{10,16}\.\d{1,6}$/.test(event.thread_ts))return Response.json({ok:true});
 const since=new Date(Date.now()-60000).toISOString(),now=slackStamp(),id=input.team_id+':'+input.event_id;
 const body={text:event.text.replace(new RegExp('<@'+installation.bot_user_id+'>','g'),'').trim(),kind:event.type==='app_mention'?'mention':'dm'};
 if(!body.text)return Response.json({ok:true});
 await env.DB.prepare(`INSERT OR IGNORE INTO slack_arc_events(id,team_id,slack_user_id,channel_id,source_ts,thread_ts,event_type,body_ciphertext,status,next_attempt_at,created_at,updated_at)
  SELECT ?1,?2,?3,?4,?5,?6,?7,?8,'pending',?9,?9,?9 WHERE (SELECT COUNT(*) FROM slack_arc_events WHERE team_id=?2 AND slack_user_id=?3 AND created_at>?10)<12
  AND (SELECT COUNT(*) FROM slack_arc_events WHERE team_id=?2 AND status IN ('pending','processing','waiting_run'))<1000`)
  .bind(id,input.team_id,event.user,event.channel,event.ts,event.thread_ts||(event.type==='app_mention'?event.ts:null),event.type,await seal(env,body,slackJobContext(id)),now,since).run();
 ctx?.waitUntil(runSlackJobs(env,{limit:1}));
 return Response.json({ok:true});
}
