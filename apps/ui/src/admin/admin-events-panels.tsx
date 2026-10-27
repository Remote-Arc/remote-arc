import {useEffect,useRef,useState} from 'react';
import {ProductIcon as Icon} from '../product-icon.js';
import {accountLabel,checkLabel,formatEventTime,type Detail,type PaymentReadiness,type Translate} from './admin-events-model.js';

export function OperationsDetail({detail,accounts,tr,locale,onClose,onUser,onTrace}:{detail:Detail;accounts:Map<string,string>;tr:Translate;locale:string;onClose:()=>void;onUser:(id:string)=>void;onTrace:(id:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[copied,setCopied]=useState(false);
 useEffect(()=>{const element=dialog.current,previous=document.activeElement;element?.showModal();return()=>{element?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
 async function copy(){try{await navigator.clipboard.writeText([detail.title,...detail.fields.map(([label,value])=>label+': '+value)].join('\n'));setCopied(true);}catch{setCopied(false);}}
 return <dialog ref={dialog} className="eventDetail" aria-labelledby="event-detail-title" onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
  <div className="eventDetailHeader"><span>{tr('FOLLOW-UP DETAILS','核查详情')}</span><button type="button" onClick={onClose} aria-label={tr('Close details','关闭详情')}><Icon name="close"/></button></div>
  <h2 id="event-detail-title">{detail.title}</h2><p className="eventDetailLead">{detail.explanation}</p>
  <dl className="eventDetailFacts"><div><dt>{tr('Account','相关账户')}</dt><dd>{accountLabel(detail.userId,accounts,tr)}</dd></div>{detail.time&&<div><dt>{tr('Recorded at','记录时间')}</dt><dd>{formatEventTime(detail.time,locale)}</dd></div>}</dl>
  <div className="eventNextStep"><span><Icon name="tasks"/>{tr('What to do next','建议下一步')}</span><p>{detail.next}</p></div>
  {detail.userId&&<button className="adminOutlineBtn eventDetailUser" type="button" onClick={()=>onUser(detail.userId!)}><Icon name="users"/>{tr('View this user’s activity','查看这个用户的操作')}</button>}
  <details className="eventTechnical"><summary>{tr('Diagnostic details for the technical team','给技术同事的排查信息')}</summary><dl>{detail.fields.map(([key,value],index)=><div key={key+index}><dt>{key}</dt><dd><code>{value}</code></dd></div>)}</dl><div className="eventDetailButtons"><button className="adminOutlineBtn" type="button" onClick={()=>void copy()}>{copied?tr('Copied','已复制'):tr('Copy diagnostic details','复制排查信息')}</button>{detail.trace&&<button className="adminOutlineBtn" type="button" onClick={()=>onTrace(detail.trace!)}>{tr('See related steps','查看同次操作')}</button>}</div></details>
 </dialog>;
}

export function PaymentPanel({payment,checking,error,preview,tr,locale,onRefresh,onDetail}:{payment:PaymentReadiness|null;checking:boolean;error:string;preview:boolean;tr:Translate;locale:string;onRefresh:()=>void;onDetail:(detail:Detail)=>void}){
 const needsAttention=payment&&['blocked','needs_attention'].includes(payment.conclusion),unknown=payment&&(payment.conclusion==='unknown'||payment.reconciliationUnavailable>0);
 const label=needsAttention?tr('Needs attention','需要跟进'):unknown?tr('Partly checked','部分待核对'):tr('No issues found in this check','本次抽查未见异常');
 return <section className="eventPanel eventPaymentPanel"><header><div><span className="eventEyebrow">{tr('PAYMENT STATUS','付款与权益')}</span><h2>{tr('Did access reach the user?','付款后，权益到账了吗？')}</h2></div><Icon name="shield"/></header>
  {error&&<p className="eventInlineError" role="alert">{error}</p>}
  {checking?<p role="status">{tr('Checking payment and access records…','正在核对付款与权益记录…')}</p>:payment&&<>
   <div className="eventPaymentVerdict" data-tone={needsAttention?'attention':unknown?'muted':'good'}><span className="eventStatusDot"/>{label}</div>
   <dl className="eventPaymentFacts"><div><dt>{tr('Verified memberships · 30 days','30 天内已核验会员购买')}</dt><dd>{payment.verifiedMemberships.total}</dd></div><div><dt>{tr('Paid; order record missing','已收款，缺少入账记录')}</dt><dd data-warning={payment.providerPaidUnprocessed.length>0}>{payment.providerPaidUnprocessed.length}</dd></div><div><dt>{tr('Paid; access incomplete','已入账，权益不完整')}</dt><dd data-warning={payment.paidWithoutEntitlements.length>0}>{payment.paidWithoutEntitlements.length}</dd></div><div><dt>{tr('Payment updates to check','付款通知处理异常')}</dt><dd>{payment.webhookFailures.length}</dd></div></dl>
   <p className="eventSectionNote">{tr('Checked ','抽查 ')}{payment.reconciliationChecked}{tr(' recent unfinished orders; ',' 笔近期未完成订单；')}{payment.reconciliationUnavailable}{tr(' unavailable.',' 笔暂无法核对。')}{payment.verifiedMemberships.lastPaidAt&&<> {tr('Latest verified purchase: ','最近核验购买：')}{formatEventTime(payment.verifiedMemberships.lastPaidAt,locale)}</>}</p>
   {payment.unfinishedCheckouts.length>0&&<div className="eventAbandonedNote"><strong>{payment.unfinishedCheckouts.length} {tr('orders have been open for 10+ minutes','笔订单超过 10 分钟未完成')}</strong><p>{tr('People may have left checkout. These are not confirmed failed payments.','用户可能只是离开了购买页，不代表付款失败。')}</p><button className="eventTextButton" onClick={()=>onDetail({title:tr('Unfinished orders','未完成的订单'),explanation:tr('An open order is not proof that payment was collected.','订单未完成不代表已收款。'),next:tr('Check the payment platform result before following up with the user.','先核对支付平台的实际结果，再决定是否跟进用户。'),fields:payment.unfinishedCheckouts.slice(0,10).map(order=>['Order',order.id] as [string,string])})}>{tr('View order references','查看订单记录')} <Icon name="arrowUpRight" size={13}/></button></div>}
   <details className="eventPaymentChecks"><summary>{tr('Purchase readiness checks','查看购买功能检查')}</summary>{payment.checks.map(check=><div key={check.key}><span>{checkLabel(check.key,tr)}</span><strong data-state={check.state}>{check.state==='pass'?tr('Passed','已通过'):check.state==='fail'?tr('Needs attention','需处理'):tr('Not verified','待验证')}</strong></div>)}</details>
   <small className="eventCheckedAt">{tr('Checked ','核查于 ')}{formatEventTime(payment.checkedAt,locale)}</small>
  </>}
  <button className="adminOutlineBtn eventPaymentRefresh" disabled={preview||checking} onClick={onRefresh}><Icon name="refresh" size={13}/>{tr('Check payments again','重新核查支付')}</button>
 </section>;
}
