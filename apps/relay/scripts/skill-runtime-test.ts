import assert from 'node:assert/strict';
import { routeSkillIntent,runReadOnlySkill } from '../src/skill-runtime.js';
import { handleCloudSkillAction } from '../src/cloud-skills.js';

const video=routeSkillIntent('帮我做一个带中文字幕的视频');
assert.ok(video.steps.some(s=>s.skill_id==='video-creator'));
assert.ok(video.steps.some(s=>s.skill_id==='transcribe-subtitles'));
assert.equal(video.runnable,false);
assert.equal(routeSkillIntent('帮我生成一张商品海报').steps[0]?.skill_id,'image-studio');
assert.equal(routeSkillIntent('帮我控制鼠标拖动窗口').steps[0]?.skill_id,'desktop-operator');
assert.equal(routeSkillIntent('读取我分享的浏览器页面并汇总内容').runnable,true);
assert.equal(routeSkillIntent('咳').runnable,false);
assert.throws(()=>routeSkillIntent('x'.repeat(2500)));
assert.throws(()=>routeSkillIntent('something','nonexistent'));
const browser=routeSkillIntent('读取网页');
let reads=0;
const observed=await runReadOnlySkill(browser,{device_id:'owned-device',tab_id:2},async(name,args)=>{
  reads++;assert.equal(name,'browser_read_page');assert.equal(args.tab_id,2);
  return {title:'Sample page',url:'https://example.org',text:'This is a genuine browser snapshot returned from a shared tab.'};
});
assert.equal(reads,1);
assert.equal(observed.status,'observed');
assert.equal(observed.verified,true);
assert.equal((await runReadOnlySkill(browser,{device_id:'owned-device'},async()=>({}))).verified,false);
assert.equal((await runReadOnlySkill(browser,{device_id:'owned-device'},async()=>({ok:false,error:'not shared',detail:'no consent'}))).verified,false);
assert.equal((await runReadOnlySkill(video,{device_id:'owned-device'},async()=>{throw Error('never run')})).status,'blocked');
assert.equal((await runReadOnlySkill(browser,{},async()=>{throw Error('never run')})).status,'needs_device');
assert.equal((await runReadOnlySkill(browser,{device_id:'owned-device',tab_id:-1},async()=>{throw Error('never run')})).status,'invalid_input');
assert.equal((await runReadOnlySkill(browser,{device_id:'owned-device'},async()=>{throw Error('device offline')})).status,'failed');

let counts={read:0,consume:0,pause:0};
const deps={
 consume:async()=>{counts.consume++},
 paused:async()=>{counts.pause++;return false},
 selectDevices:async()=>[{id:'owned-device',status:'online',tools:['browser_read_page']}],
 read:async()=>{counts.read++;return {title:'Saved page',text:'An actual observed shared browser page containing meaningful source text.'}},
};
function req(target:string,body:unknown,origin='https://mcp.remotearc.app'){
 return new Request('https://mcp.remotearc.app'+target,{method:'POST',headers:{'content-type':'application/json',...(origin?{'origin':origin}:{})},body:JSON.stringify(body)});
}
const cookie={id:'owner',oauth:false,scopes:''};
const oauth={id:'owner',oauth:true,scopes:'browser:read'};
const generated=await handleCloudSkillAction(req('/api/skills/plan',{objective:'生成图片'}),cookie,deps);
assert.equal(generated.status,200);
const loaded=await generated.json() as {instructions:Array<{skill_id:string;markdown:string}>};
assert.equal(loaded.instructions[0]?.skill_id,'image-studio');
assert.match(loaded.instructions[0]!.markdown,/Device and permission gates/);

assert.equal(counts.read,0,'planning cannot run tools');
assert.equal((await handleCloudSkillAction(req('/api/skills/run',{objective:'生成视频',device_id:'owned-device'}),cookie,deps)).status,409);
assert.equal(counts.read,0);
assert.equal((await handleCloudSkillAction(req('/api/skills/run',{objective:'读取网页',device_id:'owned-device'},''),cookie,deps)).status,403);
assert.equal((await handleCloudSkillAction(req('/api/skills/run',{objective:'读取网页',device_id:'owned-device'}),null,deps)).status,401);
assert.equal((await handleCloudSkillAction(req('/api/skills/run',{objective:'读取网页',device_id:'owned-device'}),{...oauth,scopes:'computer:read'},deps)).status,403);
const successful=await handleCloudSkillAction(req('/api/skills/run',{objective:'读取网页',device_id:'owned-device',tab_id:3},''),oauth,deps);
assert.equal(successful.status,200);
const data=await successful.json() as {verified:boolean;status:string};
assert.equal(data.status,'observed');assert.equal(data.verified,true);
assert.equal(counts.read,1);assert.equal(counts.consume,1);
const auto=await handleCloudSkillAction(req('/api/skills/run',{objective:'读取网页'},''),oauth,deps);
assert.equal(auto.status,200,'unique eligible device can be selected automatically');
assert.equal((await handleCloudSkillAction(req('/api/skills/run',{objective:'读取网页'},''),oauth,{...deps,
  selectDevices:async()=>[{id:'one',status:'online',tools:['browser_read_page']},{id:'two',status:'online',tools:['browser_read_page']}],
})).status,422,'multiple devices require an explicit choice');
assert.equal((await handleCloudSkillAction(req('/api/skills/run',{objective:'读取网页',device_id:'owned-device'}),cookie,{...deps,paused:async()=>true})).status,423);
console.log('Skill router/adapter/verification tests passed: matching, browser evidence, auth, origin, scopes, quota hooks and fallback');
