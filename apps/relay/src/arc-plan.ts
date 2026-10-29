import {arcPlan,ARC_PLANS} from '@remotearc/protocol';
import {commercialVersion,activeCommercial,type ArcPlanConfig} from './arc-commercial-config.js';
/** Replace only untouched bootstrap execution windows. Published administrator
 * configurations, prices, credits and financial budgets remain authoritative. */
export function arcExecutionCapacity(plan:ArcPlanConfig,versionId:string):ArcPlanConfig{
 const legacy=({free:[8,24000,180],'arc-plus-v1':[16,48000,600],'arc-pro-v1':[32,96000,1800]} as Record<string,number[]>)[plan.id];
 // Plans launched after the capacity repair (Connect-only) have no legacy window.
 if(!legacy)return plan;
 // The quota repair clones the active version and changes only Connect calls;
 // keep the same execution capacity for cloned bootstrap versions.
 const capacityVersion=versionId.replace(/^free-connect-10000:/,'');
 if(!['seed:live:'+plan.id,'seed:test:'+plan.id].includes(capacityVersion)||plan.maxSteps!==legacy[0]||plan.maxTokens!==legacy[1]||plan.maxSeconds!==legacy[2])return plan;
 const capacity=({free:[32,128000,900],'arc-plus-v1':[48,192000,1800],'arc-pro-v1':[64,256000,3600]} as Record<string,number[]>)[plan.id]!;
 return{...plan,maxSteps:capacity[0]!,maxTokens:capacity[1]!,maxSeconds:capacity[2]!};
}
export async function currentArcPlan(binding:D1Database|{DB:D1Database;STRIPE_SECRET_KEY?:string},userId:string,at=new Date().toISOString()){
 const env='DB' in binding?binding:{DB:binding},db=env.DB;
 const rows=(await db.prepare(`SELECT a.plan_id,a.commercial_version_id FROM billing_plan_assignments a JOIN billing_plans p ON p.id=a.plan_id
 WHERE a.subject_type='user' AND a.subject_id=?1 AND a.revoked_at IS NULL AND a.expires_at>?2 AND p.active=1 ORDER BY a.expires_at DESC,a.created_at DESC`).bind(userId,at).all<{plan_id:string;commercial_version_id:string|null}>()).results;
 const selected=[...ARC_PLANS].reverse().find(p=>rows.some(r=>r.plan_id===p.id))??arcPlan('free'),assignment=rows.find(r=>r.plan_id===selected.id);
 const version=selected.id==='free'?await activeCommercial(env,'free'):await commercialVersion(db,assignment?.commercial_version_id||'seed:live:'+selected.id);
 if(version.kind!=='plan')throw new Error('BILLING_CONFIGURATION_INVALID');
 return{...arcExecutionCapacity(version.config as ArcPlanConfig,version.id),deviceLimit:selected.id==='arc-plus-v1'?10:selected.id==='free'?2:(version.config as ArcPlanConfig).deviceLimit,commercialVersionId:version.id};
}
