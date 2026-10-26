/** Operational metadata only. Never pass exception text, URLs, form values or provider payloads. */
export type EventEnv={DB:D1Database;DEPLOYMENT_SHA?:string};
export type ProductEvent={name:string;domain:string;source:'browser'|'server'|'stripe';outcome:'succeeded'|'accepted'|'failed'|'waiting';userId?:string|null;journeyId?:string|null;traceId?:string;entityId?:string|null;route?:string;errorCode?:string;httpStatus?:number;durationMs?:number;id?:string};
export const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
export const eventIdentity=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_:-]{1,180}$/.test(v)?v:null;
export function eventContext(request:Request){return{traceId:uuid(request.headers.get('x-ra-trace-id'))?request.headers.get('x-ra-trace-id')!:crypto.randomUUID(),journeyId:uuid(request.headers.get('x-ra-journey-id'))?request.headers.get('x-ra-journey-id'):null};}
export function safeEventError(value:unknown){
 const code=typeof value==='string'?value:'';
 return /^(?:(?:BILLING|ARC|MODEL|PAID|APP)_[A-Z_]{1,70}|unauthorized|forbidden|rate_limited|same_origin_required|invalid_request|internal_error|CLIENT_ERROR|NETWORK_ERROR|PAYMENT_FORM_LOAD_FAILED|CONFIRMATION_TIMEOUT)$/.test(code)?code:'REQUEST_FAILED';
}
export function eventStatement(env:EventEnv,event:ProductEvent,at=new Date().toISOString()){
 return env.DB.prepare(`INSERT OR IGNORE INTO product_events(id,occurred_at,domain,name,source,outcome,user_id,journey_id,trace_id,entity_id,route,error_code,http_status,duration_ms,deployment) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)`).bind(
 event.id&&uuid(event.id)?event.id:crypto.randomUUID(),at,event.domain,event.name,event.source,event.outcome,
 eventIdentity(event.userId),uuid(event.journeyId)?event.journeyId:null,uuid(event.traceId)?event.traceId:crypto.randomUUID(),eventIdentity(event.entityId),
 event.route||null,event.errorCode?safeEventError(event.errorCode):null,event.httpStatus??null,event.durationMs===undefined?null:Math.round(Math.max(0,Math.min(900000,event.durationMs))),
 /^[a-f0-9]{40}$/.test(env.DEPLOYMENT_SHA||'')?env.DEPLOYMENT_SHA!:null);
}
export async function recordProductEvent(env:EventEnv,event:ProductEvent){
 try{await eventStatement(env,event).run();return true;}catch{console.warn('product_event_write_failed');return false;}
}
export async function recordCheckoutCompletion(env:EventEnv,userId:string,sessionId:string,receiptId:string){
 try{
 const paid=await env.DB.prepare("SELECT r.id FROM arc_payment_receipts r JOIN arc_billing_checkouts c ON c.session_id=?3 AND c.user_id=r.user_id AND c.product_id=r.product_id WHERE r.id=?1 AND r.user_id=?2 AND r.state='paid' AND EXISTS(SELECT 1 FROM arc_credit_lots l WHERE l.source_ref=r.id AND l.user_id=r.user_id) AND (r.period_end IS NULL OR EXISTS(SELECT 1 FROM billing_plan_assignments a WHERE a.id='stripe:'||r.id AND a.subject_id=r.user_id))").bind(receiptId,userId,sessionId).first();
 if(!paid)return;
 const checkout=await env.DB.prepare('SELECT journey_id,trace_id FROM arc_billing_checkouts WHERE user_id=?1 AND session_id=?2').bind(userId,sessionId).first<{journey_id:string|null;trace_id:string|null}>();
 await recordProductEvent(env,{id:undefined,domain:'billing',name:'billing.purchase.completed',source:'stripe',outcome:'succeeded',userId,entityId:sessionId,journeyId:checkout?.journey_id,traceId:checkout?.trace_id||undefined});
 }catch{console.warn('product_completion_write_failed');}
}
export async function purgeProductEvents(env:EventEnv){
 try{await env.DB.prepare("DELETE FROM product_events WHERE id IN (SELECT id FROM product_events WHERE occurred_at<?1 ORDER BY occurred_at LIMIT 5000)").bind(new Date(Date.now()-30*86400000).toISOString()).run();}catch{console.warn('product_event_retention_failed');}
}
