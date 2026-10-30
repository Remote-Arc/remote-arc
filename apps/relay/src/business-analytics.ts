import {getSessionUser} from './auth.js';
import type {BillingEnv} from './stripe-billing.js';

type Row=Record<string,any>;
const DAY=86400000;
const ratio=(n:number,d:number)=>d>0?n/d:null;
const person="u.id NOT IN ('reviewer-openai-v1','reviewer-anthropic-v1')";
const live="COALESCE(v.mode,'live')='live'";
export const businessStages={
 email_login:['started','delivered','verification','verified','completed'],
 google_login:['started','callback','verified','completed'],
 device_pairing:['started','approved','online'],
} as const;

async function flowSummary(db:D1Database,scene:keyof typeof businessStages,from:string,to:string){
 const steps=businessStages[scene];
 const columns=steps.map((step,i)=>`(SELECT MIN(occurred_at) FROM business_flow_steps s WHERE s.flow_id=f.id AND s.step='${step}' AND s.occurred_at<?3) t${i}`);
 const ordered=steps.map((_,i)=>Array.from({length:i+1},(__,j)=>j===0?'t0 IS NOT NULL':`t${j} IS NOT NULL AND t${j}>=t${j-1}`).join(' AND '));
 const result=await db.prepare(`WITH flows AS(SELECT f.*,${columns.join(',')} FROM business_flow_attempts f
 WHERE scene=?1 AND evidence='observed' AND started_at>=?2 AND started_at<?3 AND (user_id IS NULL OR user_id NOT IN ('reviewer-openai-v1','reviewer-anthropic-v1')))
 SELECT COUNT(*) total,${ordered.map((condition,i)=>`COALESCE(SUM(CASE WHEN ${condition} THEN 1 ELSE 0 END),0) s${i}`).join(',')},
 COALESCE(SUM(CASE WHEN NOT(${ordered.at(-1)}) AND (failed_at IS NULL OR failed_at>=?3) AND expires_at>?3 THEN 1 ELSE 0 END),0) pending,
 COALESCE(SUM(CASE WHEN NOT(${ordered.at(-1)}) AND failed_at<?3 THEN 1 ELSE 0 END),0) failed,
 COALESCE(SUM(CASE WHEN succeeded_at<?3 AND NOT(${ordered.at(-1)}) THEN 1 ELSE 0 END),0) incompleteEvidence
 ,(SELECT COUNT(*) FROM business_flow_attempts h WHERE h.scene=?1 AND h.evidence='ledger' AND h.started_at>=?2 AND h.started_at<?3 AND (h.user_id IS NULL OR h.user_id NOT IN ('reviewer-openai-v1','reviewer-anthropic-v1'))) historyUnmeasured
 FROM flows`).bind(scene,from,to).first<Row>();
 return {id:scene,total:Number(result?.total||0),steps:steps.map((key,i)=>({key,count:Number(result?.['s'+i]||0)})),pending:Number(result?.pending||0),failed:Number(result?.failed||0),incompleteEvidence:Number(result?.incompleteEvidence||0),historyUnmeasured:Number(result?.historyUnmeasured||0)};
}

