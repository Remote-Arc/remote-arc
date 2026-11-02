import {useEffect,useState} from 'react';
import {useI18n} from '../../app/i18n.js';
import './support-inbox.css';

type Thread={id:string;sender_email:string;subject:string;status:'open'|'waiting'|'resolved';last_message_at:string};
type Message={id:string;direction:'inbound'|'outbound';from:string;to:string;subject:string;body:string;deliveryStatus:string;createdAt:string};
type Detail={thread:Thread;messages:Message[];beta?:{googleEmail:string;providers:string[];status:'pending'|'approved'|'declined'}};
const readable=(value:string)=>new Date(value).toLocaleString();
async function request<T>(path:string,options?:RequestInit):Promise<T>{
  const response=await fetch(path,{...options,credentials:'same-origin',headers:{'accept':'application/json',...(options?.body?{'content-type':'application/json'}:{})}});
  const result=await response.json() as T & {error?:string};
  if(!response.ok)throw Error(result.error||'HTTP '+response.status);
  return result;
}
export function AdminSupportInbox(){
  const {tr}=useI18n();
  const [threads,setThreads]=useState<Thread[]>([]);
  const [selected,setSelected]=useState('');
  const [detail,setDetail]=useState<Detail|null>(null);
  const [filter,setFilter]=useState('all');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [info,setInfo]=useState('');
  const [attempt,setAttempt]=useState('');
  async function reloadList(){
    const data=await request<{items:Thread[]}>('/api/admin/support-inbox?status='+filter);
    setThreads(data.items);
  }
  async function loadThread(id:string){
    setDetail(await request<Detail>('/api/admin/support-inbox/'+id));
  }
  useEffect(()=>{void reloadList().catch(e=>setError(String(e)));},[filter]);
  useEffect(()=>{if(selected)void loadThread(selected).catch(e=>setError(String(e)));},[selected]);
  async function send(){
    if(!selected||!message.trim()||busy)return;
    // Keep one request ID per attempted message, including a failed network read.
    const id=attempt||crypto.randomUUID();
    if(!attempt)setAttempt(id);
    setBusy(true);setError('');setInfo('');
    try{
      const data=await request<{status:string;duplicate?:boolean}>('/api/admin/support-inbox/'+selected+'/reply',{
        method:'POST',body:JSON.stringify({requestId:id,message:message.trim()})
      });
      if(data.status==='sent'){
        setInfo(tr('Reply submitted to SendPulse. Delivery is not yet confirmed.','已提交 SendPulse，尚未确认送达。'));
        setMessage('');setAttempt('');
      }else{
        setError(tr('Delivery is uncertain. Do not send again until verified in the provider dashboard.','发送结果不确定，请先到服务商后台核实，不要重复发送。'));
      }
      await Promise.all([loadThread(selected),reloadList()]);
    }catch(e){
      setError(tr('Could not confirm submission. Keep this draft and verify before retrying.','无法确认邮件提交，请保留草稿，核实后再操作。')+' '+String(e));
    }finally{setBusy(false);}
  }
  async function reconcile(messageId:string,outcome:'sent'|'failed'){
    if(!selected||busy)return;
    const evidence=window.prompt(tr('Enter the SendPulse provider evidence (message ID or exact delivery log finding; minimum 10 characters).','输入 SendPulse 后台核验依据（消息 ID 或准确的投递日志结果，至少 10 字符）。'));
    if(!evidence)return;
    if(!window.confirm(tr('Confirm you checked SendPulse and this outcome is accurate?','确认已核实 SendPulse 后台，此判断准确吗？')))return;
    setBusy(true);setError('');setInfo('');
    try{
      await request('/api/admin/support-inbox/'+selected+'/reconcile',{method:'PATCH',body:JSON.stringify({messageId,outcome,evidence})});
      await Promise.all([loadThread(selected),reloadList()]);
      setAttempt('');setInfo(tr('Delivery review recorded.','已保存投递核验记录。'));
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  async function changeStatus(status:Thread['status']){
    if(!selected||busy)return;
    setBusy(true);setError('');
    try{
      await request('/api/admin/support-inbox/'+selected+'/status',{method:'PATCH',body:JSON.stringify({status})});
      await Promise.all([loadThread(selected),reloadList()]);
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  async function reviewBeta(decision:'approve'|'decline'){
    if(!selected||busy||!detail?.beta)return;
    if(decision==='approve'&&!window.confirm(tr('Confirm you have added this exact Google account to the Apps project test-user list: ','确认已将这个 Google 账号加入 Apps 项目测试名单：')+detail.beta.googleEmail))return;
    setBusy(true);setError('');
    try{await request('/api/admin/support-inbox/'+selected+'/google-beta',{method:'PATCH',body:JSON.stringify({decision,...(decision==='approve'?{googleTestUserAdded:true}:{})})});await loadThread(selected);setInfo(tr('Beta request updated. No email was sent.','已更新内测申请，未自动发送邮件。'));}
    catch(e){setError(String(e));}finally{setBusy(false);}
  }
  const selectThread=(id:string)=>{setSelected(id);setMessage('');setAttempt('');setError('');setInfo('');};
  return <section className="adminSupportInbox adminSurface">
    <header className="adminSectionHeader">
      <div><h2>{tr('Support Inbox','客服收件箱')}</h2>
        <p>{tr('Customer email and signed-in Apps Beta requests. Replies are reviewed and submitted through SendPulse.','处理客户来信和已登录用户的 Apps 内测申请，人工审阅后通过 SendPulse 回复。')}</p>
      </div>
      <button className="adminOutlineBtn" onClick={()=>void Promise.all([reloadList(),selected?loadThread(selected):Promise.resolve()]).catch(e=>setError(String(e)))}>{tr('Refresh','刷新')}</button>
    </header>
    {error&&<p className="adminAlert" role="alert">{error}</p>}
    {info&&<p className="adminSupportNotice" role="status">{info}</p>}
    <div className="adminSupportLayout">
      <aside className="adminSupportList">
        <label>{tr('Filter','筛选')}
          <select value={filter} onChange={e=>setFilter(e.target.value)}>
            <option value="all">{tr('All','全部')}</option>
            <option value="open">{tr('Open','待处理')}</option>
            <option value="waiting">{tr('Waiting for customer','等待客户')}</option>
            <option value="resolved">{tr('Resolved','已解决')}</option>
          </select>
        </label>
        {threads.length===0&&<p>{tr('No messages or Beta applications in this view. Email ingestion also requires an active Email Worker route.','此筛选下暂无来信或内测申请。邮件接收还需要启用 Email Worker 路由。')}</p>}
        {threads.map(item=><button key={item.id} type="button" className={'adminSupportThread'+(selected===item.id?' active':'')} onClick={()=>selectThread(item.id)}>
          <strong>{item.sender_email}</strong><span>{item.subject}</span>
          <small>{readable(item.last_message_at)} · {item.status}</small>
        </button>)}
      </aside>
      <div className="adminSupportConversation">
        {!detail||detail.thread.id!==selected?<div className="adminSupportPlaceholder">{tr('Select a conversation to review or reply.','选择一个会话后查看并回复。')}</div>:<>
          <div className="adminSupportConversationHead">
            <div><h3>{detail.thread.subject}</h3><p>{detail.thread.sender_email}</p></div>
            <label>{tr('Status','状态')}<select value={detail.thread.status} disabled={busy} onChange={e=>void changeStatus(e.target.value as Thread['status'])}>
              <option value="open">{tr('Open','待处理')}</option>
              <option value="waiting">{tr('Waiting','等待客户')}</option>
              <option value="resolved">{tr('Resolved','已解决')}</option>
            </select></label>
          </div>
          {detail.beta&&<section className="adminSupportBeta" aria-label={tr('Google Apps Beta application','Google Apps 内测申请')}>
            <strong>Google Apps Beta · {detail.beta.status}</strong><p>{detail.beta.googleEmail} · {detail.beta.providers.join(', ')}</p>
            {detail.beta.status==='pending'&&<><p>{tr('Add this exact Google account to the Apps project test-user list before opening access.','先将这个 Google 账号加入 Apps 项目的测试名单，再开通。')}</p><a href="https://console.cloud.google.com/auth/audience?project=remote-arc-prod-2026" target="_blank" rel="noreferrer">{tr('Open Google test users','打开 Google 测试名单')}</a><div><button type="button" className="adminPrimaryBtn" disabled={busy} onClick={()=>void reviewBeta('approve')}>{tr('Added to Google — open Beta access','已加入 Google 名单，开通内测')}</button><button type="button" className="adminOutlineBtn" disabled={busy} onClick={()=>void reviewBeta('decline')}>{tr('Decline request','暂不开通')}</button></div></>}
          </section>}
          <div className="adminSupportMessages">
            {detail.messages.map(m=><article key={m.id} className={'adminSupportMail '+m.direction}>
              <div><strong>{m.from}</strong><time>{readable(m.createdAt)}</time></div>
              <p>{m.body}</p>
              {m.direction==='outbound'&&<span className="adminSupportDelivery">{m.deliveryStatus==='sent'?tr('Submitted to provider','服务商已接收'):m.deliveryStatus}</span>}
              {m.direction==='outbound'&&m.deliveryStatus==='unknown'&&<div className="adminSupportReview">
                <strong>{tr('Verify the SendPulse delivery log before proceeding.','请先核实 SendPulse 投递日志再继续。')}</strong>
                <button type="button" disabled={busy} onClick={()=>void reconcile(m.id,'sent')}>{tr('Confirmed submitted','核实已提交')}</button>
                <button type="button" disabled={busy} onClick={()=>void reconcile(m.id,'failed')}>{tr('Confirmed not sent','核实未发送')}</button>
              </div>}
            </article>)}
          </div>
          <form className="adminSupportCompose" onSubmit={e=>{e.preventDefault();void send();}}>
            <label htmlFor="admin-support-reply">{tr('Reply as support@remotearc.app','以 support@remotearc.app 回复')}</label>
            <textarea id="admin-support-reply" value={message} maxLength={15000} rows={6} disabled={busy||!!attempt} onChange={e=>setMessage(e.target.value)} placeholder={tr('Write a personal reply, then review before sending…','填写人工回复内容，确认后再发送…')}/>
            <div><small>{tr('SendPulse may accept a message before actual delivery. Unknown results are never automatically retried.','SendPulse 接收不等于实际送达；不确定结果绝不自动重发。')}</small>
              <button className="adminPrimaryBtn" type="submit" disabled={busy||!message.trim()||!!attempt}>{busy?tr('Submitting…','提交中…'):tr('Send reviewed reply','确认发送回复')}</button></div>
          </form>
        </>}
      </div>
    </div>
  </section>;
}
