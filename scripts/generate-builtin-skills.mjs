import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const registry=JSON.parse(fs.readFileSync(path.join(root,'skills/registry.json'),'utf8'));
if(registry.schemaVersion!==1 || !Array.isArray(registry.skills))throw Error('Unknown Skill Pack schema');
const seen=new Set();
const skills=registry.skills.map((item)=>{
 if(!/^[a-z][a-z0-9-]{2,55}$/.test(item.id)||seen.has(item.id))throw Error('Invalid/duplicate skill '+item.id);
 seen.add(item.id);
 const text=fs.readFileSync(path.join(root,'skills',item.id,'SKILL.md'),'utf8').replace(/\r\n/g,'\n');
 if(!text.startsWith('---\n')||!text.includes(`name: ${item.id}`)||!text.includes('## Device and permission gates'))throw Error('Incomplete skill '+item.id);
 if(text.length>12000)throw Error('Oversized skill '+item.id);
 if(!['P0','P1'].includes(item.priority) || !Array.isArray(item.scopes))throw Error('Bad manifest '+item.id);
 return {...item,content:text};
});
const helper=fs.readFileSync(path.join(root,'skills/media-runtime/local-media.mjs'),'utf8').replace(/\r\n/g,'\n');
const resource={path:'scripts/local-media.mjs',bytes:Buffer.byteLength(helper),sha256:createHash('sha256').update(helper).digest('hex'),content:helper};
const mediaIds=new Set(['video-creator','remotion-video','hyperframes-video','openfilm-video','map-creator','transcribe-subtitles','manim-video','blender-mcp']);
const creativeResource=name=>{const content=fs.readFileSync(path.join(root,'skills/media-runtime',name),'utf8').replace(/\r\n/g,'\n');return {path:'scripts/'+name,content,bytes:Buffer.byteLength(content),sha256:createHash('sha256').update(content).digest('hex')};};
const creative=creativeResource('local-creative.mjs'),blender=[creativeResource('blender-host.py'),creativeResource('blender-session.py')];
const resources=Object.fromEntries(skills.map(skill=>[skill.id,[{path:'SKILL.md',content:skill.content,bytes:Buffer.byteLength(skill.content),sha256:createHash('sha256').update(skill.content).digest('hex')},...(mediaIds.has(skill.id)?[resource]:[]),...(['manim-video','blender-mcp'].includes(skill.id)?[creative]:[]),...(skill.id==='blender-mcp'?blender:[])]]));
const revision=createHash('sha256').update(JSON.stringify({skills,resources})).digest('hex').slice(0,16);
const resourceGenerated='/* GENERATED. Run node scripts/generate-builtin-skills.mjs */\nexport type BuiltinSkillResource={readonly path:string;readonly bytes:number;readonly sha256:string;readonly content:string};\nexport const BUILTIN_SKILL_RESOURCES:Readonly<Record<string,readonly BuiltinSkillResource[]>>=JSON.parse('+JSON.stringify(JSON.stringify(resources))+');\n';
const resourceDest=path.join(root,'packages/skills/src/media-resources.generated.ts');
// Store the JSON payload as a single string literal. This is immutable data,
// not 30,000 executable AST statements; v8 coverage must not count catalog
// properties as uncovered application branches.
const generated=`/* GENERATED. Run node scripts/generate-builtin-skills.mjs */\nexport const BUILTIN_SKILLS_REVISION = ${JSON.stringify(revision)};\nexport type BuiltinSkill = { readonly id:string; readonly name:string; readonly priority:"P0"|"P1"; readonly category:string; readonly description:string; readonly engine:string; readonly requires:readonly string[]; readonly scopes:readonly string[]; readonly upstream:string; readonly license:string; readonly optIn:boolean; readonly content:string };\nexport const BUILTIN_SKILLS:readonly BuiltinSkill[] = JSON.parse(${JSON.stringify(JSON.stringify(skills))});\n`;
const dest=path.join(root,'packages/skills/src/catalog.generated.ts');
if(process.argv.includes('--check')){
  if(!fs.existsSync(dest)||fs.readFileSync(dest,'utf8').replace(/\r\n/g,'\n')!==generated||!fs.existsSync(resourceDest)||fs.readFileSync(resourceDest,'utf8').replace(/\r\n/g,'\n')!==resourceGenerated){console.error('Builtin Skill catalog drift. Run node scripts/generate-builtin-skills.mjs');process.exit(1)}
 console.log(`Builtin Skill Pack catalog OK: ${skills.length} skills`);
}else{fs.writeFileSync(dest,generated);fs.writeFileSync(resourceDest,resourceGenerated);console.log(`Generated ${skills.length} Skill Packs`)}
