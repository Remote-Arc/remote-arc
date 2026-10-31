import {ProductIcon as Icon} from '../../../components/product-icon.js';
import './arc-task-card.css';
export type ArcWork={id:string;name:string;kind:'task'|'routine';status:string;schedule:{type:string;time?:string;timezone?:string;everyMinutes?:number;weekdays?:number[]};nextRunAt:string|null;runCount:number;error:string|null;conversationId:string|null;originSessionId?:string;latestRun?:{id:string;status:string;error:string|null;createdAt:string}|null};
type Tr=(en:string,zh:string)=>string;
export function arcWorkSchedule(work:ArcWork,tr:Tr){
 const schedule=work.schedule;
 if(schedule.type==='interval')return tr(`Every ${schedule.everyMinutes} minutes`,`每 ${schedule.everyMinutes} 分钟`);
 if(schedule.type!=='daily')return tr('One-off task','一次性任务');
 const days=schedule.weekdays?.map(day=>tr(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]!,['周日','周一','周二','周三','周四','周五','周六'][day]!)).join(' / ')||tr('Every day','每天');
 return `${days} · ${schedule.time} · ${schedule.timezone}`;
}
export function ArcTaskCard({work,tr,currentSessionId,onOpen,onManage}:{work:ArcWork;tr:Tr;currentSessionId?:string;onOpen:(id:string)=>void;onManage:(prompt:string,id?:string)=>void}){
 const current=work.conversationId===currentSessionId,latest=work.latestRun;
 const attention=['failed','unknown','paused'].includes(work.status)||Boolean(latest&&['failed','unknown'].includes(latest.status));
 const status=attention?tr('Needs attention','需要处理'):work.status==='waiting'?tr('Scheduled','已安排'):work.status==='running'?tr('Running','执行中'):work.status==='completed'?tr('Finished','已结束'):work.status==='cancelled'?tr('Cancelled','已取消'):work.status;
 const when=(date:string)=>new Date(date).toLocaleString(tr('en-NZ','zh-CN'),{...(work.schedule.timezone?{timeZone:work.schedule.timezone}:{}),month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
 return <article className="arcTaskCard arcWorkCard" data-task-id={work.id} data-attention={attention} aria-label={tr('Task','任务')+': '+work.name}>
  <header><span className="arcTaskCardKind"><Icon name={work.kind==='routine'?'routine':'tasks'} size={16}/>{current?tr('Task conversation','任务对话'):tr('Saved task','已保存任务')}</span><span className="arcTaskCardStatus">{status}</span></header>
  <h2>{work.name}</h2><p className="arcTaskCardSchedule">{arcWorkSchedule(work,tr)}</p>
  <p>{work.nextRunAt?tr('Next run','下次执行')+' · '+when(work.nextRunAt):tr('No next run scheduled','尚无下次执行安排')}</p>
  {latest?<p className="arcTaskCardOutcome"><Icon name={attention?'history':'activity'} size={14}/>{tr('Last run','上次执行')} · {when(latest.createdAt)} · {['failed','unknown'].includes(latest.status)?tr('Incomplete — review results','未完成，请检查结果'):latest.status==='succeeded'?tr('Run finished — review the answer','本轮已结束，请查看答复'):tr('In progress','执行中')}</p>:<p>{tr('No runs yet. This conversation will receive the results.','尚未执行，结果将保存在这个任务对话中。')}</p>}
  {attention&&<p role="status">{tr('Review the last result before retrying. The schedule may be paused.','请先检查上次结果再重试，任务安排可能已暂停。')}</p>}
  <footer>{!current&&work.conversationId&&<button type="button" className="arcTaskCardPrimary" onClick={()=>onOpen(work.conversationId!)}>{tr('Open task conversation','打开任务对话')}<Icon name="arrowUpRight" size={14}/></button>}
   {current&&work.originSessionId&&<button type="button" onClick={()=>onOpen(work.originSessionId!)}>{tr('Original request','查看原始需求')}</button>}
   <button type="button" onClick={()=>onManage(tr(`Review task "${work.name}" (ID ${work.id}), its last result and schedule. Explain what succeeded and failed before proposing changes or retrying.`,`检查任务“${work.name}”（ID ${work.id}）的上次结果和安排，先说明哪些已完成、哪些失败，再建议修改或重试。`),work.originSessionId)}>{tr('Review / manage','检查与管理')}</button>
  </footer>
 </article>;
}
