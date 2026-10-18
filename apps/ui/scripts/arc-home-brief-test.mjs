import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';
import { act, create } from 'react-test-renderer';
registerHooks({load(url, context, next) { return url.endsWith('.css') ? {format:'module',source:'',shortCircuit:true} : next(url, context); }});
const { ArcHomeBrief } = await import('../src/arc-home-brief.tsx');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const original = globalThis.fetch;
let requests = 0, fail = false, lastSignal, reviewed, navigated;
const brief = {
  work: [{id:'task-1',name:'Release review',kind:'task',status:'failed'},{id:'routine-1',name:'Morning brief',kind:'routine',status:'waiting'}],
  runs: [
    {id:'r1',session_id:'chat-1',title:'Unconfirmed update',status:'unknown',automation_id:null},
    {id:'r2',session_id:'task-session',title:'Release review',status:'failed',automation_id:'task-1'},
    {id:'r3',session_id:'recovered-chat',title:'Already recovered',status:'succeeded',automation_id:null},
    {id:'r4',session_id:'recovered-chat',title:'Old failed attempt',status:'failed',automation_id:null},
  ],
};
globalThis.fetch = async (url, init) => { assert.equal(url,'/api/arc/work'); assert.equal(init.method || 'GET','GET'); requests++;lastSignal=init.signal;if(fail)throw new Error('network');return Response.json(brief); };
const props = {enabled:true,onlineDevices:1,totalDevices:2,tr:en=>en,onTasks:()=>navigated='tasks',onRoutines:()=>navigated='routines',onDevices:()=>navigated='devices',onReview:(prompt,id)=>reviewed={prompt,id}};
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
let root;
try {
  await act(async()=>{root=create(React.createElement(ArcHomeBrief,props));});
  assert.equal(requests,1);
  const body=text(root.toJSON());assert(body.includes('Release review'));assert(body.includes('Unconfirmed update'));assert(!body.includes('Old failed attempt'));
  const header=root.root.findByType('header');assert.equal(text(header).endsWith('3'),true,'A failed task, unknown chat and offline computer need attention');
  const buttons=root.root.findAllByType('button');
  await act(async()=>buttons.find(button=>text(button).includes('Release review')).props.onClick());assert(reviewed.prompt.includes('task-1'));assert.equal(reviewed.id,undefined);
  await act(async()=>buttons.find(button=>text(button).includes('Unconfirmed update')).props.onClick());assert.equal(reviewed.id,'chat-1');
  await act(async()=>buttons.find(button=>text(button).includes('1 computer offline')).props.onClick());assert.equal(navigated,'devices');
  await act(async()=>root.unmount());assert.equal(lastSignal.aborted,true);
  fail=true;await act(async()=>{root=create(React.createElement(ArcHomeBrief,props));});assert(text(root.toJSON()).includes('temporarily unavailable'));
  fail=false;await act(async()=>root.root.findByType('button').props.onClick());assert(text(root.toJSON()).includes('Release review'));
  await act(async()=>root.unmount());const before=requests;
  await act(async()=>{root=create(React.createElement(ArcHomeBrief,{...props,enabled:false}));});assert.equal(root.toJSON(),null);assert.equal(requests,before,'Closed Arc does not load a personal briefing');
  console.log('PASS: actual work summary, resolved-history suppression, review navigation, GET-only access, recovery and cancellation');
} finally { if(root)await act(async()=>root.unmount());globalThis.fetch=original; }
