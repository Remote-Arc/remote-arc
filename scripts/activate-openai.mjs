// Run only from the protected production promotion, after backup/migrations/deploy.
// Credentials enter through environment secrets. Never log responses or secret values.
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const account='6b1d0dd4e6f7f30df92753cd1e2ee12d',database='3cf318cb-99e4-4bc8-af20-55d634e354fd';
export const fundingActivationSql=`
UPDATE arc_funding_policy SET managed=1,enabled=0,started_at=COALESCE(started_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1;
INSERT OR IGNORE INTO arc_commercial_versions(id,product_id,kind,mode,config_json,base_revision,published_at,created_at)
 SELECT 'launch:live:trial-50-v1','arc-trial-v1','trial','live','{"id":"arc-trial-v1","days":14,"credits":50}',h.revision,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM arc_commercial_heads h WHERE h.product_id='arc-trial-v1' AND h.mode='live';
UPDATE arc_commercial_heads SET version_id='launch:live:trial-50-v1',revision=revision+1 WHERE product_id='arc-trial-v1' AND mode='live' AND version_id='seed:live:arc-trial-v1';
INSERT INTO arc_commercial_audit SELECT lower(hex(randomblob(16))),NULL,'launch_trial_published','launch:live:trial-50-v1','live','{"days":14,"credits":50}',strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE changes()=1;
INSERT INTO arc_funding_audit(id,action,details_json,created_at) VALUES(lower(hex(randomblob(16))),'activation_prepared','{"provider":"openai","auto":"gpt-6-luna","trialDays":14,"manualModels":"plus-pro"}',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
`;
export async function activateOpenAi(env,fetcher=fetch){
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REF!=='refs/heads/master'||env.GITHUB_ACTOR!=='yaohuangguan')throw Error('Protected master promotion required');
 if(!env.OPENAI_API_KEY||!env.CLOUDFLARE_API_TOKEN||!env.CLOUDFLARE_D1_API_TOKEN)throw Error('Missing production credentials');
 // Exercise the same strict JSON adapter used by Arc, with no user data or tools.
 const {openAiAdapter}=await import('../apps/relay/src/model-provider-adapters.ts');
 const accepted=await openAiAdapter(env.OPENAI_API_KEY)({definition:{id:'arc-auto',provider:'openai',model:'gpt-6-luna',maxOutputTokens:256,inputMicrosPerMillion:100000,outputMicrosPerMillion:500000},system:'Return the requested JSON only.',user:'Set ready to true.',schema:{type:'object',properties:{ready:{type:'boolean'}},required:['ready'],additionalProperties:false},maxOutputTokens:256,signal:AbortSignal.timeout(30000)});
 if(accepted.value?.ready!==true)throw Error('OpenAI structured-output acceptance failed');
 console.log('GPT-6 Luna strict JSON acceptance passed; bounded synthetic request only.');
 async function cf(suffix,token,body){
  const r=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+account+suffix,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(45000)});
  const data=await r.json();if(!r.ok||data.success!==true||data.result?.some?.(x=>x.success===false))throw Error('Production funding operation failed; no credential or API response logged');return data.result;
 }
 const query=sql=>cf('/d1/database/'+database+'/query',env.CLOUDFLARE_D1_API_TOKEN,{sql,params:[]});
 // Do not reset limits, original start time, usage, edited trial terms or pinned trials.
 await query(fundingActivationSql);
 const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/remote-link-relay/secrets';
 async function put(name,text){const r=await fetcher(base,{method:'PUT',headers:{authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},body:JSON.stringify({name,type:'secret_text',text}),redirect:'error',signal:AbortSignal.timeout(45000)});const data=await r.json();if(!r.ok||data.success!==true)throw Error('Could not provision '+name);}
 // The D1 guard is already paused before a key or activation flag is updated.
 await put('OPENAI_API_KEY',env.OPENAI_API_KEY);
 await put('ARC_PLATFORM_ENABLED','1');
 const runtime=await fetcher('https://agent.remotearc.app/api/runtime-config',{cache:'no-store',signal:AbortSignal.timeout(15000)});
 const state=await runtime.json();if(!runtime.ok||!state.arcAvailable)throw Error('Deployment readiness failed; D1 funding remains paused');
 await query(`UPDATE arc_funding_policy SET enabled=1,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1 AND managed=1;`);
 console.log('OpenAI activated. Public 14-day Auto trial; manual models require Plus/Pro. Cumulative funding and daily cap preserved. Stripe readiness controls checkout independently.');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))activateOpenAi(process.env).catch(()=>{console.error('OpenAI activation failed. Review the protected deployment and D1 funding status before retrying. No credential or provider response was logged.');process.exitCode=1;});
