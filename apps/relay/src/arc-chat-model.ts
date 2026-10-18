import { resolveModelGateway, type ModelGatewayEnv } from './model-gateway.js';
import { ModelProviderError, type ModelDefinition } from './model-provider-adapters.js';
import {requireArcAccess,arcLimit,ensureTrialCredits} from './arc-trial.js';

// Published provider pricing, USD microdollars per million tokens. Server overrides
// must include their prices; browser requests can only select an allowlisted ID.
export const ARC_MODELS: readonly ModelDefinition[] = [
 { id:'arc-auto', provider:'openai', model:'gpt-5.4-nano',maxOutputTokens:4096,inputMicrosPerMillion:200000,outputMicrosPerMillion:1250000 },
 { id:'gpt-5.4',provider:'openai',model:'gpt-5.4',maxOutputTokens:4096,inputMicrosPerMillion:2500000,outputMicrosPerMillion:15000000 },
 { id:'claude-sonnet-4-6',provider:'anthropic',model:'claude-sonnet-4-6',maxOutputTokens:4096,inputMicrosPerMillion:3000000,outputMicrosPerMillion:15000000,cacheWriteMicrosPerMillion:6000000 },
];
export type ArcModelEnv = ModelGatewayEnv & {
 DB:D1Database; ARC_CHAT_ENABLED?:string; ARC_MODELS?:string; ARC_AUTO_MODEL_ID?:string;
 ARC_PLATFORM_DAILY_MICROS?:string; ARC_USER_DAILY_MICROS?:string; ARC_PAID_USER_DAILY_MICROS?:string;
 ARC_TRIAL_DAILY_MICROS?:string; ARC_TRIAL_PREMIUM_MICROS?:string; ARC_CREDITS_ENABLED?:string;
};
export function arcGateway(env:ArcModelEnv) {
 if(env.ARC_CHAT_ENABLED!=='1')return undefined;
 const gateway=resolveModelGateway({...env,MODEL_GATEWAY_ENABLED:'1',MODEL_GATEWAY_MODELS:env.ARC_MODELS||JSON.stringify(ARC_MODELS)});
 return gateway;
}
export const arcAutoId=(env:ArcModelEnv)=>env.ARC_AUTO_MODEL_ID||'arc-auto';
export async function arcModelAccess(env:ArcModelEnv,userId:string,organizationId:string,selected='auto') {
 const gateway=arcGateway(env);if(!gateway)throw new ModelProviderError('ARC_NOT_CONFIGURED');
 const id=selected==='auto'?arcAutoId(env):selected,definition=gateway.models.find(m=>m.id===id);
 if(!definition||definition.provider==='workers_ai')throw new ModelProviderError('MODEL_NOT_ALLOWED');
 if(!gateway.adapters[definition.provider])throw new ModelProviderError('MODEL_NOT_CONFIGURED');
 const access=await requireArcAccess(env,userId);
 const premium=id!==arcAutoId(env);
 if(premium&&!(access.paid?access.premium:access.active))throw new ModelProviderError('PAID_MODEL_REQUIRED');
 return{gateway,definition,premium,access};
}
const limit=(value:string|undefined,fallback:number)=>{const n=Number(value??fallback);if(!Number.isSafeInteger(n)||n<1||n>1000000000)throw new ModelProviderError('ARC_BUDGET_CONFIGURATION_INVALID');return n;};
/** Bootstrap only missing limits. Existing administrator caps are never raised. */
export async function prepareArcBudget(env:ArcModelEnv,userId:string,organizationId:string,sessionId:string,selected:string) {
 const access=await arcModelAccess(env,userId,organizationId,selected),day=new Date().toISOString().slice(0,10),now=new Date().toISOString();
 if(access.access.active&&!access.access.paid)await ensureTrialCredits(env,userId,access.access.trial!);
 const userLimit=access.access.paid?limit(env.ARC_PAID_USER_DAILY_MICROS,1000000):access.access.trial!.daily_allowance_micros;
 const scopes=[['global','platform',limit(env.ARC_PLATFORM_DAILY_MICROS,5000000)],['organization',organizationId,userLimit],['user',userId,userLimit],['task',sessionId,userLimit]] as const;
 await env.DB.batch(scopes.flatMap(([type,id,cost])=>[['cost_micros',cost],['credits',1000]].map(([metric,cap])=>env.DB.prepare(`INSERT OR IGNORE INTO billing_budgets(scope_type,scope_id,lane,metric,period_key,limit_units,updated_at) VALUES(?1,?2,'arc_hosted',?3,?4,?5,?6)`).bind(type,id,metric,day,cap,now))));
 let grantId:string;
 if(access.premium&&access.access.active&&!access.access.paid){
  const trial=access.access.trial!;grantId=`arc-trial:${userId}:${access.definition.provider}`;
  await env.DB.prepare(`INSERT OR IGNORE INTO billing_model_grants(id,user_id,organization_id,provider,max_cost_micros,expires_at,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7)`).bind(grantId,userId,organizationId,access.definition.provider,trial.premium_allowance_micros,trial.expires_at,now).run();
 }else if(access.premium){
   const grant=await env.DB.prepare(`SELECT id FROM billing_model_grants WHERE user_id=?1 AND organization_id=?2 AND provider=?3 AND task_id IS NULL AND revoked_at IS NULL AND expires_at>?4 AND id NOT LIKE 'arc-auto:%' AND id NOT LIKE 'arc-trial:%' ORDER BY expires_at DESC LIMIT 1`).bind(userId,organizationId,access.definition.provider,now).first<{id:string}>();
  if(!grant)throw new ModelProviderError('PAID_MODEL_NOT_AUTHORIZED');grantId=grant.id;
 }else{
  // This is the platform-funded Auto allowance, never a user-supplied API key.
  grantId=`arc-auto:${userId}:${day}`;
  const expires=access.access.paid?day+'T23:59:59.999Z':[day+'T23:59:59.999Z',access.access.trial!.expires_at].sort()[0]!;
  await env.DB.prepare(`INSERT OR IGNORE INTO billing_model_grants(id,user_id,organization_id,provider,max_cost_micros,expires_at,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7)`).bind(grantId,userId,organizationId,access.definition.provider,access.access.paid?userLimit:arcLimit(env.ARC_USER_DAILY_MICROS,50000),expires,now).run();
 }
 return{...access,gateway:{...access.gateway,paidGrantId:grantId,creditWallet:env.ARC_CREDITS_ENABLED==='1'}};
}
