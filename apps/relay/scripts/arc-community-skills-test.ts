import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {COMMUNITY_SKILLS} from '../../../packages/skills/src/community.generated.js';
import {prepareCommunitySkill,readCommunityResource,communitySkillSummaries} from '../src/arc/arc-community-skills.js';
import type {ArcEnv,ArcRun} from '../src/arc/arc-chat.js';
export async function testCommunitySkills(env:ArcEnv,run:ArcRun){
 assert.equal(COMMUNITY_SKILLS.length,36);for(const skill of COMMUNITY_SKILLS){
  const builtin=skill.origin==='builtin';
  if(builtin){assert(/^[a-f0-9]{64}$/.test(skill.revision));assert.equal(skill.version,'1.0.0');assert.equal(skill.sourceUrl,null);assert.equal(skill.license,'Remote Arc Source License');}
  else{assert(/^[a-f0-9]{40}$/.test(skill.revision));assert(skill.sourceUrl?.includes(skill.revision));assert(['Apache-2.0','MIT'].includes(skill.license));}
  for(const file of skill.resources){assert.equal(createHash('sha256').update(file.content).digest('hex'),file.sha256);assert.equal(fs.readFileSync(new URL('../../../packages/skills/'+(builtin?'builtin':'vendor')+'/'+skill.id+'/'+file.path,import.meta.url),'utf8'),file.content);}
 }
 assert(communitySkillSummaries().every(skill=>!('content' in skill)&&!('resources' in skill)),'Discovery does not dump all source into the model context');
 const resource=readCommunityResource('community-webapp-testing','scripts/with_server.py');assert(resource.content.includes('argparse'));assert.throws(()=>readCommunityResource('community-webapp-testing','../LICENSE'),/ARC_SKILL_RESOURCE_NOT_FOUND/);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'arc-skill-resources-')),written:string[]=[];let calls=0;
 const write=async(_device:string,target:string,content:string,mode:string)=>{const resolved=path.resolve(target);assert(resolved.startsWith(path.resolve(directory)+path.sep));fs.mkdirSync(path.dirname(resolved),{recursive:true});if(mode==='append')fs.appendFileSync(resolved,content);else fs.writeFileSync(resolved,content);written.push(resolved);calls++;return{content:[{type:'text',text:JSON.stringify({path:target,mode,bytes:Buffer.byteLength(content),file_size:fs.statSync(resolved).size,atomic:mode==='rewrite'})}]};};
 try{
  const result=await prepareCommunitySkill(env,run,{id:'community-webapp-testing',deviceId:'fixture-owned-device',workspace:directory,paths:['scripts/with_server.py']},write);assert.equal(result.prepared,true);assert.equal(fs.readFileSync(path.join(result.directory,'scripts/with_server.py'),'utf8'),resource.content);assert(result.guidance?.includes('not been claimed as installed'));
  const count=calls;await assert.rejects(()=>prepareCommunitySkill(env,run,{id:'community-webapp-testing',deviceId:'fixture',workspace:directory+'/../outside'},write),/ARC_SKILL_WORKSPACE_REQUIRED/);assert.equal(calls,count);
  for(const id of ['arc-docx','arc-xlsx','arc-pptx','arc-pdf']){const prepared=await prepareCommunitySkill(env,run,{id,deviceId:'fixture-owned-device',workspace:directory},write);assert.equal(prepared.prepared,true);const helper=COMMUNITY_SKILLS.find(skill=>skill.id===id)!.resources.find(file=>file.path.startsWith('scripts/'))!;assert.equal(fs.readFileSync(path.join(prepared.directory,helper.path),'utf8'),helper.content);}
  for(const id of ['community-vibe-knowledge-film','community-nuwa','community-nuwa-feynman','community-nuwa-mrbeast']){const staged=await prepareCommunitySkill(env,run,{id,deviceId:'fixture-owned-device',workspace:directory,paths:['references/upstream-skill.md']},write);assert.equal(staged.prepared,true);const expected=COMMUNITY_SKILLS.find(skill=>skill.id===id)!.resources.find(file=>file.path==='references/upstream-skill.md')!;assert.equal(fs.readFileSync(path.join(staged.directory,expected.path),'utf8'),expected.content);}
  const marketGuide=COMMUNITY_SKILLS.find(skill=>skill.id==='community-a-stock-data')!.resources.find(file=>file.path==='references/upstream-skill.md')!;let marketText='';for(let offset=0;;){const chunk=readCommunityResource('community-a-stock-data',marketGuide.path,offset);marketText+=chunk.content;if(chunk.nextOffset===null)break;offset=chunk.nextOffset;}assert.equal(marketText,marketGuide.content,'The full market-data guide remains available through bounded resource reads');
  const declined=await prepareCommunitySkill(env,run,{id:'community-webapp-testing',deviceId:'fixture',workspace:directory},async()=>({status:'forbidden'}));assert.equal(declined.prepared,false,'A denied write cannot manufacture preparation success');
  const unconfirmed=await prepareCommunitySkill(env,run,{id:'community-webapp-testing',deviceId:'fixture',workspace:directory},async()=>({}));assert.equal(unconfirmed.prepared,false,'Missing write acknowledgement cannot manufacture preparation success');
  const wrongTarget=await prepareCommunitySkill(env,run,{id:'community-webapp-testing',deviceId:'fixture',workspace:directory},async()=>({content:[{type:'text',text:JSON.stringify({path:'/another/file',mode:'rewrite',bytes:1})}]}));assert.equal(wrongTarget.prepared,false,'A different file acknowledgement is not preparation');
  const reference=COMMUNITY_SKILLS.find(skill=>skill.id==='community-polars')!.resources.find(file=>file.path.startsWith('references/')&&file.content.length>12000)!;assert(reference);
  const large=await prepareCommunitySkill(env,run,{id:'community-polars',deviceId:'fixture',workspace:directory,paths:[reference.path]},write);assert.equal(large.prepared,true);assert.equal(fs.readFileSync(path.join(large.directory,reference.path),'utf8'),reference.content,'Chunked writes preserve the entire real upstream reference');
 }finally{const target=path.resolve(directory),root=path.resolve(os.tmpdir());assert(target.startsWith(root+path.sep)&&path.basename(target).startsWith('arc-skill-resources-'));fs.rmSync(target,{recursive:true,force:true});}
 console.log('PASS: 32 pinned licensed upstream packages and 4 versioned office skills, resource hashes, actual staged helpers, bounded reads and truthful preparation');
}