async function paymentSummary(db:D1Database,from:string,to:string,current=false){
 const complete="(c.completed_at<?2 OR (?3=1 AND c.status='complete' AND c.completed_at IS NULL))";
 const paid="(r.id IS NOT NULL OR "+complete+")";
 const fulfilled="("+complete+" OR (r.id IS NOT NULL AND EXISTS(SELECT 1 FROM arc_credit_lots l WHERE l.source_ref=r.id AND l.user_id=c.user_id AND l.created_at<?2) AND (r.period_end IS NULL OR EXISTS(SELECT 1 FROM billing_plan_assignments a WHERE a.id='stripe:'||r.id AND a.subject_id=c.user_id AND a.created_at<?2))))";
 const joins="LEFT JOIN arc_commercial_versions v ON v.id=c.commercial_version_id LEFT JOIN arc_payment_receipts r ON r.id=c.receipt_id AND r.verified_at>=c.created_at AND r.verified_at<?2";
 const visits=await db.prepare(`WITH entries AS(
 SELECT user_id,journey_id,MIN(occurred_at) entered FROM product_events
 WHERE name='billing.checkout.viewed' AND source='browser' AND journey_id IS NOT NULL AND user_id IS NOT NULL
 AND user_id NOT IN ('reviewer-openai-v1','reviewer-anthropic-v1') AND occurred_at>=?1 AND occurred_at<?2 GROUP BY user_id,journey_id), evidence AS(
 SELECT e.*,c.id checkout_id,CASE WHEN c.id IS NOT NULL AND c.expires_at>?2 AND NOT(${fulfilled}) THEN 1
 WHEN c.id IS NULL AND e.entered>=strftime('%Y-%m-%dT%H:%M:%fZ',?2,'-30 minutes') THEN 1 ELSE 0 END pending,
 CASE WHEN ${paid} THEN 1 ELSE 0 END paid,CASE WHEN ${fulfilled} THEN 1 ELSE 0 END fulfilled
 FROM entries e LEFT JOIN arc_billing_checkouts c ON c.user_id=e.user_id AND c.journey_id=e.journey_id AND c.created_at>=e.entered AND c.created_at<?2
 ${joins} WHERE c.id IS NULL OR ${live}), per_visit AS(
 SELECT user_id,journey_id,MAX(checkout_id IS NOT NULL) ordered,MAX(paid) paid,MAX(fulfilled) fulfilled,MAX(pending) pending FROM evidence GROUP BY user_id,journey_id)
 SELECT COUNT(*) total,COALESCE(SUM(ordered),0) ordered,COALESCE(SUM(paid),0) paid,COALESCE(SUM(fulfilled),0) fulfilled,
 COALESCE(SUM(CASE WHEN fulfilled=0 THEN pending ELSE 0 END),0) pending FROM per_visit`).bind(from,to,Number(current)).first<Row>();
 const orders=await db.prepare(`SELECT COUNT(*) total,COALESCE(SUM(c.session_id IS NOT NULL),0) ready,
 COALESCE(SUM(CASE WHEN ${paid} THEN 1 ELSE 0 END),0) paid,COALESCE(SUM(CASE WHEN ${fulfilled} THEN 1 ELSE 0 END),0) fulfilled,
 COALESCE(SUM(CASE WHEN c.expires_at>?2 AND NOT(${fulfilled}) THEN 1 ELSE 0 END),0) pending,
 COALESCE(SUM(r.state='refunded'),0) refunded,COALESCE(SUM(c.journey_id IS NULL),0) unattributed
 FROM arc_billing_checkouts c JOIN users u ON u.id=c.user_id ${joins}
 WHERE c.created_at>=?1 AND c.created_at<?2 AND ${person} AND ${live}`).bind(from,to,Number(current)).first<Row>();
 return {id:'payment',total:Number(visits?.total||0),steps:[{key:'entered',count:Number(visits?.total||0)},{key:'ordered',count:Number(visits?.ordered||0)},{key:'paid',count:Number(visits?.paid||0)},{key:'fulfilled',count:Number(visits?.fulfilled||0)}],pending:Number(visits?.pending||0),failed:0,incompleteEvidence:0,orders};
}

async function overview(db:D1Database,from:string,to:string){
 return await db.prepare(`SELECT
 (SELECT COUNT(*) FROM business_cohort_users WHERE is_demo=0 AND registered_at>=?1 AND registered_at<?2) newUsers,
 (SELECT COUNT(DISTINCT a.user_id) FROM business_activity_days a JOIN users u ON u.id=a.user_id WHERE ${person} AND a.day>=substr(?1,1,10) AND a.day<=substr(?2,1,10) AND a.first_at<?2) activeUsers,
 (SELECT COUNT(DISTINCT r.user_id) FROM arc_payment_receipts r JOIN users u ON u.id=r.user_id LEFT JOIN arc_commercial_versions v ON v.id=r.commercial_version_id WHERE ${person} AND ${live} AND r.state='paid' AND r.amount_cents>0 AND r.verified_at>=?1 AND r.verified_at<?2) payingUsers,
 (SELECT COALESCE(SUM(r.amount_cents),0) FROM arc_payment_receipts r JOIN users u ON u.id=r.user_id LEFT JOIN arc_commercial_versions v ON v.id=r.commercial_version_id WHERE ${person} AND ${live} AND r.state='paid' AND r.amount_cents>0 AND r.verified_at>=?1 AND r.verified_at<?2) paidCents,
 (SELECT COUNT(*) FROM users u WHERE ${person} AND u.created_at>=?1 AND u.created_at<?2 AND EXISTS(SELECT 1 FROM devices d WHERE d.user_id=u.id AND d.platform<>'browser' AND d.created_at<?2)) newPaired,
 (SELECT COUNT(*) FROM users u WHERE ${person} AND u.created_at>=?1 AND u.created_at<?2 AND (EXISTS(SELECT 1 FROM arc_chat_runs t WHERE t.user_id=u.id AND t.status='succeeded' AND t.updated_at<?2) OR EXISTS(SELECT 1 FROM app_calls a WHERE a.user_id=u.id AND a.status='succeeded' AND a.updated_at<?2) OR EXISTS(SELECT 1 FROM product_events p WHERE p.user_id=u.id AND p.name='device.tool.completed' AND p.outcome='succeeded' AND p.occurred_at<?2))) newUsed,
 (SELECT COUNT(*) FROM users u WHERE ${person} AND u.created_at>=?1 AND u.created_at<?2 AND EXISTS(SELECT 1 FROM arc_payment_receipts r LEFT JOIN arc_commercial_versions v ON v.id=r.commercial_version_id WHERE r.user_id=u.id AND r.state='paid' AND r.amount_cents>0 AND r.verified_at<?2 AND ${live})) newPaid
 `).bind(from,to).first<Row>();
}

