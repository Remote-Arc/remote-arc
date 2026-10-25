import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {builtinResourceSummary} from '../src/arc-builtin-resources.js';
import {prepareCommunitySkill,readCommunityResource} from '../src/arc-community-skills.js';
import {readArcSkill} from '../src/arc-skills.js';
import {routeSkillIntent} from '../src/skill-runtime.js';
import type {ArcEnv,ArcRun} from '../src/arc-chat.js';

let active=true;
const env={DB:{prepare(){return {bind(){return {first:async()=>active?{id:'active-run'}:null};}};}}} as unknown as ArcEnv;
const run={id:'active-run',user_id:'owner',step:1} as ArcRun;
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-media-resource-'));
try{
 for(const id of ['video-creator','transcribe-subtitles']){
  const summary=builtinResourceSummary(id),manifest=summary.resources!.find(file=>file.path==='scripts/local-media.mjs')!;
  assert(manifest.bytes>12000,'Real helper must exercise chunked reads/writes');
  let content='',offset:number|null=0,reads=0;
  while(offset!==null){const chunk=readCommunityResource(id,manifest.path,offset);content+=chunk.content;offset=chunk.nextOffset;reads++;}
  assert(reads>1);assert.equal(Buffer.byteLength(content),manifest.bytes);assert.equal(createHash('sha256').update(content).digest('hex'),manifest.sha256);
  const instructions=await readArcSkill(env,'owner',id);assert.equal(instructions.origin,'builtin');assert('resources' in instructions);
  let writes=0;
  const prepared=await prepareCommunitySkill(env,run,{id,deviceId:'owned-local-device',workspace:root},async(_device,target,chunk,mode)=>{
   assert(path.resolve(target).startsWith(root+path.sep));await fs.mkdir(path.dirname(target),{recursive:true});
   if(mode==='append')await fs.appendFile(target,chunk);else await fs.writeFile(target,chunk);writes++;
   return {path:target,mode,bytes:Buffer.byteLength(chunk)};
  });
  assert(prepared.prepared);assert(writes>=3);
  assert.equal(await fs.readFile(path.join(prepared.directory,manifest.path),'utf8'),content);
 }
 assert.throws(()=>readCommunityResource('video-creator','../private'),/ARC_SKILL_RESOURCE_NOT_FOUND/);
 assert.throws(()=>readCommunityResource('video-creator','scripts/local-media.mjs',-1),/ARC_SKILL_RESOURCE_NOT_FOUND/);
 let calls=0;active=true;
 await assert.rejects(prepareCommunitySkill(env,run,{id:'video-creator',deviceId:'owned-local-device',workspace:root},async(_device,target,content,mode)=>{calls++;active=false;return{path:target,mode,bytes:Buffer.byteLength(content)};}),/ARC_SKILL_SOURCE_ENDED/);
 assert.equal(calls,1,'Revoked run must stop between resource writes');
 for(const query of ['HyperFrames GSAP animation','OpenFilm','制作地图','Whisper 转录']){
  const plan=routeSkillIntent(query);assert.equal(plan.steps[0]!.state,'needs_local_device');assert.equal(plan.runnable,false,'Read-only HTTP adapter cannot claim to render locally');
 }
 console.log('PASS: Arc/Connect use identical hashed media helper bytes, chunked local preparation, cancellation and local workflow routing');
}finally{assert(path.basename(root).startsWith('ra-media-resource-'));await fs.rm(root,{recursive:true,force:true});}
