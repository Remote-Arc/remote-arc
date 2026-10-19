import {arcPlan,ARC_PLANS} from '@remotearc/protocol';
import {commercialVersion,activeCommercial,type ArcPlanConfig} from './arc-commercial-config.js';
export async function currentArcPlan(binding:D1Database|{DB:D1Database;STRIPE_SECRET_KEY?:string},userId:string,at=new Date().toISOString()){
 const env='DB' in binding?binding:{DB:binding},db=env.DB;
 const rows=(await db.prepare(`SELECT a.plan_id,a.commercial_version_id FROM billing_plan_assignments a JOIN billing_plans p ON p.id=a.plan_id
 WHERE a.subject_type='user' AND a.subject_id=?1 AND a.revoked_at IS NULL AND a.expires_at>?2 AND p.active=1 ORDER BY a.expires_at DESC,a.created_at DESC`).bind(userId,at).all<{plan_id:string;commercial_version_id:string|null}>()).results;
 const selected=[...ARC_PLANS].reverse().find(p=>rows.some(r=>r.plan_id===p.id))??arcPlan('free'),assignment=rows.find(r=>r.plan_id===selected.id);
 const version=selected.id==='free'?await activeCommercial(env,'free'):await commercialVersion(db,assignment?.commercial_version_id||'seed:live:'+selected.id);
 if(version.kind!=='plan')throw new Error('BILLING_CONFIGURATION_INVALID');
 return{...version.config as ArcPlanConfig,commercialVersionId:version.id};
}
