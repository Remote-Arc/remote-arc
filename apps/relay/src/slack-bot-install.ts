import { getSessionUser, randomToken, sha256Hex } from './auth.js';
import { isTrustedDashboardMutation } from './dashboard-origin.js';
import { seal } from './app-oauth.js';
import { authPage, escapeAuthHtml } from './auth-page.js';
import { slackLinkConfirmationPage } from './slack-bot-link-page.js';
import {arcGateway,arcAutoId,arcModelAccess} from './arc-chat-model.js';
import {arcAccountAccess} from './arc-trial.js';
import {runSlackJobs} from './slack-bot-jobs.js';
import { SLACK_BOT_SCOPES, slackDashboard, slackReady, slackStamp, slackTokenContext, type BotTokens, type SlackBotEnv } from './slack-bot-common.js';

export const slackBotCallback=(env:SlackBotEnv)=>(env.APP_ORIGIN||env.PUBLIC_ORIGIN)+'/api/slack/oauth/callback';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
const redirect=(env:SlackBotEnv,key:string,value:string)=>Response.redirect(slackDashboard(env)+'/apps?'+key+'='+encodeURIComponent(value),303);

export async function handleSlackBotAccount(request:Request,env:SlackBotEnv,fetcher:typeof fetch=fetch,ctx?:Pick<ExecutionContext,'waitUntil'>):Promise<Response>{
 const url=new URL(request.url),user=await getSessionUser(request,env);
 if(!user){
  if(url.pathname==='/slack/link')return Response.redirect(slackDashboard(env)+'/auth/login?return_to='+encodeURIComponent(slackDashboard(env)+url.pathname+url.search),302);
  return json({error:'unauthorized'},401);
 }
 if(url.pathname==='/api/slack/status'&&request.method==='GET'){
  const links=(await env.DB.prepare("SELECT l.team_id,l.slack_user_id,l.status,i.team_name,i.app_id,i.bot_user_id,i.status AS installation_status FROM slack_arc_links l LEFT JOIN slack_bot_installations i ON i.team_id=l.team_id WHERE l.user_id=?1 AND l.status='active'").bind(user.id).all()).results;
  const installations=(await env.DB.prepare("SELECT team_id,team_name,app_id,status FROM slack_bot_installations WHERE installer_user_id=?1").bind(user.id).all()).results;
  const access=await arcAccountAccess(env,user.id),premium=access.paid&&access.premium,gateway=arcGateway(env);
  const preference=await env.DB.prepare('SELECT model_id FROM slack_arc_preferences WHERE user_id=?1').bind(user.id).first<{model_id:string}>();
  const models=[{id:'auto',label:'Auto'},...(premium?gateway?.models.filter(model=>model.id!==arcAutoId(env)&&model.provider!=='workers_ai'&&gateway.adapters[model.provider]).map(model=>({id:model.id,label:model.label||model.model}))||[]:[])];
  return json({configured:slackReady(env),links,installations,setup:{eventUrl:(env.APP_ORIGIN||env.PUBLIC_ORIGIN).replace(/\/$/,'')+'/api/slack/events',events:['message.im','app_mention']},modelId:premium&&models.some(model=>model.id===preference?.model_id)?preference!.model_id:'auto',models,canSelectModel:premium,autoModel:gateway?.models.find(model=>model.id===arcAutoId(env))?.model||null});
 }
 if(request.method==='POST'&&!isTrustedDashboardMutation(request,env))return json({error:'same_origin_required'},403);
 if(url.pathname==='/api/slack/settings'&&request.method==='POST'){
  const input=await request.json().catch(()=>null) as any;
  if(typeof input?.modelId!=='string'||input.modelId.length>100)return json({error:'invalid_request'},400);
  try{await arcModelAccess(env,user.id,'personal:'+user.id,input.modelId);}catch(error){return json({error:error instanceof Error?error.message:'model_not_allowed'},403);}
  await env.DB.prepare('INSERT INTO slack_arc_preferences(user_id,model_id,updated_at) VALUES(?1,?2,?3) ON CONFLICT(user_id) DO UPDATE SET model_id=excluded.model_id,updated_at=excluded.updated_at').bind(user.id,input.modelId,slackStamp()).run();
  return json({ok:true});
 }
 if(url.pathname==='/api/slack/install'&&request.method==='POST'){
  if(!slackReady(env))return json({error:'slack_bot_not_configured'},503);
  const state=randomToken(),time=slackStamp();
  await env.DB.prepare('DELETE FROM slack_bot_oauth_states WHERE expires_at<=?1').bind(time).run();
  await env.DB.prepare('INSERT INTO slack_bot_oauth_states(state_hash,user_id,expires_at) VALUES(?1,?2,?3)').bind(await sha256Hex(state),user.id,new Date(Date.now()+600000).toISOString()).run();
  const authorization=new URL('https://slack.com/oauth/v2/authorize');
  authorization.searchParams.set('client_id',env.APP_SLACK_CLIENT_ID!);authorization.searchParams.set('redirect_uri',slackBotCallback(env));authorization.searchParams.set('scope',SLACK_BOT_SCOPES.join(','));authorization.searchParams.set('state',state);
  return json({authorizationUrl:authorization.href});
 }
 if(url.pathname==='/api/slack/oauth/callback'&&request.method==='GET'){
  const state=url.searchParams.get('state')||'';if(!/^[\w-]{20,128}$/.test(state))return json({error:'invalid_oauth_state'},400);
  const claimed=await env.DB.prepare('DELETE FROM slack_bot_oauth_states WHERE state_hash=?1 AND user_id=?2 AND expires_at>?3 RETURNING user_id').bind(await sha256Hex(state),user.id,slackStamp()).first();
  if(!claimed)return json({error:'invalid_oauth_state'},400);
  const failure=url.searchParams.get('error');if(failure)return redirect(env,'slack_error',failure==='invalid_team_for_non_distributed_app'?'distribution_not_enabled':'authorization_denied');
  const code=url.searchParams.get('code');if(!code||code.length>4096)return json({error:'missing_oauth_code'},400);
  try{
   const response=await fetcher('https://slack.com/api/oauth.v2.access',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.APP_SLACK_CLIENT_ID!,client_secret:env.APP_SLACK_CLIENT_SECRET!,code,redirect_uri:slackBotCallback(env)}),signal:AbortSignal.timeout(15000)});
   const result=await response.json() as any;
   if(!response.ok||result.ok!==true||!/^T[A-Z0-9]+$/.test(result.team?.id)||!/^A[A-Z0-9]+$/.test(result.app_id)||!/^U[A-Z0-9]+$/.test(result.bot_user_id)||typeof result.access_token!=='string'||!SLACK_BOT_SCOPES.every(scope=>String(result.scope||'').split(',').includes(scope)))return redirect(env,'slack_error','installation_failed');
   const tokens:BotTokens={accessToken:result.access_token,refreshToken:result.refresh_token,expiresAt:result.expires_in?new Date(Date.now()+Number(result.expires_in)*1000).toISOString():null};
   await env.DB.prepare(`INSERT INTO slack_bot_installations(team_id,app_id,bot_user_id,team_name,installer_user_id,token_ciphertext,status,updated_at) VALUES(?1,?2,?3,?4,?5,?6,'active',?7)
    ON CONFLICT(team_id) DO UPDATE SET app_id=excluded.app_id,bot_user_id=excluded.bot_user_id,team_name=excluded.team_name,installer_user_id=excluded.installer_user_id,token_ciphertext=excluded.token_ciphertext,status='active',generation=slack_bot_installations.generation+1,updated_at=excluded.updated_at`)
    .bind(result.team.id,result.app_id,result.bot_user_id,String(result.team.name||result.team.id).slice(0,120),user.id,await seal(env,tokens,slackTokenContext(result.team.id)),slackStamp()).run();
   return redirect(env,'slack_bot','installed');
  }catch{return redirect(env,'slack_error','installation_failed');}
 }
 if(url.pathname==='/api/slack/unlink'&&request.method==='POST'){
  const input=await request.json().catch(()=>null) as any;
  if(!/^T[A-Z0-9]+$/.test(input?.teamId||'')||!/^[UW][A-Z0-9]+$/.test(input?.slackUserId||''))return json({error:'invalid_request'},400);
  await env.DB.batch([
   env.DB.prepare("UPDATE slack_arc_links SET status='revoked',updated_at=?1 WHERE team_id=?2 AND slack_user_id=?3 AND user_id=?4").bind(slackStamp(),input.teamId,input.slackUserId,user.id),
   env.DB.prepare("UPDATE arc_chat_runs SET status='cancelled',cancel_requested=1,updated_at=?1 WHERE user_id=?2 AND status IN ('queued','thinking','working') AND id IN (SELECT run_id FROM slack_arc_events WHERE team_id=?3 AND slack_user_id=?4 AND user_id=?2)").bind(slackStamp(),user.id,input.teamId,input.slackUserId),
  ]);return json({ok:true});
 }
 if(url.pathname==='/slack/link'&&['GET','POST'].includes(request.method)){
  const code=url.searchParams.get('code')||'';if(!/^[\w-]{20,128}$/.test(code))return authPage('Link expired','<h1>This link has expired</h1><p class="lead">Send Remote Arc a new Slack message to get another link.</p>');
  const hash=await sha256Hex(code),link=await env.DB.prepare('SELECT * FROM slack_arc_link_requests WHERE code_hash=?1 AND expires_at>?2').bind(hash,slackStamp()).first<{team_id:string;slack_user_id:string;event_id:string}>();
  if(!link)return authPage('Link expired','<h1>This link has expired</h1><p class="lead">Send Remote Arc a new Slack message to get another link.</p>');
  if(request.method==='POST'){
   const claimed=await env.DB.prepare('DELETE FROM slack_arc_link_requests WHERE code_hash=?1 AND expires_at>?2 RETURNING code_hash').bind(hash,slackStamp()).first();if(!claimed)return json({error:'link_expired'},409);
   await env.DB.batch([
    env.DB.prepare("UPDATE arc_chat_runs SET status='cancelled',cancel_requested=1,updated_at=?1 WHERE user_id<>?2 AND status IN ('queued','thinking','working') AND id IN (SELECT run_id FROM slack_arc_events WHERE team_id=?3 AND slack_user_id=?4)").bind(slackStamp(),user.id,link.team_id,link.slack_user_id),
    env.DB.prepare(`INSERT INTO slack_arc_links(team_id,slack_user_id,user_id,status,updated_at) VALUES(?1,?2,?3,'active',?4) ON CONFLICT(team_id,slack_user_id) DO UPDATE SET user_id=excluded.user_id,status='active',updated_at=excluded.updated_at`).bind(link.team_id,link.slack_user_id,user.id,slackStamp()),
    env.DB.prepare("UPDATE slack_arc_events SET status='pending',reply_ciphertext=NULL,delivery_kind=NULL,reply_ts=NULL,lease=NULL,lease_until=NULL,next_attempt_at=?1,updated_at=?1 WHERE id=?2 AND status IN ('awaiting_link','delivered') AND delivery_kind='link'").bind(slackStamp(),link.event_id),
   ]);
   ctx?.waitUntil(runSlackJobs(env,{eventId:link.event_id,limit:1,fetcher}));
   return authPage('Slack connected','<h1>You’re connected</h1><p class="lead">Your Slack request will continue using this Remote Arc account. You can return to Slack.</p><a class="google" href="'+escapeAuthHtml(slackDashboard(env)+'/dashboard/agent/chat')+'">Open Remote Arc</a>');
  }
  return slackLinkConfirmationPage(url.pathname+url.search,user.email,link.slack_user_id,link.team_id);
 }
 return json({error:'not_found'},404);
}
