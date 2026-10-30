import {useEffect,useRef,useState} from 'react';
import {useI18n} from './i18n.js';
import {ProductIcon} from './product-icon.js';
import {WorkspaceLoading} from './workspace-loading.js';
import {TaskResults,taskActivity,taskNeedsAttention} from './dashboard-task-view.js';
import {isVisibleInWorkspace} from './dashboard-workspaces.js';
import './connect-tasks.css';

type Task={
 id:string;name:string;kind:string;status:string;device_id:string|null;
 goal_json:string|null;action_json:string;state_json:string|null;trigger_json:string|null;
 created_at:string;updated_at:string;last_run_at:string|null;next_run_at:string|null;
 expires_at:string|null;interval_seconds:number;run_count:number;run_started_count?:number;last_error:string|null;
};
type Collection={automations:Task[];scheduler?:{state:string;overdue_count:number}};
const terminal=(status:string)=>['completed','failed','cancelled','expired'].includes(status);

export function ConnectTasks({devices,onConnectAI}:{devices:{id:string;name:string}[];onConnectAI:()=>void}){
 const {tr,locale}=useI18n();
 const [data,setData]=useState<Collection|null>(null),[error,setError]=useState(false),[revision,setRevision]=useState(0);
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[busy,setBusy]=useState<string|null>(null);
 const [actionError,setActionError]=useState<string|null>(null),[cancelTask,setCancelTask]=useState<Task|null>(null),[copyState,setCopyState]=useState<string|null>(null);
 const [selected,setSelected]=useState(()=>new URLSearchParams(location.search).get('task'));
 const actionPending=useRef(false),mounted=useRef(false),dialog=useRef<HTMLDialogElement>(null),cancelTrigger=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false};},[]);
 useEffect(()=>{
  const sync=()=>setSelected(new URLSearchParams(location.search).get('task'));
  window.addEventListener('popstate',sync);return()=>window.removeEventListener('popstate',sync);
 },[]);
 useEffect(()=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const load=async()=>{
   try{
    const response=await fetch('/api/automations',{signal:controller.signal});
    if(!response.ok)throw new Error('unavailable');
    const value=await response.json() as Collection;
    if(!Array.isArray(value.automations))throw new Error('invalid response');
    if(selected&&!value.automations.some(task=>task.id===selected)){
     const detail=await fetch('/api/automations/'+encodeURIComponent(selected),{signal:controller.signal});
     if(detail.ok){const record=await detail.json() as {automation?:Task};if(record.automation)value.automations.push(record.automation);}
     else if(detail.status!==404)throw new Error('task unavailable');
    }
    if(!controller.signal.aborted){setData(value);setError(false);}
   }catch{if(!controller.signal.aborted)setError(true);}
   if(!controller.signal.aborted)timer=setTimeout(load,15000);
  };
  void load();return()=>{controller.abort();clearTimeout(timer);};
 },[revision,selected]);
 useEffect(()=>{
  if(cancelTask){dialog.current?.showModal();}else if(dialog.current?.open){dialog.current.close();}
 },[cancelTask]);
 const closeCancel=()=>{if(actionPending.current)return;setCancelTask(null);cancelTrigger.current?.focus();};
 async function manage(task:Task,action:'pause'|'resume'|'cancel'){
  if(actionPending.current)return;
  actionPending.current=true;setBusy(task.id);setActionError(null);
  try{
   const response=await fetch('/api/automations/'+encodeURIComponent(task.id)+'/'+action,{method:'POST'});
   const value=await response.json().catch(()=>({})) as {automation?:Task;error?:string};
   if(!response.ok)throw new Error(value.error||tr('The task could not be updated.','无法更新任务。'));
   if(!value.automation||value.automation.id!==task.id)throw new Error(tr('The update could not be confirmed. Refresh before trying again.','无法确认更新结果，请刷新后再试。'));
   if(mounted.current){
    setData(current=>current?{...current,automations:current.automations.map(item=>item.id===task.id?value.automation!:item)}:current);
    setCancelTask(null);setRevision(n=>n+1);cancelTrigger.current?.focus();
   }
  }catch(failure){
   if(mounted.current){setActionError(failure instanceof Error?failure.message:tr('Refresh to check the task before trying again.','请刷新核对任务状态后再试。'));setRevision(n=>n+1);}
  }finally{actionPending.current=false;if(mounted.current)setBusy(null);}
 }
 function select(task:Task){
  setSelected(task.id);setQuery('');setFilter('all');
  const url=new URL(location.href);url.searchParams.set('task',task.id);history.replaceState(history.state,'',url);
 }
 function clearSelection(){
  setSelected(null);const url=new URL(location.href);url.searchParams.delete('task');history.replaceState(history.state,'',url);
 }
 async function copy(task:Task){
  try{await navigator.clipboard.writeText(tr('Continue this Remote Arc task: ','继续这个 Remote Arc 任务：')+task.id);if(mounted.current)setCopyState(task.id);}
  catch{if(mounted.current){setCopyState('manual:'+task.id);setActionError(tr('Copy is unavailable. Select the task ID below to copy it.','暂时无法复制，请选中下方任务 ID 手动复制。'));}}
 }
 const tasks=(data?.automations||[]).filter(task=>isVisibleInWorkspace(task,'automations'));
 const selectedTask=selected?tasks.find(task=>task.id===selected):undefined;
 const shown=tasks.filter(task=>(!selected||task.id===selected)&&(filter==='all'||filter==='active'&&!terminal(task.status)&&task.status!=='paused'||filter==='attention'&&taskNeedsAttention(task)||filter==='finished'&&terminal(task.status))&&[task.name,task.id,devices.find(device=>device.id===task.device_id)?.name].some(value=>value?.toLowerCase().includes(query.trim().toLowerCase())));
 const time=(value:string|null)=>value?new Date(value).toLocaleString(locale==='zh'?'zh-CN':'en-NZ',{dateStyle:'medium',timeStyle:'short'}):'—';
 const kind=(task:Task)=>{
  try{if(JSON.parse(task.goal_json||'null')?.type==='agent_goal')return 'Agent Goal';}catch{}
  return ({long_task:tr('Background command','后台命令'),schedule_watch:tr('Scheduled command','定时命令'),condition_watch:tr('Event watch','条件监听'),goal_loop:tr('Verification loop','验证循环')} as Record<string,string>)[task.kind]||task.kind;
 };
 const status=(value:string)=>({waiting:tr('Queued','已排队'),running:tr('Running','运行中'),waiting_for_device:tr('Waiting for computer','等待电脑'),waiting_for_event:tr('Waiting','等待中'),paused:tr('Paused','已暂停'),completed:tr('Completed','已完成'),failed:tr('Failed','失败'),cancelled:tr('Cancelled','已取消'),expired:tr('Expired','已到期')} as Record<string,string>)[value]||value;
 return <section className="connectTasks" aria-label={tr('Connect tasks','Connect 任务')}>
  <header className="overviewTopbar"><div><span className="eyebrow">CONNECT</span><h1>{tr('Tasks','任务')}</h1><p>{tr('Background commands, schedules and saved goals from your connected AI.','查看已连接 AI 创建的后台命令、定时任务和已保存目标。')}</p></div><button type="button" className="ghostButton" onClick={()=>setRevision(n=>n+1)}>{tr('Refresh tasks','刷新任务')}</button></header>
  <aside className="connectTasksIntro"><ProductIcon name="tasks"/><div><strong>{tr('Create in your connected AI chat','在已连接的 AI 聊天中创建')}</strong><p>{tr('Ask your AI to save a command, schedule or goal. Return here to check progress and manage it. New AI decisions require that chat to continue.','让 AI 保存命令、安排时间或创建目标，再到这里查看进度和管理任务。新的 AI 判断仍需聊天继续运行。')}</p></div><button type="button" className="ghostButton" onClick={onConnectAI}>{tr('AI clients','AI 客户端')}<ProductIcon name="arrowUpRight" size={14}/></button></aside>
  {data?.scheduler&&data.scheduler.state!=='healthy'&&<p className="connectTasksNotice" role="status">{tr('Scheduling needs attention. Refresh to check the latest status; avoid creating a duplicate task.','调度状态需要检查。请刷新核对最新状态，避免重复创建任务。')}</p>}
  {error&&<div className="connectTasksNotice" role="alert"><p>{data?tr('Could not refresh tasks. Showing the last loaded records.','刷新失败，下面保留上次加载的记录。'):tr('Could not load tasks. Check your connection and try again.','无法加载任务，请检查连接后重试。')}</p><button type="button" className="ghostButton" onClick={()=>setRevision(n=>n+1)}>{tr('Retry','重试')}</button></div>}
  {actionError&&<p className="connectTasksNotice" role="alert">{actionError}</p>}
  {selected&&<div className="connectTasksSelection"><span>{tr('Opened from a task link','从任务链接打开')}{selectedTask?' · '+selectedTask.name:''}</span><button type="button" className="textButton" onClick={clearSelection}>{tr('Show all tasks','显示全部任务')}</button></div>}
  <div className="connectTasksToolbar"><label><ProductIcon name="search" size={16}/><input type="search" aria-label={tr('Search Connect tasks','搜索 Connect 任务')} placeholder={tr('Search by name, computer or task ID','按名称、电脑或任务 ID 搜索')} value={query} onChange={event=>{setQuery(event.target.value);if(selected)clearSelection();}}/></label><div role="group" aria-label={tr('Filter tasks','筛选任务')}>{[['all',tr('All','全部')],['active',tr('Active','进行中')],['attention',tr('Attention','待关注')],['finished',tr('Finished','已结束')]].map(([id,label])=><button type="button" key={id} aria-pressed={filter===id} onClick={()=>{setFilter(id!);if(selected)clearSelection();}}>{label}</button>)}</div></div>
  {!data&&!error&&<WorkspaceLoading label={tr('Loading Connect tasks…','正在加载 Connect 任务…')} variant="rows"/>}
  {data&&shown.length===0&&<div className="connectTasksEmpty" role="status"><ProductIcon name="tasks" size={25}/><h2>{selected?tr('This Connect task was not found','未找到这个 Connect 任务'):query||filter!=='all'?tr('No matching tasks','没有匹配的任务'):tr('No Connect tasks yet','还没有 Connect 任务')}</h2><p>{selected?tr('Check the task ID and account, or show all tasks. Arc tasks have their own task page.','请核对任务 ID 和账号，或显示全部任务。Arc 任务使用独立的任务页面。'):tr('Tasks saved through your connected AI appear here.','通过已连接 AI 保存的任务会显示在这里。')}</p></div>}
  <div className="connectTaskList">{shown.map(task=><article className="connectTaskCard" key={task.id} data-task-id={task.id}>
   <header><div><span className="connectTaskKind">{kind(task)} · {task.device_id?devices.find(device=>device.id===task.device_id)?.name||tr('Computer','电脑'):tr('Cloud action','云端操作')}</span><h2><button type="button" onClick={()=>select(task)}>{task.name}</button></h2></div><span className={'connectTaskStatus '+task.status}>{status(task.status)}</span></header>
   <p className="connectTaskActivity">{taskActivity(task,tr)}</p>
   {task.status==='paused'&&<p className="connectTaskActivity">{tr('Future steps are paused. A command already started may continue; cancelling attempts to stop it.','后续步骤已暂停。已经启动的命令可能继续运行；取消任务会尝试停止它。')}</p>}
   <dl><div><dt>{tr('Runs started','已启动次数')}</dt><dd>{task.run_started_count??task.run_count}</dd></div><div><dt>{tr('Last run','上次执行')}</dt><dd>{time(task.last_run_at)}</dd></div><div><dt>{tr('Next run','下次执行')}</dt><dd>{time(task.next_run_at)}</dd></div></dl>
   {task.last_error&&<p className="automationLastError">{task.last_error}</p>}
   <div className="connectTaskActions"><button type="button" className="ghostButton" onClick={()=>select(task)}>{tr('View results','查看结果')}</button><button type="button" className="textButton" onClick={()=>void copy(task)}>{copyState===task.id?tr('Reference copied','已复制引用'):tr('Copy task reference','复制任务引用')}</button><span className="connectTaskActionSpacer"/>
    {!terminal(task.status)&&<><button type="button" className="ghostButton" disabled={busy!==null} onClick={()=>void manage(task,task.status==='paused'?'resume':'pause')}>{busy===task.id?tr('Updating…','更新中…'):task.status==='paused'?tr('Resume','恢复'):tr('Pause','暂停')}</button><button type="button" className="ghostButton" disabled={busy!==null} onClick={event=>{cancelTrigger.current=event.currentTarget;setCancelTask(task);}}>{tr('Cancel task','取消任务')}</button></>}
   </div>
   {copyState==='manual:'+task.id&&<p className="connectTaskManualCopy"><code>{task.id}</code></p>}
   <TaskResults task={task} reveal={selected===task.id}/>
  </article>)}</div>
  <dialog ref={dialog} className="connectTaskCancelDialog" aria-labelledby="connect-task-cancel-title" onCancel={event=>{event.preventDefault();closeCancel();}}>
   <h2 id="connect-task-cancel-title">{tr('Cancel this task?','取消这个任务？')}</h2><p>{cancelTask?.name}</p><p>{tr('Future runs stop. Remote Arc also attempts to stop the currently managed process. Completed effects cannot be undone here.','后续执行将停止，Remote Arc 也会尝试停止当前受管进程。已经发生的操作无法在这里撤销。')}</p><div><button type="button" className="ghostButton" disabled={busy!==null} onClick={closeCancel}>{tr('Keep task','保留任务')}</button><button type="button" className="primaryButton" disabled={busy!==null} onClick={()=>{if(cancelTask)void manage(cancelTask,'cancel');}}>{busy?tr('Cancelling…','取消中…'):tr('Confirm cancellation','确认取消')}</button></div>{actionError&&<p role="alert">{actionError}</p>}
  </dialog>
 </section>;
}
