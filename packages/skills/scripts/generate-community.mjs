import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url)),check=process.argv.includes('--check');
const definitions=JSON.parse(fs.readFileSync(path.join(root,'community-packages.json'),'utf8'));
const normalize=value=>value.replace(/\r\n/g,'\n');
const skills=[];
const ids=new Set();
for(const definition of definitions){
 if(!/^[a-z0-9-]{1,64}$/.test(definition.id)||ids.has(definition.id))throw Error('Invalid or duplicate skill ID');
 ids.add(definition.id);
 const builtin=definition.origin==='builtin',directory=path.join(root,builtin?'builtin':'vendor',definition.id),upstream=builtin?null:JSON.parse(fs.readFileSync(path.join(directory,'UPSTREAM.json'),'utf8')),resources=[];
 function walk(current,prefix=''){
  for(const entry of fs.readdirSync(current,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
   const relative=prefix+entry.name,target=path.join(current,entry.name);
   if(entry.name==='__pycache__')continue;
   if(entry.isSymbolicLink())throw Error('Skill resources must not be symlinks: '+relative);
   if(entry.isDirectory()){walk(target,relative+'/');continue;}
   if(relative==='UPSTREAM.json')continue;
   const original=fs.readFileSync(target,'utf8'),content=normalize(original);
   if(!check&&original!==content)fs.writeFileSync(target,content);
   if(check&&original!==content)throw Error('Snapshot must use LF: '+relative);
   resources.push({path:relative,bytes:Buffer.byteLength(content),sha256:createHash('sha256').update(content).digest('hex'),content});
  }
 }
 walk(directory);
 if(upstream&&(!/^[a-f0-9]{40}$/.test(upstream.revision)||!upstream.sourceUrl.includes(upstream.revision)))throw Error('Invalid pinned source '+definition.id);
 const entry=resources.find(file=>file.path==='SKILL.md');if(!entry)throw Error('Missing entry '+definition.id);
 if(!resources.some(file=>/^licen[cs]e/i.test(file.path)))throw Error('Missing license '+definition.id);
 const digest=createHash('sha256').update(JSON.stringify(resources.map(({path,sha256})=>({path,sha256})))).digest('hex');
 skills.push({...definition,license:upstream?.license||'Remote Arc Source License',revision:upstream?.revision||digest,version:upstream?.revision||definition.version,sourceUrl:upstream?.sourceUrl||null,origin:builtin?'builtin':'community',integrityKind:builtin?'content-sha256':'git-revision',content:entry.content,resources});
}
const output='// Generated from versioned first-party skills and attributed, pinned community snapshots.\nexport const COMMUNITY_SKILLS='+JSON.stringify(skills)+';\n',target=path.join(root,'src/community.generated.ts');
if(check){if(fs.readFileSync(target,'utf8')!==output)throw Error('Run node packages/skills/scripts/generate-community.mjs');}
else fs.writeFileSync(target,output);
console.log(`${check?'Verified':'Generated'} ${skills.length} versioned skill packages with canonical LF source hashes.`);
