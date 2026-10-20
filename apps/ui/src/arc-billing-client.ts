import type {ArcAccess} from './use-arc-chat.js';
export type BillingPlan={versionId?:string;id:string;label:string;monthlyPriceCents:number;monthlyCredits:number;connectToolCalls:number|null;concurrentRuns:number;maxSeconds:number};
export type ArcBilling={enabled:boolean;portalEnabled?:boolean;hasCustomer?:boolean;plan:BillingPlan;access?:ArcAccess;credits:{available:number;pending:number};usage:{used:number;limit:number|null};plans:BillingPlan[];topups:{versionId?:string;id:string;credits:number;priceCents:number}[];models:{id:string;label:string;inputCreditsPer1000:number;outputCreditsPer1000:number}[];subscriptions:{status:string;period_end:string;cancel_at_period_end:number;pending_product_id?:string|null;pending_effective_at?:string|null}[]};
export class BillingFailure extends Error{constructor(code:string,readonly reference?:string){super(code);}}
export async function billingRequest<T>(path='',body?:unknown,signal?:AbortSignal):Promise<T>{
 const response=await fetch('/api/billing'+(path?'/'+path:''),{credentials:'same-origin',signal,headers:{accept:'application/json',...(body!==undefined?{'content-type':'application/json'}:{})},...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})});
 const result=await response.json().catch(()=>null);if(!response.ok||!result)throw new BillingFailure(typeof result?.error==='string'?result.error:'BILLING_UNAVAILABLE',typeof result?.reference==='string'&&/^req_[\w]{1,160}$/.test(result.reference)?result.reference:undefined);return result as T;
}
export function secureBillingUrl(value:unknown){
 if(typeof value!=='string')throw new BillingFailure('BILLING_UNAVAILABLE');
 const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))throw new BillingFailure('BILLING_UNAVAILABLE');return url.href;
}
export function billingFailureMessage(error:unknown,tr:(en:string,zh:string)=>string){
 const code=error instanceof Error?error.message:'';
 if(code==='unauthorized')return tr('Your session expired. Sign in again before continuing.','登录状态已过期，请重新登录后继续。');
 if(code==='BILLING_PRICE_CHANGED')return tr('The offer changed. Review the refreshed price and Credits before continuing.','套餐条款已更新，请核对刷新后的价格和 Credits 再继续。');
 if(code.includes('PROMOTION'))return tr('This offer is unavailable for this account or plan. Check the code and its expiry.','此优惠不适用于当前账户或套餐，请检查优惠码和有效期。');
 if(code==='BILLING_USE_EXISTING_SUBSCRIPTION')return tr('You already have a subscription. Manage it in Plan & usage before starting another.','你已有订阅，请先在“套餐与用量”中管理现有订阅。');
 if(code==='BILLING_SUBSCRIPTION_REQUIRED')return tr('An active paid Arc plan is required for this top-up.','此充值需要有效的 Arc 付费套餐。');
 if(code==='BILLING_CHECKOUT_ALREADY_OPEN'||code==='BILLING_CHECKOUT_AWAITING_CONFIRMATION')return tr('An earlier checkout is still being resolved. Check its status before starting another.','先前的结账仍待确认，请先核对其状态，避免重复开通。');
 if(code==='BILLING_RATE_LIMIT')return tr('Billing is busy. Wait a moment, then try again.','支付服务繁忙，请稍后重试。');
 if(code==='BILLING_NOT_CONFIGURED')return tr('Checkout is temporarily unavailable. Your current access is preserved.','支付暂不可用，现有使用权限仍保留。');
 return tr('Secure checkout could not open. Try again; keep the reference below if the problem continues.','暂时无法打开安全支付，请重试；如仍失败，可保留下方编号供排查。');
}
