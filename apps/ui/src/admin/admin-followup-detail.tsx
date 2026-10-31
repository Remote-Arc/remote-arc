import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {useI18n} from '../i18n.js';
import {ProductIcon as Icon} from '../product-icon.js';
import {FOLLOWUP_TEMPLATES} from '../../../../packages/protocol/src/followup-templates.js';
import {renderFollowupEmail,type FollowupDesign} from '../../../../packages/protocol/src/followup-email.js';
import {FollowupEmailPreview} from './followup-email-preview.js';
import {followupApi,FollowupApiError,followupTime,newFollowupDraft,savedFollowupDraft,draftFingerprint,draftDirty,type Person,type ContactDetail,type EmailDraft} from './followup-model.js';

export function FollowupDialog({title,busy,onClose,children,className=''}:{title:string;busy:boolean;onClose:()=>void;children:ReactNode;className?:string}){
 const {tr}=useI18n();
 const ref=useRef<HTMLDialogElement>(null),titleId=useId();
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
 return <dialog ref={ref} className={'adminFollowupDialog '+className} aria-labelledby={titleId} onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
  <header><h3 id={titleId}>{title}</h3><button type="button" className="adminOutlineBtn" disabled={busy} onClick={onClose} aria-label={tr('Close','关闭')}><Icon name="close" size={16}/></button></header>{children}
 </dialog>;
}
function hardBlock(data:ContactDetail|null,suppress=false,now=Date.now()){
 if(!data)return 'loading';
 if(data.contact.suppressed_at||suppress)return 'recipient_suppressed';
 if(!data.emailConfigured)return 'email_not_configured';
 if(data.messages.some(mail=>mail.batch_status==='queued'&&['pending','processing'].includes(mail.batch_recipient_status||'')))return 'batch_pending';
 if(data.messages.some(mail=>['sending','unknown'].includes(mail.status)))return 'delivery_unconfirmed';
 const next=Math.max(0,...data.messages.map(mail=>mail.sent_at?Date.parse(mail.sent_at)+72*3600000:0));
 return next>now?'contact_cooldown':null;
}

