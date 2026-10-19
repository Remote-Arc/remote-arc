import {arcPlan,ARC_PLANS} from '@remotearc/protocol';
export async function currentArcPlan(db:D1Database,userId:string,at=new Date().toISOString()){
 const rows=(await db.prepare(`SELECT a.plan_id FROM billing_plan_assignments a JOIN billing_plans p ON p.id=a.plan_id
 WHERE a.subject_type='user' AND a.subject_id=?1 AND a.revoked_at IS NULL AND a.expires_at>?2 AND p.active=1`).bind(userId,at).all<{plan_id:string}>()).results;
 return [...ARC_PLANS].reverse().find(p=>rows.some(r=>r.plan_id===p.id))??arcPlan('free');
}
