import assert from 'node:assert/strict';
import React from 'react';
// @ts-ignore Test renderer is provided by this workspace.
import {act,create} from 'react-test-renderer';
import {renderToStaticMarkup} from 'react-dom/server';
import {ArcVerifiedTaskForm,ArcRunReceipt} from '../src/arc-verification-ui.js';
import type {ArcVerification} from '@remotearc/protocol';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const tr=(en:string)=>en,connections=[{id:'mail',provider:'gmail',accountLabel:'Mailbox',status:'active'},{id:'gh',provider:'github',accountLabel:'Repository',status:'active'},{id:'dpl',provider:'vercel',accountLabel:'Deployments',status:'active'}];
const sent:ArcVerification[]=[];let root:any;
try{
 await act(async()=>{root=create(<ArcVerifiedTaskForm tr={tr} connections={connections} busy={false} onRun={async scope=>{sent.push(scope);}}/>);});
 assert.equal(sent.length,0,'Opening the form does not authorize execution');
 const select=async(index:number,value:string)=>act(async()=>root.root.findAllByType('select')[index].props.onChange({target:{value}}));
 const fill=async(label:string,value:string)=>act(async()=>{const node=root.root.findAllByType('label').find((item:any)=>item.children.join('')===label);root.root.findByProps({id:node.props.htmlFor}).props.onChange({target:{value}});});
 const submit=async()=>act(async()=>root.root.findByType('form').props.onSubmit({preventDefault(){}}));
 await submit();assert.equal(sent.length,0,'An account must be selected explicitly');
 await select(1,'mail');await submit();assert.deepEqual(sent[0],{kind:'inbox',connectionId:'mail',limit:5});
 await select(0,'github_issue');assert.equal(root.root.findAllByType('select')[1].props.value,'','Changing task type clears the previous account');await select(1,'gh');await fill('Repository (owner/repo)','owner/repo');await fill('Exact issue title','Exact title');await fill('Exact issue body','Use this body exactly.');await submit();assert.deepEqual(sent[1],{kind:'github_issue',connectionId:'gh',repo:'owner/repo',title:'Exact title',body:'Use this body exactly.'});
 await fill('Exact issue body','资料'.repeat(1200));await submit();assert.equal(sent.length,2,'A body exceeding the byte limit is rejected before any request');assert.equal(root.root.findAllByProps({role:'alert'}).length,1);
 await select(0,'deployment');await select(1,'dpl');await fill('Deployment ID','dpl_exact');await fill('Optional team ID','team_exact');await submit();assert.deepEqual(sent[2],{kind:'deployment',connectionId:'dpl',deploymentId:'dpl_exact',teamId:'team_exact'});
 const html=renderToStaticMarkup(<ArcRunReceipt tr={tr} receipt={{version:1,status:'pending_verification',scope:null,checks:[],changes:[],evidence:[],next:'verify_result',error:null}}/>);assert(html.includes('Pending verification'));assert(!html.includes('Declared checks passed'));
 console.log('PASS: explicit verification consent, account reset, exact payloads, UTF-8 limits and truthful pending receipts');
}finally{if(root)await act(async()=>root.unmount());}
