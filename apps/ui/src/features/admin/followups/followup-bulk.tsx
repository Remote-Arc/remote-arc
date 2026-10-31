import {useRef,useState} from 'react';
import {useI18n} from '../../../app/i18n.js';
import {FOLLOWUP_TEMPLATES} from '../../../../../../packages/protocol/src/followup-templates.js';
import {DEFAULT_FOLLOWUP_DESIGN,type FollowupDesign} from '../../../../../../packages/protocol/src/followup-email.js';
import {FollowupDialog} from './admin-followup-detail.js';
import {FollowupEmailPreview} from './followup-email-preview.js';
import {followupApi,followupReason,type BatchDetail} from './followup-model.js';

export function FollowupBulk({open,userIds,installation,onClose,onQueued}:{open:boolean;userIds:string[];installation:boolean;onClose:()=>void;onQueued:(id:string)=>void}){
 const {tr,locale}=useI18n();
 const [language,setLanguage]=useState<'en'|'zh'>(locale),[templateId,setTemplateId]=useState(installation?'finish-mcp':'experience');
 const initial=FOLLOWUP_TEMPLATES.find(item=>item.id===templateId)!;
 const [subject,setSubject]=useState<string>(initial.subject[locale==='zh'?1:0]),[body,setBody]=useState<string>(initial.body[locale==='zh'?1:0]);
 const [title,setTitle]=useState(tr('Follow-up','用户回访')+' · '+new Date().toISOString().slice(0,10));
 const [design,setDesign]=useState<FollowupDesign>({...DEFAULT_FOLLOWUP_DESIGN,highlights:[]});
 const [basis,setBasis]=useState('existing'),[basisNote,setBasisNote]=useState(''),[id,setId]=useState<string>(()=>crypto.randomUUID());
 const [detail,setDetail]=useState<BatchDetail|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const submitted=useRef<{fingerprint:string;id:string}|null>(null);
 const [replacement,setReplacement]=useState<{id:string;language:'en'|'zh'}|null>(null);
 const loadTemplate=(id:string,lang:'en'|'zh')=>{const template=FOLLOWUP_TEMPLATES.find(item=>item.id===id)!;setTemplateId(id);setLanguage(lang);setSubject(template.subject[lang==='zh'?1:0]);setBody(template.body[lang==='zh'?1:0]);};
 const chooseTemplate=(id:string,lang:'en'|'zh')=>{const current=FOLLOWUP_TEMPLATES.find(item=>item.id===templateId)!;if(subject!==current.subject[language==='zh'?1:0]||body!==current.body[language==='zh'?1:0])setReplacement({id,language:lang});else loadTemplate(id,lang);};
 async function prepare(){
  setError('');if(!title.trim()||!subject.trim()||body.trim().length<20){setError(tr('Enter a batch name, subject and message of at least 20 characters.','请填写任务名称、主题和至少 20 个字的正文。'));return;}
  const content={title,userIds,templateId,locale:language,subject,body,design,basis,basisNote},fingerprint=JSON.stringify(content);
  const requestId=submitted.current?.fingerprint===fingerprint?submitted.current.id:crypto.randomUUID();submitted.current={fingerprint,id:requestId};setId(requestId);
  setBusy(true);try{setDetail(await followupApi<BatchDetail>('/batches',{method:'POST',body:JSON.stringify({id:requestId,...content})}));}catch(err){setError(followupReason((err as Error).message,tr));}finally{setBusy(false);}
 }
 async function preview(userId:string){setBusy(true);setError('');try{setDetail(await followupApi<BatchDetail>('/batches/'+id+'?previewUser='+encodeURIComponent(userId)));}catch(err){setError(followupReason((err as Error).message,tr));}finally{setBusy(false);}}
 async function edit(){setBusy(true);setError('');try{await followupApi('/batches/'+id+'/cancel',{method:'POST',body:'{}'});setDetail(null);submitted.current=null;setId(crypto.randomUUID());}catch(err){setError(followupReason((err as Error).message,tr));}finally{setBusy(false);}}
 async function queue(){setBusy(true);setError('');try{await followupApi('/batches/'+id+'/queue',{method:'POST',body:'{}'});onQueued(id);}catch(err){setError(followupReason((err as Error).message,tr));}finally{setBusy(false);}}
 if(!open)return null;
 const eligible=detail?.batch.pending||0;
 return <FollowupDialog title={detail?tr('Review bulk follow-up','确认群发内容'):tr('Compose bulk follow-up','撰写群发邮件')} busy={busy} onClose={onClose} className="followupBatchDialog">
  <div className="followupReviewBody followupBulkBody">
   <ol className="followupBatchSteps" aria-label={tr('Bulk follow-up steps','群发步骤')}><li data-active={!detail}>1 · {tr('Compose','撰写')}</li><li data-active={Boolean(detail)}>2 · {tr('Review recipients & content','检查用户与内容')}</li><li>3 · {tr('Send in background','后台发送')}</li></ol>
   {error&&<p className="adminAlert" role="alert">{error}</p>}
   {!detail?<>
    <p className="followupBulkIntro">{tr('A separate, personalized email for each selected user.','为每位已选用户单独发送个性化邮件。')} <strong>{userIds.length} {tr('selected','位用户')}</strong></p>
    {replacement&&<div className="followupTemplateChange" role="status"><p>{tr('Replace the current subject and message with this template?','使用新模板替换当前主题和正文？')}</p><div><button type="button" className="adminOutlineBtn" onClick={()=>setReplacement(null)}>{tr('Keep current text','保留当前内容')}</button><button type="button" className="adminOutlineBtn" onClick={()=>{loadTemplate(replacement.id,replacement.language);setReplacement(null);}}>{tr('Use new template','使用新模板')}</button></div></div>}
    <fieldset className="followupEditor" disabled={busy}>
     <label>{tr('Batch name','群发任务名称')}<input value={title} maxLength={120} onChange={event=>setTitle(event.target.value)}/></label>
     <div className="adminFollowupTwo"><label>{tr('Template','模板')}<select aria-label={tr('Bulk template','群发模板')} value={templateId} onChange={event=>chooseTemplate(event.target.value,language)}>{FOLLOWUP_TEMPLATES.map(item=><option value={item.id} key={item.id}>{tr(item.en,item.zh)}</option>)}</select></label><label>{tr('Email language','邮件语言')}<select value={language} onChange={event=>chooseTemplate(templateId,event.target.value as 'en'|'zh')}><option value="en">English</option><option value="zh">中文</option></select></label></div>
     <label>{tr('Subject','主题')}<input aria-label={tr('Bulk subject','群发主题')} value={subject} maxLength={200} onChange={event=>setSubject(event.target.value)}/></label>
     <label>{tr('Message','正文')}<textarea aria-label={tr('Bulk message','群发正文')} value={body} rows={10} maxLength={6000} onChange={event=>setBody(event.target.value)}/></label>
     <p className="followupTokenHelp">{tr('Personalization:','个性化变量：')} <code>{'{{name}}'}</code> {tr('user name','用户称呼')} · <code>{'{{feedbackUrl}}'}</code> {tr('personal feedback link','个人反馈链接')} · <code>{'{{setupUrl}}'}</code> {tr('setup guide','连接指南')}</p>
     <details className="adminFollowupDesign"><summary>{tr('Email appearance','邮件样式')}</summary><div className="adminFollowupTwo"><label>{tr('Layout','版式')}<select value={design.layout} onChange={event=>setDesign(value=>({...value,layout:event.target.value as FollowupDesign['layout']}))}><option value="spotlight">{tr('Spotlight','品牌主视觉')}</option><option value="letter">{tr('Letter','简洁书信')}</option><option value="digest">{tr('Digest','内容摘要')}</option></select></label><label>{tr('Brand color','品牌颜色')}<input type="color" value={design.accent} onChange={event=>setDesign(value=>({...value,accent:event.target.value}))}/></label></div><label>{tr('Headline','主标题')}<input value={design.headline} maxLength={200} onChange={event=>setDesign(value=>({...value,headline:event.target.value}))}/></label><label>{tr('Introduction','导语')}<textarea rows={2} value={design.intro} maxLength={500} onChange={event=>setDesign(value=>({...value,intro:event.target.value}))}/></label></details>
     <div className="followupBulkBasis"><label>{tr('Contact basis for this group','本组用户的联系依据')}<select aria-label={tr('Bulk contact basis','群发联系依据')} value={basis} onChange={event=>setBasis(event.target.value)}><option value="existing">{tr('Use each user’s existing recorded basis','使用各用户已有的联系依据')}</option><option value="support">{tr('These users requested installation or product support','这些用户请求过安装或使用支持')}</option><option value="agreed">{tr('These users agreed to this product follow-up','这些用户已同意本次产品回访')}</option></select></label><label>{tr('Source note (optional)','来源备注（可选）')}<input value={basisNote} maxLength={500} onChange={event=>setBasisNote(event.target.value)} placeholder={tr('For example, support request or conversation record','例如：支持请求或沟通记录')}/></label></div>
    </fieldset>
   </>:<>
    <div className="followupBatchReviewStats"><div><strong>{eligible}</strong><span>{tr('Ready to send','可发送')}</span></div><div><strong>{detail.batch.skipped}</strong><span>{tr('Excluded','已排除')}</span></div><div><strong>{detail.batch.total}</strong><span>{tr('Selected users','已选用户')}</span></div></div>
    <dl><dt>{tr('From','发件人')}</dt><dd>{detail.sender.from}</dd><dt>{tr('Reply to','回复地址')}</dt><dd>{detail.sender.replyTo}</dd></dl>
    {detail.recipients.some(person=>person.status==='skipped')&&<details className="followupExcluded"><summary>{tr('Why some users are excluded','查看排除原因')} · {detail.batch.skipped}</summary><ul>{detail.recipients.filter(person=>person.status==='skipped').map(person=><li key={person.user_id}><span>{person.name||person.email}</span><small>{followupReason(person.error_code,tr)}</small></li>)}</ul></details>}
    {detail.preview?<><label className="followupPreviewRecipient">{tr('Preview as recipient','查看用户收到的邮件')}<select aria-label={tr('Preview recipient','预览收件人')} disabled={busy} value={detail.preview.user_id} onChange={event=>void preview(event.target.value)}>{detail.recipients.filter(person=>person.message_id).map(person=><option key={person.user_id} value={person.user_id}>{person.name||person.email} · {person.email}</option>)}</select></label><p><strong>{detail.preview.subject}</strong></p><FollowupEmailPreview html={detail.preview.html_body} title={tr('Personalized bulk email','个性化群发邮件')}/></>:<p className="adminNoData">{tr('No recipients are eligible. Go back and review the selection or contact basis.','暂无可发送用户，请返回检查已选用户或联系依据。')}</p>}
    <p className="followupBulkIntro">{tr('Sending continues in the background after you close this page. Follow each result in Bulk history.','关闭页面后仍会在后台发送，可在群发记录中查看每位用户的结果。')}</p>
   </>}
  </div>
  <footer>{detail?<><button type="button" className="adminOutlineBtn" disabled={busy} onClick={()=>void edit()}>{tr('Back to editing','返回编辑')}</button><button type="button" className="adminPrimaryBtn" disabled={busy||eligible===0||!detail.emailConfigured||detail.batch.status!=='draft'} onClick={()=>void queue()}>{busy?tr('Queueing…','正在提交…'):tr('Confirm & send ','确认群发 ')+eligible+tr(eligible===1?' email':' emails',' 封邮件')}</button></>:<><button type="button" className="adminOutlineBtn" disabled={busy} onClick={onClose}>{tr('Close','关闭')}</button><button type="button" className="adminPrimaryBtn" disabled={busy||Boolean(replacement)} onClick={()=>void prepare()}>{busy?tr('Preparing…','正在准备…'):tr('Review recipients & emails','检查用户与邮件')}</button></>}</footer>
 </FollowupDialog>;
}