async function taskSummary(db:D1Database,from:string,to:string){
 const row=await db.prepare(`SELECT COUNT(*) total,
 COALESCE(SUM(t.status='succeeded' AND t.updated_at<?2),0) succeeded,COALESCE(SUM(t.status='failed' AND t.updated_at<?2),0) failed,
 COALESCE(SUM(t.status='cancelled' AND t.updated_at<?2),0) cancelled,COALESCE(SUM(t.status='unknown' AND t.updated_at<?2),0) unknown,
 COALESCE(SUM(t.status IN ('queued','thinking','working') OR t.updated_at>=?2),0) pending
 FROM arc_chat_runs t JOIN users u ON u.id=t.user_id WHERE ${person} AND t.created_at>=?1 AND t.created_at<?2`).bind(from,to).first<Row>();
 return {id:'tasks',total:Number(row?.total||0),steps:[{key:'started',count:Number(row?.total||0)},{key:'succeeded',count:Number(row?.succeeded||0)}],pending:Number(row?.pending||0),failed:Number(row?.failed||0),cancelled:Number(row?.cancelled||0),unknown:Number(row?.unknown||0),incompleteEvidence:0};
}

function finishFlow(input:any){
 const completed=input.steps.at(-1)?.count||0;
 return {...input,completed,rate:input.incompleteEvidence?null:ratio(completed,input.total),unfinished:Math.max(0,input.total-completed-input.pending),steps:input.steps.map((step:any,index:number)=>({...step,rate:ratio(step.count,input.total),previousRate:index?ratio(step.count,input.steps[index-1].count):null,dropoff:index?Math.max(0,input.steps[index-1].count-step.count):0}))};
}

async function period(db:D1Database,from:string,to:string,current=false){
 const [summary,email,google,device,payment,tasks]=await Promise.all([overview(db,from,to),flowSummary(db,'email_login',from,to),flowSummary(db,'google_login',from,to),flowSummary(db,'device_pairing',from,to),paymentSummary(db,from,to,current),taskSummary(db,from,to)]);
 const login={id:'login',total:email.total+google.total,pending:email.pending+google.pending,failed:email.failed+google.failed,incompleteEvidence:email.incompleteEvidence+google.incompleteEvidence,
 steps:[{key:'started',count:email.total+google.total},{key:'verification',count:email.steps[1]!.count+google.steps[1]!.count},{key:'verified',count:email.steps[3]!.count+google.steps[2]!.count},{key:'completed',count:email.steps[4]!.count+google.steps[3]!.count}]};
 return {summary,scenes:[finishFlow(login),finishFlow({...device,id:'devices'}),finishFlow(payment),finishFlow(tasks)],loginMethods:[finishFlow(email),finishFlow(google)]};
}

