import {recordProductEvent,recordCheckoutCompletion} from './product-events.js';
import {linkBusinessReceipt} from './business-tracking.js';
import {arcEnabled,creditsEnabled} from './platform-launch.js';
import {ARC_PLANS,ARC_TOPUPS,ARC_CREDIT_RATE,ARC_PREMIUM_MODELS,CONNECT_UNLIMITED_PLAN_ID} from '@remotearc/protocol';
import {getSessionUser,sha256Hex} from './auth.js';
import {isTrustedDashboardMutation} from './dashboard-origin.js';
import {creditBalance,grantArcCredits} from './arc-credits.js';
import {currentArcPlan} from './arc-plan.js';
import {getMonthlyUsage} from './usage.js';
import {STRIPE_API_VERSION,stripeConfigured,stripeId,stripeLive,stripeRequest,verifyStripeSignature,StripeError,type StripeEnv} from './stripe-client.js';
import {activeCommercial,commercialVersion,commercialOffer,commercialCatalog,commercialMode,approvedCommercialPrice,ensureCommercialPrice} from './arc-commercial-config.js';
import {ensureStripeCustomer as customer} from './stripe-customer.js';
import {checkoutPromotion,invoicePromotion,type Promotion} from './arc-promotions.js';
import {publicArcAccess} from './arc-trial.js';
import {z} from 'zod';
import {stripePublishableKey} from './stripe-client.js';
import {nativeBillingAction,nativeBillingDetails} from './stripe-native.js';
export type BillingEnv=StripeEnv&{DB:D1Database;PUBLIC_ORIGIN:string;APP_ORIGIN?:string;DASHBOARD_ORIGIN?:string;ARC_CHAT_ENABLED?:string;ARC_CREDITS_ENABLED?:string};
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'cache-control':'no-store'}});
const now=()=>new Date().toISOString();
const iso=(v:unknown)=>{if(!Number.isSafeInteger(v)||Number(v)<1)throw new StripeError('BILLING_INVALID_PERIOD');return new Date(Number(v)*1000).toISOString();};
const id=(v:unknown,prefix:string)=>{const s=stripeId(v);if(!new RegExp('^'+prefix+'_[A-Za-z0-9_]+$').test(s))throw new StripeError('BILLING_INVALID_OBJECT');return s;};
const products=[...ARC_PLANS.filter(p=>p.id!=='free'),...ARC_TOPUPS].map(p=>({id:p.id}));
const product=(sku:unknown)=>{const p=products.find(p=>p.id===sku);if(!p)throw new StripeError('BILLING_INVALID_PRODUCT',400);return p;};
const form=(values:Record<string,string|number|boolean>)=>new URLSearchParams(Object.entries(values).map(([k,v])=>[k,String(v)]));
function checkoutResponse(env:BillingEnv,session:Record<string,any>,mode:string){
 if(mode==='embedded_page'){
  const publishableKey=stripePublishableKey(env),sessionId=id(session,'cs');
  if(!publishableKey||session.ui_mode!=='embedded_page'||typeof session.client_secret!=='string'||!session.client_secret.startsWith(sessionId+'_secret_'))throw new StripeError('BILLING_PROVIDER_ERROR');
  return{mode,sessionId,clientSecret:session.client_secret,publishableKey};
 }
 if(typeof session.url!=='string')throw new StripeError('BILLING_PROVIDER_ERROR');
 const url=new URL(session.url);if(url.origin!=='https://checkout.stripe.com'||url.username||url.password)throw new StripeError('BILLING_PROVIDER_ERROR');return{mode:'hosted_page',url:url.href};
}
async function boundedBody(request:Request,maximum:number){
 const reader=request.body?.getReader();if(!reader)throw new StripeError('BILLING_INVALID_REQUEST',400);
 let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>maximum){await reader.cancel();throw new StripeError('BILLING_REQUEST_TOO_LARGE',413);}chunks.push(p.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
/** Stable catalog IDs and lookup keys avoid manual Stripe Price IDs and duplicate products. */
export const ensureStripePrice=ensureCommercialPrice;
async function canonicalProduct(env:BillingEnv,priceId:unknown){return approvedCommercialPrice(env,await stripeRequest(env,'/v1/prices/'+id(priceId,'price')));}
async function payment(env:BillingEnv,paymentIntent:unknown,minimum:number){
 const pi=await stripeRequest(env,'/v1/payment_intents/'+id(paymentIntent,'pi'));
 const charge=await stripeRequest(env,'/v1/charges/'+id(pi.latest_charge,'ch'));
 if(pi.status!=='succeeded'||pi.currency!=='usd'||pi.amount_received<minimum||charge.paid!==true||charge.amount_refunded>0||charge.disputed===true)throw new StripeError('BILLING_PAYMENT_NOT_FINAL');
 return {intent:id(pi,'pi'),charge:id(charge,'ch')};
}
async function owner(env:BillingEnv,customerId:unknown){return env.DB.prepare('SELECT user_id FROM arc_billing_customers WHERE customer_id=?1').bind(id(customerId,'cus')).first<{user_id:string}>();}
type Receipt={receipt:string;eventId:string;userId:string;sku:string;versionId:string;cents:number;start:string|null;end:string|null;payment:{intent:string;charge:string};hash:string;discountCents?:number;promotionId?:string;checkoutId?:string};
async function fulfill(env:BillingEnv,r:Receipt){
 const version=await commercialVersion(env.DB,r.versionId),p=commercialOffer(version),at=now();if(p.id!==r.sku)throw new StripeError('BILLING_CATALOG_CONFLICT');
 // Connect-only plans carry neither Credits nor hosted-model grants.
 const hosted='allHostedModels' in version.config&&version.config.allHostedModels;
 await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO arc_payment_receipts(id,provider,event_id,user_id,product_id,state,amount_cents,currency,period_start,period_end,verified_at,payload_hash,commercial_version_id,discount_cents)
   SELECT ?1,'stripe',?2,?3,?4,'paid',?5,'usd',?6,?7,?8,?9,?11,?12 WHERE NOT EXISTS(SELECT 1 FROM arc_payment_blocks WHERE payment_intent_id=?10)`).bind(r.receipt,r.eventId,r.userId,r.sku,r.cents,r.start,r.end,at,r.hash,r.payment.intent,r.versionId,r.discountCents??0),
  env.DB.prepare(`INSERT OR IGNORE INTO arc_payment_links(receipt_id,payment_intent_id,charge_id) SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM arc_payment_receipts WHERE id=?1)`).bind(r.receipt,r.payment.intent,r.payment.charge),
  ...(r.promotionId?[env.DB.prepare(`INSERT OR IGNORE INTO arc_promotion_redemptions(promotion_id,user_id,receipt_id,discount_cents,created_at)
   SELECT ?1,?2,?3,?4,?5 WHERE EXISTS(SELECT 1 FROM arc_payment_receipts WHERE id=?3 AND user_id=?2 AND state='paid' AND discount_cents=?4)
   AND (SELECT COUNT(*) FROM arc_promotion_redemptions WHERE promotion_id=?1)<(SELECT max_redemptions FROM arc_billing_promotions WHERE id=?1)`)
   .bind(r.promotionId,r.userId,r.receipt,r.discountCents??0,at)]:[]),
 ]);
 const paid=await env.DB.prepare("SELECT id FROM arc_payment_receipts WHERE id=?1 AND user_id=?2 AND state='paid'").bind(r.receipt,r.userId).first();if(!paid)return;
 await linkBusinessReceipt(env,r.checkoutId,r.receipt,r.userId,r.sku);
 if(p.credits>0)await grantArcCredits(env.DB,{userId:r.userId,source:p.subscription?'subscription':'topup',sourceRef:r.receipt,units:p.credits*ARC_CREDIT_RATE.unitsPerCredit,...(r.start?{startsAt:r.start}:{}),expiresAt:r.end,reason:'Verified Stripe '+(p.subscription?'subscription invoice':'credit purchase')});
 if(p.subscription){
  await env.DB.batch([
   env.DB.prepare(`INSERT OR IGNORE INTO billing_plan_assignments(id,plan_id,subject_type,subject_id,expires_at,created_at,commercial_version_id) SELECT ?1,?2,'user',?3,?4,?5,?7 FROM arc_payment_receipts WHERE id=?6 AND state='paid'`).bind('stripe:'+r.receipt,r.sku,r.userId,r.end,at,r.receipt,r.versionId),
   ...(hosted?['openai','anthropic','openrouter'] as const:[]).map(provider=>env.DB.prepare(`INSERT OR IGNORE INTO billing_model_grants(id,user_id,organization_id,provider,max_cost_micros,expires_at,created_at) SELECT ?1,?2,?3,?4,1000000000,?5,?6 FROM arc_payment_receipts WHERE id=?7 AND state='paid'`).bind('stripe:'+r.receipt+':'+provider,r.userId,'personal:'+r.userId,provider,r.end,at,r.receipt)),
  ]);
 }
 await recordProductEvent(env,{domain:'billing',name:'billing.entitlement.granted',source:'stripe',outcome:'succeeded',userId:r.userId,entityId:r.receipt});
}
async function invoicePaid(env:BillingEnv,event:Record<string,any>,hash:string){
 const invoice=await stripeRequest(env,'/v1/invoices/'+id(event.data?.object,'in'));
 const user=await owner(env,invoice.customer);if(!user)return;
 if(invoice.livemode!==stripeLive(env)||invoice.status!=='paid'||invoice.currency!=='usd'||invoice.amount_remaining!==0||invoice.amount_paid!==invoice.total||invoice.post_payment_credit_notes_amount>0)throw new StripeError('BILLING_INVOICE_MISMATCH');
 const subscriptionId=id(invoice.parent?.subscription_details?.subscription||invoice.subscription,'sub');
 const subscription=await stripeRequest(env,'/v1/subscriptions/'+subscriptionId);
 if(id(subscription.customer,'cus')!==id(invoice.customer,'cus')||!['active','canceled'].includes(subscription.status))throw new StripeError('BILLING_SUBSCRIPTION_NOT_ACTIVE');
 const lines=await stripeRequest(env,'/v1/invoices/'+id(invoice,'in')+'/lines?limit=2');
 if(lines.has_more||lines.data?.length!==1)throw new StripeError('BILLING_INVOICE_MISMATCH');const line=lines.data[0];
 const p=await canonicalProduct(env,line.pricing?.price_details?.price||line.price);
 if(!p.subscription||line.quantity!==1||line.amount!==p.cents||invoice.subtotal_excluding_tax!==p.cents||line.parent?.subscription_item_details?.proration===true||line.proration===true||!['subscription_create','subscription_cycle'].includes(invoice.billing_reason))throw new StripeError('BILLING_INVOICE_MISMATCH');
 const promotion=await invoicePromotion(env,invoice,user.user_id,subscriptionId,p.id,p.cents,p.versionId);
 if(invoice.total_excluding_tax!==p.cents-promotion.discountCents)throw new StripeError('BILLING_INVOICE_MISMATCH');
 const start=iso(line.period?.start),end=iso(line.period?.end);if(end<=start)throw new StripeError('BILLING_INVALID_PERIOD');
 const payments=await stripeRequest(env,'/v1/invoice_payments?'+form({invoice:id(invoice,'in'),limit:2}));
 if(payments.has_more||payments.data?.length!==1||payments.data[0].status!=='paid')throw new StripeError('BILLING_PAYMENT_NOT_FINAL');
 const pay=await payment(env,payments.data[0].payment?.payment_intent,invoice.total);
 await fulfill(env,{receipt:id(invoice,'in'),eventId:id(event,'evt'),userId:user.user_id,sku:p.id,versionId:p.versionId,cents:p.cents-promotion.discountCents,start,end,payment:pay,hash,...promotion,checkoutId:invoice.billing_reason==='subscription_create'?String(subscription.metadata?.remote_arc_checkout||''):undefined});
 await env.DB.prepare("UPDATE arc_payment_issues SET status='resolved',updated_at=?1 WHERE invoice_id=?2").bind(now(),id(invoice,'in')).run();
  const at=now();await env.DB.prepare(`INSERT INTO arc_billing_subscriptions(id,user_id,product_id,status,period_end,cancel_at_period_end,updated_at,commercial_version_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?9) ON CONFLICT(id) DO UPDATE SET
   product_id=CASE WHEN excluded.period_end>=arc_billing_subscriptions.period_end THEN excluded.product_id ELSE arc_billing_subscriptions.product_id END,
   commercial_version_id=CASE WHEN excluded.period_end>=arc_billing_subscriptions.period_end THEN excluded.commercial_version_id ELSE arc_billing_subscriptions.commercial_version_id END,
   status=excluded.status,period_end=MAX(arc_billing_subscriptions.period_end,excluded.period_end),cancel_at_period_end=excluded.cancel_at_period_end,
   pending_product_id=CASE WHEN arc_billing_subscriptions.pending_product_id=excluded.product_id AND arc_billing_subscriptions.pending_effective_at<=?8 THEN NULL ELSE arc_billing_subscriptions.pending_product_id END,
   pending_effective_at=CASE WHEN arc_billing_subscriptions.pending_product_id=excluded.product_id AND arc_billing_subscriptions.pending_effective_at<=?8 THEN NULL ELSE arc_billing_subscriptions.pending_effective_at END,
   updated_at=excluded.updated_at`).bind(subscriptionId,user.user_id,p.id,subscription.status,end,Number(Boolean(subscription.cancel_at_period_end)),at,start,p.versionId).run();
 const open=await env.DB.prepare("SELECT 1 FROM arc_billing_checkouts WHERE user_id=?1 AND kind='subscription' AND status IN ('creating','open')").bind(user.user_id).first();
 if(open&&invoice.billing_reason==='subscription_create'){
  const sessions=await stripeRequest(env,'/v1/checkout/sessions?'+form({subscription:subscriptionId,limit:2}));
  if(!sessions.has_more)for(const session of sessions.data||[]){await env.DB.prepare("UPDATE arc_billing_checkouts SET status='complete',session_id=COALESCE(session_id,?1) WHERE user_id=?2 AND product_id=?3 AND commercial_version_id=?4 AND (session_id=?1 OR id=?5 AND session_id IS NULL)").bind(id(session,'cs'),user.user_id,p.id,p.versionId,String(session.metadata?.remote_arc_checkout||'')).run();await recordCheckoutCompletion(env,user.user_id,id(session,'cs'),id(invoice,'in'));}
 }
}
async function checkoutPaid(env:BillingEnv,event:Record<string,any>,hash:string){
 const session=await stripeRequest(env,'/v1/checkout/sessions/'+id(event.data?.object,'cs'));
 if(session.mode!=='payment')return;
 const intent=await env.DB.prepare('SELECT * FROM arc_billing_checkouts WHERE session_id=?1 OR (id=?2 AND session_id IS NULL)').bind(id(session,'cs'),String(session.metadata?.remote_arc_checkout||'')).first<{id:string;user_id:string;product_id:string;commercial_version_id:string|null}>();if(!intent)return;
 const user=await owner(env,session.customer),p=commercialOffer(await commercialVersion(env.DB,intent.commercial_version_id||`seed:${commercialMode(env)}:${intent.product_id}`));
 if(!user||user.user_id!==intent.user_id||p.subscription||session.livemode!==stripeLive(env)||session.payment_status!=='paid'||session.status!=='complete'||session.currency!=='usd'||session.amount_subtotal!==p.cents||session.total_details?.amount_discount>0)throw new StripeError('BILLING_CHECKOUT_MISMATCH');
 const lines=await stripeRequest(env,'/v1/checkout/sessions/'+id(session,'cs')+'/line_items?limit=2');
 if(lines.has_more||lines.data?.length!==1||lines.data[0].quantity!==1||(await canonicalProduct(env,lines.data[0].price)).versionId!==p.versionId)throw new StripeError('BILLING_CHECKOUT_MISMATCH');
 const pay=await payment(env,session.payment_intent,session.amount_total);
 await fulfill(env,{receipt:id(session,'cs'),eventId:id(event,'evt'),userId:user.user_id,sku:p.id,versionId:p.versionId,cents:p.cents,start:null,end:null,payment:pay,hash,checkoutId:intent.id});
 await env.DB.prepare("UPDATE arc_billing_checkouts SET status='complete' WHERE session_id=?1").bind(id(session,'cs')).run();
  await recordCheckoutCompletion(env,user.user_id,id(session,'cs'),id(session,'cs'));
}
async function blockPayment(env:BillingEnv,charge:Record<string,any>,reason:string){
 const intent=id(charge.payment_intent,'pi'),at=now();
 await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO arc_payment_blocks(payment_intent_id,reason,created_at) VALUES(?1,?2,?3)').bind(intent,reason,at),
  env.DB.prepare("UPDATE arc_payment_receipts SET state='refunded' WHERE id IN (SELECT receipt_id FROM arc_payment_links WHERE payment_intent_id=?1)").bind(intent),
  env.DB.prepare('UPDATE arc_credit_lots SET revoked_at=COALESCE(revoked_at,?1) WHERE source_ref IN (SELECT receipt_id FROM arc_payment_links WHERE payment_intent_id=?2)').bind(at,intent),
  env.DB.prepare("INSERT OR IGNORE INTO arc_credit_events(id,user_id,event_type,lot_id,units,reason,created_at) SELECT 'refund:'||id,user_id,'revoked',id,granted_units-spent_units-reserved_units,?1,?2 FROM arc_credit_lots WHERE source_ref IN (SELECT receipt_id FROM arc_payment_links WHERE payment_intent_id=?3)").bind('Stripe '+reason,at,intent),
  env.DB.prepare("UPDATE billing_plan_assignments SET revoked_at=COALESCE(revoked_at,?1) WHERE id IN (SELECT 'stripe:'||receipt_id FROM arc_payment_links WHERE payment_intent_id=?2)").bind(at,intent),
  ...(['openai','anthropic','openrouter'] as const).map(provider=>env.DB.prepare("UPDATE billing_model_grants SET revoked_at=COALESCE(revoked_at,?1) WHERE id IN (SELECT 'stripe:'||receipt_id||':'||?3 FROM arc_payment_links WHERE payment_intent_id=?2)").bind(at,intent,provider)),
 ]);
}
export async function processStripeEvent(env:BillingEnv,event:Record<string,any>,hash:string){
 if(event.livemode!==stripeLive(env)||event.account)throw new StripeError('BILLING_ACCOUNT_MISMATCH',400);
 const eventId=id(event,'evt'),token=crypto.randomUUID(),at=now(),lease=new Date(Date.now()+120000).toISOString();
 const claimed=await env.DB.prepare(`INSERT INTO arc_payment_events(id,payload_hash,status,created_at,lease_until,lease_token) VALUES(?1,?2,'processing',?3,?4,?5)
 ON CONFLICT(id) DO UPDATE SET status='processing',lease_until=excluded.lease_until,lease_token=excluded.lease_token,error_code=NULL
 WHERE arc_payment_events.status!='processed' AND (arc_payment_events.lease_until IS NULL OR arc_payment_events.lease_until<=?3) AND arc_payment_events.payload_hash=?2`).bind(eventId,hash,at,lease,token).run();
 if(!claimed.meta.changes){const row=await env.DB.prepare('SELECT status,payload_hash FROM arc_payment_events WHERE id=?1').bind(eventId).first<{status:string;payload_hash:string}>();if(row?.status==='processed')return;if(row?.payload_hash!==hash)throw new StripeError('BILLING_EVENT_CONFLICT',409);throw new StripeError('BILLING_EVENT_BUSY',503);}
 try{
  if(event.type==='invoice.paid')await invoicePaid(env,event,hash);
  else if(event.type==='invoice.payment_failed'){
   const invoice=await stripeRequest(env,'/v1/invoices/'+id(event.data?.object,'in')),user=await owner(env,invoice.customer);
   if(user&&invoice.livemode===stripeLive(env)&&invoice.currency==='usd')await env.DB.prepare(`INSERT INTO arc_payment_issues(invoice_id,user_id,amount_due_cents,status,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?5) ON CONFLICT(invoice_id) DO UPDATE SET status=excluded.status,amount_due_cents=excluded.amount_due_cents,updated_at=excluded.updated_at`).bind(id(invoice,'in'),user.user_id,invoice.amount_due,invoice.status==='paid'?'resolved':'open',now()).run();
    if(user&&invoice.livemode===stripeLive(env)&&invoice.currency==='usd'&&invoice.status!=='paid')await recordProductEvent(env,{domain:'billing',name:'billing.payment.failed',source:'stripe',outcome:'failed',userId:user.user_id,entityId:id(invoice,'in'),errorCode:'BILLING_INVOICE_PAYMENT_FAILED'});
  }
  else if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))await checkoutPaid(env,event,hash);
  else if(event.type==='charge.refunded'){
   const charge=await stripeRequest(env,'/v1/charges/'+id(event.data?.object,'ch'));if(charge.amount_refunded>0)await blockPayment(env,charge,'refund');
  }else if(event.type==='charge.dispute.created'){
   const dispute=await stripeRequest(env,'/v1/disputes/'+id(event.data?.object,'dp'));const charge=await stripeRequest(env,'/v1/charges/'+id(dispute.charge,'ch'));await blockPayment(env,charge,'dispute');
  }else if(['customer.subscription.updated','customer.subscription.deleted'].includes(event.type)){
   const s=await stripeRequest(env,'/v1/subscriptions/'+id(event.data?.object,'sub'));
   await env.DB.prepare('UPDATE arc_billing_subscriptions SET status=?1,cancel_at_period_end=?2,updated_at=?3,revision=revision+1 WHERE id=?4').bind(s.status,Number(Boolean(s.cancel_at_period_end)),now(),id(s,'sub')).run();
   // Cancellation retains the paid period. No renewal event means no next-period credits.
  }else if(event.type==='checkout.session.expired')await env.DB.prepare("UPDATE arc_billing_checkouts SET status='expired' WHERE session_id=?1 AND status IN ('creating','open')").bind(id(event.data?.object,'cs')).run();
  const settled=await env.DB.prepare("UPDATE arc_payment_events SET status='processed',completed_at=?1,lease_until=NULL WHERE id=?2 AND lease_token=?3").bind(now(),eventId,token).run();
  // Only the worker that committed the ledger under its own lease can report
  // success. Observability stays fail-open after the authoritative write.
  if(settled.meta.changes)await recordProductEvent(env,{domain:'billing',name:'billing.webhook.processed',source:'stripe',outcome:'succeeded',entityId:eventId});
 }catch(error){const code=error instanceof StripeError?error.code:'BILLING_FULFILLMENT_UNAVAILABLE';await recordProductEvent(env,{domain:'billing',name:'billing.webhook.failed',source:'stripe',outcome:'failed',entityId:eventId,errorCode:code});await env.DB.prepare("UPDATE arc_payment_events SET status='failed',lease_until=NULL,error_code=?1 WHERE id=?2 AND lease_token=?3").bind(code,eventId,token).run();throw error;}
}
async function portal(env:BillingEnv,customerId:string,returnUrl:string){
 // Only payment details, invoices and period-end cancellation; no prorated allowance duplication.
 const configurations=await stripeRequest(env,'/v1/billing_portal/configurations?active=true&limit=100');
 if(configurations.has_more)throw new StripeError('BILLING_CATALOG_CONFLICT');
 const existing=configurations.data?.find((c:any)=>c.metadata?.remote_arc==='billing-v1');
 if(existing&&(existing.features?.subscription_update?.enabled||existing.features?.subscription_cancel?.mode!=='at_period_end'))throw new StripeError('BILLING_CATALOG_CONFLICT');
 const config=existing||await stripeRequest(env,'/v1/billing_portal/configurations','POST',form({'business_profile[headline]':'Remote Arc billing','business_profile[privacy_policy_url]':'https://remotearc.app/privacy','business_profile[terms_of_service_url]':'https://remotearc.app/terms','metadata[remote_arc]':'billing-v1','features[payment_method_update][enabled]':true,'features[invoice_history][enabled]':true,'features[subscription_cancel][enabled]':true,'features[subscription_cancel][mode]':'at_period_end','features[subscription_update][enabled]':false}),'arc-portal-v1');
 const session=await stripeRequest(env,'/v1/billing_portal/sessions','POST',form({customer:customerId,configuration:id(config,'bpc'),return_url:returnUrl}));return session.url;
}
async function changePlan(env:BillingEnv,userId:string,customerId:string,sku:unknown,quotedVersion?:unknown){
 const target=commercialOffer(await activeCommercial(env,product(sku).id));if(!target.subscription)throw new StripeError('BILLING_INVALID_PRODUCT',400);
 const paid=await env.DB.prepare("SELECT * FROM arc_billing_subscriptions WHERE user_id=?1 AND period_end>?2 AND status='active' ORDER BY period_end DESC LIMIT 1").bind(userId,now()).first<{id:string;product_id:string;period_end:string;pending_product_id:string|null;revision:number}>();
 if(!paid||paid.product_id===target.id&&!paid.pending_product_id)throw new StripeError('BILLING_INVALID_PLAN_CHANGE',409);
 if(target.id!==paid.product_id&&(quotedVersion!==undefined?quotedVersion!==target.versionId:!target.versionId.startsWith('seed:')))throw new StripeError('BILLING_PRICE_CHANGED',409);
 if(paid.pending_product_id===target.id)return {scheduled:true,productId:target.id,effectiveAt:paid.period_end};
 const lease=crypto.randomUUID(),at=now();
 const claimed=await env.DB.prepare('UPDATE arc_billing_subscriptions SET change_lease_token=?1,change_lease_until=?2 WHERE id=?3 AND user_id=?4 AND revision=?5 AND (change_lease_until IS NULL OR change_lease_until<=?6)').bind(lease,new Date(Date.now()+180000).toISOString(),paid.id,userId,paid.revision,at).run();
 if(!claimed.meta.changes)throw new StripeError('BILLING_PLAN_CHANGE_BUSY',409);
 try{
 const subscription=await stripeRequest(env,'/v1/subscriptions/'+id(paid.id,'sub'));
 if(id(subscription.customer,'cus')!==customerId||subscription.status!=='active'||subscription.cancel_at_period_end||subscription.items?.data?.length!==1)throw new StripeError('BILLING_INVALID_PLAN_CHANGE',409);
 const current=subscription.items.data[0];if(current.quantity!==1||(await canonicalProduct(env,current.price)).id!==paid.product_id)throw new StripeError('BILLING_CATALOG_CONFLICT');
 const price=target.id===paid.product_id?id(current.price,'price'):await ensureStripePrice(env,target.id,target.versionId),schedule=subscription.schedule?await stripeRequest(env,'/v1/subscription_schedules/'+id(subscription.schedule,'sub_sched')):await stripeRequest(env,'/v1/subscription_schedules','POST',form({from_subscription:paid.id,'metadata[remote_arc_user]':userId}),'arc-schedule:'+paid.id+':'+paid.period_end);
 const boundary=Math.floor(Date.parse(paid.period_end)/1000);if(schedule.current_phase?.end_date!==boundary||schedule.current_phase?.start_date>=boundary)throw new StripeError('BILLING_INVALID_PERIOD');
 await stripeRequest(env,'/v1/subscription_schedules/'+id(schedule,'sub_sched'),'POST',form({end_behavior:'release',proration_behavior:'none','phases[0][start_date]':schedule.current_phase.start_date,'phases[0][end_date]':boundary,'phases[0][items][0][price]':id(current.price,'price'),'phases[0][items][0][quantity]':1,'phases[0][proration_behavior]':'none','phases[1][start_date]':boundary,'phases[1][duration][interval]':'month','phases[1][duration][interval_count]':1,'phases[1][items][0][price]':price,'phases[1][items][0][quantity]':1,'phases[1][proration_behavior]':'none'}),'arc-change:'+await sha256Hex(paid.id+':'+paid.revision+':'+target.id));
 await env.DB.prepare('UPDATE arc_billing_subscriptions SET pending_product_id=?1,pending_effective_at=?2,updated_at=?3,revision=revision+1 WHERE id=?4 AND user_id=?5 AND change_lease_token=?6').bind(target.id===paid.product_id?null:target.id,target.id===paid.product_id?null:paid.period_end,now(),paid.id,userId,lease).run();
 return {scheduled:true,productId:target.id,effectiveAt:paid.period_end};
 }finally{await env.DB.prepare('UPDATE arc_billing_subscriptions SET change_lease_token=NULL,change_lease_until=NULL WHERE id=?1 AND change_lease_token=?2').bind(paid.id,lease).run();}
}
export async function handleBilling(request:Request,env:BillingEnv){
 try{
  const path=new URL(request.url).pathname;
  if(path==='/api/billing/webhook'){
   if(request.method!=='POST')return json({error:'method_not_allowed'},405);
   if(!stripeConfigured(env))throw new StripeError('BILLING_NOT_CONFIGURED');
   const raw=await boundedBody(request,262144);await verifyStripeSignature(raw,request.headers.get('stripe-signature'),env.STRIPE_WEBHOOK_SECRET!);
   let event:Record<string,any>;try{event=JSON.parse(raw);}catch{throw new StripeError('BILLING_INVALID_EVENT',400);}
   // A signed notification is a trigger. Retrieve current data from our own Stripe account.
   const canonical=await stripeRequest(env,'/v1/events/'+id(event,'evt'));
   if(canonical.type!==event.type)throw new StripeError('BILLING_EVENT_CONFLICT',400);
   await processStripeEvent(env,canonical,await sha256Hex(raw));return json({received:true});
  }
  const user=await getSessionUser(request,env);if(!user)return json({error:'unauthorized'},401);
  if(request.method==='GET'&&path==='/api/billing/details')return json(await nativeBillingDetails(env,user.id));
  if(request.method==='GET'&&path==='/api/billing/checkout-status'){
   const sessionId=new URL(request.url).searchParams.get('session');
   if(!sessionId||!/^cs_(?:test_|live_)?[A-Za-z0-9_]{1,180}$/.test(sessionId))throw new StripeError('BILLING_INVALID_REQUEST',400);
   const checkout=await env.DB.prepare('SELECT status,product_id FROM arc_billing_checkouts WHERE user_id=?1 AND session_id=?2').bind(user.id,sessionId).first<{status:string;product_id:string}>();
   if(!checkout)return json({error:'not_found'},404);
   return json({status:checkout.status,productId:checkout.product_id});
  }
  if(request.method==='GET'&&path==='/api/billing'){
   const access=await publicArcAccess(env,user.id);
   const [plan,credits,usage,subscriptions,customer,catalog]=await Promise.all([currentArcPlan(env,user.id),creditBalance(env.DB,user.id),getMonthlyUsage(env,user.id),env.DB.prepare('SELECT product_id,status,period_end,cancel_at_period_end,pending_product_id,pending_effective_at,revision FROM arc_billing_subscriptions WHERE user_id=?1 ORDER BY period_end DESC LIMIT 10').bind(user.id).all(),env.DB.prepare('SELECT 1 AS present FROM arc_billing_customers WHERE user_id=?1').bind(user.id).first(),commercialCatalog(env)]);
    return json({embeddedCheckoutEnabled:Boolean(stripeConfigured(env)&&stripePublishableKey(env)),subscriptionManagementEnabled:stripeConfigured(env)&&Boolean(customer),enabled:stripeConfigured(env)&&arcEnabled(env)&&creditsEnabled(env),connectEnabled:stripeConfigured(env),portalEnabled:stripeConfigured(env)&&Boolean(customer),hasCustomer:Boolean(customer),plan,access,credits,usage,plans:catalog.plans,topups:catalog.topups,models:ARC_PREMIUM_MODELS.map(m=>({id:m.id,label:m.label,inputCreditsPer1000:m.inputMicrosPerMillion/2000000,outputCreditsPer1000:m.outputMicrosPerMillion/2000000})),subscriptions:subscriptions.results});
  }
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  if(!isTrustedDashboardMutation(request,env))throw new StripeError('same_origin_required',403);
   if(!stripeConfigured(env)||(!path.startsWith('/api/billing/subscription/')&&!path.startsWith('/api/billing/payment-method/')&&!['/api/billing/portal','/api/billing/checkout','/api/billing/plan/change'].includes(path)&&(!arcEnabled(env)||!creditsEnabled(env))))throw new StripeError('BILLING_NOT_CONFIGURED');
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new StripeError('BILLING_JSON_REQUIRED',415);
  let input:Record<string,unknown>;try{input=JSON.parse(await boundedBody(request,2048));if(!input||typeof input!=='object'||Array.isArray(input))throw 0;}catch(e){if(e instanceof StripeError)throw e;throw new StripeError('BILLING_INVALID_REQUEST',400);}
  if(['/api/billing/subscription/renewal','/api/billing/payment-method/setup','/api/billing/payment-method/confirm','/api/billing/checkout/abandon'].includes(path))return json(await nativeBillingAction(env,user.id,path,input));
  if(!['/api/billing/portal','/api/billing/plan/change','/api/billing/checkout'].includes(path))return json({error:'not_found'},404);
  if(Object.keys(input).some(key=>!['productId','versionId','promoCode','uiMode'].includes(key))||path==='/api/billing/portal'&&Object.keys(input).length)throw new StripeError('BILLING_INVALID_REQUEST',400);
  // Connect Unlimited is sold even while hosted Arc is paused; Arc products are not.
  if(path!=='/api/billing/portal'&&input.productId!==CONNECT_UNLIMITED_PLAN_ID&&(!arcEnabled(env)||!creditsEnabled(env)))throw new StripeError('BILLING_NOT_CONFIGURED');
  if(path!=='/api/billing/portal')product(input.productId);
  const returnUrl=new URL(path==='/api/billing/portal'?'/settings?section=billing':'/checkout?product='+encodeURIComponent(String(input.productId)),env.DASHBOARD_ORIGIN||env.APP_ORIGIN||env.PUBLIC_ORIGIN).toString(),customerId=await customer(env,user.id,user.email);
  if(path==='/api/billing/portal')return json({url:await portal(env,customerId,returnUrl)});
  if(path==='/api/billing/plan/change')return json(await changePlan(env,user.id,customerId,input.productId,input.versionId));
  if(path!=='/api/billing/checkout')return json({error:'not_found'},404);
  const uiMode=input.uiMode??'hosted_page';if(!['hosted_page','embedded_page'].includes(String(uiMode)))throw new StripeError('BILLING_INVALID_REQUEST',400);if(uiMode==='embedded_page'&&!stripePublishableKey(env))throw new StripeError('BILLING_EMBEDDED_NOT_CONFIGURED');
  let p=commercialOffer(await activeCommercial(env,product(input.productId).id));const at=now(),plan=await currentArcPlan(env,user.id);
  if(input.versionId!==undefined?input.versionId!==p.versionId:!p.versionId.startsWith('seed:'))throw new StripeError('BILLING_PRICE_CHANGED',409);
  if(!p.subscription&&input.promoCode!==undefined)throw new StripeError('BILLING_INVALID_PROMOTION',400);
  if(p.subscription){const active=await stripeRequest(env,'/v1/subscriptions?'+form({customer:customerId,status:'all',limit:100}));if(active.has_more||active.data?.some((s:any)=>!['canceled','incomplete_expired'].includes(s.status)))throw new StripeError('BILLING_USE_EXISTING_SUBSCRIPTION',409);}
  else if(!plan.allHostedModels)throw new StripeError('BILLING_SUBSCRIPTION_REQUIRED',402);
  await env.DB.prepare("UPDATE arc_billing_checkouts SET status='expired' WHERE user_id=?1 AND expires_at<=?2 AND status IN ('creating','open')").bind(user.id,at).run();
  const pending=await env.DB.prepare("SELECT id,session_id,expires_at,commercial_version_id,promotion_id,ui_mode FROM arc_billing_checkouts WHERE user_id=?1 AND product_id=?2 AND status IN ('creating','open') AND expires_at>?3 ORDER BY created_at DESC LIMIT 1").bind(user.id,p.id,at).first<{id:string;session_id:string|null;expires_at:string;commercial_version_id:string|null;promotion_id:string|null;ui_mode:string}>();
  let promo:Promotion|null=null;
  if(pending&&pending.ui_mode!==uiMode)throw new StripeError('BILLING_CHECKOUT_ALREADY_OPEN',409);
  if(pending){
   p=commercialOffer(await commercialVersion(env.DB,pending.commercial_version_id||`seed:${commercialMode(env)}:${p.id}`));
   if(pending.promotion_id)promo=await env.DB.prepare('SELECT * FROM arc_billing_promotions WHERE id=?1').bind(pending.promotion_id).first<Promotion>();
   if(input.promoCode!==undefined&&(!promo||typeof input.promoCode!=='string'||input.promoCode.trim().toUpperCase()!==promo.code))throw new StripeError('BILLING_CHECKOUT_ALREADY_OPEN',409);
  }else if(p.subscription)promo=await checkoutPromotion(env,user.id,customerId,p.id,input.promoCode);
  if(pending?.session_id){const session=await stripeRequest(env,'/v1/checkout/sessions/'+id(pending.session_id,'cs'));if(session.status==='open')return json(checkoutResponse(env,session,pending.ui_mode));throw new StripeError('BILLING_CHECKOUT_AWAITING_CONFIRMATION',409);}
  const checkoutId=pending?.id||crypto.randomUUID();let expires=pending?.expires_at||new Date(Date.now()+3600000).toISOString();
  // Stripe's 30-minute minimum starts when the Session is created, not when
  // our request began. Reserve a one-hour lifetime for provider/preflight delay.
  // A legacy invalid-expiry intent keeps its SAME key. Validation failures are
  // not cached by Stripe; an already-executed key rejects changed parameters
  // instead of creating a second Session. Unknown outcomes never get a new ID.
  if(pending&&!pending.session_id&&Date.parse(expires)<Date.now()+2100000){
   const extended=new Date(Date.now()+3600000).toISOString();
   await env.DB.prepare("UPDATE arc_billing_checkouts SET expires_at=?1 WHERE id=?2 AND user_id=?3 AND status='creating' AND session_id IS NULL AND expires_at=?4").bind(extended,checkoutId,user.id,expires).run();
   expires=(await env.DB.prepare('SELECT expires_at FROM arc_billing_checkouts WHERE id=?1 AND user_id=?2').bind(checkoutId,user.id).first<{expires_at:string}>())!.expires_at;
  }
  if(!pending)try{const inserted=await env.DB.prepare(`INSERT INTO arc_billing_checkouts(id,user_id,product_id,kind,status,expires_at,created_at,commercial_version_id,promotion_id,ui_mode) SELECT ?1,?2,?3,?4,'creating',?5,?6,?7,?8,?9 WHERE (SELECT COUNT(*) FROM arc_billing_checkouts WHERE user_id=?2 AND status IN ('creating','open'))<3`).bind(checkoutId,user.id,p.id,p.subscription?'subscription':'payment',expires,at,p.versionId,promo?.id??null,uiMode).run();if(!inserted.meta.changes)throw 0;}catch{throw new StripeError('BILLING_CHECKOUT_ALREADY_OPEN',409);}
  const price=await ensureStripePrice(env,p.id,p.versionId),session=await stripeRequest(env,'/v1/checkout/sessions','POST',form({customer:customerId,mode:p.subscription?'subscription':'payment','line_items[0][price]':price,'line_items[0][quantity]':1,...(promo?{'discounts[0][promotion_code]':promo.promotion_code_id!}:{}),...(uiMode==='embedded_page'?{ui_mode:'embedded_page',return_url:returnUrl+'&checkout=success&session_id={CHECKOUT_SESSION_ID}',redirect_on_completion:'if_required'}:{success_url:returnUrl+'&checkout=success&session_id={CHECKOUT_SESSION_ID}',cancel_url:returnUrl+'&checkout=cancelled'}),expires_at:Math.floor(Date.parse(expires)/1000),'automatic_tax[enabled]':env.STRIPE_AUTOMATIC_TAX==='1',...(env.STRIPE_AUTOMATIC_TAX==='1'?{billing_address_collection:'required','customer_update[address]':'auto','tax_id_collection[enabled]':true}:{}),'metadata[remote_arc_checkout]':checkoutId,...(p.subscription?{'subscription_data[metadata][remote_arc_user]':user.id,'subscription_data[metadata][remote_arc_checkout]':checkoutId}:{'payment_intent_data[metadata][remote_arc_user]':user.id})}),'arc-checkout:'+checkoutId);
  const sessionId=id(session,'cs'),result=checkoutResponse(env,session,String(uiMode));
  await env.DB.prepare("UPDATE arc_billing_checkouts SET session_id=?1,status='open' WHERE id=?2").bind(sessionId,checkoutId).run();return json(result);
 }catch(error){return json({error:error instanceof StripeError?error.code:error instanceof z.ZodError?'BILLING_INVALID_REQUEST':'BILLING_UNAVAILABLE',...(error instanceof StripeError&&error.reference?{reference:error.reference}:{})},error instanceof StripeError?error.status:error instanceof z.ZodError?400:503);}
}
