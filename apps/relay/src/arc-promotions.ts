import {z} from 'zod';
import {commercialMode,ensureCommercialPrice,type CommercialEnv} from './arc-commercial-config.js';
import {stripeRequest,stripeId,StripeError} from './stripe-client.js';
import {ensureStripeCustomer} from './stripe-customer.js';

export const promotionInput=z.object({id:z.string().uuid(),code:z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9-]+$/).transform(v=>v.toUpperCase()),productId:z.enum(['arc-plus-v1','arc-pro-v1']),percentOff:z.number().int().min(1).max(90),targetEmail:z.string().email().max(200).optional(),expiresAt:z.string().datetime({offset:true}),maxRedemptions:z.number().int().min(1).max(100000)}).strict();
export type Promotion={id:string;mode:string;code:string;product_id:string;percent_off:number;target_user_id:string|null;expires_at:string;max_redemptions:number;coupon_id:string|null;promotion_code_id:string|null;status:'draft'|'active'|'disabled';created_at:string};
const now=()=>new Date().toISOString();
const form=(values:Record<string,string|number|boolean>)=>new URLSearchParams(Object.entries(values).map(([k,v])=>[k,String(v)]));
async function audit(env:CommercialEnv,actor:string,action:string,promo:Promotion){await env.DB.prepare('INSERT INTO arc_commercial_audit VALUES(?1,?2,?3,?4,?5,?6,?7)').bind(crypto.randomUUID(),actor,action,promo.id,promo.mode,JSON.stringify({code:promo.code,productId:promo.product_id,targetUserId:promo.target_user_id}),now()).run();}
export async function savePromotionDraft(env:CommercialEnv,actor:string,value:unknown){
 const input=promotionInput.parse(value),mode=commercialMode(env);if(Date.parse(input.expiresAt)<=Date.now()||Date.parse(input.expiresAt)>Date.now()+366*86400000)throw new StripeError('BILLING_INVALID_PROMOTION',400);
 const target=input.targetEmail?await env.DB.prepare('SELECT id FROM users WHERE lower(email)=lower(?1)').bind(input.targetEmail).first<{id:string}>():null;if(input.targetEmail&&!target)throw new StripeError('BILLING_USER_NOT_FOUND',404);
 const existing=await env.DB.prepare('SELECT * FROM arc_billing_promotions WHERE id=?1').bind(input.id).first<Promotion>();
 if(existing){if(existing.mode!==mode||existing.code!==input.code||existing.product_id!==input.productId||existing.percent_off!==input.percentOff||existing.target_user_id!==(target?.id??null)||existing.expires_at!==input.expiresAt||existing.max_redemptions!==input.maxRedemptions)throw new StripeError('BILLING_PROMOTION_CONFLICT',409);return existing;}
 const duplicate=await env.DB.prepare('SELECT id FROM arc_billing_promotions WHERE mode=?1 AND code=?2').bind(mode,input.code).first();if(duplicate)throw new StripeError('BILLING_PROMOTION_CODE_EXISTS',409);
 await env.DB.prepare("INSERT INTO arc_billing_promotions(id,mode,code,product_id,percent_off,target_user_id,expires_at,max_redemptions,status,created_by_user_id,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'draft',?9,?10)").bind(input.id,mode,input.code,input.productId,input.percentOff,target?.id??null,input.expiresAt,input.maxRedemptions,actor,now()).run();
 const row=(await env.DB.prepare('SELECT * FROM arc_billing_promotions WHERE id=?1').bind(input.id).first<Promotion>())!;await audit(env,actor,'promotion_drafted',row);return row;
}
async function validateCoupon(env:CommercialEnv,p:Promotion){
 const coupon=await stripeRequest(env,'/v1/coupons/'+p.coupon_id+'?expand[0]=applies_to');
 if(coupon.percent_off!==p.percent_off||coupon.duration!=='once'||coupon.max_redemptions!==p.max_redemptions||coupon.redeem_by!==Math.floor(Date.parse(p.expires_at)/1000)||coupon.amount_off!==null&&coupon.amount_off!==undefined||coupon.metadata?.remote_arc_promotion!==p.id||coupon.applies_to?.products?.length!==1||coupon.applies_to.products[0]!=='remote_arc_'+p.product_id.replaceAll('-','_'))throw new StripeError('BILLING_PROMOTION_MISMATCH');
 return coupon;
}
export async function publishPromotion(env:CommercialEnv,actor:string,promotionId:string){
 let p=await env.DB.prepare('SELECT * FROM arc_billing_promotions WHERE id=?1 AND mode=?2').bind(promotionId,commercialMode(env)).first<Promotion>();if(!p)throw new StripeError('BILLING_PROMOTION_NOT_FOUND',404);
 if(p.status==='disabled')throw new StripeError('BILLING_PROMOTION_DISABLED',409);
 if(Date.parse(p.expires_at)<=Date.now())throw new StripeError('BILLING_PROMOTION_EXPIRED',409);
 if(p.status==='draft'){
  await ensureCommercialPrice(env,p.product_id);const couponId='arc_coupon_'+p.id.replaceAll('-','');
  let coupon;try{coupon=await stripeRequest(env,'/v1/coupons/'+couponId);}catch(e){if(!(e instanceof StripeError)||e.status!==404)throw e;coupon=await stripeRequest(env,'/v1/coupons','POST',form({id:couponId,name:p.code,duration:'once',percent_off:p.percent_off,max_redemptions:p.max_redemptions,redeem_by:Math.floor(Date.parse(p.expires_at)/1000),'applies_to[products][0]':'remote_arc_'+p.product_id.replaceAll('-','_'),'metadata[remote_arc_promotion]':p.id}),'arc-coupon:'+p.id);}
  p={...p,coupon_id:stripeId(coupon)};await validateCoupon(env,p);
  let customerId:string|undefined;if(p.target_user_id){const user=await env.DB.prepare('SELECT email FROM users WHERE id=?1').bind(p.target_user_id).first<{email:string}>();if(!user)throw new StripeError('BILLING_USER_NOT_FOUND');customerId=await ensureStripeCustomer(env,p.target_user_id,user.email);}
  const found=await stripeRequest(env,'/v1/promotion_codes?'+form({code:p.code,limit:2}));if(found.has_more||found.data?.length>1)throw new StripeError('BILLING_PROMOTION_CONFLICT',409);
  const code=found.data?.[0]||await stripeRequest(env,'/v1/promotion_codes','POST',form({'promotion[type]':'coupon','promotion[coupon]':p.coupon_id!,code:p.code,expires_at:Math.floor(Date.parse(p.expires_at)/1000),max_redemptions:p.max_redemptions,'metadata[remote_arc_promotion]':p.id,...(customerId?{customer:customerId}:{})}),'arc-promo-code:'+p.id);
  if(stripeId(code.promotion?.coupon)!==p.coupon_id||code.metadata?.remote_arc_promotion!==p.id||stripeId(code.customer)!==(customerId||''))throw new StripeError('BILLING_PROMOTION_MISMATCH');
  await env.DB.prepare("UPDATE arc_billing_promotions SET coupon_id=?1,promotion_code_id=?2,status='active',published_at=?3 WHERE id=?4 AND status='draft'").bind(p.coupon_id,stripeId(code),now(),p.id).run();
  p={...p,promotion_code_id:stripeId(code),status:'active'};await audit(env,actor,'promotion_published',p);
 }
 if(p.target_user_id)await applyTargetPromotion(env,p);
 return{id:p.id,published:true};
}
async function applyTargetPromotion(env:CommercialEnv,p:Promotion){
 if(!p.target_user_id)return;
 const used=await env.DB.prepare('SELECT receipt_id FROM arc_promotion_redemptions WHERE promotion_id=?1 AND user_id=?2').bind(p.id,p.target_user_id).first();if(used)return;
 const existing=await env.DB.prepare('SELECT * FROM arc_promotion_assignments WHERE promotion_id=?1 AND user_id=?2').bind(p.id,p.target_user_id).first<{status:string;created_at:string;subscription_id:string}>();
 if(existing?.status==='applied')return;
 if(existing&&Date.now()-Date.parse(existing.created_at)>=23*3600000)throw new StripeError('BILLING_PROMOTION_REVIEW_REQUIRED',409);
 const sub=await env.DB.prepare("SELECT id FROM arc_billing_subscriptions WHERE user_id=?1 AND product_id=?2 AND status='active' AND period_end>?3 ORDER BY period_end DESC LIMIT 1").bind(p.target_user_id,p.product_id,now()).first<{id:string}>();if(!sub)return;
 const lease=crypto.randomUUID(),at=now();
 const claimed=await env.DB.prepare('UPDATE arc_billing_subscriptions SET change_lease_token=?1,change_lease_until=?2 WHERE id=?3 AND (change_lease_until IS NULL OR change_lease_until<=?4)').bind(lease,new Date(Date.now()+180000).toISOString(),sub.id,at).run();
 if(!claimed.meta.changes)throw new StripeError('BILLING_PLAN_CHANGE_BUSY',409);
 try{
 const customer=await env.DB.prepare('SELECT customer_id FROM arc_billing_customers WHERE user_id=?1').bind(p.target_user_id).first<{customer_id:string}>();
 const current=await stripeRequest(env,'/v1/subscriptions/'+sub.id+'?expand[0]=discounts');
 if(stripeId(current.customer)!==customer?.customer_id||current.status!=='active'||current.schedule||current.cancel_at_period_end)throw new StripeError('BILLING_PROMOTION_SUBSCRIPTION_REVIEW',409);
 if(current.discounts?.length){
  if(existing&&current.discounts.length===1&&stripeId(current.discounts[0].source?.coupon||current.discounts[0].coupon)===p.coupon_id){await env.DB.prepare("UPDATE arc_promotion_assignments SET status='applied',applied_at=?1 WHERE promotion_id=?2 AND user_id=?3").bind(now(),p.id,p.target_user_id).run();return;}
  throw new StripeError('BILLING_PROMOTION_ALREADY_DISCOUNTED',409);
 }
 await env.DB.prepare("INSERT OR IGNORE INTO arc_promotion_assignments(promotion_id,user_id,subscription_id,created_at,status) VALUES(?1,?2,?3,?4,'pending')").bind(p.id,p.target_user_id,sub.id,now()).run();
 try{
  await stripeRequest(env,'/v1/subscriptions/'+sub.id,'POST',form({'discounts[0][coupon]':p.coupon_id!,proration_behavior:'none'}),'arc-private-offer:'+p.id+':'+p.target_user_id);
  await env.DB.prepare("UPDATE arc_promotion_assignments SET status='applied',applied_at=?1 WHERE promotion_id=?2 AND user_id=?3").bind(now(),p.id,p.target_user_id).run();
 }catch(error){await env.DB.prepare("UPDATE arc_promotion_assignments SET status='unknown' WHERE promotion_id=?1 AND user_id=?2").bind(p.id,p.target_user_id).run();throw error;}
 }finally{await env.DB.prepare('UPDATE arc_billing_subscriptions SET change_lease_token=NULL,change_lease_until=NULL WHERE id=?1 AND change_lease_token=?2').bind(sub.id,lease).run();}
}
export async function disablePromotion(env:CommercialEnv,actor:string,id:string){
 const p=await env.DB.prepare('SELECT * FROM arc_billing_promotions WHERE id=?1 AND mode=?2').bind(id,commercialMode(env)).first<Promotion>();if(!p)throw new StripeError('BILLING_PROMOTION_NOT_FOUND',404);
 if(p.promotion_code_id)await stripeRequest(env,'/v1/promotion_codes/'+p.promotion_code_id,'POST',form({active:false}),'arc-disable-promo:'+p.id);
 await env.DB.prepare("UPDATE arc_billing_promotions SET status='disabled' WHERE id=?1").bind(id).run();await audit(env,actor,'promotion_disabled',p);return{disabled:true};
}
export async function checkoutPromotion(env:CommercialEnv,userId:string,customerId:string,sku:string,code?:unknown){
 if(code!==undefined&&(typeof code!=='string'||!/^[A-Za-z0-9-]{3,32}$/.test(code.trim())))throw new StripeError('BILLING_INVALID_PROMOTION',400);
 const p=await env.DB.prepare(`SELECT p.* FROM arc_billing_promotions p WHERE mode=?1 AND product_id=?2 AND status='active' AND expires_at>?3 AND (target_user_id IS NULL OR target_user_id=?4)
  AND (?5 IS NOT NULL AND code=?5 OR ?5 IS NULL AND target_user_id=?4)
  AND NOT EXISTS(SELECT 1 FROM arc_promotion_redemptions r WHERE r.promotion_id=p.id AND r.user_id=?4)
  AND (SELECT COUNT(*) FROM arc_promotion_redemptions r WHERE r.promotion_id=p.id)<p.max_redemptions ORDER BY percent_off DESC,created_at DESC LIMIT 1`).bind(commercialMode(env),sku,now(),userId,typeof code==='string'?code.trim().toUpperCase():null).first<Promotion>();
 if(!p){if(code)throw new StripeError('BILLING_PROMOTION_UNAVAILABLE',409);return null;}
 const provider=await stripeRequest(env,'/v1/promotion_codes/'+p.promotion_code_id);const coupon=await validateCoupon(env,p);
 if(!provider.active||!coupon.valid||stripeId(provider.promotion?.coupon)!==p.coupon_id||p.target_user_id&&stripeId(provider.customer)!==customerId||provider.expires_at<=Date.now()/1000)throw new StripeError('BILLING_PROMOTION_UNAVAILABLE',409);
 return p;
}
export async function invoicePromotion(env:CommercialEnv,invoice:Record<string,any>,userId:string,subscriptionId:string,sku:string,baseCents:number,versionId:string){
 if(!invoice.total_discount_amounts?.length)return{discountCents:0,promotionId:undefined};
 const expanded=await stripeRequest(env,'/v1/invoices/'+stripeId(invoice)+'?expand[0]=discounts');
 if(expanded.discounts?.length!==1||invoice.total_discount_amounts.length!==1)throw new StripeError('BILLING_PROMOTION_MISMATCH');
 const discount=expanded.discounts[0],couponId=stripeId(discount.source?.coupon||discount.coupon);
 const p=await env.DB.prepare("SELECT * FROM arc_billing_promotions WHERE coupon_id=?1 AND mode=?2 AND status IN ('active','disabled') AND product_id=?3 AND (target_user_id IS NULL OR target_user_id=?4)").bind(couponId,commercialMode(env),sku,userId).first<Promotion>();
 if(!p||!Number.isSafeInteger(discount.start)||discount.start>Math.floor(Date.parse(p.expires_at)/1000)||discount.start<Math.floor(Date.parse(p.created_at)/1000))throw new StripeError('BILLING_PROMOTION_MISMATCH');await validateCoupon(env,p);
 const assignment=await env.DB.prepare('SELECT 1 FROM arc_promotion_assignments WHERE promotion_id=?1 AND user_id=?2 AND subscription_id=?3').bind(p.id,userId,subscriptionId).first();
 if(!assignment){
  const sessions=await stripeRequest(env,'/v1/checkout/sessions?'+form({subscription:subscriptionId,limit:2}));if(sessions.has_more||sessions.data?.length!==1)throw new StripeError('BILLING_PROMOTION_MISMATCH');
  const intent=await env.DB.prepare('SELECT 1 FROM arc_billing_checkouts WHERE session_id=?1 AND user_id=?2 AND promotion_id=?3 AND commercial_version_id=?4').bind(stripeId(sessions.data[0]),userId,p.id,versionId).first();if(!intent)throw new StripeError('BILLING_PROMOTION_MISMATCH');
 }
 const prior=await env.DB.prepare('SELECT receipt_id FROM arc_promotion_redemptions WHERE promotion_id=?1 AND user_id=?2').bind(p.id,userId).first<{receipt_id:string}>();if(prior&&prior.receipt_id!==stripeId(invoice))throw new StripeError('BILLING_PROMOTION_ALREADY_USED');
 const amount=invoice.total_discount_amounts[0].amount,raw=baseCents*p.percent_off/100;
 if(!Number.isSafeInteger(amount)||amount<1||amount!==Math.floor(raw)&&amount!==Math.ceil(raw)||stripeId(invoice.total_discount_amounts[0].discount)!==stripeId(discount))throw new StripeError('BILLING_PROMOTION_MISMATCH');
 return{discountCents:amount,promotionId:p.id};
}
