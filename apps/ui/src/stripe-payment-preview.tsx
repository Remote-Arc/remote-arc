import {useState} from 'react';
import {ElementsShell,type ElementsSummary} from './checkout-elements-shell.js';
import {billingRequest,billingFailureMessage,type NativePaymentSession} from './arc-billing-client.js';
type Tr=(en:string,zh:string)=>string;
export function PaymentPreview({session,tr,onComplete}:{session:NativePaymentSession;tr:Tr;onComplete:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function complete(){if(busy)return;setBusy(true);try{await billingRequest('preview/complete',{sessionId:session.sessionId});onComplete();}catch(error){setError(billingFailureMessage(error,tr));setBusy(false);}}
 return <section className="arcPaymentPreview"><span className="eyebrow">PAYMENT PREVIEW</span><h3>{tr('A secure way to pay','安全完成付款')}</h3><p>{tr('Interactive demo. No real payment or card information is used.','交互演示，不会真实付款，也不收集银行卡信息。')}</p><fieldset disabled><legend>{tr('Card details — display only','银行卡信息——仅作展示')}</legend><label>{tr('Card number','卡号')}<input placeholder="4242 4242 4242 4242" autoComplete="off"/></label><div><label>{tr('Expiry date','有效期')}<input placeholder="MM / YY" autoComplete="off"/></label><label>CVC<input placeholder="•••" autoComplete="off"/></label></div></fieldset><p className="arcCheckoutQuiet">{tr('In live checkout, Stripe displays the payment form and eligible wallets such as Apple Pay and Link.','正式结账时，由 Stripe 展示付款表单及符合条件的 Apple Pay、Link 等钱包。')}</p>{error&&<p role="alert">{error}</p>}<button type="button" className="raSettingsButton raSettingsButtonPrimary" disabled={busy} onClick={()=>void complete()}>{busy?tr('Simulating…','模拟中…'):tr('Simulate completed payment','模拟完成付款')}</button></section>;
}
/** The same layout as live Elements checkout, with display-only fields. */
export function ElementsPreview({session,tr,onComplete,summary}:{session:NativePaymentSession;tr:Tr;onComplete:()=>void;summary:ElementsSummary}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function complete(){if(busy)return;setBusy(true);try{await billingRequest('preview/complete',{sessionId:session.sessionId});onComplete();}catch(error){setError(billingFailureMessage(error,tr));setBusy(false);}}
 return <section className="arcPaymentPreview arcPaymentPreviewElements"><p className="arcCheckoutQuiet">{tr('Interactive demo. No real payment or card information is used.','交互演示，不会真实付款，也不收集银行卡信息。')}</p>
  <ElementsShell tr={tr} summary={summary} busy={busy} canPay error={error} submitLabel={tr('Simulate completed payment','模拟完成付款')} onSubmit={event=>{event.preventDefault();void complete();}} footer={<small>{tr('In live checkout these fields are Stripe’s secure, themed card form.','正式结账时，这些字段由 Stripe 提供，并使用本站样式。')}</small>}
   fields={<fieldset className="arcElementsField arcElementsPreviewFields" disabled><legend>{tr('Card details — display only','银行卡信息——仅作展示')}</legend><label>{tr('Card number','卡号')}<input placeholder="4242 4242 4242 4242" autoComplete="off"/></label><div><label>{tr('Expiry date','有效期')}<input placeholder="MM / YY" autoComplete="off"/></label><label>CVC<input placeholder="•••" autoComplete="off"/></label></div></fieldset>}/></section>;
}
export function MethodPreview({session,tr,onSaved,onClose}:{session:NativePaymentSession;tr:Tr;onSaved:()=>void;onClose:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(){if(busy)return;setBusy(true);try{await billingRequest('payment-method/confirm',{setupIntentId:session.id});onSaved();}catch(error){setError(billingFailureMessage(error,tr));setBusy(false);}}
 return <section className="raBillingMethodForm"><h3>{tr('Payment method preview','付款方式预览')}</h3><p>{tr('This only changes a simulated card. No bank or Stripe account is contacted.','此操作只更换模拟卡片，不连接银行或 Stripe 账户。')}</p>{error&&<p role="alert">{error}</p>}<footer><button type="button" className="raSettingsButton" disabled={busy} onClick={onClose}>{tr('Close','关闭')}</button><button type="button" className="raSettingsButton raSettingsButtonPrimary" disabled={busy} onClick={()=>void save()}>{tr('Simulate saving a new card','模拟保存新卡')}</button></footer></section>;
}
