import { useCallback, useEffect, useRef, useState } from 'react';

export type ChatSession={id:string;title:string;modelId:string;updatedAt:string};
export type ChatMessage={id:string;role:'user'|'assistant'|'tool';text:string;tool?:string;arguments?:unknown;result?:unknown;status?:string};
export type ChatRun={id:string;status:string;step:number;tokensUsed:number;maxTokens:number;maxSteps:number;deadline:string;error:string|null};
export type ChatService={enabled:boolean;access:{status:'eligible'|'active'|'expired'|'paid';canUse:boolean;daysRemaining:number;dailyUsedPercent:number;expiresAt:string|null};models:{id:string;label:string;provider:string;premium:boolean;configured:boolean}[];limits:{maxSteps:number;maxTokens:number;maxSeconds:number};preview?:boolean};
type Snapshot={session:ChatSession;messages:ChatMessage[];runs:ChatRun[]};
const active=(run:ChatRun|undefined)=>Boolean(run&&['queued','thinking','working'].includes(run.status));
export async function arcRequest<T>(path:string,init?:RequestInit,signal?:AbortSignal):Promise<T>{
 const response=await fetch('/api/arc/'+path,{credentials:'same-origin',...init,signal,headers:{accept:'application/json',...(init?.body?{'content-type':'application/json'}:{}),...init?.headers}});
 const body=await response.json().catch(()=>null);if(!response.ok)throw new Error(body?.error||'CHAT_UNAVAILABLE');if(!body)throw new Error('CHAT_UNAVAILABLE');return body as T;
}
export function useArcChat(accountId:string){
 const [service,setService]=useState<ChatService|null>(null),[sessions,setSessions]=useState<ChatSession[]>([]),[current,setCurrent]=useState<Snapshot|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [modelId,setModelId]=useState('auto');const generation=useRef(0),mounted=useRef(true),requestLock=useRef(false),pending=useRef<{id:string;text:string;sessionId:string;modelId:string}|null>(null);
 const selected=useRef<string|null>(null),poll=useRef<AbortController|null>(null);
 const refreshSessions=useCallback(async()=>{const version=generation.current;const data=await arcRequest<{sessions:ChatSession[]}>('sessions');if(mounted.current&&generation.current===version)setSessions(data.sessions);},[]);
  const refreshService=useCallback(async()=>{const version=generation.current;const value=await arcRequest<ChatService>('status');if(mounted.current&&generation.current===version)setService(value);},[]);
 useEffect(()=>{
  mounted.current=true;const controller=new AbortController();let live=true;
  setService(null);setCurrent(null);setSessions([]);selected.current=null;pending.current=null;setError('');
   void arcRequest<ChatService>('status',undefined,controller.signal).then(async value=>{if(!live)return;setService(value);await refreshSessions();}).catch(e=>{if(live)setError(e.message);});
  return()=>{live=false;mounted.current=false;controller.abort();poll.current?.abort();generation.current++;};
 },[accountId,refreshSessions]);
 const open=useCallback(async(id:string)=>{
  const version=++generation.current;poll.current?.abort();selected.current=id;setError('');setCurrent(null);setBusy(true);
  try{const value=await arcRequest<Snapshot>('sessions/'+encodeURIComponent(id));if(mounted.current&&generation.current===version){setCurrent(value);setModelId(value.session.modelId);}}
  catch(e){if(mounted.current&&generation.current===version)setError(e instanceof Error?e.message:'CHAT_UNAVAILABLE');}
  finally{if(mounted.current&&generation.current===version)setBusy(false);}
 },[]);
 const run=current?.runs[0],running=active(run),sessionId=current?.session.id;
 useEffect(()=>{
  if(!sessionId||!running)return;const controller=new AbortController();poll.current=controller;const version=generation.current;let timer:ReturnType<typeof setTimeout>;
  const tick=async()=>{
   try{const value=await arcRequest<Snapshot>('sessions/'+encodeURIComponent(sessionId),undefined,controller.signal);if(controller.signal.aborted||generation.current!==version)return;setCurrent(value);if(!active(value.runs[0])){void refreshSessions().catch(()=>{});void refreshService().catch(()=>{});return;}}
   catch(e){if(controller.signal.aborted)return;setError(e instanceof Error?e.message:'CHAT_UNAVAILABLE');}
   if(!controller.signal.aborted)timer=setTimeout(tick,1200);
  };
  timer=setTimeout(tick,500);return()=>{controller.abort();clearTimeout(timer);};
 },[sessionId,running,refreshSessions,refreshService]);
 const newChat=()=>{generation.current++;selected.current=null;poll.current?.abort();setCurrent(null);setBusy(false);setError('');pending.current=null;};
 async function send(text:string){
   if(requestLock.current||running||!service?.enabled||!service.access.canUse)return false;requestLock.current=true;setBusy(true);setError('');const version=generation.current;
  try{
   let id=selected.current;
   if(!id){const created=await arcRequest<{id:string}>('sessions',{method:'POST',body:JSON.stringify({modelId})});id=created.id;if(!mounted.current||generation.current!==version)return false;selected.current=id;}
   if(!pending.current||pending.current.text!==text||pending.current.sessionId!==id||pending.current.modelId!==modelId)pending.current={id:crypto.randomUUID(),text,sessionId:id,modelId};
   const response=await arcRequest<{run:ChatRun}>('sessions/'+encodeURIComponent(id)+'/messages',{method:'POST',body:JSON.stringify({text,modelId,requestId:pending.current.id})});
   const snapshot=await arcRequest<Snapshot>('sessions/'+encodeURIComponent(id));
    if(mounted.current&&generation.current===version){setCurrent(snapshot.runs.some(r=>r.id===response.run.id)?snapshot:{...snapshot,runs:[response.run,...snapshot.runs]});void refreshSessions();}
   pending.current=null;return true;
  }catch(e){if(mounted.current&&generation.current===version)setError(e instanceof Error?e.message:'CHAT_UNAVAILABLE');return false;}
  finally{requestLock.current=false;if(mounted.current&&generation.current===version)setBusy(false);}
 }
 async function cancel(){if(!current||!run||requestLock.current)return;setError('');try{const value=await arcRequest<Snapshot>('sessions/'+current.session.id+'/cancel',{method:'POST',body:JSON.stringify({runId:run.id})});if(selected.current===current.session.id)setCurrent(value);}catch(e){setError(e instanceof Error?e.message:'CHAT_UNAVAILABLE');}}
 async function remove(id:string){try{await arcRequest('sessions/'+encodeURIComponent(id),{method:'DELETE'});if(selected.current===id)newChat();await refreshSessions();}catch(e){setError(e instanceof Error?e.message:'CHAT_UNAVAILABLE');}}
  async function startTrial(){if(requestLock.current||!service?.enabled)return;requestLock.current=true;setBusy(true);setError('');const version=generation.current;try{await arcRequest('trial',{method:'POST',body:JSON.stringify({confirm:true})});const value=await arcRequest<ChatService>('status');if(mounted.current&&version===generation.current)setService(value);}catch(e){if(mounted.current&&version===generation.current)setError(e instanceof Error?e.message:'CHAT_UNAVAILABLE');}finally{requestLock.current=false;if(mounted.current&&version===generation.current)setBusy(false);}}
  return{service,sessions,current,busy,running,run,error,modelId,setModelId,send,open,newChat,cancel,remove,startTrial};
}
