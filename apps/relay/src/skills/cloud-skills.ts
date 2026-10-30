import { BUILTIN_SKILLS, BUILTIN_SKILLS_REVISION } from '../../../../packages/skills/src/catalog.generated.js';

// Shared by the HTTP catalog and Arc. Keep canonical cloud IDs and revision.
export const cloudSkillCatalog=()=>BUILTIN_SKILLS;
export const cloudSkillById=(id:string)=>BUILTIN_SKILLS.find(skill=>skill.id===id);

type Principal = { id: string } | null;

/** Cloud-owned, read-only and device-independent Skill catalog.
 *  Session and OAuth identities are both checked by the main relay router.
 */
export function handleCloudSkills(request:Request, principal:Principal):Response {
  const url=new URL(request.url);
  const headers={
    'cache-control':'private, no-store',
    'x-content-type-options':'nosniff',
    'x-robots-tag':'noindex',
    vary:'authorization, cookie',
  };
  if(url.hostname!=='mcp.remotearc.app')return Response.json({error:'not_found'},{status:404,headers});
  if(request.method!=='GET')return Response.json({error:'method_not_allowed'},{status:405,headers:{...headers,allow:'GET'}});
  if(!principal)return Response.json({error:'unauthorized'},{status:401,headers});
  if(url.pathname==='/api/skills'){
    return Response.json({
      schemaVersion:1,
      revision:BUILTIN_SKILLS_REVISION,
      availability:'instructions-only',
      note:'Skill definitions are cloud-hosted. Media helpers prepare ordinary dependencies on authorized user devices; Qwen TTS and ACE-Step installation requires user consent. Engine presence and output are verified locally.',
      items:cloudSkillCatalog().map(({id,name,priority,category,description,engine,requires,scopes})=>({id,name,priority,category,description,engine,requires,scopes,available:true,engineInstalled:null})),
    },{headers});
  }
  const match=url.pathname.match(/^\/api\/skills\/([a-z][a-z0-9-]{2,55})$/);
  if(!match)return Response.json({error:'not_found'},{status:404,headers});
  const skill=cloudSkillById(match[1]!);
  if(!skill)return Response.json({error:'skill_not_found'},{status:404,headers});
  return Response.json({schemaVersion:1,revision:BUILTIN_SKILLS_REVISION,availability:'instructions-only',skill},{headers});
}

import { routeSkillIntent, runReadOnlySkill } from './skill-runtime.js';

type CloudSkillPrincipal={id:string;oauth:boolean;scopes:string};
type ReadAdapter=(deviceId:string,tabId:number|undefined,tool:'browser_read_page'|'browser_extract_links',args:Record<string,unknown>)=>Promise<unknown>;
type SkillActionDeps={
  consume:()=>Promise<void>;
  read:ReadAdapter;
  paused:()=>Promise<boolean>;
  selectDevices:()=>Promise<Array<{id:string;status:string;tools:string[]}>>;
};
const actionHeaders={'cache-control':'private, no-store','x-robots-tag':'noindex','x-content-type-options':'nosniff'};

export async function handleCloudSkillAction(
  request:Request, principal:CloudSkillPrincipal|null, deps:SkillActionDeps,
):Promise<Response>{
  const url=new URL(request.url);
  const respond=(value:unknown,status=200)=>Response.json(value,{status,headers:actionHeaders});
  if(url.hostname!=='mcp.remotearc.app')return respond({error:'not_found'},404);
  if(!['/api/skills/plan','/api/skills/run'].includes(url.pathname))return respond({error:'not_found'},404);
  if(request.method!=='POST')return respond({error:'method_not_allowed'},405);
  if(!principal)return respond({error:'unauthorized'},401);
  if(!principal.oauth){
    // Cookie-authenticated writes must come from the same website (CSRF).
    if(request.headers.get('origin')!=='https://mcp.remotearc.app')
      return respond({error:'origin_not_allowed'},403);
  }
  if(!request.headers.get('content-type')?.startsWith('application/json'))
    return respond({error:'json_required'},415);
  if(Number(request.headers.get('content-length')||'0')>6000)
    return respond({error:'request_too_large'},413);
  let body:{objective?:unknown;skill_id?:unknown;device_id?:unknown;tab_id?:unknown};
  try{body=await request.json() as typeof body;}catch{return respond({error:'invalid_json'},400)}
  if(!body||typeof body.objective!=='string'||(body.skill_id!==undefined&&typeof body.skill_id!=='string'))
    return respond({error:'invalid_objective'},400);
  let plan;
  try{plan=routeSkillIntent(body.objective,body.skill_id as string|undefined);}
  catch(error){return respond({error:error instanceof Error?error.message:'invalid_skill_request'},400)}
  if(url.pathname==='/api/skills/plan'){
    // Curated, cloud-versioned instructions are injected alongside the plan.
    // The Agent does not need to install or re-fetch local SKILL.md files.
    const instructions=plan.steps.map(step=>{
      const skill=BUILTIN_SKILLS.find(x=>x.id===step.skill_id)!;
      return {skill_id:skill.id,revision:plan.revision,markdown:skill.content};
    });
    return respond({plan,instructions,modelCost:0,executed:false,skillsSource:'cloud'});
  }
  if(await deps.paused())return respond({plan,status:'blocked',verified:false,reason:'Remote MCP access is paused'},423);
  if(!plan.runnable)return respond({plan,status:'blocked',verified:false,reason:plan.reason},409);
  if(principal.oauth&&!principal.scopes.split(/\s+/).includes('browser:read'))
    return respond({plan,status:'scope_required',verified:false,reason:'browser:read OAuth scope required'},403);
  if(body.device_id!==undefined&&(typeof body.device_id!=='string'||!body.device_id.trim()||body.device_id.length>128)||
      (body.tab_id!==undefined&&(typeof body.tab_id!=="number"||!Number.isSafeInteger(body.tab_id)||body.tab_id<0)))
    return respond({plan,status:'needs_device',verified:false,reason:'Select an authorized device and valid shared tab'},400);
  let deviceId=body.device_id as string|undefined;
  if(!deviceId){
    try{
      const eligible=(await deps.selectDevices()).filter(x=>x.status==='online'&&x.tools.includes('browser_read_page'));
      if(eligible.length!==1)return respond({plan,status:'needs_device',verified:false,
        reason:eligible.length?'Multiple eligible devices; choose one explicitly':'No online authorized device with browser read access',
        eligible_device_ids:eligible.map(x=>x.id)},422);
      deviceId=eligible[0]!.id;
    }catch{return respond({plan,status:'needs_device',verified:false,reason:'Could not verify eligible devices'},503)}
  }
  try{await deps.consume();}
  catch{return respond({plan,status:'quota_exceeded',verified:false,reason:'Tool-call budget or account limit reached'},429)}
  const result=await runReadOnlySkill(plan,{device_id:deviceId,tab_id:body.tab_id as number|undefined},
    (tool,args)=>deps.read(deviceId,body.tab_id as number|undefined,tool,args));
  return respond({plan,...result,modelCost:0},result.status==='observed'?200:result.status==='failed'?502:422);
}
