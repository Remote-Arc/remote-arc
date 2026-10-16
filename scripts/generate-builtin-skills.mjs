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
 const text=fs.readFileSync(path.join(root,'skills',item.id,'SKILL.md'),'utf8');
 if(!text.startsWith('---\n')||!text.includes(`name: ${item.id}`)||!text.includes('## Device and permission gates'))throw Error('Incomplete skill '+item.id);
 if(text.length>12000)throw Error('Oversized skill '+item.id);
 if(!['P0','P1'].includes(item.priority) || !Array.isArray(item.scopes))throw Error('Bad manifest '+item.id);
 return {...item,content:text};
});
const revision=createHash('sha256').update(JSON.stringify(skills)).digest('hex').slice(0,16);
const generated=`/* GENERATED. Run node scripts/generate-builtin-skills.mjs */\nexport const BUILTIN_SKILLS_REVISION = ${JSON.stringify(revision)};\nexport const BUILTIN_SKILLS = ${JSON.stringify(skills,null,2)} as const;\n`;
const dest=path.join(root,'packages/skills/src/catalog.generated.ts');
if(process.argv.includes('--check')){
 if(!fs.existsSync(dest)||fs.readFileSync(dest,'utf8')!==generated){console.error('Builtin Skill catalog drift. Run node scripts/generate-builtin-skills.mjs');process.exit(1)}
 console.log(`Builtin Skill Pack catalog OK: ${skills.length} skills`);
}else{fs.writeFileSync(dest,generated);console.log(`Generated ${skills.length} Skill Packs`)}
