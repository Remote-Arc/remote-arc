import {getSessionUser} from './auth.js';
import {stripeConfigured,stripeLive,stripePublishableKey,stripeRequest,stripeId} from './stripe-client.js';
import {arcEnabled,creditsEnabled} from './platform-launch.js';
import type {BillingEnv} from './stripe-billing.js';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'cache-control':'private, no-store'}});
const domains=['billing','auth','oauth','devices','apps','tasks','automations','navigation','client'];
async function eventAccounts(db:D1Database,ids:(string|null|undefined)[]){
 const keys=[...new Set(ids.filter((id):id is string=>Boolean(id)))].slice(0,100);
 if(!keys.length)return [];
 return (await db.prepare(`SELECT id,email FROM users WHERE id IN (${keys.map((_,i)=>'?'+(i+1)).join(',')})`).bind(...keys).all()).results;
}
export async function handleAdminEvents(request:Request,env:BillingEnv&{ADMIN_ORIGIN?:string}){
 if(new URL(request.url).origin!==new URL(env.ADMIN_ORIGIN||'https://admin.remotearc.app').origin)return json({error:'admin_host_required'},404);
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 const user=await getSessionUser(request,env);if(!user)return json({error:'unauthorized'},401);if(!user.isAdmin)return json({error:'forbidden'},403);
 try{
  const url=new URL(request.url);
  if(url.pathname==='/api/admin/events/readiness')return json(await paymentReadiness(env));
  const hours=Number(url.searchParams.get('hours')||'24');
  const domain=url.searchParams.get('domain')||'',userId=url.searchParams.get('userId')||'',trace=url.searchParams.get('trace')||'',failures=url.searchParams.get('failures')==='1';
  const email=(url.searchParams.get('email')||'').trim();
  if(email&&(email.length>254||!/^\S+@\S+\.\S+$/.test(email)))return json({error:'invalid_filter'},400);
  if(![1,24,168,720].includes(hours)||domain&&!domains.includes(domain)||userId&&!/^[A-Za-z0-9_-]{1,100}$/.test(userId)||trace&&!/^[A-Za-z0-9_-]{1,180}$/.test(trace))return json({error:'invalid_filter'},400);
  const before=url.searchParams.get('before')||'';
  if(before&&!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\|[a-f0-9-]{36}$/.test(before))return json({error:'invalid_cursor'},400);
  const from=new Date(Date.now()-hours*3600000).toISOString();
  const args:unknown[]=[from];let where='occurred_at>=?1';
  function filter(sql:string,value:unknown){args.push(value);where+=' AND '+sql.replace('?', '?'+args.length);}
  if(domain)filter('domain=?',domain);if(userId)filter('user_id=?',userId);if(trace){args.push(trace);where+=' AND (trace_id=?'+args.length+' OR journey_id=?'+args.length+' OR entity_id=?'+args.length+')';}
  if(email)filter('user_id IN (SELECT id FROM users WHERE lower(email)=lower(?))',email);
  if(failures)where+=" AND outcome='failed'";
  let pageWhere=where;const pageArgs=[...args];if(before){const [at,id]=before.split('|');pageArgs.push(at,id);pageWhere+=' AND (occurred_at<?'+(pageArgs.length-1)+' OR (occurred_at=?'+(pageArgs.length-1)+' AND id<?'+pageArgs.length+'))';}
  const [summary,byDomain,errors,events,funnel]=await Promise.all([
   env.DB.prepare(`SELECT COUNT(*) total,COUNT(DISTINCT user_id) users,COUNT(DISTINCT CASE WHEN outcome='failed' THEN user_id END) affectedUsers,SUM(CASE WHEN outcome='failed' THEN 1 ELSE 0 END) failures,SUM(CASE WHEN source='browser' THEN 1 ELSE 0 END) browser FROM product_events WHERE ${where}`).bind(...args).first(),
   env.DB.prepare(`SELECT domain,COUNT(*) total,SUM(CASE WHEN outcome='failed' THEN 1 ELSE 0 END) failures FROM product_events WHERE ${where} GROUP BY domain ORDER BY failures DESC,total DESC`).bind(...args).all(),
   env.DB.prepare(`SELECT name,error_code,COUNT(*) total,COUNT(DISTINCT user_id) users,MAX(occurred_at) last_seen FROM product_events WHERE ${where} AND outcome='failed' GROUP BY name,error_code ORDER BY total DESC LIMIT 12`).bind(...args).all(),
   env.DB.prepare(`SELECT * FROM product_events WHERE ${pageWhere} ORDER BY occurred_at DESC,id DESC LIMIT 101`).bind(...pageArgs).all<Record<string,any>>(),
   env.DB.prepare(`SELECT name,COUNT(DISTINCT journey_id) journeys FROM product_events WHERE ${where} AND domain='billing' AND journey_id IS NOT NULL AND outcome!='failed' GROUP BY name`).bind(...args).all(),
  ]);
  const rows=events.results||[],hasMore=rows.length>100,items=rows.slice(0,100),last=items.at(-1);
  const accounts=await eventAccounts(env.DB,items.map(item=>item.user_id));
  return json({from,checkedAt:new Date().toISOString(),retentionDays:30,summary,byDomain:byDomain.results,errors:errors.results,events:items,accounts,funnel:funnel.results,nextCursor:hasMore&&last?last.occurred_at+'|'+last.id:null});
 }catch{return json({error:'observability_unavailable'},503);}
}
export async function paymentReadiness(env:BillingEnv){
 const checks:Array<{key:string;state:'pass'|'fail'|'unknown';detail:string}>=[];
 const check=(key:string,pass:boolean,detail:string)=>checks.push({key,state:pass?'pass':'fail',detail});
 check('billing_enabled',stripeConfigured(env)&&arcEnabled(env)&&creditsEnabled(env),'Runtime feature switches and required Stripe secrets');
 let live=false;try{live=stripeLive(env);}catch{}
 check('live_keys',live,'Live secret key required for real purchases');
 let embeddedKey=false;try{embeddedKey=Boolean(stripePublishableKey(env));}catch{}
 check('embedded_key',embeddedKey,'Public key format and mode match the secret key');
 let providerReachable=false;
 if(live)try{
  const [account,hooks]=await Promise.all([stripeRequest(env,'/v1/account'),stripeRequest(env,'/v1/webhook_endpoints?limit=100')]);providerReachable=true;
  check('charges_enabled',account.charges_enabled===true,'Stripe account can accept charges');
  // The relay serves the webhook on every production host; activation registers the dashboard host.
  const expected=new Set([env.PUBLIC_ORIGIN,env.DASHBOARD_ORIGIN,env.APP_ORIGIN].filter(Boolean).map(origin=>new URL('/api/billing/webhook',origin).href)),required=['invoice.paid','invoice.payment_failed','checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired','customer.subscription.updated','customer.subscription.deleted','charge.refunded','charge.dispute.created'];
  const endpoint=hooks.data?.find((h:any)=>expected.has(h.url)&&h.status==='enabled'&&h.livemode===true);
  check('webhook_endpoint',Boolean(endpoint),'Enabled live webhook matches the production callback');
  check('webhook_events',Boolean(endpoint&&required.every(e=>endpoint.enabled_events?.includes('*')||endpoint.enabled_events?.includes(e))),'Required billing event subscriptions');
 }catch{checks.push({key:'stripe_read_access',state:'unknown',detail:'Read-only Stripe inspection unavailable; this does not prove purchases fail'});}
 const at=new Date().toISOString(),from=new Date(Date.now()-30*86400000).toISOString();
 const [verified,unfulfilled,stuck,webhookFailures]=await Promise.all([
  env.DB.prepare(`SELECT COUNT(*) total,MAX(r.verified_at) lastPaidAt FROM arc_payment_receipts r LEFT JOIN arc_commercial_versions v ON v.id=r.commercial_version_id WHERE r.state='paid' AND r.amount_cents>0 AND COALESCE(v.mode,'live')='live' AND r.verified_at>=?1 AND EXISTS(SELECT 1 FROM billing_plan_assignments a WHERE a.id='stripe:'||r.id AND a.subject_id=r.user_id) AND EXISTS(SELECT 1 FROM arc_credit_lots l WHERE l.source_ref=r.id AND l.user_id=r.user_id)`).bind(from).first(),
  env.DB.prepare(`SELECT r.id,r.user_id,r.product_id,r.verified_at FROM arc_payment_receipts r LEFT JOIN arc_commercial_versions v ON v.id=r.commercial_version_id WHERE r.state='paid' AND COALESCE(v.mode,'live')='live' AND r.verified_at>=?1 AND r.verified_at<?2 AND (NOT EXISTS(SELECT 1 FROM arc_credit_lots l WHERE l.source_ref=r.id AND l.user_id=r.user_id) OR (r.period_end IS NOT NULL AND NOT EXISTS(SELECT 1 FROM billing_plan_assignments a WHERE a.id='stripe:'||r.id AND a.subject_id=r.user_id))) ORDER BY r.verified_at DESC LIMIT 50`).bind(from,new Date(Date.now()-120000).toISOString()).all(),
  env.DB.prepare(`SELECT id,user_id,product_id,status,session_id,created_at,expires_at FROM arc_billing_checkouts WHERE status IN ('creating','open') AND created_at>=?1 AND created_at<?2 ORDER BY created_at DESC LIMIT 50`).bind(from,new Date(Date.now()-600000).toISOString()).all<{id:string;user_id:string;product_id:string;status:string;session_id:string|null;created_at:string}>(),
  env.DB.prepare("SELECT id,status,error_code,created_at FROM arc_payment_events WHERE created_at>=?2 AND (status='failed' OR (status='processing' AND lease_until<?1)) ORDER BY created_at DESC LIMIT 50").bind(at,from).all(),
 ]);
 const reconciliation=await Promise.all((stuck.results||[]).filter(c=>c.session_id).slice(0,10).map(async c=>{
  if(!providerReachable)return{checkoutId:c.id,state:'unavailable'};
  try{
   const session=await stripeRequest(env,'/v1/checkout/sessions/'+c.session_id);
   if(session.livemode!==true||session.status!=='complete'||session.payment_status!=='paid')return{checkoutId:c.id,state:'not_paid'};
   const receiptId=session.mode==='subscription'?stripeId(session.invoice):c.session_id;
   const fulfilled=receiptId?await env.DB.prepare("SELECT id FROM arc_payment_receipts WHERE id=?1 AND user_id=?2 AND state='paid'").bind(receiptId,c.user_id).first():null;
   return{checkoutId:c.id,userId:c.user_id,sessionId:c.session_id,state:fulfilled?'recorded':'paid_unprocessed'};
  }catch{return{checkoutId:c.id,state:'unavailable'};}
 }));
 const providerPaidUnprocessed=reconciliation.filter(r=>r.state==='paid_unprocessed');
 const accounts=await eventAccounts(env.DB,[...(unfulfilled.results||[]).map((r:any)=>r.user_id),...(stuck.results||[]).map(r=>r.user_id)]);
 return{checkedAt:at,checks,providerReachable,providerPaidUnprocessed,accounts,reconciliationChecked:reconciliation.length,reconciliationUnavailable:reconciliation.filter(r=>r.state==='unavailable').length,verifiedMemberships:verified,paidWithoutEntitlements:unfulfilled.results,unfinishedCheckouts:stuck.results,webhookFailures:webhookFailures.results,conclusion:checks.some(c=>c.state==='fail')?'blocked':(unfulfilled.results?.length||webhookFailures.results?.length||providerPaidUnprocessed.length)?'needs_attention':checks.some(c=>c.state==='unknown')||reconciliation.some(r=>r.state==='unavailable')?'unknown':'ready_unverified',limits:'Configuration and saved ledger evidence. No charge is made. An open checkout can mean abandonment. Browser completion is not proof of payment. Webhook secret correspondence and a new real-card purchase are not established by this probe.'};
}
