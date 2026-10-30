import assert from 'node:assert/strict';
import {SKILL_LIBRARY,skillLibrarySummaries} from '../../../packages/skills/src/library.js';
import {listArcSkills,readArcSkill} from '../src/arc-skills.js';
import {findSkills,skillIndex,suggestedSkills} from '../src/skill-index.js';
import type {ArcEnv} from '../src/arc-chat.js';

const env={DB:{prepare(){return{bind(){return{all:async()=>({results:[]})}}}}}} as unknown as ArcEnv;
const {skills}=await listArcSkills(env,'owner');
assert.equal(skills.length,54);assert.equal(new Set(skills.map(s=>s.id)).size,54);
assert.equal(skills[0]!.id,'remotion-video');assert.equal(SKILL_LIBRARY[0]!.core,true);
for(const id of ['safe-cleanup','media-intelligence','manim-video','blender-mcp','remotion-video','hyperframes-video','openfilm-video','map-creator','transcribe-subtitles','community-vibe-knowledge-film','community-a-stock-data','community-nuwa']){
 assert(skills.some(skill=>skill.id===id),id+' is discoverable from the dashboard');
 const detail=await readArcSkill(env,'owner',id);assert(detail.content.length>50);assert('resources' in detail&&detail.resources.length>0);
}
const authentic=await readArcSkill(env,'owner','authentic-thinking-expression');
assert.match(authentic.content,/Do not deliberately introduce typos/i,'Authenticity is not detector evasion');
assert.match(authentic.content,/A request to \*\*draft\*\* does not authorize \*\*sending\*\*/,'Drafting does not grant sending permissions');
assert.equal(skills.filter(s=>s.id.startsWith('community-nuwa-')).length,15);
assert(skillLibrarySummaries().every(s=>!('content' in s)&&!('resources' in s)),'Discovery only returns bounded summaries');
const index=skillIndex();
for(const query of ['帮我写一封博士套磁邮件','帮我写求职信','Polish this cover letter to sound like me','Draft an email to a professor'])assert.equal(findSkills(query,index,1)[0]?.id,'authentic-thinking-expression',query);
for(const [query,id] of [['清理 D 盘缓存腾出空间','safe-cleanup'],['permanently delete temporary build cache','safe-cleanup'],['分析这个 AI 发布会视频','media-intelligence'],['Compare YouTube videos','media-intelligence'],['yt-dlp','media-intelligence'],['用 Manim 做几何动画','manim-video'],['用 Blender 做三维建模','blender-mcp'],['使用 Remotion 做三维视频','remotion-video'],['用 HyperFrames 做视频','hyperframes-video'],['使用 OpenFilm 剪辑视频','openfilm-video'],['制作知识大赏短片','community-vibe-knowledge-film'],['获取 A股 行情','community-a-stock-data'],['女娲创建一个思维技能','community-nuwa'],['费曼','community-nuwa-feynman'],['MrBeast','community-nuwa-mrbeast']])assert.equal(findSkills(query,index,1)[0]?.id,id,query);
assert(!findSkills('股票涨停是什么意思',index).some(s=>s.id==='community-a-stock-data'),'Conceptual stock explanations do not request market data');
assert.deepEqual(suggestedSkills('Run node verify.js on compact-device once, inspect the output and wait for its actual completion.',index),[],'Ordinary process checks do not suggest a Nuwa persona from stop words or the AI substring in wait');
console.log('PASS: unified 54-skill library, authentic writing guidance, readable resources, 15 Nuwa perspectives, core Remotion ordering and bilingual routing');
