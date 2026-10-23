import {COMMUNITY_SKILLS} from '../../../packages/skills/src/community.generated.js';
import {z} from 'zod';
import {ArcError,type ArcEnv,type ArcRun} from './arc-chat.js';
export const communitySkill=(id:string)=>COMMUNITY_SKILLS.find(skill=>skill.id===id);
export const communitySkillSummaries=()=>COMMUNITY_SKILLS.map(({content,resources,...skill})=>({...skill,resourceCount:resources.length,createdAt:null}));
export function readCommunitySkill(id:string){const skill=communitySkill(id);if(!skill)return null;return{...skill,resources:skill.resources.map(({content,...file})=>file)};}
export function readCommunityResource(id:string,path:string,offset=0){const skill=communitySkill(id),resource=skill?.resources.find(file=>file.path===path);if(!resource||!Number.isSafeInteger(offset)||offset<0||offset>resource.content.length)throw new ArcError('ARC_SKILL_RESOURCE_NOT_FOUND',404);const content=resource.content.slice(offset,offset+12000),nextOffset=offset+content.length;return{id,path,sha256:resource.sha256,bytes:resource.bytes,content,offset,nextOffset:nextOffset<resource.content.length?nextOffset:null};}
export const prepareCommunitySkillInput=z.object({id:z.string().max(100),deviceId:z.string().min(1).max(128),workspace:z.string().min(3).max(1800),paths:z.array(z.string().min(1).max(200)).max(6).optional()}).strict();
function confirmedWrite(result:unknown,path:string,content:string,mode:string){
 if(!result||typeof result!=='object'||('isError' in result&&result.isError))return false;
 let value:any=result;
 if('content' in result){try{const blocks=result.content as {type:string;text?:string}[];value=JSON.parse(blocks.find(block=>block.type==='text')?.text||'');}catch{return false;}}
 const normalize=(target:string)=>{const cleaned=target.replace(/\\/g,'/').replace(/\/+$/,'');return /^[a-z]:\//i.test(cleaned)?cleaned.toLowerCase():cleaned;};
 return typeof value.path==='string'&&normalize(value.path)===normalize(path)&&value.mode===mode&&value.bytes===new TextEncoder().encode(content).length;
}
/** Materialize only the pinned package resources inside a task workspace; never run upstream commands. */
export async function prepareCommunitySkill(env:ArcEnv,run:ArcRun,raw:unknown,write:(deviceId:string,path:string,content:string,mode:'rewrite'|'append')=>Promise<unknown>){
 const input=prepareCommunitySkillInput.parse(raw),skill=communitySkill(input.id);if(!skill)throw new ArcError('ARC_SKILL_NOT_FOUND',404);
 const workspace=input.workspace.replace(/\\/g,'/').replace(/\/+$/,'');if(!/^(?:[A-Za-z]:\/|\/)/.test(workspace)||workspace.split('/').some(part=>part==='..'||part==='.')||/[\x00-\x1f]/.test(workspace)||/^\/?[A-Za-z]:?$|^$/.test(workspace))throw new ArcError('ARC_SKILL_WORKSPACE_REQUIRED');
 const requested=input.paths||skill.resources.filter(file=>file.path.startsWith('scripts/')).slice(0,4).map(file=>file.path),paths=[...new Set(['SKILL.md',...skill.resources.filter(file=>/^licen[cs]e/i.test(file.path)).map(file=>file.path),...requested])];
 const resources=paths.map(path=>{const file=skill.resources.find(file=>file.path===path);if(!file)throw new ArcError('ARC_SKILL_RESOURCE_NOT_FOUND',404);return file;});if(resources.reduce((n,file)=>n+file.content.length,0)>160000)throw new ArcError('ARC_SKILL_RESOURCE_LIMIT',413);
 const directory=workspace+'/.arc/skills/'+skill.id+'/'+skill.revision.slice(0,12),written:string[]=[];
 for(const file of resources){
  for(let offset=0;offset<file.content.length;){
   const active=await env.DB.prepare("SELECT r.id FROM arc_chat_runs r JOIN arc_chat_sessions s ON s.id=r.session_id WHERE r.id=?1 AND r.user_id=?2 AND r.step=?3 AND r.cancel_requested=0 AND r.status IN ('queued','thinking','working') AND r.deadline>?4 AND s.deleted_at IS NULL").bind(run.id,run.user_id,run.step,new Date().toISOString()).first();if(!active)throw new ArcError('ARC_SKILL_SOURCE_ENDED',409);
   let end=Math.min(offset+12000,file.content.length);if(end<file.content.length&&/[\uD800-\uDBFF]/.test(file.content[end-1]!))end--;
   const target=directory+'/'+file.path,chunk=file.content.slice(offset,end),mode=offset?'append':'rewrite';
   // A refused or failed device write is an observation the model can act on
   // (pick an allowed workspace or another device), not a failed run.
   let result:unknown;
   try{result=await write(input.deviceId,target,chunk,mode);}
   catch(error){const code=error instanceof Error?error.message.slice(0,200):'DEVICE_WRITE_FAILED';return{prepared:false,directory,written,remaining:paths.filter(path=>!written.includes(path)),failedPath:target,error:code,guidance:'Writing the skill files failed on this device. Choose a workspace inside the device\'s allowed folders (see list_devices workspace_roots) or another online device with write_file, then call prepare_skill again. Files are rewritten from the start, so retrying is safe. If no device can be written, explain this to the user instead of retrying.'};}
   if(!confirmedWrite(result,target,chunk,mode))return{prepared:false,directory,written,remaining:paths.filter(path=>!written.includes(path)),observation:result,guidance:'Preparation is incomplete. Inspect the observed write outcome before continuing. Do not claim the skill or its dependencies are ready.'};
   offset=end;
  }
  written.push(file.path);
 }
 return{prepared:true,id:skill.id,revision:skill.revision,directory,files:written,requires:skill.requires,sourceUrl:skill.sourceUrl,guidance:'Pinned source files are saved. Dependencies have not been claimed as installed. Check the actual runtime, prepare missing task-local dependencies within the current authorization, run the selected helper or task, and verify real deliverables. Use read_skill_resource for additional referenced files. This preparation alone is not completion.'};
}
