import { execFileSync } from 'node:child_process';
import { readdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

export function pendingMigrations(local,remote){
  if(!Array.isArray(local)||!Array.isArray(remote)||!local.length||!remote.length) throw Error('Missing migration history');
  const source=new Set(local), seen=new Set();
  if(source.size!==local.length) throw Error('Duplicate migration filenames');
  for(const name of remote){
    if(typeof name!=='string'||seen.has(name)||!source.has(name))throw Error('Migration history drift: '+name);
    seen.add(name);
  }
  return local.filter(name=>!seen.has(name));
}
export function parseRemote(json){
  let parsed;
  try{parsed=JSON.parse(json);}catch{throw Error('Remote D1 response was not JSON')}
  if(!Array.isArray(parsed)||parsed.length!==1||parsed[0]?.success!==true||!Array.isArray(parsed[0]?.results))throw Error('Remote D1 query failed');
  return parsed[0].results.map(row=>{
    if(typeof row?.name!=='string')throw Error('Invalid remote migration name');
    return row.name;
  });
}
export function validateBackup(pending,confirmation){
  if(pending.length&&confirmation!=='BACKUP_VERIFIED')throw Error('Pending D1 migrations require a verified recoverable backup (BACKUP_VERIFIED)');
}
async function main(){
  const local=readdirSync(path.join(root,'apps/relay/migrations')).filter(x=>x.endsWith('.sql')).sort();
  const output=execFileSync(path.join(root,'apps/relay/node_modules/.bin/wrangler'),
    ['d1','execute','remote-link-auth','--remote','--json','--command','SELECT name FROM d1_migrations ORDER BY id ASC;'],
    {encoding:'utf8',cwd:path.join(root,'apps/relay'),timeout:45000,maxBuffer:2000000});
  const pending=pendingMigrations(local,parseRemote(output));
  validateBackup(pending,process.env.BACKUP_CONFIRMATION||'');
  if(process.argv.includes('--assert-clean')&&pending.length)throw Error('D1 migration(s) remain pending after apply: '+pending.join(', '));
  console.log(pending.length?'Pending D1 migration: '+pending.join(', '):'No D1 migrations pending. Backup confirmation not required.');
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'needs_migration='+Boolean(pending.length)+'\n');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  main().catch(err=>{console.error('D1 preflight failed closed:',err.message);process.exitCode=1});
}