export function FollowupDetail({person,initialDraft,cacheDraft,onUpdate}:{person:Person;initialDraft?:EmailDraft;cacheDraft:(draft:EmailDraft)=>void;onUpdate:()=>void}){
 const {tr,locale}=useI18n();
 const [data,setData]=useState<ContactDetail|null>(null),[refreshing,setRefreshing]=useState(true),[revision,setRevision]=useState(0);
 const [draft,setDraft]=useState<EmailDraft>(()=>initialDraft||newFollowupDraft(person,locale));
 const [tab,setTab]=useState<'email'|'history'|'notes'>('email'),[preview,setPreview]=useState(false);
 const [busy,setBusy]=useState<'draft'|'send'|'contact'|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [review,setReview]=useState(false),[basis,setBasis]=useState(''),[basisNote,setBasisNote]=useState('');
 const [replacement,setReplacement]=useState<EmailDraft|null>(null),[clock,setClock]=useState(Date.now);
 const [notes,setNotes]=useState({status:'new',note:'',due:'',suppress:false});
 const initialized=useRef(false),draftTouched=useRef(Boolean(initialDraft)),mutation=useRef(false);
 const subjectRef=useRef<HTMLInputElement>(null),subjectId=useId(),bodyId=useId();
 useEffect(()=>{cacheDraft(draft);},[draft,cacheDraft]);
 useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),30000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{
  const controller=new AbortController();setRefreshing(true);
  void followupApi<ContactDetail>('/'+encodeURIComponent(person.id),{signal:controller.signal}).then(value=>{
   if(controller.signal.aborted)return;setData(value);setRefreshing(false);
   if(initialized.current)return;initialized.current=true;
   const date=value.contact.next_followup_at?new Date(value.contact.next_followup_at):null;
   setNotes({status:value.contact.status,note:value.contact.note,due:date?new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16):'',suppress:Boolean(value.contact.suppressed_at)});
   const saved=value.messages.find(mail=>mail.status==='draft'&&!mail.batch_id);
   if(saved&&!draftTouched.current)setDraft(savedFollowupDraft(saved));
  }).catch(()=>{if(!controller.signal.aborted){setRefreshing(false);setError('history_unavailable');}});
  return()=>controller.abort();
 },[person.id,revision]);
 const dirty=draftDirty(draft),block=hardBlock(data,notes.suppress,clock);
 const nextSendAt=Math.max(0,...(data?.messages.map(mail=>mail.sent_at?Date.parse(mail.sent_at)+72*3600000:0)||[]));
 const errorText=(code:string)=>({
  history_unavailable:tr('Contact history could not be loaded. Refresh and try again.','无法读取联系记录，请刷新重试。'),
  email_not_configured:tr('The email channel is not configured. Your draft is safe; configure the sender, then recheck.','发件通道尚未配置。草稿已保留，配置后可重新检查。'),
  recipient_suppressed:tr('This user has stopped follow-ups. Sending is unavailable.','该用户已停止接收回访，无法发送。'),
  contact_cooldown:tr('A follow-up was sent recently. You can send again at ','近期已联系过此用户，下次可发送时间：')+followupTime(new Date(nextSendAt).toISOString()),
  contact_cooldown_or_in_progress:tr('Another email was sent recently or needs delivery verification. Refresh the history.','近期已有邮件发出，或投递状态待核实，请刷新历史记录。'),
  batch_pending:tr('A bulk email is queued for this user. Manage it in Bulk history before sending another email.','该用户已有群发邮件排队中，请先在群发记录中处理，再发送其他邮件。'),
  delivery_unconfirmed:tr('A delivery is in progress or uncertain. Check its record before sending another email.','有邮件正在发送或投递状态待核实，请先查看历史记录。'),
  draft_conflict:tr('This draft changed in another tab. Open the latest saved draft from History before sending. Your current text is kept here.','草稿已在其他页面修改。请从历史记录打开最新版；当前编辑内容仍保留在这里。'),
  draft_not_editable:tr('This email was already processed. Open History or start a new email.','这封邮件已处理，请查看历史记录或新建邮件。'),
  draft_not_found:tr('This saved draft is no longer available. Start a new email.','这份草稿已不存在，请新建邮件。'),
  recipient_changed:tr('The recipient address changed. Start a new draft for the current address.','收件邮箱已变更，请按当前邮箱新建草稿。'),
  contact_permission_required:tr('Choose the user’s request or agreement below to record it and send.','请在下方选择用户的联系请求或同意依据，然后发送。'),
  permission_note_required:tr('Add the request or agreement that this follow-up responds to.','请填写本次回访对应的用户请求或同意记录。'),
  invalid_message:tr('Enter a subject and a message of at least 20 characters.','请填写主题和至少 20 个字的正文。'),
  loading:tr('Checking contact history…','正在检查联系记录…'),
 }[code]|| (code.startsWith('provider_')?tr('The email service rejected this send. Your message and error are kept in History.','发信服务未接受这次发送，邮件与错误已保留在历史记录中。'):tr('The action could not be confirmed. Your text is kept. Refresh the history before retrying.','操作结果尚未确认，内容已保留。请先刷新历史记录再重试。')));
 const noticeText=notice==='sent'?tr('Email submitted to the sender. You can follow its status in History.','邮件已提交给发信服务，可在历史记录查看。'):notice==='notes'?tr('Contact notes saved.','跟进记录已保存。'):notice==='draft'?tr('Draft saved. You can keep editing or send it now.','草稿已保存，可以继续编辑或立即发送。'):'';
 const site='https://remotearc.app'+(draft.locale==='zh'?'/zh':'');
 const generated=renderFollowupEmail({subject:draft.subject,body:draft.body,templateId:draft.templateId,locale:draft.locale,design:draft.design,setupUrl:site+'/connect-ai',feedbackUrl:site+'/feedback?source='+encodeURIComponent('followup:'+draft.id),unsubscribeUrl:'https://remotearc.app/email/follow-up/unsubscribe?token=preview',replyTo:data?.sender?.replyTo||'support@remotearc.app',rewardAvailable:data?.rewardAvailable});
 const reviewedHtml=!dirty&&draft.html?draft.html:generated.html;
 const update=(patch:Partial<EmailDraft>)=>{draftTouched.current=true;setDraft(current=>({...current,...patch,edited:true}));setNotice('');};
 const updateDesign=(patch:Partial<FollowupDesign>)=>update({design:{...draft.design,...patch}});
 const replaceDraft=(next:EmailDraft)=>{if(draft.edited&&dirty){setReplacement(next);return;}draftTouched.current=true;setDraft(next);setTab('email');setError('');setNotice('');};
 const startSend=()=>{setError('');if(!draft.subject.trim()||draft.body.trim().length<20){setError('invalid_message');setTab('email');subjectRef.current?.focus();return;}setBasis('');setBasisNote('');setReview(true);};
 async function persistDraft(){
  if(draft.revision!==null&&!dirty)return draft;
  const result=await followupApi<{id:string;status:string;revision:number;htmlBody:string|null}>('/drafts',{method:'POST',body:JSON.stringify({id:draft.id,userId:person.id,templateId:draft.templateId,locale:draft.locale,subject:draft.subject,body:draft.body,design:draft.design,...(draft.revision!==null?{expectedRevision:draft.revision}:{})})});
  if(result.status!=='draft')throw new FollowupApiError('draft_not_editable');
  const saved={...draft,revision:result.revision,html:result.htmlBody,savedFingerprint:draftFingerprint(draft),edited:false};
  setDraft(saved);return saved;
 }
 async function saveDraft(){
  if(mutation.current)return;mutation.current=true;setBusy('draft');setError('');
  try{await persistDraft();setNotice('draft');setRevision(value=>value+1);}catch(err){setError((err as Error).message);}
  finally{mutation.current=false;setBusy(null);}
 }
 async function send(){
  if(mutation.current)return;
  if(!data?.contact.consent_at&&!basis){setError('contact_permission_required');return;}
  mutation.current=true;setBusy('send');setError('');
  try{
   let current=await followupApi<ContactDetail>('/'+encodeURIComponent(person.id));setData(current);
   const blocked=hardBlock(current,notes.suppress);if(blocked)throw new FollowupApiError(blocked);
   const saved=await persistDraft();
   if(!current.contact.consent_at){
    if(!basis)throw new FollowupApiError('contact_permission_required');
    const reason=basis==='support'?'User requested installation or product support':'User agreed to this product follow-up';
    await followupApi('/'+encodeURIComponent(person.id),{method:'PATCH',body:JSON.stringify({status:current.contact.status,note:current.contact.note,nextFollowupAt:current.contact.next_followup_at,permission:true,consentNote:reason+(basisNote.trim()?': '+basisNote.trim():''),suppress:false})});
    current=await followupApi<ContactDetail>('/'+encodeURIComponent(person.id));setData(current);
   }
   const result=await followupApi<{status:string}>('/'+encodeURIComponent(saved.id)+'/send',{method:'POST',body:JSON.stringify({expectedRevision:saved.revision})});
   if(result.status!=='sent')throw new FollowupApiError('delivery_unconfirmed');
   setReview(false);setNotice('sent');setTab('history');setDraft(newFollowupDraft(person,draft.locale,draft.templateId));
  }catch(err){const e=err as FollowupApiError;setError(String(e.data?.errorCode||e.message));}
  finally{mutation.current=false;setBusy(null);setRevision(value=>value+1);onUpdate();}
 }
 async function saveNotes(){
  if(!data||mutation.current)return;mutation.current=true;setBusy('contact');setError('');
  try{await followupApi('/'+encodeURIComponent(person.id),{method:'PATCH',body:JSON.stringify({status:notes.status,note:notes.note,nextFollowupAt:notes.due?new Date(notes.due).toISOString():null,permission:Boolean(data.contact.consent_at),consentNote:data.contact.consent_note,suppress:notes.suppress})});setNotice('notes');setRevision(value=>value+1);onUpdate();}
  catch(err){setError((err as Error).message);}finally{mutation.current=false;setBusy(null);}
 }
 const draftCount=data?.messages.filter(mail=>mail.status==='draft'&&!mail.batch_id).length||0;
 const mailStatus=(status:string)=>({batch_draft:tr('Bulk draft','群发草稿'),queued:tr('Queued','已排队'),cancelled:tr('Cancelled','已取消'),skipped:tr('Excluded','已排除'),draft:tr('Draft','草稿'),sent:tr('Submitted','已提交发送'),sending:tr('Sending','发送中'),unknown:tr('Check delivery','投递待核实'),failed:tr('Send failed','发送失败')}[status]||status);
 return <section className="adminFollowupDetail" aria-label={tr('Follow-up email','跟进邮件')}>
  <header className="followupDetailHeader"><div><h3>{person.name||person.email}</h3><span>{person.email}</span></div><button type="button" className="adminOutlineBtn" disabled={Boolean(busy)} onClick={()=>replaceDraft(newFollowupDraft(person,draft.locale))}><Icon name="add" size={14}/>{tr('New email','新建邮件')}</button></header>
  <nav className="followupTabs" aria-label={tr('Follow-up workspace','跟进工作区')}>
   {(['email','history','notes'] as const).map(value=><button type="button" key={value} aria-pressed={tab===value} onClick={()=>setTab(value)}>{value==='email'?tr('Write email','撰写邮件'):value==='history'?tr('Drafts & history','草稿与历史')+(draftCount?' · '+draftCount:''):tr('Contact notes','跟进记录')}</button>)}
  </nav>
  {error&&!review&&<div className="adminAlert" role="alert">{errorText(error)}<button type="button" className="adminOutlineBtn" onClick={()=>{setRevision(value=>value+1);setError('');}}>{tr('Refresh history','刷新记录')}</button></div>}
  {noticeText&&<p className="adminFollowupNotice" role="status"><Icon name="check" size={15}/>{noticeText}</p>}
  <div hidden={tab!=='email'} className="adminFollowupComposer">
   <div className="followupComposeToolbar"><span role="status">{busy==='draft'?tr('Saving…','正在保存…'):draft.revision===null?tr('New draft','新草稿'):dirty?tr('Unsaved changes','有未保存的更改'):tr('Draft saved','草稿已保存')}</span><div><button type="button" className="adminOutlineBtn" disabled={Boolean(busy)} onClick={()=>void saveDraft()}>{tr('Save draft','保存草稿')}</button><button type="button" className="adminPrimaryBtn" disabled={Boolean(busy)||refreshing||!data} onClick={startSend}>{busy==='send'?tr('Sending…','正在发送…'):tr('Send email','发送邮件')}<Icon name="arrowUpRight" size={14}/></button></div></div>
   {block&&block!=='loading'&&<div className="adminFollowupSendHint" role="status"><p>{errorText(block)}</p><button type="button" className="adminOutlineBtn" onClick={()=>{setRevision(value=>value+1);onUpdate();}}>{tr('Recheck','重新检查')}</button></div>}
   {person.next_step==='pair_computer'&&<p className="followupSuggestion"><Icon name="add" size={16}/>{tr('No computer paired yet. The pairing template includes the install command and the Windows download.','尚未配对电脑。“配对你的电脑”模板附带安装命令和 Windows 下载链接。')}</p>}
   {(person.next_step==='connect_ai'||(!person.next_step&&person.devices>0&&person.mcp_connections===0))&&<p className="followupSuggestion"><Icon name="link" size={16}/>{tr('Computer paired; no active MCP authorization. The installation template helps complete the connection.','设备已配对，尚无有效 MCP 授权。可使用安装引导模板帮助用户完成连接。')}</p>}
   {person.next_step==='first_use'&&<p className="followupSuggestion"><Icon name="activity" size={16}/>{tr('Connected but not used yet. Suggest a first task they can verify.','已连接但还没使用。可以推荐一个能检查结果的第一个任务。')}</p>}
   <fieldset disabled={Boolean(busy)} className="followupEditor">
    <div className="adminFollowupTwo"><label>{tr('Template','模板')}<select aria-label={tr('Template','模板')} value={draft.templateId} onChange={event=>replaceDraft(newFollowupDraft(person,draft.locale,event.target.value))}>{FOLLOWUP_TEMPLATES.map(template=><option key={template.id} value={template.id}>{tr(template.en,template.zh)}</option>)}</select></label><label>{tr('Email language','邮件语言')}<select aria-label={tr('Email language','邮件语言')} value={draft.locale} onChange={event=>replaceDraft(newFollowupDraft(person,event.target.value as 'en'|'zh',draft.templateId))}><option value="en">English</option><option value="zh">中文</option></select></label></div>
    <label htmlFor={subjectId}>{tr('Subject','主题')}<input ref={subjectRef} id={subjectId} value={draft.subject} maxLength={200} onChange={event=>update({subject:event.target.value})}/></label>
    <label htmlFor={bodyId}>{tr('Message','正文')}<textarea id={bodyId} value={draft.body} rows={12} maxLength={6000} onChange={event=>update({body:event.target.value})}/></label>
    <details className="adminFollowupDesign"><summary>{tr('Email appearance','邮件样式')}<span>{tr('Optional','可选')}</span></summary>
     <div className="adminFollowupTwo"><label>{tr('Layout','版式')}<select value={draft.design.layout} onChange={event=>updateDesign({layout:event.target.value as FollowupDesign['layout']})}><option value="spotlight">{tr('Spotlight','品牌主视觉')}</option><option value="letter">{tr('Letter','简洁书信')}</option><option value="digest">{tr('Digest','内容摘要')}</option></select></label><label>{tr('Brand color','品牌颜色')}<input type="color" value={draft.design.accent} onChange={event=>updateDesign({accent:event.target.value})}/></label></div>
     <label>{tr('Headline','主标题')}<input value={draft.design.headline} maxLength={200} placeholder={draft.subject} onChange={event=>updateDesign({headline:event.target.value})}/></label><label>{tr('Introduction','导语')}<textarea rows={2} value={draft.design.intro} maxLength={500} onChange={event=>updateDesign({intro:event.target.value})}/></label><label>{tr('Button label','按钮文案')}<input value={draft.design.buttonLabel} maxLength={80} onChange={event=>updateDesign({buttonLabel:event.target.value})}/></label><label>{tr('Eyebrow','顶部短标题')}<input value={draft.design.eyebrow} maxLength={100} onChange={event=>updateDesign({eyebrow:event.target.value})}/></label>
     {draft.design.highlights.map((card,index)=><fieldset key={index}><legend>{tr('Content card','内容卡片')} {index+1}</legend><input aria-label={tr('Card title','卡片标题')+' '+(index+1)} value={card.title} maxLength={100} onChange={event=>updateDesign({highlights:draft.design.highlights.map((item,i)=>i===index?{...item,title:event.target.value}:item)})}/><textarea aria-label={tr('Card text','卡片正文')+' '+(index+1)} value={card.body} maxLength={600} onChange={event=>updateDesign({highlights:draft.design.highlights.map((item,i)=>i===index?{...item,body:event.target.value}:item)})}/><button type="button" className="adminOutlineBtn" onClick={()=>updateDesign({highlights:draft.design.highlights.filter((_,i)=>i!==index)})}>{tr('Remove card','移除卡片')}</button></fieldset>)}
     <button type="button" className="adminOutlineBtn" disabled={draft.design.highlights.length>=3} onClick={()=>updateDesign({highlights:[...draft.design.highlights,{title:'',body:''}]})}>{tr('Add content card','添加内容卡片')}</button>
    </details>
   </fieldset>
   <div className="followupPreviewToggle"><button type="button" className="adminOutlineBtn" aria-expanded={preview} onClick={()=>setPreview(value=>!value)}><Icon name="panel" size={15}/>{preview?tr('Hide preview','收起预览'):tr('Preview email','预览邮件')}</button><span>{tr('Reply address and unsubscribe link are included automatically.','自动附上回复地址和退订链接。')}</span></div>
   <div hidden={!preview}><FollowupEmailPreview html={reviewedHtml} title={tr('Email preview','邮件预览')}/></div>
  </div>
  {tab==='history'&&<section className="adminFollowupHistory"><div className="followupHistoryHeading"><h4>{tr('Drafts & contact history','草稿与联系历史')}</h4><button type="button" className="adminOutlineBtn" onClick={()=>setRevision(value=>value+1)}><Icon name="refresh" size={14}/>{tr('Refresh history','刷新记录')}</button></div>
   {data?.messages.length===0&&<p className="adminNoData">{tr('No saved drafts or emails yet.','还没有保存的草稿或邮件。')}</p>}
   {data?.messages.map(mail=><article className="followupHistoryItem" key={mail.id}><header><div><strong>{mail.subject}</strong><small>{followupTime(mail.sent_at||mail.created_at)}</small></div><span className="adminLeadStatus" data-status={mail.status}>{mailStatus(mail.batch_id?['preparing','draft'].includes(mail.batch_status||'')?'batch_draft':mail.batch_recipient_status==='pending'?'queued':mail.batch_recipient_status==='processing'?'sending':mail.batch_recipient_status||mail.status:mail.status)}</span></header>
    {mail.batch_id&&<small>{tr('Part of a bulk follow-up · manage in Bulk history','来自群发任务 · 可在群发记录中管理')}</small>}
    {mail.status==='draft'&&!mail.batch_id?<button type="button" className="adminOutlineBtn" disabled={Boolean(busy)} onClick={()=>replaceDraft(savedFollowupDraft(mail))}>{tr('Continue editing','继续编辑')}</button>:<details><summary>{tr('View email','查看邮件')}</summary><pre>{mail.body}</pre>{mail.html_body&&<FollowupEmailPreview html={mail.html_body} title={tr('Saved email','已保存邮件')}/>}</details>}
    {['sending','unknown'].includes(mail.status)&&<p>{tr('Verify the sender’s delivery log before another send. This email will not be resent automatically.','请先核实发信服务的投递记录，这封邮件不会自动重发。')}</p>}
    {mail.error_code&&<p className="adminAlert">{errorText(mail.error_code)} <small>{mail.error_code}</small></p>}
   </article>)}
  </section>}
  {tab==='notes'&&<section className="adminFollowupProfile"><h4>{tr('Contact notes','跟进记录')}</h4><p>{tr('Notes and reminders are separate from saving or sending an email.','内部记录和提醒单独保存，不会锁定邮件草稿。')}</p><fieldset disabled={Boolean(busy)||!data} className="followupEditor"><div className="adminFollowupTwo"><label>{tr('Status','状态')}<select value={notes.status} onChange={event=>setNotes(value=>({...value,status:event.target.value}))}>{[['new',tr('New','待联系')],['contacted',tr('Contacted','已联系')],['waiting',tr('Waiting for reply','等待回复')],['resolved',tr('Resolved','已完成')]].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>{tr('Remind me in Admin','后台提醒时间')}<input type="datetime-local" value={notes.due} onChange={event=>setNotes(value=>({...value,due:event.target.value}))}/></label></div><label>{tr('Internal note','内部记录')}<textarea rows={4} value={notes.note} maxLength={2000} onChange={event=>setNotes(value=>({...value,note:event.target.value}))}/></label><p>{data?.contact.consent_at?tr('Saved contact basis: ','已有联系依据：')+data.contact.consent_note:tr('Contact basis can be recorded when you send the first email.','首次发送时，可直接补充联系依据。')}</p><label className="adminFollowupCheck"><input type="checkbox" disabled={Boolean(data?.contact.suppressed_at)} checked={notes.suppress} onChange={event=>setNotes(value=>({...value,suppress:event.target.checked}))}/><span>{tr('Stop follow-ups to this user','停止向此用户发送回访')}</span></label><button type="button" className="adminOutlineBtn" onClick={()=>void saveNotes()}>{tr('Save notes','保存记录')}</button></fieldset></section>}
  {review&&<FollowupDialog title={tr('Send this email','发送这封邮件')} busy={Boolean(busy)} onClose={()=>{setReview(false);setError('');}}>
   <div className="followupReviewBody"><dl><dt>{tr('To','收件人')}</dt><dd>{person.email}</dd><dt>{tr('From','发件人')}</dt><dd>{data?.sender?.from||tr('Not configured','未配置')}</dd><dt>{tr('Reply to','回复地址')}</dt><dd>{data?.sender?.replyTo||tr('Not configured','未配置')}</dd><dt>{tr('Subject','主题')}</dt><dd>{draft.subject}</dd></dl>
    {block?<div className="adminFollowupSendHint" role="status"><p>{errorText(block)}</p><button type="button" className="adminOutlineBtn" disabled={Boolean(busy)} onClick={()=>setRevision(value=>value+1)}>{tr('Recheck','重新检查')}</button></div>
     :!data?.contact.consent_at?<fieldset disabled={Boolean(busy)} className="followupBasis"><legend>{tr('What is this follow-up responding to?','本次联系依据')}</legend><p>{tr('Record the existing request or agreement here. No separate contact form is needed.','直接记录已有的请求或同意，无需再去其他表单保存。')}</p><label><input type="radio" name="followup-basis" value="support" checked={basis==='support'} onChange={()=>setBasis('support')}/>{tr('The user requested installation or product support','用户请求安装或使用支持')}</label><label><input type="radio" name="followup-basis" value="followup" checked={basis==='followup'} onChange={()=>setBasis('followup')}/>{tr('The user agreed to this product follow-up','用户已同意本次产品回访')}</label><label className="followupBasisNote">{tr('Reference or note (optional)','来源或备注（可选）')}<input value={basisNote} maxLength={350} placeholder={tr('For example, a support ticket','例如：支持工单或邮件记录')} onChange={event=>setBasisNote(event.target.value)}/></label></fieldset>
     :<p className="followupBasisSaved"><Icon name="check" size={15}/>{tr('Contact basis saved: ','已有联系依据：')+data.contact.consent_note}</p>}
    {error&&<p className="adminAlert" role="alert">{errorText(error)}</p>}
    <details className="followupReviewContent"><summary>{tr('Review email content','检查邮件内容')}</summary><FollowupEmailPreview html={reviewedHtml} title={tr('Email to send','待发送邮件')}/></details>
   </div>
   <footer><button type="button" className="adminOutlineBtn" disabled={Boolean(busy)} onClick={()=>{setReview(false);setError('');}}>{tr('Keep editing','继续编辑')}</button>{!block&&<button type="button" className="adminPrimaryBtn" disabled={Boolean(busy)||refreshing} onClick={()=>void send()}>{busy==='send'?tr('Sending…','正在发送…'):data?.contact.consent_at?tr('Confirm send','确认发送'):tr('Record basis & send','记录依据并发送')}</button>}</footer>
  </FollowupDialog>}
  {replacement&&<FollowupDialog title={tr('Keep your changes?','保留当前修改？')} busy={Boolean(busy)} onClose={()=>setReplacement(null)}><div className="followupReviewBody"><p>{tr('This email has unsaved changes. Save them before opening another email, or discard only these edits.','当前邮件有未保存的修改。可以先保存再切换，或放弃这些修改。')}</p>{error&&<p className="adminAlert" role="alert">{errorText(error)}</p>}</div><footer><button className="adminOutlineBtn" disabled={Boolean(busy)} onClick={()=>setReplacement(null)}>{tr('Cancel','取消')}</button><button className="adminOutlineBtn" disabled={Boolean(busy)} onClick={()=>{setDraft(replacement);setReplacement(null);setTab('email');setError('');}}>{tr('Discard edits','放弃修改')}</button><button className="adminPrimaryBtn" disabled={Boolean(busy)} onClick={()=>{if(mutation.current)return;mutation.current=true;setBusy('draft');void persistDraft().then(()=>{setDraft(replacement);setReplacement(null);setTab('email');setError('');setRevision(value=>value+1);}).catch(err=>setError((err as Error).message)).finally(()=>{mutation.current=false;setBusy(null);});}}>{tr('Save & continue','保存并继续')}</button></footer></FollowupDialog>}
 </section>;
}
