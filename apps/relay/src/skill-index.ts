import {BUILTIN_SKILLS} from '../../../packages/skills/src/catalog.generated.js';
import {COMMUNITY_SKILLS} from '../../../packages/skills/src/community.generated.js';
import {ARC_OUTCOME_SKILLS} from './arc-outcome-skills.js';
import {ARC_VERIFICATION_SKILLS} from './arc-verification-skills.js';

/** One searchable index over every skill source, so Arc (Slack and Workspace)
 * and external MCP clients find the same methods for a task. A skill is an
 * instruction set: finding one grants no new permission and installs nothing. */
export type SkillOrigin='builtin'|'community'|'workflow'|'imported';
export type SkillIndexEntry={id:string;name:string;description:string;origin:SkillOrigin;category?:string;requires?:readonly string[]};
export type ImportedSkillSummary={id:string;name:string;description:string};

// English and Chinese task words mapped to the skills that do that work.
// Chinese requests rarely share tokens with English descriptions, so these
// cues are what make "帮我剪个视频" find the video skill.
const CUES:Array<[RegExp,string[]]>=[
 [/video|clip|mp4|movie|render|视频|剪辑|短片|渲染|录屏/i,['video-creator']],
 [/subtitle|caption|transcri|speech.to.text|whisper|字幕|转录|语音识别|听写/i,['transcribe-subtitles']],
 [/image|picture|photo|poster|illustrat|图片|照片|图像|修图|海报|生图|画/i,['image-studio']],
 [/browser|website|webpage|web page|tab|scrape|crawl|网页|浏览器|网站|页面|抓取|爬/i,['browser-operator','community-playwright']],
 [/fill|form|click|navigate|apply|book|填写|表单|点击|申请|预订|报名/i,['browser-operator','autonomous-browser']],
 [/autonomous|multi.step brows|自动浏览|网页自动化/i,['autonomous-browser']],
 [/mouse|pointer|desktop|screen|keyboard|鼠标|桌面|屏幕|键盘/i,['desktop-operator','ui-inspector']],
 [/screenshot|ui element|截图|控件|按钮位置/i,['ui-inspector']],
 [/research|investigat|summari[sz]|report|compare|调研|研究|调查|总结|汇总|报告|对比/i,['research-reports','arc-report']],
 [/schedul|routine|recurring|every (day|week|hour|morning|monday|month)|each (day|week)|remind me|monitor|定时|每天|每周|每小时|每月|提醒我|例行|监控/i,['scheduled-routines']],
 [/word|docx|document|letter|resume|cv|文档|文件|简历|信函/i,['arc-docx']],
 [/excel|xlsx|spreadsheet|workbook|sheet|表格|电子表格|工作簿/i,['arc-xlsx']],
 [/powerpoint|pptx|slides?|deck|presentation|幻灯片|演示|ppt/i,['arc-pptx']],
 [/pdf/i,['arc-pdf']],
 [/(build|create|make|design|launch)\b.{0,24}\b(website|site|landing page|web ?app|homepage)|landing page|建站|做(个|一个)?(网站|网页|主页)|搭建网站|网站开发|落地页/i,['arc-website','community-frontend-design']],
 [/design|ui|ux|typograph|layout|设计|界面|排版|样式/i,['community-frontend-design','community-web-design-guidelines']],
 [/react|next\.?js|frontend|前端/i,['community-react-best-practices']],
 [/test|playwright|e2e|qa|测试|自动化测试/i,['community-webapp-testing','community-playwright']],
 [/accessib|a11y|audit|review|无障碍|审查|检查/i,['community-web-design-guidelines']],
 [/mcp|connector|integration|tool server|集成|连接器/i,['community-mcp-builder']],
 [/data|csv|parquet|dataframe|analy[sz]|数据|分析|清洗/i,['community-polars','community-statistical-analysis']],
 [/chart|plot|graph|visuali[sz]|dashboard|图表|可视化|绘图|折线|柱状/i,['community-matplotlib','community-seaborn']],
 [/statistic|regression|significan|hypothesis|统计|回归|显著|假设检验/i,['community-statistical-analysis']],
 [/machine learning|\bml\b|model|classif|predict|scikit|机器学习|模型|预测|分类/i,['community-scikit-learn']],
 [/network|graph theory|shortest path|关系图|网络分析|最短路径/i,['community-networkx']],
 [/email|inbox|mail|邮件|收件箱/i,['arc-verified-inbox']],
 [/github issue|issue|工单/i,['arc-verified-issue']],
 [/deploy|vercel|上线|部署/i,['arc-verified-deployment']],
];

const words=(text:string)=>text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word=>word.length>2);

export function skillIndex(imported:readonly ImportedSkillSummary[]=[]):SkillIndexEntry[]{
 return [
  ...BUILTIN_SKILLS.map(skill=>({id:skill.id,name:skill.name,description:skill.description,origin:'builtin' as const,category:skill.category,requires:skill.requires})),
  ...COMMUNITY_SKILLS.map(skill=>({id:skill.id,name:skill.name,description:skill.description,origin:'community' as const,...('category' in skill&&typeof skill.category==='string'?{category:skill.category}:{})})),
  ...[...ARC_OUTCOME_SKILLS,...ARC_VERIFICATION_SKILLS].map(skill=>({id:skill.id,name:skill.name,description:skill.description,origin:'workflow' as const})),
  ...imported.map(skill=>({id:skill.id,name:skill.name,description:skill.description,origin:'imported' as const})),
 ];
}

/** Rank skills for a task in any language. An empty query returns everything
 * in catalog order; otherwise only skills with a positive score are returned. */
export function findSkills(query:string,entries:readonly SkillIndexEntry[],limit=8,minScore=1):Array<SkillIndexEntry&{score:number}>{
 const text=query.trim();
 if(!text)return entries.slice(0,limit).map(entry=>({...entry,score:0}));
 const cued=new Map<string,number>();
 for(const [pattern,ids] of CUES)if(pattern.test(text))ids.forEach((id,index)=>cued.set(id,(cued.get(id)||0)+(index===0?6:4)));
 const terms=new Set(words(text));
 return entries.map(entry=>{
  const name=new Set(words(entry.name+' '+entry.id)),body=new Set(words(entry.description+' '+(entry.category||'')));
  let score=cued.get(entry.id)||0;
  for(const term of terms){if(name.has(term))score+=3;else if(body.has(term))score+=1;}
  // Imported skills carry the user's own names; let a literal name mention win.
  if(entry.origin==='imported'&&text.toLowerCase().includes(entry.name.toLowerCase()))score+=8;
  return{...entry,score};
 }).filter(entry=>entry.score>=minScore).sort((left,right)=>right.score-left.score||left.id.localeCompare(right.id)).slice(0,limit);
}

/** Skills worth showing the model unprompted for this objective: only clear
 * matches (a task cue or a name hit), never generic word overlap. */
export const suggestedSkills=(objective:string,entries:readonly SkillIndexEntry[])=>
 findSkills(objective,entries,3,4).map(({id,name,description,origin})=>({id,name,description,origin}));
