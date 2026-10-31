import assert from 'node:assert/strict';
import React from 'react';
// @ts-ignore react-test-renderer has no declarations in this workspace.
import {act,create} from 'react-test-renderer';
import {useArcChat} from '../src/features/arc/chat/use-arc-chat.js';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const originalFetch=globalThis.fetch;
const session=(id:string)=>({id,title:id,modelId:'auto',updatedAt:new Date().toISOString()});
const snapshot=(id:string)=>({session:session(id),messages:[],runs:[]});
const deferred=()=>{let resolve!:(value:Response)=>void;const promise=new Promise<Response>(done=>{resolve=done;});return{promise,resolve};};
let current!:ReturnType<typeof useArcChat>,root:any;
function Harness({account='account-1'}:{account?:string}){current=useArcChat(account);return null;}
let intercept:(path:string,init?:RequestInit)=>Promise<Response>|undefined=()=>undefined;
let nextSession=0;
const requests:string[]=[];
globalThis.fetch=(async(input,init)=>{
 const path=String(input).split('/api/arc/')[1]!;
 requests.push((init?.method||'GET')+' '+path);
 const held=intercept(path,init);if(held)return held;
 if(path==='status')return Response.json({enabled:true,access:{status:'active',canUse:true},models:[],limits:{}});
 if(path==='sessions')return Response.json(init?.method==='POST'?{id:'chat-'+(++nextSession)}:{sessions:[]});
 if(path.endsWith('/messages'))return Response.json({run:{id:'run',status:'succeeded'}});
 if(init?.method==='DELETE')return Response.json({ok:true});
 return Response.json(snapshot(path.split('/')[1]!));
}) as typeof fetch;
async function mount(){intercept=()=>undefined;await act(async()=>{root=create(React.createElement(Harness));});}
async function unmount(){await act(async()=>root.unmount());root=null;}
try{
 await mount();
 const first=deferred(),retryIds:string[]=[];let posts=0,oldSend!:Promise<boolean>;
 intercept=(path,init)=>{if(!path.endsWith('/messages'))return;const body=JSON.parse(String(init?.body));posts++;if(posts===1)return first.promise;retryIds.push(body.requestId);if(posts===2)return Promise.resolve(Response.json({error:'TEMPORARY_NETWORK_FAILURE'},{status:503}));};
 await act(async()=>{oldSend=current.send('Old message');await Promise.resolve();});
 await act(async()=>current.newChat());
 let sent=true;
 await act(async()=>{sent=await current.send('New message');});
 assert.equal(posts,2,'A pending request in the previous chat cannot silently block a new chat');
 assert.equal(sent,false);
 const listsBefore=requests.filter(value=>value==='GET sessions').length;
 await act(async()=>{first.resolve(Response.json({run:{id:'old-run',status:'succeeded'}}));sent=await oldSend;});
 assert.equal(sent,false,'A stale acknowledgement must not clear the new composer');
 assert.equal(requests.filter(value=>value==='GET sessions').length,listsBefore+1,'The old chat still becomes discoverable in the account’s recent chats');
 await act(async()=>{sent=await current.send('New message');});
 assert.equal(sent,true);
 assert.equal(retryIds[0],retryIds[1],'The old request must not erase the new chat’s retry key');
 await unmount();

 await mount();
 const oldRequest=deferred(),newRequest=deferred();let oldResult!:Promise<boolean>,newResult!:Promise<boolean>,dispatches=0;
 intercept=path=>{if(path.endsWith('/messages'))return ++dispatches===1?oldRequest.promise:newRequest.promise;};
 await act(async()=>{oldResult=current.send('First chat');await Promise.resolve();});
 await act(async()=>current.newChat());
 await act(async()=>{newResult=current.send('Second chat');await Promise.resolve();});
 await act(async()=>{oldRequest.resolve(Response.json({run:{id:'first',status:'succeeded'}}));await oldResult;});
 await act(async()=>{assert.equal(await current.send('Second chat'),false);});
 assert.equal(dispatches,2,'Finishing an old send cannot release a newer request’s lock');
 await act(async()=>{newRequest.resolve(Response.json({run:{id:'second',status:'succeeded'}}));assert.equal(await newResult,true);});
 await unmount();

 await mount();
 const held=deferred();let sending!:Promise<boolean>;
 intercept=path=>path.endsWith('/messages')?held.promise:undefined;
 await act(async()=>{sending=current.send('Previous account');await Promise.resolve();});
 assert.equal(current.busy,true);
 await act(async()=>root.update(React.createElement(Harness,{account:'account-2'})));
 assert.equal(current.busy,false,'An account change resets the previous account’s loading state');
 intercept=()=>undefined;
 await act(async()=>{held.resolve(Response.json({run:{id:'old-run',status:'succeeded'}}));sent=await sending;});
 assert.equal(sent,false);
 assert.equal(current.current,null);
 await unmount();

 await mount();
 const trial=deferred();let activation!:Promise<void>,trialFinished=false;
 intercept=path=>path==='trial'?trial.promise:path==='status'?Promise.resolve(Response.json({enabled:true,access:{status:trialFinished?'active':'eligible',canUse:trialFinished},models:[],limits:{}})):undefined;
 await act(async()=>{activation=current.startTrial();});
 await act(async()=>current.newChat());
 trialFinished=true;
 await act(async()=>{trial.resolve(Response.json({ok:true}));await activation;});
 assert.equal(current.service?.access.status,'active','Activation updates the account allowance after navigating to another chat');
 await unmount();

 for(const operation of ['cancel','remove'] as const){
  await mount();
  intercept=path=>path==='sessions/reused-id'?Promise.resolve(Response.json({...snapshot('reused-id'),runs:[{id:'working',status:'working'}]})):undefined;
  await act(async()=>{await current.open('reused-id');});
  const pending=deferred();let action!:Promise<void>;
  intercept=(path,init)=>path.endsWith('/cancel')||init?.method==='DELETE'?pending.promise:undefined;
  await act(async()=>{action=operation==='cancel'?current.cancel():current.remove('reused-id');});
  await act(async()=>{current.newChat();});
  await act(async()=>{pending.resolve(Response.json({error:'OLD_CHAT_FAILURE'},{status:503}));await action;});
  assert.equal(current.error,'',`A late ${operation} failure cannot appear in another chat`);
  await unmount();
 }
 console.log('PASS: chat/account switches isolate pending sends, retries, cancellation and deletion');
}finally{if(root)await unmount();globalThis.fetch=originalFetch;}
