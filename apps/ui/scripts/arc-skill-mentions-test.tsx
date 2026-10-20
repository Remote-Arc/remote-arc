import assert from 'node:assert/strict';
import React,{useRef,useState} from 'react';
// @ts-ignore react-test-renderer has no declarations in this workspace.
import {act,create} from 'react-test-renderer';
import {skillMentionAt,useArcSkillMentions} from '../src/arc-skill-mentions.js';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
assert.equal(skillMentionAt('user@example.com',16),null);
assert.deepEqual(skillMentionAt('Use @review please',11),{start:4,end:11,query:'review'});
const originalFetch=globalThis.fetch,originalFrame=globalThis.requestAnimationFrame;let requests=0,owner='one';
globalThis.requestAnimationFrame=callback=>{callback(0);return 1;};
globalThis.fetch=(async(input)=>{assert.equal(input,'/api/arc/skills');requests++;return Response.json({skills:[{id:'builtin-review',name:'Review',description:'Built-in'},{id:owner+'-private-review',name:'Review',description:'Personal instructions'}]});}) as typeof fetch;
let current!:ReturnType<typeof useArcSkillMentions>,draftValue='';
function Harness({account}:{account:string}){const[draft,setDraft]=useState('');draftValue=draft;const editor=useRef<HTMLTextAreaElement|null>(null);current=useArcSkillMentions(account,draft,setDraft,editor,(en)=>en);return <>{current.button}{current.chips}{current.menu}</>;}
let root:any;
try{
 await act(async()=>{root=create(<Harness account="one"/>);});assert.equal(requests,0,'Library is fetched only when needed');
 await act(async()=>current.onChange('Inspect @rev',12));assert.equal(requests,1);
 const options=root.root.findAllByProps({role:'option'});assert.equal(options.length,2);
 await act(async()=>options[1].props.onClick());assert.equal(current.selected[0]?.id,'one-private-review','The chosen ID disambiguates identical names');assert.equal(draftValue,'Inspect ');
 await act(async()=>current.onChange('Inspect @zzz',12));assert.equal(requests,1,'Reuse the account-local loaded library');
 let prevented=false;assert.equal(current.onKeyDown({key:'Enter',nativeEvent:{},preventDefault:()=>{prevented=true;}} as any),true);assert(prevented,'An unmatched mention cannot accidentally submit a chat');
 await act(async()=>current.onKeyDown({key:'Escape',nativeEvent:{},preventDefault(){}} as any));assert.equal(current.inputProps['aria-expanded'],false);
 owner='two';await act(async()=>root.update(<Harness account="two"/>));assert.equal(current.selected.length,0,'Account changes clear selections and cache');
 await act(async()=>current.onChange('Inspect @',9));assert.equal(requests,2);const otherOptions=root.root.findAllByProps({role:'option'});await act(async()=>otherOptions[1].props.onClick());assert.equal(current.selected[0]?.id,'two-private-review');
 console.log('PASS: lazy account-bound @skill discovery, ID selection, duplicate names, keyboard and query insertion');
}finally{if(root)await act(async()=>root.unmount());globalThis.fetch=originalFetch;globalThis.requestAnimationFrame=originalFrame;}
