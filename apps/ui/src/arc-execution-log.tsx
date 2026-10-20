import {WorkspaceLoading} from './workspace-loading.js';
import {useState} from 'react';
import {arcRequest,type ChatMessage} from './use-arc-chat.js';
import {workStepLabel,workStepStatus} from './arc-work-summary.js';
export function ArcExecutionLog({runId,sessionId,tr}:{runId:string;sessionId:string;tr:(en:string,zh:string)=>string}){
 const [events,setEvents]=useState<ChatMessage[]|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(false);
 async function load(){if(events||loading)return;setLoading(true);setError(false);try{const value=await arcRequest<{messages:ChatMessage[]}>('sessions/'+encodeURIComponent(sessionId));setEvents(value.messages.filter(message=>message.role==='tool'&&(message.run_id===runId||message.id.startsWith(runId+':'))));}catch{setError(true);}finally{setLoading(false);}}
 return <details className="arcActivityExecutionLog" onToggle={event=>{if(event.currentTarget.open)void load();}}><summary>{tr('Execution log','执行日志')}</summary>{loading&&<WorkspaceLoading label={tr('Loading…','加载中…')} variant="compact"/>}{error&&<button type="button" onClick={()=>void load()}>{tr('Could not load. Retry','读取失败，重试')}</button>}{events&&<div>{events.length===0?<p>{tr('No tool actions were recorded for this run.','本次运行没有工具执行记录。')}</p>:events.map(message=><article key={message.id}><strong>{message.text||workStepLabel(message.tool,tr)}</strong><p>{workStepStatus(message.status,tr)}</p></article>)}</div>}</details>;
}
