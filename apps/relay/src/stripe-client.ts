import {billingEnabled,type PlatformLaunchEnv} from './platform-launch.js';
export const STRIPE_API_VERSION='2026-09-30.endive';
export type StripeEnv=PlatformLaunchEnv&{STRIPE_SECRET_KEY?:string;STRIPE_WEBHOOK_SECRET?:string;STRIPE_PUBLISHABLE_KEY?:string;ARC_BILLING_ENABLED?:string;STRIPE_AUTOMATIC_TAX?:string;ARC_BILLING_ALLOW_TEST_MODE?:string};
export class StripeError extends Error {constructor(readonly code:string,readonly status=503,readonly reference?:string){super(code);}}
export const stripeId=(v:unknown):string=>typeof v==='string'?v:typeof v==='object'&&v!==null&&'id' in v?stripeId(v.id):'';
export function stripePublishableKey(env:StripeEnv){const key=env.STRIPE_PUBLISHABLE_KEY||'';return new RegExp('^pk_'+(stripeLive(env)?'live':'test')+'_[A-Za-z0-9]+$').test(key)?key:null;}
export function stripeLive(env:StripeEnv){
 if(!/^(sk|rk)_(test|live)_/.test(env.STRIPE_SECRET_KEY||''))throw new StripeError('BILLING_NOT_CONFIGURED');
 return /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY!);
}
export function stripeConfigured(env:StripeEnv){try{return billingEnabled(env)&&Boolean(env.STRIPE_WEBHOOK_SECRET)&&(stripeLive(env)||env.ARC_BILLING_ALLOW_TEST_MODE==='1');}catch{return false;}}
export async function stripeRequest(env:StripeEnv,path:string,method:'GET'|'POST'='GET',params?:URLSearchParams,idempotencyKey?:string){
 stripeLive(env);
 if(!/^\/v1\/[a-z_]+(?:[/?][\w\[\]%=&+.,:-]*)*$/.test(path))throw new StripeError('BILLING_INVALID_API_PATH');
 let response:Response;
 try{response=await fetch('https://api.stripe.com'+path,{method,redirect:'manual',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+env.STRIPE_SECRET_KEY,'stripe-version':STRIPE_API_VERSION,...(method==='POST'?{'content-type':'application/x-www-form-urlencoded'}:{}),...(idempotencyKey?{'idempotency-key':idempotencyKey}:{})},...(method==='POST'?{body:params?.toString()||''}:{})});}
 catch{throw new StripeError('BILLING_PROVIDER_UNAVAILABLE');}
 // Workers does not implement redirect:error. Never follow a provider redirect with credentials.
 if(response.status>=300&&response.status<400)throw new StripeError('BILLING_PROVIDER_ERROR');
 if(!response.ok){
  const requestId=response.headers.get('request-id'),reference=requestId&&/^req_[A-Za-z0-9_]{1,160}$/.test(requestId)?requestId:undefined;
  const failure=await response.json().catch(()=>null) as {error?:{type?:string;param?:string}}|null;
  const code=response.status===429?'BILLING_RATE_LIMIT':response.status===400&&failure?.error?.type==='invalid_request_error'&&failure.error.param==='expires_at'?'BILLING_CHECKOUT_EXPIRY_INVALID':failure?.error?.type==='idempotency_error'?'BILLING_CHECKOUT_AWAITING_CONFIRMATION':'BILLING_PROVIDER_ERROR';
  throw new StripeError(code,response.status===404?404:503,reference);
 }
 const result=await response.json() as Record<string,any>;
 if(typeof result!=='object'||!result)throw new StripeError('BILLING_PROVIDER_ERROR');
 return result;
}
export async function verifyStripeSignature(raw:string,header:string|null,secret:string,now=Date.now()){
 if(!secret||!header)throw new StripeError('BILLING_SIGNATURE_INVALID',400);
 const pieces=header.split(',').map(p=>p.trim().split('=')),timestamps=pieces.filter(p=>p[0]==='t');
 if(timestamps.length!==1||!/^\d+$/.test(timestamps[0]![1]||''))throw new StripeError('BILLING_SIGNATURE_INVALID',400);
 const timestamp=Number(timestamps[0]![1]);
 if(!Number.isSafeInteger(timestamp)||Math.abs(now/1000-timestamp)>300)throw new StripeError('BILLING_SIGNATURE_EXPIRED',400);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+raw)));
 const expected=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');let matched=0;
 for(const [,signature] of pieces.filter(p=>p[0]==='v1')){if(!/^[a-f0-9]{64}$/.test(signature||''))continue;let diff=0;for(let i=0;i<64;i++)diff|=expected.charCodeAt(i)^signature!.charCodeAt(i);matched|=Number(diff===0);}
 if(!matched)throw new StripeError('BILLING_SIGNATURE_INVALID',400);
}
