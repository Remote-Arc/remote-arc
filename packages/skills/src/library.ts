import {BUILTIN_SKILLS,BUILTIN_SKILLS_REVISION} from './catalog.generated.js';
import {BUILTIN_SKILL_RESOURCES,type BuiltinSkillResource} from './media-resources.generated.js';
import {COMMUNITY_SKILLS} from './community.generated.js';

export type LibrarySkill={id:string;name:string;description:string;origin:'builtin'|'community';owner:string;category:string;keywords?:readonly string[];requires:readonly string[];license:string;revision:string;version:string;sourceUrl:string|null;content:string;resources:readonly BuiltinSkillResource[];core?:boolean};
/** The dashboard, preview and mentions share the same discoverable built-ins and pinned packages. */
const entries:LibrarySkill[]=[
 ...BUILTIN_SKILLS.map(skill=>({id:skill.id,name:skill.name,description:skill.description,origin:'builtin' as const,owner:'Remote Arc',category:skill.category,requires:skill.requires,license:skill.license,revision:BUILTIN_SKILLS_REVISION,version:'1.0.0',sourceUrl:skill.upstream,content:skill.content,resources:BUILTIN_SKILL_RESOURCES[skill.id]||[],core:skill.id==='remotion-video'})),
 ...COMMUNITY_SKILLS.map<LibrarySkill>(skill=>({...skill,origin:skill.origin==='builtin'?'builtin':'community',category:skill.category||'productivity',version:String(skill.version),resources:skill.resources})),
];
export const SKILL_LIBRARY:readonly LibrarySkill[]=entries.sort((a,b)=>Number(Boolean(b.core))-Number(Boolean(a.core)));
export const skillLibrarySummaries=()=>SKILL_LIBRARY.map(({content,resources,...skill})=>({...skill,resourceCount:resources.length,createdAt:null}));