export async function businessAnalytics(db:D1Database,days:number,now=new Date()){
 const to=now.toISOString(),today=to.slice(0,10),midnight=Date.parse(today+'T00:00:00.000Z');
 const from=new Date(midnight-(days-1)*DAY).toISOString(),priorFrom=new Date(Date.parse(from)-days*DAY).toISOString(),priorTo=new Date(now.getTime()-days*DAY).toISOString();
 const [current,previous,stateRows,trendRows,cohortRows,evidence]=await Promise.all([
  period(db,from,to,true),period(db,priorFrom,priorTo),db.prepare('SELECT key,value FROM business_metrics_state').all<{key:string;value:string}>(),
  db.prepare(`WITH RECURSIVE dates(day) AS(SELECT date(?1) UNION ALL SELECT date(day,'+1 day') FROM dates WHERE day<date(?2))
 SELECT day,(SELECT COUNT(*) FROM business_cohort_users c WHERE c.is_demo=0 AND substr(c.registered_at,1,10)=day) newUsers,
 (SELECT COUNT(*) FROM business_activity_days a JOIN users u ON u.id=a.user_id WHERE ${person} AND a.day=dates.day) activeUsers,
 (SELECT COUNT(DISTINCT r.user_id) FROM arc_payment_receipts r JOIN users u ON u.id=r.user_id LEFT JOIN arc_commercial_versions v ON v.id=r.commercial_version_id WHERE ${person} AND ${live} AND r.state='paid' AND r.amount_cents>0 AND substr(r.verified_at,1,10)=dates.day) payingUsers
 FROM dates`).bind(from,to).all<Row>(),
  db.prepare(`SELECT substr(c.registered_at,1,10) cohort,COUNT(*) users,
 ${[1,7,30].map(n=>`SUM(c.returned_d${n}) d${n}`).join(',')}
 FROM business_cohort_users c WHERE c.is_demo=0 AND c.registered_at>=?1 AND c.registered_at<?2 GROUP BY cohort ORDER BY cohort DESC`).bind(new Date(midnight-59*DAY).toISOString(),to).all<Row>(),
  db.prepare(`SELECT MIN(occurred_at) firstEvent,COUNT(*) events FROM product_events`).first<Row>(),
 ]);
 const state=Object.fromEntries(stateRows.results.map(row=>[row.key,row.value]));
 const completeFrom=state.activity_complete_from?.slice(0,10)||null;
 const cohorts=cohortRows.results.map(row=>({day:row.cohort,users:Number(row.users),cells:[1,7,30].map(offset=>{
  const target=new Date(Date.parse(row.cohort+'T00:00:00.000Z')+offset*DAY).toISOString().slice(0,10);
  const status=target>=today?'observing':!completeFrom||target<completeFrom?'not_collected':'ready';
  return {day:offset,status,returned:Number(row['d'+offset]||0),eligible:status==='ready'?Number(row.users):0,rate:status==='ready'?ratio(Number(row['d'+offset]||0),Number(row.users)):null};
 })}));
 const retention=[1,7,30].map(offset=>{
  const cells=cohorts.flatMap(row=>row.cells.filter(cell=>cell.day===offset&&cell.status==='ready'));
  const eligible=cells.reduce((sum,cell)=>sum+cell.eligible,0),returned=cells.reduce((sum,cell)=>sum+cell.returned,0);
  return {day:offset,eligible,returned,rate:ratio(returned,eligible),status:eligible?'ready':cohorts.some(row=>row.cells.some(cell=>cell.day===offset&&cell.status==='not_collected'))?'not_collected':'observing'};
 });
 return {checkedAt:to,timezone:'UTC',days,from,to,previousFrom:priorFrom,previousTo:priorTo,...current,previous,trend:trendRows.results,retention,cohorts,coverage:{flowSince:state.flow_since||null,activityCompleteFrom:state.activity_complete_from||null,oldestEvent:evidence?.firstEvent||null,recordedEvents:Number(evidence?.events||0),includesInternalAccounts:true,preview:false}};
}

export async function handleBusinessAnalytics(request:Request,env:BillingEnv&{ADMIN_ORIGIN?:string}){
 const url=new URL(request.url),json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store'}});
 if(url.origin!==new URL(env.ADMIN_ORIGIN||'https://admin.remotearc.app').origin)return json({error:'admin_host_required'},404);
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 const user=await getSessionUser(request,env);if(!user)return json({error:'unauthorized'},401);if(!user.isAdmin)return json({error:'forbidden'},403);
 const days=Number(url.searchParams.get('days')||'7');if(![1,7,30].includes(days))return json({error:'invalid_range'},400);
 try{return json(await businessAnalytics(env.DB,days));}catch{return json({error:'business_analytics_unavailable'},503);}
}
