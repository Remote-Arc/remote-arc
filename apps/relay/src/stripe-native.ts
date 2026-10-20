import {z} from 'zod';
import {stripeRequest,stripeId,stripeLive,stripePublishableKey,StripeError} from './stripe-client.js';
import type {BillingEnv} from './stripe-billing.js';

const form=(value:Record<string,string|boolean>)=>new URLSearchParams(Object.entries(value).map(([key,item])=>[key,String(item)]));
const at=()=>new Date().toISOString();
const objectId=(value:unknown,prefix:string)=>{const id=stripeId(value);if(!new RegExp('^'+prefix+'_[A-Za-z0-9_]+$').test(id))throw new StripeError('BILLING_INVALID_OBJECT');return id;};
async function customer(env:BillingEnv,userId:string){const row=await env.DB.prepare('SELECT customer_id FROM arc_billing_customers WHERE user_id=?1').bind(userId).first<{customer_id:string}>();if(!row)throw new StripeError('BILLING_CUSTOMER_REQUIRED',404);return row.customer_id;}
function owned(env:BillingEnv,value:Record<string,any>,customerId:string){if(stripeId(value.customer)!==customerId||value.livemode!==stripeLive(env))throw new StripeError('BILLING_CUSTOMER_MISMATCH',403);}
const renewalInput=z.object({action:z.enum(['cancel','resume']),revision:z.number().int().nonnegative()}).strict();
async function renewal(env:BillingEnv,userId:string,input:unknown){
 const value=renewalInput.parse(input),customerId=await customer(env,userId),date=at();
 const row=await env.DB.prepare("SELECT id,revision,period_end,pending_product_id FROM arc_billing_subscriptions WHERE user_id=?1 AND period_end>?2 AND status IN ('active','trialing','past_due','unpaid') ORDER BY period_end DESC LIMIT 1").bind(userId,date).first<{id:string;revision:number;period_end:string;pending_product_id:string|null}>();
 if(!row)throw new StripeError('BILLING_SUBSCRIPTION_REQUIRED',404);
 if(row.revision!==value.revision)throw new StripeError('BILLING_SUBSCRIPTION_CHANGED',409);
 const lease=crypto.randomUUID(),claim=await env.DB.prepare('UPDATE arc_billing_subscriptions SET change_lease_token=?1,change_lease_until=?2 WHERE id=?3 AND user_id=?4 AND revision=?5 AND (change_lease_until IS NULL OR change_lease_until<=?6)').bind(lease,new Date(Date.now()+180000).toISOString(),row.id,userId,value.revision,date).run();
 if(!claim.meta.changes)throw new StripeError('BILLING_PLAN_CHANGE_BUSY',409);
 try{
  let subscription=await stripeRequest(env,'/v1/subscriptions/'+objectId(row.id,'sub'));owned(env,subscription,customerId);
  if(!['active','trialing','past_due','unpaid'].includes(subscription.status))throw new StripeError('BILLING_SUBSCRIPTION_CHANGED',409);
  const cancel=value.action==='cancel';
  if(subscription.schedule&&cancel){
   const schedule=await stripeRequest(env,'/v1/subscription_schedules/'+objectId(subscription.schedule,'sub_sched'));
   if(stripeId(schedule.subscription)!==row.id||schedule.current_phase?.end_date!==Math.floor(Date.parse(row.period_end)/1000)||!(schedule.metadata?.remote_arc_user===userId||row.pending_product_id))throw new StripeError('BILLING_SCHEDULE_CONFLICT',409);
   // Remove the pending plan change before cancelling renewal at this period's end.
   await stripeRequest(env,'/v1/subscription_schedules/'+objectId(schedule,'sub_sched')+'/release','POST',form({preserve_cancel_date:false}),'arc-renewal-release:'+row.id+':'+value.revision);
   subscription=await stripeRequest(env,'/v1/subscriptions/'+row.id);owned(env,subscription,customerId);
  }
  if(Boolean(subscription.cancel_at_period_end)!==cancel)subscription=await stripeRequest(env,'/v1/subscriptions/'+row.id,'POST',form({cancel_at_period_end:cancel,proration_behavior:'none'}),'arc-renewal:'+row.id+':'+value.revision+':'+value.action);
  owned(env,subscription,customerId);if(Boolean(subscription.cancel_at_period_end)!==cancel)throw new StripeError('BILLING_SUBSCRIPTION_CHANGED',409);
  await env.DB.prepare('UPDATE arc_billing_subscriptions SET status=?1,cancel_at_period_end=?2,pending_product_id=CASE WHEN ?2=1 THEN NULL ELSE pending_product_id END,pending_effective_at=CASE WHEN ?2=1 THEN NULL ELSE pending_effective_at END,revision=revision+1,updated_at=?3 WHERE id=?4 AND user_id=?5 AND change_lease_token=?6').bind(subscription.status,Number(cancel),at(),row.id,userId,lease).run();
  return{cancelAtPeriodEnd:cancel,effectiveAt:row.period_end};
 }finally{await env.DB.prepare('UPDATE arc_billing_subscriptions SET change_lease_token=NULL,change_lease_until=NULL WHERE id=?1 AND change_lease_token=?2').bind(row.id,lease).run();}
}
export async function nativeBillingAction(env:BillingEnv,userId:string,path:string,input:unknown){
 if(path==='/api/billing/subscription/renewal')return renewal(env,userId,input);
 const customerId=await customer(env,userId);
 if(path==='/api/billing/checkout/abandon'){
  const value=z.object({sessionId:z.string().regex(/^cs_[A-Za-z0-9_]+$/)}).strict().parse(input);
  const row=await env.DB.prepare('SELECT id,status FROM arc_billing_checkouts WHERE user_id=?1 AND session_id=?2').bind(userId,value.sessionId).first<{id:string;status:string}>();if(!row)throw new StripeError('BILLING_CHECKOUT_NOT_FOUND',404);
  if(row.status==='expired')return{expired:true};
  let session=await stripeRequest(env,'/v1/checkout/sessions/'+value.sessionId);owned(env,session,customerId);
  if(session.status==='complete')return{complete:true};
  if(session.status==='open')session=await stripeRequest(env,'/v1/checkout/sessions/'+value.sessionId+'/expire','POST',new URLSearchParams(),'arc-checkout-expire:'+row.id);
  if(session.status!=='expired')throw new StripeError('BILLING_CHECKOUT_AWAITING_CONFIRMATION',409);
  await env.DB.prepare("UPDATE arc_billing_checkouts SET status='expired' WHERE id=?1 AND user_id=?2 AND status IN ('creating','open')").bind(row.id,userId).run();return{expired:true};
 }
 if(path==='/api/billing/payment-method/setup'){
  const value=z.object({requestId:z.uuid()}).strict().parse(input),publishableKey=stripePublishableKey(env);if(!publishableKey)throw new StripeError('BILLING_EMBEDDED_NOT_CONFIGURED');
  const setup=await stripeRequest(env,'/v1/setup_intents','POST',form({customer:customerId,usage:'off_session','automatic_payment_methods[enabled]':true,'metadata[remote_arc_user]':userId,'metadata[remote_arc_purpose]':'billing-default'}),'arc-method-setup:'+userId+':'+value.requestId);
  owned(env,setup,customerId);const id=objectId(setup,'seti');if(typeof setup.client_secret!=='string'||!setup.client_secret.startsWith(id+'_secret_'))throw new StripeError('BILLING_PROVIDER_ERROR');
  const current=await stripeRequest(env,'/v1/setup_intents/'+id);owned(env,current,customerId);
  if(current.status==='succeeded'&&current.metadata?.remote_arc_user===userId&&current.metadata?.remote_arc_purpose==='billing-default')return{id,verified:true,publishableKey};
  return{id,clientSecret:setup.client_secret,publishableKey};
 }
 if(path==='/api/billing/payment-method/confirm'){
  const value=z.object({setupIntentId:z.string().regex(/^seti_[A-Za-z0-9_]+$/)}).strict().parse(input),setup=await stripeRequest(env,'/v1/setup_intents/'+value.setupIntentId);owned(env,setup,customerId);
  if(setup.status!=='succeeded'||setup.metadata?.remote_arc_user!==userId||setup.metadata?.remote_arc_purpose!=='billing-default')throw new StripeError('BILLING_PAYMENT_METHOD_NOT_READY',409);
  const method=objectId(setup.payment_method,'pm');
  await stripeRequest(env,'/v1/customers/'+customerId,'POST',form({'invoice_settings[default_payment_method]':method}),'arc-method-customer:'+value.setupIntentId);
  const rows=(await env.DB.prepare("SELECT id FROM arc_billing_subscriptions WHERE user_id=?1 AND status IN ('active','trialing','past_due','unpaid')").bind(userId).all<{id:string}>()).results;
  for(const row of rows){const subscription=await stripeRequest(env,'/v1/subscriptions/'+objectId(row.id,'sub'));owned(env,subscription,customerId);await stripeRequest(env,'/v1/subscriptions/'+row.id,'POST',form({default_payment_method:method}),'arc-method-subscription:'+value.setupIntentId+':'+row.id);}
  return{updated:true};
 }
 throw new StripeError('BILLING_INVALID_REQUEST',400);
}
function pdfUrl(value:unknown){if(typeof value!=='string')return null;try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&['pay.stripe.com','invoice.stripe.com','files.stripe.com'].includes(url.hostname)?url.href:null;}catch{return null;}}
export async function nativeBillingDetails(env:BillingEnv,userId:string){
 const row=await env.DB.prepare('SELECT customer_id FROM arc_billing_customers WHERE user_id=?1').bind(userId).first<{customer_id:string}>();if(!row)return{paymentMethod:null,invoices:[],hasMore:false};
 const [account,invoices]=await Promise.all([stripeRequest(env,'/v1/customers/'+row.customer_id+'?expand[]=invoice_settings.default_payment_method'),stripeRequest(env,'/v1/invoices?'+form({customer:row.customer_id,limit:'10'}))]);
 if(account.id!==row.customer_id||account.livemode!==stripeLive(env)||account.deleted)throw new StripeError('BILLING_CUSTOMER_MISMATCH',403);
 const method=account.invoice_settings?.default_payment_method,card=method?.card;
 const paymentMethod=method&&typeof method==='object'&&stripeId(method.customer)===row.customer_id&&card?{type:'card',brand:String(card.brand),last4:String(card.last4),expMonth:Number(card.exp_month),expYear:Number(card.exp_year)}:null;
 return{paymentMethod,invoices:(invoices.data||[]).map((invoice:Record<string,any>)=>{owned(env,invoice,row.customer_id);return{id:objectId(invoice,'in'),number:invoice.number||null,status:invoice.status,currency:invoice.currency,amountPaid:invoice.amount_paid,amountDue:invoice.amount_due,createdAt:new Date(invoice.created*1000).toISOString(),pdfUrl:pdfUrl(invoice.invoice_pdf)};}),hasMore:Boolean(invoices.has_more)};
}
