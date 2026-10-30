import {sha256Hex} from '../auth/auth.js';
import {stripeRequest,stripeId,StripeError,type StripeEnv} from './stripe-client.js';
export async function ensureStripeCustomer(env:StripeEnv&{DB:D1Database},userId:string,email:string){
 const existing=await env.DB.prepare('SELECT customer_id FROM arc_billing_customers WHERE user_id=?1').bind(userId).first<{customer_id:string}>();if(existing)return existing.customer_id;
 const created=await stripeRequest(env,'/v1/customers','POST',new URLSearchParams({email,'metadata[remote_arc_user]':userId}),'arc-customer:'+await sha256Hex(userId)),customerId=stripeId(created);
 if(!/^cus_[A-Za-z0-9]+$/.test(customerId))throw new StripeError('BILLING_INVALID_OBJECT');
 await env.DB.prepare('INSERT OR IGNORE INTO arc_billing_customers(user_id,customer_id,created_at) VALUES(?1,?2,?3)').bind(userId,customerId,new Date().toISOString()).run();
 return(await env.DB.prepare('SELECT customer_id FROM arc_billing_customers WHERE user_id=?1').bind(userId).first<{customer_id:string}>())!.customer_id;
}
