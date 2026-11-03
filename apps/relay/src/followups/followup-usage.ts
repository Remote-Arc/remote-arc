import {ARC_PLANS} from '@remotearc/protocol';
import {activeCommercial,commercialVersion,type ArcPlanConfig} from '../arc/arc-commercial-config.js';
import {billingEnabled} from '../platform/platform-launch.js';
import type {FollowupEnv} from './followup-common.js';

// Match currentArcPlan's plan priority and assignment ordering without making
// a separate group of entitlement queries for every user in the admin list.
const rankedPlans=(at:string)=>`followup_ranked_plans AS (
 SELECT a.subject_id user_id,COALESCE(NULLIF(a.commercial_version_id,''),'seed:live:'||a.plan_id) version_id,
 ROW_NUMBER() OVER(PARTITION BY a.subject_id ORDER BY CASE a.plan_id ${ARC_PLANS.map((plan,index)=>`WHEN '${plan.id}' THEN ${index}`).join(' ')} END DESC,a.expires_at DESC,a.created_at DESC) position
 FROM billing_plan_assignments a JOIN billing_plans p ON p.id=a.plan_id
 WHERE a.subject_type='user' AND a.revoked_at IS NULL AND a.expires_at>${at} AND p.active=1
 AND a.plan_id IN (${ARC_PLANS.filter(plan=>plan.id!=='free').map(plan=>`'${plan.id}'`).join(',')})
)`;
export async function followupQuotaContext(env:FollowupEnv,at:string){
 const raw=Number(env.MONTHLY_TOOL_CALL_LIMIT??'10000');
 const base=Number.isFinite(raw)&&raw>0?Math.floor(raw):null;
 const free=env.FREE_MONTHLY_TOOL_CALL_LIMIT===undefined?base:Number(env.FREE_MONTHLY_TOOL_CALL_LIMIT);
 if(!billingEnabled(env)&&env.FREE_MONTHLY_TOOL_CALL_LIMIT!==undefined&&(free===null||!Number.isSafeInteger(free)||free<1))throw Error('FREE_MONTHLY_TOOL_CALL_LIMIT must be a positive integer');
 const operator=env.OPERATOR_EMAIL?.trim().toLowerCase()||null,billing=billingEnabled(env);
 let freePlan:number|null=base;
 const plans:{id:string;limit:number|null}[]=[];
 if(billing){
  const active=await activeCommercial(env,'free');
  if(active.kind!=='plan')throw Error('BILLING_CONFIGURATION_INVALID');
  freePlan=(active.config as ArcPlanConfig).connectToolCalls;
  const selected=await env.DB.prepare(`WITH ${rankedPlans('?1')} SELECT DISTINCT q.version_id FROM followup_ranked_plans q JOIN users u ON u.id=q.user_id
   WHERE q.position=1 AND COALESCE(u.role,'user')<>'admin' AND (?2 IS NULL OR lower(trim(u.email))<>?2)`).bind(at,operator).all<{version_id:string}>();
  for(const row of selected.results){
   const version=await commercialVersion(env.DB,row.version_id);
   if(version.kind!=='plan')throw Error('BILLING_CONFIGURATION_INVALID');
   plans.push({id:version.id,limit:(version.config as ArcPlanConfig).connectToolCalls});
  }
 }
 return JSON.stringify({base,free,freePlan,operator,billing,plans});
}
export const followupQuotaCtes=`${rankedPlans('?3')}, followup_plan_limits AS (
 SELECT json_extract(value,'$.id') version_id,json_extract(value,'$.limit') call_limit FROM json_each(json_extract(?6,'$.plans'))
)`;
export const followupQuotaFacts=`u.role quota_role,u.plan quota_plan,
 COALESCE((SELECT tool_calls FROM user_monthly_usage m WHERE m.user_id=u.id AND m.month_key=substr(?3,1,7)),0) monthly_calls,
 EXISTS(SELECT 1 FROM plan_grants g WHERE g.user_id=u.id AND g.plan='plus' AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>?3)) quota_plus_grant,
 COALESCE((SELECT SUM(extra_calls) FROM user_call_credit_grants g WHERE g.user_id=u.id AND g.month_key=substr(?3,1,7)),0) quota_extra,
 COALESCE((SELECT monthly_calls FROM arc_connect_legacy_allowances l WHERE l.user_id=u.id),0) quota_legacy,
 COALESCE((SELECT SUM(granted_calls-spent_calls) FROM connect_feedback_rewards r WHERE r.user_id=u.id AND r.starts_at<=?3 AND r.expires_at>?3),0)
 +(SELECT COUNT(*) FROM connect_reward_consumptions r WHERE r.user_id=u.id AND r.month_key=substr(?3,1,7) AND r.reward_id IS NOT NULL) quota_reward`;
export const followupQuotaPeople=`quota_facts AS (SELECT f.*,CASE
 WHEN quota_role='admin' OR (json_extract(?6,'$.operator') IS NOT NULL AND lower(trim(email))=json_extract(?6,'$.operator')) THEN NULL
 WHEN json_extract(?6,'$.billing')=1 AND a.version_id IS NOT NULL THEN l.call_limit
 WHEN json_extract(?6,'$.billing')=1 AND COALESCE(quota_plan,'free')<>'plus' AND NOT quota_plus_grant THEN
  CASE WHEN json_extract(?6,'$.freePlan') IS NULL THEN NULL ELSE MAX(quota_legacy,json_extract(?6,'$.freePlan')) END
 WHEN COALESCE(quota_plan,'free')='plus' OR quota_plus_grant THEN json_extract(?6,'$.base')
 ELSE json_extract(?6,'$.free') END quota_base
 FROM facts f LEFT JOIN followup_ranked_plans a ON a.user_id=f.id AND a.position=1 LEFT JOIN followup_plan_limits l ON l.version_id=a.version_id)`;
