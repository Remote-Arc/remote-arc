import {useEffect,useRef,useState} from 'react';
import {useI18n} from './i18n.js';
import {WorkspaceLoading} from './workspace-loading.js';
import {billingRequest,billingFailureMessage,secureBillingUrl,BillingFailure,type ArcBilling} from './arc-billing-client.js';
import './dashboard-settings.css';
import './arc-billing-panel.css';
import './arc-checkout.css';

export function ArcCheckout({email}:{email:string}){
 const {tr,locale}=useI18n(),[data,setData]=useState<ArcBilling|null>(null),[failure,setFailure]=useState<unknown>(null),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[promo,setPromo]=useState(''),[scheduled,setScheduled]=useState<string|null>(null);
 const [selected,setSelected]=useState(()=>new URLSearchParams(location.search).get('product')||new URLSearchParams(location.search).get('plan')||'');
 const [payment,setPayment]=useState<'pending'|'confirmed'|'waiting'>('pending'),sending=useRef(false),mounted=useRef(true);
 const result=new URLSearchParams(location.search).get('checkout'),session=new URLSearchParams(location.search).get('session_id');
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{const controller=new AbortController();void billingRequest<ArcBilling>('',undefined,controller.signal).then(value=>{if(!controller.signal.aborted){setData(value);setSelected(previous=>previous||value.plans.find(plan=>plan.monthlyPriceCents>0)?.id||'');}}).catch(error=>{if(!controller.signal.aborted)setFailure(error);});return()=>controller.abort();},[revision]);
 useEffect(()=>{
  if(result!=='success'||!session)return;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>,attempt=0;
  async function check(){try{const status=await billingRequest<{status:string}>('checkout-status?session='+encodeURIComponent(session!),undefined,controller.signal);if(controller.signal.aborted)return;if(status.status==='complete'){setPayment('confirmed');setRevision(value=>value+1);return;}}catch{if(controller.signal.aborted)return;}if(++attempt>=10){setPayment('waiting');return;}timer=setTimeout(check,3000);}
  void check();return()=>{controller.abort();clearTimeout(timer);};
 },[result,session]);
 function choose(id:string){if(busy)return;setSelected(id);setFailure(null);setScheduled(null);const url=new URL(location.href);url.searchParams.set('product',id);url.searchParams.delete('plan');history.replaceState({},'',url);}
 const plan=data?.plans.find(product=>product.id===selected&&product.monthlyPriceCents>0),topup=data?.topups.find(product=>product.id===selected),paid=Boolean(data&&data.plan.monthlyPriceCents>0),product=plan||topup;
 async function proceed(){
  if(sending.current||!data?.enabled||!product||result==='success')return;sending.current=true;setBusy(true);setFailure(null);
  try{const response=await billingRequest<{url?:string;scheduled?:boolean;effectiveAt?:string}>(paid&&plan?'plan/change':'checkout',{productId:product.id,versionId:product.versionId,...(!paid&&plan&&promo.trim()?{promoCode:promo.trim()}:{})});if(!mounted.current)return;if(response.scheduled&&response.effectiveAt){setScheduled(response.effectiveAt);setRevision(value=>value+1);}else location.assign(secureBillingUrl(response.url));}
  catch(error){if(mounted.current){setFailure(error);if(error instanceof Error&&error.message==='BILLING_PRICE_CHANGED')setRevision(value=>value+1);}}
  finally{sending.current=false;if(mounted.current)setBusy(false);}
 }
 const amount=plan?.monthlyPriceCents??topup?.priceCents,code=failure instanceof Error&&/^[\w]{1,100}$/.test(failure.message)?failure.message:'BILLING_UNAVAILABLE';
 return <div className="appFrame arcCheckoutFrame" data-workspace="agent"><main className="arcCheckoutPage raSettings">
  <header className="arcCheckoutHeader"><a href="/dashboard/agent/chat"><img src="/remote-arc.svg" width={30} height={30} alt=""/>Remote Arc</a><a href="/settings?section=billing">← {tr('Plan & usage','套餐与用量')}</a></header>
  <div className="arcCheckoutIntro"><span className="eyebrow">{tr('YOUR NEXT STEP','下一步')}</span><h1>{result==='success'?tr('Your payment status','支付状态'):tr('A plan for the work ahead.','为接下来的工作选好套餐。')}</h1><p>{tr('Review your plan here. Payment details are collected securely by Stripe.','在这里核对套餐，支付信息由 Stripe 安全收集。')}</p><small>{email}</small></div>
  {Boolean(failure)&&<div className="arcCheckoutAlert" role="alert"><p>{billingFailureMessage(failure,tr)}</p><details><summary>{tr('Reference details','排查编号')}</summary><code>{code}{failure instanceof BillingFailure&&failure.reference?' · '+failure.reference:''}</code></details>{!data&&<button className="raSettingsButton" onClick={()=>{setFailure(null);setRevision(value=>value+1);}}>{tr('Try again','重试')}</button>}</div>}
  {!data&&!failure&&<WorkspaceLoading label={tr('Loading your offers…','正在读取可用套餐…')} variant="cards"/>}
  {data&&result==='success'?<section className="arcCheckoutResult" role="status"><h2>{payment==='confirmed'?tr('Payment confirmed','支付已确认'):payment==='waiting'?tr('Confirmation is taking longer','支付确认时间较长'):tr('Confirming your payment…','正在核实支付…')}</h2><p>{payment==='confirmed'?tr('Your verified payment and updated allowance are available in Plan & usage.','已核验的支付与最新额度可在“套餐与用量”查看。'):tr('We are checking the saved payment status. You can refresh safely; this page does not charge you again.','正在核对已保存的支付状态，可以安全刷新，此页面不会再次扣费。')}</p><a className="raSettingsButton raSettingsButtonPrimary" href="/settings?section=billing">{tr('View plan & usage','查看套餐与用量')}</a><a className="raSettingsButton" href="/dashboard/agent/chat">{tr('Open Arc','打开 Arc')}</a></section>:data&&<div className="arcCheckoutLayout"><section className="arcCheckoutOptions" aria-label={tr('Choose a plan','选择套餐')}>
   <h2>{topup?tr('Top up your Credits','补充 Credits'):tr('Choose your plan','选择套餐')}</h2>
   {result==='cancelled'&&<p className="arcCheckoutQuiet" role="status">{tr('Checkout was closed. Review your choice whenever you are ready.','结账已关闭，可在准备好后核对并继续。')}</p>}
   <div className="arcCheckoutChoices" role="group" aria-label={tr('Available offers','可用套餐')}>{(topup?data.topups:data.plans.filter(plan=>plan.monthlyPriceCents>0)).map(offer=><button key={offer.id} type="button" aria-pressed={selected===offer.id} disabled={busy} onClick={()=>choose(offer.id)}><span><strong>{'label' in offer?offer.label:offer.credits.toLocaleString()+' Credits'}</strong><small>{'monthlyCredits' in offer?offer.monthlyCredits.toLocaleString()+tr(' Credits / month',' Credits／月'):tr('One-time top-up','一次性充值')}</small></span><span className="arcCheckoutOfferPrice">US${('monthlyPriceCents' in offer?offer.monthlyPriceCents:offer.priceCents)/100}<small>{'monthlyPriceCents' in offer?tr('/ month','／月'):tr('one time','一次')}</small></span></button>)}</div>
   {plan&&<ul className="arcCheckoutFeatures"><li>{tr('Hosted personal agent across your apps and computers','托管个人智能体，连接你的应用与电脑')}</li><li>{tr('All configured premium models','全部已配置高级模型')}</li><li>{plan.connectToolCalls===null?tr('Unlimited Connect calls','无限 Connect 调用'):plan.connectToolCalls.toLocaleString()+tr(' Connect calls / month',' 次 Connect 调用／月')}</li><li>{plan.concurrentRuns} {tr('concurrent runs','个并行工作')} · {tr('Up to ','单次最长 ')}{plan.maxSeconds/60} {tr('minutes per run','分钟')}</li></ul>}
   {topup&&<p>{tr('Top-up Credits do not expire. Using them requires an active paid Arc plan.','充值 Credits 不设到期日，使用时需有有效的 Arc 付费套餐。')}</p>}
   <a href={topup?'/checkout':'/settings?section=billing'}>{topup?tr('View Arc plans','查看 Arc 套餐'):tr('Keep my current plan','保留当前套餐')} →</a>
  </section><aside className="arcCheckoutSummary" aria-label={tr('Order summary','订单摘要')}>
   <span className="raSettingsFieldLabel">{tr('YOUR ORDER','你的订单')}</span><h2>{plan?'Arc '+plan.label:topup?topup.credits.toLocaleString()+' Credits':tr('Offer unavailable','套餐暂不可用')}</h2>
   {amount!==undefined&&<p className="arcCheckoutTotal">US${amount/100}<small>{plan?tr(' / month','／月'):tr(' one time',' 一次')}</small></p>}
   {plan&&<p>{tr('Renews monthly until cancelled. Cancel renewal anytime. Monthly Credits expire at the end of the billing period.','按月续订，可随时取消续费；月度 Credits 在账期结束时到期。')}</p>}
   {paid&&plan&&<p>{tr('Plan changes take effect at your next billing period. No charge today.','套餐变更在下个账期生效，今天不额外扣费。')}</p>}
   {!paid&&plan&&<details className="arcCheckoutPromo"><summary>{tr('Have a promo code?','有优惠码？')}</summary><label htmlFor="checkout-promo">{tr('Promo code','优惠码')}</label><input id="checkout-promo" maxLength={32} value={promo} disabled={busy} onChange={event=>setPromo(event.target.value)} autoComplete="off"/><small>{tr('Eligible private offers apply automatically. Verify the final amount at Stripe.','符合条件的定向优惠自动应用，最终金额请在 Stripe 核对。')}</small></details>}
   {scheduled?<div role="status"><p>{tr('Plan change scheduled for ','套餐将于 ')+new Date(scheduled).toLocaleDateString()}{tr('. No charge today.',' 生效，今天不额外扣费。')}</p><a className="raSettingsButton" href="/settings?section=billing">{tr('Return to plan & usage','返回套餐与用量')}</a></div>:<button type="button" className="raSettingsButton raSettingsButtonPrimary arcCheckoutContinue" disabled={busy||!data.enabled||!product||Boolean(topup&&!paid)||Boolean(paid&&plan?.id===data.plan.id&&!data.subscriptions.some(subscription=>subscription.pending_product_id))} onClick={()=>void proceed()}>{busy?tr('Opening secure checkout…','正在打开安全支付…'):paid&&plan?tr('Confirm plan change','确认变更套餐'):tr('Continue to Stripe','继续前往 Stripe')}</button>}
   {!data.enabled&&<p role="status">{tr('Checkout is temporarily unavailable.','支付暂不可用。')}</p>}{topup&&!paid&&<p>{tr('Choose a paid plan before adding Credits.','请先选择付费套餐，再补充 Credits。')}</p>}
   <small>{tr('Applicable tax, eligible discounts and the final total are shown by Stripe before you pay.','Stripe 会在付款前展示适用税费、优惠及最终金额。')}</small>
  </aside></div>}
  <footer className="arcCheckoutFooter"><span>{tr('Secure billing by Stripe','Stripe 安全支付')}</span><div><a href={'https://remotearc.app'+(locale==='zh'?'/zh':'')+'/terms'}>{tr('Terms','条款')}</a><a href={'https://remotearc.app'+(locale==='zh'?'/zh':'')+'/privacy'}>{tr('Privacy','隐私')}</a><a href="https://remotearc.app/support?topic=billing">{tr('Billing help','支付帮助')}</a></div></footer>
 </main></div>;
}
