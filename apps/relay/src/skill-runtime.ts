import { BUILTIN_SKILLS, BUILTIN_SKILLS_REVISION } from '../../../packages/skills/src/catalog.generated.js';

type Skill=typeof BUILTIN_SKILLS[number];
type ExecutionState='ready_readonly'|'needs_approval_or_engine'|'guidance_only';

const keywords:Record<string,Array<[RegExp,number]>>={
  'browser-operator': [[/browser|website|webpage|网页|浏览器|网站|页面|tab|网页操作/i,4],[/click|fill|navigate|form|点击|填写|搜索页面/i,2]],
  'autonomous-browser': [[/multi.step browse|autonomous brows|自动浏览|网页自动化|自动操作网页/i,4]],
  'desktop-operator': [[/mouse|pointer|desktop|screen control|鼠标|桌面操作|拖拽|键盘操作/i,5]],
  'image-studio': [[/image|picture|photo|illustrat|poster|图片|照片|修图|海报|生图/i,5]],
  'video-creator': [[/video|clip|render|mp4|movie|视频|剪辑|短片|渲染/i,5]],
  'ui-inspector': [[/screenshot|ui inspect|element detection|截图识别|控件识别|定位按钮/i,5]],
  'transcribe-subtitles': [[/subtitle|transcrib|caption|speech.to.text|字幕|转录|语音识别/i,5]],
  'research-reports': [[/research|report|summari[sz]e|summary|analy[sz]e|调查|研究|报告|总结|汇总|分析/i,5],[/issue|pull request|github|资料|来源|引用/i,1]],
  'scheduled-routines': [[/schedul|routine|recurring|daily|weekly|monitor|定时|每日|每周|周期|例行|监控/i,5]],
};
const execution:Readonly<Record<string,ExecutionState>>={
  'browser-operator':'ready_readonly','research-reports':'ready_readonly',
  'autonomous-browser':'needs_approval_or_engine',
  'desktop-operator':'needs_approval_or_engine',
  'image-studio':'needs_approval_or_engine','video-creator':'needs_approval_or_engine',
  'ui-inspector':'needs_approval_or_engine','transcribe-subtitles':'needs_approval_or_engine',
  'scheduled-routines':'guidance_only',
};
export type SkillPlan={
  revision:string; objective:string; steps:Array<{skill_id:string; name:string; state:ExecutionState; reason:string}>;
  runnable:boolean; reason:string;
};

export function routeSkillIntent(objective:string,requestedId?:string):SkillPlan{
  const intent=objective.trim();
  if(!intent||intent.length>2000)throw Error('Objective must be 1–2000 characters');
  let matched:Skill[];
  if(requestedId){
    const explicit=BUILTIN_SKILLS.find(x=>x.id===requestedId);
    if(!explicit)throw Error('Unknown cloud Skill');
    matched=[explicit];
  }else{
    matched=BUILTIN_SKILLS.map(skill=>({
      skill,score:(keywords[skill.id]||[]).reduce((score,[pattern,n])=>score+(pattern.test(intent)?n:0),0),
    })).filter(x=>x.score>=3).sort((a,b)=>b.score-a.score).slice(0,3).map(x=>x.skill);
  }
  const steps=matched.map(skill=>({
    skill_id:skill.id,name:skill.name,state:execution[skill.id]||'guidance_only',
    reason:execution[skill.id]==='ready_readonly'
      ?'Existing approved browser snapshot tool; read-only execution only'
      :execution[skill.id]==='guidance_only'
        ?'This workflow is configured through existing approved automation tools'
        :'Requires separately approved execution engine, permissions and budget; not installed by Cloud Skills',
  }));
  const runnable=steps.length>0&&steps.every(x=>x.state==='ready_readonly');
  return {
    revision:BUILTIN_SKILLS_REVISION,objective:intent,steps,runnable,
    reason:!steps.length?'No safe skill match; clarify task before execution':
      runnable?'A read-only browser snapshot can be executed using existing Remote Arc tools':
      'At least one required execution engine or approval is unavailable; execution is not started',
  };
}

/** One bounded read-only adapter. No scripts, hidden clicks, OS privileges or paid APIs. */
export async function runReadOnlySkill(
  plan:SkillPlan,
  input:{device_id?:string;tab_id?:number},
  invoke:(tool:'browser_read_page'|'browser_extract_links',args:Record<string,unknown>)=>Promise<unknown>,
){
  if(!plan.runnable)return {status:'blocked' as const,verified:false,reason:plan.reason};
  if(typeof input.device_id!=='string'||!input.device_id.trim())
    return {status:'needs_device' as const,verified:false,reason:'Select an authorized, online Remote Arc device'};
  if(input.tab_id!==undefined&&(!Number.isSafeInteger(input.tab_id)||input.tab_id<0))
    return {status:'invalid_input' as const,verified:false,reason:'Invalid tab ID'};
  try{
    const args=input.tab_id===undefined?{}:{tab_id:input.tab_id};
    const snapshot=await invoke('browser_read_page',args);
    if(snapshot&&typeof snapshot==='object'){
      const item=snapshot as Record<string,unknown>;
      if(item.ok===false||item.success===false||typeof item.error==='string')
        return {status:'unverified' as const,verified:false,reason:'Browser returned an explicit failure instead of page evidence'};
    }
    const json=typeof snapshot==='string'?snapshot:JSON.stringify(snapshot??null);
    if(!json||json==='null'||json==='{}'||json==='[]'||json.length<30)
      return {status:'unverified' as const,verified:false,reason:'Browser returned no meaningful page evidence'};
    const source=snapshot&&typeof snapshot==='object'&&typeof (snapshot as Record<string,unknown>).url==='string'
      ?(snapshot as Record<string,string>).url:undefined;
    // A read-only browser observation is evidence of retrieval, not of
    // having completed arbitrary research, made edits or generated media.
    return {
      status:'observed' as const,verified:true,verification:'device_tool_response',
      completed:'browser_read_page' as const,skill_ids:plan.steps.map(s=>s.skill_id),
      observation:json.slice(0,20000),
      evidence:{bytes:json.length,device_id:input.device_id,tab_id:input.tab_id??null,source_url:source??null},
      limitations:'Observed the shared page only; no autonomous research, posting or media generation has occurred',
    };
  }catch(error){
    return {status:'failed' as const,verified:false,
      reason:error instanceof Error?error.message:'Device execution failed; do not retry blindly'};
  }
}
