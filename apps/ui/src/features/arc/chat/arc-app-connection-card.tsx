import {useEffect,useRef,useState} from 'react';
import type {ArcAppConnectionRequest} from '@remotearc/protocol';
import {arcRequest} from './use-arc-chat.js';
import {AppCredentialForm,type AppCredentialInput} from '../../apps/apps-auth-form.js';
import {UI_PREVIEW} from '../../../preview/preview-mode.js';
import './arc-app-connection-card.css';

type Tr=(en:string,zh:string)=>string;
async function appsRequest(path:string,body:unknown){
 const response=await fetch('/api/apps/'+path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body)});
 const result=await response.json();if(!response.ok)throw Error('CONNECTION_UNAVAILABLE');return result;
}
export function ArcAppConnectionCard({request,tr,onChanged}:{request:ArcAppConnectionRequest;tr:Tr;onChanged:()=>Promise<void>}){
 const [current,setCurrent]=useState(request),[busy,setBusy]=useState(false),[error,setError]=useState(()=>typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('connection')==='retry'?tr('Connection was not completed. You can try again here.','连接尚未完成，你可以在这里重试。'):''),[credentials,setCredentials]=useState(false),[shop,setShop]=useState('');
 const live=useRef(true),lock=useRef(false);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{setCurrent(request);},[request.id,request.status,request.configured]);
 async function resume(connectionId:string){await arcRequest('app-connections/'+current.id,{method:'POST',body:JSON.stringify({action:'resume',connectionId})});if(live.current){setCurrent(value=>({...value,status:'resumed'}));await onChanged();}}
 async function connect(){
  if(lock.current||!['pending','expired'].includes(current.status)||!current.configured)return;
  lock.current=true;setBusy(true);setError('');
  try{
   if(current.status==='expired'){const value=await arcRequest<{request:ArcAppConnectionRequest}>('app-connections/'+current.id,{method:'POST',body:JSON.stringify({action:'renew'})});if(live.current)setCurrent(value.request);}
   if(UI_PREVIEW){await resume('preview-'+current.provider);return;}
   if(current.auth==='api_key'){setCredentials(true);return;}
   const result=await appsRequest('authorize',{provider:current.provider,permissions:['read','write'],chatRequestId:current.id,...(current.provider==='shopify'?{settings:{shopDomain:shop.trim().toLowerCase()}}:{})});
   const destination=new URL(result.authorizationUrl);if(destination.protocol!=='https:')throw Error('CONNECTION_UNAVAILABLE');
   window.location.assign(destination.href);
  }catch{if(live.current)setError(tr('Connection could not start. Please try again.','暂时无法开始连接，请再试一次。'));}
  finally{lock.current=false;if(live.current)setBusy(false);}
 }
 async function credential(input:AppCredentialInput){
  if(lock.current)return false;lock.current=true;setBusy(true);setError('');
  try{const result=await appsRequest('connections',{provider:current.provider,...input});await resume(result.connection.id);return true;}
  catch{if(live.current)setError(tr('Connection could not finish. Check the details and try again.','连接未完成，请核对连接信息后重试。'));return false;}
  finally{lock.current=false;if(live.current)setBusy(false);}
 }
 async function cancel(){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{await arcRequest('app-connections/'+current.id,{method:'POST',body:JSON.stringify({action:'cancel'})});if(live.current){setCurrent(value=>({...value,status:'cancelled'}));await onChanged();}}
  catch{if(live.current)setError(tr('Please try again.','请再试一次。'));}
  finally{lock.current=false;if(live.current)setBusy(false);}
 }
 const closed=current.status==='cancelled'||current.status==='expired';
 return <section className="arcAppConnectionCard" data-status={current.status} aria-label={tr('Connect '+current.name,'连接 '+current.name)}>
  <header><span className="arcAppConnectionBrand"><img src={'/app-brands/'+current.brand+'.svg'} width={30} height={30} alt=""/></span><div><strong>{current.status==='resumed'?tr(current.name+' connected',current.name+' 已连接'):tr('Connect '+current.name,'连接 '+current.name)}</strong><p>{current.status==='resumed'?tr('Ready to use in this conversation.','可以在此对话中直接使用。'):closed?current.status==='expired'?tr('This connection request has expired.','此连接请求已过期。'):tr('Connection cancelled.','已取消连接。'):current.configured?tr('Connect once and I’ll continue your task here.','连接后，我会在这里继续处理你的任务。'):tr('This app is temporarily unavailable. Your task is saved.','此应用暂时无法连接，你的任务已保留。')}</p></div></header>
  {['pending','expired'].includes(current.status)&&current.configured&&<>
   {credentials?<AppCredentialForm provider={current.provider} write busy={busy} onConnect={credential} onCancel={()=>setCredentials(false)}/>:<div className="arcAppConnectionActions">
    {current.provider==='shopify'&&<label>{tr('Store address','店铺地址')}<input type="text" value={shop} onChange={event=>setShop(event.target.value)} placeholder="your-store.myshopify.com" autoComplete="url" maxLength={100}/></label>}
    <button type="button" className="arcRadiantCta" disabled={busy||current.provider==='shopify'&&!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop.trim().toLowerCase())} onClick={()=>void connect()}>{busy?tr('Connecting…','正在连接…'):tr('Connect '+current.name,'连接 '+current.name)}</button>
    <button type="button" className="arcAppConnectionLater" disabled={busy} onClick={()=>void cancel()}>{tr('Not now','暂不连接')}</button>
   </div>}
   <small>{tr('Your sign-in details stay private.','登录信息不会进入对话。')}</small>
  </>}
  {current.status==='pending'&&!current.configured&&<div className="arcAppConnectionActions"><button type="button" className="arcAppConnectionLater" disabled={busy} onClick={()=>void cancel()}>{tr('Not now','暂不连接')}</button></div>}
  {error&&<p className="arcAppConnectionError" role="alert">{error}</p>}
 </section>;
}
