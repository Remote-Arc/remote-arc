import {useEffect,useRef,useState} from 'react';
import {useI18n} from '../i18n.js';
import {WorkspaceLoading} from '../workspace-loading.js';
import {ProductIcon as Icon} from '../product-icon.js';
import {FollowupDetail} from './admin-followup-detail.js';
import {followupApi,followupTime,type Person,type EmailDraft} from './followup-model.js';
import './admin-followups.css';

export function AdminFollowups(){
 const {tr,locale}=useI18n();
 const [data,setData]=useState<{items:Person[];total:number;emailConfigured:boolean}|null>(null);
 const [query,setQuery]=useState(''),[segment,setSegment]=useState('all'),[page,setPage]=useState(0),[revision,setRevision]=useState(0);
 const [selected,setSelected]=useState<Person|null>(null),[error,setError]=useState('');
 const drafts=useRef(new Map<string,EmailDraft>());
 useEffect(()=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>void followupApi<typeof data>('?segment='+segment+'&query='+encodeURIComponent(query)+'&page='+page,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted){setData(value);setError('');}}).catch(()=>{if(!controller.signal.aborted)setError(locale==='zh'?'无法加载用户，请重试。':'Could not load users. Try again.');}),200);
  return()=>{clearTimeout(timer);controller.abort();};
 },[segment,query,page,revision,locale]);
 const filters=[['all',tr('All users','全部用户')],['device-only',tr('Computer paired · no MCP','已配对设备 · 未连接 MCP')],['unconnected',tr('No connections','尚未连接')],['unused',tr('No recorded usage','暂无使用记录')],['active',tr('Has used Arc / Connect','已有使用记录')],['due',tr('Follow-up due','待跟进')],['suppressed',tr('Do not contact','不再联系')]];
 return <section className="adminFollowups">
  <div className="adminFollowupFilters">
   <label><Icon name="search"/><input type="search" aria-label={tr('Search users','搜索用户')} placeholder={tr('Name or email…','姓名或邮箱…')} value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}}/></label>
   <select aria-label={tr('User segment','用户分组')} value={segment} onChange={event=>{setSegment(event.target.value);setPage(0);}}>{filters.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
   <span>{data?.total??'—'} {tr('users','位用户')}</span>
   <button type="button" className="adminOutlineBtn" aria-label={tr('Refresh users','刷新用户')} onClick={()=>setRevision(value=>value+1)}><Icon name="refresh" size={15}/></button>
  </div>
  {error&&<p className="adminAlert" role="alert">{error}<button onClick={()=>setRevision(value=>value+1)}>{tr('Retry','重试')}</button></p>}
  <div className="adminFollowupLayout">
   <aside className="adminFollowupPeople" aria-label={tr('Users to follow up','跟进用户')}>
    {data?.items.map(person=><button type="button" key={person.id} aria-pressed={selected?.id===person.id} onClick={()=>setSelected(person)}>
     <span className="adminFollowupAvatar">{(person.name||person.email).slice(0,1).toUpperCase()}</span>
     <span><strong>{person.name||person.email}</strong><small>{person.email}</small><span>{person.devices} {tr('devices','台设备')} · {person.apps} Apps · {person.calls.toLocaleString()} {tr('calls','次调用')}</span>
      {person.devices>0&&person.mcp_connections===0&&<em className="followupMcpBadge">{tr('MCP setup incomplete','待完成 MCP 连接')}</em>}
      <small>{person.suppressed_at?tr('Do not contact','不再联系'):person.next_followup_at?tr('Follow up: ','跟进：')+followupTime(person.next_followup_at):person.last_contact_at?tr('Last email: ','上次邮件：')+followupTime(person.last_contact_at):tr('No emails sent','尚未发送邮件')}</small>
     </span><Icon name="chevron" size={14}/>
    </button>)}
    {data?.items.length===0&&<p className="adminNoData">{tr('No users match this group.','当前分组暂无用户。')}</p>}
    {!data&&!error&&<WorkspaceLoading label={tr('Loading users…','正在加载用户…')} variant="rows"/>}
    <div className="adminPager"><button disabled={page===0} onClick={()=>setPage(value=>value-1)}>{tr('Previous','上一页')}</button><span>{page+1}</span><button disabled={!data||data.items.length<30} onClick={()=>setPage(value=>value+1)}>{tr('Next','下一页')}</button></div>
   </aside>
   {selected?<FollowupDetail key={selected.id} person={selected} initialDraft={drafts.current.get(selected.id)} cacheDraft={draft=>drafts.current.set(selected.id,draft)} onUpdate={()=>setRevision(value=>value+1)}/>
    :<div className="adminFollowupWelcome"><Icon name="chat" size={34}/><h3>{tr('A conversation starts here.','从一封有帮助的邮件开始。')}</h3><p>{tr('Choose a user to write an email, continue a saved draft or review previous follow-ups.','选择用户后，可以撰写邮件、继续已保存的草稿，或查看历史跟进。')}</p></div>}
  </div>
 </section>;
}
