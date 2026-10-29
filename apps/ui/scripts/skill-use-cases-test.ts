import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {useCaseSlugs,ARC_USE_CASES,arcUseCasePrompt} from '../../../packages/docs/src/arc-use-cases.js';
import {SKILL_USE_CASES,useCaseSkillIds} from '../../../packages/docs/src/skill-use-cases.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const skills=[...JSON.parse(fs.readFileSync(path.join(root,'skills/registry.json'),'utf8')).skills,...JSON.parse(fs.readFileSync(path.join(root,'packages/skills/community-packages.json'),'utf8'))].map((item:{id:string})=>item.id);
const covered=new Set(useCaseSlugs.flatMap(slug=>[...useCaseSkillIds(slug)]));
assert.deepEqual(skills.filter((id:string)=>!covered.has(id)),[],'Every current packaged skill has a task-oriented use case');
assert.equal(new Set(useCaseSlugs).size,useCaseSlugs.length);
const art=JSON.parse(fs.readFileSync(path.join(root,'packages/docs/src/use-case-artwork.json'),'utf8'));
assert.deepEqual(Object.keys(art).sort(),[...useCaseSlugs].sort(),'Every card has an original hint image');
for(const slug of useCaseSlugs){
 const svg=fs.readFileSync(path.join(root,'apps/ui/public/use-case-art',slug+'.svg'),'utf8');
 assert(svg.startsWith('<svg'));assert(svg.includes('viewBox="0 0 640 360"'));assert(!/<script|<foreignObject|\bhref\s*=/i.test(svg),'Hint images stay self-contained');
 for(const locale of ['en','zh'] as const)assert(arcUseCasePrompt(slug,locale).length<=6000);
}
for(const entry of SKILL_USE_CASES){
 for(const locale of ['en','zh'] as const)for(const field of ['title','intro','prompt','requires','boundary','proof'] as const)assert(entry[field][locale].trim().length>0,entry.slug+' '+field);
 for(const skill of entry.skillIds)assert(skills.includes(skill),entry.slug+' references a current skill');
 assert(ARC_USE_CASES[entry.slug]);
}
assert(useCaseSkillIds('audio-transcription').includes('transcribe-subtitles'));
assert(useCaseSkillIds('video-creation').includes('video-creator'));
assert(useCaseSkillIds('job-applications').includes('authentic-thinking-expression'));
console.log('PASS: '+useCaseSlugs.length+' illustrated use cases cover all '+skills.length+' packaged skills, with bounded bilingual drafts');
