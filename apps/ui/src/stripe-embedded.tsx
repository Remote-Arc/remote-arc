import {trackProductEvent} from './product-events.js';
import {lazy,Suspense,useEffect,useRef,useState,type FormEvent} from 'react';
import {loadStripe} from '@stripe/stripe-js/pure/index.js';
import type {Stripe,StripeElements,StripeEmbeddedCheckout,StripeElementLocale} from '@stripe/stripe-js';
import {billingRequest,billingFailureMessage,type NativePaymentSession} from './arc-billing-client.js';
import {WorkspaceLoading} from './workspace-loading.js';

type Tr=(en:string,zh:string)=>string;
type CheckoutProps={session:NativePaymentSession;locale:StripeElementLocale;tr:Tr;onComplete:()=>void};
type MethodProps={session:NativePaymentSession;locale:StripeElementLocale;tr:Tr;onSaved:()=>void;onClose:()=>void};
const PreviewCheckout=import.meta.env.VITE_UI_PREVIEW==='1'?lazy(()=>import('./stripe-payment-preview.js').then(module=>({default:module.PaymentPreview}))):null;
const PreviewMethod=import.meta.env.VITE_UI_PREVIEW==='1'?lazy(()=>import('./stripe-payment-preview.js').then(module=>({default:module.MethodPreview}))):null;
export function StripeEmbeddedCheckout(props:CheckoutProps){return PreviewCheckout?<Suspense fallback={null}><PreviewCheckout {...props}/></Suspense>:<LiveEmbeddedCheckout {...props}/>;}
function LiveEmbeddedCheckout({session,locale,tr,onComplete}:CheckoutProps){
 const host=useRef<HTMLDivElement>(null),completed=useRef(onComplete),[ready,setReady]=useState(false),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);completed.current=onComplete;
 useEffect(()=>{
  let disposed=false,checkout:StripeEmbeddedCheckout|undefined;setReady(false);setFailed(false);
   const timeout=setTimeout(()=>{if(!disposed){setFailed(true);trackProductEvent('billing.payment.load_failed',{entityId:session.sessionId,errorCode:'PAYMENT_FORM_LOAD_FAILED'});}},20000);
  void loadStripe(session.publishableKey,{locale}).then(async stripe=>{
   if(disposed)return;if(!stripe)throw Error('BILLING_UNAVAILABLE');
   const instance=await stripe.createEmbeddedCheckoutPage({clientSecret:session.clientSecret,onComplete:()=>{if(!disposed)completed.current();}});
   if(disposed){instance.destroy();return;}checkout=instance;if(host.current)instance.mount(host.current);clearTimeout(timeout);setFailed(false);setReady(true);trackProductEvent('billing.payment.mounted',{entityId:session.sessionId});
  }).catch(()=>{clearTimeout(timeout);if(!disposed){setFailed(true);trackProductEvent('billing.payment.load_failed',{entityId:session.sessionId,errorCode:'PAYMENT_FORM_LOAD_FAILED'});}});
  return()=>{disposed=true;clearTimeout(timeout);checkout?.destroy();};
 },[session.clientSecret,session.publishableKey,locale,retry]);
 return <section className="arcEmbeddedPayment" aria-label={tr('Secure payment','安全付款')} aria-busy={!ready&&!failed}>{!ready&&!failed&&<WorkspaceLoading label={tr('Loading secure payment…','正在加载安全付款表单…')} variant="compact"/>}{failed&&<div role="alert"><p>{tr('The payment form could not load. Your order is saved.','付款表单未能加载，订单已保留。')}</p><button className="raSettingsButton" onClick={()=>setRetry(value=>value+1)}>{tr('Reload payment form','重新加载付款表单')}</button></div>}<div ref={host}/></section>;
}
export function StripePaymentMethod(props:MethodProps){return PreviewMethod?<Suspense fallback={null}><PreviewMethod {...props}/></Suspense>:<LivePaymentMethod {...props}/>;}
function LivePaymentMethod({session,locale,tr,onSaved,onClose}:MethodProps){
 const host=useRef<HTMLDivElement>(null),stripeRef=useRef<Stripe|null>(null),elementsRef=useRef<StripeElements|null>(null),confirmedIntent=useRef<string|null>(null),live=useRef(true),lock=useRef(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let disposed=false,destroy:undefined|(()=>void);live.current=true;
  void loadStripe(session.publishableKey,{locale}).then(stripe=>{
   if(disposed)return;if(!stripe)throw Error('BILLING_UNAVAILABLE');stripeRef.current=stripe;const elements=stripe.elements({clientSecret:session.clientSecret,appearance:{theme:document.documentElement.dataset.theme==='dark'?'night':'stripe'}});elementsRef.current=elements;
   const payment=elements.create('payment');destroy=()=>payment.destroy();payment.on('ready',()=>{if(!disposed)setReady(true);});payment.on('loaderror',()=>{if(!disposed)setError(tr('The secure form could not load. Close it and try again.','安全表单未能加载，请关闭后重试。'));});if(host.current)payment.mount(host.current);
  }).catch(()=>{if(!disposed)setError(tr('The secure form could not load. Close it and try again.','安全表单未能加载，请关闭后重试。'));});
  return()=>{disposed=true;live.current=false;destroy?.();stripeRef.current=null;elementsRef.current=null;};
 },[session.clientSecret,session.publishableKey,locale,tr]);
 async function save(event:FormEvent){
  event.preventDefault();if(lock.current||!stripeRef.current||!elementsRef.current)return;lock.current=true;setBusy(true);setError('');
  try{if(!confirmedIntent.current){const result=await stripeRef.current.confirmSetup({elements:elementsRef.current,confirmParams:{return_url:new URL('/settings?section=billing',location.origin).href},redirect:'if_required'});if(result.error||result.setupIntent?.status!=='succeeded')throw Error('BILLING_PAYMENT_METHOD_NOT_READY');confirmedIntent.current=result.setupIntent.id;}await billingRequest('payment-method/confirm',{setupIntentId:confirmedIntent.current});if(live.current)onSaved();}
  catch(error){if(live.current)setError(billingFailureMessage(error,tr));}finally{lock.current=false;if(live.current)setBusy(false);}
 }
 return <form className="raBillingMethodForm" onSubmit={event=>void save(event)}><h3>{tr('Update payment method','更新付款方式')}</h3><p>{tr('Your new method will be used for future invoices. This does not make a purchase.','新的付款方式将用于后续账单，此操作不会购买套餐。')}</p>{!ready&&!error&&<WorkspaceLoading label={tr('Loading secure form…','正在加载安全表单…')} variant="compact"/>}<div ref={host}/>{error&&<p role="alert">{error}</p>}<footer><button type="button" className="raSettingsButton" disabled={busy} onClick={onClose}>{tr('Close','关闭')}</button><button className="raSettingsButton raSettingsButtonPrimary" type="submit" disabled={!ready||busy}>{busy?tr('Verifying…','验证中…'):tr('Save payment method','保存付款方式')}</button></footer></form>;
}
