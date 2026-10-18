import {getBillingEntitlements} from './billing-ledger.js';
type TrialEnv={DB:D1Database;ARC_TRIAL_DAILY_MICROS?:string;ARC_TRIAL_PREMIUM_MICROS?:string};
type Trial={user_id:string;started_at:string;expires_at:string;premium_allowance_micros:number;daily_allowance_micros:number};
export class ArcAccessError extends Error {constructor(code:string){super(code);}}
export function arcLimit(value:string|undefined,fallback:number){const n=Number(value??fallback);if(!Number.isSafeInteger(n)||n<1||n>1000000000)throw new ArcAccessError('ARC_BUDGET_CONFIGURATION_INVALID');return n;}
export async function arcAccountAccess(env:TrialEnv,userId:string,at=new Date().toISOString()){
 const [entitlements,trial]=await Promise.all([
  getBillingEntitlements(env.DB,{userId,organizationId:'personal:'+userId},'arc_hosted',at),
  env.DB.prepare('SELECT * FROM arc_trials WHERE user_id=?1').bind(userId).first<Trial>(),
 ]);
 const paid=entitlements.features.includes('hosted_inference'),active=Boolean(trial&&trial.started_at<=at&&trial.expires_at>at);
 return{paid,premium:entitlements.features.includes('paid_models'),trial,active,allowed:paid||active,status:paid?'paid':active?'active':trial?'expired':'eligible'};
}
export async function requireArcAccess(env:TrialEnv,userId:string){const access=await arcAccountAccess(env,userId);if(!access.allowed)throw new ArcAccessError(access.trial?'ARC_TRIAL_EXPIRED':'ARC_TRIAL_REQUIRED');return access;}
export async function activateArcTrial(env:TrialEnv,userId:string,at=new Date().toISOString()){
 const access=await arcAccountAccess(env,userId,at);if(access.paid||access.trial)return access;
 await env.DB.prepare(`INSERT OR IGNORE INTO arc_trials(user_id,started_at,expires_at,premium_allowance_micros,daily_allowance_micros) VALUES(?1,?2,?3,?4,?5)`)
  .bind(userId,at,new Date(Date.parse(at)+14*86400000).toISOString(),arcLimit(env.ARC_TRIAL_PREMIUM_MICROS,250000),arcLimit(env.ARC_TRIAL_DAILY_MICROS,100000)).run();
 return arcAccountAccess(env,userId,at);
}
export async function publicArcAccess(env:TrialEnv,userId:string){
 const access=await arcAccountAccess(env,userId),day=new Date().toISOString().slice(0,10);
 const daily=await env.DB.prepare(`SELECT limit_units,spent_units,reserved_units FROM billing_budgets WHERE scope_type='user' AND scope_id=?1 AND lane='arc_hosted' AND metric='cost_micros' AND period_key=?2`).bind(userId,day).first<{limit_units:number;spent_units:number;reserved_units:number}>();
 return{status:access.status,canUse:access.allowed,startedAt:access.trial?.started_at||null,expiresAt:access.trial?.expires_at||null,daysRemaining:access.active?Math.ceil((Date.parse(access.trial!.expires_at)-Date.now())/86400000):0,dailyUsedPercent:daily?Math.min(100,Math.round((daily.spent_units+daily.reserved_units)/daily.limit_units*100)):0};
}
