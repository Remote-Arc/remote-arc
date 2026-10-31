import assert from 'node:assert/strict';
import React,{useRef,useState} from 'react';
// @ts-ignore react-test-renderer has no declarations in this workspace.
import {act,create} from 'react-test-renderer';
import {skillMentionAt,useArcSkillMentions} from '../src/features/arc/composer/arc-skill-mentions.js';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
assert.equal(skillMentionAt('user@example.com',16),null);
assert.deepEqual(skillMentionAt('Use @review please',11),{start:4,end:11,query:'review'});
const originalFetch=globalThis.fetch,originalFrame=globalThis.requestAnimationFrame;let requests=0,owner='one',newPeople=0;
globalThis.requestAnimationFrame=callback=>{callback(0);return 1;};
globalThis.fetch=(async(input)=>{if(input==='/api/arc/employees')return Response.json({employees:[{id:owner+'-designer',name:'Designer',responsibility:'Product design',status:'active',avatar:{kind:'emoji',value:'🎨',color:'#446655'}}]});if(input==='/api/apps')return Response.json({apps:[{provider:'gmail',name:'Gmail'}],connections:[{id:owner+'-mail',provider:'gmail',status:'active',accountLabel:'Inbox'},{id:'revoked-mail',provider:'gmail',status:'revoked'}]});assert.equal(input,'/api/arc/skills');requests++;return Response.json({skills:[{id:'builtin-review',name:'Review',description:'Built-in'},{id:owner+'-private-review',name:'Review',description:'Personal instructions'}]});}) as typeof fetch;
let current!:ReturnType<typeof useArcSkillMentions>,draftValue='';
function Harness({account,revision=''}:{account:string;revision?:string}){const[draft,setDraft]=useState('');draftValue=draft;const editor=useRef<HTMLTextAreaElement|null>(null);current=useArcSkillMentions(account,draft,setDraft,editor,(en)=>en,[],revision);return <>{current.button}{current.chips}{current.menu}</>;}
let root:any;
try{
 await act(async()=>{root=create(<Harness account="one"/>);});assert.equal(requests,0,'Library is fetched only when needed');
 await act(async()=>current.onChange('Inspect @rev',12));assert.equal(requests,1);
 const options=root.root.findAllByProps({role:'option'});assert.equal(options.length,2);
 await act(async()=>options[1].props.onClick());assert.equal(current.selected[0]?.id,'one-private-review','The chosen ID disambiguates identical names');assert.equal(draftValue,'Inspect ');
 await act(async()=>current.onChange('Inspect @zzz',12));assert.equal(requests,2,'Reopening loads current references instead of a permanent stale cache');
 let prevented=false;assert.equal(current.onKeyDown({key:'Enter',nativeEvent:{},preventDefault:()=>{prevented=true;}} as any),true);assert(prevented,'An unmatched mention cannot accidentally submit a chat');
 await act(async()=>current.onKeyDown({key:'Escape',nativeEvent:{},preventDefault(){}} as any));assert.equal(current.inputProps['aria-expanded'],false);
 owner='two';await act(async()=>root.update(<Harness account="two"/>));assert.equal(current.selected.length,0,'Account changes clear selections and cache');
 await act(async()=>current.onChange('Inspect @',9));assert.equal(requests,3);const otherOptions=root.root.findAllByProps({role:'option'});await act(async()=>otherOptions[1].props.onClick());assert.equal(current.selected[0]?.id,'two-private-review');
 await act(async()=>current.onChange('Inspect @Gmail',14));const appOptions=root.root.findAllByProps({role:'option'});assert.equal(appOptions.length,1);await act(async()=>appOptions[0].props.onClick());assert.equal(current.selected.at(-1)?.kind,'app');assert.equal(current.selected.at(-1)?.id,'two-mail');assert.equal(draftValue,'Inspect ');assert(!draftValue.includes('Read skill'));
 await act(async()=>current.openFor('employee'));const people=root.root.findAllByProps({role:'option'});assert.equal(people.length,1);await act(async()=>people[0].props.onClick());assert.equal(current.selected.at(-1)?.kind,'employee');assert.equal(current.selected.at(-1)?.id,'two-designer');
 const baseFetch=globalThis.fetch;globalThis.fetch=(async(input,init)=>input==='/api/arc/employees'?Response.json({employees:Array.from({length:newPeople},(_,index)=>({id:owner+'-new-'+index,name:'New teammate '+index,responsibility:'Research',status:'active',avatar:{kind:'initials',color:'#446655'}}))}):baseFetch(input,init)) as typeof fetch;
 newPeople=2;await act(async()=>current.openFor('employee'));assert.equal(root.root.findAllByProps({role:'option'}).length,2,'Newly created teammates appear on reopen');
 newPeople=3;await act(async()=>root.update(<Harness account="two" revision="created-third-person"/>));const fresh=root.root.findAllByProps({role:'option'});assert.equal(fresh.length,3,'Creation refreshes an already open picker');await act(async()=>fresh[2].props.onClick());assert.equal(current.selected.at(-1)?.id,'two-new-2');
 console.log('PASS: lazy account-bound discovery, fresh created teammates on reopen and while open, ID selection, duplicate names, keyboard and query insertion');
}finally{if(root)await act(async()=>root.unmount());globalThis.fetch=originalFetch;globalThis.requestAnimationFrame=originalFrame;}
