import {creditsEnabled,type PlatformLaunchEnv} from './platform-launch.js';
import {getBillingEntitlements,reconcileArcDispatchRejects} from './billing-ledger.js';
import {ARC_CREDIT_RATE} from '@remotearc/protocol';
import {activeCommercial,commercialVersion} from './arc-commercial-config.js';
import type {StripeEnv} from './stripe-client.js';
import {grantArcCredits,creditBalance,costCreditUnits} from './arc-credits.js';
import {fundingAvailable} from './arc-funding.js';
type TrialEnv=PlatformLaunchEnv&StripeEnv&{DB:D1Database;ARC_TRIAL_DAILY_MICROS?:string;ARC_TRIAL_PREMIUM_MICROS?:string;ARC_CREDITS_ENABLED?:string};
type Trial={user_id:string;started_at:string;expires_at:string;premium_allowance_micros:number;daily_allowance_micros:number;commercial_version_id:string|null};
export class ArcAccessError extends Error {constructor(code:string){super(code);}}
export function arcLimit(value:string|undefined,fallback:number){const n=Number(value??fallback);if(!Number.isSafeInteger(n)||n<1||n>1000000000)throw new ArcAccessError('ARC_BUDGET_CONFIGURATION_INVALID');return n;}
export async function arcAccountAccess(env:TrialEnv,userId:string,at=new Date().toISOString()){
 const [entitlements,trial]=await Promise.all([
  getBillingEntitlements(env.DB,{userId,organizationId:'personal:'+userId},'arc_hosted',at),
  env.DB.prepare('SELECT * FROM arc_trials WHERE user_id=?1').bind(userId).first<Trial>(),
 ]);
 const paid=entitlements.features.includes('hosted_inference'),active=Boolean(trial&&trial.started_at<=at&&trial.expires_at>at),funded=await fundingAvailable(env.DB,userId);
 return{paid,premium:entitlements.features.includes('paid_models'),trial,active,funded,allowed:(paid||active)&&funded,status:paid?'paid':active?'active':trial?'expired':'eligible'};
}
export async function requireArcAccess(env:TrialEnv,userId:string){const access=await arcAccountAccess(env,userId);if(!access.funded)throw new ArcAccessError('ARC_FUNDING_PAUSED_OR_LIMIT');if(!access.allowed)throw new ArcAccessError(access.trial?'ARC_TRIAL_EXPIRED':'ARC_TRIAL_REQUIRED');return access;}
export async function activateArcTrial(env:TrialEnv,userId:string,at=new Date().toISOString()){
 if(!await fundingAvailable(env.DB))throw new ArcAccessError('ARC_FUNDING_PAUSED_OR_LIMIT');
 const access=await arcAccountAccess(env,userId,at);if(access.paid||access.trial){if(access.active&&!access.paid)await ensureTrialCredits(env,userId,access.trial!);return access;}
 const version=await activeCommercial(env,'arc-trial-v1'),terms=version.config;if(!('days' in terms))throw new ArcAccessError('ARC_TRIAL_CONFIGURATION_INVALID');
 await env.DB.prepare(`INSERT OR IGNORE INTO arc_trials(user_id,started_at,expires_at,premium_allowance_micros,daily_allowance_micros,commercial_version_id) VALUES(?1,?2,?3,?4,?5,?6)`)
  .bind(userId,at,new Date(Date.parse(at)+terms.days*86400000).toISOString(),arcLimit(env.ARC_TRIAL_PREMIUM_MICROS,250000),arcLimit(env.ARC_TRIAL_DAILY_MICROS,100000),version.id).run();
 const result=await arcAccountAccess(env,userId,at);if(result.trial)await ensureTrialCredits(env,userId,result.trial);return result;
}
export async function ensureTrialCredits(env:TrialEnv,userId:string,trial:Trial){
 if(!creditsEnabled(env))return;
 // Existing trial usage is preserved when upgrading from the pre-wallet release.
 const previous=await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN status IN ('completed','failed') THEN json_extract(settlement_json,'$.actual.costMicros') ELSE json_extract(request_json,'$.maximum.costMicros') END),0) AS cost
   FROM billing_reservations WHERE user_id=?1 AND lane='arc_hosted' AND created_at>=?2 AND json_extract(request_json,'$.creditRate') IS NULL AND (authorization_id LIKE 'arc-auto:%' OR authorization_id LIKE 'arc-trial:%')`).bind(userId,trial.started_at).first<{cost:number}>();
 const terms=(await commercialVersion(env.DB,trial.commercial_version_id||'seed:live:arc-trial-v1')).config;if(!('days' in terms))throw new ArcAccessError('ARC_TRIAL_CONFIGURATION_INVALID');
 const units=terms.credits*ARC_CREDIT_RATE.unitsPerCredit;
 await grantArcCredits(env.DB,{userId,source:'trial',sourceRef:'trial:'+userId+':'+trial.started_at,units,alreadySpentUnits:Math.min(units,costCreditUnits(previous?.cost||0)),startsAt:trial.started_at,expiresAt:null,reason:terms.days+'-day Arc trial'});
}
export async function publicArcAccess(env:TrialEnv,userId:string){
 await reconcileArcDispatchRejects(env.DB,userId);
 const access=await arcAccountAccess(env,userId),day=new Date().toISOString().slice(0,10);
  if(access.active&&!access.paid)await ensureTrialCredits(env,userId,access.trial!);
  const wallet=creditsEnabled(env)?await creditBalance(env.DB,userId):null;
 const daily=await env.DB.prepare(`SELECT limit_units,spent_units,reserved_units FROM billing_budgets WHERE scope_type='user' AND scope_id=?1 AND lane='arc_hosted' AND metric='cost_micros' AND period_key=?2`).bind(userId,day).first<{limit_units:number;spent_units:number;reserved_units:number}>();
 const terms=(access.trial?await commercialVersion(env.DB,access.trial.commercial_version_id||'seed:live:arc-trial-v1'):await activeCommercial(env,'arc-trial-v1')).config;
 if(!('days' in terms))throw new ArcAccessError('ARC_TRIAL_CONFIGURATION_INVALID');
 return{status:access.status,funded:access.funded,canUse:access.allowed&&(!wallet||wallet.available>0),trialDays:terms.days,trialCredits:terms.credits,creditsAvailable:wallet?.available??null,creditsPending:wallet?.pending??null,startedAt:access.trial?.started_at||null,expiresAt:access.trial?.expires_at||null,daysRemaining:access.active?Math.ceil((Date.parse(access.trial!.expires_at)-Date.now())/86400000):0,dailyUsedPercent:daily?Math.min(100,Math.round((daily.spent_units+daily.reserved_units)/daily.limit_units*100)):0};
}
