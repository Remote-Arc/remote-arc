import {displayCredits} from './arc-credits.js';
import {StripeError} from './stripe-client.js';

/** Administrative metadata only: no conversation content or device files. */
export async function listAdminTrials(db:D1Database,url:URL,at=new Date().toISOString()){
 const status=url.searchParams.get('status')||'all',query=(url.searchParams.get('q')||'').trim().toLowerCase(),page=Number(url.searchParams.get('page')||0);
 if(!['all','active','expired','exhausted','paid'].includes(status)||query.length>100||!Number.isSafeInteger(page)||page<0||page>1000)throw new StripeError('invalid_trial_filter',400);
 const search=query?'%'+query.replace(/[\\%_]/g,'\\$&')+'%':'';
 const base=`WITH records AS (
  SELECT t.user_id,u.email,u.name,t.started_at,t.expires_at,t.commercial_version_id,
   COALESCE((SELECT SUM(l.granted_units) FROM arc_credit_lots l WHERE l.user_id=t.user_id AND l.source='trial'),0) granted,
   COALESCE((SELECT SUM(l.spent_units) FROM arc_credit_lots l WHERE l.user_id=t.user_id AND l.source='trial'),0) spent,
   COALESCE((SELECT SUM(l.reserved_units) FROM arc_credit_lots l WHERE l.user_id=t.user_id AND l.source='trial'),0) reserved,
   (SELECT COUNT(*) FROM arc_chat_runs r WHERE r.user_id=t.user_id) runs,
   (SELECT COUNT(*) FROM arc_chat_runs r WHERE r.user_id=t.user_id AND r.status='succeeded') succeeded,
   (SELECT MAX(r.created_at) FROM arc_chat_runs r WHERE r.user_id=t.user_id) last_run_at,
   EXISTS(SELECT 1 FROM billing_plan_assignments a WHERE a.subject_type='user' AND a.subject_id=t.user_id AND a.plan_id IN ('arc-plus-v1','arc-pro-v1') AND a.revoked_at IS NULL AND a.expires_at>?1) paid
  FROM arc_trials t JOIN users u ON u.id=t.user_id
 ), labelled AS (
  SELECT *,CASE WHEN paid THEN 'paid' WHEN expires_at<=?1 THEN 'expired' WHEN granted>0 AND spent+reserved>=granted THEN 'exhausted' ELSE 'active' END status FROM records
 ), filtered AS (
  SELECT * FROM labelled WHERE (?2='' OR lower(email) LIKE ?2 ESCAPE '\\' OR lower(COALESCE(name,'')) LIKE ?2 ESCAPE '\\') AND (?3='all' OR status=?3)
 )`;
 const pageSize=30,[rows,count]=await Promise.all([
  db.prepare(base+' SELECT * FROM filtered ORDER BY started_at DESC,user_id LIMIT 30 OFFSET ?4').bind(at,search,status,page*pageSize).all<{granted:number;spent:number;reserved:number;[key:string]:unknown}>(),
  db.prepare(base+' SELECT COUNT(*) total FROM filtered').bind(at,search,status).first<{total:number}>(),
 ]);
 return{page,pageSize,total:count?.total||0,items:rows.results.map(({granted,spent,reserved,...row})=>({...row,grantedCredits:displayCredits(granted),spentCredits:displayCredits(spent),reservedCredits:displayCredits(reserved)}))};
}
