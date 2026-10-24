import assert from 'node:assert/strict';
import {createRemoteLinkMcp} from '../src/mcp.js';
import {markdownToSlack,fitSlackText} from '../src/slack-format.js';
import {findSkills,skillIndex,suggestedSkills} from '../src/skill-index.js';
import {arcDeviceInputError,normalizeArcDeviceArguments} from '../src/arc-device-tools.js';
import {arcDeviceToolGuide,compactArcDevices,ARC_DEVICE_TOOL_GUIDE} from '../src/arc-device-guide.js';
import {withArcDeviceTools,arcToolInputError} from '../src/arc-chat-runtime.js';
import {ARC_DIRECT_SYSTEM} from '../src/arc-direct-instructions.js';
import {ARC_COMPACT_SYSTEM} from '../src/arc-chat-context.js';
import {readArcSkill} from '../src/arc-skills.js';
import {arcDeviceSchemas} from '../src/arc-device-tools.js';

// Slack shows Arc answers as mrkdwn, not raw Markdown syntax.
const slack=markdownToSlack('## Weather\n\nNow **19°C** <hot> & dry. See [Open-Meteo](https://open-meteo.com/).\n\n- **AI**: item\n\n| Device | Status |\n|---|---|\n| SamPC | online |\n\n```\nif (a<b) { x }\n```');
assert.match(slack,/^\*Weather\*/);
assert.match(slack,/Now \*19°C\* &lt;hot&gt; &amp; dry/);
assert.match(slack,/<https:\/\/open-meteo\.com\/\|Open-Meteo>/);
assert.match(slack,/• \*AI\*: item/);
assert.match(slack,/SamPC {2}· {2}online/);
assert.match(slack,/```\nif \(a&lt;b\) \{ x \}\n```/);
assert(!/##|\*\*|\]\(/.test(slack),'no raw Markdown syntax remains');
assert.equal(markdownToSlack('[bad](javascript:alert(1))'),'[bad](javascript:alert(1))','only http(s)/mailto links become Slack links');
const long=fitSlackText(('line\n').repeat(50)+'<https://example.com|link>',60,'MORE');
assert(long.length<80&&long.endsWith('MORE')&&!/<https/.test(long),'long answers are cut at a line, never inside a link');
assert.equal((fitSlackText('```\n'+'x\n'.repeat(40),40,'M').match(/```/g)||[]).length,2,'an open code fence is closed');

// One skill index covers built-in, community, workflow and imported skills,
// and finds them from Chinese or English task wording.
const index=skillIndex([{id:'imported-1',name:'Quarterly board memo',description:'Our board memo format'}]);
for(const id of ['video-creator','transcribe-subtitles','browser-operator','arc-docx','arc-xlsx','arc-pptx','community-matplotlib','scheduled-routines','arc-website','imported-1'])assert(index.some(skill=>skill.id===id),'index has '+id);
const ids=(query:string)=>suggestedSkills(query,index).map(skill=>skill.id);
assert.deepEqual(ids('帮我把这个视频加上中文字幕').sort(),['transcribe-subtitles','video-creator']);
assert(ids('做一个季度销售数据的 Excel 表格').includes('arc-xlsx'));
assert(ids('make slides for the launch').includes('arc-pptx'));
assert(ids('每天早上8点提醒我看天气').includes('scheduled-routines'));
assert(ids('帮我自动填写招聘网站的申请表').includes('browser-operator'));
assert(!ids('帮我自动填写招聘网站的申请表').includes('arc-website'),'filling a form on a site is not building a website');
assert.deepEqual(ids('奥克兰今天天气怎么样'),[],'no skill noise for plain questions');
assert.deepEqual(ids('check which codex tasks are running'),[]);
assert.equal(findSkills('write the quarterly board memo',index,1)[0]!.id,'imported-1','imported skills match by name');

// Arc reads built-in skills directly (no DB access needed for them).
const builtin=await readArcSkill({} as never,'user','video-creator') as {content:string;origin:string};
assert.equal(builtin.origin,'builtin');assert.match(builtin.content,/FFmpeg/i);

// Large read lengths are paged, not rejected; new device tools validate.
assert.equal(arcDeviceInputError({tool:'read_file',arguments:{path:'/a',length:200000}}),null);
assert.equal(normalizeArcDeviceArguments('read_file',{path:'/a',length:200000}).length,1200);
assert.equal(normalizeArcDeviceArguments('read_file',{path:'/a',length:50}).length,50);
assert.equal(normalizeArcDeviceArguments('list_processes',{limit:5000}).limit,300);
assert.equal(arcDeviceInputError({tool:'list_agent_sessions',arguments:{source:'codex',git:true,limit:10}}),null);
assert(arcDeviceInputError({tool:'list_agent_sessions',arguments:{source:'cursor'}}));
assert.equal(arcDeviceInputError({tool:'list_processes',arguments:{filter:'claude',details:true}}),null);
assert.equal(arcToolInputError('list_skills',{query:'视频'}),null);
assert(arcToolInputError('list_skills',{query:'x',extra:true}));
for(const tool of Object.keys(arcDeviceSchemas))if(!['process_status','process_output','stop_process'].includes(tool))assert(tool in ARC_DEVICE_TOOL_GUIDE,'guide documents '+tool);

// The prompt lists exactly the tools the user's computers have.
const devices=compactArcDevices([
 {id:'win',name:'SamPC',platform:'win32',status:'online',tools:['read_file','list_processes','list_agent_sessions','start_process','goal_workspace','browser_runner_start','future_tool'],workspace_roots:['E:\\Coding']},
 {id:'mac',name:'Mac',platform:'darwin',status:'offline',tools:['read_file','list_directory']},
]);
assert.deepEqual(devices[0]!.tools,['read_file','list_processes','list_agent_sessions','start_process','browser_runner_start','future_tool'],'internal tools are hidden');
const guide=arcDeviceToolGuide(devices);
assert.match(guide,/list_agent_sessions \{source/);assert.match(guide,/length\?:1\.\.1200/);assert.match(guide,/cmd\.exe on Windows/);
assert.match(guide,/also available: future_tool/);
assert(!/write_file|edit_block/.test(guide),'absent tools are not advertised');
assert.match(arcDeviceToolGuide([]),/no computer tools/);
const waits=arcDeviceToolGuide(compactArcDevices([{id:'new',name:'New Agent',platform:'win32',tools:['browser_runner_wait','process_status','browser_runner_close']}]));
assert.match(waits,/process_status .*wait_ms/);
assert.match(waits,/browser_runner_wait .*user_done/);
assert.match(waits,/browser_runner_close .*abandonment reason/);
assert(!waits.includes('list_agent_sessions'),'unavailable tools stay absent after wait guidance integration');
const context={objective:'x',messages:[],memory:[],deviceIndex:devices};
for(const system of [ARC_DIRECT_SYSTEM,ARC_COMPACT_SYSTEM]){
 const filled=withArcDeviceTools(system,context);
 assert(!filled.includes('{{ARC_DEVICE_TOOLS'),'placeholder filled');
 assert.match(filled,/list_agent_sessions/);
}
assert.match(ARC_DIRECT_SYSTEM,/report a blocker only when the routes are exhausted/);
assert.match(ARC_DIRECT_SYSTEM,/skillSuggestions/);

console.log('PASS: Slack mrkdwn answers, one bilingual skill index with quiet suggestions, built-in skill reads, paged device reads, agent-session/process arguments and live per-device tool guides in every Arc prompt');

// Tool annotations do not enforce OAuth scopes. App-only grants must not read
// imported Skill metadata/content before the devices:read challenge is returned.
let accountReads = 0;
const deniedEnv = {PUBLIC_ORIGIN:'https://mcp.example.test',DB:{prepare(){accountReads++;throw new Error('unexpected account read');}},REGISTRY:{}};
const appOnly = {userId:'scope-test',clientId:'client',grantId:'grant',scope:'apps:read',resource:'https://mcp.example.test/mcp'};
for (const [name,args] of [['find_skills',{query:'private'}],['read_skill',{id:'private-skill'}]] as const) {
 const response=await createRemoteLinkMcp(deniedEnv as never,appOnly as never).fetch(new Request('https://mcp.example.test/mcp',{
  method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}),
 }));
 const body=await response.text();const packet=JSON.parse(body.trim().startsWith('{')?body:body.split('\n').find(line=>line.startsWith('data: '))!.slice(6));
 assert.equal(packet.result.isError,true,name+' must challenge missing scope');
 assert.match(packet.result._meta['mcp/www_authenticate'][0],/insufficient_scope/);
 assert.match(packet.result._meta['mcp/www_authenticate'][0],/devices:read/);
}
assert.equal(accountReads,0,'missing-scope Skill requests must not reach account data');
console.log('PASS: public Skill tools enforce devices:read before private account access');
