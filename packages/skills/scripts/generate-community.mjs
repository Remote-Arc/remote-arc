import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url)),check=process.argv.includes('--check');
const definitions=JSON.parse(fs.readFileSync(path.join(root,'community-packages.json'),'utf8'));
const normalize=value=>value.replace(/\r\n/g,'\n');
const skills=[];
for(const definition of definitions){
 const directory=path.join(root,'vendor',definition.id),upstream=JSON.parse(fs.readFileSync(path.join(directory,'UPSTREAM.json'),'utf8')),resources=[];
 function walk(current,prefix=''){
  for(const entry of fs.readdirSync(current,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
   const relative=prefix+entry.name,target=path.join(current,entry.name);
   if(entry.isDirectory()){walk(target,relative+'/');continue;}
   if(relative==='UPSTREAM.json')continue;
   const original=fs.readFileSync(target,'utf8'),content=normalize(original);
   if(!check&&original!==content)fs.writeFileSync(target,content);
   if(check&&original!==content)throw Error('Snapshot must use LF: '+relative);
   resources.push({path:relative,bytes:Buffer.byteLength(content),sha256:createHash('sha256').update(content).digest('hex'),content});
  }
 }
 walk(directory);
 if(!/^[a-f0-9]{40}$/.test(upstream.revision)||!upstream.sourceUrl.includes(upstream.revision))throw Error('Invalid pinned source '+definition.id);
 const entry=resources.find(file=>file.path==='SKILL.md');if(!entry)throw Error('Missing entry '+definition.id);
 skills.push({...definition,license:upstream.license,revision:upstream.revision,version:upstream.revision,sourceUrl:upstream.sourceUrl,origin:'community',content:entry.content,resources});
}
const output='// Generated from the attributed, pinned packages/skills/vendor snapshots.\nexport const COMMUNITY_SKILLS='+JSON.stringify(skills)+';\n',target=path.join(root,'src/community.generated.ts');
if(check){if(fs.readFileSync(target,'utf8')!==output)throw Error('Run node packages/skills/scripts/generate-community.mjs');}
else fs.writeFileSync(target,output);
console.log(`${check?'Verified':'Generated'} ${skills.length} pinned skill packages with canonical LF source hashes.`);
