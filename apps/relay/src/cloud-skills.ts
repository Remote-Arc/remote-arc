import { BUILTIN_SKILLS, BUILTIN_SKILLS_REVISION } from '../../../packages/skills/src/catalog.generated.js';

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
      note:'Skill definitions are cloud-hosted. Execution engines require independently authorized devices or providers.',
      items:BUILTIN_SKILLS.map(({id,name,priority,category,description,engine,requires,scopes})=>({id,name,priority,category,description,engine,requires,scopes,available:true,engineInstalled:null})),
    },{headers});
  }
  const match=url.pathname.match(/^\/api\/skills\/([a-z][a-z0-9-]{2,55})$/);
  if(!match)return Response.json({error:'not_found'},{status:404,headers});
  const skill=BUILTIN_SKILLS.find(x=>x.id===match[1]);
  if(!skill)return Response.json({error:'skill_not_found'},{status:404,headers});
  return Response.json({schemaVersion:1,revision:BUILTIN_SKILLS_REVISION,availability:'instructions-only',skill},{headers});
}
