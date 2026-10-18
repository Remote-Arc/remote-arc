import assert from 'node:assert/strict';
import React from 'react';
// The hook is exercised against HTTP responses, independently of the visual mock preview.
// @ts-ignore react-test-renderer has no declarations in this workspace.
import {act,create} from 'react-test-renderer';
import {useArcChat} from '../src/use-arc-chat.js';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const originalFetch=globalThis.fetch;
let active=false,completed=false,firstLost=true,deleted=false,runCount=0;
const ids:string[]=[], methods:string[]=[], messages:any[]=[];
const session={id:'conversation-1',title:'Inspect my apps',modelId:'auto',updatedAt:new Date().toISOString()};
let run:any;
let current!:ReturnType<typeof useArcChat>;
function Harness(){current=useArcChat('account-1');return null;}
globalThis.fetch=(async(input,init)=>{
  const path=String(input).split('/api/arc/')[1],method=init?.method||'GET';methods.push(method+' '+path);
  assert.equal(init?.credentials,'same-origin');
  if(path==='status')return Response.json({enabled:true,access:{status:active?'active':'eligible',canUse:active,daysRemaining:active?14:0,dailyUsedPercent:completed?7:0,expiresAt:null},models:[{id:'auto',label:'Auto',configured:true,premium:false,provider:'openai'}],limits:{maxSteps:8,maxTokens:24000,maxSeconds:180}});
  if(path==='trial'){assert.equal(method,'POST');assert.deepEqual(JSON.parse(String(init?.body)),{confirm:true});active=true;return Response.json({ok:true});}
  if(path==='sessions'&&method==='GET')return Response.json({sessions:deleted?[]:[session]});
  if(path==='sessions'&&method==='POST')return Response.json({id:session.id},{status:201});
  if(path===`sessions/${session.id}/messages`){const body=JSON.parse(String(init?.body));assert.equal(body.modelId,'auto');assert.equal('apiKey' in body,false);ids.push(body.requestId);if(!run||run.requestId!==body.requestId){run={id:'run-'+(++runCount),requestId:body.requestId,status:'queued',step:0,tokensUsed:0,maxTokens:24000,maxSteps:8,deadline:new Date(Date.now()+180000).toISOString(),error:null};messages.push({id:'user-'+runCount,role:'user',text:body.text});}if(firstLost){firstLost=false;return Response.json({error:'TEMPORARY_NETWORK_FAILURE'},{status:503});}return Response.json({run},{status:202});}
  if(path===`sessions/${session.id}/cancel`){assert.equal(JSON.parse(String(init?.body)).runId,run.id);run={...run,status:'cancelled'};return Response.json({session,messages,runs:[run]});}
  if(path===`sessions/${session.id}`&&method==='DELETE'){deleted=true;return Response.json({ok:true});}
  if(path===`sessions/${session.id}`){if(completed&&run?.status==='queued'){run={...run,status:'succeeded',step:2,tokensUsed:640};messages.push({id:'reply-'+runCount,role:'assistant',text:'Connected apps inspected.'});}return Response.json({session,messages,runs:run?[run]:[]});}
  throw Error('Unexpected request '+method+' '+path);
}) as typeof fetch;
let root:any;
try {
  await act(async()=>{root=create(React.createElement(Harness));});
  assert.equal(current.service?.access.status,'eligible');
  let sent=true;await act(async()=>{sent=await current.send('Inspect my apps');});assert.equal(sent,false);assert.equal(runCount,0,'No inference before explicit activation');
  await act(async()=>{await current.startTrial();});assert.equal(current.service?.access.canUse,true);
  await act(async()=>{sent=await current.send('Inspect my apps');});assert.equal(sent,false,'Lost acknowledgement is visible');
  await act(async()=>{sent=await current.send('Inspect my apps');});assert.equal(sent,true);assert.equal(ids[0],ids[1],'Retries retain the same server idempotency key');assert.equal(runCount,1);assert.equal(current.running,true);
  completed=true;await act(async()=>{await new Promise(resolve=>setTimeout(resolve,650));});assert.equal(current.running,false);assert.equal(current.current?.messages.at(-1)?.text,'Connected apps inspected.');assert.equal(current.service?.access.dailyUsedPercent,7,'Quota refresh follows actual completion');
  completed=false;await act(async()=>{await current.send('Continue');});assert.equal(current.running,true);await act(async()=>{await current.cancel();});assert.equal(current.run?.status,'cancelled');
  await act(async()=>{await current.remove(session.id);});assert.equal(current.current,null);assert.equal(current.sessions.length,0);
  assert.ok(methods.includes('POST trial'));
  console.log('PASS: native Chat activation, send, lost-response retry, completion polling, usage refresh, cancellation and history deletion');
} finally {if(root)await act(async()=>root.unmount());globalThis.fetch=originalFetch;}
