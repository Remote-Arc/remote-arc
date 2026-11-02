import {execFileSync} from 'node:child_process';
import {appendFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {GOOGLE_APP_DATA_POLICY} from '../apps/relay/src/apps/google-app-policy.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const providers=JSON.parse(readFileSync(new URL('../apps/ui/src/data/app-directory.json',import.meta.url),'utf8')).apps.map(app=>app.provider).filter(id=>id==='gmail'||id==='youtube'||id.startsWith('google_'));
export function retentionQuery(phase,at=new Date()){
  if(!['before','after'].includes(phase))throw Error('Expected before or after');
  if(!providers.length||providers.some(id=>!/^[a-z_]+$/.test(id)))throw Error('Invalid Google provider registry');
  const cutoff=new Date(at.getTime()-GOOGLE_APP_DATA_POLICY.retentionDays*86400000).toISOString();
  return `SELECT (SELECT COUNT(*) FROM users) AS users,(SELECT COUNT(*) FROM app_connections) AS connections,
    COUNT(*) AS google_calls,
    COALESCE(SUM(CASE WHEN a.created_at<='${cutoff}' THEN 1 ELSE 0 END),0) AS expired_calls,
    COALESCE(SUM(CASE WHEN a.created_at<='${cutoff}' AND (a.arguments_ciphertext<>'' OR a.result_ciphertext IS NOT NULL OR a.review_ciphertext IS NOT NULL) THEN 1 ELSE 0 END),0) AS expired_payloads,
    ${phase==='after'?'COALESCE(SUM(CASE WHEN a.content_purged_at IS NOT NULL THEN 1 ELSE 0 END),0)':'0'} AS purge_markers
    FROM app_calls a JOIN app_connections c ON c.id=a.connection_id AND c.user_id=a.user_id
    WHERE c.provider IN (${providers.map(id=>"'"+id+"'").join(',')});`;
}
export function parseCounts(output){
  const payload=JSON.parse(output),rows=payload?.[0]?.results;
  if(!Array.isArray(payload)||payload.length!==1||payload[0].success!==true||!Array.isArray(rows)||rows.length!==1)throw Error('D1 aggregate read failed');
  const keys=['users','connections','google_calls','expired_calls','expired_payloads','purge_markers'];
  if(keys.some(key=>!Number.isSafeInteger(rows[0][key])||rows[0][key]<0))throw Error('Invalid retention counts');
  return Object.fromEntries(keys.map(key=>[key,rows[0][key]]));
}
export async function verifyRetention(phase,{read,wait=pause,attempts=25,log=console.log}={}){
  for(let attempt=1;attempt<=attempts;attempt++){
    const counts=parseCounts(await read(retentionQuery(phase)));
    log(JSON.stringify({phase,attempt,retentionDays:GOOGLE_APP_DATA_POLICY.retentionDays,...counts}));
    if(phase==='before'||counts.expired_payloads===0)return counts;
    if(attempt===attempts)throw Error('Scheduled Google content cleanup did not converge; retained ledger counts are above');
    await wait(15000);
  }
  throw Error('No retention check attempts');
}
async function main(){
  const phase=process.argv[2];
  if(process.argv.length!==3||!['before','after'].includes(phase))throw Error('Usage: node scripts/google-app-retention-check.mjs before|after');
  if(process.env.CLOUDFLARE_ACCOUNT_ID!=='6b1d0dd4e6f7f30df92753cd1e2ee12d'||!process.env.CLOUDFLARE_API_TOKEN)throw Error('Expected the Remote Arc production account and dedicated D1 credential');
  const read=query=>{try{return execFileSync(path.join(root,'apps/relay/node_modules/.bin/wrangler'),['d1','execute','remote-link-auth','--remote','--json','--command',query],{cwd:path.join(root,'apps/relay'),encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:45000,maxBuffer:2000000});}catch{throw Error('D1 metadata query failed; no writes were requested');}};
  const counts=await verifyRetention(phase,{read});
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n## Google call retention: ${phase}\n\nMetadata only: ${JSON.stringify(counts)}\n`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
