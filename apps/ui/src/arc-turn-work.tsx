import {ArcAppConnectionCard} from './arc-app-connection-card.js';
import type {ArcAppConnectionRequest} from '@remotearc/protocol';
import {ArcRunReceipt} from './arc-verification-ui.js';
import type {ChatMessage,ChatRun} from './use-arc-chat.js';
import {workStepLabel,workStepStatus} from './arc-work-summary.js';
type Tr=(en:string,zh:string)=>string;
export function ArcTurnWork({run,messages,tr,errorText,connectionRequests=[],onConnectionChanged=async()=>{}}:{run:ChatRun;messages:ChatMessage[];tr:Tr;errorText:(code:string)=>string;connectionRequests?:ArcAppConnectionRequest[];onConnectionChanged?:()=>Promise<void>}){
 const tools=messages.filter(message=>message.role==='tool'),active=['queued','thinking','working'].includes(run.status),receipt=run.receipt;
 if(!tools.length&&!active&&!run.error&&!receipt?.scope&&!connectionRequests.length)return null;
 const progress=run.status==='working'?(tools.at(-1)?.text||tr('Working…','处理中…')):tr('Thinking…','思考中…');
 return <div className="arcTurnWork" data-run-id={run.id}><span className="arcMessageAvatar"><img src="/remote-arc.svg" alt="Arc" width={21} height={21}/></span><div className="arcTurnWorkBody"><details className="arcWorkTrace"><summary>{active?<span className="arcRunProgress" role="status"><span className="arcThinkingDots" aria-hidden="true"><i/><i/><i/></span><span className="arcThinkingLabel">{progress}</span></span>:tr('Work details','执行记录')}{tools.length>0&&<span> · {tools.length}</span>}</summary><ol>{tools.map(message=><li key={message.id}><span data-state={message.status}>{message.status==='completed'?'✓':message.status==='running'?'…':'!'}</span><div><strong>{message.text||workStepLabel(message.tool,tr)}</strong><small>{workStepStatus(message.status,tr)}</small></div></li>)}</ol>{receipt&&!receipt.scope&&<ArcRunReceipt receipt={receipt} tr={tr}/>}</details>{connectionRequests.map(request=><ArcAppConnectionCard key={request.id} request={request} tr={tr} onChanged={onConnectionChanged}/>)}{run.error&&<div className="arcChatError arcChatErrorInline" role="alert"><p>{errorText(run.error)}</p><details className="arcChatErrorDetails"><summary>{tr('Error details','错误详情')}</summary><code>{/^[A-Z_]{1,100}$/.test(run.error)?run.error:'ARC_EXECUTION_FAILED'}</code><small>{tr('Run','运行')} · {run.id}</small></details></div>}</div></div>;
}
