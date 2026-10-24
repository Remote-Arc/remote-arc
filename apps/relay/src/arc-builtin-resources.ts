import {BUILTIN_SKILLS,BUILTIN_SKILLS_REVISION} from '../../../packages/skills/src/catalog.generated.js';
import {BUILTIN_SKILL_RESOURCES} from '../../../packages/skills/src/media-resources.generated.js';

/** The same pinned helper bytes reach Arc preparation and Connect read_skill. */
export function builtinSkillPackage(id:string){
 const skill=BUILTIN_SKILLS.find(item=>item.id===id),files=BUILTIN_SKILL_RESOURCES[id];
 if(!skill||!files)return null;
 return {...skill,revision:BUILTIN_SKILLS_REVISION,sourceUrl:skill.upstream,resources:files};
}
export function builtinResourceSummary(id:string){
 const files=BUILTIN_SKILL_RESOURCES[id];
 if(!files)return {};
 return {resources:files.map(({content,...file})=>file),resourceRead:{tool:'read_skill',arguments:{id,path:files.find(file=>file.path.startsWith('scripts/'))!.path,offset:0}},preparation:'Arc: prepare_skill; Connect: read_skill with path/offset, save exact chunks with write_file, then verify SHA-256.'};
}
