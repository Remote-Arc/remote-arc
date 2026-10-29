import { BUILTIN_SKILLS, BUILTIN_SKILLS_REVISION } from '../../../packages/skills/src/catalog.generated.js';

type Skill=typeof BUILTIN_SKILLS[number];
type ExecutionState='ready_readonly'|'needs_local_device'|'needs_approval_or_engine'|'guidance_only';

const keywords:Record<string,Array<[RegExp,number]>>={
  'media-intelligence': [[/yt-dlp|media intelligence|视频分析|分析.{0,12}(视频|发布会)|视频.{0,8}(总结|技术差异)|原视频时间点|字幕优先|(?:analy[sz]e|summari[sz]e|compare).{0,24}(?:videos?|youtube|bilibili)|(?:youtube|bilibili).{0,24}(?:analy[sz]|summar|compare)/i,16]],
  'manim-video': [[/\bmanim\b|数学动画|几何动画|公式推导动画|算法动画/i,12]],
  'blender-mcp': [[/\bblender\b|三维建模|3d model|三维产品|材质灯光/i,12]],
  'remotion-video': [[/remotion|three\.?js|3d camera|三维运镜|粒子光影|音乐卡点/i,8]],
  'hyperframes-video': [[/hyperframes|gsap|动态排版|界面演示视频/i,8]],
  'openfilm-video': [[/openfilm/i,8]],
  'map-creator': [[/\bmap\b|地图|geojson|choropleth/i,8]],
  'browser-operator': [[/browser|website|webpage|网页|浏览器|网站|页面|tab|网页操作/i,4],[/click|fill|navigate|form|点击|填写|搜索页面/i,2]],
  'autonomous-browser': [[/multi.step browse|autonomous brows|自动浏览|网页自动化|自动操作网页/i,4]],
  'desktop-operator': [[/mouse|pointer|desktop|screen control|鼠标|桌面操作|拖拽|键盘操作/i,5]],
  'image-studio': [[/image|picture|photo|illustrat|poster|canvas|p5\.js|generative art|图片|照片|修图|海报|生图|代码绘图|生成艺术/i,5]],
  'video-creator': [[/video|clip|render|mp4|movie|openfilm|hyperframes|gsap|\bmap\b|地图|geojson|choropleth|voice.?over|narrat|配音|旁白|tts|music|配乐|视频|剪辑|短片|渲染/i,5]],
  'ui-inspector': [[/screenshot|ui inspect|element detection|截图识别|控件识别|定位按钮/i,5]],
  'transcribe-subtitles': [[/subtitle|transcrib|caption|speech.to.text|whisper|字幕|转录|语音识别/i,5]],
  'research-reports': [[/research|report|summari[sz]e|summary|analy[sz]e|调查|研究|报告|总结|汇总|分析/i,5],[/issue|pull request|github|资料|来源|引用/i,1]],
  'scheduled-routines': [[/schedul|routine|recurring|daily|weekly|monitor|定时|每日|每周|周期|例行|监控/i,5]],
};
const execution:Readonly<Record<string,ExecutionState>>={
  'browser-operator':'ready_readonly','research-reports':'ready_readonly',
  'autonomous-browser':'needs_approval_or_engine',
  'desktop-operator':'needs_approval_or_engine',
  'image-studio':'needs_local_device','video-creator':'needs_local_device',
  'remotion-video':'needs_local_device','hyperframes-video':'needs_local_device','openfilm-video':'needs_local_device','map-creator':'needs_local_device',
  'media-intelligence':'needs_local_device','manim-video':'needs_local_device','blender-mcp':'needs_local_device',
  'ui-inspector':'needs_approval_or_engine','transcribe-subtitles':'needs_local_device',
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
      :execution[skill.id]==='needs_local_device'
        ?skill.id==='media-intelligence'?'Use the packaged yt-dlp helper on an authorized device: retrieve captions first, download bounded media or sample frames only when evidence requires it, then verify citations at original timestamps. Retrieval does not imply semantic understanding.':skill.id==='image-studio'?'Use Canvas Design or Algorithmic Art on an authorized local device for code graphics; no image model is required. Inspect the exported image and retain source/seed. Photographic synthesis needs a configured local ComfyUI backend; ask before weight downloads.':'Use the packaged helper on an authorized user device: prepare ordinary media dependencies automatically, execute and verify the deliverable. Ask before Qwen TTS or ACE-Step installation.'
      :execution[skill.id]==='guidance_only'
        ?'This workflow is configured through existing approved automation tools'
        :'Requires separately approved execution engine, permissions and budget; not installed by Cloud Skills',
  }));
  const runnable=steps.length>0&&steps.every(x=>x.state==='ready_readonly');
  return {
    revision:BUILTIN_SKILLS_REVISION,objective:intent,steps,runnable,
    reason:!steps.length?'No safe skill match; clarify task before execution':
      runnable?'A read-only browser snapshot can be executed using existing Remote Arc tools':
      'Continue local media workflows with the packaged helper and authorized device tools; this read-only HTTP adapter does not execute them',
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
