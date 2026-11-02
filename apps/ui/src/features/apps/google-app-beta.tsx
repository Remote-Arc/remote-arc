import {useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {useI18n} from '../../app/i18n.js';
import './google-app-beta.css';

export type GoogleBetaState={mode:'beta'|'public';email:string;request:{googleEmail:string;providers:string[];status:'pending'|'approved'|'declined';createdAt:string}|null};
export function AppsPolicyDialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
  const {tr}=useI18n();const ref=useRef<HTMLDivElement>(null),close=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const background=Array.from(document.body.children).filter((item):item is HTMLElement=>item instanceof HTMLElement&&!item.contains(ref.current));
    const inert=background.map(item=>item.inert);background.forEach(item=>{item.inert=true;});close.current?.focus();
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    function key(event:KeyboardEvent){
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}
      if(event.key!=='Tab')return;event.stopPropagation();
      const items=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href]')||[]).filter(item=>item.getClientRects().length);
      const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
    document.addEventListener('keydown',key,true);
    return()=>{document.removeEventListener('keydown',key,true);document.body.style.overflow=overflow;background.forEach((item,index)=>{item.inert=inert[index]!;});if(previous?.isConnected)previous.focus();};
  },[onClose]);
  return createPortal(<div className="appsPolicyOverlay workspaceSurface"><div ref={ref} className="appsPolicyDialog" role="dialog" aria-modal="true" aria-labelledby="apps-policy-title"><header><h2 id="apps-policy-title">{title}</h2><button ref={close} type="button" onClick={onClose} aria-label={tr('Close','关闭')}>×</button></header>{children}</div></div>,document.body);
}
const dataTypes:Record<string,[string,string]>={
  gmail:['email messages, attachments and labels','邮件、附件和标签'],
  google_calendar:['calendars, events and availability','日历、日程和空闲信息'],
  google_drive:['file contents, metadata and folders','文件内容、元数据和文件夹'],
  google_docs:['document contents','文档内容'],google_sheets:['spreadsheet contents','电子表格内容'],google_slides:['presentation contents','演示文稿内容'],
  youtube:['channel, video and playlist data','频道、视频和播放列表数据'],google_search_console:['site, search-performance and sitemap data','网站、搜索表现和 Sitemap 数据'],
  google_analytics:['analytics reports, properties and custom dimensions','分析报告、属性和自定义维度'],google_ads:['advertising accounts, reports and supported campaign settings','广告账号、报告和支持的广告设置'],
};
export function GoogleDataNotice({provider,checked,onChange}:{provider:string;checked:boolean;onChange:(value:boolean)=>void}){
  const {tr}=useI18n();const data=dataTypes[provider]||['Google account data','Google 账号数据'];
  return <section className="appsGoogleNotice" aria-label={tr('Google data use and sharing','Google 数据使用与共享')}>
    <p>{tr('Remote Arc uses the '+tr(...data)+' you authorize to fulfil your requests, sharing needed content with your selected AI client or Arc model provider.','Remote Arc 使用你授权的'+tr(...data)+'完成请求，并将所需内容传给你选择的 AI 客户端或 Arc 模型服务商。')}</p>
    <p>{tr('Encrypted call contents expire after 7 days and are removed by scheduled cleanup. Delete earlier in Apps. Chat, task, memory and external-service copies have separate deletion controls.','调用原文加密保存，7 天后不可读取并定期清理，也可在 Apps 提前删除。对话、任务、记忆及外部服务的副本需分别删除。')}</p>
    <p>{tr('Remote Arc does not use Google data for ads or general AI training. Choose AI services with matching data settings.','Remote Arc 不将 Google 数据用于广告或通用模型训练；请为所选 AI 服务设置相同的数据使用限制。')} <a href={tr('https://remotearc.app/privacy#google','https://remotearc.app/zh/privacy#google')} target="_blank" rel="noreferrer">{tr('Data use and deletion details','数据使用与删除详情')}</a></p>
    <label><input type="checkbox" checked={checked} onChange={event=>onChange(event.target.checked)}/><span>{tr('I agree to this use and sharing with my selected AI services.','我同意上述使用方式，并与我选择的 AI 服务共享所需内容。')}</span></label>
  </section>;
}
export function GoogleConsentDialog({provider,name,busy,onAccept,onClose}:{provider:string;name:string;busy:boolean;onAccept:()=>void;onClose:()=>void}){
  const {tr}=useI18n();const [accepted,setAccepted]=useState(false);
  return <AppsPolicyDialog title={tr('Use '+name+' with your AI','通过 AI 使用 '+name)} onClose={onClose}><GoogleDataNotice provider={provider} checked={accepted} onChange={setAccepted}/><button className="appsManagerPrimary" type="button" disabled={busy||!accepted} onClick={onAccept}>{tr('Agree and continue','同意并继续')}</button></AppsPolicyDialog>;
}
export function GoogleBetaApplication({apps,initialProvider,state,busy,error,onSubmit,onClose}:{apps:{provider:string;name:string}[];initialProvider:string;state:GoogleBetaState;busy:boolean;error:string;onSubmit:(input:{googleEmail:string;providers:string[];useCase:string;betaTerms:true})=>void;onClose:()=>void}){
  const {tr}=useI18n();const [email,setEmail]=useState(state.request?.googleEmail||state.email),[providers,setProviders]=useState(()=>apps.some(app=>app.provider===initialProvider)?[initialProvider]:[]),[useCase,setUseCase]=useState(''),[accepted,setAccepted]=useState(false);
  return <AppsPolicyDialog title={tr('Apply for Google Apps Beta','申请 Google Apps 内测')} onClose={onClose}>
    {state.request?<><p role="status">{state.request.status==='pending'?tr('Your application is waiting for review. We will add the Google account to the test list before opening access.','申请正在等待审核。我们会先将 Google 账号加入测试名单，再开通入口。'):state.request.status==='approved'?tr('Your approved apps are ready to connect.','已获准的应用可以开始连接。'):tr('Access has not been opened. Contact support if you need to update your request.','暂未开通。如需补充申请信息，请联系支持。')}</p><p>{state.request.googleEmail}</p><a href="mailto:support@remotearc.app">support@remotearc.app</a></>:<form onSubmit={event=>{event.preventDefault();if(accepted&&providers.length)onSubmit({googleEmail:email,providers,useCase,betaTerms:true});}}>
      <p>{tr('Request access below. Connect your Google account after approval.','提交申请，获邀后即可连接 Google 账号。')}</p>
      <label>{tr('Google account email','要测试的 Google 账号邮箱')}<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event=>setEmail(event.target.value)}/></label>
      <fieldset><legend>{tr('Apps you want to try','想试用的应用')}</legend>{apps.map(app=><label key={app.provider}><input type="checkbox" checked={providers.includes(app.provider)} onChange={event=>setProviders(values=>event.target.checked?[...values,app.provider]:values.filter(value=>value!==app.provider))}/>{app.name}</label>)}</fieldset>
      <details className="appsBetaUseCase"><summary>{tr('Add a use case (optional)','补充用途（选填）')}</summary><textarea aria-label={tr('What would you like to do?','你想用它完成什么？')} value={useCase} onChange={event=>setUseCase(event.target.value)} maxLength={500} rows={2}/></details>
      <p>{tr('Limited places · Google authorization normally expires after 7 days. Sensitive/restricted-scope verification is pending.','名额有限 · Google 授权通常 7 天后需重连；敏感／受限权限审核尚未完成。')}</p>
      <label><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)}/><span>{tr('I understand the testing limits and agree to submit to the private support inbox. Do not include passwords or private mail/file contents.','我了解测试限制，同意将申请提交至私密客服收件箱。请勿填写密码或私人邮件、文件原文。')}</span></label>
      {error&&<p role="alert">{error}</p>}<button className="appsManagerPrimary" type="submit" disabled={busy||!accepted||!providers.length}>{busy?tr('Submitting…','提交中…'):tr('Submit application','提交申请')}</button>
    </form>}
  </AppsPolicyDialog>;
}
