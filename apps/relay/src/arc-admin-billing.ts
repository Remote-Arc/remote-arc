import {getSessionUser} from './auth.js';
import {displayCredits} from './arc-credits.js';
type Env={DB:D1Database;PUBLIC_ORIGIN:string};
export async function handleArcAdminBilling(request:Request,env:Env){
 const user=await getSessionUser(request,env);if(!user?.isAdmin)return Response.json({error:user?'forbidden':'unauthorized'},{status:user?403:401});
 if(request.method!=='GET')return Response.json({error:'method_not_allowed'},{status:405});
 const month=new Date().toISOString().slice(0,7),from=month+'-01T00:00:00.000Z';
 const [revenue,model,wallet,events,activity]=await Promise.all([
  env.DB.prepare("SELECT state,COUNT(*) AS receipts,COALESCE(SUM(amount_cents),0) AS cents FROM arc_payment_receipts WHERE provider='stripe' AND verified_at>=?1 GROUP BY state").bind(from).all<{state:string;receipts:number;cents:number}>(),
  env.DB.prepare(`SELECT provider,model_id,status,COUNT(*) calls,
   COALESCE(SUM(json_extract(settlement_json,'$.usage.inputTokens')+CASE WHEN provider='anthropic' THEN COALESCE(json_extract(settlement_json,'$.usage.cachedInputTokens'),0)+COALESCE(json_extract(settlement_json,'$.usage.cacheWriteTokens'),0) ELSE 0 END),0) inputTokens,
   COALESCE(SUM(json_extract(settlement_json,'$.usage.outputTokens')),0) outputTokens,
   COALESCE(SUM(CASE WHEN status IN ('completed','failed') THEN json_extract(settlement_json,'$.actual.costMicros') ELSE json_extract(request_json,'$.maximum.costMicros') END),0) cost
   FROM billing_reservations WHERE lane='arc_hosted' AND created_at>=?1 AND COALESCE(json_extract(settlement_json,'$.usage.providerAttempted'),1)!=0 GROUP BY provider,model_id,status ORDER BY calls DESC`).bind(from).all<{provider:string;model_id:string;status:string;calls:number;cost:number;inputTokens:number;outputTokens:number}>(),
  env.DB.prepare('SELECT COALESCE(SUM(reserved_units),0) AS pending,COALESCE(SUM(spent_units),0) AS spent FROM arc_credit_lots').first<{pending:number;spent:number}>(),
  env.DB.prepare("SELECT id,status,error_code,created_at FROM arc_payment_events WHERE status!='processed' ORDER BY created_at DESC LIMIT 50").all(),
  env.DB.prepare(`SELECT COUNT(DISTINCT user_id) users,COALESCE(SUM(substr(created_at,1,10)=?2),0) todayCalls FROM billing_reservations WHERE lane='arc_hosted' AND created_at>=?1 AND COALESCE(json_extract(settlement_json,'$.usage.providerAttempted'),1)!=0`).bind(from,new Date().toISOString().slice(0,10)).first<{users:number;todayCalls:number}>(),
 ]);
 const paid=revenue.results.find(r=>r.state==='paid'),refunded=revenue.results.find(r=>r.state==='refunded');
 const modelCost=model.results.filter(r=>['completed','failed'].includes(r.status)).reduce((s,r)=>s+r.cost,0),held=model.results.filter(r=>!['completed','failed'].includes(r.status)).reduce((s,r)=>s+r.cost,0);
 return Response.json({month,modelActivity:activity,paidRevenueUsd:(paid?.cents??0)/100,refundedReceiptValueUsd:(refunded?.cents??0)/100,modelRatedCostUsd:modelCost/1e6,heldModelMaximumUsd:held/1e6,creditsSpent:displayCredits(wallet?.spent??0),creditsPending:displayCredits(wallet?.pending??0),unresolvedPayments:events.results,modelCalls:model.results,note:'Receipt revenue excludes tax and refunded receipts. Provider costs are rated usage, not provider invoices. Payment, hosting, Apps, support and acquisition costs must be included separately; this is not gross margin.'},{headers:{'cache-control':'private, no-store'}});
}
