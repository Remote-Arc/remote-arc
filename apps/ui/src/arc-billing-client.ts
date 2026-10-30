import {CONNECT_FAIR_USE,CONNECT_UNLIMITED_PLAN_ID} from '@remotearc/protocol';
import {productRequestHeaders} from './product-events.js';
import type {ArcAccess} from './use-arc-chat.js';
export type BillingPlan={versionId?:string;id:string;label:string;monthlyPriceCents:number;monthlyCredits:number;connectToolCalls:number|null;concurrentRuns:number;maxSeconds:number;deviceLimit?:number|null;allHostedModels?:boolean};
export type NativePaymentSession={clientSecret:string;publishableKey:string;sessionId?:string;id?:string;mode?:'embedded_page'|'elements';billingAddress?:boolean};
export type BillingDetails={paymentMethod:null|{type:'card';brand:string;last4:string;expMonth:number;expYear:number;wallet?:'apple_pay'|'google_pay'}|{type:'link'|'other'};invoices:{id:string;number:string|null;status:string;currency:string;amountPaid:number;amountDue:number;createdAt:string;pdfUrl:string|null}[];hasMore:boolean};
export type ArcBilling={embeddedCheckoutEnabled?:boolean;subscriptionManagementEnabled?:boolean;enabled:boolean;connectEnabled?:boolean;portalEnabled?:boolean;hasCustomer?:boolean;plan:BillingPlan;access?:ArcAccess;credits:{available:number;pending:number};usage:{month?:string;used:number;limit:number|null};transfer?:{used:number;limit:number|null};plans:BillingPlan[];topups:{versionId?:string;id:string;credits:number;priceCents:number}[];models:{id:string;label:string;inputCreditsPer1000:number;outputCreditsPer1000:number}[];subscriptions:{revision?:number;status:string;period_end:string;cancel_at_period_end:number;pending_product_id?:string|null;pending_effective_at?:string|null}[]};
export class BillingFailure extends Error{constructor(code:string,readonly reference?:string){super(code);}}
export async function billingRequest<T>(path='',body?:unknown,signal?:AbortSignal):Promise<T>{
 const response=await fetch('/api/billing'+(path?'/'+path:''),{credentials:'same-origin',signal,headers:{accept:'application/json',...productRequestHeaders(),...(body!==undefined?{'content-type':'application/json'}:{})},...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})});
 const result=await response.json().catch(()=>null);if(!response.ok||!result)throw new BillingFailure(typeof result?.error==='string'?result.error:'BILLING_UNAVAILABLE',typeof result?.reference==='string'&&/^req_[\w]{1,160}$/.test(result.reference)?result.reference:undefined);return result as T;
}
export function secureBillingUrl(value:unknown){
 if(typeof value!=='string')throw new BillingFailure('BILLING_UNAVAILABLE');
 const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))throw new BillingFailure('BILLING_UNAVAILABLE');return url.href;
}
/** Monthly Connect allowances reset at the start of each UTC month ("YYYY-MM" usage key). */
export const usageResetAt=(month:string)=>{const [year,index]=month.split('-').map(Number);return new Date(Date.UTC(year!,index!,1));};
export const transferSize=(bytes:number)=>bytes>=1024**3?(bytes/1024**3).toFixed(2).replace(/\.?0+$/,'')+' GB':Math.round(bytes/1024**2)+' MB';
/** Connect Unlimited: paid remote execution; no monthly Credits or hosted Arc beyond the one-time trial. */
export const isConnectOnlyPlan=(plan:{id:string})=>plan.id===CONNECT_UNLIMITED_PLAN_ID;
export function connectPlanFeatures(tr:(en:string,zh:string)=>string){
 const registrationsPerDay=CONNECT_FAIR_USE.computerRegistrationsPerDay;
 return [tr('Unlimited Connect calls · fair-use rate limits, no monthly cap','无限 Connect 调用 · 仅有公开的速率限制，无月度上限'),tr('Unlimited registered computers, each authenticated and revocable','不限已注册电脑数量，每台独立认证、可随时撤销'),tr('Unlimited file transfer','不限文件传输量'),tr(`Up to ${registrationsPerDay} new computers per day · runs follow each computer’s own capacity`,`每天最多新增 ${registrationsPerDay} 台电脑 · 运行并发取决于每台电脑自身容量`),tr('Local terminal, files, browser, Fleet and connected Apps','本地终端、文件、浏览器、Fleet 与已连接应用'),tr('Bring your own ChatGPT, Claude or Codex · no monthly Credits; Arc after the free trial needs Plus','使用你自己的 ChatGPT、Claude 或 Codex · 不含月度 Credits；免费试用后使用 Arc 需要 Plus')];
}
export function billingFailureMessage(error:unknown,tr:(en:string,zh:string)=>string){
 const code=error instanceof Error?error.message:'';
 if(code==='unauthorized')return tr('Your session expired. Sign in again before continuing.','登录状态已过期，请重新登录后继续。');
 if(code==='BILLING_SUBSCRIPTION_CHANGED')return tr('Your subscription changed. Refresh the page and check its current status.','订阅状态已变化，请刷新页面后核对当前状态。');
 if(code==='BILLING_EMBEDDED_NOT_CONFIGURED')return tr('Secure payment is temporarily unavailable. Please try again later.','安全支付暂不可用，请稍后重试。');
 if(code==='BILLING_PAYMENT_METHOD_NOT_READY')return tr('Payment method verification did not complete. Check the form and try again.','付款方式验证尚未完成，请检查表单后重试。');
 if(code==='BILLING_SCHEDULE_CONFLICT')return tr('A pending subscription change needs to be resolved before renewal can change. Your current plan is preserved.','请先处理已有订阅变更，再修改续费状态。当前套餐仍保留。');
 if(code==='BILLING_CHECKOUT_ALREADY_OPEN')return tr('A payment session is already open. Return to that order or wait for it to expire before starting another.','已有进行中的支付会话，请返回原订单，或待会话到期后再开始新的支付。');
 if(code==='BILLING_PRICE_CHANGED')return tr('The offer changed. Review the refreshed price and Credits before continuing.','套餐条款已更新，请核对刷新后的价格和 Credits 再继续。');
 if(code.includes('PROMOTION'))return tr('This offer is unavailable for this account or plan. Check the code and its expiry.','此优惠不适用于当前账户或套餐，请检查优惠码和有效期。');
 if(code==='BILLING_USE_EXISTING_SUBSCRIPTION')return tr('You already have a subscription. Manage it in Plan & usage before starting another.','你已有订阅，请先在“套餐与用量”中管理现有订阅。');
 if(code==='BILLING_SUBSCRIPTION_REQUIRED')return tr('An active paid Arc plan is required for this top-up.','此充值需要有效的 Arc 付费套餐。');
 if(code==='BILLING_CHECKOUT_ALREADY_OPEN'||code==='BILLING_CHECKOUT_AWAITING_CONFIRMATION')return tr('An earlier checkout is still being resolved. Check its status before starting another.','先前的结账仍待确认，请先核对其状态，避免重复开通。');
 if(code==='BILLING_RATE_LIMIT')return tr('Billing is busy. Wait a moment, then try again.','支付服务繁忙，请稍后重试。');
 if(code==='BILLING_NOT_CONFIGURED')return tr('Checkout is temporarily unavailable. Your current access is preserved.','支付暂不可用，现有使用权限仍保留。');
 return tr('Secure checkout could not open. Try again; keep the reference below if the problem continues.','暂时无法打开安全支付，请重试；如仍失败，可保留下方编号供排查。');
}
