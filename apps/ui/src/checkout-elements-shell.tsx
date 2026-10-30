import type {FormEvent,ReactNode} from 'react';
import {ProductIcon} from './product-icon.js';
type Tr=(en:string,zh:string)=>string;
export type ElementsSummary={label:string;subtotal:string;discount?:string;tax?:string;total:string;cadence:string;recurringNote?:string};
/** Remote Arc's own payment layout. Only the payment fields inside `fields` are
 * rendered by Stripe; summary, errors and the pay button are ours. */
export function ElementsShell({tr,summary,express,expressState='available',fields,status,error,busy,canPay,submitLabel,onSubmit,footer}:{tr:Tr;summary:ElementsSummary;express?:ReactNode;expressState?:'pending'|'available'|'none';fields:ReactNode;status?:ReactNode;error?:string;busy:boolean;canPay:boolean;submitLabel?:string;onSubmit:(event:FormEvent)=>void;footer?:ReactNode}){
 return <div className="arcElementsCheckout">
  <form className="arcElementsPay" onSubmit={onSubmit} aria-busy={busy} noValidate>
   <header><h3>{tr('Payment details','付款信息')}</h3><p><ProductIcon name="shield" size={14}/>{tr('Card details go directly to Stripe. Remote Arc never sees or stores your card number.','卡片信息直接提交给 Stripe，Remote Arc 不会看到或保存你的卡号。')}</p></header>
   {status}
   {/* Stays mounted while pending so Stripe can measure; collapses when no wallet applies. */}
   {express&&<div className="arcElementsExpress" data-state={expressState} aria-hidden={expressState!=='available'}>{express}<p className="arcElementsDivider"><span>{tr('Or pay with card','或使用银行卡付款')}</span></p></div>}
   {fields}
   {error&&<p className="arcElementsError" role="alert">{error}</p>}
   <button type="submit" className="raSettingsButton raSettingsButtonPrimary arcElementsSubmit" disabled={!canPay||busy}>{busy?tr('Processing payment…','正在处理付款…'):submitLabel??tr('Pay ','支付 ')+summary.total}</button>
   {footer??<small>{tr('Your bank may ask you to confirm this payment.','你的银行可能会要求确认这笔付款。')}</small>}
  </form>
  <aside className="arcElementsSummary" aria-label={tr('Order summary','订单摘要')}>
   <span className="raSettingsFieldLabel">{tr('ORDER SUMMARY','订单摘要')}</span>
   <dl>
    <div><dt>{summary.label}</dt><dd>{summary.subtotal}</dd></div>
    {summary.discount&&<div><dt>{tr('Discount','优惠')}</dt><dd>−{summary.discount}</dd></div>}
    {summary.tax&&<div><dt>{tr('Tax','税费')}</dt><dd>{summary.tax}</dd></div>}
    <div className="arcElementsTotal"><dt>{tr('Due today','今日应付')}</dt><dd>{summary.total}<small>{summary.cadence}</small></dd></div>
   </dl>
   {summary.recurringNote&&<p>{summary.recurringNote}</p>}
  </aside>
 </div>;
}
