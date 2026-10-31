import type {ArcAttachment,ArcLocation} from '@remotearc/protocol';
import type {ArcEmployeeAvatar} from '@remotearc/protocol';
import type {ArcAppConnectionRequest} from '@remotearc/protocol';
import type {ArcDelegationProgress} from '@remotearc/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {ArcVerification,ArcReceipt,ArcEmployeeDraft} from '@remotearc/protocol';
import type {ArcWork} from '../workspace/arc-task-card.js';

export type ChatSession={id:string;title:string;modelId:string;updatedAt:string;automationId?:string};
export type ChatMessage={id:string;attachments?:ArcAttachment[];location?:ArcLocation;teammates?:{id:string;name:string;responsibility:string;avatar:ArcEmployeeAvatar}[];run_id?:string|null;role:'user'|'assistant'|'tool';text:string;skills?:{id:string;name:string}[];apps?:{id:string;name:string;provider:string}[];tool?:string;arguments?:unknown;result?:unknown;status?:string;verification?:ArcVerification};
export type ChatRun={id:string;status:string;step:number;tokensUsed:number;maxTokens:number;maxSteps:number;deadline:string;error:string|null;receipt?:ArcReceipt};
export type ArcAccess={status:'eligible'|'active'|'expired'|'paid'|'excluded';canUse:boolean;funded?:boolean;trialDays?:number;trialCredits?:number;creditsAvailable?:number|null;creditsPending?:number|null;daysRemaining:number;dailyUsedPercent:number;expiresAt:string|null};
export type ChatService={enabled:boolean;access:ArcAccess;models:{id:string;label:string;provider:string;premium:boolean;configured:boolean;requiresPaid?:boolean;inputCreditsPer1000?:number;outputCreditsPer1000?:number}[];limits:{maxSteps:number;maxTokens:number;maxSeconds:number};preview?:boolean};
type Snapshot={work?:ArcWork[];hasMore?:boolean;before?:string|null;historyLoaded?:boolean;delegations?:ArcDelegationProgress[];appConnections?:ArcAppConnectionRequest[];employeeDrafts?:ArcEmployeeDraft[];pendingDelegations?:boolean;session:ChatSession;messages:ChatMessage[];runs:ChatRun[]};
export function mergeArcSnapshot(previous:Snapshot|null,incoming:Snapshot):Snapshot{
 if(previous?.session.id!==incoming.session.id||!previous.historyLoaded)return incoming;
 return{...incoming,messages:[...new Map([...previous.messages,...incoming.messages].map(message=>[message.id,message])).values()],runs:[...incoming.runs,...previous.runs.filter(run=>!incoming.runs.some(latest=>latest.id===run.id))],hasMore:previous.hasMore,before:previous.before,historyLoaded:true};
}
const active=(run:ChatRun|undefined)=>Boolean(run&&['queued','thinking','working'].includes(run.status));
export async function arcRequest<T>(path:string,init?:RequestInit,signal?:AbortSignal):Promise<T>{
 const response=await fetch('/api/arc/'+path,{credentials:'same-origin',...init,signal,headers:{accept:'application/json',...(init?.body?{'content-type':'application/json'}:{}),...init?.headers}});
 const body=await response.json().catch(()=>null);if(!response.ok)throw new Error(body?.error||'CHAT_UNAVAILABLE');if(!body)throw new Error('CHAT_UNAVAILABLE');return body as T;
}
export function useArcChat(accountId:string,initialSessionId?:string){
 const [service,setService]=useState<ChatService|null>(null),[sessions,setSessions]=useState<ChatSession[]>([]),[current,setCurrent]=useState<Snapshot|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [selectedSessionId,setSelectedSessionId]=useState<string|null>(initialSessionId||null),[opening,setOpening]=useState(false);
 const [loadingHistory,setLoadingHistory]=useState(false);
 // An old request may finish after navigation; it can only release its own lock.
 const [modelId,setModelId]=useState('auto');const generation=useRef(0),accountGeneration=useRef(0),mounted=useRef(true),requestLock=useRef<symbol|null>(null),pending=useRef<{id:string;text:string;sessionId:string;modelId:string}|null>(null);
 const selected=useRef<string|null>(null),poll=useRef<AbortController|null>(null);
 // Account-wide lists/allowances survive chat navigation; message state does not.
 const refreshSessions=useCallback(async()=>{const version=accountGeneration.current;const data=await arcRequest<{sessions:ChatSession[]}>('sessions');if(mounted.current&&accountGeneration.current===version)setSessions(data.sessions);},[]);
  const refreshService=useCallback(async()=>{const version=accountGeneration.current;const value=await arcRequest<ChatService>('status');if(mounted.current&&accountGeneration.current===version)setService(value);},[]);
 useEffect(()=>{
  mounted.current=true;accountGeneration.current++;const controller=new AbortController();let live=true;
  setService(null);setCurrent(null);setSelectedSessionId(initialSessionId||null);setOpening(Boolean(initialSessionId));setSessions([]);selected.current=null;pending.current=null;requestLock.current=null;setBusy(false);setLoadingHistory(false);setModelId('auto');setError('');
   void arcRequest<ChatService>('status',undefined,controller.signal).then(async value=>{if(!live)return;setService(value);await refreshSessions();}).catch(e=>{if(live)setError(e.message);});
  return()=>{live=false;mounted.current=false;controller.abort();poll.current?.abort();generation.current++;accountGeneration.current++;};
 },[accountId,refreshSessions]);
 const open=useCallback(async(id:string)=>{
  const version=++generation.current;requestLock.current=null;poll.current?.abort();selected.current=id;setSelectedSessionId(id);setOpening(true);setLoadingHistory(false);setError('');setCurrent(null);setBusy(true);
  try{const value=await arcRequest<Snapshot>('sessions/'+encodeURIComponent(id));if(mounted.current&&generation.current===version){setCurrent(previous=>mergeArcSnapshot(previous,value));setModelId(value.session.modelId);}}
  catch(e){if(mounted.current&&generation.current===version)setError(e instanceof Error?e.message:'CHAT_UNAVAILABLE');}
  finally{if(mounted.current&&generation.current===version){setBusy(false);setOpening(false);}}
 },[]);
 const run=current?.runs[0],running=active(run),sessionId=current?.session.id,watching=running||Boolean(current?.pendingDelegations);
 const refreshCurrent=useCallback(async()=>{const id=selected.current,version=generation.current;if(!id)return;const value=await arcRequest<Snapshot>('sessions/'+encodeURIComponent(id));if(mounted.current&&generation.current===version&&selected.current===id)setCurrent(previous=>mergeArcSnapshot(previous,value));},[]);
 useEffect(()=>{
  if(!sessionId||!watching)return;const controller=new AbortController();poll.current=controller;const version=generation.current;let timer:ReturnType<typeof setTimeout>;
  const tick=async()=>{
   try{const value=await arcRequest<Snapshot>('sessions/'+encodeURIComponent(sessionId),undefined,controller.signal);if(controller.signal.aborted||generation.current!==version)return;setCurrent(previous=>mergeArcSnapshot(previous,value));if(!active(value.runs[0])&&!value.pendingDelegations){void refreshSessions().catch(()=>{});void refreshService().catch(()=>{});return;}}
   catch(e){if(controller.signal.aborted||!mounted.current||generation.current!==version)return;setError(e instanceof Error?e.message:'CHAT_UNAVAILABLE');}
   if(!controller.signal.aborted)timer=setTimeout(tick,running?1200:5000);
  };
  timer=setTimeout(tick,500);return()=>{controller.abort();clearTimeout(timer);};
 },[sessionId,running,watching,refreshSessions,refreshService]);
 const newChat=()=>{setLoadingHistory(false);generation.current++;requestLock.current=null;selected.current=null;setSelectedSessionId(null);setOpening(false);poll.current?.abort();setCurrent(null);setBusy(false);setError('');pending.current=null;};
 async function send(text:string,skillIds:string[]=[],verification?:ArcVerification,appIds:string[]=[],employeeIds:string[]=[],inputs:{attachmentIds?:string[];location?:ArcLocation}={}){
   if(requestLock.current||opening||running||!service?.enabled||!service.access.canUse)return false;const lock=Symbol();requestLock.current=lock;setBusy(true);setError('');const version=generation.current,accountVersion=accountGeneration.current;
  try{
   let id=selected.current;
   if(!id){const created=await arcRequest<{id:string}>('sessions',{method:'POST',body:JSON.stringify({modelId})});id=created.id;if(!mounted.current||generation.current!==version)return false;selected.current=id;}
   const signature=JSON.stringify([text,skillIds,verification,appIds,employeeIds,inputs]);
   if(!pending.current||pending.current.text!==signature||pending.current.sessionId!==id||pending.current.modelId!==modelId)pending.current={id:crypto.randomUUID(),text:signature,sessionId:id,modelId};
   const response=await arcRequest<{run:ChatRun}>('sessions/'+encodeURIComponent(id)+'/messages',{method:'POST',body:JSON.stringify({text,modelId,requestId:pending.current.id,...(skillIds.length?{skillIds}:{}),...(appIds.length?{appIds}:{}),...(employeeIds.length?{employeeIds}:{}),...(inputs.attachmentIds?.length?{attachmentIds:inputs.attachmentIds}:{}),...(inputs.location?{location:inputs.location}:{}),...(verification?{verification}:{})})});
   if(mounted.current&&accountGeneration.current===accountVersion)void refreshSessions().catch(()=>{});
   if(!mounted.current||generation.current!==version)return false;
   const snapshot=await arcRequest<Snapshot>('sessions/'+encodeURIComponent(id));
   if(!mounted.current||generation.current!==version)return false;
   setCurrent(previous=>mergeArcSnapshot(previous,snapshot.runs.some(r=>r.id===response.run.id)?snapshot:{...snapshot,runs:[response.run,...snapshot.runs]}));
   pending.current=null;return true;
  }catch(e){if(mounted.current&&generation.current===version)setError(e instanceof Error?e.message:'CHAT_UNAVAILABLE');return false;}
  finally{if(requestLock.current===lock)requestLock.current=null;if(mounted.current&&generation.current===version)setBusy(false);}
 }
 async function cancel(){if(!current||!run||requestLock.current)return;const version=generation.current;setError('');try{const value=await arcRequest<Snapshot>('sessions/'+encodeURIComponent(current.session.id)+'/cancel',{method:'POST',body:JSON.stringify({runId:run.id})});if(mounted.current&&generation.current===version&&selected.current===current.session.id)setCurrent(previous=>mergeArcSnapshot(previous,value));}catch(e){if(mounted.current&&generation.current===version)setError(e instanceof Error?e.message:'CHAT_UNAVAILABLE');}}
 async function loadEarlier(){
  if(!current?.hasMore||!current.before||loadingHistory)return false;
  const id=current.session.id,version=generation.current;setLoadingHistory(true);
  try{const page=await arcRequest<{messages:ChatMessage[];hasMore:boolean;before:string|null}>('sessions/'+encodeURIComponent(id)+'/history?before='+encodeURIComponent(current.before));if(!mounted.current||generation.current!==version)return false;setCurrent(previous=>previous?.session.id===id?{...previous,messages:[...new Map([...page.messages,...previous.messages].map(message=>[message.id,message])).values()],hasMore:page.hasMore,before:page.before,historyLoaded:true}:previous);return true;}
  catch(e){if(mounted.current&&generation.current===version)setError(e instanceof Error?e.message:'CHAT_UNAVAILABLE');return false;}
  finally{if(mounted.current&&generation.current===version)setLoadingHistory(false);}
 }
 async function remove(id:string){let version=generation.current;const accountVersion=accountGeneration.current;try{await arcRequest('sessions/'+encodeURIComponent(id),{method:'DELETE'});if(!mounted.current||accountGeneration.current!==accountVersion)return;if(generation.current===version&&selected.current===id){newChat();version=generation.current;}await refreshSessions();}catch(e){if(mounted.current&&generation.current===version)setError(e instanceof Error?e.message:'CHAT_UNAVAILABLE');}}
  async function startTrial(){if(requestLock.current||!service?.enabled)return;const lock=Symbol();requestLock.current=lock;setBusy(true);setError('');const version=generation.current,accountVersion=accountGeneration.current;try{await arcRequest('trial',{method:'POST',body:JSON.stringify({confirm:true})});if(!mounted.current||accountVersion!==accountGeneration.current)return;await refreshService();}catch(e){if(mounted.current&&version===generation.current)setError(e instanceof Error?e.message:'CHAT_UNAVAILABLE');}finally{if(requestLock.current===lock)requestLock.current=null;if(mounted.current&&version===generation.current)setBusy(false);}}
  return{service,sessions,current,selectedSessionId,opening,loadingHistory,loadEarlier,busy,running,run,error,modelId,setModelId,send,open,newChat,cancel,remove,startTrial,refreshCurrent};
}
