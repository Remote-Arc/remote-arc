import {z} from 'zod';
import {StripeError} from '../billing/stripe-client.js';
type Policy={managed:number;enabled:number;mode:'manual'|'automatic';paid_user_daily_micros:number;started_at:string|null;total_micros:number;daily_micros:number;revision:number;spent_micros:number;reserved_micros:number;updated_at:string};
export async function fundingPolicy(db:D1Database){const p=await db.prepare('SELECT * FROM arc_funding_policy WHERE id=1').first<Policy>();if(!p)throw new Error('ARC_FUNDING_POLICY_REQUIRED');return p;}
type AutoLimits={sponsored_total:number;sponsored_daily:number;paid_total:number;paid_daily:number;paid_users:number;trial_users:number};
export async function automaticFunding(db:D1Database){
 const limits=await db.prepare('SELECT * FROM arc_funding_automatic_limits').first<AutoLimits>();if(!limits)throw Error('ARC_FUNDING_POLICY_REQUIRED');
 const usage=(await db.prepare("SELECT pool,period_key,spent,reserved FROM arc_funding_pool_counters WHERE period_key IN ('all',?1)").bind(new Date().toISOString().slice(0,10)).all<{pool:string;period_key:string;spent:number;reserved:number}>()).results;
 const pool=(name:'sponsored'|'paid')=>{const total=usage.find(row=>row.pool===name&&row.period_key==='all'),daily=usage.find(row=>row.pool===name&&row.period_key!=='all');return{limit:limits[name==='paid'?'paid_total':'sponsored_total'],dailyLimit:limits[name==='paid'?'paid_daily':'sponsored_daily'],spent:total?.spent||0,reserved:total?.reserved||0,dailyUsed:(daily?.spent||0)+(daily?.reserved||0)};};
 return{...limits,sponsored:pool('sponsored'),paid:pool('paid')};
}
export async function fundingAvailable(db:D1Database,userId?:string){
 const p=await fundingPolicy(db);if(!p.managed)return true;if(!p.enabled)return false;
 if(p.mode==='automatic'){
  const state=await automaticFunding(db),paid=userId?await db.prepare('SELECT 1 present FROM arc_funding_paid_users WHERE user_id=?1').bind(userId).first():null,pool=paid?state.paid:state.sponsored;
  return pool.spent+pool.reserved<pool.limit&&pool.dailyUsed<pool.dailyLimit;
 }
 if(p.spent_micros+p.reserved_micros>=p.total_micros)return false;
 const daily=await db.prepare(`SELECT spent_units+reserved_units used FROM billing_budgets WHERE scope_type='global' AND scope_id='platform' AND lane='arc_hosted' AND metric='cost_micros' AND period_key=?1`).bind(new Date().toISOString().slice(0,10)).first<{used:number}>();
 return (daily?.used||0)<p.daily_micros;
}
export async function fundingOverview(db:D1Database){
 const policy=await fundingPolicy(db),day=new Date().toISOString().slice(0,10),at=new Date().toISOString();
 const cost={spent:policy.spent_micros,reserved:policy.reserved_micros};
 const [usage,trials,audit,dailyBudget]=await Promise.all([
  db.prepare(`SELECT provider,model_id,substr(created_at,1,10) day,COUNT(*) calls,COUNT(DISTINCT user_id) users,COALESCE(SUM(CASE WHEN status IN ('completed','failed') THEN json_extract(settlement_json,'$.actual.costMicros') ELSE 0 END),0) spent,COALESCE(SUM(CASE WHEN status NOT IN ('completed','failed') THEN json_extract(request_json,'$.maximum.costMicros') ELSE 0 END),0) reserved FROM billing_reservations WHERE lane='arc_hosted' AND created_at>=?1 GROUP BY provider,model_id,day ORDER BY day DESC LIMIT 200`).bind(day.slice(0,7)+'-01').all<{provider:string;model_id:string;day:string;calls:number;users:number;spent:number;reserved:number}>(),
  db.prepare(`SELECT COUNT(*) total,COALESCE(SUM(expires_at>?1),0) active,COALESCE(SUM(substr(started_at,1,10)=?2),0) startedToday FROM arc_trials`).bind(at,day).first(),
  db.prepare('SELECT a.*,u.email actor_email FROM arc_funding_audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 30').all(),
  db.prepare(`SELECT spent_units+reserved_units used FROM billing_budgets WHERE scope_type='global' AND scope_id='platform' AND lane='arc_hosted' AND metric='cost_micros' AND period_key=?1`).bind(day).first<{used:number}>(),
 ]);const daily=dailyBudget?.used||0,automatic=policy.mode==='automatic'?await automaticFunding(db):null;return{...policy,...cost,automatic,usage:usage.results,trials,audit:audit.results,dailyUsed:daily,alert:Boolean(policy.managed&&(!policy.enabled||(automatic?automatic.sponsored.spent+automatic.sponsored.reserved>=automatic.sponsored.limit*.8:cost.spent+cost.reserved>=policy.total_micros*.8)||daily>=(automatic?automatic.sponsored.dailyLimit+automatic.paid.dailyLimit:policy.daily_micros)*.8))};
}
export async function updateFunding(db:D1Database,actorId:string,value:unknown){
 const input=z.object({revision:z.number().int().positive(),enabled:z.boolean(),mode:z.enum(['manual','automatic']).optional(),paidUserDailyMicros:z.number().int().min(1).max(1000000000).optional(),totalMicros:z.number().int().min(1).max(10000000000),dailyMicros:z.number().int().min(1).max(1000000000)}).strict().parse(value),at=new Date().toISOString();
 if(!(await fundingPolicy(db)).managed)throw new StripeError('ARC_FUNDING_NOT_ACTIVATED',409);
 await db.batch([
  db.prepare(`UPDATE arc_funding_policy SET enabled=?1,total_micros=?2,daily_micros=?3,updated_at=?4,revision=revision+1,mode=COALESCE(?6,mode),paid_user_daily_micros=COALESCE(?7,paid_user_daily_micros) WHERE id=1 AND revision=?5 AND ?2>=CASE WHEN COALESCE(?6,mode)='automatic' THEN COALESCE((SELECT spent+reserved FROM arc_funding_pool_counters WHERE pool='sponsored' AND period_key='all'),0) ELSE spent_micros+reserved_micros END`).bind(input.enabled?1:0,input.totalMicros,input.dailyMicros,at,input.revision,input.mode??null,input.paidUserDailyMicros??null),
  db.prepare(`INSERT INTO arc_funding_audit SELECT ?1,?2,'budget_updated',?3,?4 WHERE changes()=1`).bind(crypto.randomUUID(),actorId,JSON.stringify(input),at),
 ]).then(result=>{if(!result[0]?.meta.changes)throw new StripeError('ARC_FUNDING_CHANGED_OR_BELOW_COMMITTED',409);});return fundingOverview(db);
}
