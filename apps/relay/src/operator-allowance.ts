import {ARC_CREDIT_RATE} from '@remotearc/protocol';
import {grantArcCredits} from './arc-credits.js';
import {assignBillingPlan,getBillingEntitlements} from './billing-ledger.js';
import {creditsEnabled,type PlatformLaunchEnv} from './platform-launch.js';

export type OperatorAllowanceEnv = PlatformLaunchEnv & {DB:D1Database;OPERATOR_EMAIL?:string;OPERATOR_MONTHLY_CREDITS?:string;OPERATOR_PLAN_ID?:string};

const monthStart=(at:string,offset=0)=>{const date=new Date(at);return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+offset,1)).toISOString();};

/**
 * The operator dogfoods Arc on the same paid path as customers: a Pro plan and
 * a bounded monthly Credit lot, never unlimited spend. The admin role governs
 * administration only; it confers no Arc model allowance by itself.
 *
 * Idempotent per month: the lot is keyed by month and the plan is renewed only
 * when its remaining term is short. Every grant is recorded with the operator
 * as the actor in the existing Credit, plan and provider ledgers.
 */
export async function ensureOperatorAllowance(env:OperatorAllowanceEnv,at=new Date().toISOString()){
 const email=env.OPERATOR_EMAIL?.trim().toLowerCase(),credits=Number(env.OPERATOR_MONTHLY_CREDITS??'5000');
 if(!email||!creditsEnabled(env)||!Number.isSafeInteger(credits)||credits<=0||credits>100000)return null;
 const operator=await env.DB.prepare("SELECT id,role FROM users WHERE lower(email)=?1").bind(email).first<{id:string;role:string}>();
 // Only an existing administrator account qualifies; an unclaimed email never does.
 if(!operator||operator.role!=='admin')return null;
 const month=at.slice(0,7),start=monthStart(at),nextMonth=monthStart(at,1),expires=monthStart(at,2);
 // Same terms as customers' monthly plan Credits: they expire at period end, no rollover.
 const lot=await grantArcCredits(env.DB,{userId:operator.id,source:'promotion',sourceRef:'operator:'+operator.id+':'+month,units:credits*ARC_CREDIT_RATE.unitsPerCredit,startsAt:start,expiresAt:nextMonth,reason:'Operator monthly Arc allowance ('+credits+' Credits)',actorId:operator.id},at);
 const planId=env.OPERATOR_PLAN_ID||'arc-pro-v1';
 const current=await env.DB.prepare("SELECT id FROM billing_plan_assignments WHERE subject_type='user' AND subject_id=?1 AND plan_id=?2 AND revoked_at IS NULL AND expires_at>?3 LIMIT 1").bind(operator.id,planId,nextMonth).first();
 if(!current)await assignBillingPlan(env.DB,operator.id,{id:'operator:'+operator.id+':'+planId+':'+month,planId,subjectType:'user',subjectId:operator.id,expiresAt:expires},at);
 // Paid subscriptions create provider authority as well as a plan and wallet.
 // The operator's monthly allowance needs the same path for manually selected
 // models. Bound every grant to the existing lot; all providers still share the
 // wallet, daily budgets and platform funding caps at reservation time.
 const organizationId='personal:'+operator.id;
 const entitlement=await getBillingEntitlements(env.DB,{userId:operator.id,organizationId},'arc_hosted',at);
 if(entitlement.features.includes('hosted_inference')&&entitlement.features.includes('paid_models')){
  await env.DB.batch((['openai','anthropic','openrouter'] as const).map(provider=>env.DB.prepare(`INSERT OR IGNORE INTO billing_model_grants
   (id,user_id,organization_id,provider,max_cost_micros,expires_at,granted_by_user_id,created_at)
   SELECT ?1,?2,?3,?4,l.granted_units*?5,l.expires_at,?2,?6 FROM arc_credit_lots l
   WHERE l.id=?7 AND l.user_id=?2 AND l.source='promotion' AND l.actor_id=?2
    AND l.revoked_at IS NULL AND l.starts_at<=?6 AND l.expires_at>?6
    AND EXISTS(SELECT 1 FROM users WHERE id=?2 AND role='admin')
    AND EXISTS(SELECT 1 FROM organization_members WHERE organization_id=?3 AND user_id=?2 AND status='active')`)
   .bind('operator:'+operator.id+':'+month+':'+provider,operator.id,organizationId,provider,ARC_CREDIT_RATE.costMicrosPerUnit,at,lot)));
 }
 return{userId:operator.id,lot,planId};
}
