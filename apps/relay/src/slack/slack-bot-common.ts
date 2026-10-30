import type { ArcEnv } from '../arc/arc-chat.js';
import { seal, unseal } from '../apps/app-oauth.js';

export type SlackBotEnv = ArcEnv & { APP_SLACK_SIGNING_SECRET?:string; SLACK_BOT_ENABLED?:string };
export const SLACK_BOT_SCOPES = ['app_mentions:read','chat:write','im:history','im:write','users:read'] as const;
export type BotTokens = { accessToken:string; refreshToken?:string; expiresAt:string|null };
export type BotInstallation = {team_id:string;app_id:string;bot_user_id:string;team_name:string;installer_user_id:string;token_ciphertext:string|null;status:string;generation:number};
export type SlackJob = {id:string;team_id:string;slack_user_id:string|null;channel_id:string|null;source_ts:string|null;thread_ts:string|null;event_type:string;body_ciphertext:string;status:string;user_id:string|null;run_id:string|null;reply_channel:string|null;reply_ts:string|null;reply_ciphertext:string|null;delivery_kind:string|null;progress_ts:string|null;progress_kind:string|null;lease:string|null;attempts:number;created_at:string};
export const slackStamp=()=>new Date().toISOString();
export const slackDashboard=(env:SlackBotEnv)=>env.DASHBOARD_ORIGIN||'https://agent.remotearc.app';
export const slackReady=(env:SlackBotEnv)=>env.SLACK_BOT_ENABLED!=='0'&&Boolean(env.APP_SLACK_SIGNING_SECRET&&env.APP_SLACK_CLIENT_ID&&env.APP_SLACK_CLIENT_SECRET&&env.APP_TOKEN_KEY);
export const slackTokenContext=(team:string)=>'slack-bot:'+team;
export const slackJobContext=(id:string,suffix='input')=>'slack-event:'+id+':'+suffix;
export class SlackBotError extends Error{
 constructor(readonly code:string,readonly retryAfter=0,readonly uncertain=false){super(code);}
}

/** Verify the raw bytes and freshness before parsing any provider-supplied data. */
export async function verifySlackSignature(request:Request,raw:string,secret:string,now=Date.now()){
 const time=request.headers.get('x-slack-request-timestamp')||'',signature=request.headers.get('x-slack-signature')||'';
 if(!/^\d{10,12}$/.test(time)||Math.abs(now-Number(time)*1000)>300_000||!/^v0=[a-f0-9]{64}$/.test(signature))return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const digest=Uint8Array.from(signature.slice(3).match(/../g)!,pair=>parseInt(pair,16));
 return crypto.subtle.verify('HMAC',key,digest,new TextEncoder().encode('v0:'+time+':'+raw));
}
export async function slackInstallation(env:SlackBotEnv,team:string){
 const row=await env.DB.prepare("SELECT * FROM slack_bot_installations WHERE team_id=?1 AND token_ciphertext IS NOT NULL").bind(team).first<BotInstallation & {updated_at:string}>();
 if(row?.status==='refreshing'&&Date.parse(row.updated_at)>Date.now()-30000)throw new SlackBotError('slack_refresh_in_progress',5);
 return row?.status==='active'?row:null;
}
export async function slackApi(env:SlackBotEnv,installation:BotInstallation,method:string,input:Record<string,unknown>,fetcher:typeof fetch=fetch,timeoutMs=10000):Promise<Record<string,any>>{
 let token=await unseal<BotTokens>(env,installation.token_ciphertext!,slackTokenContext(installation.team_id));
 if(token.expiresAt&&Date.parse(token.expiresAt)<Date.now()+60_000){
  // Slack rotates refresh tokens. Claim the generation before dispatch, so a
  // transport failure cannot make another worker replay an old refresh token.
  const claimed=await env.DB.prepare("UPDATE slack_bot_installations SET status='refreshing',updated_at=?1 WHERE team_id=?2 AND generation=?3 AND status='active' RETURNING team_id").bind(slackStamp(),installation.team_id,installation.generation).first();
  if(!claimed)throw new SlackBotError('slack_refresh_in_progress',5);
  try{
   const response=await fetcher('https://slack.com/api/oauth.v2.access',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.APP_SLACK_CLIENT_ID!,client_secret:env.APP_SLACK_CLIENT_SECRET!,grant_type:'refresh_token',refresh_token:token.refreshToken||''}),signal:AbortSignal.timeout(10000)});
   const value=await response.json() as any;
   if(!response.ok||value.ok!==true||!value.access_token)throw new SlackBotError('slack_reinstall_required');
   token={accessToken:value.access_token,refreshToken:value.refresh_token,expiresAt:new Date(Date.now()+Number(value.expires_in||43200)*1000).toISOString()};
   const saved=await env.DB.prepare("UPDATE slack_bot_installations SET token_ciphertext=?1,status='active',generation=generation+1,updated_at=?2 WHERE team_id=?3 AND generation=?4 AND status='refreshing' RETURNING team_id").bind(await seal(env,token,slackTokenContext(installation.team_id)),slackStamp(),installation.team_id,installation.generation).first();
   if(!saved)throw new SlackBotError('slack_installation_changed');
  }catch{await env.DB.prepare("UPDATE slack_bot_installations SET status='reauthorization_required',updated_at=?1 WHERE team_id=?2 AND generation=?3 AND status='refreshing'").bind(slackStamp(),installation.team_id,installation.generation).run();throw new SlackBotError('slack_reinstall_required');}
 }
 let response:Response;
 const lookup=method==='users.info',url=new URL('https://slack.com/api/'+method);
 if(lookup)for(const [key,value] of Object.entries(input))url.searchParams.set(key,String(value));
 try{response=await fetcher(url.href,{method:lookup?'GET':'POST',redirect:'manual',headers:{authorization:'Bearer '+token.accessToken,...(lookup?{}:{'content-type':'application/json; charset=utf-8'})},...(lookup?{}:{body:JSON.stringify(input)}),signal:AbortSignal.timeout(timeoutMs)});}
 catch{throw new SlackBotError('slack_delivery_unknown',['users.info','conversations.open'].includes(method)?5:0,true);}
 if(response.status===429)throw new SlackBotError('slack_rate_limited',Math.max(1,Math.min(3600,Number(response.headers.get('retry-after')||30))));
 if(response.status>=500)throw new SlackBotError('slack_delivery_unknown',['users.info','conversations.open'].includes(method)?5:0,true);
 const value=await response.json().catch(()=>null) as Record<string,any>|null;
 if(!value||typeof value.ok!=='boolean')throw new SlackBotError('slack_delivery_unknown',0,true);
 if(!response.ok||!value.ok){
  const error=String(value.error||'provider_failed');
  if(['invalid_auth','token_revoked','token_expired','account_inactive'].includes(error))await env.DB.prepare("UPDATE slack_bot_installations SET status='reauthorization_required',updated_at=?1 WHERE team_id=?2 AND generation=?3 AND status='active'").bind(slackStamp(),installation.team_id,installation.generation).run();
  throw new SlackBotError(['missing_scope','channel_not_found','user_not_found','not_in_channel','invalid_auth','token_revoked','token_expired','account_inactive'].includes(error)?'slack_'+error:'slack_provider_failed');
 }
 return value;
}
export async function slackReadBody(request:Request){
 if(request.headers.get('content-type')?.split(';')[0]!== 'application/json')throw new SlackBotError('slack_json_required');
 const reader=request.body?.getReader();if(!reader)return '';const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536){await reader.cancel();throw new SlackBotError('slack_event_too_large');}chunks.push(part.value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.length;}return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
