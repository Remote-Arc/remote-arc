import {z} from 'zod';
import {APP_CATALOG,AppError,providerSchema,type AppEnv,type AppProvider} from './app-catalog.js';
import {seal} from './app-oauth.js';
import {sha256Hex} from '../auth/auth.js';
import {GOOGLE_APPS_BETA_PROVIDERS} from './google-app-policy.js';

type BetaEnv=AppEnv&{GOOGLE_APPS_ACCESS_MODE?:string};
type BetaRow={user_id:string;google_email:string;providers_json:string;support_thread_id:string;status:'pending'|'approved'|'declined';created_at:string};
export async function googleAppBetaState(env:BetaEnv,userId:string){
  const user=await env.DB.prepare('SELECT email,role FROM users WHERE id=?1').bind(userId).first<{email:string;role:string}>();
  const row=await env.DB.prepare('SELECT * FROM google_app_beta_requests WHERE user_id=?1').bind(userId).first<BetaRow>();
  return {mode:env.GOOGLE_APPS_ACCESS_MODE==='public'?'public' as const:'beta' as const,operator:user?.role==='admin',email:user?.email||'',request:row?{googleEmail:row.google_email,providers:JSON.parse(row.providers_json) as string[],status:row.status,createdAt:row.created_at}:null};
}
export function googleAppBetaAllowed(state:Awaited<ReturnType<typeof googleAppBetaState>>,provider:string,existing:boolean){
  if(state.mode==='beta'&&!(GOOGLE_APPS_BETA_PROVIDERS as readonly string[]).includes(provider))return false;
  return state.mode==='public'||state.operator||existing||state.request?.status==='approved';
}
export async function requireGoogleAppBeta(env:AppEnv,userId:string,provider:AppProvider){
  if(APP_CATALOG[provider].credential!=='GOOGLE')return;
  const state=await googleAppBetaState(env,userId);
  if(state.mode==='beta'&&!(GOOGLE_APPS_BETA_PROVIDERS as readonly string[]).includes(provider))throw new AppError('google_app_beta_not_available',503);
  const existing=await env.DB.prepare("SELECT id FROM app_connections WHERE user_id=?1 AND provider=?2 AND status!='disconnected' LIMIT 1").bind(userId,provider).first();
  if(!googleAppBetaAllowed(state,provider,Boolean(existing)))throw new AppError('google_apps_beta_invitation_required',403);
}
export async function submitGoogleAppBeta(env:AppEnv,userId:string,raw:unknown){
  const input=z.object({googleEmail:z.string().trim().email().max(254).transform(value=>value.toLowerCase()),providers:z.array(providerSchema).min(1).max(10).refine(values=>values.every(provider=>(GOOGLE_APPS_BETA_PROVIDERS as readonly string[]).includes(provider))).transform(values=>[...new Set(values)]),useCase:z.string().trim().max(500).optional().default(''),betaTerms:z.literal(true)}).strict().parse(raw);
  const state=await googleAppBetaState(env,userId);
  if(state.request)return {request:state.request,duplicate:true};
  if(!state.email)throw new AppError('unauthorized',401);
  const hash=await sha256Hex('google-app-beta:'+userId);
  const threadId=hash.slice(0,8)+'-'+hash.slice(8,12)+'-8'+hash.slice(13,16)+'-a'+hash.slice(17,20)+'-'+hash.slice(20,32);
  const external='<google-app-beta-'+hash+'@remotearc.app>',messageId=crypto.randomUUID(),at=new Date().toISOString();
  const body=['Submitted from an authenticated Remote Arc account (web form).','Remote Arc account: '+state.email,'Google account to add as a tester: '+input.googleEmail,'Requested Apps: '+input.providers.map(provider=>APP_CATALOG[provider].name).join(', '),'Purpose (optional): '+(input.useCase||'Not provided'),'Beta notice accepted: manual admission; Google Testing limits; authorization may expire after seven days.'].join('\n');
  const encrypted=await seal(env,body,'support:message:'+messageId);
  // Stable thread identity and unique ingress ID make retries/concurrent
  // submissions one application, with no automatic outbound email.
  await env.DB.batch([
    env.DB.prepare("INSERT INTO support_threads(id,sender_email,subject,subject_key,status,created_at,updated_at,last_message_at) VALUES(?1,?2,'Google Apps Beta application','google apps beta application','open',?3,?3,?3) ON CONFLICT(id) DO NOTHING").bind(threadId,state.email,at),
    env.DB.prepare("INSERT INTO support_messages(id,thread_id,direction,from_address,to_address,subject,body_encrypted,external_message_id,delivery_status,created_at) VALUES(?1,?2,'inbound',?3,'support@remotearc.app','Google Apps Beta application',?4,?5,'received',?6) ON CONFLICT(external_message_id) DO NOTHING").bind(messageId,threadId,state.email,encrypted,external,at),
    env.DB.prepare("INSERT INTO google_app_beta_requests(user_id,google_email,providers_json,support_thread_id,status,created_at) VALUES(?1,?2,?3,?4,'pending',?5) ON CONFLICT(user_id) DO NOTHING").bind(userId,input.googleEmail,JSON.stringify(input.providers),threadId,at),
  ]);
  return {request:(await googleAppBetaState(env,userId)).request};
}
